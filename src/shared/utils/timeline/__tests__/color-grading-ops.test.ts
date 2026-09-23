import { describe, expect, it } from 'vitest';

import {
  buildCssColorFilter,
  buildFfmpegColorBalanceFilter,
  COLOR_GRADING_PRESETS,
  colorWheelToRgb,
  DEFAULT_COLOR_GRADING,
  isNeutralColorGrading,
  rgbToColorWheel,
  type ColorGradingSettings,
} from '../color-grading-ops';

describe('Step S30 — Color Grading Operations & Filter Pipeline', () => {
  describe('colorWheelToRgb and rgbToColorWheel polar conversions', () => {
    it('returns zero offsets at origin (distance 0)', () => {
      const rgb = colorWheelToRgb(0, 0);
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);

      const polar = rgbToColorWheel(0, 0, 0);
      expect(polar.distanceNormalized).toBe(0);
    });

    it('calculates pure red vector at 0 degrees', () => {
      const rgb = colorWheelToRgb(0, 1.0);
      expect(rgb.r).toBe(1.0);
      // At 0 rad, green phase is 120° (cos = -0.5), blue phase is 240° (cos = -0.5)
      expect(rgb.g).toBeCloseTo(-0.5, 2);
      expect(rgb.b).toBeCloseTo(-0.5, 2);
    });

    it('calculates pure green vector at 120 degrees (2*PI / 3)', () => {
      const angle = (2 * Math.PI) / 3;
      const rgb = colorWheelToRgb(angle, 1.0);
      expect(rgb.g).toBe(1.0);
      expect(rgb.r).toBeCloseTo(-0.5, 2);
      expect(rgb.b).toBeCloseTo(-0.5, 2);
    });

    it('calculates pure blue vector at 240 degrees (4*PI / 3)', () => {
      const angle = (4 * Math.PI) / 3;
      const rgb = colorWheelToRgb(angle, 1.0);
      expect(rgb.b).toBe(1.0);
      expect(rgb.r).toBeCloseTo(-0.5, 2);
      expect(rgb.g).toBeCloseTo(-0.5, 2);
    });

    it('clamps distance above 1.0 to 1.0', () => {
      const rgb = colorWheelToRgb(0, 1.8);
      expect(rgb.r).toBe(1.0);
    });
  });

  describe('isNeutralColorGrading', () => {
    it('recognizes default settings as neutral', () => {
      expect(isNeutralColorGrading(undefined)).toBe(true);
      expect(isNeutralColorGrading(DEFAULT_COLOR_GRADING)).toBe(true);
    });

    it('detects wheel modifications as non-neutral', () => {
      const custom: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        lift: { r: 0.1, g: 0, b: 0, luma: 0 },
      };
      expect(isNeutralColorGrading(custom)).toBe(false);
    });

    it('detects temperature changes as non-neutral', () => {
      const warm: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        temperature: 15,
      };
      expect(isNeutralColorGrading(warm)).toBe(false);
    });

    it('detects contrast adjustments as non-neutral', () => {
      const contrast: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        contrast: 1.2,
      };
      expect(isNeutralColorGrading(contrast)).toBe(false);
    });
  });

  describe('buildFfmpegColorBalanceFilter', () => {
    it('returns empty string for neutral or undefined settings', () => {
      expect(buildFfmpegColorBalanceFilter(undefined)).toBe('');
      expect(buildFfmpegColorBalanceFilter(DEFAULT_COLOR_GRADING)).toBe('');
    });

    it('generates colorbalance for 3-way wheel adjustments', () => {
      const settings: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        lift: { r: -0.1, g: 0.05, b: 0.2, luma: 0 },
        gamma: { r: 0.0, g: 0.0, b: 0.0, luma: 0 },
        gain: { r: 0.25, g: -0.05, b: -0.15, luma: 0 },
      };
      const filter = buildFfmpegColorBalanceFilter(settings);
      expect(filter).toContain('colorbalance=');
      expect(filter).toContain('rs=-0.1');
      expect(filter).toContain('gs=0.05');
      expect(filter).toContain('bs=0.2');
      expect(filter).toContain('rh=0.25');
      expect(filter).toContain('gh=-0.05');
      expect(filter).toContain('bh=-0.15');
    });

    it('generates eq filter for exposure, contrast, and saturation', () => {
      const settings: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        exposure: 1.0,
        contrast: 1.3,
        saturation: 1.25,
      };
      const filter = buildFfmpegColorBalanceFilter(settings);
      expect(filter).toContain('eq=');
      expect(filter).toContain('brightness=0.125');
      expect(filter).toContain('contrast=1.3');
      expect(filter).toContain('saturation=1.25');
    });

    it('incorporates temperature and tint into colorbalance channels', () => {
      const settings: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        temperature: 50, // Warm -> positive red, negative blue
        tint: -20,       // Green -> positive green
      };
      const filter = buildFfmpegColorBalanceFilter(settings);
      expect(filter).toContain('colorbalance=');
      expect(filter).toContain('rh=');
      expect(filter).toContain('bh=');
    });

    it('generates both colorbalance and eq in one unified chain', () => {
      const tealOrange = COLOR_GRADING_PRESETS.find((p) => p.id === 'teal_and_orange')!;
      const filter = buildFfmpegColorBalanceFilter(tealOrange.settings);
      expect(filter).toContain('colorbalance=');
      expect(filter).toContain('eq=');
    });
  });

  describe('buildCssColorFilter', () => {
    it('returns empty string for neutral or undefined settings', () => {
      expect(buildCssColorFilter(undefined)).toBe('');
      expect(buildCssColorFilter(DEFAULT_COLOR_GRADING)).toBe('');
    });

    it('maps exposure to CSS brightness percentage', () => {
      const bright: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        exposure: 1.0, // +20% -> 120%
      };
      expect(buildCssColorFilter(bright)).toBe('brightness(120%)');
    });

    it('maps contrast to CSS contrast percentage', () => {
      const highContrast: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        contrast: 1.4,
      };
      expect(buildCssColorFilter(highContrast)).toBe('contrast(140%)');
    });

    it('maps saturation and vibrance to CSS saturate percentage', () => {
      const saturated: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        saturation: 1.2,
        vibrance: 25, // +10% -> 130%
      };
      expect(buildCssColorFilter(saturated)).toBe('saturate(130%)');
    });

    it('applies hue-rotate and sepia for warm color temperature', () => {
      const warm: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        temperature: 40,
      };
      const css = buildCssColorFilter(warm);
      expect(css).toContain('hue-rotate(');
      expect(css).toContain('sepia(');
    });
  });

  describe('Preset Looks', () => {
    it('has all 5 essential presets defined', () => {
      expect(COLOR_GRADING_PRESETS.length).toBe(5);
      const ids = COLOR_GRADING_PRESETS.map((p) => p.id);
      expect(ids).toContain('neutral');
      expect(ids).toContain('teal_and_orange');
      expect(ids).toContain('warm_sunset');
      expect(ids).toContain('cool_noir');
      expect(ids).toContain('bleach_bypass');
    });
  });
});
