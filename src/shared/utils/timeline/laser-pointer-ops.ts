/**
 * Whiteboard Laser Pointer Tracker, Optical Phosphor Persistence & Luminescent Afterglow Operations.
 * Simulates high-energy optical laser pointer kinematics and phosphorescent decay:
 * 1. Monochromatic laser spot with white-hot specular center and chromatic dispersion halo.
 * 2. Exponential temporal decay afterglow trails along motion trajectories.
 * 3. Spectral wavelength presets: Emerald Green (532nm), Ruby Red (650nm), and Violet (405nm).
 */

export type LaserColorPreset = 'emerald' | 'ruby' | 'violet';

export interface LaserPointerSettings {
  enabled?: boolean;
  colorPreset?: LaserColorPreset; // default 'emerald'
  customColorHex?: string;
  coreRadiusPx?: number; // 2..8 px, default 3.5
  haloRadiusPx?: number; // 8..30 px, default 16.0
  persistenceSec?: number; // 0.2..2.5s, default 0.8
  trailIntensity?: number; // 0.3..1.5, default 0.90
}

export const LASER_COLORS: Record<LaserColorPreset, string> = {
  emerald: '#00ff66',
  ruby: '#ff2233',
  violet: '#aa33ff',
};

/**
 * Resolves active laser beam color hex code from preset or custom hex.
 */
export function resolveLaserColor(
  preset: LaserColorPreset = 'emerald',
  customHex?: string,
): string {
  if (customHex && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(customHex)) {
    return customHex;
  }
  return LASER_COLORS[preset] ?? LASER_COLORS.emerald;
}

/**
 * Calculates exponential phosphorescent afterglow decay weight over elapsed time.
 */
export function evaluatePhosphorDecay(
  elapsedSec: number = 0.0,
  persistenceSec: number = 0.80,
): number {
  if (elapsedSec <= 0.0) return 1.0;
  const tau = Math.max(0.05, persistenceSec);
  const decay = Math.exp(-elapsedSec / tau);
  return decay < 0.01 ? 0.0 : Math.min(1.0, Math.max(0.0, decay));
}

/**
 * Generates SVG filter markup simulating a high-intensity laser bloom halo around pointer elements.
 */
export function generateLaserPointerSvgFilterMarkup(
  filterId: string = 'laser-pointer-bloom',
  colorHex: string = '#00ff66',
  haloRadiusPx: number = 16.0,
): string {
  const stdDev = (haloRadiusPx * 0.45).toFixed(1);

  return [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
    `  <!-- Specular sharp core -->`,
    `  <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="core" />`,
    `  <!-- Wide chromatic dispersion halo -->`,
    `  <feGaussianBlur in="SourceGraphic" stdDeviation="${stdDev}" result="haloBlur" />`,
    `  <feFlood flood-color="${colorHex}" flood-opacity="0.9" result="laserColor" />`,
    `  <feComposite in="laserColor" in2="haloBlur" operator="in" result="coloredHalo" />`,
    `  <!-- Multi-layer optical composite -->`,
    `  <feMerge>`,
    `    <feMergeNode in="coloredHalo" />`,
    `    <feMergeNode in="core" />`,
    `    <feMergeNode in="SourceGraphic" />`,
    `  </feMerge>`,
    `</filter>`,
  ].join('\n');
}
