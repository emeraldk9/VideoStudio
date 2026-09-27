/**
 * Whiteboard Physics Simulation: Ink Bleed, Capillary Wet-Edge Pooling & Chalk Dust Operations.
 * Calculates velocity-dependent stroke expansion/saturation, subtractive dye glazing,
 * and chalk micro-particulate scatter with gravity.
 */

import type { Point2D } from './calligraphy-ops';

export interface WhiteboardInkPhysicsSettings {
  bleedIntensity?: number; // 0.0 to 1.0, default 0.20
  poolingFactor?: number; // 0.0 to 1.0, default 0.35
  dustParticles?: boolean; // default true for chalk
  subtractiveBlend?: boolean; // default true
}

export interface ChalkParticle {
  x: number;
  y: number;
  radius: number;
  opacity: number;
}

/**
 * Computes per-vertex radius and pigment opacity based on local pen velocity.
 * Slower movement (pauses, sharp corners, stroke ends) leads to capillary ink pooling:
 * expanded radius and deeper pigment opacity.
 */
export function computeVelocityPooling(
  points: Point2D[],
  baseRadius: number = 3.0,
  poolFactor: number = 0.5,
  refVelocity: number = 12.0
): { radii: number[]; opacities: number[] } {
  const n = points.length;
  if (n === 0) return { radii: [], opacities: [] };
  if (n === 1) {
    return {
      radii: [baseRadius * (1.0 + poolFactor)],
      opacities: [1.0],
    };
  }

  const velocities: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      velocities.push(Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]));
    } else if (i === n - 1) {
      velocities.push(Math.hypot(points[n - 1][0] - points[n - 2][0], points[n - 1][1] - points[n - 2][1]));
    } else {
      const d1 = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      const d2 = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      velocities.push((d1 + d2) * 0.5);
    }
  }

  // Force extra ink pooling at touchdown and lift
  velocities[0] *= 0.3;
  velocities[n - 1] *= 0.3;

  const radii: number[] = [];
  const opacities: number[] = [];

  for (const v of velocities) {
    const pool = Math.exp(-v / Math.max(1e-3, refVelocity));
    const r = baseRadius * (1.0 + poolFactor * pool);
    const opacity = Math.min(1.0, 0.70 + 0.30 * pool);
    radii.push(r);
    opacities.push(opacity);
  }

  return { radii, opacities };
}

/**
 * Calculates physical subtractive pigment color blending.
 * Where multiple glazes overlap, pigment density multiplies and darkens realistically.
 */
export function subtractiveGlazeColor(
  baseRgb: [number, number, number],
  inkRgb: [number, number, number],
  opacity: number = 0.75
): [number, number, number] {
  const safeOpacity = Math.max(0.0, Math.min(1.0, opacity));
  const resR = (baseRgb[0] / 255.0) * (1.0 - safeOpacity * (1.0 - inkRgb[0] / 255.0));
  const resG = (baseRgb[1] / 255.0) * (1.0 - safeOpacity * (1.0 - inkRgb[1] / 255.0));
  const resB = (baseRgb[2] / 255.0) * (1.0 - safeOpacity * (1.0 - inkRgb[2] / 255.0));

  return [
    Math.round(Math.max(0, Math.min(255, resR * 255.0))),
    Math.round(Math.max(0, Math.min(255, resG * 255.0))),
    Math.round(Math.max(0, Math.min(255, resB * 255.0))),
  ];
}

/**
 * Pseudo-random generator (LCG) for deterministic particle generation.
 */
function createDeterministicRandom(seed: number = 42): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates chalk micro-dust particles fracturing along a stroke path and drifting downward with gravity.
 */
export function generateChalkDustParticles(
  stroke: Point2D[],
  count: number = 80,
  gravityPx: number = 4.0,
  spreadSigma: number = 5.0,
  seed: number = 42
): ChalkParticle[] {
  if (stroke.length < 2 || count <= 0) return [];

  const rand = createDeterministicRandom(seed);
  const particles: ChalkParticle[] = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * stroke.length);
    const p = stroke[Math.min(stroke.length - 1, idx)];

    // Box-Muller transform for normal distribution
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

    const dx = z0 * spreadSigma;
    const dy = Math.abs(gravityPx + z1 * (spreadSigma * 0.6));

    const radius = 0.6 + rand() * 1.2;
    const opacity = 0.15 + rand() * 0.30;

    particles.push({
      x: p[0] + dx,
      y: p[1] + dy,
      radius,
      opacity,
    });
  }

  return particles;
}
