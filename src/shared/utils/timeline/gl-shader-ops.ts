/**
 * Milestone S69 — Real-Time WebGL Shader Preview Harmonization & GPU Effect Acceleration.
 *
 * Provides pure mathematical transformations, uniform serialization, and color conversion
 * routines for WebGL2 GLSL fragment shaders (Film Emulation, Lens Optics & Distortion,
 * Chroma Keying, 3-Way Color Balance Wheels, and Shape Masking).
 */

import type { ClipEffects } from './effects';
import type { FilmEmulationSettings } from './film-emulation-ops';
import type { ClipLensOpticsSettings } from './lens-optics-ops';
import type { ChromaKeySettings } from './compositing-ops';
import type { ColorGradingSettings } from './color-grading-ops';
import type { ClipMaskSettings } from './mask-ops';

/**
 * Parses a 6-digit hex color into normalized RGB components [0..1].
 */
export function hexToNormalizedRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [isNaN(r) ? 0 : r, isNaN(g) ? 1 : g, isNaN(b) ? 0 : b];
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [0, 1, 0]; // default green
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

/**
 * Converts degrees to radians.
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * S69: Packs Film Emulation parameters into a Float32Array uniform [6 floats].
 * [enabled, grainIntensity, grainRoughness, halationThreshold, halationIntensity, timeSeed]
 */
export function packFilmEmulationUniforms(
  settings: FilmEmulationSettings | undefined,
  playheadFrame = 0,
): Float32Array {
  const out = new Float32Array(6);
  if (!settings || !settings.enabled) {
    return out; // all zeros -> enabled = 0
  }

  out[0] = 1.0; // enabled
  out[1] = settings.grain?.enabled ? Math.max(0, Math.min(1, settings.grain.intensity)) : 0.0;
  out[2] = settings.grain?.enabled ? Math.max(0, Math.min(1, settings.grain.roughness)) : 0.0;
  out[3] = settings.halation?.enabled ? Math.max(0, Math.min(1, settings.halation.threshold)) : 0.0;
  out[4] = settings.halation?.enabled ? Math.max(0, Math.min(1, settings.halation.intensity)) : 0.0;
  // Frame-derived pseudo-random seed to animate grain noise realistically on every frame tick
  out[5] = ((playheadFrame * 12.9898 + 78.233) % 1000) / 1000;
  return out;
}

/**
 * S69: Packs Lens Optics parameters into a Float32Array uniform [6 floats].
 * [enabled, distortionK1, distortionK2, chromaticAberrationPx, chromaticAngleRad, anamorphicRatio]
 */
export function packLensOpticsUniforms(
  settings: ClipLensOpticsSettings | undefined,
): Float32Array {
  const out = new Float32Array(6);
  if (!settings || !settings.enabled) {
    return out;
  }

  out[0] = 1.0; // enabled
  out[1] = Math.max(-1, Math.min(1, settings.distortionK1 ?? 0));
  out[2] = Math.max(-1, Math.min(1, settings.distortionK2 ?? 0));
  out[3] = Math.max(0, Math.min(30, settings.chromaticAberrationPx ?? 0));
  out[4] = degreesToRadians(settings.chromaticAberrationAngleDeg ?? 0);
  out[5] = Math.max(1, Math.min(2.5, settings.anamorphicRatio ?? 1.0));
  return out;
}

/**
 * S69: Packs Chroma Keying parameters into a Float32Array uniform [7 floats].
 * [enabled, keyR, keyG, keyB, similarity, smoothness, spillSuppression]
 */
export function packChromaKeyUniforms(
  settings: ChromaKeySettings | undefined,
): Float32Array {
  const out = new Float32Array(7);
  if (!settings || !settings.enabled) {
    return out;
  }

  const [r, g, b] = hexToNormalizedRgb(settings.keyColorHex || '#00FF00');
  out[0] = 1.0; // enabled
  out[1] = r;
  out[2] = g;
  out[3] = b;
  out[4] = Math.max(0.01, Math.min(1.0, settings.similarity ?? 0.4));
  out[5] = Math.max(0.001, Math.min(0.5, settings.smoothness ?? 0.1));
  out[6] = Math.max(0.0, Math.min(1.0, settings.spillSuppression ?? 0.5));
  return out;
}

/**
 * S69: Packs 3-Way Color Balance parameters into a Float32Array uniform [12 floats].
 * [enabled, liftR, liftG, liftB, gammaR, gammaG, gammaB, gainR, gainG, gainB, temperature, tint]
 */
export function packColorGradingUniforms(
  settings: ColorGradingSettings | undefined,
): Float32Array {
  const out = new Float32Array(12);
  if (!settings) {
    return out;
  }

  const isNeutral =
    settings.lift.r === 0 &&
    settings.lift.g === 0 &&
    settings.lift.b === 0 &&
    settings.lift.luma === 0 &&
    settings.gamma.r === 0 &&
    settings.gamma.g === 0 &&
    settings.gamma.b === 0 &&
    settings.gamma.luma === 0 &&
    settings.gain.r === 0 &&
    settings.gain.g === 0 &&
    settings.gain.b === 0 &&
    settings.gain.luma === 0 &&
    settings.temperature === 0 &&
    settings.tint === 0;

  if (isNeutral) {
    return out;
  }

  out[0] = 1.0; // enabled
  // Lift: shadows offset (-0.5 to 0.5)
  out[1] = (settings.lift.r + settings.lift.luma) * 0.5;
  out[2] = (settings.lift.g + settings.lift.luma) * 0.5;
  out[3] = (settings.lift.b + settings.lift.luma) * 0.5;
  // Gamma: midtones pivot around 1.0 (0.2 to 2.5)
  out[4] = Math.max(0.1, 1.0 + (settings.gamma.r + settings.gamma.luma) * 0.8);
  out[5] = Math.max(0.1, 1.0 + (settings.gamma.g + settings.gamma.luma) * 0.8);
  out[6] = Math.max(0.1, 1.0 + (settings.gamma.b + settings.gamma.luma) * 0.8);
  // Gain: highlights multiplier (0.0 to 3.0)
  out[7] = Math.max(0.0, 1.0 + (settings.gain.r + settings.gain.luma) * 1.0);
  out[8] = Math.max(0.0, 1.0 + (settings.gain.g + settings.gain.luma) * 1.0);
  out[9] = Math.max(0.0, 1.0 + (settings.gain.b + settings.gain.luma) * 1.0);
  // Color temperature & tint [-1.0 .. 1.0]
  out[10] = Math.max(-1, Math.min(1, (settings.temperature ?? 0) / 100));
  out[11] = Math.max(-1, Math.min(1, (settings.tint ?? 0) / 100));
  return out;
}

/**
 * Shape mask type map for WebGL fragment shader:
 * 0: none, 1: rectangle, 2: circle, 3: ellipse, 4: linear_gradient, 5: radial_vignette
 */
export const SHAPE_MASK_GL_IDS: Record<string, number> = {
  none: 0,
  rectangle: 1,
  circle: 2,
  ellipse: 3,
  linear_gradient: 4,
  radial_vignette: 5,
};

/**
 * S69: Packs Geometric Shape Mask into a Float32Array uniform [9 floats].
 * [enabled, shapeId, centerX, centerY, halfWidth, halfHeight, rotationRad, feather, invert]
 */
export function packMaskUniforms(
  settings: ClipMaskSettings | undefined,
): Float32Array {
  const out = new Float32Array(9);
  if (!settings || !settings.enabled || settings.shape === 'none') {
    return out;
  }

  const shapeId = SHAPE_MASK_GL_IDS[settings.shape] ?? 0;
  if (shapeId === 0) return out;

  out[0] = 1.0; // enabled
  out[1] = shapeId;
  out[2] = Math.max(0, Math.min(1, settings.x ?? 0.5));
  out[3] = Math.max(0, Math.min(1, settings.y ?? 0.5));
  out[4] = Math.max(0.01, Math.min(1, (settings.width ?? 0.6) / 2));
  out[5] = Math.max(0.01, Math.min(1, (settings.height ?? 0.6) / 2));
  out[6] = degreesToRadians(settings.rotation ?? 0);
  // Feather normalized across 0..0.5
  out[7] = Math.max(0.001, Math.min(0.5, (settings.feather ?? 0) / 200));
  out[8] = settings.invert ? 1.0 : 0.0;
  return out;
}

/**
 * Aggregated packed uniform state for a single WebGL rendering layer.
 */
export interface GlLayerGpuEffects {
  film: Float32Array;
  lens: Float32Array;
  chroma: Float32Array;
  grade: Float32Array;
  mask: Float32Array;
}

/**
 * Resolves all GPU-accelerated effect uniforms for a given clip's effects payload.
 */
export function resolveGpuEffects(
  effects: ClipEffects | undefined,
  playheadFrame = 0,
): GlLayerGpuEffects {
  return {
    film: packFilmEmulationUniforms(effects?.filmEmulation, playheadFrame),
    lens: packLensOpticsUniforms(effects?.lensOptics),
    chroma: packChromaKeyUniforms(effects?.chromaKey),
    grade: packColorGradingUniforms(effects?.colorGrade),
    mask: packMaskUniforms(effects?.mask),
  };
}
