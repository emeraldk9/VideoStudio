/**
 * Beta S145 — stage 1 of the render: every V1 clip becomes an intermediate
 * with identical geometry, frame rate, pixel format and SAR.
 *
 * **Why four staged passes rather than one `filter_complex`.** A single graph
 * for a 60-clip sequence is fragile, exceeds practical filter limits, gives no
 * per-clip progress, and is undebuggable when one input is malformed. Staging
 * means progress reads `n/total`, one bad source fails one *named* clip
 * instead of the whole render, and stage 2 can use the concat demuxer with
 * `-c copy` — which is only valid because this stage guarantees every segment
 * matches. That is the load-bearing contract between the two files.
 *
 * Same house convention as its siblings: pure `build*Args`, thin async wrapper
 * elsewhere, every numeric clamped before it reaches a filter string.
 */

import {
  XFADE_NAME,
  type ClipTransition,
  type ClipTransitionParams,
  type RenderDeliveryFormat,
  type RenderEncoderInfo,
  type RenderQuality,
} from '@shared';

import { hwaccelArgs, videoEncodeArgs } from './render-encoder';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export interface NormalizeVideoOptions {
  width: number;
  height: number;
  fps: number;
  /** Trim into the source, in seconds. Omit for the whole clip. */
  startSeconds?: number;
  durationSeconds?: number;
  /** Draft renders halve the geometry — a truthful look at transitions in a fraction of the time. */
  draft?: boolean;
  /**
   * S154 phase 3 — source-consumption rate. The segment still lasts
   * `durationSeconds` on the timeline; `speed` widens the source window
   * (`-t duration*speed`) and `setpts=PTS/speed` compresses it back. 1 or
   * absent emits the pre-phase-3 args byte-for-byte.
   */
  speed?: number;
  /** S154 phase 3 — `buildColorFilterChain`'s output. `''`/absent adds nothing. */
  colorFilter?: string;
  /**
   * S248 — the encoder this pass writes with, and whether its input decodes
   * on the GPU. Absent = libx264 and software decode, byte-for-byte the
   * pre-S248 args.
   */
  encoder?: RenderEncoderInfo;
}

/**
 * The video filter chain. Identical shape to `buildStillFilterChain`'s output
 * so the two produce interchangeable segments.
 *
 * `fps` is applied, not assumed: Veo clips measure at their own rate and a
 * VFR-ish input concatenated against CFR segments drifts. `setsar=1` is here
 * for the same reason — a mismatched sample aspect ratio is the single most
 * common cause of a concat demuxer refusing a list that otherwise looks right.
 */
export function buildNormalizeFilter(options: NormalizeVideoOptions): string {
  const scale = options.draft ? 0.5 : 1;
  const width = Math.max(2, Math.round(clamp(options.width, 2, 7680) * scale));
  const height = Math.max(2, Math.round(clamp(options.height, 2, 4320) * scale));
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  // Even dimensions: yuv420p subsamples chroma 2x2 and libx264 rejects an odd
  // width or height outright. A draft halving 1080 to 540 is fine; halving
  // 1079 would not be.
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  const speed = clamp(options.speed ?? 1, 0.25, 4);
  return [
    `scale=${evenWidth}:${evenHeight}:force_original_aspect_ratio=decrease`,
    `pad=${evenWidth}:${evenHeight}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    // Retime *before* the fps filter, so the CFR pass resamples the sped
    // stream rather than stamping the old timestamps onto it.
    ...(Math.abs(speed - 1) > 0.001 ? [`setpts=PTS/${speed.toFixed(4)}`] : []),
    ...(options.colorFilter ? [options.colorFilter] : []),
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',');
}

/**
 * One video clip → one normalized segment.
 *
 * `-ss` sits **before** `-i` (input seeking, fast and keyframe-accurate) and
 * is paired with re-encoding, which makes it frame-accurate too — the
 * combination that avoids both the slow-decode of output seeking and the
 * imprecise cut of a stream copy. `video-editor.ts`'s `buildTrimArgs` uses
 * `-c copy` instead, which is right for its job (lossless whole-clip trim) and
 * wrong for this one.
 *
 * The audio stream is **dropped** (`-an`). Stage 3 builds the audio bed from
 * the timeline's own lanes; keeping a clip's original audio here would mix a
 * source's incidental sound under a narration nobody asked to hear it with,
 * and there is no lane on which that decision could be expressed or undone.
 */
/**
 * S157's one ladder, replacing per-builder literals; S248 moved its body to
 * `render-encoder.ts` so a hardware encoder can answer the same question.
 *
 * `draft` wins (28/ultrafast — the half-size preview's tier), then `quality`:
 * `'high'` is 16/slow, absent/`'good'` is 18/veryfast. Intermediate passes
 * deliberately never receive `quality`: re-encoding an 18/veryfast segment at
 * 16/slow spends minutes to restore nothing, so the tier is applied once, at
 * the final encode.
 */

export function buildNormalizeVideoArgs(
  inputPath: string,
  outputPath: string,
  options: NormalizeVideoOptions,
): string[] {
  // S248 — decode acceleration is an **input** option, so it precedes both
  // `-ss` and `-i`. Applied here and on the alpha segment (the two per-clip
  // passes that decode arbitrary user media, and where stage 1 spends nearly
  // all of its time) but never on the multi-input join or composite graphs: a
  // 40-input pass would open 40 hardware decode sessions at once, and the
  // decode those passes do is of our own uniform intermediates anyway.
  const args = ['-y', ...hwaccelArgs(options.encoder)];
  if (options.startSeconds !== undefined) {
    args.push('-ss', clamp(options.startSeconds, 0, 86_400).toFixed(3));
  }
  args.push('-i', inputPath);
  if (options.durationSeconds !== undefined) {
    // `-t` sits after `-i`, so it is an **output** duration — the clip's
    // timeline length, never widened by speed: with `setpts=PTS/speed` on the
    // chain, capping the output at `durationSeconds` is precisely what makes
    // the pass consume `duration×speed` of source. (Multiplying here was the
    // first thing the real-ffmpeg composite test caught: the sped segment
    // came out at source/speed instead of the clip's length.)
    args.push('-t', clamp(options.durationSeconds, 0.001, 86_400).toFixed(3));
  }
  args.push(
    '-vf',
    buildNormalizeFilter(options),
    '-an',
    ...videoEncodeArgs({ draft: options.draft, encoder: options.encoder }),
    outputPath,
  );
  return args;
}

/**
 * Beta S226 — stage 2's join, as **one filter graph** instead of pairwise
 * folds.
 *
 * Two problems with the fold this replaces, both structural:
 *
 * 1. Each fold re-encoded the whole accumulated spine, so N dissolves cost N
 *    generations of x264 loss on the earliest clips. One graph is one encode.
 * 2. `xfade` alone consumes its overlap from the joint, shortening the
 *    picture against audio tracks that cannot follow — the S226 defect. Here
 *    every non-cut boundary first extends the outgoing chain with
 *    `tpad=stop=D:stop_mode=clone` (its last frame, held), then dissolves
 *    into the incoming clip's first D frames. Output length is exactly the
 *    sum of the inputs — verified against the bundled binary (24f + 24f with
 *    a 12f dissolve emits exactly 48 frames) and pinned by
 *    `tests/unit/timeline-layout.test.ts`.
 *
 * A boundary's `frames` comes from `effectiveBoundaryTransition` (`@shared`),
 * already clamped to the incoming clip's length; `transition: null` is a hard
 * cut. Runs of consecutive cuts group into single `concat` nodes so xfade
 * nodes exist only where a transition actually does.
 */
export interface JoinBoundary {
  /** An `xfade` transition token, or `null` for a hard cut. */
  transition: string | null;
  /** Frames of the incoming segment the transition occupies. 0 for a cut. */
  frames: number;
  /**
   * S230 — blend in linear light: both arms convert to linear `gbrp16le`
   * before the xfade and back to bt709 `yuv420p` after. A crossfade computed
   * on gamma-encoded values darkens its midpoint — the classic mid-dissolve
   * dip that reads as "digital"; blending linear is what makes a film
   * dissolve look like one. Only the dissolve family sets this — a wipe
   * never blends, so it has nothing to gain and skips the two conversions.
   */
  linear?: boolean;
  /** S230 — the expression for `transition=custom`, built by {@link xfadePlanFor} from clamped numerics. */
  customExpr?: string;
}

/**
 * S230 — how one transition type renders at a boundary: its xfade token,
 * whether it blends in linear light, and its custom expression when the
 * token is `custom`. `null` means the boundary is not an xfade at all — a
 * cut, or flash_frame (which paints the incoming segment's own head and
 * leaves the join a concat).
 *
 * Expression notes, because these are load-bearing:
 * - xfade's `P` runs 1 → 0 across the window, so elapsed progress is
 *   `(1-P)`.
 * - Every custom expression runs inside the linear wrap, i.e. on
 *   `gbrp16le` — plane order G,B,R and full scale 65535, which is why the
 *   dip colour is linearised sRGB scaled to 16 bits, and why `additive`
 *   clips against 65535. Additive only *means* anything in linear light.
 */
export function xfadePlanFor(
  type: ClipTransition,
  params: ClipTransitionParams | undefined,
): { token: string; linear: boolean; expr?: string } | null {
  const MAXVAL = 65535;
  switch (type) {
    case 'cut':
    case 'flash_frame':
      return null;
    case 'crossfade':
    case 'match_dissolve':
      // The match's *alignment* rides the incoming segment's motion
      // (`composeMatchNudge`); the blend itself is a plain linear-light fade.
      return { token: 'fade', linear: true };
    case 'blur_dissolve':
      return { token: 'hblur', linear: true };
    case 'asymmetric_dissolve': {
      const ratio = clamp(params?.outInRatio ?? 0.3, 0.05, 0.95).toFixed(4);
      // The outgoing leaves within the first `ratio` of the window; the
      // incoming rises over the whole of it. Weights never sum past 1.
      return {
        token: 'custom',
        linear: true,
        expr: `A*max(0,1-(1-P)/${ratio})+B*(1-P)`,
      };
    }
    case 'additive_dissolve':
      // The A/B-roll look: both images at full weight through the middle,
      // highlights blooming through the clip against full scale.
      return {
        token: 'custom',
        linear: true,
        expr: `min(${MAXVAL},A*min(1,2*P)+B*min(1,2*(1-P)))`,
      };
    case 'luma_dissolve':
      // Revealed by brightness: the outgoing's bright pixels persist
      // longest. Hard-edged on purpose — the archival feel.
      return {
        token: 'custom',
        linear: true,
        expr: `if(gt(A,(1-P)*${MAXVAL}),A,B)`,
      };
    case 'dip_to_color': {
      const [cg, cb, cr] = dipColorPlanes(params?.colorHex ?? '#000000');
      // gbrp plane order: 0=G, 1=B, 2=R.
      const plane = `if(eq(PLANE,0),${cg},if(eq(PLANE,1),${cb},${cr}))`;
      // First half (P > 0.5): outgoing sinks into the colour. Second half:
      // the incoming rises out of it.
      return {
        token: 'custom',
        linear: true,
        expr: `if(gt(P,0.5),A*(2*P-1)+${plane}*(2-2*P),${plane}*(2*P)+B*(1-2*P))`,
      };
    }
    default:
      return { token: XFADE_NAME[type as Exclude<ClipTransition, 'cut'>] ?? 'fade', linear: false };
  }
}

/** sRGB channel → linear light at 16-bit scale, fixed for the expression. */
function dipColorPlanes(colorHex: string): [string, string, string] {
  const hex = /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : '#000000';
  const linear = (channel: number): string => {
    const c = channel / 255;
    const value = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return (value * 65535).toFixed(1);
  };
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return [linear(g), linear(b), linear(r)];
}

/**
 * S230 — the two halves of the linear-light wrap. The `setparams` tag is
 * mandatory: an untagged input makes zscale fail with "no path between
 * colorspaces". 16-bit linear has enough headroom that banding is a
 * non-issue.
 */
const TO_LINEAR =
  'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709,zscale=transfer=linear,format=gbrp16le';
const FROM_LINEAR = 'zscale=transfer=bt709:matrix=bt709:primaries=bt709,format=yuv420p';

export function buildJoinGraph(
  segmentFrames: number[],
  boundaries: JoinBoundary[],
  fps: number,
): string {
  if (segmentFrames.length === 0) throw new Error('buildJoinGraph needs at least one segment.');
  if (boundaries.length !== segmentFrames.length - 1) {
    throw new Error(
      `buildJoinGraph got ${segmentFrames.length} segments but ${boundaries.length} boundaries.`,
    );
  }
  const safeFps = Math.max(1, Math.round(clamp(fps, 1, 120)));
  const lines: string[] = [];

  // Group inputs joined by cuts into runs; each run becomes one label.
  const runs: { inputs: number[]; frames: number }[] = [{ inputs: [0], frames: segmentFrames[0] }];
  boundaries.forEach((boundary, index) => {
    const next = index + 1;
    if (boundary.transition === null || boundary.frames <= 0) {
      const run = runs[runs.length - 1];
      run.inputs.push(next);
      run.frames += segmentFrames[next];
    } else {
      runs.push({ inputs: [next], frames: segmentFrames[next] });
    }
  });

  // Every run passes through `settb=AVTB`: xfade refuses inputs whose
  // timebases differ, and a raw mp4 input (e.g. 1/12288) never matches a
  // filter-chain arm (1/1000000). Normalizing both arms to AVTB is the
  // documented cure, and costs nothing.
  let label = 0;
  const runLabel = (run: { inputs: number[] }): string => {
    const out = `[r${label++}]`;
    if (run.inputs.length === 1) {
      lines.push(`[${run.inputs[0]}:v]settb=AVTB${out}`);
      return out;
    }
    lines.push(
      `${run.inputs.map((input) => `[${input}:v]`).join('')}concat=n=${run.inputs.length}:v=1:a=0,settb=AVTB${out}`,
    );
    return out;
  };

  // Fold runs left to right. `cum` is the accumulated length in frames of the
  // chain *before* tpad — which is exactly xfade's absolute offset, because
  // tpad then guarantees the chain reaches offset + duration.
  let current = runLabel(runs[0]);
  let cum = runs[0].frames;
  const transitionBoundaries = boundaries.filter(
    (boundary) => boundary.transition !== null && boundary.frames > 0,
  );
  transitionBoundaries.forEach((boundary, index) => {
    const run = runs[index + 1];
    // Tokens come from `XFADE_NAME`, but clamp to the safe charset anyway —
    // this string is interpolated into a filter graph.
    const transition = /^[a-z]+$/.test(boundary.transition ?? '') ? boundary.transition! : 'fade';
    // The expression is machine-built from clamped numerics (`xfadePlanFor`);
    // the charset gate is a backstop, and an unexpected character degrades
    // the boundary to a plain fade rather than reaching the graph.
    const expr =
      boundary.customExpr && /^[0-9A-Za-z+\-*/().,]*$/.test(boundary.customExpr)
        ? boundary.customExpr
        : undefined;
    const xfade =
      transition === 'custom' && expr
        ? `xfade=transition=custom:expr='${expr}'`
        : `xfade=transition=${transition === 'custom' ? 'fade' : transition}`;
    const held = `[h${label}]`;
    const joined = `[j${label}]`;
    label += 1;
    lines.push(`${current}tpad=stop=${boundary.frames}:stop_mode=clone${held}`);
    const timing = `duration=${(boundary.frames / safeFps).toFixed(6)}:offset=${(cum / safeFps).toFixed(6)}`;
    if (boundary.linear) {
      // S230 — blend in linear light: both arms convert before the xfade,
      // the joined result converts back, and the chain stays yuv420p for
      // whatever follows.
      const heldLinear = `[hl${label}]`;
      const runLinear = `[rl${label}]`;
      const joinedLinear = `[jl${label}]`;
      label += 1;
      lines.push(`${held}${TO_LINEAR}${heldLinear}`);
      lines.push(`${runLabel(run)}${TO_LINEAR}${runLinear}`);
      lines.push(`${heldLinear}${runLinear}${xfade}:${timing}${joinedLinear}`);
      lines.push(`${joinedLinear}${FROM_LINEAR}${joined}`);
    } else {
      lines.push(`${held}${runLabel(run)}${xfade}:${timing}${joined}`);
    }
    current = joined;
    cum += run.frames;
  });

  lines.push(`${current}fps=${safeFps},format=yuv420p[v]`);
  return lines.join(';\n');
}

/**
 * The argument list around a join graph. The graph rides in a **script file**
 * (`-filter_complex_script`), not inline: a 40-input graph is kilobytes of
 * filter text, and Windows' command-line limit is the kind of ceiling that
 * only appears on the largest sequence someone actually cares about.
 */
export function buildJoinArgs(
  inputPaths: string[],
  scriptPath: string,
  outputPath: string,
  encoder?: RenderEncoderInfo,
): string[] {
  return [
    '-y',
    ...inputPaths.flatMap((input) => ['-i', input]),
    '-filter_complex_script',
    scriptPath,
    '-map',
    '[v]',
    ...videoEncodeArgs({ encoder }),
    outputPath,
  ];
}

/**
 * Splits a join into chunks of at most `maxInputs` segments, cutting **only
 * at hard-cut boundaries** — a transition may never span two ffmpeg
 * invocations. A run of transitions longer than the cap therefore produces a
 * chunk larger than the cap: correctness beats the guideline, and the cap
 * exists only to bound open file handles per process.
 *
 * Returns `[start, end)` index ranges over the segment list.
 */
export function planJoinChunks(
  boundaries: JoinBoundary[],
  maxInputs: number,
): { start: number; end: number }[] {
  const total = boundaries.length + 1;
  const chunks: { start: number; end: number }[] = [];
  let start = 0;
  while (start < total) {
    let end = Math.min(start + Math.max(2, maxInputs), total);
    if (end < total) {
      // Walk back to the nearest cut boundary; boundary i sits between
      // segments i and i+1, so splitting at segment `end` needs
      // boundaries[end - 1] to be a cut.
      let split = end;
      while (split > start + 1 && boundaries[split - 1].transition !== null) split -= 1;
      // No cut inside the window — walk forward instead and take the
      // oversized chunk.
      if (split === start + 1 && boundaries[start].transition !== null) {
        split = end;
        while (split < total && boundaries[split - 1].transition !== null) split += 1;
      }
      end = split;
    }
    chunks.push({ start, end });
    start = end;
  }
  return chunks;
}

/**
 * Stage 4 — the mux.
 *
 * Video is stream-copied (stage 2 already produced the final picture) and only
 * the audio is encoded, which keeps a 3-minute sequence's final pass at a
 * couple of seconds. `-shortest` pins the result to the video: the audio bed
 * from stage 3 is built to the sequence's exact length, so this is a guard
 * against a rounding tail rather than a truncation anyone should notice.
 */
/**
 * S157 — the mux's export options. All absent = the pre-S157 args exactly
 * (`-c:v copy`, 192k AAC), which the neutrality test pins.
 */
export interface MuxOptions {
  /** Scale the picture to this height (`scale=-2:h`); forces a re-encode. */
  outputHeight?: number;
  /** `'high'` forces a 16/slow final re-encode; `'good'`/absent keeps the copy. */
  quality?: RenderQuality;
  /** AAC bitrate at the mux. Absent = 192. */
  audioBitrateKbps?: number;
  /**
   * S248 — the encoder, **when this mux re-encodes at all**. Hardware
   * acceleration changes which encoder a re-encode uses, never whether one
   * happens: the `-c:v copy` fast path below is the whole reason a 3-minute
   * sequence muxes in seconds, and it stays.
   */
  encoder?: RenderEncoderInfo;
}

export function buildMuxArgs(
  videoPath: string,
  audioPath: string | null,
  outputPath: string,
  options: MuxOptions = {},
): string[] {
  const reencode = options.outputHeight !== undefined || options.quality === 'high';
  const videoArgs = reencode
    ? [
        ...(options.outputHeight !== undefined
          ? ['-vf', `scale=-2:${Math.max(2, Math.round(options.outputHeight / 2) * 2)}`]
          : []),
        ...videoEncodeArgs({ quality: options.quality, encoder: options.encoder }),
      ]
    : null;

  if (!audioPath) {
    if (!videoArgs) return ['-y', '-i', videoPath, '-c', 'copy', outputPath];
    return ['-y', '-i', videoPath, '-an', ...videoArgs, outputPath];
  }
  return [
    '-y',
    '-i',
    videoPath,
    '-i',
    audioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    ...(videoArgs ?? ['-c:v', 'copy']),
    '-c:a',
    'aac',
    '-b:a',
    `${options.audioBitrateKbps ?? 192}k`,
    '-shortest',
    outputPath,
  ];
}

/**
 * S286 — the delivery conversion's options. The master is the finished mp4
 * (post-mux, final geometry and length), so no scaling or quality knobs live
 * here — every export option already applied to the master, identically for
 * every container.
 */
export interface TranscodeOptions {
  format: Exclude<RenderDeliveryFormat, 'mp4'>;
  /**
   * `'gif'` only: the palette pass-1 output ({@link buildGifPaletteArgs}).
   * Two real passes rather than the single-command `split`/`palettegen`
   * trick, which buffers every frame of one branch until the palette exists —
   * fine for a clip, a memory cliff for a minutes-long sequence.
   */
  palettePath?: string;
  /** `'webm'` only: the Opus bitrate. Absent = 192, matching the mux's AAC default. */
  audioBitrateKbps?: number;
}

/** S286 — GIF pass 1: the whole master distilled into one 256-colour palette. */
export function buildGifPaletteArgs(masterPath: string, palettePath: string): string[] {
  return ['-y', '-i', masterPath, '-vf', 'palettegen=stats_mode=diff', palettePath];
}

/**
 * S286 — the PNG frame sequence's output pattern: the chosen `name.png`
 * becomes `name_%05d.png` beside it. Derived here (with its first-frame
 * companion) so the service and the dialog handler cannot disagree about
 * what a sequence export actually writes.
 */
export function pngSequencePattern(outputPath: string): string {
  return outputPath.replace(/\.png$/i, '') + '_%05d.png';
}

/** S286 — the first frame the pattern writes; the path the result reports. */
export function pngSequenceFirstFrame(outputPath: string): string {
  return outputPath.replace(/\.png$/i, '') + '_00001.png';
}

/**
 * S286 — master mp4 → delivery container. Pure args, like every builder in
 * this file. GIF/APNG/PNG are silent by nature (`-an` states it rather than
 * relying on the muxer to notice); WebM re-encodes the bed to Opus. Always a
 * software encode — none of these codecs has a hardware path in the bundled
 * ffmpeg, so the S248 encoder never applies here.
 */
export function buildTranscodeArgs(
  masterPath: string,
  outputPath: string,
  options: TranscodeOptions,
): string[] {
  switch (options.format) {
    case 'gif':
      return [
        '-y',
        '-i',
        masterPath,
        '-i',
        options.palettePath ?? '',
        '-lavfi',
        'paletteuse=dither=sierra2_4a:diff_mode=rectangle',
        '-an',
        '-loop',
        '0',
        outputPath,
      ];
    case 'webm':
      return [
        '-y',
        '-i',
        masterPath,
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '32',
        '-b:v',
        '0',
        '-row-mt',
        '1',
        '-cpu-used',
        '2',
        '-c:a',
        'libopus',
        '-b:a',
        `${options.audioBitrateKbps ?? 192}k`,
        outputPath,
      ];
    case 'apng':
      // -plays 0 loops forever — the GIF's -loop 0, under the APNG muxer's name.
      return ['-y', '-i', masterPath, '-an', '-c:v', 'apng', '-plays', '0', outputPath];
    case 'png':
      return [
        '-y',
        '-i',
        masterPath,
        '-an',
        '-c:v',
        'png',
        '-start_number',
        '1',
        pngSequencePattern(outputPath),
      ];
  }
}

/**
 * Beta S145 phase D — ducks the music bed under the narration bed.
 *
 * A true sidechain compressor, not the static-volume duck
 * `video-editor.ts`'s `muxNarrationWithDucking` uses: that file's own comment
 * scoped static ducking to "until a real narration track surfaces a case
 * where it sounds wrong", and a storyteller timeline is exactly that case —
 * narration comes and goes per shot, and a static duck holds the music down
 * through every silence between lines.
 *
 * The music is compressed *by* the narration's level, then the (untouched)
 * narration is mixed on top. Both inputs are the stage-3 beds, already pinned
 * to the sequence's exact length, so no delays are needed here — and the mix
 * carries `normalize=0` for `audio-timeline.ts`'s measured reason: the
 * default divides by input count, which would halve the narration the moment
 * music joins it.
 */
export interface DuckMixOptions {
  /** Compression ratio while narration plays. 8:1 reads as "music steps aside" without pumping. */
  ratio?: number;
  /** Sidechain threshold, linear 0-1. Narration above this engages the duck. */
  threshold?: number;
  /** Milliseconds for the duck to engage / recover. Slow release avoids audible pumping between lines. */
  attackMs?: number;
  releaseMs?: number;
  /**
   * Beta S251 — the bed's intended length, which the mix is **pinned** to.
   *
   * `sidechaincompress` does not flush its tail cleanly at EOF: fed two
   * 3.000s inputs it emits somewhere between 1.96s and 2.99s, varying run to
   * run on identical data. The mux's `-shortest` then faithfully truncates
   * the *picture* to that, so a ducked export came out short by a random
   * fraction of a second — silently, and with `result.durationSeconds` still
   * reporting the length the timeline intended.
   *
   * `apad` + `-t` is the fix: pad the mix indefinitely, cut at the length the
   * caller already knows. Absent leaves the pre-S251 args byte-for-byte, so
   * the neutrality tests stay meaningful.
   */
  durationSeconds?: number;
}

export function buildDuckMixArgs(
  narrationPath: string,
  musicPath: string,
  outputPath: string,
  options: DuckMixOptions = {},
): string[] {
  const ratio = clamp(options.ratio ?? 8, 1, 20);
  const threshold = clamp(options.threshold ?? 0.03, 0.001, 1);
  const attack = Math.round(clamp(options.attackMs ?? 20, 1, 1000));
  const release = Math.round(clamp(options.releaseMs ?? 400, 1, 5000));
  // S251 — `apad` makes the mix infinite so the `-t` below decides its length
  // outright. Without it the graph's length is whatever `sidechaincompress`
  // happened to emit, which is not a fixed number.
  const pinned = options.durationSeconds !== undefined;
  return [
    '-y',
    '-i',
    narrationPath,
    '-i',
    musicPath,
    '-filter_complex',
    // `[1][0]` order matters: sidechaincompress compresses its FIRST input by
    // its SECOND. Reversed, the narration would duck under the music.
    `[1:a][0:a]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}[ducked];` +
      `[ducked][0:a]amix=inputs=2:duration=first:normalize=0${pinned ? ',apad' : ''}[aout]`,
    '-map',
    '[aout]',
    ...(pinned ? ['-t', clamp(options.durationSeconds!, 0.001, 86_400).toFixed(3)] : []),
    '-c:a',
    'pcm_s16le',
    outputPath,
  ];
}

// -------------------------------------------------- Beta S154 — compositing

/**
 * Phase 2 — one overlay-track clip → one **alpha-carrying** segment.
 *
 * The spine's segments are h264/yuv420p, which cannot hold transparency; an
 * overlay segment must, or the composite would paint its letterbox padding as
 * black bars over the picture beneath. So: scale to fit, pad with
 * `black@0.0` (fully transparent), `format=yuva420p`, and encode **qtrle in
 * `.mov`** — lossless RLE, ideal for flat overlay content, present in every
 * ffmpeg build, no new dependency. `prores_ks 4444` is the known alternative
 * for photographic overlays if qtrle's size ever becomes a complaint.
 *
 * Stills loop for their duration exactly as `buildStillSegmentArgs` does, but
 * **without the Ken Burns chain**: motion presets are a spine capability (the
 * inspector does not offer them off the spine), and the overlay's alpha has
 * to survive untouched.
 */
export function buildAlphaSegmentArgs(
  inputPath: string,
  outputPath: string,
  options: NormalizeVideoOptions & {
    still: boolean;
    /** S154 phase 6 — PiP: the segment's box as a fraction of the frame. @default 1 */
    transformScale?: number;
    /** S154 phase 6 — static opacity, multiplied into the alpha channel. @default 1 */
    opacity?: number;
  },
): string[] {
  const scale = options.draft ? 0.5 : 1;
  const pip = clamp(options.transformScale ?? 1, 0.05, 1);
  // The segment is only as big as its PiP box — the layer graph positions it.
  const width = Math.max(2, Math.round(clamp(options.width, 2, 7680) * scale * pip));
  const height = Math.max(2, Math.round(clamp(options.height, 2, 4320) * scale * pip));
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  const speed = clamp(options.speed ?? 1, 0.25, 4);
  const opacity = clamp(options.opacity ?? 1, 0, 1);
  const filter = [
    `scale=${evenWidth}:${evenHeight}:force_original_aspect_ratio=decrease`,
    `pad=${evenWidth}:${evenHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0.0`,
    'setsar=1',
    // Same phase-3 ordering as the spine's chain: retime, colour, then CFR.
    ...(!options.still && Math.abs(speed - 1) > 0.001 ? [`setpts=PTS/${speed.toFixed(4)}`] : []),
    ...(options.colorFilter ? [options.colorFilter] : []),
    `fps=${fps}`,
    'format=yuva420p',
    // After the format so the alpha plane exists to multiply.
    ...(opacity < 0.999 ? [`colorchannelmixer=aa=${opacity.toFixed(3)}`] : []),
  ].join(',');

  // S248 — decode side only. The output stays `qtrle`: no hardware H.264
  // encoder has an alpha mode, and this segment exists precisely to carry
  // transparency. A still decodes from an image and gains nothing, so the
  // accelerator is offered only to the video branch.
  const args = ['-y', ...(options.still ? [] : hwaccelArgs(options.encoder))];
  if (!options.still && options.startSeconds !== undefined) {
    args.push('-ss', clamp(options.startSeconds, 0, 86_400).toFixed(3));
  }
  if (options.still) {
    args.push('-loop', '1');
  }
  args.push('-i', inputPath);
  if (options.durationSeconds !== undefined) {
    // Output-position `-t`: the timeline length, for the spine chain's reason.
    args.push('-t', clamp(options.durationSeconds, 0.001, 86_400).toFixed(3));
  }
  args.push('-vf', filter, '-an', '-c:v', 'qtrle', outputPath);
  return args;
}

/** One clip's placement inside a layer: its segment file, offset, and position. */
export interface LayerSegment {
  segmentPath: string;
  offsetSeconds: number;
  /**
   * How long the segment runs, so `buildLayerArgs` can end the layer at the
   * last one instead of at the end of the timeline. Optional because a caller
   * that does not know simply gets the old full-length behaviour.
   */
  durationSeconds?: number;
  /**
   * S154 phase 6 — the segment centre as **fraction expressions** over `t`
   * (layer time, seconds): a constant like `0.500000` for a static PiP, or a
   * keyframe ladder from `toFfmpegExpression`. The graph wraps them into
   * pixel coordinates (`main_w*(F)-overlay_w/2`). Absent = centred, which for
   * a full-frame segment is exactly the old `x=0:y=0`.
   */
  xExpression?: string;
  yExpression?: string;
}

/**
 * Phase 2, stage `layers` — one free video track → one full-length alpha
 * layer: a transparent base with each segment overlaid at its offset.
 *
 * `setpts=PTS-STARTPTS+offset/TB` is what places a segment in timeline time;
 * `eof_action=pass` keeps the base running after a segment ends. Input count
 * is bounded by the caller at the same 32 the audio graph uses
 * (`MAX_DUB_SEGMENTS`) — past that the caller folds in waves, reusing the
 * audio pipeline's chunk pattern rather than inventing a second one.
 */
export function buildLayerArgs(
  segments: LayerSegment[],
  outputPath: string,
  options: { width: number; height: number; fps: number; durationSeconds: number; draft?: boolean },
): string[] {
  const scale = options.draft ? 0.5 : 1;
  const width = Math.max(2, Math.round(clamp(options.width, 2, 7680) * scale));
  const height = Math.max(2, Math.round(clamp(options.height, 2, 4320) * scale));
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  // The layer ends at its **last segment**, not at the end of the timeline.
  //
  // `options.durationSeconds` is the whole sequence, and using it directly is
  // what a 3.7s still on an 18-minute timeline used to cost: 32,850 frames of
  // lossless RGBA that are 99.7% fully transparent (measured: 176s to encode,
  // 0.2 GB on disk), every one of which `buildCompositeArgs` then decoded
  // again. Ending at the last segment makes that file 3.7s long.
  //
  // Safe because the composite overlays with `eof_action=pass:shortest=0`:
  // once the layer ends the spine passes through untouched, and the output
  // keeps the spine's full duration. Verified frame-by-frame against a 20s
  // spine with a 5s layer — overlay applied through 4.9s, base pixels exact
  // from 6s to 19s, output still 20.00s.
  //
  // The layer deliberately still **starts** at 0. `positionExpressionsFor`
  // bakes each clip's absolute timeline offset into its keyframe expression,
  // and those are evaluated against layer time, so trimming the front would
  // desync every keyframed overlay by the amount trimmed. Trimming only the
  // tail leaves that arithmetic untouched.
  const contentEnd = segments.reduce(
    (end, segment) =>
      segment.durationSeconds === undefined
        ? end
        : Math.max(end, segment.offsetSeconds + segment.durationSeconds),
    0,
  );
  const cap = clamp(options.durationSeconds, 0.001, 86_400);
  // One frame of slack, so rounding can never clip the last segment short.
  const duration = contentEnd > 0 ? Math.min(cap, contentEnd + 1 / fps) : cap;

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0.0:s=${evenWidth}x${evenHeight}:r=${fps}:d=${duration.toFixed(3)},format=yuva420p`,
  ];
  for (const segment of segments) {
    args.push('-i', segment.segmentPath);
  }

  const chains: string[] = [];
  let base = '[0:v]';
  segments.forEach((segment, index) => {
    const offset = clamp(segment.offsetSeconds, 0, 86_400);
    const shifted = `[s${index}]`;
    const next = `[b${index}]`;
    // Position: centre-anchored pixel coordinates from fraction expressions.
    // Quoted because a keyframe ladder contains commas, which are filter
    // separators outside quotes; `eval=frame` makes `t` live per frame.
    const x = segment.xExpression ? `'main_w*(${segment.xExpression})-overlay_w/2'` : '0';
    const y = segment.yExpression ? `'main_h*(${segment.yExpression})-overlay_h/2'` : '0';
    const evalMode = segment.xExpression || segment.yExpression ? ':eval=frame' : '';
    chains.push(
      `[${index + 1}:v]setpts=PTS-STARTPTS+${offset.toFixed(3)}/TB${shifted}`,
      `${base}${shifted}overlay=x=${x}:y=${y}${evalMode}:eof_action=pass:shortest=0${next}`,
    );
    base = next;
  });
  chains.push(`${base}format=yuva420p[layer]`);

  args.push('-filter_complex', chains.join(';'), '-map', '[layer]', '-c:v', 'qtrle', outputPath);
  return args;
}

/**
 * Phase 2, stage `composite` — the spine plus every layer, in **one graph**.
 *
 * One graph rather than a pairwise fold, and the reason is the opposite of
 * stage 2's: the crossfade fold is bounded by *clips* (large), this graph by
 * *tracks* (small), and a fold here would re-encode the whole timeline once
 * per layer where one graph re-encodes it once regardless of track count.
 *
 * `padToSeconds` extends the spine with black (`tpad`) when an overlay runs
 * past it — the `overlay_past_spine` preflight warning names the black-backed
 * tail rather than letting the composite silently cut the overlay.
 */
export function buildCompositeArgs(
  spinePath: string,
  layerPaths: string[],
  outputPath: string,
  options: {
    fps: number;
    draft?: boolean;
    padToSeconds?: number;
    spineSeconds?: number;
    encoder?: RenderEncoderInfo;
  },
): string[] {
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  const args = ['-y', '-i', spinePath];
  for (const layerPath of layerPaths) {
    args.push('-i', layerPath);
  }

  const chains: string[] = [];
  const needsPad =
    options.padToSeconds !== undefined &&
    options.spineSeconds !== undefined &&
    options.padToSeconds > options.spineSeconds + 1 / fps;
  chains.push(
    needsPad
      ? `[0:v]tpad=stop_mode=add:stop_duration=${clamp(options.padToSeconds! - options.spineSeconds!, 0, 86_400).toFixed(3)},format=yuv420p,setsar=1[bg0]`
      : `[0:v]format=yuv420p,setsar=1[bg0]`,
  );
  let base = '[bg0]';
  layerPaths.forEach((_layerPath, index) => {
    const next = `[bg${index + 1}]`;
    chains.push(
      `${base}[${index + 1}:v]overlay=x=0:y=0:eof_action=pass:shortest=0:format=auto${next}`,
    );
    base = next;
  });
  chains.push(`${base}format=yuv420p[vout]`);

  args.push(
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[vout]',
    ...videoEncodeArgs({ draft: options.draft, encoder: options.encoder }),
    outputPath,
  );
  return args;
}

/**
 * S157 — the adjustment-layer pass: the finished composite re-encoded once
 * through a chain of time-windowed colour filters (each effect clip's
 * `buildWindowedColorFilterChain`, already `enable=`-gated).
 *
 * A plain `-vf` re-encode, not a filter_complex: one input, one output, no
 * graph. Called **only when at least one effect clip exists** — a sequence
 * without effect clips must emit byte-identical args to pre-S157, and the
 * cheapest identical args are none at all.
 */
export function buildEffectPassArgs(
  inputPath: string,
  outputPath: string,
  filterChain: string,
  options: { draft?: boolean; encoder?: RenderEncoderInfo },
): string[] {
  return [
    '-y',
    // One input, our own intermediate — the multi-input caveat above does not
    // apply, so this pass takes the accelerator.
    ...hwaccelArgs(options.encoder),
    '-i',
    inputPath,
    '-vf',
    filterChain,
    ...videoEncodeArgs({ draft: options.draft, encoder: options.encoder }),
    '-an',
    outputPath,
  ];
}

/**
 * Raw mono PCM for waveform peaks.
 *
 * `s16le` to a pipe rather than a file: the caller buckets it into
 * `PEAK_BUCKET_COUNT` min/max pairs and throws the samples away, so writing
 * them to disk first would be pure I/O for data nothing else reads. 8 kHz is
 * far below anything audible but far above what 2048 buckets can express —
 * peaks are a shape, not a signal.
 */
export function buildPeaksArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-i',
    inputPath,
    '-ac',
    '1',
    '-ar',
    '8000',
    '-f',
    's16le',
    '-acodec',
    'pcm_s16le',
    '-',
  ];
}
