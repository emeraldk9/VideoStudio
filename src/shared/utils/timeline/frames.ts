import { DEFAULT_SEQUENCE_FPS } from '../../types/sequence';

/**
 * Beta S145 — the two sanctioned crossings between frames and seconds.
 *
 * The document stores integer frames at the sequence's fps and nothing else.
 * Seconds exist at exactly two boundaries: what the UI shows a human, and what
 * ffmpeg is handed. Every other calculation stays in frames, which is what
 * makes 60 consecutive durations sum exactly rather than to within 0.02s.
 *
 * Both directions clamp rather than throw. A malformed fps reaching here means
 * a stored row is wrong, and refusing to lay out the timeline at all would
 * turn a bad number into an unopenable document.
 */

/** Sanity bounds. Below 1 the maths divides by ~0; above 120 nothing this app produces is real. */
const MIN_FPS = 1;
const MAX_FPS = 120;

export function normalizeFps(fps: number): number {
  if (!Number.isFinite(fps)) return DEFAULT_SEQUENCE_FPS;
  return Math.min(Math.max(Math.round(fps), MIN_FPS), MAX_FPS);
}

/**
 * Seconds → frames, rounded to the nearest whole frame.
 *
 * Rounding rather than flooring: a 3.5s still at 24fps is 84 frames, and
 * flooring would quietly shorten every duration a user types by up to a frame.
 */
export function secondsToFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(0, Math.round(seconds * normalizeFps(fps)));
}

export function framesToSeconds(frames: number, fps: number): number {
  if (!Number.isFinite(frames) || frames <= 0) return 0;
  return frames / normalizeFps(fps);
}

/** The ffmpeg boundary. Three decimals is what `video-editor.ts` already emits. */
export function framesToFfmpegSeconds(frames: number, fps: number): string {
  return framesToSeconds(frames, fps).toFixed(3);
}

/**
 * `M:SS` for the ruler and transport, or `H:MM:SS` past an hour.
 *
 * Deliberately not SMPTE `HH:MM:SS:FF` — frames-in-the-timecode is a
 * professional convention that would read as noise on a module whose whole
 * premise is a simple storyteller cut. The inspector shows a frame count where
 * frame precision actually matters.
 */
export function formatTimecode(frames: number, fps: number): string {
  const total = Math.max(0, Math.round(framesToSeconds(frames, fps)));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** `3.5s` / `12.0s` — the duration chip's format, always one decimal so the width does not jump. */
export function formatDurationSeconds(frames: number, fps: number): string {
  return `${framesToSeconds(frames, fps).toFixed(1)}s`;
}
