/**
 * Operations and mathematical models for High-Dynamic Range (HDR) Tone Mapping,
 * ACES Color Science, and False Color Exposure HUD.
 */

export type HdrToneCurve = 'aces_filmic' | 'hable' | 'reinhard' | 'mobius';

export type HdrToneMappingPresetKey =
  | 'aces_rec709_cinema'
  | 'filmic_soft_rolloff'
  | 'high_contrast_punch'
  | 'broadcast_safe_sdr';

export interface HdrToneMappingSettings {
  enabled: boolean;
  curve: HdrToneCurve;
  targetPeakNits: number; // 100 to 4000 nits
  desaturation: number; // 0.0 to 1.0 (highlight desaturation)
  exposureCompensationEv: number; // -4.0 to +4.0 EV
  falseColorEnabled: boolean; // 16-step false color exposure heatmap
  preset?: HdrToneMappingPresetKey;
}

export const DEFAULT_HDR_TONE_MAPPING_SETTINGS: HdrToneMappingSettings = {
  enabled: false,
  curve: 'aces_filmic',
  targetPeakNits: 100,
  desaturation: 0.4,
  exposureCompensationEv: 0.0,
  falseColorEnabled: false,
};

export interface HdrToneMappingPresetConfig {
  name: string;
  description: string;
  settings: Omit<HdrToneMappingSettings, 'enabled'>;
}

export const HDR_TONE_MAPPING_PRESETS: Record<HdrToneMappingPresetKey, HdrToneMappingPresetConfig> = {
  aces_rec709_cinema: {
    name: 'ACES Rec.709 Cinema',
    description: 'Academy ACES tone compression preserving skin tones with filmic shoulder rolloff.',
    settings: {
      curve: 'aces_filmic',
      targetPeakNits: 100,
      desaturation: 0.45,
      exposureCompensationEv: 0.0,
      falseColorEnabled: false,
      preset: 'aces_rec709_cinema',
    },
  },
  filmic_soft_rolloff: {
    name: 'Filmic Soft Shoulder',
    description: 'Hable curve with gentle highlight compression preventing blown-out skies.',
    settings: {
      curve: 'hable',
      targetPeakNits: 100,
      desaturation: 0.35,
      exposureCompensationEv: 0.2,
      falseColorEnabled: false,
      preset: 'filmic_soft_rolloff',
    },
  },
  high_contrast_punch: {
    name: 'HDR Punch (1000 Nits)',
    description: 'Expanded dynamic range tone mapping tuned for HDR10 displays and high-contrast visuals.',
    settings: {
      curve: 'mobius',
      targetPeakNits: 1000,
      desaturation: 0.2,
      exposureCompensationEv: -0.3,
      falseColorEnabled: false,
      preset: 'high_contrast_punch',
    },
  },
  broadcast_safe_sdr: {
    name: 'Broadcast Safe SDR',
    description: 'Strict 100 nits ceiling with linear Reinhard compression avoiding legal gamut violations.',
    settings: {
      curve: 'reinhard',
      targetPeakNits: 100,
      desaturation: 0.6,
      exposureCompensationEv: 0.0,
      falseColorEnabled: false,
      preset: 'broadcast_safe_sdr',
    },
  },
};

/**
 * False color exposure scale representation with standard IRE benchmarks.
 */
export interface FalseColorScaleItem {
  ireMin: number;
  ireMax: number;
  colorHex: string;
  label: string;
}

export const FALSE_COLOR_IRE_SCALE: FalseColorScaleItem[] = [
  { ireMin: 0, ireMax: 5, colorHex: '#4b0082', label: 'Black Crush (<5 IRE)' },
  { ireMin: 5, ireMax: 20, colorHex: '#0000ff', label: 'Deep Shadow (5-20 IRE)' },
  { ireMin: 20, ireMax: 35, colorHex: '#00ced1', label: 'Shadow Detail (20-35 IRE)' },
  { ireMin: 38, ireMax: 42, colorHex: '#00ff00', label: '18% Middle Gray (38-42 IRE)' },
  { ireMin: 60, ireMax: 70, colorHex: '#ff69b4', label: 'Skin Tone Reference (60-70 IRE)' },
  { ireMin: 85, ireMax: 95, colorHex: '#ffa500', label: 'Near Highlight (85-95 IRE)' },
  { ireMin: 98, ireMax: 109, colorHex: '#ff0000', label: 'Clipping / Blown Highlight (>98 IRE)' },
];

/**
 * Calculates Academy ACES filmic tone reproduction for linear luminance x >= 0:
 * f(x) = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
 * Clamped strictly to [0.0, 1.0].
 */
export function calculateAcesFilmicTone(linearLuma: number): number {
  const x = Math.max(0, linearLuma);
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  const mapped = (x * (a * x + b)) / (x * (c * x + d) + e);
  return Number(Math.max(0, Math.min(1, mapped)).toFixed(4));
}

/**
 * Calculates Hable / Uncharted 2 filmic curve:
 * f(x) = ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F
 */
export function calculateHableTone(linearLuma: number): number {
  const x = Math.max(0, linearLuma);
  const A = 0.15;
  const B = 0.5;
  const C = 0.1;
  const D = 0.2;
  const E = 0.02;
  const F = 0.3;

  const hableFunc = (val: number) =>
    ((val * (A * val + C * B) + D * E) / (val * (A * val + B) + D * F)) - E / F;

  const whitePoint = 11.2;
  const numerator = hableFunc(x);
  const denominator = hableFunc(whitePoint);

  if (denominator <= 0) return 0;
  const mapped = numerator / denominator;
  return Number(Math.max(0, Math.min(1, mapped)).toFixed(4));
}

/**
 * Maps normalized luminance [0.0 - 1.0] to false color IRE RGB values.
 */
export function mapLumaToFalseColor(luma01: number): {
  r: number;
  g: number;
  b: number;
  label: string;
} {
  const ire = Math.max(0, Math.min(109, Math.round(luma01 * 100)));

  if (ire <= 5) {
    return { r: 75, g: 0, b: 130, label: 'Crushed Black' }; // Indigo
  } else if (ire <= 20) {
    return { r: 0, g: 0, b: 255, label: 'Deep Shadows' }; // Blue
  } else if (ire <= 35) {
    return { r: 0, g: 206, b: 209, label: 'Shadow Detail' }; // Dark Turquoise
  } else if (ire >= 38 && ire <= 42) {
    return { r: 0, g: 255, b: 0, label: '18% Middle Gray' }; // Green
  } else if (ire >= 60 && ire <= 70) {
    return { r: 255, g: 105, b: 180, label: 'Skin Tones' }; // Hot Pink
  } else if (ire >= 85 && ire <= 95) {
    return { r: 255, g: 165, b: 0, label: 'Near Highlight' }; // Orange
  } else if (ire >= 98) {
    return { r: 255, g: 0, b: 0, label: 'Clipping Highlight' }; // Red
  }

  // Grayscale intermediate
  const grayVal = Math.round(luma01 * 255);
  return { r: grayVal, g: grayVal, b: grayVal, label: `${ire} IRE Neutral` };
}

/**
 * Synthesizes an FFmpeg `tonemap` and `zscale` filter string for HDR color compression.
 */
export function buildFfmpegToneMappingFilter(settings: HdrToneMappingSettings): string {
  if (!settings.enabled) return '';

  const curveMap: Record<HdrToneCurve, string> = {
    aces_filmic: 'hable',
    hable: 'hable',
    reinhard: 'reinhard',
    mobius: 'mobius',
  };

  const tonemapAlgo = curveMap[settings.curve] ?? 'hable';
  const desat = settings.desaturation.toFixed(2);
  const peakNits = Math.max(100, Math.min(4000, settings.targetPeakNits));

  const filters: string[] = [];

  // Exposure EV pre-gain
  if (Math.abs(settings.exposureCompensationEv) > 0.05) {
    const gain = Math.pow(2, settings.exposureCompensationEv);
    const brightOffset = (gain - 1).toFixed(2);
    filters.push(`eq=brightness=${brightOffset}`);
  }

  filters.push(`tonemap=tonemap=${tonemapAlgo}:desat=${desat}:peak=${peakNits}`);

  // When false color is enabled on export
  if (settings.falseColorEnabled) {
    filters.push('pseudocolor=preset=false_color');
  }

  return filters.join(',');
}
