import { describe, expect, it } from 'vitest';
import {
  VECTORSCOPE_SMPTE_TARGETS,
} from '../video-scopes-ops';
import {
  calculateScopeSampleInterval,
  calculateSkinToneLineAngle,
  computeYrgbParade,
  detectOutlierPixels,
  getVectorscopeTargets,
  VECTORSCOPE_SMPTE_100_TARGETS,
} from '../scopes-customization-ops';

describe('scopes-customization-ops', () => {
  describe('vectorscope targets & skin tone angle', () => {
    it('returns 100% SMPTE color targets when requested', () => {
      const targets100 = getVectorscopeTargets('100pct', VECTORSCOPE_SMPTE_TARGETS);
      expect(targets100).toBe(VECTORSCOPE_SMPTE_100_TARGETS);
      expect(targets100).toHaveLength(6);

      const red100 = targets100.find((t) => t.name === 'R');
      expect(red100).toBeDefined();
      expect(red100?.color).toBe('#ef4444');
    });

    it('returns 75% SMPTE color targets by default', () => {
      const targets75 = getVectorscopeTargets('75pct', VECTORSCOPE_SMPTE_TARGETS);
      expect(targets75).toBe(VECTORSCOPE_SMPTE_TARGETS);
    });

    it('computes skin tone angle with micro-adjustment offsets and clamps safely', () => {
      const defaultAngle = calculateSkinToneLineAngle();
      expect(defaultAngle.degrees).toBe(123);
      expect(defaultAngle.radians).toBeCloseTo((123 * Math.PI) / 180, 4);

      const shiftedAngle = calculateSkinToneLineAngle(123, 5);
      expect(shiftedAngle.degrees).toBe(128);
      expect(shiftedAngle.radians).toBeCloseTo((128 * Math.PI) / 180, 4);

      // Clamp test
      const clampedLow = calculateSkinToneLineAngle(123, -50);
      expect(clampedLow.degrees).toBe(100);

      const clampedHigh = calculateSkinToneLineAngle(123, 50);
      expect(clampedHigh.degrees).toBe(145);
    });
  });

  describe('scope performance sampling intervals', () => {
    it('returns appropriate milliseconds for 15, 30, and 60 FPS', () => {
      expect(calculateScopeSampleInterval(15)).toBeCloseTo(66.67, 1);
      expect(calculateScopeSampleInterval(30)).toBeCloseTo(33.33, 1);
      expect(calculateScopeSampleInterval(60)).toBeCloseTo(16.67, 1);
    });
  });

  describe('computeYrgbParade', () => {
    it('handles empty pixel buffers gracefully', () => {
      const empty = computeYrgbParade(new Uint8ClampedArray(0), 0, 0, 80, 100);
      expect(empty.channelWidth).toBe(80);
      expect(empty.numBins).toBe(100);
      expect(empty.yGrid.length).toBe(8000);
      expect(empty.rGrid.length).toBe(8000);
      expect(empty.gGrid.length).toBe(8000);
      expect(empty.bGrid.length).toBe(8000);
    });

    it('computes 4 independent grids for Luma, Red, Green, and Blue', () => {
      // 4x4 image: pure red top-left, pure green top-right, pure blue bottom-left, pure white bottom-right
      const pixels = new Uint8ClampedArray(4 * 4 * 4);
      // Fill with pure green
      for (let i = 0; i < 16; i++) {
        pixels[i * 4] = 0;
        pixels[i * 4 + 1] = 255;
        pixels[i * 4 + 2] = 0;
        pixels[i * 4 + 3] = 255;
      }

      const parade = computeYrgbParade(pixels, 4, 4, 10, 50);
      expect(parade.yGrid.length).toBe(500);
      expect(parade.gGrid.length).toBe(500);

      // Green channel (255) lands at top bin (row 0)
      const topRowGreen = parade.gGrid.subarray(0, parade.channelWidth);
      const bottomRowGreen = parade.gGrid.subarray((parade.numBins - 1) * parade.channelWidth);
      expect(topRowGreen.some((v) => v > 0)).toBe(true);
      expect(bottomRowGreen.every((v) => v === 0)).toBe(true);

      // Red channel (0) lands at bottom bin (row numBins - 1)
      const topRowRed = parade.rGrid.subarray(0, parade.channelWidth);
      const bottomRowRed = parade.rGrid.subarray((parade.numBins - 1) * parade.channelWidth);
      expect(topRowRed.every((v) => v === 0)).toBe(true);
      expect(bottomRowRed.some((v) => v > 0)).toBe(true);
    });
  });

  describe('detectOutlierPixels', () => {
    it('returns empty outlier set on zero dimensions', () => {
      const result = detectOutlierPixels(new Uint8ClampedArray(0), 0, 0);
      expect(result.clippedCount).toBe(0);
      expect(result.crushedCount).toBe(0);
      expect(result.outliers).toHaveLength(0);
    });

    it('identifies clipped highlights (>= 235) and crushed blacks (<= 16)', () => {
      // 4 pixels: pure white (255), pure black (0), broadcast legal grey (128), clipped highlight (240)
      const pixels = new Uint8ClampedArray([
        255, 255, 255, 255, // clipped
        0, 0, 0, 255,       // crushed
        128, 128, 128, 255, // legal
        240, 240, 240, 255, // clipped
      ]);

      const result = detectOutlierPixels(pixels, 2, 2, 10);
      expect(result.clippedCount).toBeGreaterThanOrEqual(1);
      expect(result.crushedCount).toBeGreaterThanOrEqual(1);

      const clippedOutlier = result.outliers.find((o) => o.type === 'clipped');
      expect(clippedOutlier).toBeDefined();
      expect(clippedOutlier?.luma).toBeGreaterThanOrEqual(235);

      const crushedOutlier = result.outliers.find((o) => o.type === 'crushed');
      expect(crushedOutlier).toBeDefined();
      expect(crushedOutlier?.luma).toBeLessThanOrEqual(16);
    });
  });
});
