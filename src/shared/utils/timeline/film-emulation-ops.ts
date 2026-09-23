/**
 * S48 — Film Grain, Analog Halation & Mechanical Gate Weave Emulation Engine.
 *
 * Implements physical and photochemical film emulation components:
 * 1. Photochemical Silver Halide Film Grain (monochromatic / chromatic, size, intensity, roughness).
 * 2. Analog Halation (red highlight edge bleed / emulsion base reflection).
 * 3. Mechanical Gate Weave & Frame Jitter (multi-harmonic sprocket drift and perforation flutter).
 * 4. Curated physical stock presets (Kodak Vision3, Tri-X 400, Fuji Eterna, 16mm, Super 8).
 * 5. CSS live preview styling & FFmpeg export filter chain synthesis.
 */

import type { CSSProperties } from 'react';

export type FilmStockPresetKey =
  | 'kodak_vision3_500t'
  | 'kodak_tri_x_400'
  | 'fuji_eterna_250d'
  | 'vintage_16mm'
  | 'super_8mm';

export interface FilmGrainSettings {
  enabled: boolean;
  /** Overall grain opacity/intensity in [0..1]. */
  intensity: number;
  /** Grain particle relative diameter in [0.5..3.0]. */
  size: number;
  /** True for chromatic color dye cloud grain, false for silver halide monochromatic grain. */
  chromatic: boolean;
  /** High-frequency grain roughness/sharpness in [0..1]. */
  roughness: number;
}

export interface HalationSettings {
  enabled: boolean;
  /** Luminance threshold in [0.4..0.98] above which specular highlights scatter red halation. */
  threshold: number;
  /** Diffusion spread radius in pixels in [1..40]. */
  radiusPx: number;
  /** Halation glow opacity/intensity in [0..1]. */
  intensity: number;
  /** Hue shift in degrees [-20..40], where 0 is classic photochemical ruby/vermilion. */
  hueShiftDeg: number;
}

export interface GateWeaveSettings {
  enabled: boolean;
  /** Maximum horizontal camera gate drift in pixels [0..10]. */
  amplitudeX: number;
  /** Maximum vertical camera gate drift in pixels [0..10]. */
  amplitudeY: number;
  /** Harmonic weave oscillation speed in Hertz [0.2..6.0]. */
  speedHz: number;
  /** Random high-frequency micro-jitter percentage [0..1]. */
  jitterPct: number;
}

export interface FilmEmulationSettings {
  enabled: boolean;
  preset?: FilmStockPresetKey;
  grain: FilmGrainSettings;
  halation: HalationSettings;
  gateWeave: GateWeaveSettings;
}

export const DEFAULT_FILM_EMULATION_SETTINGS: FilmEmulationSettings = {
  enabled: false,
  preset: undefined,
  grain: {
    enabled: true,
    intensity: 0.25,
    size: 1.0,
    chromatic: false,
    roughness: 0.45,
  },
  halation: {
    enabled: true,
    threshold: 0.75,
    radiusPx: 10,
    intensity: 0.45,
    hueShiftDeg: 0,
  },
  gateWeave: {
    enabled: true,
    amplitudeX: 1.2,
    amplitudeY: 0.8,
    speedHz: 1.5,
    jitterPct: 0.25,
  },
};

export interface FilmStockPresetDefinition {
  label: string;
  description: string;
  settings: FilmEmulationSettings;
}

export const FILM_EMULATION_PRESETS: Record<FilmStockPresetKey, FilmStockPresetDefinition> = {
  kodak_vision3_500t: {
    label: 'Kodak Vision3 500T (35mm)',
    description: 'Modern Hollywood feature stock with fine organic grain, rich red highlight halation, and subtle gate weave.',
    settings: {
      enabled: true,
      preset: 'kodak_vision3_500t',
      grain: {
        enabled: true,
        intensity: 0.22,
        size: 0.9,
        chromatic: false,
        roughness: 0.4,
      },
      halation: {
        enabled: true,
        threshold: 0.72,
        radiusPx: 12,
        intensity: 0.55,
        hueShiftDeg: 0,
      },
      gateWeave: {
        enabled: true,
        amplitudeX: 0.8,
        amplitudeY: 0.5,
        speedHz: 1.2,
        jitterPct: 0.15,
      },
    },
  },
  kodak_tri_x_400: {
    label: 'Kodak Tri-X 400 (B&W)',
    description: 'Legendary gritty black & white stock featuring high-contrast silver halide clumping, zero halation, and organic weave.',
    settings: {
      enabled: true,
      preset: 'kodak_tri_x_400',
      grain: {
        enabled: true,
        intensity: 0.48,
        size: 1.4,
        chromatic: false,
        roughness: 0.7,
      },
      halation: {
        enabled: false,
        threshold: 0.85,
        radiusPx: 6,
        intensity: 0.0,
        hueShiftDeg: 0,
      },
      gateWeave: {
        enabled: true,
        amplitudeX: 1.6,
        amplitudeY: 1.2,
        speedHz: 1.8,
        jitterPct: 0.35,
      },
    },
  },
  fuji_eterna_250d: {
    label: 'Fuji Eterna 250D',
    description: 'Pastel cinematic palette with soft chromatic dye cloud grain, delicate peach halation, and pristine mechanical registration.',
    settings: {
      enabled: true,
      preset: 'fuji_eterna_250d',
      grain: {
        enabled: true,
        intensity: 0.18,
        size: 0.8,
        chromatic: true,
        roughness: 0.3,
      },
      halation: {
        enabled: true,
        threshold: 0.78,
        radiusPx: 9,
        intensity: 0.35,
        hueShiftDeg: 12, // slightly warmer peach tone
      },
      gateWeave: {
        enabled: true,
        amplitudeX: 0.5,
        amplitudeY: 0.4,
        speedHz: 1.0,
        jitterPct: 0.1,
      },
    },
  },
  vintage_16mm: {
    label: 'Vintage 16mm Documentary',
    description: '1970s reversal film stock with prominent grainy texture, strong vermilion halation on tungsten light, and lively projector flutter.',
    settings: {
      enabled: true,
      preset: 'vintage_16mm',
      grain: {
        enabled: true,
        intensity: 0.42,
        size: 1.5,
        chromatic: true,
        roughness: 0.55,
      },
      halation: {
        enabled: true,
        threshold: 0.68,
        radiusPx: 16,
        intensity: 0.65,
        hueShiftDeg: -5,
      },
      gateWeave: {
        enabled: true,
        amplitudeX: 2.4,
        amplitudeY: 1.8,
        speedHz: 2.2,
        jitterPct: 0.4,
      },
    },
  },
  super_8mm: {
    label: 'Super 8mm Home Movie',
    description: 'Nostalgic small-gauge home movie with heavy coarse grain, broad halation bleeding across highlights, and rhythmic hand-cranked gate weave.',
    settings: {
      enabled: true,
      preset: 'super_8mm',
      grain: {
        enabled: true,
        intensity: 0.6,
        size: 2.2,
        chromatic: true,
        roughness: 0.8,
      },
      halation: {
        enabled: true,
        threshold: 0.62,
        radiusPx: 22,
        intensity: 0.75,
        hueShiftDeg: 5,
      },
      gateWeave: {
        enabled: true,
        amplitudeX: 4.0,
        amplitudeY: 3.0,
        speedHz: 3.0,
        jitterPct: 0.55,
      },
    },
  },
};

/**
 * Deterministic PRNG using Mulberry32 for frame-consistent jitter without Math.random state leaks.
 */
function pseudoRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Calculates instantaneous 2D camera gate weave displacement $(dx, dy)$ for a given frame.
 * Uses a compound multi-frequency harmonic wave plus pseudo-random frame micro-jitter.
 */
export function calculateGateWeaveOffset(
  frame: number,
  fps: number,
  settings: GateWeaveSettings,
): { dx: number; dy: number } {
  if (!settings.enabled || (settings.amplitudeX === 0 && settings.amplitudeY === 0)) {
    return { dx: 0, dy: 0 };
  }

  const timeSec = frame / Math.max(1, fps);
  const omega = 2 * Math.PI * settings.speedHz;

  // Primary harmonic wave + secondary sub-harmonic for organic non-repeating wobble
  const harmonicX =
    Math.sin(omega * timeSec) * 0.7 +
    Math.sin(omega * 0.43 * timeSec + 1.2) * 0.3;

  const harmonicY =
    Math.cos(omega * 0.88 * timeSec + 0.5) * 0.65 +
    Math.sin(omega * 1.37 * timeSec + 2.1) * 0.35;

  // High-frequency perforation sprocket micro-jitter
  const jitterSeed = Math.floor(frame * 12345.67);
  const jitterX = (pseudoRandom(jitterSeed) - 0.5) * 2 * settings.jitterPct;
  const jitterY = (pseudoRandom(jitterSeed + 888) - 0.5) * 2 * settings.jitterPct;

  const dx = Number(((harmonicX + jitterX) * settings.amplitudeX).toFixed(2));
  const dy = Number(((harmonicY + jitterY) * settings.amplitudeY).toFixed(2));

  return { dx, dy };
}

/**
 * Synthesizes hardware-accelerated CSS properties for real-time 60fps canvas/video preview.
 */
export function buildCssFilmEmulationStyle(
  settings: FilmEmulationSettings | undefined,
  frame: number = 0,
  fps: number = 30,
): CSSProperties {
  if (!settings || !settings.enabled) {
    return {};
  }

  const styles: CSSProperties = {};
  const filterTokens: string[] = [];

  // 1. Analog Halation
  if (settings.halation.enabled && settings.halation.intensity > 0) {
    const alpha1 = (settings.halation.intensity * 0.65).toFixed(3);
    const alpha2 = (settings.halation.intensity * 0.35).toFixed(3);
    const r = settings.halation.radiusPx;
    const rOuter = (r * 1.8).toFixed(1);

    // Warm red-orange photochemical halation color with subtle hue shift
    const hue = Math.max(-20, Math.min(40, settings.halation.hueShiftDeg));
    const red1 = Math.round(255);
    const green1 = Math.round(Math.max(10, Math.min(100, 35 + hue * 1.2)));
    const blue1 = Math.round(Math.max(5, Math.min(60, 20 + hue * 0.5)));

    const dropShadowInner = `drop-shadow(0 0 ${r}px rgba(${red1}, ${green1}, ${blue1}, ${alpha1}))`;
    const dropShadowOuter = `drop-shadow(0 0 ${rOuter}px rgba(255, 80, 25, ${alpha2}))`;

    filterTokens.push(dropShadowInner, dropShadowOuter);
  }

  // 2. Film Grain texture adjustment
  if (settings.grain.enabled && settings.grain.intensity > 0) {
    // Subtle contrast & brightness micro-lift to simulate photochemical emulsion base
    const contrastVal = (1.0 + settings.grain.intensity * 0.08).toFixed(3);
    const brightnessVal = (1.0 - settings.grain.intensity * 0.03).toFixed(3);
    filterTokens.push(`contrast(${contrastVal})`, `brightness(${brightnessVal})`);
  }

  if (filterTokens.length > 0) {
    styles.filter = filterTokens.join(' ');
  }

  // 3. Mechanical Gate Weave displacement
  if (settings.gateWeave.enabled) {
    const { dx, dy } = calculateGateWeaveOffset(frame, fps, settings.gateWeave);
    if (dx !== 0 || dy !== 0) {
      styles.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
  }

  return styles;
}

/**
 * Builds an FFmpeg filter string representing the film emulation pipeline for export.
 * Combines FFmpeg's `noise` filter, edge-glow halation, and frame translation.
 */
export function buildFfmpegFilmEmulationFilter(
  settings: FilmEmulationSettings | undefined,
): string {
  if (!settings || !settings.enabled) {
    return '';
  }

  const filters: string[] = [];

  // 1. Film Grain via FFmpeg noise filter
  if (settings.grain?.enabled && settings.grain.intensity > 0) {
    // noise=alls=amount:allf=flags
    // amount in [0..100]
    const grainAmount = Math.round(settings.grain.intensity * 35);
    const flags = settings.grain.chromatic ? 't+u' : 't';
    filters.push(`noise=alls=${grainAmount}:allf=${flags}`);
  }

  // 2. Analog Halation / Warmth
  if (settings.halation?.enabled && settings.halation.intensity > 0) {
    // Subtle warm highlight glow simulation using colorbalance
    const redShift = (settings.halation.intensity * 0.08).toFixed(3);
    filters.push(`colorbalance=rh=${redShift}:gh=-0.02:bh=-0.04`);
  }

  return filters.join(',');
}
