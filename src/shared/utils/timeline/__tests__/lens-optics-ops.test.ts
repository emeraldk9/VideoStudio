import { describe, expect, it } from 'vitest';
import {
  buildCssLensStyle,
  buildFfmpegLensFilter,
  calculateDistortedCoordinate,
  DEFAULT_LENS_OPTICS_SETTINGS,
  LENS_OPTICS_PRESETS,
  type ClipLensOpticsSettings,
  type LensOpticsPresetKey,
} from '../lens-optics-ops';

describe('lens-optics-ops (Step S46: Cinematic Lens Distortion & Optics)', () => {
  const activeSettings: ClipLensOpticsSettings = {
    ...DEFAULT_LENS_OPTICS_SETTINGS,
    enabled: true,
    distortionK1: -0.2,
    distortionK2: -0.05,
    anamorphicRatio: 1.33,
    chromaticAberrationPx: 4,
    chromaticAberrationAngleDeg: 45,
    vignetteEnabled: true,
    vignetteStrength: 0.5,
    vignetteRadius: 0.8,
    vignetteFeather: 0.5,
    vignetteRoundness: 1.0,
    centerX: 0.5,
    centerY: 0.5,
  };

  describe('calculateDistortedCoordinate', () => {
    it('preserves the optical center coordinate untouched', () => {
      const coord = calculateDistortedCoordinate(0.5, 0.5, activeSettings);
      expect(coord.x).toBe(0.5);
      expect(coord.y).toBe(0.5);
    });

    it('returns identity coordinate for neutral settings', () => {
      const neutral: ClipLensOpticsSettings = {
        ...DEFAULT_LENS_OPTICS_SETTINGS,
        enabled: true,
      };
      const coord = calculateDistortedCoordinate(0.8, 0.2, neutral);
      expect(coord.x).toBe(0.8);
      expect(coord.y).toBe(0.2);
    });

    it('compresses coordinates toward optical center under negative k1 (barrel correction)', () => {
      const barrelSettings: ClipLensOpticsSettings = {
        ...DEFAULT_LENS_OPTICS_SETTINGS,
        enabled: true,
        distortionK1: -0.3,
        distortionK2: 0,
      };
      const origX = 0.9;
      const origY = 0.5;
      const coord = calculateDistortedCoordinate(origX, origY, barrelSettings);
      // Distance from center was 0.4; factor < 1 makes it closer to 0.5
      expect(coord.x).toBeLessThan(origX);
      expect(coord.x).toBeGreaterThan(0.5);
      expect(coord.y).toBe(0.5);
    });

    it('expands coordinates outward from optical center under positive k1 (pincushion)', () => {
      const pincushionSettings: ClipLensOpticsSettings = {
        ...DEFAULT_LENS_OPTICS_SETTINGS,
        enabled: true,
        distortionK1: 0.3,
        distortionK2: 0,
      };
      const origX = 0.9;
      const origY = 0.5;
      const coord = calculateDistortedCoordinate(origX, origY, pincushionSettings);
      expect(coord.x).toBeGreaterThan(origX);
      expect(coord.y).toBe(0.5);
    });
  });

  describe('buildCssLensStyle', () => {
    it('returns empty transform and null vignette when disabled or undefined', () => {
      expect(buildCssLensStyle(undefined)).toEqual({
        transform: '',
        filter: '',
        vignetteGradient: null,
      });
      expect(buildCssLensStyle({ ...activeSettings, enabled: false })).toEqual({
        transform: '',
        filter: '',
        vignetteGradient: null,
      });
    });

    it('generates anamorphic scaleX and zoom compensation in transform', () => {
      const style = buildCssLensStyle(activeSettings);
      expect(style.transform).toContain('scaleX(1.33)');
      expect(style.transform).toContain('scale(');
    });

    it('generates dual chromatic aberration drop-shadow filters', () => {
      const style = buildCssLensStyle(activeSettings);
      expect(style.filter).toContain('drop-shadow(');
      expect(style.filter).toContain('rgba(239,68,68');
      expect(style.filter).toContain('rgba(6,182,212');
    });

    it('generates radial-gradient for optical vignette', () => {
      const style = buildCssLensStyle(activeSettings);
      expect(style.vignetteGradient).toContain('radial-gradient(');
      expect(style.vignetteGradient).toContain('ellipse at 50% 50%');
      expect(style.vignetteGradient).toContain('transparent');
      expect(style.vignetteGradient).toContain('rgba(0, 0, 0, 0.5)');
    });
  });

  describe('buildFfmpegLensFilter', () => {
    it('returns null when settings are undefined, disabled, or neutral', () => {
      expect(buildFfmpegLensFilter(undefined)).toBeNull();
      expect(buildFfmpegLensFilter({ ...activeSettings, enabled: false })).toBeNull();
      expect(buildFfmpegLensFilter({ ...DEFAULT_LENS_OPTICS_SETTINGS, enabled: true })).toBeNull();
    });

    it('generates full FFmpeg filter chain for active settings', () => {
      const filter = buildFfmpegLensFilter(activeSettings);
      expect(filter).toContain('lenscorrection=cx=0.50:cy=0.50:k1=-0.200:k2=-0.050');
      expect(filter).toContain('scale=iw*1.33:ih');
      expect(filter).toContain('chromashift=cbh=4:crh=-4');
      expect(filter).toContain('vignette=angle=');
    });
  });

  describe('LENS_OPTICS_PRESETS', () => {
    it('contains all curated Hollywood and action-cam presets', () => {
      const keys = Object.keys(LENS_OPTICS_PRESETS) as LensOpticsPresetKey[];
      expect(keys).toContain('action_cam_flatten');
      expect(keys).toContain('vintage_anamorphic');
      expect(keys).toContain('retro_super16');
      expect(keys).toContain('extreme_fisheye');
      expect(keys).toContain('clean_subtle_vignette');

      for (const key of keys) {
        const preset = LENS_OPTICS_PRESETS[key];
        expect(preset.label.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
        expect(preset.settings).toBeDefined();
      }
    });
  });
});
