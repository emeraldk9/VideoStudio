import { spawn, type ChildProcess } from 'node:child_process';

import type { PixelRect } from '../../shared/types/watermark';
import { Logger } from '../logging/logger';

import { buildRoiCompositeArgs, buildRoiExtractArgs, type EncodeQuality, type VideoEncoder } from './watermark-args';
import { edgeBandMask, fillEdgeBand } from './watermark-edge-band';
import { unblendRegion, type RgbaFrame } from './watermark-unblend';


const logger = Logger.createChildLogger('watermark-video');

/**
 * Beta S235 — cleaning a clip by streaming only its watermark region.
 *
 * ## The shape, and why
 *
 * ffmpeg crops the ROI and writes raw RGBA to a pipe; this process transforms
 * each small frame; a second ffmpeg overlays the cleaned frames back onto the
 * untouched original. Whole-frame decode and encode never leave ffmpeg, so the
 * hardware codecs do the expensive part and JavaScript only ever sees a few
 * hundred pixels per frame.
 *
 * Measured end to end on a real 8-second 720p Flow clip: 192 frames, zero
 * leftover bytes, **1,157 ms wall** (~7x realtime) of which the pixel work was
 * **10.5 ms — 0.91%**. That measurement is the entire argument for this design,
 * and also the reason video frames are *not* sent to a worker: marshalling them
 * across a thread boundary would cost more than the 10 ms it could save.
 *
 * ## Why the gain adapts per frame
 *
 * Phase 0 found `alphaGain` is calibrated per *image*, varying 0.45-1.0 across
 * six real stills, and that replaying a fixed gain was wrong by up to 111/255
 * inside the region. Running the full search per frame is impossible — 1,440
 * frames at ~3 s each is 72 minutes — so the gain is seeded once and then
 * nudged frame to frame by a cheap residual measurement, under a hard step cap
 * so it can never swing fast enough to be seen as flicker.
 */

/**
 * The largest the gain may move between consecutive frames.
 *
 * Taken from upstream's video path, which caps its own adaptive alpha at the
 * same value. The reason is visual, not numerical: a gain that chases the
 * residual freely will oscillate on a moving background, and an oscillating
 * correction in a fixed screen position reads as a flickering patch — far more
 * noticeable than the watermark it is removing.
 */
export const ALPHA_GAIN_STEP_CAP = 0.05;

/**
 * Outside this range the correction is no longer plausibly a watermark removal.
 *
 * Beta S495 — `MIN_GAIN` is exported because reaching it is a *signal*: the
 * two video items ever recorded `done` before S495 both finished at exactly
 * 0.2, which is the loop saying "every correction I make looks like damage",
 * which is what cleaning a rect the mark is not under looks like. The batch
 * now treats a final gain on the floor as a failed rung.
 */
export const MIN_GAIN = 0.2;
const MAX_GAIN = 1.5;

/** How strongly a measured bias pulls the gain. Deliberately below 1 — this loop should converge, not hunt. */
const FEEDBACK_STRENGTH = 0.6;

/** Rec. 709 luma. The marks are neutral, so luminance carries all the signal that matters. */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * How much watermark is still visible in the region, as a signed number.
 *
 * Compares the brightness of the pixels the mask covers against the pixels it
 * does not, both inside the same ROI. A white mark that is **under**-subtracted
 * leaves the masked pixels brighter than their neighbours (positive); an
 * **over**-subtracted one leaves them darker (negative). Zero means the region
 * is locally uniform, which is what a clean removal looks like.
 *
 * Using the ROI's own unmasked pixels as the reference is what makes this work
 * on a moving background: both sides of the comparison move together, so scene
 * brightness cancels out and only the mask-shaped discrepancy remains.
 *
 * Returns 0 when the mask has no meaningful covered or uncovered area, since a
 * ratio against an empty set is noise, not a measurement.
 */
export function residualBias(
  frame: RgbaFrame,
  alphaMap: Float32Array | readonly number[],
  rect: PixelRect,
): number {
  const w = Math.max(0, Math.min(frame.width - rect.x, Math.round(rect.width)));
  const h = Math.max(0, Math.min(frame.height - rect.y, Math.round(rect.height)));
  if (w <= 0 || h <= 0) return 0;

  let coveredSum = 0;
  let coveredWeight = 0;
  let openSum = 0;
  let openWeight = 0;

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const a = Math.abs(alphaMap[row * Math.round(rect.width) + col] ?? 0);
      const idx = ((rect.y + row) * frame.width + (rect.x + col)) * 4;
      const l = luma(frame.data[idx], frame.data[idx + 1], frame.data[idx + 2]);
      coveredSum += l * a;
      coveredWeight += a;
      openSum += l * (1 - a);
      openWeight += 1 - a;
    }
  }
  if (coveredWeight < 1 || openWeight < 1) return 0;
  return (coveredSum / coveredWeight - openSum / openWeight) / 255;
}

/**
 * The next frame's gain, given the current one and what the last frame left behind.
 *
 * Clamped twice on purpose: the **step** cap stops visible flicker, and the
 * absolute bounds stop a pathological clip (a genuinely bright object parked
 * under the mark) from walking the gain somewhere it can never come back from.
 */
export function nextGain(current: number, bias: number): number {
  const desired = current + FEEDBACK_STRENGTH * bias;
  const stepped = Math.max(
    current - ALPHA_GAIN_STEP_CAP,
    Math.min(current + ALPHA_GAIN_STEP_CAP, desired),
  );
  return Math.max(MIN_GAIN, Math.min(MAX_GAIN, stepped));
}

export interface VideoCleanPlan {
  rect: PixelRect;
  alphaMap: Float32Array;
  /** Starting strength, from detection. The loop takes over from here. */
  seedGain: number;
  fps: number;
  /** Used only to turn ffmpeg's `out_time_us` into a fraction. */
  durationSec: number;
}

export interface VideoCleanOptions {
  encoder?: VideoEncoder;
  quality?: EncodeQuality;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface VideoCleanResult {
  ok: boolean;
  framesProcessed: number;
  /** Bytes that arrived but never formed a whole frame. Non-zero means the crop geometry is wrong. */
  leftoverBytes: number;
  finalGain: number;
  error?: string;
}

export class VideoWatermarkRemover {
  constructor(private readonly ffmpegPath: string) {}

  /**
   * Streams the clip through the ROI pipeline.
   *
   * Both subprocesses are always torn down, on every path. An orphaned ffmpeg
   * holding a pipe will sit forever waiting for input that is never coming, and
   * it holds the output file open — which on Windows makes the file
   * undeletable and the next attempt fail for an unrelated-looking reason.
   */
  clean(
    inputPath: string,
    outputPath: string,
    plan: VideoCleanPlan,
    options: VideoCleanOptions = {},
  ): Promise<VideoCleanResult> {
    return new Promise((resolve) => {
      const frameBytes = Math.round(plan.rect.width) * Math.round(plan.rect.height) * 4;
      const extract = spawn(this.ffmpegPath, buildRoiExtractArgs(inputPath, plan.rect), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const composite = spawn(
        this.ffmpegPath,
        buildRoiCompositeArgs(inputPath, outputPath, plan.rect, plan.fps, {
          encoder: options.encoder,
          quality: options.quality,
        }),
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      let settled = false;
      let frames = 0;
      let gain = plan.seedGain;
      // Beta S495 — the codec's fringe along the glyph's edge, cleaned after
      // each exact unblend. The band depends on the template's shape only, so
      // it is computed once for the clip.
      const band = edgeBandMask(plan.alphaMap, Math.round(plan.rect.width), Math.round(plan.rect.height));
      // Annotated: `Buffer.alloc` infers the narrower `Buffer<ArrayBuffer>`, which
      // the pooled buffers arriving from the pipe do not satisfy.
      let pending: Buffer = Buffer.alloc(0);
      let compositeErr = '';
      let extractErr = '';

      const finish = (result: VideoCleanResult) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        killQuietly(extract);
        killQuietly(composite);
        resolve(result);
      };

      const onAbort = () => {
        finish({ ok: false, framesProcessed: frames, leftoverBytes: pending.length, finalGain: gain, error: 'cancelled' });
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      // `addEventListener('abort')` does **not** fire on a signal that is
      // already aborted, so a batch cancelled before this item started would
      // otherwise run to completion and write a file nobody asked for. The
      // subprocesses are spawned by now, but `finish` tears them down.
      if (options.signal?.aborted) {
        onAbort();
        return;
      }

      composite.stderr.on('data', (d: Buffer) => {
        compositeErr = `${compositeErr}${d.toString()}`.slice(-4000);
      });
      extract.stderr.on('data', (d: Buffer) => {
        extractErr = `${extractErr}${d.toString()}`.slice(-4000);
      });

      if (options.onProgress && plan.durationSec > 0) {
        composite.stdout?.on('data', (chunk: Buffer) => {
          const match = /out_time_us=(\d+)/.exec(chunk.toString());
          if (match) options.onProgress?.(Math.min(1, Number(match[1]) / 1_000_000 / plan.durationSec));
        });
      }

      // Registered exactly once. An earlier draft added a `once('drain')` per
      // backpressured frame, which produced a MaxListenersExceededWarning after
      // ten frames and would have leaked a listener per frame across a long clip.
      composite.stdin.on('drain', () => extract.stdout.resume());
      composite.stdin.on('error', () => {
        /* Composite exiting early surfaces through its 'close' handler below. */
      });

      extract.stdout.on('data', (chunk: Buffer) => {
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        while (pending.length >= frameBytes) {
          const raw = pending.subarray(0, frameBytes);
          pending = pending.subarray(frameBytes);

          const frame: RgbaFrame = {
            data: new Uint8ClampedArray(raw),
            width: Math.round(plan.rect.width),
            height: Math.round(plan.rect.height),
          };
          // The ROI stream is already cropped, so within this frame the region
          // is the whole picture and starts at the origin.
          const local: PixelRect = { x: 0, y: 0, width: frame.width, height: frame.height };
          unblendRegion(frame, plan.alphaMap, local, { alphaGain: gain });
          // The gain is judged on the unblend alone; the band fill would hide
          // exactly the residual the loop is steering by.
          gain = nextGain(gain, residualBias(frame, plan.alphaMap, local));
          fillEdgeBand(frame, local, band);
          frames++;

          const ok = composite.stdin.write(new Uint8Array(frame.data.buffer, 0, frameBytes));
          if (!ok) extract.stdout.pause();
        }
      });

      extract.stdout.on('end', () => composite.stdin.end());
      extract.on('error', (error) =>
        finish({ ok: false, framesProcessed: frames, leftoverBytes: pending.length, finalGain: gain, error: String(error) }),
      );

      composite.on('close', (code) => {
        if (code === 0) {
          if (pending.length > 0) {
            // Whole frames divided evenly until they did not: the crop produced
            // a different geometry than we assumed, and every overlaid frame is
            // suspect. Reported rather than silently accepted.
            logger.warn('roi stream ended mid-frame', {
              leftoverBytes: pending.length,
              frameBytes,
              frames,
            });
          }
          logger.info('video cleaned', { frames, finalGain: Number(gain.toFixed(3)), outputPath });
          finish({ ok: true, framesProcessed: frames, leftoverBytes: pending.length, finalGain: gain });
          return;
        }
        finish({
          ok: false,
          framesProcessed: frames,
          leftoverBytes: pending.length,
          finalGain: gain,
          error: lastLines(compositeErr) || lastLines(extractErr) || `ffmpeg exited ${code}`,
        });
      });
    });
  }
}

/** The last few stderr lines say what went wrong; "Command failed" does not. */
function lastLines(text: string, count = 4): string {
  return text.trim().split(/\r?\n/).slice(-count).join('\n');
}

function killQuietly(child: ChildProcess): void {
  try {
    if (child.exitCode === null && !child.killed) child.kill();
  } catch {
    /* Already gone. */
  }
}
