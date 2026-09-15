import { motionToPerspectiveExprs, type MotionCurve, type RenderEncoderInfo } from '@shared';

import { videoEncodeArgs } from './render-encoder';

/**
 * Beta S154 phase 3 — one still, one segment, with an optional Ken Burns move.
 *
 * Pure `build*` functions, like every other ffmpeg arg builder in this
 * directory: the filter expressions are the part that goes wrong, so they are
 * the part a test can read with no binary present. Nothing here spawns.
 *
 * The curve itself lives in `@shared/utils/timeline/motion.ts`, where the
 * preview's `motionAt` and this file's `motionToPerspectiveExprs` are written
 * against one definition — the pair that had already drifted once when the
 * curve existed twice (the preview panned 13.4% while the export panned 10.7%).
 *
 * ## Beta S256 — `perspective`, not `zoompan`
 *
 * S228 moved stills onto `zoompan` and met its trap: the crop window resolves
 * to **integer input pixels**, so a slow move steps a whole pixel at a time
 * and judders. The cure was to supersample the input until a pixel was too
 * small to see, and the cure was the cost ~~ at the 6× a slow move asked for,
 * every output frame resampled a ~68-megapixel crop on a single thread. On
 * the sequence that exposed it a 13-second still took 292 seconds, and 116
 * stills put the export at four and three-quarter hours remaining.
 *
 * `perspective` takes the window as float corner coordinates and interpolates
 * at 1/256 of a pixel: the sub-pixel placement the supersample imitated, done
 * natively, on a frame only slightly larger than the canvas. Measured on the
 * same still against the zoompan chain (`Beta_S256`):
 *
 * | chain                    | 413-frame clip | frame-to-frame jitter | static fidelity |
 * | ------------------------ | -------------- | --------------------- | --------------- |
 * | zoompan, 6× in / 2× out  | 292s           | 20.4%                 | VMAF 71         |
 * | perspective, 1.25×       | 46s            | 2.2%                  | VMAF 91.5       |
 *
 * Faster, smoother, and sharper ~~ the last because the frame is resampled
 * once rather than up six times and back down.
 *
 * ## Why the source is decoded once
 *
 * `-loop 1` makes the image demuxer emit the still again for every output
 * frame, and a 4-megapixel PNG decodes at ~70 ms ~~ more than `perspective`
 * itself. `-framerate` on the input plus the `loop` filter after the fit
 * decodes and fits the picture once and replays the *frame*, with correct
 * constant-rate timestamps (verified: 60 frames, 2.000s, pts in 1/fps steps).
 * The hold path gains from this too; a ten-second hold was thirty seconds of
 * PNG decoding.
 */

/**
 * How much larger than the canvas the frame `perspective` works on is.
 *
 * `perspective` writes a frame the size of its input, so this is both the
 * resolution the move is sampled at and the whole per-frame cost ~~ its
 * sub-pixel LUT is recomputed every frame, single-threaded, per output pixel.
 * Measured on the still above, against a lanczos ground truth for a frame
 * mid-move:
 *
 * | pre-scale | mid-move fidelity | 413-frame clip |
 * | --------- | ----------------- | -------------- |
 * | 1×        | 77.6              | 29s            |
 * | **1.25×** | **85.0**          | **46s**        |
 * | 1.5×      | 89.4              | 63s            |
 *
 * 1.25× is the knee: parity with the zoompan chain it replaces (85.8) at a
 * sixth of its cost. Above it the picture keeps sharpening but the cost is
 * quadratic, and the static frame gets *softer* (each extra resample costs),
 * so it is a quality dial with a real trade, not a free setting.
 */
const MOTION_OVERSAMPLE = 1.25;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** An even dimension, because yuv420p halves chroma and libx264 refuses odd sizes. */
function even(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2));
}

export interface StillMotionOptions {
  /** The resolved move, or `undefined` for a plain hold. */
  motion: MotionCurve | undefined;
  /** Output geometry — the sequence's, not the source's. */
  width: number;
  height: number;
  /** How many frames this still occupies. Drives the whole travel. */
  durationFrames: number;
  fps: number;
}

/**
 * The filter chain for one still, from decoded image to a clip-sized video.
 *
 * A static still keeps S145's contain-fit (`decrease` + `pad`) — a storyboard
 * still is a composed image and cropping it would silently discard what the
 * shot was framed around. A **moving** still cover-fits (`increase` + `crop`)
 * instead: panning across a padded image drags the letterbox into frame on
 * any aspect mismatch (the audit's A2.3), and between the two honesties —
 * losing the bars or losing the framing — motion has already chosen. The
 * inspector states the trade where motion is applied.
 *
 * Both chains end in `loop`, so the work before it runs once per clip and the
 * work after it (for a move: `perspective` and the final `scale`) runs once
 * per frame. `format=yuv420p` sits before the loop for the same reason — the
 * conversion happens once, and `perspective` then moves 1.5 bytes a pixel
 * instead of four.
 */
export function buildStillFilterChain(options: StillMotionOptions): string {
  const width = even(clamp(options.width, 2, 7680));
  const height = even(clamp(options.height, 2, 4320));
  const frames = Math.max(1, Math.round(clamp(options.durationFrames, 1, 10_368_000)));

  if (!options.motion) {
    const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    return `${fit},setsar=1,format=yuv420p,loop=loop=-1:size=1`;
  }

  const workWidth = even(width * MOTION_OVERSAMPLE);
  const workHeight = even(height * MOTION_OVERSAMPLE);
  const e = motionToPerspectiveExprs(options.motion, frames);
  const quad = `x0='${e.x0}':y0='${e.y0}':x1='${e.x1}':y1='${e.y1}':x2='${e.x2}':y2='${e.y2}':x3='${e.x3}':y3='${e.y3}'`;
  return [
    `scale=${workWidth}:${workHeight}:force_original_aspect_ratio=increase`,
    `crop=${workWidth}:${workHeight}`,
    'format=yuv420p',
    'loop=loop=-1:size=1',
    `perspective=${quad}:interpolation=cubic:sense=source:eval=frame`,
    `scale=${width}:${height}`,
    'setsar=1',
  ].join(',');
}

/**
 * The full ffmpeg argument list turning one still into one normalized segment.
 *
 * `-frames:v` rather than `-t`: the frame count is the value the document
 * actually holds, and converting it to seconds and back would let a rounding
 * error change the segment's length by a frame — which then shows up as A/V
 * drift after forty concatenated segments. `-framerate` on the input is what
 * gives the looped frame its timestamps; there is no `fps` filter to re-time
 * anything, and no `-r`.
 */
export function buildStillSegmentArgs(
  inputPath: string,
  outputPath: string,
  // S248 — the encode side only. The input is a still image, so there is no
  // decode for `-hwaccel` to accelerate.
  options: StillMotionOptions & { colorFilter?: string; encoder?: RenderEncoderInfo },
): string[] {
  const frames = Math.max(1, Math.round(clamp(options.durationFrames, 1, 10_368_000)));
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  return [
    '-y',
    '-framerate',
    String(fps),
    '-i',
    inputPath,
    '-vf',
    // S154 phase 3 — the colour chain rides after the motion chain; absent or
    // empty appends nothing, so a neutral clip's args are byte-identical.
    options.colorFilter
      ? `${buildStillFilterChain(options)},${options.colorFilter}`
      : buildStillFilterChain(options),
    '-frames:v',
    String(frames),
    ...videoEncodeArgs({ encoder: options.encoder }),
    outputPath,
  ];
}
