/**
 * Metallic Foil Embossing & Hot Stamp Shimmer Shader Pipeline.
 *
 * Implements luxury hot foil stamping, micro-faceted metallic reflection,
 * emboss relief height mapping, normal derivation, and holographic diffraction iridescence.
 */

export type FoilPreset = 'gold' | 'silver' | 'rose_gold' | 'copper' | 'holographic';

export interface FoilConfig {
  enabled: boolean;
  preset: FoilPreset;
  embossHeightPx: number;      // Relief height in px (0.5..8.0, default: 2.5)
  bevelWidthPx: number;        // Edge bevel transition in px (1.0..10.0, default: 3.0)
  specularShininess: number;   // Blinn-Phong shininess exponent (8..128, default: 32)
  lightAngleDeg: number;       // Light azimuth angle (0..360, default: 45)
  lightElevationDeg: number;   // Light altitude angle (15..85, default: 60)
  shimmerSpeed: number;        // Animated light sweep rate (0..3.0, default: 1.0)
  sparkleIntensity: number;    // Flake glint specular sparkle (0..1.0, default: 0.35)
  foleyPressVolume: number;    // Hot stamp press & peel audio volume (0..1.0, default: 0.70)
}

export type FoilSettings = Partial<FoilConfig>;

export const DEFAULT_FOIL_CONFIG: FoilConfig = {
  enabled: false,
  preset: 'gold',
  embossHeightPx: 2.5,
  bevelWidthPx: 3.0,
  specularShininess: 32.0,
  lightAngleDeg: 45.0,
  lightElevationDeg: 60.0,
  shimmerSpeed: 1.0,
  sparkleIntensity: 0.35,
  foleyPressVolume: 0.70,
};

export const FOIL_PRESET_HEX: Record<FoilPreset, string> = {
  gold: '#D4AF37',
  silver: '#E6E8FA',
  rose_gold: '#B76E79',
  copper: '#B87333',
  holographic: '#C8C8C8',
};

export interface FoilFoleyTelemetry {
  pressThumpGain: number;
  thermalHissGain: number;
  peelCrinkleGain: number;
  peakFrequencyHz: number;
  cycleDurationSec: number;
}

/**
 * Validates and clamps metallic foil configuration parameters.
 */
export function validateFoilConfig(config?: Partial<FoilConfig>): FoilConfig {
  if (!config) {
    return { ...DEFAULT_FOIL_CONFIG };
  }

  const validPresets: FoilPreset[] = ['gold', 'silver', 'rose_gold', 'copper', 'holographic'];
  const preset = validPresets.includes(config.preset as FoilPreset)
    ? (config.preset as FoilPreset)
    : DEFAULT_FOIL_CONFIG.preset;

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_FOIL_CONFIG.enabled),
    preset,
    embossHeightPx: Math.max(0.5, Math.min(8.0, config.embossHeightPx ?? DEFAULT_FOIL_CONFIG.embossHeightPx)),
    bevelWidthPx: Math.max(1.0, Math.min(10.0, config.bevelWidthPx ?? DEFAULT_FOIL_CONFIG.bevelWidthPx)),
    specularShininess: Math.max(8.0, Math.min(128.0, config.specularShininess ?? DEFAULT_FOIL_CONFIG.specularShininess)),
    lightAngleDeg: Math.max(0.0, Math.min(360.0, config.lightAngleDeg ?? DEFAULT_FOIL_CONFIG.lightAngleDeg)),
    lightElevationDeg: Math.max(15.0, Math.min(85.0, config.lightElevationDeg ?? DEFAULT_FOIL_CONFIG.lightElevationDeg)),
    shimmerSpeed: Math.max(0.0, Math.min(3.0, config.shimmerSpeed ?? DEFAULT_FOIL_CONFIG.shimmerSpeed)),
    sparkleIntensity: Math.max(0.0, Math.min(1.0, config.sparkleIntensity ?? DEFAULT_FOIL_CONFIG.sparkleIntensity)),
    foleyPressVolume: Math.max(0.0, Math.min(1.0, config.foleyPressVolume ?? DEFAULT_FOIL_CONFIG.foleyPressVolume)),
  };
}

/**
 * Resolves the base hexadecimal tint for a foil preset, supporting animated holographic hue offset.
 */
export function resolveFoilBaseHex(preset: FoilPreset, hueOffset: number = 0.0): string {
  if (preset !== 'holographic') {
    return FOIL_PRESET_HEX[preset] ?? FOIL_PRESET_HEX.gold;
  }
  const h = (hueOffset % 1.0 + 1.0) % 1.0;
  // Convert HSV to Hex (S=0.75, V=0.95)
  const s = 0.75;
  const v = 0.95;
  const c = v * s;
  const x = c * (1.0 - Math.abs(((h * 6.0) % 2.0) - 1.0));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(h * 6.0);
  if (sector === 0) { r = c; g = x; b = 0; }
  else if (sector === 1) { r = x; g = c; b = 0; }
  else if (sector === 2) { r = 0; g = c; b = x; }
  else if (sector === 3) { r = 0; g = x; b = c; }
  else if (sector === 4) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);

  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
}

/**
 * Computes normalized 3D light vector from azimuth and altitude angles.
 */
export function computeLightVector3D(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const azRad = (azimuthDeg * Math.PI) / 180.0;
  const elRad = (elevationDeg * Math.PI) / 180.0;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.sin(elRad);
  const len = Math.hypot(lx, ly, lz) || 1.0;
  return [lx / len, ly / len, lz / len];
}

/**
 * Derives normalized 3D surface normal vector for an emboss bevel edge.
 */
export function computeEmbossNormal3D(
  dx: number,
  dy: number,
  bevelWidth: number,
  embossHeight: number
): [number, number, number] {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) {
    return [0, 0, 1];
  }
  // Bevel slope dh/ddist
  const clampedDist = Math.min(dist, bevelWidth);
  const slope = (embossHeight / Math.max(1.0, bevelWidth)) * (1.0 - clampedDist / bevelWidth);

  const nx = -(dx / dist) * slope;
  const ny = -(dy / dist) * slope;
  const nz = 1.0;

  const len = Math.hypot(nx, ny, nz) || 1.0;
  return [nx / len, ny / len, nz / len];
}

/**
 * Calculates specular reflection intensity using Blinn-Phong half-angle formula.
 */
export function calculateFoilSpecularIntensity(
  normal: [number, number, number],
  lightDir: [number, number, number],
  shininess: number
): number {
  const viewDir: [number, number, number] = [0, 0, 1];
  const hx = lightDir[0] + viewDir[0];
  const hy = lightDir[1] + viewDir[1];
  const hz = lightDir[2] + viewDir[2];
  const hLen = Math.hypot(hx, hy, hz) || 1.0;
  const halfNorm: [number, number, number] = [hx / hLen, hy / hLen, hz / hLen];

  const nDotH = Math.max(0.0, normal[0] * halfNorm[0] + normal[1] * halfNorm[1] + normal[2] * halfNorm[2]);
  return Math.pow(nDotH, shininess);
}

/**
 * Calculates dynamic holographic rainbow diffraction hue based on normal and sweep time.
 */
export function calculateHolographicHue(
  normal: [number, number, number],
  timeSec: number,
  shimmerSpeed: number
): number {
  const nDotV = Math.max(0.0, normal[2]);
  const hue = (timeSec * shimmerSpeed * 0.2 + nDotV * 0.6 + normal[0] * 0.3) % 1.0;
  return (hue + 1.0) % 1.0;
}

/**
 * Generates SVG filter definition XML markup implementing metallic bump embossing.
 */
export function generateFoilSvgFilters(config: FoilConfig, filterId: string = 'metallic-foil-emboss'): string {
  const lightVec = computeLightVector3D(config.lightAngleDeg, config.lightElevationDeg);
  const baseHex = resolveFoilBaseHex(config.preset);

  return `
<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
  <!-- 1. Height map blur for bevel profile -->
  <feGaussianBlur in="SourceAlpha" stdDeviation="${(config.bevelWidthPx * 0.5).toFixed(1)}" result="blur" />
  <!-- 2. Diffuse and specular lighting bump mapping -->
  <feSpecularLighting in="blur" surfaceScale="${config.embossHeightPx.toFixed(1)}" specularConstant="1.2" specularExponent="${config.specularShininess.toFixed(1)}" lighting-color="#FFFFFF" result="specOut">
    <feDistantLight azimuth="${config.lightAngleDeg.toFixed(1)}" elevation="${config.lightElevationDeg.toFixed(1)}" />
  </feSpecularLighting>
  <feDiffuseLighting in="blur" surfaceScale="${config.embossHeightPx.toFixed(1)}" diffuseConstant="0.9" lighting-color="${baseHex}" result="diffOut">
    <feDistantLight azimuth="${config.lightAngleDeg.toFixed(1)}" elevation="${config.lightElevationDeg.toFixed(1)}" />
  </feDiffuseLighting>
  <!-- 3. Composite diffuse and specular highlight -->
  <feComposite in="diffOut" in2="SourceGraphic" operator="in" result="litFoil" />
  <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specMasked" />
  <feBlend in="specMasked" in2="litFoil" mode="screen" result="finalFoil" />
</filter>
  `.trim();
}

/**
 * Computes acoustic foley parameters for hot stamping heat press and foil peel.
 */
export function computeFoilFoleyTelemetry(
  durationSec: number,
  config?: Partial<FoilConfig>
): FoilFoleyTelemetry {
  const cfg = validateFoilConfig(config);
  const volume = cfg.foleyPressVolume;
  const embossHeight = cfg.embossHeightPx;

  const pressThumpGain = Math.min(1.0, Math.max(0.0, volume * (0.6 + embossHeight * 0.15)));
  const thermalHissGain = Math.min(1.0, Math.max(0.0, volume * 0.55));
  const peelCrinkleGain = Math.min(1.0, Math.max(0.0, volume * 0.75));
  const peakFrequencyHz = Math.min(220.0, Math.max(50.0, 85.0 + embossHeight * 10.0));

  return {
    pressThumpGain,
    thermalHissGain,
    peelCrinkleGain,
    peakFrequencyHz,
    cycleDurationSec: Math.max(0.5, durationSec),
  };
}
