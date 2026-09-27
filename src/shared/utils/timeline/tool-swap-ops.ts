/**
 * Whiteboard Multi-Tool Hot-Swapping, Eraser Cap Flip & Sound-Synchronized Tool Carousel Operations.
 * Simulates physical tool switching kinematics:
 * 1. 180-degree stylus flip with parabolic z-lift for rapid eraser-cap actions.
 * 2. Corner holster dock travel with tool handoff and cap snap / click.
 * 3. Foley audio cue triggers synchronized with apex and dock events.
 */

import type { Point2D } from './calligraphy-ops';

export type WhiteboardToolType =
  | 'pen'
  | 'marker'
  | 'highlighter'
  | 'eraser_cap'
  | 'felt_eraser'
  | 'chalk';

export type ToolSwapTransitionType = 'flip' | 'dock' | 'instant';

export interface ToolSwapConfig {
  enabled?: boolean;
  defaultTransition?: ToolSwapTransitionType; // default 'flip'
  durationSec?: number; // 0.2..1.5s, default 0.5s
  dockX?: number; // default 0.95 (normalized canvas width)
  dockY?: number; // default 0.92 (normalized canvas height)
  foleyAudioCues?: boolean; // default true
}

export interface ToolSwapPose {
  x: number;
  y: number;
  zLift: number; // pixels lifted off surface
  angleDeg: number; // rotation in degrees
  activeTool: WhiteboardToolType;
  opacity: number;
}

export interface ToolFoleyTrigger {
  cueName: 'stylus_flip' | 'dock_click' | 'cap_snap';
  timeSec: number;
  volume: number;
}

/**
 * Determines whether a tool pair should perform an axial flip or holster dock swap.
 */
export function resolveToolTransitionType(
  fromTool: WhiteboardToolType,
  toTool: WhiteboardToolType,
  config?: ToolSwapConfig,
): ToolSwapTransitionType {
  if (config?.defaultTransition === 'instant') return 'instant';

  // Pen to eraser cap or vice versa is the classic 180-degree pencil/stylus flip
  const isCapFlip =
    (fromTool === 'pen' && toTool === 'eraser_cap') ||
    (fromTool === 'eraser_cap' && toTool === 'pen') ||
    (fromTool === 'marker' && toTool === 'eraser_cap') ||
    (fromTool === 'eraser_cap' && toTool === 'marker');

  if (isCapFlip && config?.defaultTransition !== 'dock') {
    return 'flip';
  }

  return 'dock';
}

/**
 * Computes a 180-degree axial stylus flip gesture for quick eraser cap engagement.
 */
export function computeToolFlipTrajectory(
  startPt: Point2D,
  endPt: Point2D,
  fromTool: WhiteboardToolType,
  toTool: WhiteboardToolType,
  startSec: number = 0.0,
  durationSec: number = 0.5,
  fps: number = 30,
  maxLiftPx: number = 85.0,
  baseAngleDeg: number = -35.0,
): { poses: ToolSwapPose[]; cues: ToolFoleyTrigger[] } {
  const totalFrames = Math.max(2, Math.round(durationSec * fps));
  const poses: ToolSwapPose[] = [];
  const cues: ToolFoleyTrigger[] = [];

  const halfwaySec = Number((startSec + durationSec * 0.5).toFixed(3));
  cues.push({
    cueName: 'stylus_flip',
    timeSec: halfwaySec,
    volume: 0.75,
  });

  for (let f = 0; f < totalFrames; f++) {
    const t = f / (totalFrames - 1);

    // Smoothstep position easing
    const easePos = t * t * (3.0 - 2.0 * t);
    const currX = startPt[0] + (endPt[0] - startPt[0]) * easePos;
    const currY = startPt[1] + (endPt[1] - startPt[1]) * easePos;

    // Parabolic z-lift off the surface: 4 * h * t * (1 - t)
    const zLift = 4.0 * maxLiftPx * t * (1.0 - t);

    // 180-degree rotation with cosine easing
    const rotEase = 0.5 * (1.0 - Math.cos(Math.PI * t));
    const currAngle = baseAngleDeg + 180.0 * rotEase;

    const currTool = t >= 0.5 ? toTool : fromTool;

    poses.push({
      x: Number(currX.toFixed(2)),
      y: Number(currY.toFixed(2)),
      zLift: Number(zLift.toFixed(2)),
      angleDeg: Number(currAngle.toFixed(2)),
      activeTool: currTool,
      opacity: 1.0,
    });
  }

  return { poses, cues };
}

/**
 * Computes a holster dock swap gesture (hand travels to dock corner, changes instrument, returns).
 */
export function computeHolsterSwapTrajectory(
  startPt: Point2D,
  endPt: Point2D,
  dockPt: Point2D,
  fromTool: WhiteboardToolType,
  toTool: WhiteboardToolType,
  startSec: number = 0.0,
  durationSec: number = 0.8,
  fps: number = 30,
  maxLiftPx: number = 110.0,
  baseAngleDeg: number = -35.0,
): { poses: ToolSwapPose[]; cues: ToolFoleyTrigger[] } {
  const totalFrames = Math.max(4, Math.round(durationSec * fps));
  const poses: ToolSwapPose[] = [];
  const cues: ToolFoleyTrigger[] = [];

  const midSec = Number((startSec + durationSec * 0.5).toFixed(3));
  cues.push({ cueName: 'dock_click', timeSec: midSec, volume: 0.85 });
  cues.push({ cueName: 'cap_snap', timeSec: Number((midSec + 0.08).toFixed(3)), volume: 0.8 });

  for (let f = 0; f < totalFrames; f++) {
    const t = f / (totalFrames - 1);

    let currX: number;
    let currY: number;
    let zLift: number;
    let currAngle: number;
    let currTool: WhiteboardToolType;

    if (t < 0.5) {
      // Stage 1: Moving to dock
      const localT = t / 0.5;
      const ease = localT * localT * (3.0 - 2.0 * localT);
      currX = startPt[0] + (dockPt[0] - startPt[0]) * ease;
      currY = startPt[1] + (dockPt[1] - startPt[1]) * ease;
      zLift = maxLiftPx * Math.sin(Math.PI * 0.5 * localT);
      currAngle = baseAngleDeg + 15.0 * ease;
      currTool = fromTool;
    } else {
      // Stage 2: Returning from dock to destination
      const localT = (t - 0.5) / 0.5;
      const ease = localT * localT * (3.0 - 2.0 * localT);
      currX = dockPt[0] + (endPt[0] - dockPt[0]) * ease;
      currY = dockPt[1] + (endPt[1] - dockPt[1]) * ease;
      zLift = maxLiftPx * Math.cos(Math.PI * 0.5 * localT);
      currAngle = baseAngleDeg + 15.0 - 15.0 * ease;
      currTool = toTool;
    }

    poses.push({
      x: Number(currX.toFixed(2)),
      y: Number(currY.toFixed(2)),
      zLift: Number(zLift.toFixed(2)),
      angleDeg: Number(currAngle.toFixed(2)),
      activeTool: currTool,
      opacity: 1.0,
    });
  }

  return { poses, cues };
}
