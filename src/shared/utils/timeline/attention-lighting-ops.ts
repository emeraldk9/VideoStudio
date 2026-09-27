/**
 * Whiteboard Heatmap-Driven Attention Lighting, Dynamic Vignetting & Pen Spotlight Shading.
 * Simulates cinematic visual guidance:
 * 1. Dynamic pen spotlight following the active drawing nib with inertia damping.
 * 2. Elliptical perimeter vignetting gently attenuating corners to focus attention.
 * 3. Radial SVG gradient overlay generation for real-time WebGL/SVG compositing.
 */

import type { Point2D } from './calligraphy-ops';

export interface AttentionLightingSettings {
  enabled?: boolean;
  spotlightRadiusPx?: number; // 100..800 px, default 350
  spotlightIntensity?: number; // 0.05..0.35, default 0.15
  vignetteStrength?: number; // 0.0..0.45, default 0.20
  inertia?: number; // 0.0..0.95, default 0.85
}

export interface SpotlightState {
  currentPos: Point2D;
  radiusPx: number;
  intensity: number;
  vignetteStrength: number;
}

/**
 * Computes exponentially smoothed (damped) spotlight position following the pen.
 */
export function computeDampedSpotlightPosition(
  targetPos: Point2D,
  prevPos?: Point2D | null,
  inertia: number = 0.85,
): Point2D {
  const safeInertia = Math.max(0.0, Math.min(0.95, inertia));
  if (!prevPos) {
    return [targetPos[0], targetPos[1]];
  }

  const smoothX = prevPos[0] * safeInertia + targetPos[0] * (1.0 - safeInertia);
  const smoothY = prevPos[1] * safeInertia + targetPos[1] * (1.0 - safeInertia);

  return [Number(smoothX.toFixed(2)), Number(smoothY.toFixed(2))];
}

/**
 * Calculates elliptical vignette attenuation factor at a point.
 */
export function calculateVignetteFactor(
  point: Point2D,
  canvasWidth: number,
  canvasHeight: number,
  strength: number = 0.2,
): number {
  const safeStrength = Math.max(0.0, Math.min(0.6, strength));
  const cx = canvasWidth * 0.5;
  const cy = canvasHeight * 0.5;
  const rx = canvasWidth * 0.65;
  const ry = canvasHeight * 0.65;

  const dx = (point[0] - cx) / rx;
  const dy = (point[1] - cy) / ry;
  const distSq = Math.min(1.0, dx * dx + dy * dy);

  return Number((1.0 - safeStrength * distSq).toFixed(4));
}

/**
 * Calculates radial Gaussian spotlight gain at a given point.
 */
export function calculateSpotlightGain(
  point: Point2D,
  spotlightPos: Point2D,
  radiusPx: number = 350,
  intensity: number = 0.15,
): number {
  const safeRadius = Math.max(50, radiusPx);
  const safeIntensity = Math.max(0.0, Math.min(0.5, intensity));
  const sigma = safeRadius * 0.5;

  const dx = point[0] - spotlightPos[0];
  const dy = point[1] - spotlightPos[1];
  const distSq = dx * dx + dy * dy;

  const gain = 1.0 + safeIntensity * Math.exp(-distSq / (2.0 * sigma * sigma));
  return Number(gain.toFixed(4));
}

/**
 * Generates an SVG radialGradient markup string representing the combined spotlight and vignette overlay.
 */
export function generateAttentionLightingSvgFilter(
  spotlightPos: Point2D,
  radiusPx: number,
  intensity: number,
  vignetteStrength: number,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const cxPct = ((spotlightPos[0] / canvasWidth) * 100).toFixed(1);
  const cyPct = ((spotlightPos[1] / canvasHeight) * 100).toFixed(1);
  const rPct = (((radiusPx * 1.5) / Math.max(canvasWidth, canvasHeight)) * 100).toFixed(1);
  const spotAlpha = Math.min(0.3, intensity * 0.8).toFixed(3);
  const vigAlpha = Math.min(0.5, vignetteStrength * 0.9).toFixed(3);

  return `<radialGradient id="attention-spotlight" cx="${cxPct}%" cy="${cyPct}%" r="${rPct}%">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="${spotAlpha}" />
  <stop offset="60%" stop-color="#000000" stop-opacity="0" />
  <stop offset="100%" stop-color="#000000" stop-opacity="${vigAlpha}" />
</radialGradient>`;
}
