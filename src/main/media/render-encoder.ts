import { execFile } from 'node:child_process';
import util from 'node:util';

import type { RenderAcceleration, RenderEncoderInfo, RenderQuality } from '@shared';

import { Logger } from '../logging/logger';

import { encoderQualityArgs, VIDEO_ENCODER_LADDER, type VideoEncoder } from './watermark-args';
import type { FfmpegCapabilities } from './watermark-capabilities';

/**
 * Beta S248 — which encoder the Timeline render uses, and the flags that say so.
 *
 * ## Why this is a separate module from `watermark-args.ts`
 *
 * The ladder itself is not duplicated: `pickVideoEncoder` and
 * `encoderQualityArgs` still live next to the watermark remover that first
 * needed them (Beta S235), and this module calls them. What differs is the
 * *target*. The watermark remover repairs a corner of an otherwise finished
 * file and wants a near-lossless re-encode; the timeline render encodes a
 * whole sequence two-to-four times over and wants S157's three quality tiers.
 * One module resolving both would need a mode flag on every function.
 *
 * ## Why an encoder is validated before it is used
 *
 * `ffmpeg -encoders` lists what the **binary** was compiled with, not what
 * the **machine** can open. NVENC on a consumer card caps concurrent encode
 * sessions; a headless VM lists `h264_qsv` with no Intel GPU behind it; a
 * driver mismatch fails at session-open with a message nobody reads until the
 * export has already burned twenty minutes. So `ensureEncoderUsable` opens a
 * throwaway session first — one 64x64 frame to `-f null` — and quietly
 * returns the software encoder if that fails.
 *
 * That probe is also what makes the fallback *safe*, which is the real reason
 * it happens up front rather than as a retry. The all-cuts join path
 * stream-copies its segments (`buildConcatArgs`, `-c copy`), and a segment
 * list where clip 1-12 came from NVENC and 13-40 from x264 carries mismatched
 * SPS/PPS — a file the concat demuxer will happily produce and no player will
 * decode cleanly. Deciding once, before stage 1 writes anything, means every
 * segment in a render comes from the same encoder by construction.
 */

const execFileAsync = util.promisify(execFile);
const logger = Logger.createChildLogger('render-encoder');

/** Short names for a control and a toast. Anything unlisted falls back to its ffmpeg id. */
const ENCODER_LABELS: Record<string, string> = {
  h264_nvenc: 'NVENC',
  h264_qsv: 'Quick Sync',
  h264_amf: 'AMF',
  h264_videotoolbox: 'VideoToolbox',
  libx264: 'x264',
};

/** The universal floor, and what `'off'` always resolves to. */
export const SOFTWARE_ENCODER: RenderEncoderInfo = {
  encoderId: 'libx264',
  label: 'x264',
  hardware: false,
  hwaccelId: null,
};

/**
 * S157's three quality tiers as x264 CRF values — the numbers every builder
 * carried as literals before `x264Args` collected them, and the scale every
 * other encoder family is mapped *from*.
 */
function crfFor(options: { draft?: boolean; quality?: RenderQuality }): number {
  if (options.draft) return 28;
  return options.quality === 'high' ? 16 : 18;
}

/**
 * The video encode flags for one pass.
 *
 * With no `encoder` — or with the software one — this returns S157's
 * `x264Args` output **byte for byte**, which is what lets every pre-S248
 * neutrality test keep passing unchanged. Hardware rungs route the same CRF
 * tier through `encoderQualityArgs`, so each family's own scale (NVENC's CQ,
 * QSV's `global_quality`, AMF's QP pair, VideoToolbox's inverted 0-100) stays
 * in the single place that already knows it.
 */
export function videoEncodeArgs(options: {
  draft?: boolean;
  quality?: RenderQuality;
  encoder?: RenderEncoderInfo;
}): string[] {
  const high = !options.draft && options.quality === 'high';
  const crf = crfFor(options);
  const encoderId = options.encoder?.encoderId ?? SOFTWARE_ENCODER.encoderId;
  if (encoderId === 'libx264') {
    return [
      '-c:v',
      'libx264',
      '-preset',
      options.draft ? 'ultrafast' : high ? 'slow' : 'veryfast',
      '-crf',
      String(crf),
      '-pix_fmt',
      'yuv420p',
    ];
  }
  return [
    '-c:v',
    encoderId,
    ...encoderQualityArgs(encoderId as VideoEncoder, { crf }),
    '-pix_fmt',
    'yuv420p',
  ];
}

/**
 * The decode acceleration flags, which belong **before** `-i`.
 *
 * ## Currently always empty, and that is a measurement, not an oversight
 *
 * S248 shipped `-hwaccel auto` on every decode pass. Measured on a GTX 1660
 * Ti against a 13s 1080p24 clip, best of four runs, it **costs** time on
 * every configuration:
 *
 * | encode            | no hwaccel | `-hwaccel auto` |
 * | ----------------- | ---------- | --------------- |
 * | `h264_nvenc`      | 1.92s      | 3.01s  (+57%)   |
 * | `libx264` veryfast| 2.13s      | 3.72s  (+75%)   |
 * | `libx264` slow    | 10.61s     | 11.67s (+10%)   |
 *
 * The cause is the paragraph S248 wrote and assumed was free: there is no
 * `-hwaccel_output_format`, so every frame is decoded on the GPU and copied
 * **back** to system memory for the filter graph. That readback costs more
 * than software H.264 decode saves. (`-hwaccel cuda` is less bad at 2.51s;
 * `-hwaccel d3d11va` fails outright on this machine.) A timeline render makes
 * several full-length passes, so the penalty compounds.
 *
 * `hwaccelId` is therefore left `null` by both pick functions and this
 * returns `[]`. The plumbing stays wired at all four call sites so that
 * re-enabling is a one-line change — which is worth doing only together with
 * `-hwaccel_output_format` and a filter graph that keeps frames on the GPU,
 * since that is the version where the transfer is not paid per frame.
 */
export function hwaccelArgs(encoder: RenderEncoderInfo | undefined): string[] {
  return encoder?.hwaccelId ? ['-hwaccel', encoder.hwaccelId] : [];
}

/**
 * What the probe found, as a render can use it.
 *
 * Encode and decode are resolved independently because they genuinely are:
 * a machine with `-hwaccels` but no hardware H.264 encoder still decodes
 * faster, and that is worth taking.
 */
export function pickRenderEncoder(
  capabilities: FfmpegCapabilities,
  acceleration: RenderAcceleration,
): RenderEncoderInfo {
  if (acceleration === 'off') return SOFTWARE_ENCODER;
  const encoderId = capabilities.preferredEncoder;
  const hardware = encoderId !== 'libx264';
  return {
    encoderId,
    label: ENCODER_LABELS[encoderId] ?? encoderId,
    hardware,
    // Null on purpose, whatever `-hwaccels` reports — see `hwaccelArgs`.
    hwaccelId: null,
  };
}

/**
 * The throwaway session `ensureEncoderUsable` opens. Pure, so a test can read it.
 *
 * ## Why 320x240 and not something smaller
 *
 * The probe used to ask for 64x64 — the cheapest frame there is — and that
 * quietly made it a test of the *frame size* rather than of the encoder.
 * NVENC refuses a session below its minimum dimensions outright
 * (`InitializeEncoder failed: invalid param (8): Frame Dimension less than the
 * minimum supported value`), so on a perfectly healthy NVIDIA machine the
 * probe failed, the fallback fired exactly as designed, and the export panel
 * reported "no hardware encoder found" for the life of the install. Measured
 * on a GTX 1660 Ti (driver 591.86): 128x128 and 145x49 refused, 160x64 and up
 * accepted.
 *
 * 320x240 clears every family's floor with room to spare and still encodes a
 * single frame in a few milliseconds, so nothing is bought by shaving it. The
 * probe exists to answer "will this GPU open a session"; a dimension only the
 * real render's resolution would satisfy answers a different question.
 */
export function encoderProbeArgs(encoder: RenderEncoderInfo): string[] {
  return [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=320x240:d=0.1',
    '-frames:v',
    '1',
    ...videoEncodeArgs({ encoder }),
    '-f',
    'null',
    '-',
  ];
}

/**
 * Cached per encoder id: a session that opens once opens again, and one that
 * does not will not start working while the app runs. Not cached across
 * restarts, for `watermark-capabilities.ts`'s reason — an app update can
 * replace the binary, and another app can release a GPU.
 */
const usable = new Map<string, Promise<boolean>>();

/** Whether this encoder opens a session on this machine, asked at most once per id. */
async function encoderOpens(ffmpegPath: string, encoder: RenderEncoderInfo): Promise<boolean> {
  let probe = usable.get(encoder.encoderId);
  if (!probe) {
    probe = (async () => {
      try {
        await execFileAsync(ffmpegPath, encoderProbeArgs(encoder), { maxBuffer: 4 * 1024 * 1024 });
        return true;
      } catch (error) {
        logger.warn('hardware encoder listed but would not open', {
          encoder: encoder.encoderId,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    })();
    usable.set(encoder.encoderId, probe);
  }
  return probe;
}

/**
 * The encoder a render should actually use: `picked`, or the software one if
 * `picked` cannot open a session.
 *
 * Never throws. A hardware encoder that will not start is a slower export,
 * not a failed one — the same posture `pickVideoEncoder` documents for an
 * encoder that is missing outright.
 *
 * Prefer `resolveRenderEncoder` wherever the capabilities are in hand: this
 * function only ever knows about the one encoder it was handed, so the only
 * fallback it can offer is the floor.
 */
export async function ensureEncoderUsable(
  ffmpegPath: string,
  picked: RenderEncoderInfo,
): Promise<RenderEncoderInfo> {
  if (!picked.hardware) return picked;
  if (await encoderOpens(ffmpegPath, picked)) return picked;
  // The decode side is independent of the encode side and survives the
  // fallback: a GPU that will not open an encode session still decodes.
  return { ...SOFTWARE_ENCODER, hwaccelId: picked.hwaccelId };
}

/**
 * Every rung this machine could plausibly use, best first, software last.
 *
 * `pickRenderEncoder` answers "which is best"; this answers "and what comes
 * next if that one will not open". They are different questions, because
 * `ffmpeg -encoders` is a **compile-time** listing. The bundled Windows build
 * is configured `--enable-nvenc --enable-amf --enable-libvpl`, so it
 * advertises `h264_nvenc` on a machine with an AMD card and `h264_amf` on one
 * with an NVIDIA card — on the development machine all three list and only
 * NVENC opens (`Error creating a MFX session: -9` for QSV, `DLL amfrt64.dll
 * failed to open` for AMF). Probing only the top rung and then dropping
 * straight to software hands every AMD and Intel user a software export while
 * a working hardware encoder sits one rung further down.
 */
export function renderEncoderCandidates(
  capabilities: FfmpegCapabilities,
  acceleration: RenderAcceleration,
): RenderEncoderInfo[] {
  if (acceleration === 'off') return [SOFTWARE_ENCODER];
  // Decode acceleration is independent of the encode rung and would ride
  // along on every candidate — but it is measured to lose, so no candidate
  // carries it. See `hwaccelArgs` for the numbers.
  const hwaccelId = null;
  const hardware = VIDEO_ENCODER_LADDER.filter(
    (encoderId) => encoderId !== 'libx264' && capabilities.encoders.has(encoderId),
  ).map((encoderId) => ({
    encoderId,
    label: ENCODER_LABELS[encoderId] ?? encoderId,
    hardware: true,
    hwaccelId,
  }));
  return [...hardware, { ...SOFTWARE_ENCODER, hwaccelId }];
}

/**
 * The encoder a render will actually use, probed down the ladder.
 *
 * This is `pickRenderEncoder` + `ensureEncoderUsable` done across the whole
 * ladder rather than its top rung, and it is what both the export panel and
 * the render itself call — so the panel still cannot name an encoder the
 * render then declines to open.
 *
 * Sequential on purpose: each probe is cached per encoder id, the common case
 * is a single subprocess that succeeds, and racing three GPU session-opens to
 * throw two away is a good way to trip NVENC's concurrent-session cap on a
 * consumer card.
 */
export async function resolveRenderEncoder(
  ffmpegPath: string,
  capabilities: FfmpegCapabilities,
  acceleration: RenderAcceleration,
): Promise<RenderEncoderInfo> {
  for (const candidate of renderEncoderCandidates(capabilities, acceleration)) {
    if (candidate.hardware && !(await encoderOpens(ffmpegPath, candidate))) continue;
    return candidate;
  }
  return SOFTWARE_ENCODER;
}

/** Tests only — the probe cache is process-wide and would otherwise leak between suites. */
export function resetEncoderProbeCacheForTests(): void {
  usable.clear();
}
