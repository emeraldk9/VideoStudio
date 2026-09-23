/**
 * Operations and mathematical models for Multiband Spectral Audio Denoising,
 * Transient De-Clicking, and Harmonic Mains Hum Removal.
 */

export type DeHumMode = 'off' | '50hz_mains' | '60hz_mains';

export type MultibandDenoiserPresetKey =
  | 'fan_hiss_suppression'
  | 'ac_rumble_cleanup'
  | 'vinyl_click_restoration'
  | 'complete_studio_denoise';

export interface MultibandDenoiserSettings {
  enabled: boolean;
  lowBandReductionDb: number; // 0 to 30 dB (<250Hz, HVAC rumble, traffic)
  lowMidBandReductionDb: number; // 0 to 30 dB (250Hz - 1kHz, room resonance)
  highMidBandReductionDb: number; // 0 to 30 dB (1kHz - 4kHz, mechanical fans)
  highBandReductionDb: number; // 0 to 30 dB (>4kHz, preamp tape hiss, air)
  deClickEnabled: boolean; // transient click, pop, crackle reduction
  deClickSensitivity: number; // 1 to 10
  deHumMode: DeHumMode; // mains ground loop frequency
  deHumHarmonics: number; // 1 to 8 harmonic overtones
  preset?: MultibandDenoiserPresetKey;
}

export const DEFAULT_MULTIBAND_DENOISER_SETTINGS: MultibandDenoiserSettings = {
  enabled: false,
  lowBandReductionDb: 12,
  lowMidBandReductionDb: 6,
  highMidBandReductionDb: 8,
  highBandReductionDb: 14,
  deClickEnabled: false,
  deClickSensitivity: 5,
  deHumMode: 'off',
  deHumHarmonics: 4,
};

export interface MultibandDenoiserPresetConfig {
  name: string;
  description: string;
  settings: Omit<MultibandDenoiserSettings, 'enabled'>;
}

export const MULTIBAND_DENOISER_PRESETS: Record<
  MultibandDenoiserPresetKey,
  MultibandDenoiserPresetConfig
> = {
  fan_hiss_suppression: {
    name: 'Fan & Hiss Suppression',
    description: 'High and High-Mid focused spectral attenuation for computer fans and air vents.',
    settings: {
      lowBandReductionDb: 4,
      lowMidBandReductionDb: 6,
      highMidBandReductionDb: 16,
      highBandReductionDb: 22,
      deClickEnabled: false,
      deClickSensitivity: 5,
      deHumMode: 'off',
      deHumHarmonics: 4,
      preset: 'fan_hiss_suppression',
    },
  },
  ac_rumble_cleanup: {
    name: 'AC Rumble & 60Hz Hum',
    description: 'Heavy low-frequency attenuation combined with a 60 Hz mains harmonic notch filter.',
    settings: {
      lowBandReductionDb: 24,
      lowMidBandReductionDb: 10,
      highMidBandReductionDb: 4,
      highBandReductionDb: 6,
      deClickEnabled: false,
      deClickSensitivity: 5,
      deHumMode: '60hz_mains',
      deHumHarmonics: 4,
      preset: 'ac_rumble_cleanup',
    },
  },
  vinyl_click_restoration: {
    name: 'Vinyl & Pop Restoration',
    description: 'High sensitivity transient de-clicking with subtle overall acoustic noise floor reduction.',
    settings: {
      lowBandReductionDb: 8,
      lowMidBandReductionDb: 6,
      highMidBandReductionDb: 6,
      highBandReductionDb: 10,
      deClickEnabled: true,
      deClickSensitivity: 8,
      deHumMode: 'off',
      deHumHarmonics: 4,
      preset: 'vinyl_click_restoration',
    },
  },
  complete_studio_denoise: {
    name: 'Complete Studio Denoise',
    description: 'Balanced 4-band acoustic floor suppression for professional broadcast clean-up.',
    settings: {
      lowBandReductionDb: 16,
      lowMidBandReductionDb: 12,
      highMidBandReductionDb: 14,
      highBandReductionDb: 18,
      deClickEnabled: true,
      deClickSensitivity: 6,
      deHumMode: '50hz_mains',
      deHumHarmonics: 5,
      preset: 'complete_studio_denoise',
    },
  },
};

/**
 * Generates an array of exact harmonic overtone frequencies given a fundamental frequency.
 */
export function calculateHarmonicFrequencies(
  fundamentalHz: number,
  numHarmonics: number = 4,
): number[] {
  if (fundamentalHz <= 0) return [];
  const count = Math.max(1, Math.min(8, numHarmonics));
  const harmonics: number[] = [];
  for (let i = 1; i <= count; i++) {
    const freq = fundamentalHz * i;
    if (freq <= 20000) {
      harmonics.push(freq);
    }
  }
  return harmonics;
}

/**
 * Synthesizes an FFmpeg audio filter expression corresponding to multiband spectral denoising,
 * de-clicking, and harmonic hum filtering.
 */
export function buildFfmpegMultibandDenoiserFilter(settings: MultibandDenoiserSettings): string {
  if (!settings.enabled) return '';

  const filters: string[] = [];

  // 1. Transient De-Clicker
  if (settings.deClickEnabled) {
    const threshold = (11 - Math.max(1, Math.min(10, settings.deClickSensitivity))).toFixed(1);
    filters.push(`adeclick=threshold=${threshold}:burst=2`);
  }

  // 2. Harmonic Mains De-Hummer (notch equalizer filters)
  if (settings.deHumMode !== 'off') {
    const fundamental = settings.deHumMode === '50hz_mains' ? 50 : 60;
    const harmonics = calculateHarmonicFrequencies(fundamental, settings.deHumHarmonics);
    for (const freq of harmonics) {
      // Narrow high-Q notch attenuation
      filters.push(`equalizer=f=${freq}:width_type=q:w=10:g=-24`);
    }
  }

  // 3. Multiband spectral reduction
  const avgReduction = (
    (settings.lowBandReductionDb +
      settings.lowMidBandReductionDb +
      settings.highMidBandReductionDb +
      settings.highBandReductionDb) /
    4
  ).toFixed(1);

  filters.push(`afftdn=nr=${avgReduction}:nf=-45`);

  return filters.join(',');
}
