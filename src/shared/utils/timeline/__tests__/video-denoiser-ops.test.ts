import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIDEO_DENOISER_SETTINGS,
  VIDEO_DENOISER_PRESETS,
  calculateEffectiveNoiseReductionRatio,
  buildFfmpegVideoDenoiserFilter,
  VideoDenoiserSettings,
} from '../video-denoiser-ops';

describe('video-denoiser-ops', () => {
  it('has default video denoiser settings disabled', () => {
    expect(DEFAULT_VIDEO_DENOISER_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_VIDEO_DENOISER_SETTINGS.spatialLumaStrength).toBe(4.0);
    expect(DEFAULT_VIDEO_DENOISER_SETTINGS.temporalRadius).toBe(2);
    expect(DEFAULT_VIDEO_DENOISER_SETTINGS.chromaDenoiseBoost).toBe(false);
    expect(DEFAULT_VIDEO_DENOISER_SETTINGS.detailSharpenAmount).toBe(0.0);
  });

  it('contains all 5 studio presets with valid ranges', () => {
    const presetKeys = [
      'subtle_sensor_grain',
      'high_iso_digital_noise',
      'chroma_blotch_cleaner',
      'night_low_light_salvage',
      'vintage_analog_restoration',
    ] as const;

    for (const key of presetKeys) {
      const preset = VIDEO_DENOISER_PRESETS[key];
      expect(preset.enabled).toBe(true);
      expect(preset.preset).toBe(key);
      expect(preset.spatialLumaStrength).toBeGreaterThanOrEqual(0);
      expect(preset.spatialLumaStrength).toBeLessThanOrEqual(15);
      expect(preset.temporalLumaStrength).toBeGreaterThanOrEqual(0);
      expect(preset.temporalLumaStrength).toBeLessThanOrEqual(20);
      expect(preset.temporalRadius).toBeGreaterThanOrEqual(1);
      expect(preset.temporalRadius).toBeLessThanOrEqual(5);
      expect(preset.detailSharpenAmount).toBeGreaterThanOrEqual(0);
      expect(preset.detailSharpenAmount).toBeLessThanOrEqual(2);
    }
  });

  it('returns 0 for noise reduction ratio when disabled', () => {
    expect(calculateEffectiveNoiseReductionRatio(DEFAULT_VIDEO_DENOISER_SETTINGS)).toBe(0);
  });

  it('calculates higher noise reduction ratio for night_low_light_salvage than subtle_sensor_grain', () => {
    const subtleRatio = calculateEffectiveNoiseReductionRatio(VIDEO_DENOISER_PRESETS.subtle_sensor_grain);
    const nightRatio = calculateEffectiveNoiseReductionRatio(VIDEO_DENOISER_PRESETS.night_low_light_salvage);

    expect(subtleRatio).toBeGreaterThan(0);
    expect(nightRatio).toBeGreaterThan(subtleRatio);
    expect(nightRatio).toBeLessThanOrEqual(1.0);
  });

  it('reflects chroma boost in effective noise reduction ratio', () => {
    const base: VideoDenoiserSettings = {
      enabled: true,
      spatialLumaStrength: 5,
      spatialChromaStrength: 5,
      temporalLumaStrength: 5,
      temporalChromaStrength: 5,
      temporalRadius: 2,
      chromaDenoiseBoost: false,
      detailSharpenAmount: 0,
    };
    const boosted: VideoDenoiserSettings = {
      ...base,
      chromaDenoiseBoost: true,
    };

    expect(calculateEffectiveNoiseReductionRatio(boosted)).toBeGreaterThan(
      calculateEffectiveNoiseReductionRatio(base)
    );
  });

  it('returns empty filter string when denoiser is disabled', () => {
    expect(buildFfmpegVideoDenoiserFilter(DEFAULT_VIDEO_DENOISER_SETTINGS)).toBe('');
  });

  it('builds hqdn3d filter string correctly without unsharp when sharpen is 0', () => {
    const settings: VideoDenoiserSettings = {
      enabled: true,
      spatialLumaStrength: 4.0,
      spatialChromaStrength: 3.0,
      temporalLumaStrength: 6.0,
      temporalChromaStrength: 4.5,
      temporalRadius: 2,
      chromaDenoiseBoost: false,
      detailSharpenAmount: 0.0,
    };
    const filter = buildFfmpegVideoDenoiserFilter(settings);
    expect(filter).toBe('hqdn3d=4.00:3.00:6.00:4.50');
    expect(filter).not.toContain('unsharp');
  });

  it('applies 1.5x chroma multiplier and unsharp filter when boosted and sharpened', () => {
    const settings: VideoDenoiserSettings = {
      enabled: true,
      spatialLumaStrength: 4.0,
      spatialChromaStrength: 4.0,
      temporalLumaStrength: 6.0,
      temporalChromaStrength: 6.0,
      temporalRadius: 3,
      chromaDenoiseBoost: true,
      detailSharpenAmount: 0.5,
    };
    const filter = buildFfmpegVideoDenoiserFilter(settings);
    // 4.0 * 1.5 = 6.00 chromaSpatial, 6.0 * 1.5 = 9.00 chromaTmp
    expect(filter).toBe('hqdn3d=4.00:6.00:6.00:9.00,unsharp=5:5:0.50:5:5:0.0');
  });

  it('clamps filter strengths within valid positive ranges', () => {
    const settings: VideoDenoiserSettings = {
      enabled: true,
      spatialLumaStrength: 99.0,
      spatialChromaStrength: 99.0,
      temporalLumaStrength: 99.0,
      temporalChromaStrength: 99.0,
      temporalRadius: 10,
      chromaDenoiseBoost: true,
      detailSharpenAmount: 5.0,
    };
    const filter = buildFfmpegVideoDenoiserFilter(settings);
    expect(filter).toContain('hqdn3d=15.00:22.50:20.00:30.00');
    expect(filter).toContain('unsharp=5:5:2.00:5:5:0.0');
  });

  it('handles undefined settings safely', () => {
    expect(calculateEffectiveNoiseReductionRatio(undefined)).toBe(0);
    expect(buildFfmpegVideoDenoiserFilter(undefined)).toBe('');
  });
});
