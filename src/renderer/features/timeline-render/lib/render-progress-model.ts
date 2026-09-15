import {
  renderProgressFraction,
  type SequenceRenderProgress,
  type SequenceRenderStage,
} from '@shared';

/**
 * Beta S253 — the export's progress as something a person can read.
 *
 * Pure, and separate from the component, because the part that goes wrong
 * here is arithmetic over time: an estimate that counts upward, a bar that
 * runs backwards, a "2 seconds remaining" that sits there for a minute. None
 * of that is observable in a screenshot, and all of it is observable in a
 * test that feeds a scripted sequence of ticks.
 */

/** What each stage is called in the panel. Ordered as the pipeline runs them. */
export const STAGE_LABELS: Record<SequenceRenderStage, string> = {
  normalize: 'Preparing clips',
  join: 'Joining',
  layers: 'Building overlays',
  composite: 'Compositing',
  effects: 'Applying effects',
  audio: 'Mixing audio',
  mux: 'Finishing',
  // S286 — the delivery conversion (GIF/WebM/APNG/PNG frames after the mux).
  transcode: 'Converting',
};

/**
 * How long an estimate waits before it says anything.
 *
 * The first seconds of an export are the least representative part of it —
 * ffmpeg is starting, the segment cache is being consulted, nothing has
 * settled — and an estimate drawn from them is wrong by multiples. Every
 * serious progress UI suppresses its first estimate for roughly this long;
 * showing "4 hours remaining" for two seconds costs more trust than showing
 * nothing does.
 */
const WARMUP_MS = 5_000;

/** And how much must be done. Dividing by a fraction near zero explodes. */
const MIN_FRACTION = 0.02;

/**
 * The exponential-moving-average weight on each new estimate.
 *
 * Low, because the input is noisy in a *structured* way: stages have
 * genuinely different throughputs, so every stage boundary steps the
 * instantaneous estimate. At 0.2 a boundary bends the displayed figure over
 * several seconds instead of snapping it, which is what stops the number
 * jumping around while still letting it converge well before the end.
 */
const SMOOTHING = 0.2;

/** The estimator's memory: the whole export's projected length, smoothed. */
export interface EtaState {
  totalMs: number | null;
}

export const IDLE_ETA: EtaState = { totalMs: null };

/**
 * Folds one tick into the estimate.
 *
 * `elapsed / fraction` is the whole model — deliberately, rather than a rate
 * measured over a recent window. A windowed rate tracks the *current stage's*
 * speed, which is exactly the thing that is about to change; the cumulative
 * ratio is anchored to everything that has already happened and so is far
 * steadier across the boundaries. It is biased early (the cheap stages front-
 * load a render) and the bias decays as the render proceeds.
 */
export function advanceEta(state: EtaState, fraction: number, elapsedMs: number): EtaState {
  if (elapsedMs < WARMUP_MS || fraction < MIN_FRACTION) return state;
  const projected = elapsedMs / fraction;
  if (!Number.isFinite(projected)) return state;
  return {
    totalMs:
      state.totalMs === null ? projected : state.totalMs + SMOOTHING * (projected - state.totalMs),
  };
}

/** Milliseconds left, or `null` while the estimate is still warming up. */
export function remainingMs(state: EtaState, elapsedMs: number): number | null {
  if (state.totalMs === null) return null;
  return Math.max(0, state.totalMs - elapsedMs);
}

/** `2:14`, or `1:04:22` once an export runs past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The estimate, rounded to a precision it can actually support.
 *
 * "about 4 min", never "3m 47s". The second reads as a promise the estimator
 * cannot keep, and the moment it slips by ten seconds the whole indicator
 * stops being believed. Coarse buckets also stop the text flickering on every
 * tick, which is its own kind of noise.
 */
export function formatRemaining(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 10) return 'a few seconds left';
  if (seconds < 60) return `about ${Math.round(seconds / 10) * 10} sec left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours} hr${rest > 0 ? ` ${rest} min` : ''} left`;
}

export interface RenderProgressView {
  /** 0–100, for the bar's width and `aria-valuenow`. */
  percent: number;
  /** False while the current stage cannot say how far through it is. */
  determinate: boolean;
  stageLabel: string;
  /** 1-based, and 0 when the render predates the plan field. */
  stageIndex: number;
  stageCount: number;
  /** `48/116`, when the stage counts discrete units. */
  stageCounter: string | null;
  detail: string | null;
  elapsedLabel: string;
  remainingLabel: string | null;
  ariaValueText: string;
}

/**
 * The whole panel line, from one progress event and the clocks around it.
 *
 * A render with no `plan` (the pre-S253 event shape) degrades to an
 * indeterminate bar naming its stage, rather than to a wrong percentage.
 */
export function renderProgressView(
  progress: SequenceRenderProgress,
  elapsedMs: number,
  eta: EtaState,
): RenderProgressView {
  const plan = progress.plan ?? [];
  const fraction = renderProgressFraction(progress);
  const stageIndex = plan.indexOf(progress.stage);
  const determinate = plan.length > 0;
  const stageLabel = STAGE_LABELS[progress.stage] ?? progress.stage;
  const percent = Math.round(fraction * 100);
  const left = remainingMs(eta, elapsedMs);

  return {
    percent,
    determinate,
    stageLabel,
    stageIndex: stageIndex < 0 ? 0 : stageIndex + 1,
    stageCount: plan.length,
    // The 0–100 stages are fractions dressed as counts (`join`, `composite`,
    // `mux`); showing "43/100" next to "43%" says the same thing twice.
    stageCounter:
      progress.total > 0 && progress.total !== 100
        ? `${progress.completed}/${progress.total}`
        : null,
    detail: progress.detail ?? null,
    elapsedLabel: formatElapsed(elapsedMs),
    remainingLabel: left === null ? null : formatRemaining(left),
    ariaValueText: determinate
      ? `${percent}%, ${stageLabel}${left === null ? '' : `, ${formatRemaining(left)}`}`
      : `${stageLabel}, in progress`,
  };
}
