import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HDR_TONE_MAPPING_SETTINGS,
  HDR_TONE_MAPPING_PRESETS,
  FALSE_COLOR_IRE_SCALE,
  calculateAcesFilmicTone,
  calculateHableTone,
  mapLumaToFalseColor,
  buildFfmpegToneMappingFilter,
  type HdrToneMappingSettings,
} from '../hdr-tone-mapping-ops';

describe('hdr-tone-mapping-ops', () => {
  describe('calculateAcesFilmicTone', () => {
    it('returns 0 for zero luminance input', () => {
      expect(calculateAcesFilmicTone(0)).toBe(0);
    });

    it('compresses linear highlights smoothly into [0, 1]', () => {
      const mid = calculateAcesFilmicTone(0.5);
      expect(mid).toBeGreaterThan(0.3);
      expect(mid).toBeLessThan(0.7);

      const high = calculateAcesFilmicTone(1.0);
      expect(high).toBeGreaterThan(mid);
      expect(high).toBeLessThanOrEqual(1.0);

      // Super-white HDR specular highlights (10.0) should approach 1.0 without overflowing
      const specular = calculateAcesFilmicTone(10.0);
      expect(specular).toBeCloseTo(1.0, 1);
      expect(specular).toBeLessThanOrEqual(1.0);
    });

    it('handles negative inputs gracefully by clamping to 0', () => {
      expect(calculateAcesFilmicTone(-0.5)).toBe(0);
    });
  });

  describe('calculateHableTone', () => {
    it('returns near 0 for black input', () => {
      expect(calculateHableTone(0)).toBe(0);
    });

    it('produces an S-curve toe and shoulder response', () => {
      const val = calculateHableTone(0.7);
      expect(val).toBeGreaterThan(0);
      expect(val).toBeLessThan(1.0);
    });
  });

  describe('mapLumaToFalseColor', () => {
    it('maps deep black to crushed black category (<5 IRE)', () => {
      const color = mapLumaToFalseColor(0.02);
      expect(color.label).toBe('Crushed Black');
      expect(color.r).toBe(75);
      expect(color.b).toBe(130);
    });

    it('identifies 18% middle gray at 40 IRE', () => {
      const color = mapLumaToFalseColor(0.40);
      expect(color.label).toBe('18% Middle Gray');
      expect(color.g).toBe(255);
      expect(color.r).toBe(0);
    });

    it('identifies skin tone reference at 65 IRE', () => {
      const color = mapLumaToFalseColor(0.65);
      expect(color.label).toBe('Skin Tones');
      expect(color.r).toBe(255);
      expect(color.g).toBe(105);
      expect(color.b).toBe(180);
    });

    it('identifies clipping highlight above 98 IRE', () => {
      const color = mapLumaToFalseColor(1.0);
      expect(color.label).toBe('Clipping Highlight');
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });
  });

  describe('buildFfmpegToneMappingFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegToneMappingFilter(DEFAULT_HDR_TONE_MAPPING_SETTINGS)).toBe('');
    });

    it('synthesizes tonemap filter with parameters when enabled', () => {
      const settings: HdrToneMappingSettings = {
        enabled: true,
        curve: 'aces_filmic',
        targetPeakNits: 100,
        desaturation: 0.45,
        exposureCompensationEv: 0,
        falseColorEnabled: false,
      };
      const filter = buildFfmpegToneMappingFilter(settings);
      expect(filter).toContain('tonemap=tonemap=hable:desat=0.45:peak=100');
    });

    it('includes pseudocolor when falseColorEnabled is true', () => {
      const settings: HdrToneMappingSettings = {
        enabled: true,
        curve: 'mobius',
        targetPeakNits: 1000,
        desaturation: 0.2,
        exposureCompensationEv: 0,
        falseColorEnabled: true,
      };
      const filter = buildFfmpegToneMappingFilter(settings);
      expect(filter).toContain('tonemap=tonemap=mobius');
      expect(filter).toContain('pseudocolor=preset=false_color');
    });
  });

  describe('HDR_TONE_MAPPING_PRESETS and FALSE_COLOR_IRE_SCALE', () => {
    it('contains all 4 studio HDR presets', () => {
      const keys = Object.keys(HDR_TONE_MAPPING_PRESETS);
      expect(keys).toHaveLength(4);
      expect(keys).toContain('aces_rec709_cinema');
      expect(keys).toContain('filmic_soft_rolloff');
      expect(keys).toContain('high_contrast_punch');
      expect(keys).toContain('broadcast_safe_sdr');
    });

    it('contains all key exposure reference steps in false color scale', () => {
      expect(FALSE_COLOR_IRE_SCALE.length).toBeGreaterThanOrEqual(6);
    });
  });
});
