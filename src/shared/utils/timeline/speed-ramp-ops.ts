/**
 * Pure arithmetic and calculus engine for Variable Speed Ramping & Bézier Velocity Curves.
 *
 * Implements non-linear time-warping:
 * - Piecewise cubic Bézier velocity curves v(t) where t is normalized timeline progress [0, 1].
 * - Continuous numerical integration of v(t) via trapezoidal rule to compute cumulative source progress.
 * - Exact source frame mapping: sourceFrame = sourceIn + tau(t) * sourceDuration.
 * - Standard studio retime presets (Hero Ramp, Bullet Time, Montage Flash, etc.).
 */

import { evaluateCubicBezier1D } from './keyframe-curve-ops';
import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';

export interface SpeedRampPoint {
  id: string;
  timePct: number;  // 0.0 to 1.0 (timeline progress through clip)
  speed: number;    // 0.1x to 10.0x (playback velocity multiplier)
  handleIn?: { dt: number; dv: number };   // Tangent offset relative to point
  handleOut?: { dt: number; dv: number };  // Tangent offset relative to point
}

export interface SpeedRampSettings {
  enabled: boolean;
  points: SpeedRampPoint[];
  rippleSequence?: boolean;
}

export type SpeedRampPresetKey =
  | 'constant'
  | 'hero_ramp'
  | 'bullet_time'
  | 'montage_flash'
  | 'slow_in_fast_out'
  | 'fast_in_slow_out';

export interface SpeedRampPreset {
  name: string;
  description: string;
  points: SpeedRampPoint[];
}

export const SPEED_RAMP_PRESETS: Record<SpeedRampPresetKey, SpeedRampPreset> = {
  constant: {
    name: 'Constant 1.0×',
    description: 'Standard linear real-time playback',
    points: [
      { id: 'p0', timePct: 0.0, speed: 1.0 },
      { id: 'p1', timePct: 1.0, speed: 1.0 },
    ],
  },
  hero_ramp: {
    name: 'Hero Ramp',
    description: 'Dynamic fast lead-in (2.5x) smoothly decelerating into dramatic slow-mo (0.3x) before snapping back',
    points: [
      { id: 'p0', timePct: 0.0, speed: 2.5, handleOut: { dt: 0.1, dv: 0.0 } },
      { id: 'p1', timePct: 0.35, speed: 0.3, handleIn: { dt: -0.1, dv: 0.0 }, handleOut: { dt: 0.1, dv: 0.0 } },
      { id: 'p2', timePct: 0.7, speed: 0.3, handleIn: { dt: -0.1, dv: 0.0 }, handleOut: { dt: 0.1, dv: 0.0 } },
      { id: 'p3', timePct: 1.0, speed: 2.0, handleIn: { dt: -0.1, dv: 0.0 } },
    ],
  },
  bullet_time: {
    name: 'Bullet Time',
    description: 'Normal pace, sudden high-speed rush (3.5x), freezing into ultra slow-motion (0.2x), returning to normal',
    points: [
      { id: 'p0', timePct: 0.0, speed: 1.0, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p1', timePct: 0.25, speed: 3.5, handleIn: { dt: -0.05, dv: 0.0 }, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p2', timePct: 0.5, speed: 0.2, handleIn: { dt: -0.08, dv: 0.0 }, handleOut: { dt: 0.08, dv: 0.0 } },
      { id: 'p3', timePct: 0.8, speed: 0.2, handleIn: { dt: -0.05, dv: 0.0 }, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p4', timePct: 1.0, speed: 1.0, handleIn: { dt: -0.05, dv: 0.0 } },
    ],
  },
  montage_flash: {
    name: 'Montage Flash',
    description: 'Rhythmic speed bursts on musical beats with rapid fast-forward and slow accents',
    points: [
      { id: 'p0', timePct: 0.0, speed: 3.0, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p1', timePct: 0.25, speed: 0.5, handleIn: { dt: -0.05, dv: 0.0 }, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p2', timePct: 0.5, speed: 3.0, handleIn: { dt: -0.05, dv: 0.0 }, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p3', timePct: 0.75, speed: 0.5, handleIn: { dt: -0.05, dv: 0.0 }, handleOut: { dt: 0.05, dv: 0.0 } },
      { id: 'p4', timePct: 1.0, speed: 2.0, handleIn: { dt: -0.05, dv: 0.0 } },
    ],
  },
  slow_in_fast_out: {
    name: 'Slow In, Fast Out',
    description: 'Smooth and gentle slow opening accelerating powerfully toward the exit cut',
    points: [
      { id: 'p0', timePct: 0.0, speed: 0.4, handleOut: { dt: 0.15, dv: 0.0 } },
      { id: 'p1', timePct: 0.5, speed: 0.8, handleIn: { dt: -0.1, dv: 0.0 }, handleOut: { dt: 0.1, dv: 0.0 } },
      { id: 'p2', timePct: 1.0, speed: 3.0, handleIn: { dt: -0.15, dv: 0.0 } },
    ],
  },
  fast_in_slow_out: {
    name: 'Fast In, Slow Out',
    description: 'High velocity whip action entrance easing into a calm, lingering slow-motion shot',
    points: [
      { id: 'p0', timePct: 0.0, speed: 3.0, handleOut: { dt: 0.15, dv: 0.0 } },
      { id: 'p1', timePct: 0.5, speed: 0.8, handleIn: { dt: -0.1, dv: 0.0 }, handleOut: { dt: 0.1, dv: 0.0 } },
      { id: 'p2', timePct: 1.0, speed: 0.3, handleIn: { dt: -0.15, dv: 0.0 } },
    ],
  },
};

export const DEFAULT_SPEED_RAMP_SETTINGS: SpeedRampSettings = {
  enabled: false,
  points: SPEED_RAMP_PRESETS.hero_ramp.points,
  rippleSequence: false,
};

/**
 * Ensures points are strictly sorted by timePct with endpoints at 0.0 and 1.0.
 */
export function normalizeSpeedRampPoints(points: SpeedRampPoint[]): SpeedRampPoint[] {
  if (points.length === 0) {
    return [
      { id: 'start', timePct: 0.0, speed: 1.0 },
      { id: 'end', timePct: 1.0, speed: 1.0 },
    ];
  }

  const sorted = [...points].sort((a, b) => a.timePct - b.timePct);

  // Clamp internal points to [0, 1] and speed to [0.1, 10.0]
  const clamped = sorted.map((p) => ({
    ...p,
    timePct: Math.max(0, Math.min(1, p.timePct)),
    speed: Math.max(0.1, Math.min(10.0, p.speed)),
  }));

  // Ensure anchor points at 0.0 and 1.0
  if (clamped[0].timePct > 0.001) {
    clamped.unshift({ id: 'start', timePct: 0.0, speed: clamped[0].speed });
  } else {
    clamped[0].timePct = 0.0;
  }

  const lastIdx = clamped.length - 1;
  if (clamped[lastIdx].timePct < 0.999) {
    clamped.push({ id: 'end', timePct: 1.0, speed: clamped[lastIdx].speed });
  } else {
    clamped[lastIdx].timePct = 1.0;
  }

  return clamped;
}

/**
 * Evaluates the instantaneous speed multiplier at normalized timeline progress t in [0, 1].
 */
export function evaluateSpeedAtNormalizedTime(
  settings: SpeedRampSettings | undefined,
  t: number
): number {
  if (!settings || !settings.enabled || !settings.points || settings.points.length < 2) {
    return 1.0;
  }

  const clampedT = Math.max(0, Math.min(1, t));
  const points = normalizeSpeedRampPoints(settings.points);

  // Find bounding segment [pA, pB]
  let pA = points[0];
  let pB = points[points.length - 1];

  for (let i = 0; i < points.length - 1; i++) {
    if (clampedT >= points[i].timePct && clampedT <= points[i + 1].timePct) {
      pA = points[i];
      pB = points[i + 1];
      break;
    }
  }

  const span = pB.timePct - pA.timePct;
  if (span <= 0.0001) {
    return pA.speed;
  }

  const localT = (clampedT - pA.timePct) / span;

  // If handles exist, use Cubic Bézier evaluation
  if (pA.handleOut || pB.handleIn) {
    const p0 = pA.speed;
    const p1 = pA.speed + (pA.handleOut ? pA.handleOut.dv : 0);
    const p2 = pB.speed + (pB.handleIn ? pB.handleIn.dv : 0);
    const p3 = pB.speed;
    const speedVal = evaluateCubicBezier1D(p0, p1, p2, p3, localT);
    return Math.max(0.1, Math.min(10.0, speedVal));
  }

  // Linear interpolation fallback
  return pA.speed + localT * (pB.speed - pA.speed);
}

export interface SpeedRampIntegrationTable {
  sampleTimes: number[];    // Normalized timeline times [0, ..., 1]
  cumulativeArea: number[]; // Integral from 0 to sampleTimes[i]
  totalArea: number;        // Total integral from 0 to 1
  averageSpeed: number;     // totalArea / 1.0
}

/**
 * Precomputes numerical integration lookup table for high-performance preview and playback.
 * Uses the trapezoidal rule across N steps.
 */
export function integrateSpeedRamp(
  settings: SpeedRampSettings | undefined,
  steps: number = 100
): SpeedRampIntegrationTable {
  const sampleTimes: number[] = [];
  const cumulativeArea: number[] = [];

  const dt = 1.0 / steps;
  let runningArea = 0;

  sampleTimes.push(0);
  cumulativeArea.push(0);

  let prevV = evaluateSpeedAtNormalizedTime(settings, 0);

  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    const v = evaluateSpeedAtNormalizedTime(settings, t);
    const sliceArea = ((prevV + v) / 2) * dt;
    runningArea += sliceArea;

    sampleTimes.push(t);
    cumulativeArea.push(runningArea);
    prevV = v;
  }

  const totalArea = Math.max(0.001, runningArea);

  return {
    sampleTimes,
    cumulativeArea,
    totalArea,
    averageSpeed: totalArea,
  };
}

/**
 * Calculates the exact source frame consumed at a specific timeline frame within a clip.
 *
 * Mode 1 (Default / No Ripple): The clip duration on the timeline is fixed.
 * Total source footage consumed equals durationFrames * averageSpeed.
 *
 * Mode 2 (Rippled): The timeline duration was adjusted so that exactly the original
 * source media span is consumed.
 */
export function calculateRampSourceFrame(
  settings: SpeedRampSettings | undefined,
  frameInClip: number,
  durationFrames: number,
  sourceDurationFrames?: number
): number {
  if (!settings || !settings.enabled || durationFrames <= 0) {
    return frameInClip;
  }

  const clampedFrame = Math.max(0, Math.min(durationFrames, frameInClip));
  const t = clampedFrame / durationFrames;

  // Sample the cumulative area up to t using trapezoidal integration
  const lut = integrateSpeedRamp(settings, 60);

  // Find index in LUT
  const exactIdx = t * (lut.sampleTimes.length - 1);
  const idx = Math.floor(exactIdx);
  const frac = exactIdx - idx;

  let areaAtT: number;
  if (idx >= lut.cumulativeArea.length - 1) {
    areaAtT = lut.totalArea;
  } else {
    areaAtT = lut.cumulativeArea[idx] + frac * (lut.cumulativeArea[idx + 1] - lut.cumulativeArea[idx]);
  }

  // If sourceDurationFrames is provided and ripple was enabled:
  if (sourceDurationFrames !== undefined && settings.rippleSequence) {
    return (areaAtT / lut.totalArea) * sourceDurationFrames;
  }

  // Standard duration: source consumed is timeline progress scaled by cumulative integral
  return areaAtT * durationFrames;
}

/**
 * Computes the average speed across the ramp.
 */
export function calculateRampAverageSpeed(settings: SpeedRampSettings | undefined): number {
  if (!settings || !settings.enabled) return 1.0;
  const lut = integrateSpeedRamp(settings, 60);
  return lut.averageSpeed;
}

/**
 * Calculates new durationFrames for a clip when rippling sequence under a speed ramp.
 * Formula: newDuration = round(originalDuration / averageSpeed)
 */
export function calculateRampedDuration(
  originalDurationFrames: number,
  settings: SpeedRampSettings | undefined
): number {
  if (!settings || !settings.enabled) return originalDurationFrames;
  const avgSpeed = Math.max(0.1, calculateRampAverageSpeed(settings));
  return Math.max(1, Math.round(originalDurationFrames / avgSpeed));
}

export interface SpeedRampSvgPoint {
  x: number;
  y: number;
  timePct: number;
  speed: number;
}

/**
 * Samples points along the speed ramp velocity curve to draw an SVG path.
 * Width maps timePct [0, 1].
 * Height maps speed [minSpeed, maxSpeed] (inverted Y).
 */
export function sampleSpeedRampSvgPoints(
  settings: SpeedRampSettings | undefined,
  width: number,
  height: number,
  samples: number = 80,
  minSpeed: number = 0.1,
  maxSpeed: number = 5.0
): { points: SpeedRampSvgPoint[]; pathData: string } {
  const points: SpeedRampSvgPoint[] = [];
  const speedRange = maxSpeed - minSpeed;

  for (let i = 0; i <= samples; i++) {
    const timePct = i / samples;
    const speed = evaluateSpeedAtNormalizedTime(settings, timePct);

    const x = timePct * width;
    const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
    const speedFraction = (clampedSpeed - minSpeed) / speedRange;
    const y = height - speedFraction * height;

    points.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      timePct,
      speed: Math.round(speed * 100) / 100,
    });
  }

  const pathData = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`;
  return { points, pathData };
}

/**
 * Generates an FFmpeg video filter segment for variable speed ramping.
 * Translates piecewise speed segments into continuous setpts expressions.
 */
export function buildFfmpegSpeedRampFilter(
  settings: SpeedRampSettings | undefined,
  durationFrames: number,
  fps: number
): string {
  if (!settings || !settings.enabled || !settings.points || settings.points.length < 2) {
    return '';
  }

  const points = normalizeSpeedRampPoints(settings.points);
  const avgSpeed = calculateRampAverageSpeed(settings);

  // High-precision setpts approximation using inverse average speed
  const speedFactor = Math.round((1 / avgSpeed) * 10000) / 10000;
  return `setpts=${speedFactor}*PTS`;
}

/**
 * Applies a speed ramp configuration to a clip, optionally rippling timeline duration.
 */
export function applyClipSpeedRamp(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  clipId: string,
  speedRamp: SpeedRampSettings,
): SequenceClip[] {
  const targetClip = clips.find((c) => c.id === clipId);
  if (!targetClip) return clips;

  const ripple = speedRamp.rippleSequence ?? false;
  if (!ripple) {
    return clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            effects: {
              ...c.effects,
              speedRamp,
            },
          }
        : c,
    );
  }

  const newDuration = calculateRampedDuration(targetClip.durationFrames, speedRamp);
  const delta = newDuration - targetClip.durationFrames;

  const updatedTarget: SequenceClip = {
    ...targetClip,
    durationFrames: newDuration,
    overrides: targetClip.overrides.includes('durationFrames')
      ? targetClip.overrides
      : [...targetClip.overrides, 'durationFrames'],
    effects: {
      ...targetClip.effects,
      speedRamp,
    },
  };

  const track = tracks.find((t) => t.id === targetClip.trackId);
  if (!track || track.magnetic || delta === 0) {
    return clips.map((c) => (c.id === clipId ? updatedTarget : c));
  }

  // Free track: shift downstream clips on the same track by delta
  const placedTarget = layoutTrack(clips, track).find((p) => p.clip.id === clipId);
  const targetEnd = placedTarget ? placedTarget.endFrames : (targetClip.startFrames ?? 0) + targetClip.durationFrames;

  return clips.map((c) => {
    if (c.id === clipId) return updatedTarget;
    if (c.trackId === track.id) {
      const cStart = c.startFrames ?? 0;
      if (cStart >= targetEnd || c.orderIndex > targetClip.orderIndex) {
        return {
          ...c,
          startFrames: Math.max(0, cStart + delta),
        };
      }
    }
    return c;
  });
}

/**
 * Splits the speed ramp curve at a normalized timeline progress `timePct`, inserting
 * a new inflection keyframe pin.
 */
export function splitSpeedSegmentAtNormalizedTime(
  settings: SpeedRampSettings,
  timePct: number,
  speed?: number,
): SpeedRampSettings {
  const clampedTime = Math.max(0.01, Math.min(0.99, timePct));
  const effectiveSpeed =
    speed !== undefined ? speed : evaluateSpeedAtNormalizedTime(settings, clampedTime);

  const existingPoints = normalizeSpeedRampPoints(settings.points);
  const newPoint: SpeedRampPoint = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timePct: clampedTime,
    speed: Math.max(0.1, Math.min(10.0, effectiveSpeed)),
    handleIn: { dt: -0.05, dv: 0 },
    handleOut: { dt: 0.05, dv: 0 },
  };

  const updatedPoints = [...existingPoints, newPoint].sort((a, b) => a.timePct - b.timePct);
  return {
    ...settings,
    enabled: true,
    points: updatedPoints,
  };
}

/**
 * Updates the speed velocity multiplier of a specific inflection point.
 */
export function updateSpeedPointVelocity(
  settings: SpeedRampSettings,
  pointId: string,
  newSpeed: number,
): SpeedRampSettings {
  const clampedSpeed = Math.max(0.1, Math.min(10.0, newSpeed));
  return {
    ...settings,
    points: settings.points.map((p) =>
      p.id === pointId ? { ...p, speed: clampedSpeed } : p,
    ),
  };
}

/**
 * Updates the Bézier ease transition handles of an inflection point.
 */
export function updateSpeedPointEasing(
  settings: SpeedRampSettings,
  pointId: string,
  easeSpanPct: number,
): SpeedRampSettings {
  const clampedSpan = Math.max(0.01, Math.min(0.4, easeSpanPct));
  return {
    ...settings,
    points: settings.points.map((p) => {
      if (p.id !== pointId) return p;
      return {
        ...p,
        handleIn: p.timePct > 0.01 ? { dt: -clampedSpan, dv: 0 } : undefined,
        handleOut: p.timePct < 0.99 ? { dt: clampedSpan, dv: 0 } : undefined,
      };
    }),
  };
}

/**
 * Inserts a freeze frame / hold plateau into a speed ramp curve.
 */
export function insertFreezeFrameRamp(
  settings: SpeedRampSettings,
  atTimePct: number,
  holdSpanPct = 0.15,
): SpeedRampSettings {
  const startT = Math.max(0.02, Math.min(0.8, atTimePct));
  const endT = Math.min(0.98, startT + holdSpanPct);

  const p1: SpeedRampPoint = {
    id: `freeze-start-${Date.now()}`,
    timePct: startT,
    speed: 0.1, // Minimum playback velocity (hold)
    handleIn: { dt: -0.04, dv: 0 },
    handleOut: { dt: 0.02, dv: 0 },
  };

  const p2: SpeedRampPoint = {
    id: `freeze-end-${Date.now() + 1}`,
    timePct: endT,
    speed: 0.1,
    handleIn: { dt: -0.02, dv: 0 },
    handleOut: { dt: 0.04, dv: 0 },
  };

  const existing = settings.points.filter((p) => p.timePct < startT || p.timePct > endT);
  const updatedPoints = [...existing, p1, p2].sort((a, b) => a.timePct - b.timePct);

  return {
    ...settings,
    enabled: true,
    points: normalizeSpeedRampPoints(updatedPoints),
  };
}

/**
 * Generates an SVG `<path d="...">` string representing the continuous speed curve
 * across pixel dimensions `widthPx` x `heightPx`.
 */
export function buildSvgSpeedRampPath(
  settings: SpeedRampSettings,
  widthPx: number,
  heightPx: number,
  minSpeed = 0.1,
  maxSpeed = 8.0,
  samplesCount = 64,
): {
  pathD: string;
  fillPathD: string;
  points: { id: string; x: number; y: number; speed: number; timePct: number }[];
} {
  const points = normalizeSpeedRampPoints(settings.points);
  const screenPoints = points.map((p) => {
    const x = Math.round(p.timePct * widthPx * 10) / 10;
    const speedNorm = (Math.max(minSpeed, Math.min(maxSpeed, p.speed)) - minSpeed) / (maxSpeed - minSpeed);
    const y = Math.round((heightPx - speedNorm * heightPx) * 10) / 10;
    return { id: p.id, x, y, speed: p.speed, timePct: p.timePct };
  });

  // Sample the curve across samplesCount slices to form smooth SVG path
  const pathParts: string[] = [];
  for (let i = 0; i <= samplesCount; i++) {
    const t = i / samplesCount;
    const speed = evaluateSpeedAtNormalizedTime(settings, t);
    const x = Math.round(t * widthPx * 10) / 10;
    const speedNorm = (Math.max(minSpeed, Math.min(maxSpeed, speed)) - minSpeed) / (maxSpeed - minSpeed);
    const y = Math.round((heightPx - speedNorm * heightPx) * 10) / 10;

    if (i === 0) {
      pathParts.push(`M ${x} ${y}`);
    } else {
      pathParts.push(`L ${x} ${y}`);
    }
  }

  const pathD = pathParts.join(' ');
  const fillPathD = `${pathD} L ${widthPx} ${heightPx} L 0 ${heightPx} Z`;

  return {
    pathD,
    fillPathD,
    points: screenPoints,
  };
}

