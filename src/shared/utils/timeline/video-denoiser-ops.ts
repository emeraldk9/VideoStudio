export type VideoDenoiserPresetKey =
  | 'subtle_sensor_grain'
  | 'high_iso_digital_noise'
  | 'chroma_blotch_cleaner'
  | 'night_low_light_salvage'
  | 'vintage_analog_restoration';

export interface VideoDenoiserSettings {
  enabled: boolean;
  spatialLumaStrength: number;     // 0.0 to 15.0, default 4.0
  spatialChromaStrength: number;   // 0.0 to 15.0, default 3.0
  temporalLumaStrength: number;    // 0.0 to 20.0, default 6.0
  temporalChromaStrength: number;  // 0.0 to 20.0, default 4.5
  temporalRadius: number;          // 1 to 5 frames, default 2
  chromaDenoiseBoost: boolean;     // Multiplies chroma strengths by 1.5x
  detailSharpenAmount: number;     // 0.0 to 2.0 unsharp mask post-enhancement, default 0.0
  preset?: VideoDenoiserPresetKey;
}

export const DEFAULT_VIDEO_DENOISER_SETTINGS: VideoDenoiserSettings = {
  enabled: false,
  spatialLumaStrength: 4.0,
  spatialChromaStrength: 3.0,
  temporalLumaStrength: 6.0,
  temporalChromaStrength: 4.5,
  temporalRadius: 2,
  chromaDenoiseBoost: false,
  detailSharpenAmount: 0.0,
};

export const VIDEO_DENOISER_PRESETS: Record<VideoDenoiserPresetKey, VideoDenoiserSettings> = {
  subtle_sensor_grain: {
    enabled: true,
    spatialLumaStrength: 2.0,
    spatialChromaStrength: 1.5,
    temporalLumaStrength: 3.5,
    temporalChromaStrength: 2.5,
    temporalRadius: 2,
    chromaDenoiseBoost: false,
    detailSharpenAmount: 0.2,
    preset: 'subtle_sensor_grain',
  },
  high_iso_digital_noise: {
    enabled: true,
    spatialLumaStrength: 5.5,
    spatialChromaStrength: 6.0,
    temporalLumaStrength: 8.0,
    temporalChromaStrength: 7.5,
    temporalRadius: 3,
    chromaDenoiseBoost: true,
    detailSharpenAmount: 0.4,
    preset: 'high_iso_digital_noise',
  },
  chroma_blotch_cleaner: {
    enabled: true,
    spatialLumaStrength: 1.0,
    spatialChromaStrength: 8.0,
    temporalLumaStrength: 2.0,
    temporalChromaStrength: 10.0,
    temporalRadius: 3,
    chromaDenoiseBoost: true,
    detailSharpenAmount: 0.1,
    preset: 'chroma_blotch_cleaner',
  },
  night_low_light_salvage: {
    enabled: true,
    spatialLumaStrength: 9.0,
    spatialChromaStrength: 9.5,
    temporalLumaStrength: 14.0,
    temporalChromaStrength: 12.0,
    temporalRadius: 4,
    chromaDenoiseBoost: true,
    detailSharpenAmount: 0.7,
    preset: 'night_low_light_salvage',
  },
  vintage_analog_restoration: {
    enabled: true,
    spatialLumaStrength: 7.0,
    spatialChromaStrength: 5.0,
    temporalLumaStrength: 10.0,
    temporalChromaStrength: 8.0,
    temporalRadius: 2,
    chromaDenoiseBoost: false,
    detailSharpenAmount: 0.5,
    preset: 'vintage_analog_restoration',
  },
};

/**
 * Calculates a composite noise reduction index from 0.0 (clean / bypassed) to 1.0 (maximum heavy denoising).
 */
export function calculateEffectiveNoiseReductionRatio(settings: VideoDenoiserSettings | undefined): number {
  if (!settings || !settings.enabled) {
    return 0;
  }

  const chromaMult = settings.chromaDenoiseBoost ? 1.5 : 1.0;
  const spatialScore = (settings.spatialLumaStrength / 15.0 + (settings.spatialChromaStrength * chromaMult) / 15.0) / 2.0;
  const temporalScore = (settings.temporalLumaStrength / 20.0 + (settings.temporalChromaStrength * chromaMult) / 20.0) / 2.0;
  const radiusScore = (settings.temporalRadius - 1) / 4.0; // 1..5 mapped to 0..1

  // Weighted combination: 45% temporal, 35% spatial, 20% radius
  const combined = (temporalScore * 0.45) + (spatialScore * 0.35) + (radiusScore * 0.20);
  return Math.min(1.0, Math.max(0.0, Math.round(combined * 100) / 100));
}

/**
 * Builds the FFmpeg video filter expression for 3D temporal/spatial denoising (`hqdn3d`)
 * and post-denoising detail unsharp masking (`unsharp`).
 */
export function buildFfmpegVideoDenoiserFilter(settings: VideoDenoiserSettings | undefined): string {
  if (!settings || !settings.enabled) {
    return '';
  }

  const chromaMult = settings.chromaDenoiseBoost ? 1.5 : 1.0;
  const lumaSpatial = Math.max(0.0, Math.min(15.0, settings.spatialLumaStrength)).toFixed(2);
  const chromaSpatial = Math.max(0.0, Math.min(22.5, settings.spatialChromaStrength * chromaMult)).toFixed(2);
  const lumaTmp = Math.max(0.0, Math.min(20.0, settings.temporalLumaStrength)).toFixed(2);
  const chromaTmp = Math.max(0.0, Math.min(30.0, settings.temporalChromaStrength * chromaMult)).toFixed(2);

  const filters: string[] = [];
  filters.push(`hqdn3d=${lumaSpatial}:${chromaSpatial}:${lumaTmp}:${chromaTmp}`);

  if (settings.detailSharpenAmount > 0.01) {
    const sharpenAmount = Math.max(0.0, Math.min(2.0, settings.detailSharpenAmount)).toFixed(2);
    // 5x5 matrix unsharp mask on luma plane
    filters.push(`unsharp=5:5:${sharpenAmount}:5:5:0.0`);
  }

  return filters.join(',');
}
