import type { PixelRect, WatermarkPresetId } from '../../shared/types/watermark';
import { Logger } from '../logging/logger';

import { computeRectangularSpatialCorrelation } from './vendor/gwr/veoTextWatermarkDetector.js';
import {
  getVeoTextWatermarkTemplate,
  VEO_TEXT_TEMPLATE_IDS,
  type VeoTextTemplateId,
} from './vendor/gwr/veoTextWatermarkTemplates.js';
import { resolveVideoWatermarkCandidates } from './vendor/gwr/videoWatermarkCatalog.js';
import { alphaMapFor } from './watermark-alpha';
import { decodeFrameRgba } from './watermark-frame-io';
import { clampRect, resolveRect } from './watermark-region';
import { unblendRegion, type RgbaFrame } from './watermark-unblend';
import { residualBias } from './watermark-video';

const logger = Logger.createChildLogger('watermark-detect');

/**
 * Beta S495 — find the mark on the item's own pixels before touching them.
 *
 * ## Why this module exists
 *
 * S235 §2.5 measured four real Flow clips and found three carrying the 23x10
 * text mark and one the diamond, and wrote down the rule: *detection must be
 * per item, never assumed from resolution.* The rule was recorded and the
 * detector was vendored, but nothing ever called it. `resolveRect` handed
 * back the catalogue's top candidate for the diamond and a fixed corner for
 * the text marks, and the batch cleaned there with a seed gain of 1.0 and no
 * check that a mark was under it.
 *
 * Measured on 2026-09-11 against the owner's clips, that produced every
 * failure mode a removal tool can have at once. The two video items ever
 * recorded `done` had cleaned the still-badge hypothesis on a clip — 43 px
 * from anything — and finished with the adaptive gain pinned at its 0.2
 * floor, i.e. the mark untouched, then stamped clean. The three current
 * clips all carry the 48 px inset diamond at the catalogue's *first*
 * candidate, and the text templates score below 0.35 on them against a 0.62
 * threshold, so anyone picking a text preset got a confident subtraction of
 * nothing. And with the right rect the diamond's alpha map peaks at 0.506,
 * so a seed gain of 1.0 over-subtracted the first ten frames to a black
 * diamond before the loop found ~0.55; a fixed 0.5 was clean from frame 0.
 *
 * ## What it does
 *
 * 1. **Candidates.** Every position a mark of the chosen family could sit at:
 *    the diamond catalogue's candidates for this frame size, the text
 *    templates at their margins, both with a small search radius (the
 *    upstream detector's own), and — for a still — a wider search around the
 *    Gemini badge hypothesis, which S235 §6 measured up to 43 px off.
 * 2. **Scoring.** Normalized cross-correlation of the template against the
 *    frame's luma, the upstream scorer, on a handful of frames sampled across
 *    the clip. Each frame votes for its best candidate; the winner needs the
 *    vote ratio and a median score above the family's threshold.
 * 3. **Gain.** The opacity multiplier is calibrated on the same frames by
 *    minimising the residual the video loop measures, so the loop starts at
 *    the right answer instead of walking to it in view.
 *
 * Nothing here writes a file. The batch and the preview both call it, which
 * is what makes the preview honest about what the batch will do.
 */

/** A preset that names a real mark, as opposed to `auto` (find one) or `manual` (none). */
export type ConcretePresetId = Exclude<WatermarkPresetId, 'auto' | 'manual'>;

/** What a detection may look for. `auto` means every family. */
export type DetectScope = Exclude<WatermarkPresetId, 'manual'>;

export interface MarkPlan {
  presetId: ConcretePresetId;
  rect: PixelRect;
  alphaMap: Float32Array;
  /** The calibrated opacity multiplier for `unblendRegion`. */
  gain: number;
  /** Median NCC of the winning candidate across the frames that chose it. */
  ncc: number;
  /** The threshold the family had to clear; kept so the post-clean gate can reuse it. */
  minNcc: number;
  frames: number;
  votes: number;
}

/** A plan before its gain has been calibrated. */
export type MarkDetection = Omit<MarkPlan, 'gain'>;

/**
 * Whether `scope` on this kind of media is answered by detection here, or by
 * the upstream still search harness.
 *
 * Every preset on a **clip** is detected: there is no per-frame harness and
 * the catalogue is only a list of places to look. On a **still**, only the
 * text presets are detected (nothing else knows where they are). The square
 * glyph on a still — `gemini-auto`, `veo-diamond-auto` (which S243 found
 * owners pick for a still because it names what they see) and `auto` — is
 * left to the harness, which searches every size and position, is exact,
 * and calibrates its own gain per image. Measured 2026-09-12: the catalogue
 * lookup scored 0.42 on a still whose badge the harness had found at 53 px,
 * 43 px away from the 48 px hypothesis, which is the harness's whole point.
 */
export function detectionApplies(scope: DetectScope, mediaType: 'image' | 'video'): boolean {
  if (mediaType === 'video') return true;
  return scope === 'veo-text-23x10' || scope === 'veo-text-68x30' || scope === 'veo-text-99x43';
}

/** How much of the sampled frames must agree before a mark is trusted. Upstream's value. */
const MIN_VOTE_RATIO = 0.6;

/**
 * The diamond's threshold. The text templates carry their own (`minNcc`,
 * 0.62 for all three); the embedded diamond map does not, and the upstream
 * video detector keeps it in the module this drop does not carry.
 *
 * Measured on 2026-09-12 against the owner's three most recent clips, all
 * carrying the 48 px inset diamond at the catalogue's first candidate: the
 * per-clip median NCC at the true position was **0.52, 0.44 and 0.76** (the
 * glyph is translucent, so the picture behind it carries much of the
 * correlation's variance), while 30 px off target it never exceeded 0.16 and
 * the text templates on the same frames never exceeded 0.25. The threshold
 * sits between those bands with margin on both sides; the vote ratio guards
 * the rest.
 */
export const DIAMOND_MIN_NCC = 0.35;

/** Frames scored per clip. Enough to outvote a frame where the mark sits on flat noise; cheap. */
export const DEFAULT_SAMPLE_COUNT = 8;

/** Search radius around a catalogue position. The catalogue is exact to the pixel when it is right at all. */
const VIDEO_SEARCH_RADIUS = 6;

interface Candidate {
  id: string;
  presetId: ConcretePresetId;
  /** The centre of the search, not necessarily where the mark is. */
  rect: PixelRect;
  alphaMap: Float32Array;
  /** What the scorer correlates against. The text templates keep a separate map for this. */
  detectorMap: Float32Array;
  minNcc: number;
  radius: number;
  step: number;
}

/** Normalized cross-correlation of `map` against the frame's luma at `rect`. 0 if it does not fit. */
export function scoreTemplateAt(frame: RgbaFrame, map: Float32Array, rect: PixelRect): number {
  return computeRectangularSpatialCorrelation({
    imageData: frame,
    alphaMap: map,
    region: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  });
}

function textCandidates(width: number, height: number, only?: VeoTextTemplateId): Candidate[] {
  const out: Candidate[] = [];
  for (const id of VEO_TEXT_TEMPLATE_IDS) {
    if (only && id !== only) continue;
    const template = getVeoTextWatermarkTemplate(id);
    if (!template) continue;
    // `resolveRect` owns the "does it fit at all" answer, and its margins are
    // the ones verified against real output; the template's own agree.
    const rect = resolveRect({ kind: 'preset', presetId: id }, width, height);
    if (!rect) continue;
    const alphaMap = alphaMapFor(id, rect);
    if (!alphaMap) continue;
    out.push({
      id,
      presetId: id,
      rect,
      alphaMap,
      detectorMap: template.detectorMap ?? alphaMap,
      minNcc: template.minNcc,
      radius: Math.max(4, Math.round(Math.min(template.width, template.height) * 0.35)),
      step: 1,
    });
  }
  return out;
}

/**
 * The diamond, at every place the video catalogue says it can be on a frame
 * this size. Only for clips: on a still the same glyph is the Gemini badge,
 * whose size and position the upstream search harness finds far more
 * thoroughly than a catalogue lookup — see `detectionApplies`.
 */
function diamondCandidates(width: number, height: number, mediaType: 'image' | 'video'): Candidate[] {
  if (mediaType !== 'video') return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of resolveVideoWatermarkCandidates(width, height)) {
    const rect = clampRect(
      { x: candidate.x, y: candidate.y, width: candidate.size, height: candidate.size },
      width,
      height,
    );
    const key = `${rect.x}:${rect.y}:${rect.width}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alphaMap = alphaMapFor('veo-diamond-auto', rect);
    if (!alphaMap) continue;
    out.push({
      id: candidate.id,
      presetId: 'veo-diamond-auto',
      rect,
      alphaMap,
      detectorMap: alphaMap,
      minNcc: DIAMOND_MIN_NCC,
      radius: VIDEO_SEARCH_RADIUS,
      step: 1,
    });
  }
  return out;
}

/** Every mark `scope` allows, as a search centre with a radius. */
export function candidatesFor(
  scope: DetectScope,
  width: number,
  height: number,
  mediaType: 'image' | 'video',
): Candidate[] {
  switch (scope) {
    case 'auto':
      return [...diamondCandidates(width, height, mediaType), ...textCandidates(width, height)];
    case 'veo-diamond-auto':
    case 'gemini-auto':
      // The same square glyph — see `alphaMapFor`. A clip carries the video
      // catalogue's diamond whichever of the two names the user picked.
      return diamondCandidates(width, height, mediaType);
    case 'veo-text-23x10':
    case 'veo-text-68x30':
    case 'veo-text-99x43':
      return textCandidates(width, height, scope);
    default:
      return [];
  }
}

interface FrameBest {
  candidate: Candidate;
  rect: PixelRect;
  ncc: number;
}

/** The best-scoring position for one candidate on one frame, within its search radius. */
function searchCandidate(frame: RgbaFrame, candidate: Candidate): { rect: PixelRect; ncc: number } {
  const { rect, radius, step, detectorMap } = candidate;
  let best = { rect, ncc: scoreTemplateAt(frame, detectorMap, rect) };
  const probe = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + rect.width > frame.width || y + rect.height > frame.height) return;
    const at = { x, y, width: rect.width, height: rect.height };
    const ncc = scoreTemplateAt(frame, detectorMap, at);
    if (ncc > best.ncc) best = { rect: at, ncc };
  };
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      if (dx === 0 && dy === 0) continue;
      probe(rect.x + dx, rect.y + dy);
    }
  }
  // A coarse grid lands within `step` of the peak; one fine pass finds it.
  if (step > 1) {
    const centre = best.rect;
    for (let dy = -step + 1; dy < step; dy++) {
      for (let dx = -step + 1; dx < step; dx++) {
        if (dx === 0 && dy === 0) continue;
        probe(centre.x + dx, centre.y + dy);
      }
    }
  }
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Scores every candidate on every frame and returns the mark the frames
 * agree on, or `null` when they agree on nothing.
 *
 * `null` is a real answer, and the reason this function exists: cleaning a
 * rect no mark is under damages the picture and then reports success.
 */
export function detectMark(
  frames: readonly RgbaFrame[],
  width: number,
  height: number,
  scope: DetectScope,
  mediaType: 'image' | 'video',
): { detection: MarkDetection | null; bestNcc: number } {
  const candidates = candidatesFor(scope, width, height, mediaType);
  if (frames.length === 0 || candidates.length === 0) return { detection: null, bestNcc: 0 };

  const winners: FrameBest[] = [];
  let bestNcc = -1;
  for (const frame of frames) {
    let frameBest: FrameBest | null = null;
    for (const candidate of candidates) {
      const found = searchCandidate(frame, candidate);
      if (found.ncc > bestNcc) bestNcc = found.ncc;
      if (!frameBest || found.ncc > frameBest.ncc) frameBest = { candidate, ...found };
    }
    if (frameBest) winners.push(frameBest);
  }

  // Votes by candidate; the most-voted one is the frames' answer.
  const votes = new Map<string, FrameBest[]>();
  for (const winner of winners) {
    const list = votes.get(winner.candidate.id) ?? [];
    list.push(winner);
    votes.set(winner.candidate.id, list);
  }
  let elected: FrameBest[] = [];
  for (const list of votes.values()) if (list.length > elected.length) elected = list;
  if (elected.length === 0) return { detection: null, bestNcc };

  const candidate = elected[0].candidate;
  const ncc = median(elected.map((w) => w.ncc));
  if (elected.length / frames.length < MIN_VOTE_RATIO || ncc < candidate.minNcc) {
    return { detection: null, bestNcc };
  }

  // The rect the frames agree on. Positions can differ by a pixel between
  // frames on a moving background; the median is the stable answer.
  const rect = clampRect(
    {
      x: Math.round(median(elected.map((w) => w.rect.x))),
      y: Math.round(median(elected.map((w) => w.rect.y))),
      width: candidate.rect.width,
      height: candidate.rect.height,
    },
    width,
    height,
  );

  return {
    detection: {
      presetId: candidate.presetId,
      rect,
      alphaMap: candidate.alphaMap,
      ncc,
      minNcc: candidate.minNcc,
      frames: frames.length,
      votes: elected.length,
    },
    bestNcc,
  };
}

/** The gain search space. Matches the video loop's own bounds. */
const GAIN_MIN = 0.2;
const GAIN_MAX = 1.5;

function copyRegion(frame: RgbaFrame, rect: PixelRect): RgbaFrame {
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((Math.round(rect.y) + row) * frame.width + Math.round(rect.x)) * 4;
    data.set(frame.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { data, width: w, height: h };
}

/**
 * The gain at which unblending `rect` leaves the least residual, as the video
 * loop measures residual — so the loop starts where it would otherwise end.
 *
 * A coarse grid then a fine one, per frame, median across frames. The
 * function is unimodal enough over this range that the grid is cheaper than
 * being clever: a 48x48 region at 27 + 10 gains on 8 frames is under a
 * million pixel operations.
 */
export function calibrateGain(frames: readonly RgbaFrame[], alphaMap: Float32Array, rect: PixelRect): number {
  const local: PixelRect = { x: 0, y: 0, width: Math.round(rect.width), height: Math.round(rect.height) };
  const residualAt = (roi: RgbaFrame, gain: number) => {
    const trial: RgbaFrame = { data: new Uint8ClampedArray(roi.data), width: roi.width, height: roi.height };
    unblendRegion(trial, alphaMap, local, { alphaGain: gain });
    return Math.abs(residualBias(trial, alphaMap, local));
  };
  const perFrame: number[] = [];
  for (const frame of frames) {
    const roi = copyRegion(frame, rect);
    let best = { gain: 1, residual: Number.POSITIVE_INFINITY };
    for (let gain = GAIN_MIN; gain <= GAIN_MAX + 1e-9; gain += 0.05) {
      const residual = residualAt(roi, gain);
      if (residual < best.residual) best = { gain, residual };
    }
    const coarse = best.gain;
    for (let gain = coarse - 0.04; gain <= coarse + 0.04 + 1e-9; gain += 0.01) {
      if (gain < GAIN_MIN || gain > GAIN_MAX) continue;
      const residual = residualAt(roi, gain);
      if (residual < best.residual) best = { gain, residual };
    }
    perFrame.push(Number(best.gain.toFixed(2)));
  }
  return perFrame.length > 0 ? median(perFrame) : 1;
}

/** Evenly spaced sample times across a clip; `[0]` for a still. */
export function sampleTimes(durationSec: number, count = DEFAULT_SAMPLE_COUNT): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const n = Math.max(1, Math.min(count, Math.round(durationSec * 4)));
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    // Never the very last instant: a seek there decodes nothing on some containers.
    times.push(Math.min(Math.max(0, durationSec - 0.1), ((i + 0.5) / n) * durationSec));
  }
  return times;
}

export interface MediaGeometry {
  width: number;
  height: number;
  /** Zero for a still. */
  durationSec: number;
  mediaType: 'image' | 'video';
}

/** Decodes one frame; injectable so the planner is testable without a binary. */
export type FrameDecoder = (
  inputPath: string,
  width: number,
  height: number,
  atSeconds: number,
) => Promise<RgbaFrame>;

export function ffmpegFrameDecoder(ffmpegPath: string): FrameDecoder {
  return async (inputPath, width, height, atSeconds) => {
    const raw = await decodeFrameRgba(ffmpegPath, inputPath, width, height, atSeconds);
    return { data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, width * height * 4), width, height };
  };
}

export async function sampleFrames(
  decode: FrameDecoder,
  inputPath: string,
  geometry: MediaGeometry,
  count = DEFAULT_SAMPLE_COUNT,
): Promise<RgbaFrame[]> {
  const frames: RgbaFrame[] = [];
  for (const at of sampleTimes(geometry.durationSec, count)) {
    try {
      frames.push(await decode(inputPath, geometry.width, geometry.height, at));
    } catch (error) {
      // One unreadable sample is not a reason to give up on the clip; the
      // vote ratio is over the frames that *were* read.
      logger.warn('could not decode a sample frame', {
        inputPath,
        atSeconds: at,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return frames;
}

export interface PlanResult {
  plan: MarkPlan | null;
  /** The highest score any candidate reached, so a refusal can say how close it came. */
  bestNcc: number;
  frames: number;
}

/**
 * Samples, detects and calibrates: everything a clean of `inputPath` under
 * `scope` needs to know, or `null` when no mark of that scope is on it.
 *
 * The template is the alpha that gets applied. Measuring the alpha on the
 * clip instead was built and withdrawn during S495: the temporal mean's
 * background under the glyph can only be interpolated, and whatever
 * structure sits there leaks into the estimate and back out as a soft ghost.
 * What the template does leave behind — the codec's fringe along the edge —
 * is handled after the unblend by `watermark-edge-band.ts`.
 */
export async function planMark(
  decode: FrameDecoder,
  inputPath: string,
  geometry: MediaGeometry,
  scope: DetectScope,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): Promise<PlanResult> {
  const frames = await sampleFrames(decode, inputPath, geometry, sampleCount);
  const { detection, bestNcc } = detectMark(frames, geometry.width, geometry.height, scope, geometry.mediaType);
  if (!detection) {
    logger.info('no mark detected', { inputPath, scope, frames: frames.length, bestNcc: Number(bestNcc.toFixed(3)) });
    return { plan: null, bestNcc, frames: frames.length };
  }
  const gain = calibrateGain(frames, detection.alphaMap, detection.rect);
  logger.info('mark detected', {
    inputPath,
    scope,
    presetId: detection.presetId,
    rect: detection.rect,
    ncc: Number(detection.ncc.toFixed(3)),
    votes: `${detection.votes}/${detection.frames}`,
    gain,
  });
  return { plan: { ...detection, gain }, bestNcc, frames: frames.length };
}

/**
 * The post-clean gate: does the mark still score on the cleaned file?
 *
 * Samples the output at the same times and correlates the same template at
 * the same rect. A removal that worked leaves a correlation near zero; one
 * that did not — wrong rect, a codec that smoothed the repair back toward
 * the mark — leaves it near where it started, and one that *over*-subtracted
 * leaves a dark glyph that correlates **negatively** (measured at -0.4 to
 * -0.8 for a seed gain of 1.0 on the diamond), which is why the magnitude is
 * gated, not the sign. The threshold is the family's detection threshold
 * scaled down, so "still detectable" fails with margin rather than at the
 * edge; a good clean measured within ±0.15.
 */
export async function verifyClean(
  decode: FrameDecoder,
  outputPath: string,
  geometry: MediaGeometry,
  plan: MarkPlan,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): Promise<{ clean: boolean; ncc: number; frames: number }> {
  const frames = await sampleFrames(decode, outputPath, geometry, sampleCount);
  if (frames.length === 0) return { clean: false, ncc: 1, frames: 0 };
  const ncc = median(frames.map((frame) => scoreTemplateAt(frame, plan.alphaMap, plan.rect)));
  return { clean: Math.abs(ncc) < plan.minNcc * RESIDUAL_GATE_SCALE, ncc, frames: frames.length };
}

/** A residual above this fraction of the detection threshold means the mark is still there. */
export const RESIDUAL_GATE_SCALE = 0.6;
