/**
 * Whiteboard Multi-Source Hand Lighting & Dual-Penumbra Contact Shadows.
 * Simulates studio multi-point illumination (Key Light + Fill Light) casting realistic
 * dual-penumbra overlapping contact shadows and ambient occlusion onto the whiteboard substrate:
 * 1. Key Light: Direct primary illumination producing a crisp contact umbra at the stylus nib.
 * 2. Fill Light: Secondary diffuse luminaire producing a softer, broader penumbra shadow.
 * 3. Photometric Dual-Penumbra Fusion: Light transmission multiplication T_total = T_key * T_fill.
 * 4. Dynamic Elevation Falloff: Inverse-square / distance-based diffusion as the hand lifts.
 * 5. Chromatic Temperature Tinting: Key light (warm/neutral) vs. Fill light (cool ambient skylight).
 */

export interface LightLuminaireConfig {
  angleDeg: number;       // Compass angle: 0..360 (0° N, 90° E, 180° S, 270° W, 315° NW)
  intensity: number;      // Radiant intensity factor (0.0..1.0)
  distancePx: number;     // Shadow offset distance at zero elevation
  blurRadiusPx: number;   // Penumbra Gaussian blur radius
  colorRgb?: [number, number, number]; // Shadow tint color [R, G, B]
}

export interface MultiSourceLightingSettings {
  enabled?: boolean;
  keyLight?: Partial<LightLuminaireConfig>;
  fillLight?: Partial<LightLuminaireConfig>;
  ambientOcclusionIntensity?: number; // 0.0..1.0 (default 0.35)
  liftHeightPx?: number;              // Z-elevation above board (0 = touching)
  inverseSquareFalloff?: boolean;     // Blur & diffusion increase with elevation
}

export const DEFAULT_KEY_LIGHT: LightLuminaireConfig = {
  angleDeg: 315.0,
  intensity: 0.75,
  distancePx: 14.0,
  blurRadiusPx: 10.0,
  colorRgb: [30, 28, 25],
};

export const DEFAULT_FILL_LIGHT: LightLuminaireConfig = {
  angleDeg: 45.0,
  intensity: 0.35,
  distancePx: 22.0,
  blurRadiusPx: 20.0,
  colorRgb: [20, 25, 32],
};

export const DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS: Required<MultiSourceLightingSettings> = {
  enabled: false,
  keyLight: DEFAULT_KEY_LIGHT,
  fillLight: DEFAULT_FILL_LIGHT,
  ambientOcclusionIntensity: 0.35,
  liftHeightPx: 0.0,
  inverseSquareFalloff: true,
};

/**
 * Computes 2D directional projection offset vector [dx, dy] cast by a luminaire.
 * Compass lighting model: 0° = Top/North, 90° = Right/East, 180° = Bottom/South, 270° = Left/West, 315° = Top-Left/NW.
 */
export function computeLuminaireOffsetVector(
  angleDeg = 315.0,
  distancePx = 14.0,
  liftHeightPx = 0.0
): [number, number] {
  const elev = Math.max(0, liftHeightPx);
  const dist = distancePx * (1.0 + elev * 0.04);
  const rad = (angleDeg * Math.PI) / 180.0;
  // Light at angle casts shadow in opposite direction: dx = -dist*sin(rad), dy = dist*cos(rad)
  const dx = Math.round(-dist * Math.sin(rad) * 100) / 100;
  const dy = Math.round(dist * Math.cos(rad) * 100) / 100;
  return [dx, dy];
}

/**
 * Calculates effective penumbra blur radius accounting for inverse-square elevation falloff.
 */
export function calculateEffectivePenumbraBlur(
  baseBlurPx = 10.0,
  liftHeightPx = 0.0,
  inverseSquare = true
): number {
  const elev = Math.max(0, liftHeightPx);
  const factor = inverseSquare
    ? Math.sqrt(1.0 + elev * 0.08)
    : (1.0 + elev * 0.04);
  return Math.max(2.0, Math.round(baseBlurPx * factor * 10) / 10);
}

/**
 * Computes photometric dual-penumbra fusion attenuation.
 * Total transmission: T_total = T_key * T_fill = (1 - S_key) * (1 - S_fill)
 * Returns composite attenuation in range 0.0..1.0.
 */
export function computePhotometricDualPenumbra(
  keyAlpha: number,
  fillAlpha: number,
  keyIntensity = 0.75,
  fillIntensity = 0.35
): number {
  const normKey = Math.max(0.0, Math.min(1.0, keyAlpha * keyIntensity));
  const normFill = Math.max(0.0, Math.min(1.0, fillAlpha * fillIntensity));
  const tKey = 1.0 - normKey;
  const tFill = 1.0 - normFill;
  const tTotal = Math.max(0.0, Math.min(1.0, tKey * tFill));
  return Math.round((1.0 - tTotal) * 1000) / 1000;
}

/**
 * Generates chained CSS drop-shadow filters representing Key Light, Fill Light, and Contact AO.
 */
export function generateMultiSourceShadowCssFilters(
  settings?: MultiSourceLightingSettings,
  isLifting = false
): string {
  const keyCfg: LightLuminaireConfig = {
    ...DEFAULT_KEY_LIGHT,
    ...(settings?.keyLight || {}),
  };
  const fillCfg: LightLuminaireConfig = {
    ...DEFAULT_FILL_LIGHT,
    ...(settings?.fillLight || {}),
  };
  const enabled = settings?.enabled ?? DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS.enabled;
  let liftHeight = settings?.liftHeightPx ?? DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS.liftHeightPx;
  if (isLifting && liftHeight < 8.0) {
    liftHeight = 8.0;
  }
  const inverseSquare = settings?.inverseSquareFalloff ?? DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS.inverseSquareFalloff;
  const aoIntensity = settings?.ambientOcclusionIntensity ?? DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS.ambientOcclusionIntensity;

  if (!enabled) {
    return 'none';
  }

  const filters: string[] = [];

  // 1. Key Light Shadow
  if (keyCfg.intensity > 0.01) {
    const [kdx, kdy] = computeLuminaireOffsetVector(keyCfg.angleDeg, keyCfg.distancePx, liftHeight);
    const kBlur = calculateEffectivePenumbraBlur(keyCfg.blurRadiusPx, liftHeight, inverseSquare);
    const kAlpha = Math.round(keyCfg.intensity * 0.45 * 100) / 100;
    const [kr, kg, kb] = keyCfg.colorRgb || DEFAULT_KEY_LIGHT.colorRgb!;
    filters.push(`drop-shadow(${kdx}px ${kdy}px ${kBlur}px rgba(${kr}, ${kg}, ${kb}, ${kAlpha}))`);
  }

  // 2. Fill Light Shadow
  if (fillCfg.intensity > 0.01) {
    const [fdx, fdy] = computeLuminaireOffsetVector(fillCfg.angleDeg, fillCfg.distancePx, liftHeight);
    const fBlur = calculateEffectivePenumbraBlur(fillCfg.blurRadiusPx, liftHeight, inverseSquare);
    const fAlpha = Math.round(fillCfg.intensity * 0.35 * 100) / 100;
    const [fr, fg, fb] = fillCfg.colorRgb || DEFAULT_FILL_LIGHT.colorRgb!;
    filters.push(`drop-shadow(${fdx}px ${fdy}px ${fBlur}px rgba(${fr}, ${fg}, ${fb}, ${fAlpha}))`);
  }

  // 3. Contact Ambient Occlusion (tight micro-shadow when on board)
  if (!isLifting && liftHeight < 2.0 && aoIntensity > 0.01) {
    const aoAlpha = Math.round(aoIntensity * 0.50 * 100) / 100;
    filters.push(`drop-shadow(0px 1px 3px rgba(10, 10, 10, ${aoAlpha}))`);
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}
