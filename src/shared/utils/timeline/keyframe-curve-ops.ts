/**
 * Beta S154 Phase 6 / S32 — Keyframe Bezier Curve & Easing Engine.
 *
 * Provides high-precision cubic Bézier curve evaluation, monotonic time
 * parameter solving via Newton-Raphson with bisection fallback, tangent handle
 * preset generation (Linear, Ease-In, Ease-Out, Smooth Bezier, Hold), and
 * velocity curve sampling for visual graph editing and preview playback.
 */

import {
  type BezierTangentHandle,
  type ClipKeyframe,
  type KeyframeInterpolation,
  type KeyframeProperty,
  keyframesFor,
} from './keyframes';

export interface CurveControlPoints {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
}

/**
 * Evaluates 1D Cubic Bézier position for parameter t in [0, 1].
 * B(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
 */
export function evaluateCubicBezier1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const clampedT = Math.max(0, Math.min(1, t));
  const oneMinusT = 1 - clampedT;
  const oneMinusTSq = oneMinusT * oneMinusT;
  const tSq = clampedT * clampedT;

  return (
    oneMinusTSq * oneMinusT * p0 +
    3 * oneMinusTSq * clampedT * p1 +
    3 * oneMinusT * tSq * p2 +
    tSq * clampedT * p3
  );
}

/**
 * Evaluates 1D Cubic Bézier first derivative dB/dt for parameter t in [0, 1].
 * B'(t) = 3(1-t)^2 * (P1 - P0) + 6(1-t)*t * (P2 - P1) + 3*t^2 * (P3 - P2)
 */
export function evaluateCubicBezierDerivative1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const clampedT = Math.max(0, Math.min(1, t));
  const oneMinusT = 1 - clampedT;

  return (
    3 * oneMinusT * oneMinusT * (p1 - p0) +
    6 * oneMinusT * clampedT * (p2 - p1) +
    3 * clampedT * clampedT * (p3 - p2)
  );
}

/**
 * Inverts the time Bézier equation X(t) = targetX using Newton-Raphson
 * root finding with bracketed bisection fallback to ensure robust convergence.
 */
export function solveBezierTForX(
  targetX: number,
  x0: number,
  x1: number,
  x2: number,
  x3: number,
  maxIterations = 12,
  epsilon = 1e-6,
): number {
  const span = x3 - x0;
  if (Math.abs(span) < 1e-9) return 0;
  if (targetX <= x0) return 0;
  if (targetX >= x3) return 1;

  // Clamped control points ensure monotonic X(t) progression
  const clampedX1 = Math.max(x0, Math.min(x3, x1));
  const clampedX2 = Math.max(x0, Math.min(x3, x2));

  // Initial guess using linear proportion
  let t = (targetX - x0) / span;
  let lowerBound = 0;
  let upperBound = 1;

  for (let i = 0; i < maxIterations; i++) {
    const currentX = evaluateCubicBezier1D(x0, clampedX1, clampedX2, x3, t);
    const error = currentX - targetX;

    if (Math.abs(error) < epsilon) {
      return t;
    }

    // Update bracket bounds
    if (error > 0) {
      upperBound = t;
    } else {
      lowerBound = t;
    }

    const derivative = evaluateCubicBezierDerivative1D(x0, clampedX1, clampedX2, x3, t);

    // If derivative is too small or Newton step leaves bracket, fall back to bisection
    if (Math.abs(derivative) > 1e-6) {
      const nextT = t - error / derivative;
      if (nextT > lowerBound && nextT < upperBound) {
        t = nextT;
        continue;
      }
    }

    // Bisection step
    t = 0.5 * (lowerBound + upperBound);
  }

  return t;
}

/**
 * Returns the effective 2D control points for an adjacent pair of keyframes.
 */
export function getKeyframeControlPoints(from: ClipKeyframe, to: ClipKeyframe): CurveControlPoints {
  const deltaFrames = Math.max(1, to.frame - from.frame);
  const deltaValue = to.value - from.value;

  const x0 = from.frame;
  const y0 = from.value;
  const x3 = to.frame;
  const y3 = to.value;

  // Derive control points based on handles or preset interpolation
  let x1 = x0;
  let y1 = y0;
  let x2 = x3;
  let y2 = y3;

  if (from.interpolation === 'linear' || from.interpolation === 'hold') {
    x1 = x0 + deltaFrames / 3;
    y1 = y0 + deltaValue / 3;
    x2 = x3 - deltaFrames / 3;
    y2 = y3 - deltaValue / 3;
  } else if (from.interpolation === 'ease_in') {
    // Flat departure, accelerates into destination
    x1 = x0 + deltaFrames * 0.42;
    y1 = y0;
    x2 = x3;
    y2 = y3;
  } else if (from.interpolation === 'ease_out') {
    // Fast departure, decelerates into destination flat
    x1 = x0;
    y1 = y0;
    x2 = x3 - deltaFrames * 0.58;
    y2 = y3;
  } else if (from.interpolation === 'bezier') {
    if (from.handleOut) {
      x1 = x0 + from.handleOut.frameOffset;
      y1 = y0 + from.handleOut.valueOffset;
    } else {
      // Default smooth ease-in-out S-curve
      x1 = x0 + deltaFrames * 0.33;
      y1 = y0;
    }

    if (to.handleIn) {
      x2 = x3 + to.handleIn.frameOffset;
      y2 = y3 + to.handleIn.valueOffset;
    } else {
      x2 = x3 - deltaFrames * 0.33;
      y2 = y3;
    }
  }

  // Ensure handles do not cross time boundaries
  x1 = Math.max(x0, Math.min(x3, x1));
  x2 = Math.max(x0, Math.min(x3, x2));

  return { x0, y0, x1, y1, x2, y2, x3, y3 };
}

/**
 * Generates preset tangent handles for an interpolation mode over a span.
 */
export function generatePresetHandles(
  interpolation: KeyframeInterpolation,
  deltaFrames: number,
  deltaValue: number,
): { handleOut: BezierTangentHandle; handleIn: BezierTangentHandle } {
  const spanF = Math.max(1, Math.abs(deltaFrames));

  switch (interpolation) {
    case 'linear':
      return {
        handleOut: { frameOffset: spanF * 0.333, valueOffset: deltaValue * 0.333 },
        handleIn: { frameOffset: -spanF * 0.333, valueOffset: -deltaValue * 0.333 },
      };
    case 'ease_in':
      return {
        handleOut: { frameOffset: spanF * 0.42, valueOffset: 0 },
        handleIn: { frameOffset: 0, valueOffset: 0 },
      };
    case 'ease_out':
      return {
        handleOut: { frameOffset: 0, valueOffset: 0 },
        handleIn: { frameOffset: -spanF * 0.58, valueOffset: 0 },
      };
    case 'bezier':
      return {
        handleOut: { frameOffset: spanF * 0.35, valueOffset: 0 },
        handleIn: { frameOffset: -spanF * 0.35, valueOffset: 0 },
      };
    case 'hold':
    default:
      return {
        handleOut: { frameOffset: 0, valueOffset: 0 },
        handleIn: { frameOffset: 0, valueOffset: 0 },
      };
  }
}

/**
 * Interpolates value at `frame` between two keyframes according to `from.interpolation`.
 */
export function interpolateKeyframePair(
  from: ClipKeyframe,
  to: ClipKeyframe,
  frame: number,
): number {
  if (frame <= from.frame) return from.value;
  if (frame >= to.frame) return to.value;
  if (to.frame === from.frame) return from.value;

  if (from.interpolation === 'hold') {
    return from.value;
  }

  if (from.interpolation === 'linear') {
    const progress = (frame - from.frame) / (to.frame - from.frame);
    return from.value + (to.value - from.value) * progress;
  }

  const cp = getKeyframeControlPoints(from, to);
  const t = solveBezierTForX(frame, cp.x0, cp.x1, cp.x2, cp.x3);
  return evaluateCubicBezier1D(cp.y0, cp.y1, cp.y2, cp.y3, t);
}

/**
 * Calculates instantaneous velocity (rate of change in value per second or frame)
 * at the given frame between two keyframes.
 */
export function getVelocityAtFrame(
  from: ClipKeyframe,
  to: ClipKeyframe,
  frame: number,
  fps = 30,
): number {
  if (from.interpolation === 'hold' || to.frame === from.frame) {
    return 0;
  }

  if (from.interpolation === 'linear') {
    const deltaV = to.value - from.value;
    const deltaF = to.frame - from.frame;
    return (deltaV / deltaF) * fps;
  }

  const cp = getKeyframeControlPoints(from, to);
  const t = solveBezierTForX(frame, cp.x0, cp.x1, cp.x2, cp.x3);

  const dxDt = evaluateCubicBezierDerivative1D(cp.x0, cp.x1, cp.x2, cp.x3, t);
  const dyDt = evaluateCubicBezierDerivative1D(cp.y0, cp.y1, cp.y2, cp.y3, t);

  if (Math.abs(dxDt) < 1e-6) return 0;
  // dy/dx = (dy/dt) / (dx/dt) [units per frame], multiplied by fps for units per second
  return (dyDt / dxDt) * fps;
}

/**
 * Samples a continuous curve between startFrame and endFrame into discrete points
 * for SVG rendering or velocity profiling.
 */
export function sampleCurvePoints(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  startFrame: number,
  endFrame: number,
  step = 1,
  fps = 30,
): Array<{ frame: number; value: number; velocity: number }> {
  const keys = keyframesFor(keyframes, property);
  const points: Array<{ frame: number; value: number; velocity: number }> = [];

  if (keys.length === 0) {
    return points;
  }

  const safeStep = Math.max(1, step);

  for (let f = startFrame; f <= endFrame; f += safeStep) {
    let val = keys[0].value;
    let vel = 0;

    if (f <= keys[0].frame) {
      val = keys[0].value;
      vel = 0;
    } else if (f >= keys[keys.length - 1].frame) {
      val = keys[keys.length - 1].value;
      vel = 0;
    } else {
      for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (f >= k1.frame && f <= k2.frame) {
          val = interpolateKeyframePair(k1, k2, f);
          vel = getVelocityAtFrame(k1, k2, f, fps);
          break;
        }
      }
    }

    points.push({ frame: f, value: val, velocity: vel });
  }

  return points;
}

export interface KeyframePropertyConfig {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const KEYFRAME_PROPERTY_CONFIGS: Record<KeyframeProperty, KeyframePropertyConfig> = {
  volume: { label: 'Volume (Gain)', unit: 'dB', min: -40, max: 12, step: 0.5, defaultValue: 0 },
  opacity: { label: 'Opacity', unit: '%', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  scale: { label: 'Scale', unit: 'x', min: 0.1, max: 3.0, step: 0.05, defaultValue: 1 },
  rotation: { label: 'Rotation', unit: '°', min: -180, max: 180, step: 1, defaultValue: 0 },
  x: { label: 'Position X', unit: '%', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  y: { label: 'Position Y', unit: '%', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
};

/**
 * Normalizes a keyframe property value to [0, 1] for timeline canvas mapping.
 */
export function normalizeKeyframeValue(property: KeyframeProperty, value: number): number {
  const config = KEYFRAME_PROPERTY_CONFIGS[property] ?? { min: 0, max: 1 };
  const range = config.max - config.min;
  if (range <= 0) return 0.5;
  const clamped = Math.max(config.min, Math.min(config.max, value));
  return (clamped - config.min) / range;
}

/**
 * Denormalizes a [0, 1] relative canvas coordinate back to native property value.
 */
export function denormalizeKeyframeValue(property: KeyframeProperty, normalized: number): number {
  const config = KEYFRAME_PROPERTY_CONFIGS[property] ?? { min: 0, max: 1, step: 0.01 };
  const range = config.max - config.min;
  const clamped = Math.max(0, Math.min(1, normalized));
  const raw = config.min + clamped * range;
  const step = config.step || 0.01;
  const rounded = Math.round(raw / step) * step;
  return Number(Math.max(config.min, Math.min(config.max, rounded)).toFixed(4));
}

/**
 * Formats a keyframe value for timeline display.
 */
export function formatKeyframeValue(property: KeyframeProperty, value: number): string {
  switch (property) {
    case 'volume':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
    case 'scale':
      return `${value.toFixed(2)}x`;
    case 'rotation':
      return `${Math.round(value)}°`;
    case 'opacity':
    case 'x':
    case 'y':
    default:
      return `${Math.round(value * 100)}%`;
  }
}

/**
 * Updates a keyframe's tangent handle offsets, optionally keeping opposing handles symmetric.
 */
export function updateKeyframeTangent(
  keyframe: ClipKeyframe,
  handleType: 'in' | 'out',
  frameOffset: number,
  valueOffset: number,
  symmetric = true,
): ClipKeyframe {
  const updated: ClipKeyframe = {
    ...keyframe,
    interpolation: 'bezier',
  };

  if (handleType === 'out') {
    // Out handle points forward (+frameOffset)
    const clampedF = Math.max(0, frameOffset);
    updated.handleOut = { frameOffset: clampedF, valueOffset };
    if (symmetric) {
      updated.handleIn = { frameOffset: -clampedF, valueOffset: -valueOffset };
    }
  } else {
    // In handle points backward (-frameOffset)
    const clampedF = Math.min(0, frameOffset);
    updated.handleIn = { frameOffset: clampedF, valueOffset };
    if (symmetric) {
      updated.handleOut = { frameOffset: -clampedF, valueOffset: -valueOffset };
    }
  }

  return updated;
}

/**
 * Inserts or updates a keyframe at `frame` with interpolation continuity.
 */
export function insertKeyframeAtFrame(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  frame: number,
  fallback: number,
  interpolation: KeyframeInterpolation = 'bezier',
): ClipKeyframe[] {
  const currentKeys = keyframes ?? [];
  const existingIdx = currentKeys.findIndex((k) => k.property === property && k.frame === frame);

  // Sample current curve value at this frame for continuity
  let value = fallback;
  const propKeys = keyframesFor(currentKeys, property);
  if (propKeys.length > 0) {
    if (frame <= propKeys[0].frame) {
      value = propKeys[0].value;
    } else if (frame >= propKeys[propKeys.length - 1].frame) {
      value = propKeys[propKeys.length - 1].value;
    } else {
      for (let i = 0; i < propKeys.length - 1; i++) {
        if (frame >= propKeys[i].frame && frame <= propKeys[i + 1].frame) {
          value = interpolateKeyframePair(propKeys[i], propKeys[i + 1], frame);
          break;
        }
      }
    }
  }

  const newKey: ClipKeyframe = {
    property,
    frame: Math.round(frame),
    value: Number(value.toFixed(4)),
    interpolation,
  };

  if (existingIdx >= 0) {
    const next = [...currentKeys];
    next[existingIdx] = { ...next[existingIdx], value: newKey.value, interpolation };
    return next;
  }

  return [...currentKeys, newKey].sort((a, b) => {
    if (a.property !== b.property) return a.property.localeCompare(b.property);
    return a.frame - b.frame;
  });
}

/**
 * Deletes a keyframe matching `property` and `frame`.
 */
export function deleteKeyframeAtFrame(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  frame: number,
): ClipKeyframe[] {
  return (keyframes ?? []).filter((k) => !(k.property === property && k.frame === frame));
}

/**
 * Generates an SVG path string `d="M ... C ..."` for rendering continuous keyframe curves.
 */
export function buildSvgKeyframePath(
  keyframes: readonly ClipKeyframe[] | undefined,
  property: KeyframeProperty,
  durationFrames: number,
  widthPx: number,
  heightPx: number,
  fallback: number,
  paddingY = 6,
): string {
  const usableHeight = Math.max(10, heightPx - paddingY * 2);
  const totalFrames = Math.max(1, durationFrames);

  const frameToX = (f: number) => (Math.max(0, Math.min(totalFrames, f)) / totalFrames) * widthPx;
  const valueToY = (v: number) => {
    const norm = normalizeKeyframeValue(property, v);
    // Invert for SVG screen coordinates: 1 (max) is at top (paddingY), 0 is at bottom (heightPx - paddingY)
    return heightPx - paddingY - norm * usableHeight;
  };

  const keys = keyframesFor(keyframes, property);

  if (keys.length === 0) {
    const y = valueToY(fallback);
    return `M 0 ${y.toFixed(1)} L ${widthPx.toFixed(1)} ${y.toFixed(1)}`;
  }

  const pathParts: string[] = [];

  // 1. Lead-in from frame 0 to first keyframe
  const firstKey = keys[0];
  const firstX = frameToX(firstKey.frame);
  const firstY = valueToY(firstKey.value);
  pathParts.push(`M 0 ${firstY.toFixed(1)}`);
  if (firstX > 0) {
    pathParts.push(`L ${firstX.toFixed(1)} ${firstY.toFixed(1)}`);
  }

  // 2. Curve segments between keyframes
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];

    const xEnd = frameToX(k2.frame);
    const yEnd = valueToY(k2.value);

    if (k1.interpolation === 'hold') {
      // Hold: horizontal step then instant vertical jump
      pathParts.push(`L ${xEnd.toFixed(1)} ${valueToY(k1.value).toFixed(1)}`);
      pathParts.push(`L ${xEnd.toFixed(1)} ${yEnd.toFixed(1)}`);
    } else if (k1.interpolation === 'linear') {
      pathParts.push(`L ${xEnd.toFixed(1)} ${yEnd.toFixed(1)}`);
    } else {
      // Bezier / ease curve: evaluate control points
      const cp = getKeyframeControlPoints(k1, k2);
      const cp1X = frameToX(cp.x1);
      const cp1Y = valueToY(cp.y1);
      const cp2X = frameToX(cp.x2);
      const cp2Y = valueToY(cp.y2);
      pathParts.push(`C ${cp1X.toFixed(1)} ${cp1Y.toFixed(1)}, ${cp2X.toFixed(1)} ${cp2Y.toFixed(1)}, ${xEnd.toFixed(1)} ${yEnd.toFixed(1)}`);
    }
  }

  // 3. Lead-out from last keyframe to durationFrames
  const lastKey = keys[keys.length - 1];
  const lastX = frameToX(lastKey.frame);
  const lastY = valueToY(lastKey.value);
  if (lastX < widthPx) {
    pathParts.push(`L ${widthPx.toFixed(1)} ${lastY.toFixed(1)}`);
  }

  return pathParts.join(' ');
}
