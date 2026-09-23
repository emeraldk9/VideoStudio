import { describe, expect, it } from 'vitest';

import {
  applySpillSuppression,
  BLEND_MODES,
  buildFfmpegBlendFilter,
  buildFfmpegChromaKeyFilter,
  buildSvgChromaFilterMatrix,
  calculateChromaDistance,
  calculateKeyAlpha,
  CHROMA_KEY_PRESETS,
  DEFAULT_CHROMA_KEY_SETTINGS,
  hexToRgb,
  rgbToHex,
  rgbToYuv,
  type BlendMode,
  type ChromaKeySettings,
} from '../compositing-ops';

describe('compositing-ops (Video Compositing, Blend Modes & Chroma Key Engine)', () => {
  describe('Color Conversion Utilities', () => {
    it('parses 6-digit and 3-digit hex strings to RGB', () => {
      expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('123456')).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
    });

    it('formats RGB numbers to uppercase 6-character hex strings', () => {
      expect(rgbToHex(0, 255, 0)).toBe('#00FF00');
      expect(rgbToHex(255, 0, 128)).toBe('#FF0080');
      expect(rgbToHex(-10, 300, 50)).toBe('#00FF32'); // Clamped to [0, 255]
    });

    it('converts RGB to normalized YUV colorspace', () => {
      const black = rgbToYuv(0, 0, 0);
      expect(black.y).toBe(0);
      expect(black.u).toBe(0);
      expect(black.v).toBe(0);

      const white = rgbToYuv(255, 255, 255);
      expect(white.y).toBeCloseTo(1.0, 3);
      expect(white.u).toBeCloseTo(0.0, 3);
      expect(white.v).toBeCloseTo(0.0, 3);

      const green = rgbToYuv(0, 255, 0);
      expect(green.y).toBeCloseTo(0.587, 3);
      expect(green.u).toBeLessThan(0); // Negative U for green
      expect(green.v).toBeLessThan(0); // Negative V for green
    });
  });

  describe('calculateChromaDistance & calculateKeyAlpha', () => {
    const greenScreen = { r: 0, g: 255, b: 0 };
    const pureRed = { r: 255, g: 0, b: 0 };
    const slightlyDarkGreen = { r: 10, g: 230, b: 10 };

    it('yields 0 distance for identical chromaticity', () => {
      expect(calculateChromaDistance(greenScreen, greenScreen)).toBe(0);
    });

    it('yields small distance between similar shades of green', () => {
      const dist = calculateChromaDistance(greenScreen, slightlyDarkGreen);
      expect(dist).toBeLessThan(0.12);
    });

    it('yields large distance between green and red', () => {
      const dist = calculateChromaDistance(greenScreen, pureRed);
      expect(dist).toBeGreaterThan(0.5);
    });

    it('returns alpha = 0.0 for exact key color', () => {
      const alpha = calculateKeyAlpha(greenScreen, greenScreen, 0.35, 0.08);
      expect(alpha).toBe(0.0);
    });

    it('returns alpha = 1.0 for non-key color (e.g. red subject)', () => {
      const alpha = calculateKeyAlpha(pureRed, greenScreen, 0.35, 0.08);
      expect(alpha).toBe(1.0);
    });

    it('provides smoothstep transition in the transition softness band', () => {
      // Create a series of color variations between keyed and unkeyed
      const alphaInside = calculateKeyAlpha({ r: 0, g: 255, b: 0 }, greenScreen, 0.3, 0.1);
      const alphaEdge = calculateKeyAlpha({ r: 60, g: 200, b: 60 }, greenScreen, 0.3, 0.1);
      const alphaOutside = calculateKeyAlpha(pureRed, greenScreen, 0.3, 0.1);

      expect(alphaInside).toBe(0.0);
      expect(alphaEdge).toBeGreaterThan(0.0);
      expect(alphaEdge).toBeLessThan(1.0);
      expect(alphaOutside).toBe(1.0);
    });
  });

  describe('applySpillSuppression', () => {
    it('returns unmodified color when spill factor is 0', () => {
      const greenEdge = { r: 100, g: 200, b: 100 };
      expect(applySpillSuppression(greenEdge, '#00FF00', 0)).toEqual(greenEdge);
    });

    it('despills green reflections on edge pixels for green key', () => {
      const greenEdge = { r: 100, g: 200, b: 100 }; // Green exceeds average of R and B (100)
      const despilled = applySpillSuppression(greenEdge, '#00FF00', 0.8);
      expect(despilled.g).toBeLessThan(greenEdge.g);
      expect(despilled.g).toBeCloseTo(120, 5); // 100 + 0.2 * 100 = 120
      expect(despilled.r).toBe(100);
      expect(despilled.b).toBe(100);
    });

    it('despills blue reflections on edge pixels for blue key', () => {
      const blueEdge = { r: 80, g: 80, b: 200 }; // Blue exceeds average of R and G (80)
      const despilled = applySpillSuppression(blueEdge, '#0000FF', 0.5);
      expect(despilled.b).toBeLessThan(blueEdge.b);
      expect(despilled.b).toBeCloseTo(140, 5); // 80 + 0.5 * 120 = 140
      expect(despilled.r).toBe(80);
      expect(despilled.g).toBe(80);
    });
  });

  describe('buildFfmpegChromaKeyFilter & buildFfmpegBlendFilter', () => {
    it('returns empty string when chroma key is disabled or undefined', () => {
      expect(buildFfmpegChromaKeyFilter(undefined)).toBe('');
      expect(buildFfmpegChromaKeyFilter({ ...DEFAULT_CHROMA_KEY_SETTINGS, enabled: false })).toBe('');
    });

    it('builds accurate FFmpeg chromakey and despill filter string', () => {
      const settings: ChromaKeySettings = {
        enabled: true,
        keyColorHex: '#00FF00',
        similarity: 0.35,
        smoothness: 0.08,
        spillSuppression: 0.6,
      };
      const filter = buildFfmpegChromaKeyFilter(settings);
      expect(filter).toContain('chromakey=color=0x00FF00:similarity=0.350:blend=0.080');
      expect(filter).toContain('despill=type=green:mix=0.60');
    });

    it('builds blue screen despill filter when blue key color is used', () => {
      const settings: ChromaKeySettings = {
        enabled: true,
        keyColorHex: '#0000FF',
        similarity: 0.3,
        smoothness: 0.05,
        spillSuppression: 0.5,
      };
      const filter = buildFfmpegChromaKeyFilter(settings);
      expect(filter).toContain('despill=type=blue:mix=0.50');
    });

    it('builds FFmpeg blend filter for overlay blend modes', () => {
      expect(buildFfmpegBlendFilter('normal')).toBe('');
      expect(buildFfmpegBlendFilter(undefined)).toBe('');
      expect(buildFfmpegBlendFilter('screen')).toBe("blend=all_mode='screen'");
      expect(buildFfmpegBlendFilter('multiply')).toBe("blend=all_mode='multiply'");
      expect(buildFfmpegBlendFilter('color-dodge')).toBe("blend=all_mode='dodge'");
      expect(buildFfmpegBlendFilter('overlay')).toBe("blend=all_mode='overlay'");
    });
  });

  describe('buildSvgChromaFilterMatrix', () => {
    it('returns default identity matrix when disabled', () => {
      const result = buildSvgChromaFilterMatrix(undefined);
      expect(result.matrixValues).toContain('0 0 0 1 0');
      expect(result.slope).toBe(1);
    });

    it('generates green-subtraction matrix for active green screen', () => {
      const settings: ChromaKeySettings = {
        enabled: true,
        keyColorHex: '#00FF00',
        similarity: 0.35,
        smoothness: 0.08,
        spillSuppression: 0.5,
      };
      const result = buildSvgChromaFilterMatrix(settings);
      expect(result.matrixValues).toContain('-1.2'); // Negative weight on green
      expect(result.slope).toBeGreaterThan(0);
    });
  });

  describe('Presets & Blend Modes Registries', () => {
    it('contains all 12 standard NLE blend modes', () => {
      expect(BLEND_MODES.length).toBe(12);
      const modes = BLEND_MODES.map((b) => b.mode);
      const expected: BlendMode[] = [
        'normal',
        'screen',
        'multiply',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'color-burn',
        'hard-light',
        'soft-light',
        'difference',
        'exclusion',
      ];
      for (const m of expected) {
        expect(modes).toContain(m);
      }
    });

    it('contains calibrated chroma key presets with valid hex colors', () => {
      const presets = Object.values(CHROMA_KEY_PRESETS);
      expect(presets.length).toBeGreaterThanOrEqual(4);
      for (const p of presets) {
        expect(p.settings.keyColorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(p.settings.similarity).toBeGreaterThan(0);
        expect(p.settings.smoothness).toBeGreaterThanOrEqual(0);
        expect(p.settings.spillSuppression).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
