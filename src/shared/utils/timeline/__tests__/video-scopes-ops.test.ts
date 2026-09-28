import { describe, expect, it } from 'vitest';

import {
  calculateLumaRec709,
  computeBroadcastGamutAudit,
  computeHistogramBins,
  computeLumaWaveform,
  computeRgbParade,
  computeVectorscopePoints,
  computeWhiteBalanceStats,
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

  describe('computeBroadcastGamutAudit (Milestone S174)', () => {
    it('handles empty pixel buffers gracefully', () => {
      const audit = computeBroadcastGamutAudit(new Uint8ClampedArray(0), 0, 0);
      expect(audit.totalPixels).toBe(0);
      expect(audit.isLegal).toBe(true);
      expect(audit.crushedPercent).toBe(0);
      expect(audit.clippedPercent).toBe(0);
    });

    it('reports legal status for broadcast legal mid-gray pixels', () => {
      // 4 pixels of mid-gray (128, 128, 128) - well within 16-235 range
      const pixels = new Uint8ClampedArray([
        128, 128, 128, 255,   128, 128, 128, 255,
        128, 128, 128, 255,   128, 128, 128, 255,
      ]);
      const audit = computeBroadcastGamutAudit(pixels, 2, 2);
      expect(audit.totalPixels).toBe(4);
      expect(audit.crushedBlacksCount).toBe(0);
      expect(audit.clippedWhitesCount).toBe(0);
      expect(audit.isLegal).toBe(true);
      expect(audit.averageLuma).toBeCloseTo(128, 1);
    });

    it('detects crushed blacks when luma falls below 16', () => {
      // Pure black pixels (0, 0, 0)
      const pixels = new Uint8ClampedArray([
        0, 0, 0, 255,   5, 5, 5, 255,
        10, 10, 10, 255, 12, 12, 12, 255,
      ]);
      const audit = computeBroadcastGamutAudit(pixels, 2, 2);
      expect(audit.totalPixels).toBe(4);
      expect(audit.crushedBlacksCount).toBe(4);
      expect(audit.crushedPercent).toBe(100);
      expect(audit.isLegal).toBe(false);
    });

    it('detects clipped whites when luma exceeds 235', () => {
      // Super-white pixels (> 235)
      const pixels = new Uint8ClampedArray([
        240, 240, 240, 255,   250, 250, 250, 255,
        255, 255, 255, 255,   245, 245, 245, 255,
      ]);
      const audit = computeBroadcastGamutAudit(pixels, 2, 2);
      expect(audit.totalPixels).toBe(4);
      expect(audit.clippedWhitesCount).toBe(4);
      expect(audit.clippedPercent).toBe(100);
      expect(audit.isLegal).toBe(false);
    });
  });

  describe('computeWhiteBalanceStats (Milestone S174)', () => {
    it('handles empty pixel buffers gracefully', () => {
      const stats = computeWhiteBalanceStats(new Uint8ClampedArray(0), 0, 0);
      expect(stats.colorCast).toBe('neutral');
      expect(stats.tempDelta).toBe(0);
      expect(stats.tintDelta).toBe(0);
    });

    it('classifies neutral gray correctly', () => {
      const pixels = new Uint8ClampedArray([
        100, 100, 100, 255,   150, 150, 150, 255,
      ]);
      const stats = computeWhiteBalanceStats(pixels, 2, 1);
      expect(stats.colorCast).toBe('neutral');
      expect(stats.tempDelta).toBeCloseTo(0, 1);
      expect(stats.tintDelta).toBeCloseTo(0, 1);
    });

    it('detects warm cast when red exceeds blue', () => {
      const pixels = new Uint8ClampedArray([
        210, 128, 70, 255,
      ]);
      const stats = computeWhiteBalanceStats(pixels, 1, 1);
      expect(stats.tempDelta).toBeGreaterThan(15);
      expect(stats.colorCast).toBe('warm');
    });

    it('detects cool cast when blue exceeds red', () => {
      const pixels = new Uint8ClampedArray([
        70, 128, 210, 255,
      ]);
      const stats = computeWhiteBalanceStats(pixels, 1, 1);
      expect(stats.tempDelta).toBeLessThan(-15);
      expect(stats.colorCast).toBe('cool');
    });

    it('detects green cast when green exceeds red and blue', () => {
      const pixels = new Uint8ClampedArray([
        100, 210, 100, 255,
      ]);
      const stats = computeWhiteBalanceStats(pixels, 1, 1);
      expect(stats.tintDelta).toBeGreaterThan(15);
      expect(stats.colorCast).toBe('green');
    });

    it('detects magenta cast when green is lower than red and blue', () => {
      const pixels = new Uint8ClampedArray([
        180, 70, 180, 255,
      ]);
      const stats = computeWhiteBalanceStats(pixels, 1, 1);
      expect(stats.tintDelta).toBeLessThan(-15);
      expect(stats.colorCast).toBe('magenta');
    });
  });
});
