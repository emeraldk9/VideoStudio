/**
 * Beta S154 phase 6 — keyframes: one curve, two consumers.
 *
 * `valueAtFrame` is what the preview reads per rAF tick; `toFfmpegExpression`
 * emits the same curve as a piecewise-linear `if(lt(t,…))` ladder for the
 * filters that accept expressions (`overlay x/y` with `eval=frame`, `volume`
 * with `eval=frame`). The second is *defined in terms of* the first's
 * arithmetic, and a test samples both at every frame of a fixture curve —
 * the same discipline that pins `join()`'s length arithmetic to
 * `layoutTrack`'s.
 *
 * **Frames are clip-relative.** A magnetic-track clip has no stored start, so
 * a timeline-absolute keyframe would be a second source of truth for position
 * and would silently desync when an earlier clip resized. Clip-relative
 * survives a move, a reorder and a ripple for free; a head trim and a split
 * re-base explicitly (`shiftKeyframes` / `splitKeyframes`, called by
 * `trimClipEdge` and `splitClipAtFrame`).
 *
 * Phase 6 scope, stated plainly: `x`/`y` (an overlay clip's centre, as
 * fractions of the frame) and `volume` (an audio clip's gain in dB). Opacity
 * and colour keyframes are named follow-ups — ffmpeg has no per-frame alpha
 * expression on `overlay`, and the honest scope is what renders correctly on
 * the first try. Static opacity ships in `effects.transform`.
 */

export const KEYFRAME_PROPERTIES = ['x', 'y', 'volume'] as const;
export type KeyframeProperty = (typeof KEYFRAME_PROPERTIES)[number];

export const KEYFRAME_INTERPOLATIONS = ['linear', 'hold'] as const;
export type KeyframeInterpolation = (typeof KEYFRAME_INTERPOLATIONS)[number];

export interface ClipKeyframe {
  property: KeyframeProperty;
  /** Clip-relative, integer frames at the sequence fps. */
  frame: number;
  /** `x`/`y`: fraction of the frame (0–1). `volume`: dB (−40..40). */
  value: number;
  interpolation: KeyframeInterpolation;
}

/** The property's keys in frame order — every consumer sorts the same way. */
export function keyframesFor(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
): ClipKeyframe[] {
  return (keyframes ?? [])
    .filter((keyframe) => keyframe.property === property)
    .sort((a, b) => a.frame - b.frame);
}

/**
 * The curve's value at a clip-relative frame.
 *
 * Before the first key: the first key's value (a curve does not lurch from
 * the fallback to its first key). After the last: the last key's. Between
 * two: linear, or the earlier key's value under `hold`. No keys at all:
 * `fallback`.
 */
export function valueAtFrame(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  frame: number,
  fallback: number,
): number {
  const keys = keyframesFor(keyframes, property);
  if (keys.length === 0) return fallback;
  if (frame <= keys[0].frame) return keys[0].value;
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return last.value;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const from = keys[index];
    const to = keys[index + 1];
    if (frame < to.frame) {
      if (from.interpolation === 'hold' || to.frame === from.frame) return from.value;
      const progress = (frame - from.frame) / (to.frame - from.frame);
      return from.value + (to.value - from.value) * progress;
    }
  }
  return last.value;
}

export interface ExpressionOptions {
  fps: number;
  fallback: number;
  /**
   * Seconds added to every key time — for graphs whose `t` is *layer* time
   * (the segment was `setpts`-shifted to its absolute offset) rather than the
   * clip's own. The audio graph's `volume` runs before `adelay`, so its `t`
   * is clip-local and this stays 0.
   */
  offsetSeconds?: number;
}

/**
 * The same curve as an ffmpeg expression over `t` (seconds).
 *
 * Shape: a right-folded `if(lt(t,tN),…)` ladder — before the first key the
 * first value, linear (or held) between keys, the last value after. Times are
 * fixed to 4 decimals; values to 6 — both well inside a frame/quantum at any
 * supported fps.
 */
export function toFfmpegExpression(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  options: ExpressionOptions,
): string {
  const keys = keyframesFor(keyframes, property);
  if (keys.length === 0) return options.fallback.toFixed(6);
  const offset = options.offsetSeconds ?? 0;
  const time = (frame: number): string => (frame / options.fps + offset).toFixed(4);
  const value = (input: number): string => input.toFixed(6);

  if (keys.length === 1) return value(keys[0].value);

  // Fold from the far end: expr = if(lt(t,t1), seg0, if(lt(t,t2), seg1, vLast))
  let expression = value(keys[keys.length - 1].value);
  for (let index = keys.length - 2; index >= 0; index -= 1) {
    const from = keys[index];
    const to = keys[index + 1];
    const segment =
      from.interpolation === 'hold' || to.frame === from.frame
        ? value(from.value)
        : `${value(from.value)}+(${value(to.value)}-${value(from.value)})*(t-${time(from.frame)})/(${time(to.frame)}-${time(from.frame)})`;
    expression = `if(lt(t,${time(to.frame)}),${segment},${expression})`;
  }
  // Before the first key: its value, not the interpolation into it.
  return `if(lt(t,${time(keys[0].frame)}),${value(keys[0].value)},${expression})`;
}

/**
 * Head-trim companion: shifts every keyframe earlier by `deltaFrames`,
 * dropping any that land before 0 — the trimmed-away part of the curve is
 * gone with the media it annotated. `trimClipEdge` calls this so the two
 * cannot drift (S154 trap 15).
 */
export function shiftKeyframes(
  keyframes: readonly ClipKeyframe[] | undefined,
  deltaFrames: number,
): ClipKeyframe[] | undefined {
  if (!keyframes || keyframes.length === 0 || deltaFrames === 0) {
    return keyframes ? [...keyframes] : undefined;
  }
  const shifted = keyframes
    .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - deltaFrames }))
    .filter((keyframe) => keyframe.frame >= 0);
  return shifted;
}

/**
 * Split companion: the first half keeps keys before the cut; the second
 * half's keys re-base to its new zero. Keys exactly at the cut go to the
 * second half (they describe what plays from the cut onward).
 */
export function splitKeyframes(
  keyframes: readonly ClipKeyframe[] | undefined,
  offsetFrames: number,
): { first: ClipKeyframe[] | undefined; second: ClipKeyframe[] | undefined } {
  if (!keyframes || keyframes.length === 0) return { first: undefined, second: undefined };
  const first = keyframes.filter((keyframe) => keyframe.frame < offsetFrames);
  const second = keyframes
    .filter((keyframe) => keyframe.frame >= offsetFrames)
    .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - offsetFrames }));
  return {
    first: first.length > 0 ? first : undefined,
    second: second.length > 0 ? second : undefined,
  };
}
