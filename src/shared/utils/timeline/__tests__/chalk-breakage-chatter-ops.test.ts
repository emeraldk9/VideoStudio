import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHALK_CHATTER_CONFIG,
  validateChalkChatterConfig,
  computeChatterWavelength,
  generateDebrisShards,
  generateChatteredStroke,
} from '../chalk-breakage-chatter-ops';

describe('Chalk Breakage & Variable Angle Edge Chatter Operations', () => {
  describe('validateChalkChatterConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateChalkChatterConfig();
      expect(cfg).toEqual(DEFAULT_CHALK_CHATTER_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.breakagePressureThreshold).toBe(0.88);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateChalkChatterConfig({
        slantAngleDeg: -20,
        chatterFrequencyHz: 500,
        skipThreshold: 1.5,
        breakagePressureThreshold: 0.1,
        facetWidthMultiplier: 10.0,
        dustBurstCount: 100,
      });

      expect(clamped.slantAngleDeg).toBe(10.0);
      expect(clamped.chatterFrequencyHz).toBe(300.0);
      expect(clamped.skipThreshold).toBe(0.9);
      expect(clamped.breakagePressureThreshold).toBe(0.5);
      expect(clamped.facetWidthMultiplier).toBe(5.0);
      expect(clamped.dustBurstCount).toBe(50);
    });
  });

  describe('computeChatterWavelength', () => {
    it('produces longer wavelength at higher stroke speeds', () => {
      const slow = computeChatterWavelength(50, 140, 40);
      const fast = computeChatterWavelength(300, 140, 40);
      expect(fast).toBeGreaterThan(slow);
    });

    it('increases chatter wavelength at shallower slant grazing angles', () => {
      const shallow = computeChatterWavelength(100, 140, 25);
      const steep = computeChatterWavelength(100, 140, 75);
      expect(shallow).toBeGreaterThan(steep);
    });

    it('decreases chatter wavelength at higher resonant frequencies', () => {
      const lowFreq = computeChatterWavelength(150, 80, 40);
      const highFreq = computeChatterWavelength(150, 200, 40);
      expect(lowFreq).toBeGreaterThan(highFreq);
    });
  });

  describe('generateDebrisShards', () => {
    it('returns empty array when count is zero or negative', () => {
      expect(generateDebrisShards([100, 100], 0)).toEqual([]);
      expect(generateDebrisShards([100, 100], -5)).toEqual([]);
    });

    it('generates specified number of shards with valid physical properties', () => {
      const snapPos: [number, number] = [200, 150];
      const shards = generateDebrisShards(snapPos, 15, 30.0);

      expect(shards.length).toBe(15);
      for (const shard of shards) {
        expect(shard.radius).toBeGreaterThanOrEqual(1.0);
        expect(shard.opacity).toBeGreaterThanOrEqual(0.15);
        expect(shard.opacity).toBeLessThanOrEqual(0.85);

        const dist = Math.hypot(shard.position[0] - snapPos[0], shard.position[1] - snapPos[1]);
        expect(dist).toBeLessThanOrEqual(40.0);
      }
    });
  });

  describe('generateChatteredStroke', () => {
    it('returns empty segments and null event for degenerate inputs (< 2 points)', () => {
      const res = generateChatteredStroke([[0, 0]], [0.5], [0]);
      expect(res.segments).toEqual([]);
      expect(res.breakEvent).toBeNull();
    });

    it('generates continuous solid segments when chatter is disabled', () => {
      const points: [number, number][] = [
        [0, 0],
        [50, 0],
        [100, 0],
      ];
      const pressures = [0.5, 0.5, 0.5];
      const timestamps = [0, 0.1, 0.2];

      const res = generateChatteredStroke(points, pressures, timestamps, 8.0, {
        enabled: false,
      });

      expect(res.segments.length).toBe(2);
      expect(res.breakEvent).toBeNull();
      expect(res.segments.every((s) => !s.isGap && s.opacity === 1.0 && s.width === 8.0)).toBe(true);
    });

    it('produces stick-slip chatter gaps under normal pressure when enabled', () => {
      const points: [number, number][] = Array.from({ length: 25 }, (_, i) => [i * 10, 100]);
      const pressures = Array(25).fill(0.4);
      const timestamps = Array.from({ length: 25 }, (_, i) => i * 0.02);

      const res = generateChatteredStroke(points, pressures, timestamps, 6.0, {
        enabled: true,
        skipThreshold: 0.35,
        breakagePressureThreshold: 0.88,
      });

      expect(res.breakEvent).toBeNull();
      expect(res.segments.length).toBeGreaterThan(0);
      const gaps = res.segments.filter((s) => s.isGap);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].opacity).toBeCloseTo(0.05, 2);
    });

    it('detects chalk stick breakage when downforce pressure exceeds threshold', () => {
      const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 10, 50]);
      const pressures = [
        ...Array(8).fill(0.4),
        0.95, // snap at index 8
        ...Array(11).fill(0.5),
      ];
      const timestamps = Array.from({ length: 20 }, (_, i) => i * 0.02);

      const res = generateChatteredStroke(points, pressures, timestamps, 5.0, {
        enabled: true,
        breakagePressureThreshold: 0.88,
        facetWidthMultiplier: 2.2,
        dustBurstCount: 16,
      });

      expect(res.breakEvent).not.toBeNull();
      expect(res.breakEvent?.index).toBe(8);
      expect(res.breakEvent?.originalWidth).toBe(5.0);
      expect(res.breakEvent?.brokenWidth).toBeCloseTo(11.0, 3);
      expect(res.breakEvent?.shards.length).toBe(16);

      // Verify segments after index 8 have broken width
      const brokenSegments = res.segments.filter((s) => s.width > 5.0);
      expect(brokenSegments.length).toBeGreaterThan(0);
      expect(brokenSegments[0].width).toBeCloseTo(11.0, 3);
    });
  });
});
