/**
 * Whiteboard Granular Surface Friction, Nib Wear & Substrate Micro-Texture Operations.
 * Simulates analytical microscopic surface tooth (whiteboard, paper, slate, canvas),
 * kinetic friction drag on pen velocities, and asymptotic nib wear tip flattening.
 */

import type { Point2D } from './calligraphy-ops';

export type SurfaceSubstrateType = 'whiteboard' | 'paper' | 'slate' | 'canvas';

export interface SurfaceFrictionSettings {
  enabled?: boolean;
  surfaceType?: SurfaceSubstrateType; // default 'whiteboard'
  grainScale?: number; // 0.1..3.0, default 1.0
  nibWearRate?: number; // 0..1, default 0.25 (wear expansion rate)
  toothRoughness?: number; // 0..1, default 0.3
}

/**
 * Computes analytical microscopic substrate tooth height [0.0..1.0] at coordinate (x, y).
 */
export function sampleSurfaceTooth(
  x: number,
  y: number,
  surfaceType: SurfaceSubstrateType = 'paper',
  grainScale: number = 1.0
): number {
  const scale = Math.max(0.1, grainScale);
  const nx = (x * 0.08) / scale;
  const ny = (y * 0.08) / scale;

  // Multi-octave sinusoidal micro-noise
  const h1 = Math.sin(nx * 1.7 + ny * 2.3) * Math.cos(ny * 1.9 - nx * 0.7);
  const h2 = Math.sin(nx * 3.7 - ny * 4.1) * 0.5;
  const h3 = Math.cos(nx * 8.3 + ny * 7.9) * 0.25;
  const rawNoise = (h1 + h2 + h3 + 1.75) / 3.5; // [0..1]

  if (surfaceType === 'whiteboard') {
    // Ultra-smooth polished gloss
    return Math.max(0.0, Math.min(1.0, rawNoise * 0.05));
  }

  if (surfaceType === 'paper') {
    // Organic wood-pulp fibrous grain
    return Math.max(0.0, Math.min(1.0, rawNoise * 0.35));
  }

  if (surfaceType === 'slate') {
    // Porous limestone blackboard grain
    return Math.max(0.0, Math.min(1.0, rawNoise * 0.65));
  }

  if (surfaceType === 'canvas') {
    // Orthogonal grid weave pattern
    const weave = (Math.sin(nx * 5.0) * Math.sin(ny * 5.0) + 1.0) * 0.5;
    return Math.max(0.0, Math.min(1.0, rawNoise * 0.4 + weave * 0.4));
  }

  return rawNoise * 0.3;
}

/**
 * Calculates asymptotic nib tip flattening expansion as a function of total stroke distance drawn.
 */
export function calculateNibWearExpansion(
  cumulativeDistancePx: number,
  initialRadius: number = 4.0,
  wearRate: number = 0.0005,
  maxRadius: number = 10.0
): number {
  const dist = Math.max(0.0, cumulativeDistancePx);
  const rate = Math.max(0.0, wearRate);
  const deltaR = (maxRadius - initialRadius) * (1.0 - Math.exp(-rate * dist));
  return initialRadius + deltaR;
}

/**
 * Computes per-point adjusted stroke velocities and worn nib radii across a trajectory.
 */
export function applySurfaceFrictionDynamics(
  points: Point2D[],
  baseSpeed: number = 300.0,
  options: SurfaceFrictionSettings = {}
): { effectiveVelocities: number[]; radii: number[] } {
  const n = points.length;
  if (n === 0) {
    return { effectiveVelocities: [], radii: [] };
  }

  const surfaceType = options.surfaceType ?? 'paper';
  const grainScale = options.grainScale ?? 1.0;
  const toothRoughness = options.toothRoughness ?? 0.3;
  const wearRate = (options.nibWearRate ?? 0.25) * 0.002;
  const initialRadius = 4.0;
  const maxRadius = 9.0;

  const effectiveVelocities: number[] = [];
  const radii: number[] = [];
  let cumulativeDist = 0.0;

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const step = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      cumulativeDist += step;
    }

    const r = calculateNibWearExpansion(cumulativeDist, initialRadius, wearRate, maxRadius);
    radii.push(r);

    const tooth = sampleSurfaceTooth(points[i][0], points[i][1], surfaceType, grainScale);
    const drag = 1.0 / (1.0 + toothRoughness * tooth);
    effectiveVelocities.push(baseSpeed * drag);
  }

  return {
    effectiveVelocities,
    radii,
  };
}
