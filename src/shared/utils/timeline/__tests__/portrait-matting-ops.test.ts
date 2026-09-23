import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PORTRAIT_MATTING_SETTINGS,
  PORTRAIT_MATTING_PRESETS,
  calculateAlphaRamp,
  calculateChokeOffset,
  calculateDecontamination,
  buildFfmpegMattingFilter,
  type PortraitMattingSettings,
} from '../portrait-matting-ops';

describe('portrait-matting-ops', () => {
  describe('calculateAlphaRamp', () => {
    it('returns 0.0 when confidence is below lower threshold boundary', () => {
      const alpha = calculateAlphaRamp(0.2, 0.5, 20);
      expect(alpha).toBe(0.0);
    });

    it('returns 1.0 when confidence is above upper threshold boundary', () => {
      const alpha = calculateAlphaRamp(0.8, 0.5, 20);
      expect(alpha).toBe(1.0);
    });

    it('returns 0.5 exactly at threshold midpoint', () => {
      const alpha = calculateAlphaRamp(0.5, 0.5, 20);
      expect(alpha).toBeCloseTo(0.5, 3);
    });

    it('clamps confidence between 0 and 1', () => {
      expect(calculateAlphaRamp(-0.5, 0.5, 10)).toBe(0.0);
      expect(calculateAlphaRamp(1.5, 0.5, 10)).toBe(1.0);
    });

    it('handles zero or minimal feathering as a sharp step', () => {
      expect(calculateAlphaRamp(0.51, 0.5, 0)).toBe(1.0);
      expect(calculateAlphaRamp(0.49, 0.5, 0)).toBe(0.0);
    });
  });

  describe('calculateChokeOffset', () => {
    it('leaves alpha unchanged when choke is 0', () => {
      expect(calculateChokeOffset(0.5, 0)).toBe(0.5);
      expect(calculateChokeOffset(0.2, 0)).toBe(0.2);
    });

    it('contracts (erodes) alpha when choke is positive', () => {
      const original = 0.5;
      const choked = calculateChokeOffset(original, 25);
      expect(choked).toBeLessThan(original);
      expect(choked).toBeGreaterThan(0);
    });

    it('dilates (expands) alpha when choke is negative', () => {
      const original = 0.5;
      const dilated = calculateChokeOffset(original, -25);
      expect(dilated).toBeGreaterThan(original);
      expect(dilated).toBeLessThan(1.0);
    });

    it('preserves boundary extremes at 0.0 and 1.0', () => {
      expect(calculateChokeOffset(0.0, 30)).toBe(0.0);
      expect(calculateChokeOffset(1.0, 30)).toBe(1.0);
      expect(calculateChokeOffset(0.0, -30)).toBe(0.0);
      expect(calculateChokeOffset(1.0, -30)).toBe(1.0);
    });
  });

  describe('calculateDecontamination', () => {
    it('leaves RGB unchanged when spill strength is 0', () => {
      const result = calculateDecontamination([50, 200, 50], [0, 255, 0], 0);
      expect(result).toEqual([50, 200, 50]);
    });

    it('despills green color bleed towards surrounding color limits', () => {
      const original: [number, number, number] = [60, 180, 70];
      const despilled = calculateDecontamination(original, [0, 255, 0], 0.8);
      // Green channel should be significantly reduced
      expect(despilled[1]).toBeLessThan(original[1]);
      expect(despilled[0]).toBe(original[0]);
      expect(despilled[2]).toBe(original[2]);
    });

    it('clamps RGB channels within 0 to 255', () => {
      const result = calculateDecontamination([255, 255, 255], [0, 255, 0], 1.0);
      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[0]).toBeLessThanOrEqual(255);
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(255);
      expect(result[2]).toBeGreaterThanOrEqual(0);
      expect(result[2]).toBeLessThanOrEqual(255);
    });
  });

  describe('buildFfmpegMattingFilter', () => {
    it('returns empty string when matting is disabled', () => {
      const filter = buildFfmpegMattingFilter(DEFAULT_PORTRAIT_MATTING_SETTINGS);
      expect(filter).toBe('');
    });

    it('synthesizes blur, choke, and despill when enabled', () => {
      const settings: PortraitMattingSettings = {
        enabled: true,
        mode: 'smart_portrait',
        threshold: 0.5,
        edgeFeather: 10,
        edgeChoke: 10,
        edgeBlur: 4,
        spillSuppression: 0.5,
        invertMatte: false,
        viewMode: 'composite',
      };
      const filter = buildFfmpegMattingFilter(settings);
      expect(filter).toContain('gblur=sigma=2.0');
      expect(filter).toContain('erosion=threshold0=255');
      expect(filter).toContain('despill=type=green:mix=0.50');
    });

    it('includes dilation when choke is negative', () => {
      const settings: PortraitMattingSettings = {
        enabled: true,
        mode: 'smart_portrait',
        threshold: 0.5,
        edgeFeather: 5,
        edgeChoke: -15,
        edgeBlur: 0,
        spillSuppression: 0,
        invertMatte: false,
        viewMode: 'composite',
      };
      const filter = buildFfmpegMattingFilter(settings);
      expect(filter).toContain('dilation=threshold0=255');
    });

    it('includes grayscale format when viewMode is alpha_matte', () => {
      const settings: PortraitMattingSettings = {
        enabled: true,
        mode: 'silhouette',
        threshold: 0.5,
        edgeFeather: 0,
        edgeChoke: 0,
        edgeBlur: 0,
        spillSuppression: 0,
        invertMatte: false,
        viewMode: 'alpha_matte',
      };
      const filter = buildFfmpegMattingFilter(settings);
      expect(filter).toContain('format=gray');
    });
  });

  describe('PORTRAIT_MATTING_PRESETS', () => {
    it('contains all 4 standard presets with valid ranges', () => {
      const presets = Object.keys(PORTRAIT_MATTING_PRESETS);
      expect(presets).toHaveLength(4);
      expect(presets).toContain('crisp_portrait');
      expect(presets).toContain('soft_hair_detail');
      expect(presets).toContain('silhouette_choke');
      expect(presets).toContain('dramatic_isolate');

      for (const key of presets as Array<keyof typeof PORTRAIT_MATTING_PRESETS>) {
        const preset = PORTRAIT_MATTING_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.settings.threshold).toBeGreaterThanOrEqual(0);
        expect(preset.settings.threshold).toBeLessThanOrEqual(1);
        expect(preset.settings.edgeFeather).toBeGreaterThanOrEqual(0);
        expect(preset.settings.spillSuppression).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
