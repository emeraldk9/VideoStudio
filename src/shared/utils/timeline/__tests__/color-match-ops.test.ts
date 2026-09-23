import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLOR_GRADING,
  type ColorGradingSettings,
} from '../color-grading-ops';
import {
  blendColorGrades,
  calculateColorMatchGrade,
  DEFAULT_COLOR_STATISTICS,
  extractColorStatsFromRgba,
  generateSyntheticStatsFromGrade,
  type ColorStatistics,
} from '../color-match-ops';

describe('Milestone S74: AI Shot-to-Shot Color Match & Auto-Grading Engine', () => {
  describe('extractColorStatsFromRgba', () => {
    it('returns default neutral statistics for empty buffer', () => {
      const stats = extractColorStatsFromRgba(new Uint8ClampedArray([]));
      expect(stats.meanLuma).toBe(0.5);
      expect(stats.meanR).toBe(0.5);
      expect(stats.skinToneRatio).toBe(0);
    });

    it('accurately computes mean channels and luminance for pure white frame', () => {
      // 4 pixels of pure white (255, 255, 255, 255)
      const whiteBuf = new Uint8ClampedArray([
        255, 255, 255, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
      ]);

      const stats = extractColorStatsFromRgba(whiteBuf);
      expect(stats.meanR).toBeCloseTo(1.0, 2);
      expect(stats.meanG).toBeCloseTo(1.0, 2);
      expect(stats.meanB).toBeCloseTo(1.0, 2);
      expect(stats.meanLuma).toBeCloseTo(1.0, 2);
      expect(stats.highlights.luma).toBeCloseTo(1.0, 2);
    });

    it('accurately computes statistics for pure black frame', () => {
      const blackBuf = new Uint8ClampedArray([
        0, 0, 0, 255,
        0, 0, 0, 255,
      ]);

      const stats = extractColorStatsFromRgba(blackBuf);
      expect(stats.meanR).toBe(0);
      expect(stats.meanLuma).toBe(0);
      expect(stats.shadows.luma).toBe(0);
    });

    it('detects skin tones in YCbCr color space', () => {
      // Natural Caucasian / Golden skin tone pixel: RGB(215, 160, 130)
      const skinPixel = [215, 160, 130, 255];
      const buf = new Uint8ClampedArray([...skinPixel, ...skinPixel, 0, 0, 255, 255]);

      const stats = extractColorStatsFromRgba(buf);
      expect(stats.skinToneRatio).toBeGreaterThan(0.5);
    });
  });

  describe('generateSyntheticStatsFromGrade', () => {
    it('synthesizes warm statistics with higher red channel', () => {
      const warmStats = generateSyntheticStatsFromGrade(undefined, 'warm');
      expect(warmStats.meanR).toBeGreaterThan(warmStats.meanB);
    });

    it('synthesizes cool statistics with higher blue channel', () => {
      const coolStats = generateSyntheticStatsFromGrade(undefined, 'cool');
      expect(coolStats.meanB).toBeGreaterThan(coolStats.meanR);
    });

    it('scales luminance according to exposure', () => {
      const baseStats = generateSyntheticStatsFromGrade(undefined, 'neutral');
      const brightGrade: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        exposure: 1.0, // +1 EV
      };
      const brightStats = generateSyntheticStatsFromGrade(brightGrade, 'neutral');
      expect(brightStats.meanLuma).toBeGreaterThan(baseStats.meanLuma);
    });
  });

  describe('calculateColorMatchGrade', () => {
    const neutralStats: ColorStatistics = { ...DEFAULT_COLOR_STATISTICS };

    it('returns near-neutral grade when target and reference have identical statistics', () => {
      const grade = calculateColorMatchGrade(neutralStats, neutralStats);
      expect(grade.exposure).toBe(0);
      expect(grade.contrast).toBe(1.0);
      expect(grade.temperature).toBe(0);
      expect(grade.tint).toBe(0);
      expect(grade.lift.r).toBe(0);
      expect(grade.gain.r).toBe(0);
    });

    it('boosts exposure when dark target is matched to bright reference', () => {
      const darkTarget: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.2,
      };
      const brightRef: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.6,
      };

      const grade = calculateColorMatchGrade(darkTarget, brightRef);
      expect(grade.exposure).toBeGreaterThan(1.0); // positive EV gain
    });

    it('lowers exposure when bright target is matched to moody dark reference', () => {
      const brightTarget: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.8,
      };
      const darkRef: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.2,
      };

      const grade = calculateColorMatchGrade(brightTarget, darkRef);
      expect(grade.exposure).toBeLessThan(-1.0); // negative EV reduction
    });

    it('shifts temperature warmer when cool target is matched to golden warm reference', () => {
      const coolTarget: ColorStatistics = {
        ...neutralStats,
        meanR: 0.35,
        meanB: 0.65,
      };
      const warmRef: ColorStatistics = {
        ...neutralStats,
        meanR: 0.65,
        meanB: 0.35,
      };

      const grade = calculateColorMatchGrade(coolTarget, warmRef);
      expect(grade.temperature).toBeGreaterThan(15); // Positive Kelvin offset
    });

    it('respects luma_only match mode: modifies exposure/contrast, zeroes color wheels and temperature', () => {
      const coolDarkTarget: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.25,
        meanR: 0.3,
        meanB: 0.7,
      };
      const warmBrightRef: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.75,
        meanR: 0.7,
        meanB: 0.3,
      };

      const grade = calculateColorMatchGrade(coolDarkTarget, warmBrightRef, {
        matchMode: 'luma_only',
      });

      expect(grade.exposure).toBeGreaterThan(1.0);
      expect(grade.temperature).toBe(0);
      expect(grade.tint).toBe(0);
      expect(grade.lift.r).toBe(0);
      expect(grade.gain.r).toBe(0);
    });

    it('respects chroma_only match mode: alters wheels and temperature, keeps exposure 0 and contrast 1', () => {
      const coolDarkTarget: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.25,
        meanR: 0.3,
        meanB: 0.7,
      };
      const warmBrightRef: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.75,
        meanR: 0.7,
        meanB: 0.3,
      };

      const grade = calculateColorMatchGrade(coolDarkTarget, warmBrightRef, {
        matchMode: 'chroma_only',
      });

      expect(grade.exposure).toBe(0);
      expect(grade.contrast).toBe(1.0);
      expect(grade.temperature).toBeGreaterThan(10);
    });

    it('dampens extreme temperature/tint when preserveSkinTones is true', () => {
      const coolTargetWithFaces: ColorStatistics = {
        ...neutralStats,
        meanR: 0.3,
        meanB: 0.7,
        skinToneRatio: 0.45,
      };
      const warmRef: ColorStatistics = {
        ...neutralStats,
        meanR: 0.7,
        meanB: 0.3,
      };

      const gradeDamped = calculateColorMatchGrade(coolTargetWithFaces, warmRef, {
        preserveSkinTones: true,
      });

      const gradeUndamped = calculateColorMatchGrade(coolTargetWithFaces, warmRef, {
        preserveSkinTones: false,
      });

      expect(gradeDamped.temperature).toBeLessThan(gradeUndamped.temperature);
    });

    it('scales match effect smoothly with strength parameter', () => {
      const darkTarget: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.2,
      };
      const brightRef: ColorStatistics = {
        ...neutralStats,
        meanLuma: 0.8,
      };

      const fullMatch = calculateColorMatchGrade(darkTarget, brightRef, { strength: 1.0 });
      const halfMatch = calculateColorMatchGrade(darkTarget, brightRef, { strength: 0.5 });
      const zeroMatch = calculateColorMatchGrade(darkTarget, brightRef, { strength: 0.0 });

      expect(halfMatch.exposure).toBeCloseTo(fullMatch.exposure * 0.5, 1);
      expect(zeroMatch.exposure).toBe(0);
    });
  });

  describe('blendColorGrades', () => {
    it('smoothly interpolates between two color grades', () => {
      const gradeA: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        exposure: 0,
        temperature: 0,
        contrast: 1.0,
      };
      const gradeB: ColorGradingSettings = {
        ...DEFAULT_COLOR_GRADING,
        exposure: 2.0,
        temperature: 40,
        contrast: 1.4,
      };

      const blended = blendColorGrades(gradeA, gradeB, 0.5);
      expect(blended.exposure).toBe(1.0);
      expect(blended.temperature).toBe(20);
      expect(blended.contrast).toBe(1.2);
    });
  });
});
