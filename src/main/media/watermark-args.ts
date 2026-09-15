import type { PixelRect } from '../../shared/types/watermark';

/**
 * Beta S235 — every ffmpeg invocation the watermark remover makes.
 *
 * Pure `build*Args()` functions only, per `video-editor.ts:9`: the arithmetic is
 * the part that goes wrong, so it is the part that must be testable without a
 * binary on the machine. Nothing here spawns anything.
 *
 * ## Why only the ROI travels through JavaScript
 *
 * A watermark occupies a few hundred pixels in a corner of a 1920x1080 frame.
 * Decoding whole frames into JS to touch 0.4% of them would move ~150 MB/s
 * across a pipe and put the codec on the wrong side of the boundary. Instead
 * ffmpeg crops the ROI and streams *just that* (a 200x200 RGBA region at 24 fps
 * is ~3.8 MB/s), the worker transforms it, and a second ffmpeg overlays the
 * result back over the untouched original. Whole-frame decode and encode stay
 * inside ffmpeg, where the hardware codecs are.
 *
 * ## What "region-only" can and cannot promise
 *
 * With an inter-frame codec, pixels outside the box cannot be kept
 * bit-identical — every frame is re-encoded as a whole. What is guaranteed:
 * only the box's pixels are *modified*; audio, subtitle and data streams are
 * stream-copied verbatim; container metadata is preserved (`-map_metadata 0`,
 * which is also what keeps C2PA/XMP provenance intact — see the step file §5);
 * and the re-encode is visually lossless, with a true-lossless mode available.
 */

/** Bounds every quality knob, so a hand-mangled options object cannot reach a filter string. */
const CRF_MIN = 0;
const CRF_MAX = 51;

/** Visually lossless for x264. Low enough that a corner repair is not re-quantized away. */
const DEFAULT_CRF = 14;

export interface EncodeQuality {
  /** True-lossless instead of visually lossless. Archival; much larger files. */
  lossless?: boolean;
  /** Overrides the x264-family quality target. Ignored by hardware encoders with their own scale. */
  crf?: number;
}

/**
 * The codec ladder, best first.
 *
 * Verified present in the bundled Windows build (Phase 0 §2.1), which is
 * configured `--enable-nvenc --enable-amf --enable-libvpl`. macOS is expected
 * to carry `h264_videotoolbox` instead. `libx264` is the universal floor and
 * is always last, so an empty probe result still produces a working command.
 */
export const VIDEO_ENCODER_LADDER = [
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'libx264',
] as const;
export type VideoEncoder = (typeof VIDEO_ENCODER_LADDER)[number];

/** Parses `ffmpeg -encoders` output into the set of encoder names it actually has. */
export function parseEncoders(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    // ` V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)`
    const m = /^\s*[VAS][.A-Z]{5}\s+([A-Za-z0-9_]+)\s/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

/** Parses `ffmpeg -filters` output into the set of filter names it actually has. */
export function parseFilters(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    // ` T.. delogo            V->V       Remove logo from input video.`
    const m = /^\s*[.TSC]{3}\s+([A-Za-z0-9_]+)\s+[AVN|]+->[AVN|]+/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

/**
 * Parses `ffmpeg -hwaccels` into the set of decode accelerations it offers.
 *
 * The listing is a header line followed by one bare name per line, which is
 * why this parser is three lines where the encoder and filter ones are
 * regexes over a flag column:
 *
 * ```
 * Hardware acceleration methods:
 * cuda
 * d3d11va
 * ```
 */
export function parseHwaccels(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.trim();
    if (/^[a-z0-9_]+$/.test(name)) names.add(name);
  }
  return names;
}

/**
 * Picks the best available encoder.
 *
 * Falls through to `libx264` rather than failing, because a missing hardware
 * encoder is a slower render, not a broken one — and on a machine with no GPU
 * at all the ladder is *expected* to reach the bottom.
 */
export function pickVideoEncoder(available: ReadonlySet<string>): VideoEncoder {
  return VIDEO_ENCODER_LADDER.find((e) => available.has(e)) ?? 'libx264';
}

/**
 * The quality flags for one encoder.
 *
 * Each family has its own scale — x264's CRF, NVENC's CQ, QSV's global_quality,
 * AMF's QP pair, VideoToolbox's inverted 0-100 quality — so this cannot be one
 * shared number, and pretending otherwise is how a "visually lossless" setting
 * silently becomes a 4 Mbps re-encode on somebody else's machine.
 */
export function encoderQualityArgs(encoder: VideoEncoder, quality: EncodeQuality = {}): string[] {
  const crf = clampInt(quality.crf ?? DEFAULT_CRF, CRF_MIN, CRF_MAX);
  if (quality.lossless) {
    switch (encoder) {
      case 'libx264':
        return ['-preset', 'veryslow', '-qp', '0'];
      case 'h264_nvenc':
        return ['-preset', 'p7', '-tune', 'lossless'];
      // QSV, AMF and VideoToolbox have no dependable lossless mode; x264 is
      // substituted by the caller rather than silently producing a lossy file
      // under a "lossless" label.
      default:
        return ['-preset', 'veryslow', '-qp', '0'];
    }
  }
  switch (encoder) {
    case 'h264_nvenc':
      return ['-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + 5)];
    case 'h264_qsv':
      return ['-preset', 'veryslow', '-global_quality', String(crf + 5)];
    case 'h264_amf':
      return ['-quality', 'quality', '-rc', 'cqp', '-qp_i', String(crf + 5), '-qp_p', String(crf + 5)];
    case 'h264_videotoolbox':
      // VideoToolbox's scale runs the other way: higher is better, 0-100.
      return ['-q:v', String(clampInt(100 - crf * 2, 1, 100))];
    case 'libx264':
    default:
      return ['-preset', 'slow', '-crf', String(crf)];
  }
}

/** Lossless is only honoured where the encoder can really do it; otherwise fall back to x264. */
export function resolveEncoder(preferred: VideoEncoder, quality: EncodeQuality): VideoEncoder {
  if (quality.lossless && preferred !== 'libx264' && preferred !== 'h264_nvenc') return 'libx264';
  return preferred;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** A rect as ffmpeg filter parameters, every component an integer. */
function rectArgs(rect: PixelRect): { w: number; h: number; x: number; y: number } {
  return {
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height)),
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
  };
}

/**
 * The staging suffix the batch writes under before it renames into place. An
 * interrupted write must never leave a file with a media extension behind,
 * which is the whole point of the convention; the cost is paid here.
 */
export const STAGING_SUFFIX = '.part';

/** What ffmpeg should mux to, for one final extension. Unknown extensions get no opinion. */
const CONTAINERS: Record<string, { format: string; codec?: string }> = {
  mp4: { format: 'mp4' },
  m4v: { format: 'mp4' },
  mov: { format: 'mov' },
  webm: { format: 'webm' },
  mkv: { format: 'matroska' },
  png: { format: 'image2', codec: 'png' },
  jpg: { format: 'image2', codec: 'mjpeg' },
  jpeg: { format: 'image2', codec: 'mjpeg' },
  webp: { format: 'webp', codec: 'libwebp' },
};

/** The extension ffmpeg would have guessed from, with any staging suffix removed. */
function finalExtension(outputPath: string): string {
  const stripped = outputPath.toLowerCase().endsWith(STAGING_SUFFIX)
    ? outputPath.slice(0, -STAGING_SUFFIX.length)
    : outputPath;
  const dot = stripped.lastIndexOf('.');
  return dot === -1 ? '' : stripped.slice(dot + 1).toLowerCase();
}

/**
 * Names the muxer (and, for a still, the codec) explicitly.
 *
 * **The bug this exists for.** Every output is written to `<final>.part` and
 * renamed into place on success. ffmpeg picks its muxer from the extension,
 * and `.part` is not one — so on the first real batch every item, still and
 * video alike, failed with *"Unable to choose an output format … use a
 * standard extension for the filename or specify the format manually"*. The
 * integration suite had not caught it because it wrote straight to `.mp4`.
 * This does what the message says: the format is derived from the extension
 * *underneath* the suffix and stated on the command line, so the name the
 * file is written under no longer matters.
 *
 * `image2` additionally guesses the *codec* from the extension, so a still
 * names that too; `-update 1` is its documented single-file mode, without
 * which it warns about a missing sequence pattern. Verified against the
 * bundled binary with `.mp4.part` and `.png.part` targets.
 */
export function outputFormatArgs(outputPath: string): string[] {
  const container = CONTAINERS[finalExtension(outputPath)];
  if (!container) return [];
  return [
    ...(container.codec ? ['-c:v', container.codec] : []),
    '-f', container.format,
    ...(container.format === 'image2' ? ['-update', '1'] : []),
  ];
}

/** Decodes one frame of anything to raw RGBA on stdout. Images and video alike. */
export function buildDecodeFrameArgs(inputPath: string, atSeconds?: number): string[] {
  const seek = Number.isFinite(atSeconds) && (atSeconds!) > 0
    ? ['-ss', (atSeconds!).toFixed(3)]
    : [];
  return [
    '-hide_banner', '-loglevel', 'error',
    ...seek,
    '-i', inputPath,
    '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    'pipe:1',
  ];
}

/**
 * Encodes one raw RGBA frame from stdin to a still file.
 *
 * PNG out by default, deliberately — the same reasoning `sheet-crop.ts` gives
 * for its crops: the source is already one generation of lossy encoding, and a
 * second JPEG pass over a region we just repaired is exactly where the
 * artefacts would show.
 */
export function buildEncodeFrameArgs(
  outputPath: string,
  width: number,
  height: number,
  jpegQuality?: number,
): string[] {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const isJpeg = /^jpe?g$/.test(finalExtension(outputPath));
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`,
    '-i', 'pipe:0',
    '-frames:v', '1',
    ...(isJpeg ? ['-q:v', String(clampInt(jpegQuality ?? 2, 1, 31))] : []),
    ...outputFormatArgs(outputPath),
    outputPath,
  ];
}

/**
 * The `delogo` fast path — a whole still or video cleaned in one invocation,
 * with no JS in the loop.
 *
 * `delogo` interpolates inward from the box border, so it needs the box to be
 * strictly inside the frame; a mark flush against an edge is nudged in by a
 * pixel rather than being rejected, since a one-pixel-narrower repair is better
 * than no repair.
 *
 * Unlike `buildRoiExtractArgs` this does not force RGBA first. `delogo` works
 * in place on the decoded planes and never changes frame dimensions, so a
 * subsampled odd coordinate costs at most a pixel of chroma precision inside a
 * region that is being interpolated anyway — where the extract path's rounding
 * silently changed the *frame size* and broke the frame count outright.
 */
export function buildDelogoArgs(
  inputPath: string,
  outputPath: string,
  rect: PixelRect,
  frameWidth: number,
  frameHeight: number,
  opts: { encoder?: VideoEncoder; quality?: EncodeQuality; isVideo?: boolean } = {},
): string[] {
  const r = rectArgs(rect);
  const x = Math.max(1, Math.min(Math.max(1, Math.round(frameWidth) - 2), r.x));
  const y = Math.max(1, Math.min(Math.max(1, Math.round(frameHeight) - 2), r.y));
  const w = Math.max(1, Math.min(Math.round(frameWidth) - x - 1, r.w));
  const h = Math.max(1, Math.min(Math.round(frameHeight) - y - 1, r.h));

  if (!opts.isVideo) {
    return [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}`,
      '-frames:v', '1',
      ...outputFormatArgs(outputPath),
      outputPath,
    ];
  }
  const encoder = resolveEncoder(opts.encoder ?? 'libx264', opts.quality ?? {});
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-progress', 'pipe:1', '-nostats',
    '-i', inputPath,
    '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}`,
    '-map', '0',
    '-c', 'copy',
    '-c:v', encoder,
    ...encoderQualityArgs(encoder, opts.quality ?? {}),
    '-map_metadata', '0',
    ...outputFormatArgs(outputPath),
    outputPath,
  ];
}

/**
 * Streams *only* the watermark region of every frame, as raw RGBA on stdout.
 *
 * **`format=rgba` must come before `crop`.** Flow output is `yuv420p`, whose
 * chroma planes are subsampled 2x2, so `crop` on the decoded frame silently
 * rounds odd widths and origins down to even. Measured: a `crop=23:10` on a
 * 24 fps 8-second clip emitted 168,960 bytes — 880 bytes per frame, i.e. a
 * 22x10 region — and 168960/920 is 183.65, a non-integer frame count that would
 * have desynchronised the overlay and shifted the repair by a pixel. Converting
 * to RGBA first removes the subsampling constraint: the same crop then emits
 * 176,640 bytes = exactly 192 frames of true 23x10. The Veo text mark is 23x10,
 * so this is not a hypothetical edge case — it is the default path.
 */
export function buildRoiExtractArgs(inputPath: string, rect: PixelRect): string[] {
  const r = rectArgs(rect);
  return [
    '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-filter:v', `format=rgba,crop=${r.w}:${r.h}:${r.x}:${r.y}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    'pipe:1',
  ];
}

/**
 * Overlays cleaned ROI frames (stdin) back onto the untouched original.
 *
 * Streams are mapped **explicitly**, and the optional `?` suffixes matter.
 * The obvious shorthand — `-map [v] -map 0 -map -0:v` — does not work: the
 * negative map drops the filter output along with the source video, and ffmpeg
 * fails with `Filter overlay:default has an unconnected output` after having
 * already written an audio-only header. Measured against a real clip, not
 * guessed. `0:a?`/`0:s?` carry audio and subtitles through untouched (verified
 * bit-identical by SHA-256 of the copied AAC stream) and silently no-op on an
 * input that has none.
 *
 * `eof_action=pass` means a short ROI stream (a worker that stopped early)
 * leaves the remaining frames untouched rather than truncating the video.
 */
export function buildRoiCompositeArgs(
  inputPath: string,
  outputPath: string,
  rect: PixelRect,
  fps: number,
  opts: { encoder?: VideoEncoder; quality?: EncodeQuality } = {},
): string[] {
  const r = rectArgs(rect);
  const encoder = resolveEncoder(opts.encoder ?? 'libx264', opts.quality ?? {});
  const rate = Number.isFinite(fps) && fps > 0 ? Math.min(240, Math.max(1, fps)) : 30;
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-progress', 'pipe:1', '-nostats',
    '-i', inputPath,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${r.w}x${r.h}`, '-r', String(rate),
    '-i', 'pipe:0',
    '-filter_complex', `[0:v][1:v]overlay=x=${r.x}:y=${r.y}:eof_action=pass[v]`,
    '-map', '[v]',
    '-map', '0:a?',
    '-map', '0:s?',
    '-c:a', 'copy',
    '-c:s', 'copy',
    '-c:v', encoder,
    ...encoderQualityArgs(encoder, opts.quality ?? {}),
    '-map_metadata', '0',
    ...outputFormatArgs(outputPath),
    outputPath,
  ];
}
