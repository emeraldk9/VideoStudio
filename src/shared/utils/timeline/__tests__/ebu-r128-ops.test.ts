import { describe, expect, it } from 'vitest';
import {
  getKWeightingStage1Coefficients,
  getKWeightingStage2Coefficients,
  applyBiquadFilter,
  applyKWeighting,
  calculateTruePeak,
  calculateEbuR128Loudness,
  calculateNormalizationGain,
  BROADCAST_LOUDNESS_PRESETS,
} from '../ebu-r128-ops';

function generateSineWave(
  frequencyHz: number,
  durationSeconds: number,
  amplitude = 1.0,
  sampleRate = 48000,
): Float32Array {
  const totalSamples = Math.round(durationSeconds * sampleRate);
  const buffer = new Float32Array(totalSamples);
  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  for (let i = 0; i < totalSamples; i++) {
    buffer[i] = amplitude * Math.sin(omega * i);
  }
  return buffer;
}

describe('ebu-r128-ops', () => {
  describe('K-Weighting Pre-Filter Coefficients', () => {
    it('generates valid Stage 1 high-shelf coefficients for 48kHz', () => {
      const coeffs = getKWeightingStage1Coefficients(48000);
      expect(coeffs.b0).toBeGreaterThan(1.0); // High shelf provides positive high frequency gain
      expect(Number.isFinite(coeffs.b0)).toBe(true);
      expect(Number.isFinite(coeffs.a1)).toBe(true);
      expect(Number.isFinite(coeffs.a2)).toBe(true);
    });

    it('generates valid Stage 2 RLB high-pass coefficients for 48kHz', () => {
      const coeffs = getKWeightingStage2Coefficients(48000);
      expect(coeffs.b0).toBeGreaterThan(0);
      expect(coeffs.b1).toBe(-2 * coeffs.b0); // High-pass numerator pattern
      expect(coeffs.b2).toBe(coeffs.b0);
      expect(Number.isFinite(coeffs.a1)).toBe(true);
    });

    it('applies K-weighting filtering without NaN or infinite values', () => {
      const input = generateSineWave(1000, 0.5, 0.5, 48000);
      const filtered = applyKWeighting(input, 48000);
      expect(filtered).toHaveLength(input.length);
      for (let i = 0; i < filtered.length; i++) {
        expect(Number.isFinite(filtered[i])).toBe(true);
      }
    });
  });

  describe('True Peak Detection (dBTP)', () => {
    it('calculates True Peak for a standard 1kHz sine wave', () => {
      const sine = generateSineWave(1000, 0.1, 0.5); // Peak amplitude = 0.5 (-6.02 dB)
      const tp = calculateTruePeak(sine);
      expect(tp.truePeakLinear).toBeCloseTo(0.5, 1);
      expect(tp.truePeakDb).toBeCloseTo(-6.0, 1);
    });

    it('detects inter-sample peak exceeding sampled values near Nyquist', () => {
      // Create samples that peak between sample points (inter-sample peak)
      // e.g. alternating values: 0, 0.9, -0.9, 0.9...
      const samples = new Float32Array([0, 0.85, 0.85, 0, -0.85, -0.85, 0]);
      const tp = calculateTruePeak(samples);
      // Interpolated peak should exceed 0.85
      expect(tp.truePeakLinear).toBeGreaterThanOrEqual(0.85);
    });

    it('handles silence gracefully', () => {
      const silence = new Float32Array(1000);
      const tp = calculateTruePeak(silence);
      expect(tp.truePeakLinear).toBe(0);
      expect(tp.truePeakDb).toBe(-120);
    });
  });

  describe('calculateEbuR128Loudness', () => {
    it('returns baseline silence (-70 LUFS) for empty channels', () => {
      const result = calculateEbuR128Loudness([]);
      expect(result.integratedLufs).toBe(-70.0);
      expect(result.momentaryMaxLufs).toBe(-70.0);
      expect(result.shortTermMaxLufs).toBe(-70.0);
      expect(result.loudnessRangeLra).toBe(0.0);
    });

    it('calculates loudness for calibrated 1kHz stereo tone', () => {
      // 1 second stereo 1kHz sine at amplitude 0.1 (-20 dBFS peak)
      const left = generateSineWave(1000, 1.0, 0.1);
      const right = generateSineWave(1000, 1.0, 0.1);

      const result = calculateEbuR128Loudness([left, right], 48000);
      // Expected around -20 to -21 LUFS
      expect(result.integratedLufs).toBeLessThan(-18.0);
      expect(result.integratedLufs).toBeGreaterThan(-24.0);
      expect(result.momentaryMaxLufs).toBeLessThan(-18.0);
      expect(result.passedBlocksCount).toBeGreaterThan(0);
    });

    it('gates out trailing silence so silence does not corrupt integrated loudness', () => {
      // 1 second active sound followed by 3 seconds of absolute silence
      const sampleRate = 48000;
      const sound = generateSineWave(1000, 1.0, 0.1, sampleRate);
      const silence = new Float32Array(sampleRate * 3);

      const withSilence = new Float32Array(sound.length + silence.length);
      withSilence.set(sound, 0);
      withSilence.set(silence, sound.length);

      const pureSoundResult = calculateEbuR128Loudness([sound, sound], sampleRate);
      const gatedResult = calculateEbuR128Loudness([withSilence, withSilence], sampleRate);

      // Gating ensures the integrated loudness remains close despite 3s of silence
      expect(Math.abs(gatedResult.integratedLufs - pureSoundResult.integratedLufs)).toBeLessThan(1.5);
    });

    it('handles audio shorter than 400ms block size', () => {
      const shortSound = generateSineWave(1000, 0.2, 0.2); // 200ms
      const result = calculateEbuR128Loudness([shortSound, shortSound], 48000);
      expect(Number.isFinite(result.integratedLufs)).toBe(true);
      expect(result.passedBlocksCount).toBe(1);
    });
  });

  describe('calculateNormalizationGain', () => {
    const ebuPreset = BROADCAST_LOUDNESS_PRESETS.find((p) => p.id === 'ebu-r128')!;
    const youtubePreset = BROADCAST_LOUDNESS_PRESETS.find((p) => p.id === 'youtube-spotify')!;

    it('calculates required gain to reach EBU R128 (-23 LUFS)', () => {
      // Audio is at -19 LUFS, target is -23 LUFS -> needs -4 dB gain
      const norm = calculateNormalizationGain(-19.0, ebuPreset, -3.0);
      expect(norm.requiredGainDb).toBe(-4.0);
      expect(norm.safeGainDb).toBe(-4.0);
      expect(norm.willExceedTruePeak).toBe(false);
    });

    it('detects True Peak overshoot when raising gain and clamps to safe ceiling', () => {
      // Audio is at -20 LUFS with high peak of -0.5 dBTP. Target is -14 LUFS (YouTube, +6 dB gain).
      // Applying +6 dB would push True Peak to +5.5 dBTP, far exceeding -1.0 dBTP limit!
      const norm = calculateNormalizationGain(-20.0, youtubePreset, -0.5);
      expect(norm.requiredGainDb).toBe(6.0);
      expect(norm.willExceedTruePeak).toBe(true);
      expect(norm.projectedTruePeakDb).toBe(5.5);
      // Safe gain should be limited to target maxTruePeak (-1.0) - currentTruePeak (-0.5) = -0.5 dB
      expect(norm.safeGainDb).toBe(-0.5);
    });

    it('returns zero gain for near-silent audio', () => {
      const norm = calculateNormalizationGain(-70.0, ebuPreset, -120);
      expect(norm.requiredGainDb).toBe(0.0);
      expect(norm.safeGainDb).toBe(0.0);
      expect(norm.willExceedTruePeak).toBe(false);
    });
  });

  describe('Broadcast Presets', () => {
    it('contains all standard broadcast and streaming presets', () => {
      const ids = BROADCAST_LOUDNESS_PRESETS.map((p) => p.id);
      expect(ids).toContain('ebu-r128');
      expect(ids).toContain('atsc-a85');
      expect(ids).toContain('youtube-spotify');
      expect(ids).toContain('apple-music');
      expect(ids).toContain('netflix');
    });
  });
});
