/**
 * Whiteboard Procedural Smudge, Finger-Blending & Graphite Eraser Highlights Operations.
 * Simulates directional pigment advection along rubbing gesture trails with spatial dispersion,
 * and subtractive kneaded eraser dabbing for specular volume highlights.
 */

import type { Point2D } from './calligraphy-ops';

export type SmudgeToolMode = 'finger' | 'stump' | 'towel' | 'kneaded_eraser';

export interface SmudgeBlendSettings {
  enabled?: boolean;
  mode?: SmudgeToolMode; // default 'finger'
  radiusPx?: number; // 5..100 px, default 25
  strength?: number; // 0..1, default 0.6
  liftHighlights?: boolean; // default true
}

export interface SmudgeParticleTrail {
  path: Point2D[];
  radius: number;
  opacity: number;
  blurSigma: number;
  isSubtractive: boolean;
}

/**
 * Calculates directional pigment advection along a gesture path.
 */
export function calculateSmudgeAdvection(
  trailPoints: Point2D[],
  radiusPx: number = 25.0,
  strength: number = 0.6,
  isSubtractive: boolean = false
): SmudgeParticleTrail {
  const safeRadius = Math.max(5.0, Math.min(120.0, radiusPx));
  const safeStrength = Math.max(0.05, Math.min(1.0, strength));
  const blurSigma = safeRadius * 0.45;
  const opacity = safeStrength * 0.55;

  return {
    path: trailPoints.map((p) => [p[0], p[1]]),
    radius: safeRadius,
    opacity,
    blurSigma,
    isSubtractive,
  };
}

/**
 * Computes subtractive kneaded eraser lifting at a given distance from the dab center.
 * Lifts dark pigment (lower values) towards paper white (255).
 */
export function computeKneadedEraserLifting(
  initialBrightness: number,
  distanceToDab: number,
  radius: number = 20.0,
  liftFraction: number = 0.75
): number {
  if (distanceToDab >= radius * 2.0) {
    return initialBrightness;
  }
  const sigma = radius * 0.45;
  const falloff = Math.exp(-(distanceToDab * distanceToDab) / (2.0 * sigma * sigma));
  const lifted = initialBrightness + (255.0 - initialBrightness) * (liftFraction * falloff);
  return Math.max(0.0, Math.min(255.0, lifted));
}

/**
 * Serializes a smudge particle trail into an SVG filter overlay with directional gaussian blur.
 */
export function generateSmudgeSvgOverlay(
  trail: SmudgeParticleTrail,
  width: number = 1920,
  height: number = 1080
): string {
  if (trail.path.length < 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" />`;
  }

  const dParts = [`M ${trail.path[0][0].toFixed(1)} ${trail.path[0][1].toFixed(1)}`];
  for (let i = 1; i < trail.path.length; i++) {
    dParts.push(`L ${trail.path[i][0].toFixed(1)} ${trail.path[i][1].toFixed(1)}`);
  }
  const d = dParts.join(' ');

  const strokeColor = trail.isSubtractive ? '#ffffff' : '#333333';
  const filterId = `smudge-blur-${Math.round(trail.blurSigma)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `  <defs>`,
    `    <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">`,
    `      <feGaussianBlur stdDeviation="${trail.blurSigma.toFixed(1)}" />`,
    `    </filter>`,
    `  </defs>`,
    `  <path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${(trail.radius * 2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${trail.opacity.toFixed(2)}" filter="url(#${filterId})" />`,
    `</svg>`,
  ].join('\n');
}
