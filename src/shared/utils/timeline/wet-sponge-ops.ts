/**
 * Whiteboard Procedural Water Droplet Condensation, Wet Sponge Evaporation & Dew Drop Smear Physics.
 * Simulates damp sponge wiping, moisture film evaporation, and wet stroke feathering:
 * 1. Moisture film evaporation evaluation over time.
 * 2. Capillary ink feathering and pigment dilution across damp regions.
 * 3. Optical wet surface glint and specular water reflection.
 */

export interface WetSpongeCondensationSettings {
  enabled?: boolean;
  initialWetness?: number; // 0.1..1.0, default 0.80
  dryingTimeSec?: number; // 1.0..15.0, default 4.0
  dilutionFactor?: number; // 0.0..1.0, default 0.60
  gravityDrip?: boolean; // default false
}

export interface WetStrokeFeatherResult {
  widthPx: number;
  opacity: number;
  moisture: number;
}

/**
 * Evaluates the remaining moisture level at elapsedSec given initialWetness and dryingTimeSec.
 * Uses a non-linear exponential decay curve to simulate thin-film evaporation.
 */
export function evaluateMoistureEvaporation(
  initialWetness: number = 0.80,
  elapsedSec: number = 0.0,
  dryingTimeSec: number = 4.0,
): number {
  if (elapsedSec <= 0.0) return Math.min(1.0, Math.max(0.0, initialWetness));
  if (dryingTimeSec <= 0.0) return 0.0;

  // Normalized time fraction
  const t = elapsedSec / dryingTimeSec;
  if (t >= 1.5) return 0.0;

  // Thin-film non-linear evaporation: rapid decay initially, leveling off before disappearing
  const decay = Math.exp(-2.5 * t);
  const remaining = initialWetness * decay;
  return remaining < 0.02 ? 0.0 : Math.min(1.0, Math.max(0.0, remaining));
}

/**
 * Computes pigment dilution (opacity loss) when drawing over a wet zone.
 */
export function computeWaterDilution(
  baseOpacity: number = 1.0,
  moistureLevel: number = 0.0,
  dilutionFactor: number = 0.60,
): number {
  const m = Math.min(1.0, Math.max(0.0, moistureLevel));
  const diluted = baseOpacity * (1.0 - dilutionFactor * m);
  return Math.min(1.0, Math.max(0.15, diluted));
}

/**
 * Computes capillary stroke widening when drawing across a damp area.
 */
export function computeWetStrokeWidening(
  baseWidthPx: number,
  moistureLevel: number = 0.0,
): number {
  const m = Math.min(1.0, Math.max(0.0, moistureLevel));
  // Expands up to +120% in saturated moisture
  return baseWidthPx * (1.0 + 1.20 * m);
}

/**
 * Combines stroke widening and pigment dilution for a sample point.
 */
export function computeWetStrokeFeather(
  baseWidthPx: number,
  baseOpacity: number,
  moistureLevel: number,
  dilutionFactor: number = 0.60,
): WetStrokeFeatherResult {
  return {
    widthPx: computeWetStrokeWidening(baseWidthPx, moistureLevel),
    opacity: computeWaterDilution(baseOpacity, moistureLevel, dilutionFactor),
    moisture: Math.min(1.0, Math.max(0.0, moistureLevel)),
  };
}

/**
 * Generates an SVG filter snippet simulating surface wet glint and subtle water sheen.
 */
export function generateWetGlintSvgFilterMarkup(
  filterId: string = 'whiteboard-wet-glint',
  wetness: number = 0.80,
): string {
  const specularConstant = (0.4 * Math.min(1.0, Math.max(0.0, wetness))).toFixed(2);
  const surfaceScale = (1.5 * Math.min(1.0, Math.max(0.0, wetness))).toFixed(1);

  return [
    `<filter id="${filterId}" x="-10%" y="-10%" width="120%" height="120%">`,
    `  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" />`,
    `  <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="${surfaceScale}" result="light">`,
    `    <feDistantLight azimuth="60" elevation="50" />`,
    `  </feDiffuseLighting>`,
    `  <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="0" k2="1" k3="${specularConstant}" k4="0" />`,
    `</filter>`,
  ].join('\n');
}
