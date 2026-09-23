import { describe, expect, it } from 'vitest';
import {
  calculateCompressorOutputDb,
  calculateGainReductionDb,
  sampleCompressorCurvePoints,
  buildFfmpegCompressorFilter,
  COMPRESSOR_PRESETS,
  DEFAULT_COMPRESSOR_SETTINGS,
  type AudioCompressorSettings,
} from '../audio-compressor-ops';

describe('audio-compressor-ops', () => {
  describe('calculateCompressorOutputDb', () => {
    it('returns linear 1:1 passthrough when disabled', () => {
      const settings: AudioCompressorSettings = {
        enabled: false,
        threshold: -18,
        ratio: 4,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 6,
      };
      expect(calculateCompressorOutputDb(-30, settings)).toBe(-30);
      expect(calculateCompressorOutputDb(-10, settings)).toBe(-10);
      expect(calculateCompressorOutputDb(0, settings)).toBe(0);
    });

    it('returns linear passthrough plus makeup gain when ratio is 1:1', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -20,
        ratio: 1,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 3,
      };
      expect(calculateCompressorOutputDb(-30, settings)).toBe(-27);
      expect(calculateCompressorOutputDb(0, settings)).toBe(3);
    });

    it('applies hard-knee compression correctly above threshold', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -20,
        ratio: 4,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 0,
      };

      // Below threshold: unchanged
      expect(calculateCompressorOutputDb(-40, settings)).toBe(-40);
      expect(calculateCompressorOutputDb(-20, settings)).toBe(-20);

      // Above threshold: T + (input - T) / R
      // Input = -12: -20 + (-12 - (-20)) / 4 = -20 + 8/4 = -18 dB
      expect(calculateCompressorOutputDb(-12, settings)).toBeCloseTo(-18, 2);

      // Input = 0: -20 + (0 - (-20)) / 4 = -20 + 20/4 = -15 dB
      expect(calculateCompressorOutputDb(0, settings)).toBeCloseTo(-15, 2);
    });

    it('applies makeup gain correctly above threshold', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -20,
        ratio: 4,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 5,
      };
      // Input = 0: -15 dB compressed + 5 dB makeup = -10 dB
      expect(calculateCompressorOutputDb(0, settings)).toBeCloseTo(-10, 2);
    });

    it('interpolates smoothly across a soft knee', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -20,
        ratio: 4,
        knee: 10, // Knee span: -25 dB to -15 dB
        attack: 0.01,
        release: 0.1,
        makeupGain: 0,
      };

      // Well below knee (< -25 dB): strictly linear
      expect(calculateCompressorOutputDb(-30, settings)).toBe(-30);

      // Lower boundary of knee (-25 dB): exactly linear
      expect(calculateCompressorOutputDb(-25, settings)).toBeCloseTo(-25, 2);

      // Inside knee: -22 dB should be slightly below -22 dB
      const outputAtMinus22 = calculateCompressorOutputDb(-22, settings);
      expect(outputAtMinus22).toBeLessThan(-22);
      expect(outputAtMinus22).toBeGreaterThan(-23);

      // Exactly at center of knee (threshold = -20 dB)
      const outputAtThreshold = calculateCompressorOutputDb(-20, settings);
      expect(outputAtThreshold).toBeLessThan(-20);

      // Upper boundary of knee (-15 dB): matches hard-knee formula transition
      const outputAtMinus15 = calculateCompressorOutputDb(-15, settings);
      expect(outputAtMinus15).toBeCloseTo(-20 + 5 / 4, 1);

      // Well above knee (> -15 dB): strictly compressed
      expect(calculateCompressorOutputDb(0, settings)).toBeCloseTo(-15, 2);
    });
  });

  describe('calculateGainReductionDb', () => {
    it('returns 0 when disabled or when signal is below threshold', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -18,
        ratio: 3,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 3,
      };
      expect(calculateGainReductionDb(-30, settings)).toBe(0);
      expect(calculateGainReductionDb(-18, settings)).toBe(0);

      const disabled = { ...settings, enabled: false };
      expect(calculateGainReductionDb(0, disabled)).toBe(0);
    });

    it('returns positive gain reduction in decibels above threshold', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -20,
        ratio: 5,
        knee: 0,
        attack: 0.01,
        release: 0.1,
        makeupGain: 4,
      };
      // Input = 0 dB. Uncompressed output = -20 + 20/5 = -16 dB.
      // Gain reduction = input - output = 0 - (-16) = 16 dB.
      expect(calculateGainReductionDb(0, settings)).toBeCloseTo(16, 2);
    });
  });

  describe('sampleCompressorCurvePoints', () => {
    it('generates correct number of points within bounds', () => {
      const points = sampleCompressorCurvePoints(DEFAULT_COMPRESSOR_SETTINGS, 200, 100, 50);
      expect(points.length).toBe(51);

      for (const pt of points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(200);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(100);
        expect(pt.inputDb).toBeGreaterThanOrEqual(-60);
        expect(pt.inputDb).toBeLessThanOrEqual(0);
      }
    });

    it('produces monotonically non-decreasing output levels', () => {
      const points = sampleCompressorCurvePoints(DEFAULT_COMPRESSOR_SETTINGS, 200, 100, 20);
      for (let i = 1; i < points.length; i++) {
        expect(points[i].outputDb).toBeGreaterThanOrEqual(points[i - 1].outputDb);
      }
    });
  });

  describe('COMPRESSOR_PRESETS', () => {
    it('validates that all studio presets have reasonable parameter bounds', () => {
      const presetKeys = Object.keys(COMPRESSOR_PRESETS) as (keyof typeof COMPRESSOR_PRESETS)[];
      expect(presetKeys.length).toBeGreaterThanOrEqual(5);

      for (const key of presetKeys) {
        const preset = COMPRESSOR_PRESETS[key];
        const s = preset.settings;
        expect(s.threshold).toBeGreaterThanOrEqual(-60);
        expect(s.threshold).toBeLessThanOrEqual(0);
        expect(s.ratio).toBeGreaterThanOrEqual(1);
        expect(s.ratio).toBeLessThanOrEqual(20);
        expect(s.knee).toBeGreaterThanOrEqual(0);
        expect(s.knee).toBeLessThanOrEqual(40);
        expect(s.attack).toBeGreaterThanOrEqual(0.001);
        expect(s.attack).toBeLessThanOrEqual(1.0);
        expect(s.release).toBeGreaterThanOrEqual(0.01);
        expect(s.release).toBeLessThanOrEqual(1.0);
        expect(s.makeupGain).toBeGreaterThanOrEqual(0);
        expect(s.makeupGain).toBeLessThanOrEqual(24);
      }
    });
  });

  describe('buildFfmpegCompressorFilter', () => {
    it('returns empty string when disabled or ratio is 1', () => {
      const disabled: AudioCompressorSettings = {
        enabled: false,
        threshold: -18,
        ratio: 4,
        knee: 6,
        attack: 0.01,
        release: 0.1,
        makeupGain: 3,
      };
      expect(buildFfmpegCompressorFilter(disabled)).toBe('');

      const ratio1: AudioCompressorSettings = {
        ...disabled,
        enabled: true,
        ratio: 1,
      };
      expect(buildFfmpegCompressorFilter(ratio1)).toBe('');
    });

    it('generates valid FFmpeg acompressor filter syntax', () => {
      const settings: AudioCompressorSettings = {
        enabled: true,
        threshold: -18,
        ratio: 3,
        knee: 6,
        attack: 0.01,
        release: 0.12,
        makeupGain: 4,
      };
      const filter = buildFfmpegCompressorFilter(settings);
      expect(filter).toContain('acompressor=');
      expect(filter).toContain('threshold=-18dB');
      expect(filter).toContain('ratio=3');
      expect(filter).toContain('attack=10');
      expect(filter).toContain('release=120');
      expect(filter).toContain('makeup=4dB');
      expect(filter).toContain('knee=6dB');
    });
  });
});
