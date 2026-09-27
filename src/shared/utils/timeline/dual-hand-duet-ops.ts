/**
 * Whiteboard Multi-Hand Simultaneous Duet Collaboration & Dual-Stylus Choreography Operations.
 * Simulates dual presenter collaboration:
 * 1. Spatial and interleaved stroke partitioning across Hand 1 (Right) and Hand 2 (Left).
 * 2. Spatial collision avoidance with smooth Z-axis clearance elevation.
 * 3. Stereo-separated procedural foley acoustics.
 */

import type { Point2D } from './calligraphy-ops';

export type DuetPartitionMode = 'spatial' | 'interleaved' | 'sync';

export interface DualHandDuetSettings {
  enabled?: boolean;
  partitionMode?: DuetPartitionMode; // default 'spatial'
  minSeparationPx?: number; // 80..300 px, default 160
  collisionLiftPx?: number; // 40..150 px, default 90
  stereoFoleyPanning?: boolean; // default true
}

export interface DualHandFrameState {
  hand1Pos: Point2D;
  hand1Z: number;
  hand2Pos: Point2D;
  hand2Z: number;
  distance: number;
  isColliding: boolean;
  hand1Pan: number;
  hand2Pan: number;
}

/**
 * Partitions stroke polylines between Hand 1 (Primary) and Hand 2 (Secondary).
 */
export function partitionStrokesForDuet(
  strokes: Point2D[][],
  canvasWidth: number = 1920.0,
  mode: DuetPartitionMode = 'spatial',
): { hand1Strokes: Point2D[][]; hand2Strokes: Point2D[][] } {
  const hand1Strokes: Point2D[][] = [];
  const hand2Strokes: Point2D[][] = [];

  if (mode === 'spatial') {
    const midX = canvasWidth * 0.5;
    for (const s of strokes) {
      if (!s || s.length === 0) continue;
      const centroidX = s.reduce((acc, p) => acc + p[0], 0) / s.length;
      if (centroidX <= midX) {
        hand1Strokes.push(s);
      } else {
        hand2Strokes.push(s);
      }
    }
  } else if (mode === 'interleaved') {
    for (let i = 0; i < strokes.length; i++) {
      if (i % 2 === 0) {
        hand1Strokes.push(strokes[i]);
      } else {
        hand2Strokes.push(strokes[i]);
      }
    }
  } else {
    const half = Math.floor(strokes.length / 2);
    hand1Strokes.push(...strokes.slice(0, half));
    hand2Strokes.push(...strokes.slice(half));
  }

  return { hand1Strokes, hand2Strokes };
}

/**
 * Computes collision avoidance elevation when hands draw within close proximity.
 */
export function evaluateCollisionAvoidance(
  h1: Point2D,
  h2: Point2D,
  minDist: number = 160.0,
  maxLift: number = 90.0,
): { hand1Z: number; hand2Z: number; distance: number; isColliding: boolean } {
  const dist = Math.hypot(h1[0] - h2[0], h1[1] - h2[1]);

  if (dist < minDist) {
    const t = (minDist - dist) / minDist;
    const easeLift = t * t * (3.0 - 2.0 * t);
    const hand2Z = Number((maxLift * easeLift).toFixed(2));
    return {
      hand1Z: 0.0,
      hand2Z,
      distance: Number(dist.toFixed(2)),
      isColliding: true,
    };
  }

  return {
    hand1Z: 0.0,
    hand2Z: 0.0,
    distance: Number(dist.toFixed(2)),
    isColliding: false,
  };
}

/**
 * Computes stereo panning multipliers in [-0.85, +0.85] based on horizontal screen coordinates.
 */
export function generateDualHandStereoPan(
  h1X: number,
  h2X: number,
  canvasWidth: number = 1920.0,
): { hand1Pan: number; hand2Pan: number } {
  const safeW = Math.max(1.0, canvasWidth);
  const calc = (x: number) => {
    const norm = (x / safeW) * 2.0 - 1.0;
    return Number(Math.max(-0.85, Math.min(0.85, norm)).toFixed(3));
  };

  return {
    hand1Pan: calc(h1X),
    hand2Pan: calc(h2X),
  };
}

/**
 * Fully evaluates the simultaneous spatial kinematics and audio positioning for both hands.
 */
export function evaluateDuetState(
  h1: Point2D,
  h2: Point2D,
  canvasWidth: number = 1920.0,
  config?: DualHandDuetSettings,
): DualHandFrameState {
  const minDist = config?.minSeparationPx ?? 160.0;
  const maxLift = config?.collisionLiftPx ?? 90.0;
  const { hand1Z, hand2Z, distance, isColliding } = evaluateCollisionAvoidance(h1, h2, minDist, maxLift);
  const { hand1Pan, hand2Pan } = generateDualHandStereoPan(h1[0], h2[0], canvasWidth);

  return {
    hand1Pos: [h1[0], h1[1]],
    hand1Z,
    hand2Pos: [h2[0], h2[1]],
    hand2Z,
    distance,
    isColliding,
    hand1Pan: config?.stereoFoleyPanning !== false ? hand1Pan : 0.0,
    hand2Pan: config?.stereoFoleyPanning !== false ? hand2Pan : 0.0,
  };
}
