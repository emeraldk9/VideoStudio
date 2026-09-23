/**
 * S22 — Pure mathematical operations for audio clip gain rubberbanding,
 * fade-in / fade-out drag handles, and decibel coordinate mapping.
 */

export const MIN_GAIN_DB = -40;
export const MAX_GAIN_DB = 20;
export const UNITY_GAIN_DB = 0;

/**
 * Clamp audio gain in decibels to safe standard NLE ranges [-40 dB, +20 dB].
 */
export function clampGainDb(gainDb: number): number {
  if (Number.isNaN(gainDb)) return UNITY_GAIN_DB;
  const clamped = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
  return Math.round(clamped * 10) / 10;
}

/**
 * Converts a gain in decibels into a normalized vertical coordinate (0.0 to 1.0),
 * where 0.0 represents the bottom of the clip (-40 dB / silence) and 1.0 represents
 * the top of the clip (+20 dB).
 *
 * 0 dB (unity gain) is positioned at exactly 0.60 (60% from bottom), leaving
 * 60% of the clip height for attenuation (-40 dB to 0 dB) and 40% for boost (0 dB to +20 dB).
 */
export function gainDbToNormalized(gainDb: number): number {
  const clamped = clampGainDb(gainDb);
  if (clamped <= 0) {
    // -40 dB -> 0.0, 0 dB -> 0.6
    const fraction = (clamped - MIN_GAIN_DB) / (0 - MIN_GAIN_DB);
    return Math.max(0, Math.min(0.6, fraction * 0.6));
  } else {
    // 0 dB -> 0.6, +20 dB -> 1.0
    const fraction = clamped / MAX_GAIN_DB;
    return Math.max(0.6, Math.min(1.0, 0.6 + fraction * 0.4));
  }
}

/**
 * Converts a normalized vertical position (0.0 to 1.0 from bottom) back into gain in decibels.
 */
export function normalizedToGainDb(normalized: number): number {
  const clampedNorm = Math.max(0, Math.min(1, normalized));
  if (clampedNorm <= 0.6) {
    const fraction = clampedNorm / 0.6;
    const db = MIN_GAIN_DB + fraction * (0 - MIN_GAIN_DB);
    return Math.round(db * 10) / 10;
  } else {
    const fraction = (clampedNorm - 0.6) / 0.4;
    const db = fraction * MAX_GAIN_DB;
    return Math.round(db * 10) / 10;
  }
}

/**
 * Calculates new fade frame duration based on horizontal drag offset.
 *
 * @param initialFrames Starting fade duration in frames
 * @param deltaPx Horizontal pointer movement in pixels
 * @param pxPerFrame Timeline zoom scale
 * @param maxFrames Maximum allowable fade frames (e.g. clip duration or half duration)
 * @param direction 1 if dragging right increases fade (head), -1 if dragging left increases fade (tail)
 */
export function calculateFadeFrames(
  initialFrames: number,
  deltaPx: number,
  pxPerFrame: number,
  maxFrames: number,
  direction: 1 | -1 = 1
): number {
  if (pxPerFrame <= 0) return initialFrames;
  const frameDelta = (deltaPx * direction) / pxPerFrame;
  const target = Math.round(initialFrames + frameDelta);
  return Math.max(0, Math.min(Math.round(maxFrames), target));
}

/**
 * Increment or decrement clip gain by a delta in decibels, respecting bounds.
 */
export function stepGainDb(currentGainDb: number, deltaDb: number): number {
  return clampGainDb((currentGainDb ?? 0) + deltaDb);
}

/**
 * Formats a gain value for display in tooltips and badges.
 * Examples: "+3.0 dB", "0.0 dB", "-6.5 dB", "-∞ dB"
 */
export function formatGainDb(gainDb: number): string {
  const clamped = clampGainDb(gainDb);
  if (clamped <= MIN_GAIN_DB) return '-∞ dB';
  const prefix = clamped > 0 ? '+' : '';
  return `${prefix}${clamped.toFixed(1)} dB`;
}
