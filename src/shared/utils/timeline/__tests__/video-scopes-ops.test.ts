import { describe, expect, it } from 'vitest';

import {
  calculateLumaRec709,
  computeHistogramBins,
  computeLumaWaveform,
  computeRgbParade,
  computeVectorscopePoints,
  rgbToUvVectorscope,
  SKIN_TONE_LINE_ANGLE_RAD,
  VECTORSCOPE_SMPTE_TARGETS,
} from '../video-scopes-ops';

describe('Step S31 — Video Scopes & Colorimetry Mathematics', () => {
  describe('calculateLumaRec709', () => {
    it('accurately computes pure black (0) and pure white (255)', () => {
      expect(calculateLumaRec709(0, 0, 0)).toBe(0);
      expect(calculateLumaRec709(255, 255, 255)).toBeCloseTo(255, 3);
    });

    it('weighs green most heavily according to Rec.709 coefficients (0.7152)', () => {
      const redLuma = calculateLumaRec709(255, 0, 0);
      const greenLuma = calculateLumaRec709(0, 255, 0);
      const blueLuma = calculateLumaRec709(0, 0, 255);

      expect(greenLuma).toBeGreaterThan(redLuma);
      expect(redLuma).toBeGreaterThan(blueLuma);
      expect(greenLuma).toBeCloseTo(255 * 0.7152, 2);
    });
  });

  describe('rgbToUvVectorscope', () => {
    it('maps neutral grey / white / black to origin (0, 0)', () => {
      const black = rgbToUvVectorscope(0, 0, 0);
      expect(black.u).toBeCloseTo(0, 4);
      expect(black.v).toBeCloseTo(0, 4);

      const grey = rgbToUvVectorscope(128, 128, 128);
      expect(grey.u).toBeCloseTo(0, 4);
      expect(grey.v).toBeCloseTo(0, 4);

      const white = rgbToUvVectorscope(255, 255, 255);
      expect(white.u).toBeCloseTo(0, 4);
      expect(white.v).toBeCloseTo(0, 4);
    });

    it('has all 6 SMPTE 75% target positions within normal bounds', () => {
      expect(VECTORSCOPE_SMPTE_TARGETS.length).toBe(6);
      for (const target of VECTORSCOPE_SMPTE_TARGETS) {
        expect(target.u).toBeGreaterThanOrEqual(-1.0);
        expect(target.u).toBeLessThanOrEqual(1.0);
        expect(target.v).toBeGreaterThanOrEqual(-1.0);
        expect(target.v).toBeLessThanOrEqual(1.0);
      }
    });

    it('places Red in positive V and negative U quadrant', () => {
      const redTarget = VECTORSCOPE_SMPTE_TARGETS.find((t) => t.name === 'R')!;
      expect(redTarget.v).toBeGreaterThan(0.3);
      expect(redTarget.u).toBeLessThan(0);
    });

    it('places Blue in positive U and negative V quadrant', () => {
      const blueTarget = VECTORSCOPE_SMPTE_TARGETS.find((t) => t.name === 'B')!;
      expect(blueTarget.u).toBeGreaterThan(0.3);
      expect(blueTarget.v).toBeLessThan(0);
    });

    it('defines skin-tone line angle in the second quadrant (~123°)', () => {
      expect(SKIN_TONE_LINE_ANGLE_RAD).toBeCloseTo((123 * Math.PI) / 180, 4);
    });
  });

  describe('computeLumaWaveform', () => {
    it('handles empty / invalid inputs gracefully', () => {
      const empty = computeLumaWaveform(new Uint8ClampedArray(0), 0, 0, 100, 50);
      expect(empty.length).toBe(5000);
      expect(empty[0]).toBe(0);
    });

    it('populates high IRE bins for bright pixels and low IRE bins for dark pixels', () => {
      // 2x2 image: top row white (255), bottom row black (0)
      const pixels = new Uint8ClampedArray([
        255, 255, 255, 255,   255, 255, 255, 255,
        0, 0, 0, 255,         0, 0, 0, 255,
      ]);
      const width = 2;
      const height = 2;
      const outWidth = 2;
      const numBins = 100;

      const grid = computeLumaWaveform(pixels, width, height, outWidth, numBins);
      expect(grid.length).toBe(outWidth * numBins);

      // White pixels land at bin 0 (top row of waveform)
      expect(grid[0]).toBeGreaterThan(0); // top left
      expect(grid[1]).toBeGreaterThan(0); // top right

      // Black pixels land at bin numBins - 1 (bottom row of waveform)
      const bottomIdx = (numBins - 1) * outWidth;
      expect(grid[bottomIdx]).toBeGreaterThan(0);
    });
  });

  describe('computeRgbParade', () => {
    it('separates Red, Green, and Blue into distinct channels', () => {
      // Single pure red pixel
      const pixels = new Uint8ClampedArray([255, 0, 0, 255]);
      const parade = computeRgbParade(pixels, 1, 1, 10, 100);

      expect(parade.rGrid.length).toBe(1000);
      expect(parade.gGrid.length).toBe(1000);
      expect(parade.bGrid.length).toBe(1000);

      // Red channel should have energy at top (bin 0)
      expect(parade.rGrid[0]).toBeGreaterThan(0);
      // Green and Blue should have energy at bottom (bin 99)
      expect(parade.gGrid[99 * 10]).toBeGreaterThan(0);
      expect(parade.bGrid[99 * 10]).toBeGreaterThan(0);
    });
  });

  describe('computeVectorscopePoints', () => {
    it('samples points and interleaves U and V coordinates', () => {
      // 2x2 colored image
      const pixels = new Uint8ClampedArray([
        255, 0, 0, 255,     0, 255, 0, 255,
        0, 0, 255, 255,     255, 255, 0, 255,
      ]);
      const points = computeVectorscopePoints(pixels, 2, 2, 1);
      // 4 pixels * 2 coords = 8 elements
      expect(points.length).toBe(8);
      for (let i = 0; i < points.length; i++) {
        expect(points[i]).toBeGreaterThanOrEqual(-1.0);
        expect(points[i]).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('computeHistogramBins', () => {
    it('accumulates counts into 256 bins correctly', () => {
      // 4 pixels: red, green, blue, white
      const pixels = new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
        255, 255, 255, 255,
      ]);
      const hist = computeHistogramBins(pixels, 2, 2);

      expect(hist.r.length).toBe(256);
      expect(hist.g.length).toBe(256);
      expect(hist.b.length).toBe(256);
      expect(hist.luma.length).toBe(256);

      // Red has 2 counts at 255 and 2 counts at 0
      expect(hist.r[255]).toBe(2);
      expect(hist.r[0]).toBe(2);
      expect(hist.maxCount).toBeGreaterThanOrEqual(2);
    });
  });
});
