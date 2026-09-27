import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ONION_SKIN_CONFIG,
  validateOnionSkinConfig,
  computeOnionFrameAlpha,
  resolveOnionSkinTint,
  generatePegBarSvgMarkup,
  calculateLightTableBacklightCss,
} from '../onion-skin-light-table-ops';

describe('Multi-Layer Animation Onion Skinning & Light Table Backlighting Operations', () => {
  describe('validateOnionSkinConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateOnionSkinConfig();
      expect(cfg).toEqual(DEFAULT_ONION_SKIN_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.pastFramesCount).toBe(3);
      expect(cfg.futureFramesCount).toBe(3);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateOnionSkinConfig({
        pastFramesCount: 15,
        futureFramesCount: -2,
        baseOpacity: 2.0,
        opacityFalloffGamma: 0.05,
        lightTableIntensity: 5.0,
      });

      expect(clamped.pastFramesCount).toBe(5);
      expect(clamped.futureFramesCount).toBe(1);
      expect(clamped.baseOpacity).toBe(0.95);
      expect(clamped.opacityFalloffGamma).toBe(0.2);
      expect(clamped.lightTableIntensity).toBe(1.0);
    });
  });

  describe('computeOnionFrameAlpha', () => {
    it('returns full opacity (1.0) for current active frame (offset 0)', () => {
      expect(computeOnionFrameAlpha(0)).toBe(1.0);
    });

    it('returns baseOpacity for direct adjacent frames (offset -1 and +1)', () => {
      const cfg = { baseOpacity: 0.5, opacityFalloffGamma: 0.6 };
      expect(computeOnionFrameAlpha(-1, cfg)).toBeCloseTo(0.5, 4);
      expect(computeOnionFrameAlpha(1, cfg)).toBeCloseTo(0.5, 4);
    });

    it('follows geometric power falloff for distant frames', () => {
      const cfg = { baseOpacity: 0.5, opacityFalloffGamma: 0.6, pastFramesCount: 4 };
      expect(computeOnionFrameAlpha(-2, cfg)).toBeCloseTo(0.5 * 0.6, 4); // 0.3
      expect(computeOnionFrameAlpha(-3, cfg)).toBeCloseTo(0.5 * 0.36, 4); // 0.18
    });

    it('returns zero for frame offsets beyond configured window', () => {
      const cfg = { pastFramesCount: 2, futureFramesCount: 2 };
      expect(computeOnionFrameAlpha(-3, cfg)).toBe(0.0);
      expect(computeOnionFrameAlpha(4, cfg)).toBe(0.0);
    });
  });

  describe('resolveOnionSkinTint', () => {
    it('resolves cool past tint for negative offsets', () => {
      const past = resolveOnionSkinTint(-1, { pastTintHex: '#1450dc' });
      expect(past.hex).toBe('#1450dc');
      expect(past.alpha).toBeGreaterThan(0.0);
    });

    it('resolves warm future tint for positive offsets', () => {
      const future = resolveOnionSkinTint(1, { futureTintHex: '#eb7814' });
      expect(future.hex).toBe('#eb7814');
      expect(future.alpha).toBeGreaterThan(0.0);
    });

    it('resolves solid ink color for current frame (offset 0)', () => {
      const curr = resolveOnionSkinTint(0, { currentInkHex: '#000000' });
      expect(curr.hex).toBe('#000000');
      expect(curr.alpha).toBe(1.0);
    });
  });

  describe('generatePegBarSvgMarkup', () => {
    it('generates Acme 3-hole registration pin markup', () => {
      const svg = generatePegBarSvgMarkup(1920, 32, 120);
      expect(svg).toContain('class="acme-peg-bar"');
      expect(svg).toContain('<circle cx="960" cy="16" r="5"');
      expect(svg).toContain('<rect x="831" y="13" width="18" height="6"'); // 960 - 120 - 9
      expect(svg).toContain('<rect x="1071" y="13" width="18" height="6"'); // 960 + 120 - 9
    });
  });

  describe('calculateLightTableBacklightCss', () => {
    it('returns "none" when disabled or zero intensity', () => {
      expect(calculateLightTableBacklightCss({ enabled: false })).toBe('none');
      expect(calculateLightTableBacklightCss({ enabled: true, lightTableIntensity: 0.0 })).toBe('none');
    });

    it('generates radial gradient CSS when enabled', () => {
      const css = calculateLightTableBacklightCss({ enabled: true, lightTableIntensity: 0.8 });
      expect(css).toContain('radial-gradient');
      expect(css).toContain('circle at 50% 50%');
      expect(css).toContain('rgba(255, 252, 245');
    });
  });
});
