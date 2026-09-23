/**
 * In/Out Work Area and Loop Playback Operations.
 *
 * Implements NLE industry-standard In/Out point bounding, work-area duration
 * calculation, boundary clamping, and seamless loop playback wrapping.
 */

export interface WorkAreaRange {
  inPointFrame: number | null;
  outPointFrame: number | null;
}

export interface EffectiveWorkArea {
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  isCustom: boolean;
}

/**
 * Computes the effective start and end frames for playback, looping, or work-area export.
 * If inPointFrame is specified, it clamps to [0, sequenceDuration].
 * If outPointFrame is specified, it clamps to [startFrame, sequenceDuration].
 * If both are null, it spans [0, sequenceDuration].
 */
export function computeEffectiveWorkArea(
  range: WorkAreaRange,
  sequenceDurationFrames: number,
): EffectiveWorkArea {
  const maxDuration = Math.max(0, sequenceDurationFrames);
  const isCustom = range.inPointFrame !== null || range.outPointFrame !== null;

  let startFrame = 0;
  if (range.inPointFrame !== null) {
    startFrame = Math.max(0, Math.min(Math.round(range.inPointFrame), maxDuration));
  }

  let endFrame = maxDuration;
  if (range.outPointFrame !== null) {
    endFrame = Math.max(startFrame, Math.min(Math.round(range.outPointFrame), maxDuration));
  }

  return {
    startFrame,
    endFrame,
    durationFrames: Math.max(0, endFrame - startFrame),
    isCustom,
  };
}

/**
 * Validates and adjusts an In Point when setting it.
 * If proposed In is >= existing Out, Out is reset to null.
 */
export function clampInPoint(
  frame: number | null,
  currentOut: number | null,
  sequenceDurationFrames: number,
): { inPointFrame: number | null; outPointFrame: number | null } {
  if (frame === null) {
    return { inPointFrame: null, outPointFrame: currentOut };
  }
  const maxFrames = Math.max(0, sequenceDurationFrames);
  const clamped = Math.max(0, Math.min(Math.round(frame), maxFrames));
  const nextOut = currentOut !== null && clamped >= currentOut ? null : currentOut;
  return { inPointFrame: clamped, outPointFrame: nextOut };
}

/**
 * Validates and adjusts an Out Point when setting it.
 * If proposed Out is <= existing In, In is reset to null.
 */
export function clampOutPoint(
  frame: number | null,
  currentIn: number | null,
  sequenceDurationFrames: number,
): { inPointFrame: number | null; outPointFrame: number | null } {
  if (frame === null) {
    return { inPointFrame: currentIn, outPointFrame: null };
  }
  const maxFrames = Math.max(0, sequenceDurationFrames);
  const clamped = Math.max(0, Math.min(Math.round(frame), maxFrames));
  const nextIn = currentIn !== null && clamped <= currentIn ? null : currentIn;
  return { inPointFrame: nextIn, outPointFrame: clamped };
}

/**
 * Calculates the next frame during playback when considering loop mode and In/Out points.
 * Returns the frame, or null if playback should terminate (when not looping and reached boundary).
 */
export function stepLoopPlayback(
  currentFrame: number,
  playbackRate: number,
  workArea: EffectiveWorkArea,
  looping: boolean,
): { nextFrame: number; shouldStop: boolean } {
  const { startFrame, endFrame } = workArea;
  if (endFrame <= startFrame) {
    return { nextFrame: startFrame, shouldStop: true };
  }

  if (playbackRate > 0) {
    if (currentFrame >= endFrame) {
      if (looping) {
        return { nextFrame: startFrame, shouldStop: false };
      }
      return { nextFrame: endFrame, shouldStop: true };
    }
  } else if (playbackRate < 0) {
    if (currentFrame <= startFrame) {
      if (looping) {
        return { nextFrame: endFrame, shouldStop: false };
      }
      return { nextFrame: startFrame, shouldStop: true };
    }
  }

  return { nextFrame: currentFrame, shouldStop: false };
}
