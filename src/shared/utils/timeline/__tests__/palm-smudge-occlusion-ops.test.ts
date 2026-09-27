import { describe, it, expect } from 'vitest';
import {
  computePalmHeelFootprint,
  isPointInsidePalm,
  findWetStrokeOverlaps,
  generateSmudgeTrails,
  evaluateSmudgeIntensityAt,
  validatePalmSmudgeConfig,
  DEFAULT_PALM_SMUDGE_CONFIG,
} from '../palm-smudge-occlusion-ops';

describe('palm-smudge-occlusion-ops', () => {
  describe('computePalmHeelFootprint', () => {
    it('calculates palm center offset from tip based on wrist angle', () => {
      const tip = { x: 100, y: 100 };
      // 0 deg wrist: offset along +X and +Y normal
      const fp = computePalmHeelFootprint(tip, 0.0, 4.0, {
        palmOffsetX: 40.0,
        palmOffsetY: 30.0,
      });

      // rad = 0: ux = 1, uy = 0; vx = 0, vy = 1
      // cx = 100 + 40*1 + 30*0 = 140
      // cy = 100 + 40*0 + 30*1 = 130
      expect(fp.center.x).toBeCloseTo(140.0, 1);
      expect(fp.center.y).toBeCloseTo(130.0, 1);
      expect(fp.radiusX).toBe(35.0);
      expect(fp.radiusY).toBeCloseTo(35.0 * 0.70, 1);
    });

    it('correctly models touchdown contact and pressure', () => {
      // Touchdown threshold = 8mm, elevation = 2mm
      const touching = computePalmHeelFootprint({ x: 0, y: 0 }, 45.0, 2.0, { touchdownElevationMm: 8.0 });
      expect(touching.isTouching).toBe(true);
      expect(touching.contactPressure).toBeGreaterThan(0.7);

      // Elevation = 10mm > 8mm (liftoff)
      const lifted = computePalmHeelFootprint({ x: 0, y: 0 }, 45.0, 10.0, { touchdownElevationMm: 8.0 });
      expect(lifted.isTouching).toBe(false);
      expect(lifted.contactPressure).toBe(0.0);
    });
  });

  describe('isPointInsidePalm', () => {
    const palm = computePalmHeelFootprint({ x: 100, y: 100 }, 0.0, 2.0, {
      palmOffsetX: 0.0,
      palmOffsetY: 0.0,
      palmRadiusPx: 40.0,
      palmAspectRatio: 0.50, // rx=40, ry=20
    });

    it('returns true for center point and points within ellipse', () => {
      expect(isPointInsidePalm({ x: 100, y: 100 }, palm)).toBe(true);
      expect(isPointInsidePalm({ x: 130, y: 100 }, palm)).toBe(true); // dx=30 < 40
      expect(isPointInsidePalm({ x: 100, y: 115 }, palm)).toBe(true); // dy=15 < 20
    });

    it('returns false for points outside the ellipse boundary', () => {
      expect(isPointInsidePalm({ x: 150, y: 100 }, palm)).toBe(false); // dx=50 > 40
      expect(isPointInsidePalm({ x: 100, y: 130 }, palm)).toBe(false); // dy=30 > 20
      expect(isPointInsidePalm({ x: 135, y: 118 }, palm)).toBe(false);
    });
  });

  describe('findWetStrokeOverlaps', () => {
    const palm = computePalmHeelFootprint({ x: 100, y: 100 }, 0.0, 2.0, {
      palmOffsetX: 0.0,
      palmOffsetY: 0.0,
      palmRadiusPx: 30.0,
      touchdownElevationMm: 8.0,
      wetTimeWindowSec: 2.0,
    });

    it('returns empty when palm is lifted', () => {
      const liftedPalm = { ...palm, isTouching: false };
      const strokes = [
        {
          points: [{ x: 100, y: 100 }],
          times: [1.0],
        },
      ];
      expect(findWetStrokeOverlaps(liftedPalm, strokes, 1.5)).toEqual([]);
    });

    it('finds overlapping points within the wet drying window', () => {
      const now = 3.0;
      const strokes = [
        {
          points: [{ x: 105, y: 102 }, { x: 110, y: 100 }],
          times: [2.0, 2.2], // age 1.0s and 0.8s <= 2.0s
          colorHex: '#000000',
          width: 5.0,
        },
        {
          points: [{ x: 100, y: 100 }],
          times: [0.5], // age 2.5s > 2.0s (dry)
          colorHex: '#ff0000',
          width: 5.0,
        },
      ];

      const overlaps = findWetStrokeOverlaps(palm, strokes, now);
      expect(overlaps.length).toBe(2);
      expect(overlaps[0].wetness).toBeCloseTo(0.5, 1);
      expect(overlaps[1].wetness).toBeCloseTo(0.6, 1);
      expect(overlaps[0].colorHex).toBe('#000000');
    });
  });

  describe('generateSmudgeTrails', () => {
    const cfg = {
      palmOffsetX: 0.0,
      palmOffsetY: 0.0,
      touchdownElevationMm: 8.0,
      smudgeIntensity: 0.50,
      smudgeDecayPx: 50.0,
    };
    const palm = computePalmHeelFootprint({ x: 100, y: 100 }, 0.0, 2.0, cfg);

    const overlaps = [
      {
        point: { x: 100, y: 100 },
        wetness: 0.8,
        colorHex: '#333333',
        width: 6.0,
      },
    ];

    it('returns empty when velocity is stationary', () => {
      const trails = generateSmudgeTrails(overlaps, { x: 0, y: 0 }, palm, cfg);
      expect(trails).toEqual([]);
    });

    it('generates directional trails along motion vector', () => {
      const vel = { x: 100, y: 0 };
      const trails = generateSmudgeTrails(overlaps, vel, palm, cfg);
      expect(trails.length).toBe(1);
      expect(trails[0].lengthPx).toBeGreaterThan(10);
      expect(trails[0].velocity.x).toBe(100);
      expect(trails[0].initialIntensity).toBeGreaterThan(0.2);
      expect(trails[0].decayPx).toBe(50.0);
    });
  });

  describe('evaluateSmudgeIntensityAt', () => {
    it('evaluates exponential decay curve', () => {
      const i0 = 0.5;
      const decay = 50.0;

      // At distance 0, intensity is i0
      expect(evaluateSmudgeIntensityAt(0, i0, decay)).toBe(i0);

      // At distance = decay, intensity is i0 / e
      expect(evaluateSmudgeIntensityAt(50, i0, decay)).toBeCloseTo(i0 / Math.E, 3);

      // At distance = 2 * decay, intensity is i0 / e^2
      expect(evaluateSmudgeIntensityAt(100, i0, decay)).toBeCloseTo(i0 / (Math.E * Math.E), 3);
    });

    it('returns 0 for negative distances', () => {
      expect(evaluateSmudgeIntensityAt(-10, 0.5, 50)).toBe(0);
    });
  });

  describe('validatePalmSmudgeConfig', () => {
    it('validates default configuration successfully', () => {
      const res = validatePalmSmudgeConfig(DEFAULT_PALM_SMUDGE_CONFIG);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('detects invalid configuration values', () => {
      const res = validatePalmSmudgeConfig({
        touchdownElevationMm: -5,
        palmRadiusPx: 200,
        smudgeIntensity: 2.0,
        shadowOpacity: 1.5,
      });
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
