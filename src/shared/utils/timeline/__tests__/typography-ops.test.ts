import { describe, it, expect } from 'vitest';
import {
  FONT_FAMILIES,
  STUDIO_TEXT_PRESETS,
  calculateTypewriterSlice,
  calculateTextMotionTransform,
  buildFfmpegDrawTextOptions,
} from '../typography-ops';

describe('typography-ops', () => {
  describe('FONT_FAMILIES', () => {
    it('contains all 8 curated font families with categories and css definitions', () => {
      expect(FONT_FAMILIES).toHaveLength(8);
      const families = FONT_FAMILIES.map((f) => f.family);
      expect(families).toContain('Inter');
      expect(families).toContain('Montserrat');
      expect(families).toContain('Bebas Neue');
      expect(families).toContain('Playfair Display');
      expect(families).toContain('Oswald');
      expect(families).toContain('Cinzel');
      expect(families).toContain('Roboto Mono');
      expect(families).toContain('Impact');

      for (const font of FONT_FAMILIES) {
        expect(font.label).toBeTruthy();
        expect(font.cssFont).toBeTruthy();
        expect(['sans', 'serif', 'display', 'mono']).toContain(font.category);
      }
    });
  });

  describe('STUDIO_TEXT_PRESETS', () => {
    it('provides high quality motion title presets', () => {
      const presetKeys = Object.keys(STUDIO_TEXT_PRESETS);
      expect(presetKeys.length).toBeGreaterThanOrEqual(6);

      expect(STUDIO_TEXT_PRESETS.cinematic_gold).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.cyberpunk_neon).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.modern_bold).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.typewriter_retro).toBeDefined();

      for (const [id, preset] of Object.entries(STUDIO_TEXT_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(preset.name).toBeTruthy();
        expect(preset.fontSizePx).toBeGreaterThan(0);
        expect(preset.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('calculateTypewriterSlice', () => {
    const text = 'Hello VideoStudio!';

    it('returns empty string when frame is 0 or negative', () => {
      expect(calculateTypewriterSlice(text, 0, 30)).toBe('');
      expect(calculateTypewriterSlice(text, -5, 30)).toBe('');
    });

    it('returns full text when frame is at or beyond duration', () => {
      expect(calculateTypewriterSlice(text, 30, 30)).toBe(text);
      expect(calculateTypewriterSlice(text, 45, 30)).toBe(text);
    });

    it('returns full text if duration is zero or negative', () => {
      expect(calculateTypewriterSlice(text, 10, 0)).toBe(text);
      expect(calculateTypewriterSlice(text, 10, -1)).toBe(text);
    });

    it('slices proportionally at mid-point frames', () => {
      const half = calculateTypewriterSlice(text, 15, 30);
      expect(half.length).toBe(Math.round(text.length * 0.5));
      expect(text.startsWith(half)).toBe(true);
    });

    it('handles empty string gracefully', () => {
      expect(calculateTypewriterSlice('', 10, 30)).toBe('');
    });
  });

  describe('calculateTextMotionTransform', () => {
    it('returns empty state for none, undefined, or typewriter animation', () => {
      expect(calculateTextMotionTransform(undefined, 10, 30)).toEqual({});
      expect(calculateTextMotionTransform({ type: 'none', durationFrames: 30 }, 10, 30)).toEqual({});
      expect(calculateTextMotionTransform({ type: 'typewriter', durationFrames: 30 }, 10, 30)).toEqual({});
    });

    it('calculates fade_in opacity easing from 0 to 1', () => {
      const start = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 0, 30);
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 20, 30);
      expect(end.opacity).toBe(1);

      const mid = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 10, 30);
      expect(mid.opacity).toBeGreaterThan(0);
      expect(mid.opacity).toBeLessThan(1);
    });

    it('calculates slide_up translation from +36px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_up', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateY(36.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_up', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates slide_down translation from -36px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_down', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateY(-36.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_down', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates pop_scale with subtle overshoot (> 1.0) and settles to 1.0', () => {
      const start = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 0, 30);
      expect(start.transform).toContain('scale(0.300)');

      // At ~70% of duration (14 of 20 frames), overshoot hits peak (scale 1.050)
      const peak = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 14, 30);
      expect(peak.transform).toContain('scale(1.050)');

      // Settles to 1.000 at end
      const end = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 20, 30);
      expect(end.transform).toContain('scale(1.000)');
    });

    it('calculates bounce physics with vertical offset and opacity decay', () => {
      const start = calculateTextMotionTransform({ type: 'bounce', durationFrames: 30 }, 0, 30);
      expect(start.transform).toContain('translateY(-30.0px)');

      const end = calculateTextMotionTransform({ type: 'bounce', durationFrames: 30 }, 30, 30);
      expect(end.transform).toContain('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates glow_pulse with pulsating textShadow', () => {
      const frame0 = calculateTextMotionTransform({ type: 'glow_pulse', durationFrames: 30 }, 0, 30);
      expect(frame0.textShadow).toContain('rgba(0, 240, 255,');

      const frame15 = calculateTextMotionTransform({ type: 'glow_pulse', durationFrames: 30 }, 15, 30);
      expect(frame15.textShadow).toContain('rgba(0, 240, 255,');
    });
  });

  describe('buildFfmpegDrawTextOptions', () => {
    it('returns empty options when neither stroke nor shadow is set', () => {
      expect(buildFfmpegDrawTextOptions({})).toEqual({});
    });

    it('outputs borderw and bordercolor when stroke width > 0', () => {
      const opts = buildFfmpegDrawTextOptions({
        stroke: { colorHex: '#000000', widthPx: 3.5 },
      });
      expect(opts.borderw).toBe(4);
      expect(opts.bordercolor).toBe('#000000');
    });

    it('outputs shadowx, shadowy, shadowcolor when shadow is configured', () => {
      const opts = buildFfmpegDrawTextOptions({
        shadow: { colorHex: '#FF0000', blurPx: 5, offsetX: 3, offsetY: 4, opacity: 0.8 },
      });
      expect(opts.shadowx).toBe(3);
      expect(opts.shadowy).toBe(4);
      expect(opts.shadowcolor).toBe('#FF0000');
    });

    it('combines both stroke and shadow options simultaneously', () => {
      const opts = buildFfmpegDrawTextOptions({
        stroke: { colorHex: '#FFFFFF', widthPx: 2 },
        shadow: { colorHex: '#000000', blurPx: 8, offsetX: 2, offsetY: 2, opacity: 0.9 },
      });
      expect(opts.borderw).toBe(2);
      expect(opts.bordercolor).toBe('#FFFFFF');
      expect(opts.shadowx).toBe(2);
      expect(opts.shadowy).toBe(2);
      expect(opts.shadowcolor).toBe('#000000');
    });
  });
});
