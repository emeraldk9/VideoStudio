import { describe, expect, it } from 'vitest';

import {
  FILTER_CATEGORIES,
  FILTER_PRESETS,
  filterPresetById,
  resolveFilterWithIntensity,
  VIDEO_EFFECT_CATEGORIES,
  VIDEO_EFFECT_PRESETS,
  videoEffectPresetById,
  buildVideoEffectStyle,
  buildColorFilterChain,
  buildVideoEffectFfmpegFilter,
  buildWindowedColorFilterChain,
  resolveFilterValues,
  type VideoEffectSettings,
} from '../../../index';

describe('CapCut Filters & Effects Engine', () => {
  describe('Filters & Intensity Engine', () => {
    it('has all 8 CapCut filter categories defined', () => {
      expect(FILTER_CATEGORIES.length).toBe(8);
      const categoryIds = FILTER_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain('trending');
      expect(categoryIds).toContain('cinematic');
      expect(categoryIds).toContain('portrait');
      expect(categoryIds).toContain('retro');
      expect(categoryIds).toContain('film');
      expect(categoryIds).toContain('atmosphere');
      expect(categoryIds).toContain('mono');
      expect(categoryIds).toContain('lens');
    });

    it('finds filter presets by id', () => {
      const tealOrange = filterPresetById('cinema_teal_orange');
      expect(tealOrange).toBeDefined();
      expect(tealOrange?.category).toBe('trending');
      expect(tealOrange?.filters.saturation).toBeGreaterThan(1);
    });

    it('scales filters smoothly at 0% intensity to neutral', () => {
      const original = { brightness: 0.2, contrast: 1.4, saturation: 1.5, hue: -20, vignette: 0.6 };
      const zero = resolveFilterWithIntensity(original, 0);

      expect(zero.brightness).toBe(0);
      expect(zero.contrast).toBe(1);
      expect(zero.saturation).toBe(1);
      expect(zero.hue).toBe(0);
      expect(zero.vignette).toBe(0);
    });

    it('scales filters smoothly at 50% intensity', () => {
      const original = { brightness: 0.2, contrast: 1.4, saturation: 1.6, hue: -20, vignette: 0.6 };
      const half = resolveFilterWithIntensity(original, 50);

      expect(half.brightness).toBe(0.1);
      expect(half.contrast).toBe(1.2);
      expect(half.saturation).toBe(1.3);
      expect(half.hue).toBe(-10);
      expect(half.vignette).toBe(0.3);
    });

    it('applies full filters at 100% intensity', () => {
      const original = { brightness: 0.2, contrast: 1.4, saturation: 1.6, hue: -20, vignette: 0.6 };
      const full = resolveFilterWithIntensity(original, 100);

      expect(full.brightness).toBe(0.2);
      expect(full.contrast).toBe(1.4);
      expect(full.saturation).toBe(1.6);
      expect(full.hue).toBe(-20);
      expect(full.vignette).toBe(0.6);
    });

    it('resolveFilterValues honors filterIntensity on ClipEffects', () => {
      const effects = {
        filters: { brightness: 0.2, contrast: 1.4, saturation: 1.6, hue: -20, vignette: 0.6 },
        filterIntensity: 50,
      };
      const resolved = resolveFilterValues(effects);

      expect(resolved.brightness).toBe(0.1);
      expect(resolved.contrast).toBe(1.2);
      expect(resolved.saturation).toBe(1.3);
      expect(resolved.hue).toBe(-10);
      expect(resolved.vignette).toBe(0.3);
    });
  });

  describe('Video Effects Engine', () => {
    it('has all 8 Video Effect categories defined with presets', () => {
      expect(VIDEO_EFFECT_CATEGORIES.length).toBe(8);
      expect(VIDEO_EFFECT_PRESETS.length).toBeGreaterThanOrEqual(30);

      const categoryIds = VIDEO_EFFECT_CATEGORIES.map((c) => c.id);
      for (const catId of categoryIds) {
        const presetsInCat = VIDEO_EFFECT_PRESETS.filter((p) => p.category === catId);
        expect(presetsInCat.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('finds video effect preset by id and contains valid CSS classes', () => {
      const shake = videoEffectPresetById('camera_shake');
      expect(shake).toBeDefined();
      expect(shake?.cssClass).toBe('vfx-camera-shake');
      expect(shake?.badge).toBe('HOT');

      const glitch = videoEffectPresetById('cyberpunk_glitch');
      expect(glitch).toBeDefined();
      expect(glitch?.category).toBe('light_glitch');
    });

    it('builds CSS properties from VideoEffectSettings', () => {
      const settings: VideoEffectSettings = {
        id: 'vfx-1',
        presetId: 'camera_shake',
        label: 'Camera Shake',
        category: 'trending',
        intensity: 80,
        speed: 60,
        scale: 70,
        param: 45,
        colorHex: '#38bdf8',
      };

      const style = buildVideoEffectStyle(settings) as Record<string, string>;
      expect(style['--vfx-intensity']).toBe('0.80');
      expect(style['--vfx-scale']).toBe('1.40');
      expect(style['--vfx-param']).toBe('0.45');
      expect(style['--vfx-color']).toBe('#38bdf8');
    });

    it('returns empty styles if effect is disabled', () => {
      const settings: VideoEffectSettings = {
        id: 'vfx-1',
        presetId: 'camera_shake',
        label: 'Camera Shake',
        category: 'trending',
        intensity: 80,
        speed: 60,
        disabled: true,
      };

      const style = buildVideoEffectStyle(settings);
      expect(Object.keys(style).length).toBe(0);
    });

    it('builds ffmpeg filter chains for export and time-windowed application', () => {
      const vfx: VideoEffectSettings = {
        id: 'vfx-1',
        presetId: 'camera_shake',
        label: 'Camera Shake',
        category: 'trending',
        intensity: 80,
        speed: 60,
      };

      const ffmpeg = buildVideoEffectFfmpegFilter(vfx);
      expect(ffmpeg).toContain('crop=');
      expect(ffmpeg).toContain('scale=');

      const windowed = buildWindowedColorFilterChain(
        { videoEffect: vfx },
        1.5,
        4.5,
      );
      expect(windowed).toContain('between(t,1.500,4.500)');
    });
  });
});
