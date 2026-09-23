import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIDEO_STABILIZER_SETTINGS,
  VIDEO_STABILIZER_PRESETS,
  calculateOptimalZoomMargin,
  smoothTrajectoryGaussian,
  buildFfmpegStabilizerFilter,
  type VideoStabilizerSettings,
} from '../video-stabilizer-ops';

describe('video-stabilizer-ops', () => {
  describe('calculateOptimalZoomMargin', () => {
    it('returns 0 when displacement is 0', () => {
      expect(calculateOptimalZoomMargin(0, 1920, 1080)).toBe(0);
    });

    it('calculates proportional zoom factor for displacement', () => {
      // 54px displacement on 1080p min dimension: 2 * 54 / 1080 = 0.1
      expect(calculateOptimalZoomMargin(54, 1920, 1080)).toBe(0.1);
    });

    it('clamps maximum zoom factor to 0.35', () => {
      expect(calculateOptimalZoomMargin(500, 1920, 1080)).toBe(0.35);
    });
  });

  describe('smoothTrajectoryGaussian', () => {
    it('returns copy when points array has 1 or fewer elements', () => {
      expect(smoothTrajectoryGaussian([])).toEqual([]);
      expect(smoothTrajectoryGaussian([{ x: 10, y: 20 }])).toEqual([{ x: 10, y: 20 }]);
    });

    it('smooths high-frequency noise while preserving average trend', () => {
      const noisyPoints = [
        { x: 100, y: 100 },
        { x: 110, y: 120 }, // spike
        { x: 102, y: 98 },
        { x: 101, y: 101 },
      ];
      const smoothed = smoothTrajectoryGaussian(noisyPoints, 3);
      expect(smoothed).toHaveLength(4);
      // Spike at index 1 should be damped
      expect(smoothed[1].y).toBeLessThan(120);
      expect(smoothed[1].y).toBeGreaterThan(100);
    });

    it('maintains constant points unchanged', () => {
      const constPoints = [
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 50 },
      ];
      const smoothed = smoothTrajectoryGaussian(constPoints, 3);
      for (const pt of smoothed) {
        expect(pt.x).toBeCloseTo(50, 2);
        expect(pt.y).toBeCloseTo(50, 2);
      }
    });
  });

  describe('buildFfmpegStabilizerFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegStabilizerFilter(DEFAULT_VIDEO_STABILIZER_SETTINGS)).toBe('');
    });

    it('emits deshake and scale/crop when enabled with autoCropZoom', () => {
      const settings: VideoStabilizerSettings = {
        enabled: true,
        mode: 'smooth_motion',
        smoothness: 15,
        shakiness: 6,
        autoCropZoom: 0.1,
        rollingShutterCorrection: true,
        rollingShutterStrength: 0.5,
      };
      const filter = buildFfmpegStabilizerFilter(settings);
      expect(filter).toContain('deshake=x=0:y=0:w=0:h=0:rx=36:ry=36:edge=mirror');
      expect(filter).toContain('scale=iw*1.100:ih*1.100');
      expect(filter).toContain('crop=iw/(1+0):ih/(1+0)');
    });

    it('emits only deshake when autoCropZoom is 0', () => {
      const settings: VideoStabilizerSettings = {
        enabled: true,
        mode: 'tripod_lock',
        smoothness: 30,
        shakiness: 4,
        autoCropZoom: 0,
        rollingShutterCorrection: false,
        rollingShutterStrength: 0,
      };
      const filter = buildFfmpegStabilizerFilter(settings);
      expect(filter).toContain('deshake=');
      expect(filter).not.toContain('scale=');
    });
  });

  describe('VIDEO_STABILIZER_PRESETS', () => {
    it('contains all 4 studio presets with valid parameters', () => {
      const presets = Object.keys(VIDEO_STABILIZER_PRESETS);
      expect(presets).toHaveLength(4);
      expect(presets).toContain('handheld_vlog');
      expect(presets).toContain('action_cam_extreme');
      expect(presets).toContain('drone_aerial');
      expect(presets).toContain('tripod_lock');

      for (const key of presets as Array<keyof typeof VIDEO_STABILIZER_PRESETS>) {
        const preset = VIDEO_STABILIZER_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.settings.smoothness).toBeGreaterThanOrEqual(1);
        expect(preset.settings.shakiness).toBeGreaterThanOrEqual(1);
        expect(preset.settings.autoCropZoom).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
