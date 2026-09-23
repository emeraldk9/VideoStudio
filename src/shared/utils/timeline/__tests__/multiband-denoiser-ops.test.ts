import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MULTIBAND_DENOISER_SETTINGS,
  MULTIBAND_DENOISER_PRESETS,
  calculateHarmonicFrequencies,
  buildFfmpegMultibandDenoiserFilter,
  type MultibandDenoiserSettings,
} from '../multiband-denoiser-ops';

describe('multiband-denoiser-ops', () => {
  describe('calculateHarmonicFrequencies', () => {
    it('returns empty array for non-positive fundamental', () => {
      expect(calculateHarmonicFrequencies(0, 4)).toEqual([]);
      expect(calculateHarmonicFrequencies(-50, 4)).toEqual([]);
    });

    it('generates exact harmonics for 50 Hz mains', () => {
      const harmonics = calculateHarmonicFrequencies(50, 4);
      expect(harmonics).toEqual([50, 100, 150, 200]);
    });

    it('generates exact harmonics for 60 Hz mains', () => {
      const harmonics = calculateHarmonicFrequencies(60, 5);
      expect(harmonics).toEqual([60, 120, 180, 240, 300]);
    });

    it('clamps harmonics count between 1 and 8 and stays below 20 kHz', () => {
      const harmonics = calculateHarmonicFrequencies(100, 10);
      expect(harmonics.length).toBe(8);
      expect(harmonics[harmonics.length - 1]).toBe(800);
    });
  });

  describe('buildFfmpegMultibandDenoiserFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegMultibandDenoiserFilter(DEFAULT_MULTIBAND_DENOISER_SETTINGS)).toBe('');
    });

    it('includes afftdn spectral filter with average reduction', () => {
      const settings: MultibandDenoiserSettings = {
        enabled: true,
        lowBandReductionDb: 10,
        lowMidBandReductionDb: 10,
        highMidBandReductionDb: 10,
        highBandReductionDb: 10,
        deClickEnabled: false,
        deClickSensitivity: 5,
        deHumMode: 'off',
        deHumHarmonics: 4,
      };
      const filter = buildFfmpegMultibandDenoiserFilter(settings);
      expect(filter).toContain('afftdn=nr=10.0:nf=-45');
    });

    it('includes adeclick when deClickEnabled is true', () => {
      const settings: MultibandDenoiserSettings = {
        enabled: true,
        lowBandReductionDb: 5,
        lowMidBandReductionDb: 5,
        highMidBandReductionDb: 5,
        highBandReductionDb: 5,
        deClickEnabled: true,
        deClickSensitivity: 7,
        deHumMode: 'off',
        deHumHarmonics: 4,
      };
      const filter = buildFfmpegMultibandDenoiserFilter(settings);
      expect(filter).toContain('adeclick=threshold=4.0:burst=2');
    });

    it('includes harmonic notch filters when deHumMode is active', () => {
      const settings: MultibandDenoiserSettings = {
        enabled: true,
        lowBandReductionDb: 5,
        lowMidBandReductionDb: 5,
        highMidBandReductionDb: 5,
        highBandReductionDb: 5,
        deClickEnabled: false,
        deClickSensitivity: 5,
        deHumMode: '60hz_mains',
        deHumHarmonics: 3,
      };
      const filter = buildFfmpegMultibandDenoiserFilter(settings);
      expect(filter).toContain('equalizer=f=60:width_type=q:w=10:g=-24');
      expect(filter).toContain('equalizer=f=120:width_type=q:w=10:g=-24');
      expect(filter).toContain('equalizer=f=180:width_type=q:w=10:g=-24');
    });
  });

  describe('MULTIBAND_DENOISER_PRESETS', () => {
    it('contains all 4 studio presets with valid decibel reduction levels', () => {
      const keys = Object.keys(MULTIBAND_DENOISER_PRESETS);
      expect(keys).toHaveLength(4);
      expect(keys).toContain('fan_hiss_suppression');
      expect(keys).toContain('ac_rumble_cleanup');
      expect(keys).toContain('vinyl_click_restoration');
      expect(keys).toContain('complete_studio_denoise');

      for (const key of keys as Array<keyof typeof MULTIBAND_DENOISER_PRESETS>) {
        const preset = MULTIBAND_DENOISER_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.settings.lowBandReductionDb).toBeGreaterThanOrEqual(0);
        expect(preset.settings.highBandReductionDb).toBeGreaterThanOrEqual(0);
        expect(preset.settings.deHumHarmonics).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
