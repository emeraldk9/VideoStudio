import { describe, it, expect } from 'vitest';
import {
  computeShimmerAmplitude,
  computeConvectiveFlutter,
  computePlumeBuoyancyWeight,
  generateVaporShimmerSvgFilter,
} from '../solvent-vapor-shimmer-ops';

describe('solvent-vapor-shimmer-ops', () => {
  describe('computeShimmerAmplitude', () => {
    it('decays by exactly 50% after one evaporative half-life', () => {
      const a0 = computeShimmerAmplitude(0.0, 3.0, 1.0);
      const a1 = computeShimmerAmplitude(1.0, 3.0, 1.0);
      const a2 = computeShimmerAmplitude(2.0, 3.0, 1.0);
      expect(a0).toBe(3.0);
      expect(a1).toBe(1.5);
      expect(a2).toBe(0.75);
    });

    it('approaches zero after 4 half-lives when solvent has dried', () => {
      const a4 = computeShimmerAmplitude(4.0, 3.0, 1.0);
      expect(a4).toBeLessThan(0.2);
    });

    it('safely handles negative elapsed time as t=0', () => {
      const aNeg = computeShimmerAmplitude(-1.0, 3.0, 1.0);
      expect(aNeg).toBe(3.0);
    });
  });

  describe('computeConvectiveFlutter', () => {
    it('produces sinusoidal oscillating values within [-1, 1]', () => {
      const flutter1 = computeConvectiveFlutter(50, 100, 0.0);
      const flutter2 = computeConvectiveFlutter(50, 100, 0.25);
      expect(flutter1).toBeGreaterThanOrEqual(-1.0);
      expect(flutter1).toBeLessThanOrEqual(1.0);
      expect(flutter2).toBeGreaterThanOrEqual(-1.0);
      expect(flutter2).toBeLessThanOrEqual(1.0);
      expect(flutter1).not.toBe(flutter2);
    });
  });

  describe('computePlumeBuoyancyWeight', () => {
    it('returns maximum 1.0 at the stroke origin', () => {
      const w = computePlumeBuoyancyWeight(100, 100, 40);
      expect(w).toBe(1.0);
    });

    it('decays smoothly upward into the rising plume', () => {
      const wMid = computePlumeBuoyancyWeight(100, 80, 40); // 20px above py
      const wTop = computePlumeBuoyancyWeight(100, 60, 40); // 40px above py
      expect(wMid).toBeCloseTo(0.5, 2);
      expect(wTop).toBeCloseTo(0.0, 2);
    });

    it('drops sharply to zero below the stroke origin', () => {
      const wBelow = computePlumeBuoyancyWeight(100, 105, 40); // 5px below py
      expect(wBelow).toBe(0);
    });
  });

  describe('generateVaporShimmerSvgFilter', () => {
    it('creates an SVG filter containing feTurbulence and feDisplacementMap', () => {
      const filter = generateVaporShimmerSvgFilter(3.0, 20.0, 0.5, 'test-shimmer');
      expect(filter).toContain('<defs>');
      expect(filter).toContain('id="test-shimmer"');
      expect(filter).toContain('feTurbulence');
      expect(filter).toContain('feDisplacementMap');
      expect(filter).toContain('xChannelSelector="R"');
      expect(filter).toContain('yChannelSelector="G"');
      expect(filter).toContain('</defs>');
    });
  });
});
