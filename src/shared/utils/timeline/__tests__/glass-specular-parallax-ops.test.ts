import { describe, it, expect } from 'vitest';
import {
  computeFresnelReflectance,
  computeParallaxOffset,
  generateOverheadGlareGradient,
  generateGlassParallaxSvgDefs,
} from '../glass-specular-parallax-ops';

describe('glass-specular-parallax-ops', () => {
  describe('computeFresnelReflectance', () => {
    it('computes ~4.26% normal incidence reflectance for soda-lime glass', () => {
      const r = computeFresnelReflectance(1.0, 1.0, 1.52);
      expect(r).toBeCloseTo(0.04258, 3);
    });

    it('reaches 100% reflectance at glancing angle', () => {
      const r = computeFresnelReflectance(0.0, 1.0, 1.52);
      expect(r).toBeCloseTo(1.0, 4);
    });

    it('monotonically increases with incidence angle', () => {
      const rNormal = computeFresnelReflectance(1.0);
      const rMid = computeFresnelReflectance(0.5);
      const rGlance = computeFresnelReflectance(0.1);
      expect(rNormal).toBeLessThan(rMid);
      expect(rMid).toBeLessThan(rGlance);
    });

    it('safely clamps cosTheta outside [0, 1]', () => {
      const rBelow = computeFresnelReflectance(-0.5);
      const rAbove = computeFresnelReflectance(1.5);
      expect(rBelow).toBeCloseTo(1.0, 4);
      expect(rAbove).toBeCloseTo(0.04258, 3);
    });
  });

  describe('computeParallaxOffset', () => {
    it('yields zero parallax displacement when view ray aligns with normal at center', () => {
      const offset = computeParallaxOffset({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5, z: 2.0 }, 8.0);
      expect(offset.dx).toBe(0);
      expect(offset.dy).toBe(0);
    });

    it('computes linear parallax displacement proportional to glass thickness and camera angle', () => {
      const offset = computeParallaxOffset({ x: 0.9, y: 0.5 }, { x: 0.5, y: 0.5, z: 2.0 }, 8.0);
      // dx = 8.0 * (0.9 - 0.5) / 2.0 = 1.6
      expect(offset.dx).toBeCloseTo(1.6, 2);
      expect(offset.dy).toBe(0);
    });

    it('handles zero or negative camera z distance safely', () => {
      const offset = computeParallaxOffset({ x: 0.8, y: 0.8 }, { x: 0.5, y: 0.5, z: 0.0 }, 10.0);
      expect(offset.dx).toBe(0);
      expect(offset.dy).toBe(0);
    });
  });

  describe('generateOverheadGlareGradient', () => {
    it('creates valid radial gradient parameters with decaying opacity stops', () => {
      const gradient = generateOverheadGlareGradient(0.5, 0.15, 0.25, 0.6, 0.25);
      expect(gradient.cx).toBe('50%');
      expect(gradient.cy).toBe('15%');
      expect(gradient.rx).toBe('60%');
      expect(gradient.ry).toBe('25%');
      expect(gradient.stops).toHaveLength(4);
      expect(gradient.stops[0].stopOpacity).toBe(0.25);
      expect(gradient.stops[3].stopOpacity).toBe(0);
    });
  });

  describe('generateGlassParallaxSvgDefs', () => {
    it('generates SVG defs with parallax filter and specular glare gradient', () => {
      const defs = generateGlassParallaxSvgDefs(
        10.0,
        { x: 0.3, y: 0.5, z: 2.0 },
        0.12,
        0.20,
        { x: 0.5, y: 0.15 }
      );
      expect(defs).toContain('<defs>');
      expect(defs).toContain('id="glass-parallax-ghost"');
      expect(defs).toContain('feOffset');
      expect(defs).toContain('feGaussianBlur');
      expect(defs).toContain('feMerge');
      expect(defs).toContain('id="glass-specular-glare"');
      expect(defs).toContain('</defs>');
    });
  });
});
