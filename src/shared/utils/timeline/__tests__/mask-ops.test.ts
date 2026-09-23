import { describe, expect, it } from 'vitest';

import {
  buildCssClipPath,
  buildFfmpegMaskFilter,
  buildSvgMaskData,
  DEFAULT_MASK_SETTINGS,
  MASK_PRESETS,
  MASK_SHAPES,
  type ClipMaskSettings,
  type MaskShapeType,
} from '../mask-ops';

describe('mask-ops (Video Masking, Shape Cropping & Feathering Engine)', () => {
  describe('buildCssClipPath', () => {
    it('returns empty string when mask is undefined, disabled, or shape is none', () => {
      expect(buildCssClipPath(undefined)).toBe('');
      expect(buildCssClipPath({ ...DEFAULT_MASK_SETTINGS, enabled: false })).toBe('');
      expect(buildCssClipPath({ ...DEFAULT_MASK_SETTINGS, enabled: true, shape: 'none' })).toBe('');
    });

    it('generates inset expression for rectangular mask with corner radius', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'rectangle',
        x: 0.5,
        y: 0.5,
        width: 0.6,
        height: 0.4,
        cornerRadius: 16,
        feather: 0,
      };
      const clipPath = buildCssClipPath(settings);
      expect(clipPath).toContain('inset(');
      expect(clipPath).toContain('round 16px');
      // Centered: top = 30%, bottom = 30%, left = 20%, right = 20%
      expect(clipPath).toContain('30.00%');
      expect(clipPath).toContain('20.00%');
    });

    it('generates ellipse expression for circular / oval mask', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'circle',
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 0.5,
        feather: 0,
      };
      const clipPath = buildCssClipPath(settings);
      expect(clipPath).toBe('ellipse(25.00% 25.00% at 50.00% 50.00%)');
    });

    it('generates polygon expression for split screen', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'split',
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 1.0,
        feather: 0,
      };
      const clipPath = buildCssClipPath(settings);
      expect(clipPath).toBe('polygon(0% 0%, 50.00% 0%, 50.00% 100%, 0% 100%)');
    });

    it('generates cinematic widescreen letterbox matte for filmstrip', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'filmstrip',
        x: 0.5,
        y: 0.5,
        width: 1.0,
        height: 0.75, // 12.5% bar top and bottom
        feather: 0,
      };
      const clipPath = buildCssClipPath(settings);
      expect(clipPath).toBe('inset(12.50% 0% 12.50% 0%)');
    });

    it('generates polygon points for star and heart shapes', () => {
      const starSettings: ClipMaskSettings = {
        enabled: true,
        shape: 'star',
        x: 0.5,
        y: 0.5,
        width: 0.6,
        height: 0.6,
        feather: 0,
      };
      const starClipPath = buildCssClipPath(starSettings);
      expect(starClipPath.startsWith('polygon(')).toBe(true);
      expect(starClipPath.split(',').length).toBe(10); // 10 vertices

      const heartSettings: ClipMaskSettings = {
        enabled: true,
        shape: 'heart',
        x: 0.5,
        y: 0.5,
        width: 0.6,
        height: 0.6,
        feather: 0,
      };
      const heartClipPath = buildCssClipPath(heartSettings);
      expect(heartClipPath.startsWith('polygon(')).toBe(true);
      expect(heartClipPath.split(',').length).toBe(10);
    });
  });

  describe('buildSvgMaskData', () => {
    it('returns null when mask is disabled or none', () => {
      expect(buildSvgMaskData(undefined, 'clip-1')).toBeNull();
      expect(buildSvgMaskData({ ...DEFAULT_MASK_SETTINGS, enabled: false }, 'clip-1')).toBeNull();
    });

    it('generates ellipse mask data with feather blur deviation', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'circle',
        x: 0.5,
        y: 0.5,
        width: 0.4,
        height: 0.4,
        feather: 10,
        invert: false,
      };
      const data = buildSvgMaskData(settings, 'c1');
      expect(data).not.toBeNull();
      expect(data!.maskId).toBe('mask-c1');
      expect(data!.hasFeather).toBe(true);
      expect(data!.blurDeviation).toBe(5); // feather / 2
      expect(data!.shapeElement.tag).toBe('ellipse');
      expect(data!.shapeElement.props.cx).toBe('50%');
      expect(data!.shapeElement.props.rx).toBe('20%');
      expect(data!.shapeElement.props.fill).toBe('white');
    });

    it('handles inverted masks by reversing shape fill to black', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'rectangle',
        x: 0.5,
        y: 0.5,
        width: 0.6,
        height: 0.6,
        feather: 4,
        invert: true,
      };
      const data = buildSvgMaskData(settings, 'c2');
      expect(data).not.toBeNull();
      expect(data!.invert).toBe(true);
      expect(data!.shapeElement.props.fill).toBe('black');
    });
  });

  describe('buildFfmpegMaskFilter', () => {
    it('returns empty string when mask is disabled or none', () => {
      expect(buildFfmpegMaskFilter(undefined, 1920, 1080)).toBe('');
      expect(buildFfmpegMaskFilter({ ...DEFAULT_MASK_SETTINGS, enabled: false }, 1920, 1080)).toBe('');
    });

    it('computes exact pixel coordinates for rectangle box crop', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'rectangle',
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 0.5,
        feather: 0,
      };
      // 1920x1080 -> 960x540 centered at x=480, y=270
      const filter = buildFfmpegMaskFilter(settings, 1920, 1080);
      expect(filter).toBe('crop=960:540:480:270');
    });

    it('generates top and bottom black drawboxes for cinematic letterbox', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'filmstrip',
        x: 0.5,
        y: 0.5,
        width: 1.0,
        height: 0.8, // 10% bar top and bottom -> 108px on 1080p
        feather: 0,
      };
      const filter = buildFfmpegMaskFilter(settings, 1920, 1080);
      expect(filter).toContain('drawbox=x=0:y=0:w=1920:h=108');
      expect(filter).toContain('drawbox=x=0:y=972:w=1920:h=108');
    });

    it('generates left-crop for split screen', () => {
      const settings: ClipMaskSettings = {
        enabled: true,
        shape: 'split',
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 1.0,
        feather: 0,
      };
      const filter = buildFfmpegMaskFilter(settings, 1920, 1080);
      expect(filter).toBe('crop=960:1080:0:0');
    });
  });

  describe('Shape Registry & Presets', () => {
    it('contains all 7 defined mask shapes with metadata', () => {
      expect(MASK_SHAPES.length).toBe(7);
      const types = MASK_SHAPES.map((s) => s.type);
      const expected: MaskShapeType[] = [
        'none',
        'rectangle',
        'circle',
        'split',
        'filmstrip',
        'heart',
        'star',
      ];
      for (const t of expected) {
        expect(types).toContain(t);
      }
    });

    it('contains calibrated studio presets with valid dimensions', () => {
      const presets = Object.values(MASK_PRESETS);
      expect(presets.length).toBeGreaterThanOrEqual(6);
      for (const p of presets) {
        expect(p.name).toBeTruthy();
        expect(p.settings.width).toBeGreaterThan(0);
        expect(p.settings.height).toBeGreaterThan(0);
        expect(p.settings.x).toBeGreaterThanOrEqual(0);
        expect(p.settings.y).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
