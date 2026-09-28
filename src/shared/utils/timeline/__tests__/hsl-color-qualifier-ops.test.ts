import { describe, it, expect } from 'vitest';
import {
  rgbToHsl,
  hslToRgb,
  calculateHueAngularDistance,
  calculateHueWeight,
  calculateRangeWeight,
  calculateRawHslMatte,
  refineMatteWeight,
  applyHslSecondaryCorrection,
  isNeutralHslQualifier,
  generateHslQualifierWedgeSvgPaths,
  generateHslQualifierFiltergraph,
  DEFAULT_HSL_QUALIFIER_SETTINGS,
  HSL_QUALIFIER_PRESETS,
  type HslQualifierSettings,
} from '../hsl-color-qualifier-ops';

describe('hsl-color-qualifier-ops', () => {
  describe('Color space conversions (RGB <-> HSL)', () => {
    it('converts pure red RGB to HSL and back', () => {
      const redRgb = { r: 1, g: 0, b: 0 };
      const hsl = rgbToHsl(redRgb);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(1);
      expect(hsl.l).toBe(0.5);

      const roundtrip = hslToRgb(hsl);
      expect(roundtrip.r).toBeCloseTo(1, 2);
      expect(roundtrip.g).toBeCloseTo(0, 2);
      expect(roundtrip.b).toBeCloseTo(0, 2);
    });

    it('converts pure green RGB to HSL and back', () => {
      const greenRgb = { r: 0, g: 1, b: 0 };
      const hsl = rgbToHsl(greenRgb);
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(1);
      expect(hsl.l).toBe(0.5);

      const roundtrip = hslToRgb(hsl);
      expect(roundtrip.r).toBeCloseTo(0, 2);
      expect(roundtrip.g).toBeCloseTo(1, 2);
      expect(roundtrip.b).toBeCloseTo(0, 2);
    });

    it('converts pure blue RGB to HSL and back', () => {
      const blueRgb = { r: 0, g: 0, b: 1 };
      const hsl = rgbToHsl(blueRgb);
      expect(hsl.h).toBe(240);
      expect(hsl.s).toBe(1);
      expect(hsl.l).toBe(0.5);

      const roundtrip = hslToRgb(hsl);
      expect(roundtrip.r).toBeCloseTo(0, 2);
      expect(roundtrip.g).toBeCloseTo(0, 2);
      expect(roundtrip.b).toBeCloseTo(1, 2);
    });

    it('handles achromatic neutrals (black, white, 50% gray)', () => {
      const blackHsl = rgbToHsl({ r: 0, g: 0, b: 0 });
      expect(blackHsl.s).toBe(0);
      expect(blackHsl.l).toBe(0);

      const whiteHsl = rgbToHsl({ r: 1, g: 1, b: 1 });
      expect(whiteHsl.s).toBe(0);
      expect(whiteHsl.l).toBe(1);

      const grayHsl = rgbToHsl({ r: 0.5, g: 0.5, b: 0.5 });
      expect(grayHsl.s).toBe(0);
      expect(grayHsl.l).toBe(0.5);
    });
  });

  describe('Angular Distance & Hue Qualification Weight', () => {
    it('calculates angular distance across 0/360 wrap-around boundary', () => {
      expect(calculateHueAngularDistance(10, 350)).toBe(20);
      expect(calculateHueAngularDistance(355, 5)).toBe(10);
      expect(calculateHueAngularDistance(180, 180)).toBe(0);
      expect(calculateHueAngularDistance(30, 90)).toBe(60);
    });

    it('evaluates hue qualification weights accurately', () => {
      const qualifier = {
        centerDeg: 25,
        widthDeg: 15,
        softnessDeg: 10,
      };

      // Exactly on center
      expect(calculateHueWeight(25, qualifier)).toBe(1.0);
      // Within width band (25 - 15 = 10, 25 + 15 = 40)
      expect(calculateHueWeight(15, qualifier)).toBe(1.0);
      expect(calculateHueWeight(38, qualifier)).toBe(1.0);

      // In softness band (40 to 50)
      const softWeight = calculateHueWeight(45, qualifier);
      expect(softWeight).toBeGreaterThan(0);
      expect(softWeight).toBeLessThan(1);

      // Outside softness band (>50)
      expect(calculateHueWeight(55, qualifier)).toBe(0.0);
      expect(calculateHueWeight(200, qualifier)).toBe(0.0);
    });
  });

  describe('Range Qualification Weight (Saturation & Luminance)', () => {
    it('evaluates range weights within core band and softness boundaries', () => {
      const qualifier = {
        low: 0.2,
        high: 0.8,
        softness: 0.1,
      };

      // Inside core range
      expect(calculateRangeWeight(0.5, qualifier)).toBe(1.0);
      expect(calculateRangeWeight(0.25, qualifier)).toBe(1.0);
      expect(calculateRangeWeight(0.75, qualifier)).toBe(1.0);

      // In lower softness transition (0.1 to 0.2)
      const lowSoft = calculateRangeWeight(0.15, qualifier);
      expect(lowSoft).toBeGreaterThan(0);
      expect(lowSoft).toBeLessThan(1);

      // In upper softness transition (0.8 to 0.9)
      const highSoft = calculateRangeWeight(0.85, qualifier);
      expect(highSoft).toBeGreaterThan(0);
      expect(highSoft).toBeLessThan(1);

      // Completely outside
      expect(calculateRangeWeight(0.05, qualifier)).toBe(0.0);
      expect(calculateRangeWeight(0.95, qualifier)).toBe(0.0);
    });
  });

  describe('Matte Calculation & Refinement', () => {
    const skinSettings: HslQualifierSettings = {
      ...DEFAULT_HSL_QUALIFIER_SETTINGS,
      hue: { centerDeg: 25, widthDeg: 15, softnessDeg: 10 },
      saturation: { low: 0.2, high: 0.8, softness: 0.1 },
      luminance: { low: 0.2, high: 0.8, softness: 0.1 },
      refinement: {
        invert: false,
        cleanBlack: 0.05,
        cleanWhite: 0.95,
        blurRadius: 1.0,
      },
    };

    it('fully qualifies target skin tone color', () => {
      // Warm skin tone: Hue ~25 deg, Sat ~0.4, Lum ~0.6
      const skinHsl = { h: 25, s: 0.4, l: 0.6 };
      const raw = calculateRawHslMatte(skinHsl, skinSettings);
      expect(raw).toBe(1.0);

      const refined = refineMatteWeight(raw, skinSettings.refinement);
      expect(refined).toBe(1.0);
    });

    it('completely rejects opposing cool blue color', () => {
      const blueHsl = { h: 210, s: 0.6, l: 0.5 };
      const raw = calculateRawHslMatte(blueHsl, skinSettings);
      expect(raw).toBe(0.0);

      const refined = refineMatteWeight(raw, skinSettings.refinement);
      expect(refined).toBe(0.0);
    });

    it('inverts matte when refinement.invert is true', () => {
      const skinHsl = { h: 25, s: 0.4, l: 0.6 };
      const raw = calculateRawHslMatte(skinHsl, skinSettings);
      expect(raw).toBe(1.0);

      const inverted = refineMatteWeight(raw, {
        ...skinSettings.refinement,
        invert: true,
      });
      expect(inverted).toBe(0.0);
    });

    it('clips low-level noise to clean black', () => {
      const rawFringe = 0.04;
      const refined = refineMatteWeight(rawFringe, {
        ...skinSettings.refinement,
        cleanBlack: 0.05,
      });
      expect(refined).toBe(0.0);
    });

    it('pushes near-opaque matte to clean white', () => {
      const rawNearWhite = 0.96;
      const refined = refineMatteWeight(rawNearWhite, {
        ...skinSettings.refinement,
        cleanWhite: 0.95,
      });
      expect(refined).toBe(1.0);
    });
  });

  describe('applyHslSecondaryCorrection & Preview Modes', () => {
    it('leaves unqualified background colors completely unaltered in composite mode', () => {
      const bluePixel = { r: 0.1, g: 0.2, b: 0.8 };
      const graded = applyHslSecondaryCorrection(bluePixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        correction: {
          hueShiftDeg: 60,
          saturationScale: 2.0,
          contrast: 0.2,
          brightness: 0.1,
          temperature: 20,
          tint: 5,
        },
      });

      expect(graded.r).toBeCloseTo(bluePixel.r, 2);
      expect(graded.g).toBeCloseTo(bluePixel.g, 2);
      expect(graded.b).toBeCloseTo(bluePixel.b, 2);
    });

    it('applies saturation boost and temperature to qualified color', () => {
      const warmPixel = hslToRgb({ h: 25, s: 0.35, l: 0.55 });
      const graded = applyHslSecondaryCorrection(warmPixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        correction: {
          hueShiftDeg: 0,
          saturationScale: 1.5,
          contrast: 0,
          brightness: 0,
          temperature: 15,
          tint: 0,
        },
      });

      // Graded warm pixel should exhibit increased saturation and red gain
      expect(graded.r).toBeGreaterThanOrEqual(warmPixel.r);
    });

    it('renders black and white matte visualization in black_and_white_matte mode', () => {
      const warmPixel = hslToRgb({ h: 25, s: 0.4, l: 0.5 });
      const bluePixel = hslToRgb({ h: 210, s: 0.6, l: 0.5 });

      const gradedWarm = applyHslSecondaryCorrection(warmPixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        previewMode: 'black_and_white_matte',
      });
      // Should be white (matte ~1)
      expect(gradedWarm.r).toBeCloseTo(1.0, 1);
      expect(gradedWarm.g).toBeCloseTo(1.0, 1);
      expect(gradedWarm.b).toBeCloseTo(1.0, 1);

      const gradedBlue = applyHslSecondaryCorrection(bluePixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        previewMode: 'black_and_white_matte',
      });
      // Should be black (matte ~0)
      expect(gradedBlue.r).toBeCloseTo(0.0, 1);
      expect(gradedBlue.g).toBeCloseTo(0.0, 1);
      expect(gradedBlue.b).toBeCloseTo(0.0, 1);
    });

    it('dims unqualified areas in highlight_isolated mode', () => {
      const bluePixel = hslToRgb({ h: 210, s: 0.6, l: 0.6 });
      const isolated = applyHslSecondaryCorrection(bluePixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        previewMode: 'highlight_isolated',
      });

      // Unqualified pixels become desaturated and dimmed
      expect(isolated.r).toBeCloseTo(isolated.g, 1);
      expect(isolated.g).toBeCloseTo(isolated.b, 1);
    });

    it('passes through original color when enabled is false', () => {
      const pixel = { r: 0.8, g: 0.5, b: 0.3 };
      const res = applyHslSecondaryCorrection(pixel, {
        ...DEFAULT_HSL_QUALIFIER_SETTINGS,
        enabled: false,
      });
      expect(res).toEqual(pixel);
    });
  });

  describe('isNeutralHslQualifier & Studio Presets', () => {
    it('identifies neutral default settings', () => {
      expect(isNeutralHslQualifier(DEFAULT_HSL_QUALIFIER_SETTINGS)).toBe(true);
      expect(isNeutralHslQualifier(undefined)).toBe(true);
    });

    it('identifies non-neutral modified settings', () => {
      expect(
        isNeutralHslQualifier({
          ...DEFAULT_HSL_QUALIFIER_SETTINGS,
          correction: {
            ...DEFAULT_HSL_QUALIFIER_SETTINGS.correction,
            saturationScale: 1.4,
          },
        }),
      ).toBe(false);

      expect(
        isNeutralHslQualifier({
          ...DEFAULT_HSL_QUALIFIER_SETTINGS,
          previewMode: 'black_and_white_matte',
        }),
      ).toBe(false);
    });

    it('validates all studio presets have valid structures', () => {
      const presetKeys = Object.keys(HSL_QUALIFIER_PRESETS) as (keyof typeof HSL_QUALIFIER_PRESETS)[];
      expect(presetKeys.length).toBeGreaterThanOrEqual(5);

      for (const key of presetKeys) {
        const p = HSL_QUALIFIER_PRESETS[key];
        expect(p.label).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.settings.hue.centerDeg).toBeGreaterThanOrEqual(0);
        expect(p.settings.hue.centerDeg).toBeLessThanOrEqual(360);
      }
    });
  });

  describe('SVG Wedge & FFmpeg Filtergraph Synthesis', () => {
    it('generates valid SVG paths for HSL color wheel wedge', () => {
      const paths = generateHslQualifierWedgeSvgPaths({
        centerDeg: 30,
        widthDeg: 25,
        softnessDeg: 15,
      });

      expect(paths.spectrumWheelPath).toContain('M');
      expect(paths.activeWedgePath).toContain('M');
      expect(paths.activeWedgePath).toContain('Z');
      expect(paths.softBoundaryMinPath).toContain('M');
      expect(paths.softBoundaryMaxPath).toContain('M');
      expect(paths.centerMarkerPath).toContain('M');
    });

    it('synthesizes FFmpeg filtergraph when active', () => {
      const filter = generateHslQualifierFiltergraph(HSL_QUALIFIER_PRESETS.teal_sky_pop.settings);
      expect(filter).not.toBeNull();
      expect(filter).toContain('split=2');
      expect(filter).toContain('colorkey=color=');
      expect(filter).toContain('overlay');
    });

    it('returns null filtergraph when settings are disabled or neutral', () => {
      expect(generateHslQualifierFiltergraph(undefined)).toBeNull();
      expect(
        generateHslQualifierFiltergraph({
          ...DEFAULT_HSL_QUALIFIER_SETTINGS,
          enabled: false,
        }),
      ).toBeNull();
      expect(generateHslQualifierFiltergraph(DEFAULT_HSL_QUALIFIER_SETTINGS)).toBeNull();
    });
  });
});
