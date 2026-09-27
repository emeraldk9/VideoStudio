import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STIPPLE_CONFIG,
  validateStippleConfig,
  generateStippleDistribution,
  applySpatialRelaxation,
  computeStippleFoleyTelemetry,
  generateStippleSvgMarkup,
  StippleDot,
} from '../procedural-stippling-ops';

describe('Procedural Stippling & Pointillism Ink Shading Operations', () => {
  describe('validateStippleConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateStippleConfig();
      expect(cfg).toEqual(DEFAULT_STIPPLE_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.minDotRadius).toBe(0.8);
      expect(cfg.maxDotRadius).toBe(2.4);
      expect(cfg.relaxationIterations).toBe(3);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateStippleConfig({
        minDotRadius: 0.05,
        maxDotRadius: 50.0,
        densityScale: 20.0,
        relaxationIterations: 15,
        dotGainFactor: 5.0,
      });

      expect(clamped.minDotRadius).toBe(0.2);
      expect(clamped.maxDotRadius).toBe(10.0);
      expect(clamped.densityScale).toBe(5.0);
      expect(clamped.relaxationIterations).toBe(8);
      expect(clamped.dotGainFactor).toBe(1.0);
    });
  });

  describe('generateStippleDistribution', () => {
    it('modulates dot concentration according to tone density gradient', () => {
      // Linear ramp: 0.1 on left (x=0) to 0.9 on right (x=100)
      const rampFn = (x: number) => 0.1 + 0.8 * (x / 100.0);
      const dots = generateStippleDistribution(100, 100, rampFn, {
        densityScale: 1.0,
        relaxationIterations: 2,
      });

      expect(dots.length).toBeGreaterThan(20);
      const leftHalf = dots.filter((d) => d.x < 50);
      const rightHalf = dots.filter((d) => d.x >= 50);
      expect(rightHalf.length).toBeGreaterThan(leftHalf.length * 1.5);
    });

    it('stays strictly within width and height boundaries', () => {
      const dots = generateStippleDistribution(80, 60, () => 0.5);
      for (const d of dots) {
        expect(d.x).toBeGreaterThanOrEqual(1.0);
        expect(d.x).toBeLessThanOrEqual(79.0);
        expect(d.y).toBeGreaterThanOrEqual(1.0);
        expect(d.y).toBeLessThanOrEqual(59.0);
      }
    });
  });

  describe('applySpatialRelaxation', () => {
    it('keeps dot count invariant while shifting overlapping neighbors', () => {
      const dots: StippleDot[] = [
        { x: 50.0, y: 50.0, radius: 2.0, opacity: 1.0, tapTimeMs: 0 },
        { x: 50.5, y: 50.2, radius: 2.0, opacity: 1.0, tapTimeMs: 10 },
      ];

      const relaxed = applySpatialRelaxation(dots, 100, 100, 3);
      expect(relaxed.length).toBe(2);
      const initialDist = Math.hypot(dots[0].x - dots[1].x, dots[0].y - dots[1].y);
      const relaxedDist = Math.hypot(relaxed[0].x - relaxed[1].x, relaxed[0].y - relaxed[1].y);
      expect(relaxedDist).toBeGreaterThan(initialDist);
    });
  });

  describe('computeStippleFoleyTelemetry', () => {
    it('calculates rapid stylus tap impact rates and frequencies', () => {
      const dots: StippleDot[] = [
        { x: 10, y: 10, radius: 1.5, opacity: 1.0, tapTimeMs: 0 },
        { x: 20, y: 20, radius: 2.0, opacity: 1.0, tapTimeMs: 50 },
        { x: 30, y: 30, radius: 2.5, opacity: 1.0, tapTimeMs: 100 },
      ];

      const telemetry = computeStippleFoleyTelemetry(dots, 1000.0, {
        foleyTapVolume: 0.8,
        maxDotRadius: 2.5,
      });

      expect(telemetry.dotCount).toBe(3);
      expect(telemetry.tapRateHz).toBeCloseTo(3.0, 1);
      expect(telemetry.tapIntensity).toBeGreaterThan(0.0);
      expect(telemetry.transientPeakHz).toBeGreaterThanOrEqual(2200.0);
    });
  });

  describe('generateStippleSvgMarkup', () => {
    it('returns empty string when no dots are provided', () => {
      expect(generateStippleSvgMarkup([])).toBe('');
    });

    it('generates valid SVG group with circles for each stipple dot', () => {
      const dots: StippleDot[] = [
        { x: 15.5, y: 25.5, radius: 1.8, opacity: 0.9, tapTimeMs: 0 },
        { x: 35.0, y: 45.0, radius: 2.2, opacity: 1.0, tapTimeMs: 50 },
      ];

      const svg = generateStippleSvgMarkup(dots, { stippleColorHex: '#111111' });
      expect(svg).toContain('<g class="stipple-field"');
      expect(svg).toContain('cx="15.5" cy="25.5" r="1.80"');
      expect(svg).toContain('fill="#111111"');
      expect(svg).toContain('cx="35.0" cy="45.0" r="2.20"');
    });
  });
});
