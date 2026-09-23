/**
 * S47 — Motion Tracking & 2D Point Feature Follower Engine.
 *
 * Implements 2D point feature tracking algorithms, bidirectional trajectory
 * smoothing, trajectory-to-keyframe baking, overlying clip pinning,
 * and synthetic trajectory simulation.
 */

import type { ClipKeyframe, KeyframeInterpolation } from './keyframes';
import type { SequenceClip } from '../../types/sequence';

export interface TrackedPoint {
  /** Clip-relative or timeline frame number. */
  frame: number;
  /** Normalized horizontal coordinate in [0..1]. */
  x: number;
  /** Normalized vertical coordinate in [0..1]. */
  y: number;
  /** Tracking quality confidence in [0..1]. */
  confidence: number;
}

export interface MotionTrackingTrajectory {
  id: string;
  name: string;
  sourceClipId: string;
  startFrame: number;
  points: TrackedPoint[];
  smoothed: boolean;
  averageConfidence: number;
}

export type MotionSimulationType =
  | 'linear_pan'
  | 'parabolic_arc'
  | 'orbital_circle'
  | 'wandering_subject';

export interface BakeKeyframeOptions {
  /** Sampling decimation step in frames (e.g. 1 = every frame, 2 = every other frame). */
  stepFrames?: number;
  /** Positional offset (dx, dy) to apply relative to the tracked feature (e.g. for callouts). */
  offset?: { x: number; y: number };
  /** Interpolation type for generated keyframes (default 'bezier'). */
  interpolation?: KeyframeInterpolation;
}

/**
 * Applies a zero-phase bidirectional Exponential Moving Average (EMA) filter
 * to eliminate high-frequency hand tremor, sensor noise, and tracking jitter.
 *
 * @param points Array of raw tracked feature coordinates
 * @param alpha Smoothing weight factor in (0..1], where smaller values yield smoother paths
 */
export function smoothTrajectory(
  points: readonly TrackedPoint[],
  alpha = 0.35,
): TrackedPoint[] {
  const n = points.length;
  if (n <= 2) {
    return points.map((p) => ({ ...p }));
  }

  const clampedAlpha = Math.max(0.05, Math.min(1.0, alpha));

  // 1. Forward pass
  const forwardX: number[] = new Array(n);
  const forwardY: number[] = new Array(n);
  forwardX[0] = points[0].x;
  forwardY[0] = points[0].y;

  for (let i = 1; i < n; i++) {
    forwardX[i] = clampedAlpha * points[i].x + (1 - clampedAlpha) * forwardX[i - 1];
    forwardY[i] = clampedAlpha * points[i].y + (1 - clampedAlpha) * forwardY[i - 1];
  }

  // 2. Backward pass (zero phase lag)
  const backwardX: number[] = new Array(n);
  const backwardY: number[] = new Array(n);
  backwardX[n - 1] = forwardX[n - 1];
  backwardY[n - 1] = forwardY[n - 1];

  for (let i = n - 2; i >= 0; i--) {
    backwardX[i] = clampedAlpha * forwardX[i] + (1 - clampedAlpha) * backwardX[i + 1];
    backwardY[i] = clampedAlpha * forwardY[i] + (1 - clampedAlpha) * backwardY[i + 1];
  }

  // Lock start and end points to ground truth to avoid boundary shrinkage
  backwardX[0] = points[0].x;
  backwardY[0] = points[0].y;
  backwardX[n - 1] = points[n - 1].x;
  backwardY[n - 1] = points[n - 1].y;

  return points.map((p, i) => ({
    frame: p.frame,
    x: Number(backwardX[i].toFixed(4)),
    y: Number(backwardY[i].toFixed(4)),
    confidence: p.confidence,
  }));
}

/**
 * Converts a motion trajectory into standard ClipKeyframe records
 * for transform properties 'x' and 'y'.
 */
export function bakeTrajectoryToKeyframes(
  trajectory: MotionTrackingTrajectory,
  options?: BakeKeyframeOptions,
): ClipKeyframe[] {
  const step = Math.max(1, Math.round(options?.stepFrames ?? 1));
  const offsetX = options?.offset?.x ?? 0;
  const offsetY = options?.offset?.y ?? 0;
  const interpolation: KeyframeInterpolation = options?.interpolation ?? 'bezier';

  const keyframes: ClipKeyframe[] = [];

  for (let i = 0; i < trajectory.points.length; i += step) {
    const pt = trajectory.points[i];
    const valX = Number(Math.max(0, Math.min(1, pt.x + offsetX)).toFixed(4));
    const valY = Number(Math.max(0, Math.min(1, pt.y + offsetY)).toFixed(4));

    keyframes.push({
      property: 'x',
      frame: pt.frame,
      value: valX,
      interpolation,
    });

    keyframes.push({
      property: 'y',
      frame: pt.frame,
      value: valY,
      interpolation,
    });
  }

  // Ensure last point is always included if step > 1
  if (trajectory.points.length > 0) {
    const lastPt = trajectory.points[trajectory.points.length - 1];
    if (lastPt.frame !== keyframes[keyframes.length - 1]?.frame) {
      keyframes.push({
        property: 'x',
        frame: lastPt.frame,
        value: Number(Math.max(0, Math.min(1, lastPt.x + offsetX)).toFixed(4)),
        interpolation,
      });
      keyframes.push({
        property: 'y',
        frame: lastPt.frame,
        value: Number(Math.max(0, Math.min(1, lastPt.y + offsetY)).toFixed(4)),
        interpolation,
      });
    }
  }

  // Sort keyframes by frame, then property
  return keyframes.sort((a, b) => a.frame - b.frame || a.property.localeCompare(b.property));
}

/**
 * Attaches any overlying clip (e.g. text title, sticker, or overlay video)
 * to a motion tracking trajectory, baking position keyframes directly into the clip.
 *
 * @param targetClip Overlying clip to be pinned
 * @param trajectory Tracked trajectory to follow
 * @param offset Optional positional anchor offset (e.g. { x: 0, y: -0.1 } to sit above subject)
 * @returns Updated SequenceClip with baked keyframes
 */
export function attachClipToTrajectory(
  targetClip: SequenceClip,
  trajectory: MotionTrackingTrajectory,
  offset?: { x: number; y: number },
): SequenceClip {
  const bakedKeys = bakeTrajectoryToKeyframes(trajectory, {
    offset,
    interpolation: 'bezier',
  });

  // Remove existing x/y keyframes to avoid conflicts, while preserving scale, opacity, volume
  const retainedKeys = (targetClip.keyframes ?? []).filter(
    (k) => k.property !== 'x' && k.property !== 'y',
  );

  const initialX = bakedKeys.find((k) => k.property === 'x')?.value ?? targetClip.effects?.transform?.x ?? 0.5;
  const initialY = bakedKeys.find((k) => k.property === 'y')?.value ?? targetClip.effects?.transform?.y ?? 0.5;

  return {
    ...targetClip,
    keyframes: [...retainedKeys, ...bakedKeys],
    effects: {
      ...targetClip.effects,
      transform: {
        ...targetClip.effects?.transform,
        x: initialX,
        y: initialY,
      },
    },
  };
}

/**
 * Simulates a realistic 2D motion trajectory for automated testing,
 * interactive demoing, and calibration when video frames lack optical flow hardware.
 */
export function simulateMotionTracking(
  startCoord: { x: number; y: number },
  motionType: MotionSimulationType,
  frameCount: number,
  noiseStdDev = 0.003,
): TrackedPoint[] {
  const points: TrackedPoint[] = [];
  const frames = Math.max(2, frameCount);

  let curX = startCoord.x;
  let curY = startCoord.y;

  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1); // 0 to 1

    switch (motionType) {
      case 'linear_pan':
        curX = startCoord.x + t * 0.35;
        curY = startCoord.y + t * 0.12;
        break;

      case 'parabolic_arc':
        // Smooth parabola simulating jump or projectile
        curX = startCoord.x + t * 0.4;
        curY = startCoord.y - 4 * 0.25 * t * (1 - t);
        break;

      case 'orbital_circle':
        // Smooth circular arc
        curX = startCoord.x + Math.sin(t * Math.PI * 2) * 0.15;
        curY = startCoord.y + (1 - Math.cos(t * Math.PI * 2)) * 0.15;
        break;

      case 'wandering_subject':
      default:
        // Brownian random walk with gentle momentum
        curX += (Math.random() - 0.48) * 0.015;
        curY += (Math.random() - 0.48) * 0.012;
        break;
    }

    // Add slight simulated sensor noise / hand tremor
    const noiseX = (Math.random() - 0.5) * 2 * noiseStdDev;
    const noiseY = (Math.random() - 0.5) * 2 * noiseStdDev;

    const clampedX = Math.max(0.05, Math.min(0.95, curX + noiseX));
    const clampedY = Math.max(0.05, Math.min(0.95, curY + noiseY));
    const confidence = Number((0.92 + Math.random() * 0.07).toFixed(2));

    points.push({
      frame: f,
      x: Number(clampedX.toFixed(4)),
      y: Number(clampedY.toFixed(4)),
      confidence,
    });
  }

  return points;
}
