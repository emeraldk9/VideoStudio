import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MOTION_BLUR_SETTINGS,
  MOTION_BLUR_PRESETS,
  calculateExposureFraction,
  calculateEffectiveShutterSpeed,
  buildFfmpegMotionBlurFilter,
  MotionBlurSettings,
} from '../motion-blur-ops';

describe('motion-blur-ops', () => {
  it('has default motion blur settings disabled with 180-degree cinema angle', () => {
    expect(DEFAULT_MOTION_BLUR_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_MOTION_BLUR_SETTINGS.shutterAngle).toBe(180);
    expect(DEFAULT_MOTION_BLUR_SETTINGS.shutterPhase).toBe(0);
    expect(DEFAULT_MOTION_BLUR_SETTINGS.sampleCount).toBe(8);
  });

  it('contains all 4 cinema presets within valid operational ranges', () => {
    const keys = [
      'cinema_standard_180',
      'action_staccato_90',
      'dreamy_fluid_360',
      'high_speed_ramp',
    ] as const;

    for (const key of keys) {
      const preset = MOTION_BLUR_PRESETS[key];
      expect(preset.enabled).toBe(true);
      expect(preset.preset).toBe(key);
      expect(preset.shutterAngle).toBeGreaterThanOrEqual(0);
      expect(preset.shutterAngle).toBeLessThanOrEqual(360);
      expect(preset.sampleCount).toBeGreaterThanOrEqual(2);
      expect(preset.sampleCount).toBeLessThanOrEqual(16);
    }
  });

  describe('calculateExposureFraction', () => {
    it('calculates exact exposure fractions for standard angles', () => {
      expect(calculateExposureFraction(180)).toBe(0.5);
      expect(calculateExposureFraction(360)).toBe(1.0);
      expect(calculateExposureFraction(90)).toBe(0.25);
      expect(calculateExposureFraction(0)).toBe(0);
    });

    it('clamps angles outside [0, 360]', () => {
      expect(calculateExposureFraction(-50)).toBe(0);
      expect(calculateExposureFraction(720)).toBe(1.0);
    });
  });

  describe('calculateEffectiveShutterSpeed', () => {
    it('computes exact shutter speed at 24fps', () => {
      expect(calculateEffectiveShutterSpeed(180, 24)).toBe('1/48s');
      expect(calculateEffectiveShutterSpeed(90, 24)).toBe('1/96s');
      expect(calculateEffectiveShutterSpeed(360, 24)).toBe('1/24s');
    });

    it('computes exact shutter speed at 60fps', () => {
      expect(calculateEffectiveShutterSpeed(180, 60)).toBe('1/120s');
    });
  });

  describe('buildFfmpegMotionBlurFilter', () => {
    it('returns empty string when disabled or undefined', () => {
      expect(buildFfmpegMotionBlurFilter(undefined)).toBe('');
      expect(buildFfmpegMotionBlurFilter(DEFAULT_MOTION_BLUR_SETTINGS)).toBe('');
    });

    it('generates frame-accurate tmix filter with sample weights when enabled', () => {
      const settings: MotionBlurSettings = {
        enabled: true,
        shutterAngle: 180,
        shutterPhase: 0,
        sampleCount: 4,
        motionThreshold: 0.1,
      };

      const filter = buildFfmpegMotionBlurFilter(settings, 24);
      expect(filter).toContain('tmix=frames=4:weights=');
    });

    it('clamps sample count within [2, 16]', () => {
      const settingsLow: MotionBlurSettings = {
        enabled: true,
        shutterAngle: 180,
        shutterPhase: 0,
        sampleCount: 1,
        motionThreshold: 0.1,
      };
      const settingsHigh: MotionBlurSettings = {
        enabled: true,
        shutterAngle: 180,
        shutterPhase: 0,
        sampleCount: 32,
        motionThreshold: 0.1,
      };

      expect(buildFfmpegMotionBlurFilter(settingsLow)).toContain('tmix=frames=2');
      expect(buildFfmpegMotionBlurFilter(settingsHigh)).toContain('tmix=frames=16');
    });
  });
});
