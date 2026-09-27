import { describe, expect, it } from 'vitest';

import {
  buildCssColorFilter,
  buildFfmpegColorBalanceFilter,
  buildFfmpegCurvesFilter,
  COLOR_GRADING_PRESETS,
  colorWheelToRgb,
  DEFAULT_COLOR_GRADING,
  evaluateMonotoneCubicSpline,
  generateCurveSvgPath,
  isCurveNeutral,
  isNeutralColorGrading,
  isNeutralCurves,
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
    it('has all 7 curated studio presets defined', () => {
      expect(COLOR_GRADING_PRESETS.length).toBe(7);
      const ids = COLOR_GRADING_PRESETS.map((p) => p.id);
      expect(ids).toContain('neutral');
      expect(ids).toContain('teal_and_orange');
      expect(ids).toContain('warm_sunset');
      expect(ids).toContain('cool_noir');
      expect(ids).toContain('bleach_bypass');
      expect(ids).toContain('clean_commercial');
      expect(ids).toContain('cyberpunk_neon');
    });
  });

  describe('S164 — RGB Spline Curves & Filter Synthesis', () => {
    it('evaluates linear curve identity accurately', () => {
      const linear: [number, number][] = [
        [0, 0],
        [1, 1],
      ];
      expect(evaluateMonotoneCubicSpline(linear, 0)).toBe(0);
      expect(evaluateMonotoneCubicSpline(linear, 0.25)).toBeCloseTo(0.25, 2);
      expect(evaluateMonotoneCubicSpline(linear, 0.5)).toBeCloseTo(0.5, 2);
      expect(evaluateMonotoneCubicSpline(linear, 0.75)).toBeCloseTo(0.75, 2);
      expect(evaluateMonotoneCubicSpline(linear, 1)).toBe(1);
    });

    it('clamps evaluation beyond boundary domains', () => {
      const curve: [number, number][] = [
        [0, 0.1],
        [1, 0.9],
      ];
      expect(evaluateMonotoneCubicSpline(curve, -0.5)).toBe(0.1);
      expect(evaluateMonotoneCubicSpline(curve, 1.5)).toBe(0.9);
    });

    it('evaluates smooth S-curve contrast without overshoot', () => {
      const sCurve: [number, number][] = [
        [0, 0],
        [0.25, 0.18],
        [0.75, 0.82],
        [1, 1],
      ];
      const yMid = evaluateMonotoneCubicSpline(sCurve, 0.5);
      expect(yMid).toBeCloseTo(0.5, 2);
      expect(evaluateMonotoneCubicSpline(sCurve, 0.25)).toBe(0.18);
      expect(evaluateMonotoneCubicSpline(sCurve, 0.75)).toBe(0.82);

      // Verify strict monotonicity
      let prevY = 0;
      for (let x = 0; x <= 1.0; x += 0.05) {
        const y = evaluateMonotoneCubicSpline(sCurve, x);
        expect(y).toBeGreaterThanOrEqual(prevY);
        expect(y).toBeLessThanOrEqual(1.0);
        prevY = y;
      }
    });

    it('generates exact cubic Bézier SVG path from control points', () => {
      const points: [number, number][] = [
        [0, 0],
        [0.5, 0.4],
        [1, 1],
      ];
      const path = generateCurveSvgPath(points, 240, 240);
      expect(path).toContain('M 0 240');
      expect(path).toContain('C ');
      expect(path).toContain('240 0');
    });

    it('detects neutral vs modified curves', () => {
      expect(isCurveNeutral(undefined)).toBe(true);
      expect(
        isCurveNeutral([
          [0, 0],
          [1, 1],
        ]),
      ).toBe(true);
      expect(
        isCurveNeutral([
          [0, 0],
          [0.5, 0.4],
          [1, 1],
        ]),
      ).toBe(false);

      expect(isNeutralCurves(undefined)).toBe(true);
      expect(
        isNeutralCurves({
          all: [
            [0, 0],
            [1, 1],
          ],
        }),
      ).toBe(true);
      expect(
        isNeutralCurves({
          all: [
            [0, 0],
            [0.5, 0.4],
            [1, 1],
          ],
        }),
      ).toBe(false);
    });

    it('synthesizes FFmpeg curves filter string with channel mappings', () => {
      const curves = {
        all: [
          [0, 0],
          [0.5, 0.45],
          [1, 1],
        ] as [number, number][],
        r: [
          [0, 0.05],
          [1, 0.95],
        ] as [number, number][],
      };
      const filter = buildFfmpegCurvesFilter(curves);
      expect(filter).toBe("curves=all='0/0 0.5/0.45 1/1':r='0/0.05 1/0.95'");
    });

    it('incorporates RGB curves filter into buildFfmpegColorBalanceFilter', () => {
      const settings: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        curves: {
          all: [
            [0, 0],
            [0.25, 0.2],
            [0.75, 0.8],
            [1, 1],
          ],
        },
      };
      const filter = buildFfmpegColorBalanceFilter(settings);
      expect(filter).toContain('curves=all=');
    });
  });
});
