import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHARCOAL_TORTILLON_CONFIG,
  validateCharcoalTortillonConfig,
  computeToothDeposition,
  computeStumpSmearFalloff,
  blendPowderSample,
} from '../charcoal-tortillon-ops';

describe('Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending Operations', () => {
  describe('validateCharcoalTortillonConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateCharcoalTortillonConfig();
      expect(cfg).toEqual(DEFAULT_CHARCOAL_TORTILLON_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.mediaType).toBe('vine_charcoal');
    });

    it('preserves valid media types', () => {
      expect(validateCharcoalTortillonConfig({ mediaType: 'compressed_charcoal' }).mediaType).toBe('compressed_charcoal');
      expect(validateCharcoalTortillonConfig({ mediaType: 'conte_crayon' }).mediaType).toBe('conte_crayon');
    });

    it('falls back to default for invalid media type', () => {
      // @ts-expect-error invalid test input
      expect(validateCharcoalTortillonConfig({ mediaType: 'invalid_crayon' }).mediaType).toBe('vine_charcoal');
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateCharcoalTortillonConfig({
        powderFriability: 2.5,
        stumpHardness: 0.05,
        blendRadiusPx: 100.0,
        burnishDepth: -0.5,
      });

      expect(clamped.powderFriability).toBe(1.0);
      expect(clamped.stumpHardness).toBe(0.1);
      expect(clamped.blendRadiusPx).toBe(25.0);
      expect(clamped.burnishDepth).toBe(0.1);
    });
  });

  describe('computeToothDeposition', () => {
    it('deposits more powder with higher stylus pressure', () => {
      const lowPress = computeToothDeposition(0.2, 0.5, 0.75);
      const highPress = computeToothDeposition(0.8, 0.5, 0.75);
      expect(highPress).toBeGreaterThan(lowPress);
    });

    it('grips significantly more powder on tooth ridges (peaks) than in valleys', () => {
      const valley = computeToothDeposition(0.6, 0.1, 0.75);
      const peak = computeToothDeposition(0.6, 0.9, 0.75);
      expect(peak).toBeGreaterThan(valley);
    });

    it('scales deposition directly with media friability', () => {
      const firmMedia = computeToothDeposition(0.5, 0.5, 0.3); // conte
      const friableMedia = computeToothDeposition(0.5, 0.5, 0.9); // vine charcoal
      expect(friableMedia).toBeGreaterThan(firmMedia);
    });
  });

  describe('computeStumpSmearFalloff', () => {
    it('produces peak influence at distance 0 and zero beyond blend radius', () => {
      const center = computeStumpSmearFalloff(0.0, 10.0, 0.8);
      const mid = computeStumpSmearFalloff(5.0, 10.0, 0.8);
      const outside = computeStumpSmearFalloff(12.0, 10.0, 0.8);

      expect(center).toBeCloseTo(0.8, 4);
      expect(mid).toBeLessThan(center);
      expect(outside).toBe(0.0);
    });

    it('scales with stump pressure', () => {
      const light = computeStumpSmearFalloff(2.0, 10.0, 0.3);
      const heavy = computeStumpSmearFalloff(2.0, 10.0, 0.9);
      expect(heavy).toBeGreaterThan(light);
    });
  });

  describe('blendPowderSample', () => {
    it('returns source powder unaltered when stump influence is zero', () => {
      const out = blendPowderSample(0.7, 0.5, 0.5, 0.0);
      expect(out).toBe(0.7);
    });

    it('deposits powder from reservoir into bare tooth valleys', () => {
      // Source powder is zero (bare paper outside stroke)
      const bareValley = blendPowderSample(0.0, 0.6, 0.2, 0.8);
      expect(bareValley).toBeGreaterThan(0.05);
    });

    it('deepens burnish into valleys when burnishDepth is higher', () => {
      const shallow = blendPowderSample(0.0, 0.6, 0.2, 0.8, { burnishDepth: 0.2 });
      const deep = blendPowderSample(0.0, 0.6, 0.2, 0.8, { burnishDepth: 0.9 });
      expect(deep).toBeGreaterThan(shallow);
    });
  });
});
