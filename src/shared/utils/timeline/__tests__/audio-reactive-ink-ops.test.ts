import { describe, it, expect } from 'vitest';
import {
  followAudioEnvelope,
  detectTransientOnsets,
  computeAudioReactiveWidth,
  computePitchRippleOffset,
  generateTransientShockwaves,
  modulateStrokeWithAudio,
  validateAudioReactiveInkConfig,
  DEFAULT_AUDIO_REACTIVE_INK_CONFIG,
} from '../audio-reactive-ink-ops';

describe('audio-reactive-ink-ops', () => {
  describe('followAudioEnvelope', () => {
    it('handles empty input gracefully', () => {
      const res = followAudioEnvelope([], 44100);
      expect(res.length).toBe(0);
    });

    it('exhibits fast attack and smooth exponential decay', () => {
      const sr = 1000; // 1 ms per sample
      const samples = new Float32Array(300);
      // Burst from 50ms to 100ms
      for (let i = 50; i < 100; i++) {
        samples[i] = 1.0;
      }

      const env = followAudioEnvelope(samples, sr, 10, 80);
      expect(env.length).toBe(300);

      // Baseline before burst is near 0
      expect(env[20]).toBe(0);

      // Quick rise during attack (at 70ms: 20ms into burst)
      expect(env[70]).toBeGreaterThan(0.7);

      // Decay after burst stops (at 100ms, decays gradually through 180ms)
      expect(env[120]).toBeGreaterThan(0.2);
      expect(env[180]).toBeLessThan(env[120]);
    });

    it('normalizes peak envelope to 1.0 ceiling', () => {
      const samples = [0.1, 0.5, 0.2, 0.4];
      const env = followAudioEnvelope(samples, 1000, 10, 50);
      const maxVal = Math.max(...Array.from(env));
      expect(maxVal).toBeCloseTo(1.0, 3);
    });
  });

  describe('detectTransientOnsets', () => {
    it('detects sharp upward transients', () => {
      const sr = 1000;
      const env = new Float32Array(200);
      // Sudden step at 50ms (index 50)
      for (let i = 50; i < 150; i++) {
        env[i] = 0.9;
      }

      const onsets = detectTransientOnsets(env, sr, 0.4, 50, 15);
      expect(onsets.length).toBeGreaterThanOrEqual(1);
      expect(onsets[0]).toBeCloseTo(0.05, 1);
    });

    it('respects minimum interval lockout', () => {
      const sr = 1000;
      const env = new Float32Array(300);
      // Two quick steps at 50ms and 70ms
      for (let i = 50; i < 300; i++) env[i] = 0.8;

      const onsets = detectTransientOnsets(env, sr, 0.3, 100, 15);
      // Only 1 onset should fire due to 100ms lockout
      expect(onsets.length).toBe(1);
    });

    it('returns empty for flat or smooth audio', () => {
      const env = new Float32Array([0.1, 0.1, 0.12, 0.11, 0.1]);
      const onsets = detectTransientOnsets(env, 1000, 0.4);
      expect(onsets).toEqual([]);
    });
  });

  describe('computeAudioReactiveWidth', () => {
    it('returns base width when energy is 0', () => {
      const w = computeAudioReactiveWidth(6.0, 0.0, 1.5, 1.0);
      expect(w).toBe(6.0);
    });

    it('expands width proportionally with energy and gain', () => {
      const baseW = 5.0;
      const wQuiet = computeAudioReactiveWidth(baseW, 0.1, 1.5, 1.0);
      const wLoud = computeAudioReactiveWidth(baseW, 0.9, 1.5, 1.0);

      expect(wLoud).toBeGreaterThan(wQuiet);
      expect(wLoud).toBeCloseTo(5.0 * (1.0 + 1.5 * 0.9), 2);
    });

    it('respects maximum scale ceiling', () => {
      const w = computeAudioReactiveWidth(10.0, 1.0, 5.0, 1.0, 3.0);
      expect(w).toBeLessThanOrEqual(30.0);
    });
  });

  describe('computePitchRippleOffset', () => {
    it('oscillates within +/- amplitude', () => {
      const amp = 3.0;
      for (let s = 0; s < 100; s += 5) {
        const offset = computePitchRippleOffset(s, 150, 150, amp);
        expect(offset).toBeGreaterThanOrEqual(-amp);
        expect(offset).toBeLessThanOrEqual(amp);
      }
    });

    it('increases spatial frequency with higher vocal pitch', () => {
      // At low pitch (75Hz), wavelength is long
      const offsetLow = computePitchRippleOffset(10, 75, 150, 2.0);
      // At high pitch (300Hz), wavelength is halved twice
      const offsetHigh = computePitchRippleOffset(10, 300, 150, 2.0);
      expect(offsetLow).not.toBe(offsetHigh);
    });
  });

  describe('generateTransientShockwaves', () => {
    it('returns empty array when burst radius is near zero', () => {
      const rings = generateTransientShockwaves({ x: 50, y: 50 }, 0.0);
      expect(rings).toEqual([]);
    });

    it('generates concentric rings with graduated radii and opacity', () => {
      const rings = generateTransientShockwaves({ x: 100, y: 120 }, 10.0, 0.8, 3);
      expect(rings.length).toBe(3);
      expect(rings[0].radius).toBeLessThan(rings[2].radius);
      expect(rings[2].radius).toBeCloseTo(10.0, 2);
      expect(rings[0].opacity).toBeGreaterThan(rings[2].opacity);
    });
  });

  describe('modulateStrokeWithAudio', () => {
    const rawPoints = [
      { x: 10, y: 20, time: 0.0 },
      { x: 30, y: 20, time: 0.05 },
      { x: 50, y: 20, time: 0.10 },
      { x: 70, y: 20, time: 0.15 },
    ];

    it('passes through unmodified when disabled', () => {
      const env = new Float32Array([0.8, 0.8, 0.8]);
      const res = modulateStrokeWithAudio(rawPoints, env, 1000, { enabled: false }, undefined, 4.0);
      expect(res.length).toBe(rawPoints.length);
      expect(res[0].effectiveWidth).toBe(4.0);
      expect(res[0].energy).toBe(0.0);
    });

    it('modulates width and samples energy when enabled', () => {
      const sr = 1000;
      const env = new Float32Array(200);
      // Loud vocal peak at 100ms
      for (let i = 80; i < 120; i++) env[i] = 0.9;

      const res = modulateStrokeWithAudio(rawPoints, env, sr, {
        enabled: true,
        energyGain: 2.0,
      }, undefined, 5.0);

      expect(res.length).toBe(rawPoints.length);
      // Point at 100ms (index 2) should have high energy and expanded width
      expect(res[2].energy).toBeCloseTo(0.9, 1);
      expect(res[2].effectiveWidth).toBeGreaterThan(res[0].effectiveWidth);
    });

    it('generates shockwaves on transient onsets', () => {
      const sr = 1000;
      const env = new Float32Array(200);
      // Step jump at 100ms
      for (let i = 100; i < 200; i++) env[i] = 0.95;

      const res = modulateStrokeWithAudio(rawPoints, env, sr, {
        enabled: true,
        transientThreshold: 0.4,
        transientBurstRadius: 10.0,
      });

      // Point at 100ms should trigger shockwave
      const ptWithShockwave = res.find((p) => p.shockwaves.length > 0);
      expect(ptWithShockwave).toBeDefined();
      expect(ptWithShockwave?.shockwaves[0].radius).toBeGreaterThan(0);
    });
  });

  describe('validateAudioReactiveInkConfig', () => {
    it('validates default config successfully', () => {
      const res = validateAudioReactiveInkConfig(DEFAULT_AUDIO_REACTIVE_INK_CONFIG);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects invalid parameters with error messages', () => {
      const res = validateAudioReactiveInkConfig({
        energyGain: -1,
        energyGamma: 10,
        attackMs: 0,
        transientThreshold: 1.5,
      });
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
