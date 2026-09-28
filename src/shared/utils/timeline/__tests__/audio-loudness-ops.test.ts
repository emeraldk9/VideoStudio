import { describe, expect, it } from 'vitest';
import {
  LOUDNESS_TARGET_PRESETS,
  calculateIntegratedLoudness,
  calculateKWeightingResponse,
  calculateLoudnessNormalizationGain,
  calculateLoudnessRange,
  evaluateLoudnessCompliance,
  generateLoudnormFilterString,
  parseFfmpegLoudnormOutput,
  sampleKWeightingCurve,
  type LoudnessTargetConfig,
  type MeasuredLoudnessParams,
} from '../audio-loudness-ops';

describe('audio-loudness-ops (Milestone S186: Audio Loudness Target Normalization)', () => {
  describe('LOUDNESS_TARGET_PRESETS', () => {
    it('provides broadcast standard configuration for EBU R128', () => {
      const ebu = LOUDNESS_TARGET_PRESETS.ebu_r128;
      expect(ebu.integratedLufs).toBe(-23.0);
      expect(ebu.truePeakLimitDbTP).toBe(-1.0);
      expect(ebu.toleranceLu).toBe(0.5);
      expect(ebu.maxLraLu).toBe(18.0);
    });

    it('provides streaming configuration for YouTube and Spotify', () => {
      const yt = LOUDNESS_TARGET_PRESETS.youtube;
      const spot = LOUDNESS_TARGET_PRESETS.spotify;
      expect(yt.integratedLufs).toBe(-14.0);
      expect(yt.truePeakLimitDbTP).toBe(-1.0);
      expect(spot.integratedLufs).toBe(-14.0);
      expect(spot.truePeakLimitDbTP).toBe(-1.0);
    });

    it('provides US broadcast television configuration for ATSC A/85', () => {
      const atsc = LOUDNESS_TARGET_PRESETS.atsc_a85;
      expect(atsc.integratedLufs).toBe(-24.0);
      expect(atsc.truePeakLimitDbTP).toBe(-2.0);
    });

    it('provides Apple Music and Podcasts configuration', () => {
      const apple = LOUDNESS_TARGET_PRESETS.apple_music;
      expect(apple.integratedLufs).toBe(-16.0);
      expect(apple.truePeakLimitDbTP).toBe(-1.0);
    });
  });

  describe('calculateKWeightingResponse', () => {
    it('approximates ITU-R BS.1770 high-shelf boost (+4 dB at high frequencies)', () => {
      const resp10k = calculateKWeightingResponse(10000);
      expect(resp10k).toBeGreaterThan(3.5);
      expect(resp10k).toBeLessThanOrEqual(4.1);
    });

    it('approximates RLB high-pass roll-off at low frequencies (attenuates below 40Hz)', () => {
      const resp20 = calculateKWeightingResponse(20);
      expect(resp20).toBeLessThan(-10.0);
    });

    it('evaluates response around 1kHz reference transition frequency', () => {
      const resp1k = calculateKWeightingResponse(1000);
      expect(resp1k).toBeGreaterThan(0.5);
      expect(resp1k).toBeLessThan(2.5);
    });

    it('handles non-positive frequencies gracefully', () => {
      expect(calculateKWeightingResponse(0)).toBe(-100);
      expect(calculateKWeightingResponse(-50)).toBe(-100);
    });
  });

  describe('sampleKWeightingCurve', () => {
    it('samples N points logarithmically across the 20Hz - 20kHz audible spectrum', () => {
      const points = sampleKWeightingCurve(16);
      expect(points.length).toBe(16);
      expect(points[0].frequency).toBe(20);
      expect(points[points.length - 1].frequency).toBe(20000);
      expect(points[0].gainDb).toBeLessThan(points[points.length - 1].gainDb);
    });
  });

  describe('calculateIntegratedLoudness', () => {
    it('computes exact integrated loudness for uniform blocks', () => {
      const uniformBlocks = Array(20).fill(-18.0);
      const res = calculateIntegratedLoudness(uniformBlocks);
      expect(res.integratedLufs).toBeCloseTo(-18.0, 1);
      expect(res.gatedBlocks).toBe(20);
    });

    it('filters out silent blocks below absolute -70 LKFS gate', () => {
      const mixed = [-16.0, -16.0, -85.0, -90.0, -16.0];
      const res = calculateIntegratedLoudness(mixed);
      expect(res.integratedLufs).toBeCloseTo(-16.0, 1);
      expect(res.gatedBlocks).toBe(3);
    });

    it('applies relative -10 LU gate to exclude low-level dialogue pauses', () => {
      // 10 blocks at -14 LUFS, and 10 blocks at -28 LUFS (more than 10 LU below the -14 mean)
      const blocks = [...Array(10).fill(-14.0), ...Array(10).fill(-28.0)];
      const res = calculateIntegratedLoudness(blocks);
      // The -28 LUFS blocks should be rejected by the relative gate
      expect(res.integratedLufs).toBeCloseTo(-14.0, 1);
      expect(res.gatedBlocks).toBe(10);
    });

    it('returns -70 LUFS on empty or completely silent input', () => {
      expect(calculateIntegratedLoudness([]).integratedLufs).toBe(-70.0);
      expect(calculateIntegratedLoudness([-80, -90]).integratedLufs).toBe(-70.0);
    });
  });

  describe('calculateLoudnessRange (LRA)', () => {
    it('computes difference between P95 and P10 percentiles', () => {
      // Create a distribution from -24 LUFS to -12 LUFS
      const blocks = [];
      for (let i = 0; i < 100; i++) {
        blocks.push(-24 + (12 * i) / 99);
      }
      const lra = calculateLoudnessRange(blocks);
      // P95 is near -12.6, P10 is near -22.8 -> LRA around 10.2 LU
      expect(lra).toBeGreaterThan(8);
      expect(lra).toBeLessThan(12);
    });

    it('returns 0 for empty or single-value blocks', () => {
      expect(calculateLoudnessRange([])).toBe(0);
      expect(calculateLoudnessRange([-16])).toBe(0);
      expect(calculateLoudnessRange([-16, -16, -16])).toBe(0);
    });
  });

  describe('calculateLoudnessNormalizationGain', () => {
    const target: LoudnessTargetConfig = LOUDNESS_TARGET_PRESETS.youtube; // -14 LUFS, -1.0 dBTP

    it('calculates positive gain offset for quiet audio', () => {
      const analysis = calculateLoudnessNormalizationGain(-20.0, -8.0, target);
      // Target -14, measured -20 -> gain offset is +6 dB
      expect(analysis.gainOffsetDb).toBe(6.0);
      expect(analysis.linearGainFactor).toBeCloseTo(1.995, 2);
      expect(analysis.projectedTruePeakDbTP).toBe(-2.0); // -8 + 6 = -2 dBTP (below -1.0 dBTP ceiling)
      expect(analysis.willClipTruePeak).toBe(false);
      expect(analysis.limiterReductionRequiredDb).toBe(0);
    });

    it('calculates negative gain offset for overly loud audio', () => {
      const analysis = calculateLoudnessNormalizationGain(-10.0, +0.5, target);
      // Target -14, measured -10 -> gain offset is -4 dB
      expect(analysis.gainOffsetDb).toBe(-4.0);
      expect(analysis.linearGainFactor).toBeCloseTo(0.631, 2);
      expect(analysis.projectedTruePeakDbTP).toBe(-3.5); // 0.5 - 4 = -3.5 dBTP
      expect(analysis.willClipTruePeak).toBe(false);
    });

    it('flags true-peak ceiling breach and computes required limiter reduction', () => {
      // Audio is -20 LUFS with peak at -3 dBTP. Boosting by +6 dB will push TP to +3 dBTP!
      const analysis = calculateLoudnessNormalizationGain(-20.0, -3.0, target);
      expect(analysis.gainOffsetDb).toBe(6.0);
      expect(analysis.projectedTruePeakDbTP).toBe(3.0);
      expect(analysis.willClipTruePeak).toBe(true);
      // Ceiling is -1.0 dBTP. Overshoot = 3.0 - (-1.0) = 4.0 dB
      expect(analysis.limiterReductionRequiredDb).toBe(4.0);
      // Safe gain factor only allows +2 dB (6 - 4)
      expect(analysis.safeLinearGainFactor).toBeCloseTo(Math.pow(10, 2 / 20), 2);
    });
  });

  describe('generateLoudnormFilterString', () => {
    const target = LOUDNESS_TARGET_PRESETS.youtube; // -14 LUFS, -1.0 dBTP, 11 LRA

    it('generates single-pass dynamic normalization filter when no measured params provided', () => {
      const filter = generateLoudnormFilterString(target);
      expect(filter).toBe('loudnorm=I=-14.0:TP=-1.0:LRA=11.0');
    });

    it('generates dual-pass linear normalization filter when measured params are provided', () => {
      const measured: MeasuredLoudnessParams = {
        integratedLufs: -19.5,
        truePeakDbTP: -3.2,
        lraLu: 8.4,
        thresholdLufs: -29.8,
        targetOffsetDb: 0.3,
      };

      const filter = generateLoudnormFilterString(target, measured, true);
      expect(filter).toContain('I=-14.0');
      expect(filter).toContain('TP=-1.0');
      expect(filter).toContain('LRA=11.0');
      expect(filter).toContain('measured_I=-19.5');
      expect(filter).toContain('measured_TP=-3.2');
      expect(filter).toContain('measured_LRA=8.4');
      expect(filter).toContain('measured_thresh=-29.8');
      expect(filter).toContain('offset=0.3');
      expect(filter).toContain('linear=true');
    });
  });

  describe('parseFfmpegLoudnormOutput', () => {
    it('parses JSON formatted summary output from FFmpeg loudnorm stderr', () => {
      const sampleStderr = `
[Parsed_loudnorm_0 @ 000001]
{
  "input_i" : "-21.45",
  "input_tp" : "-4.20",
  "input_lra" : "9.80",
  "input_thresh" : "-31.80",
  "output_i" : "-14.02",
  "output_tp" : "-1.01",
  "output_lra" : "8.50",
  "output_thresh" : "-24.20",
  "normalization_type" : "dynamic",
  "target_offset" : "0.02"
}
      `;

      const parsed = parseFfmpegLoudnormOutput(sampleStderr);
      expect(parsed).not.toBeNull();
      expect(parsed?.integratedLufs).toBe(-21.45);
      expect(parsed?.truePeakDbTP).toBe(-4.20);
      expect(parsed?.lraLu).toBe(9.80);
      expect(parsed?.thresholdLufs).toBe(-31.80);
      expect(parsed?.targetOffsetDb).toBe(0.02);
    });

    it('parses text key-value summary output from FFmpeg loudnorm stderr', () => {
      const sampleText = `
Input Integrated: -23.5 LUFS
Input True Peak:   -1.8 dBTP
Input LRA:         12.4 LU
Input Threshold:   -34.1 LUFS
Output Integrated: -23.0 LUFS
      `;

      const parsed = parseFfmpegLoudnormOutput(sampleText);
      expect(parsed).not.toBeNull();
      expect(parsed?.integratedLufs).toBe(-23.5);
      expect(parsed?.truePeakDbTP).toBe(-1.8);
      expect(parsed?.lraLu).toBe(12.4);
    });

    it('returns null for empty or non-matching text', () => {
      expect(parseFfmpegLoudnormOutput('')).toBeNull();
      expect(parseFfmpegLoudnormOutput('some unrelated ffmpeg log')).toBeNull();
    });
  });

  describe('evaluateLoudnessCompliance', () => {
    const ebu = LOUDNESS_TARGET_PRESETS.ebu_r128; // -23 LUFS ±0.5 LU, TP <= -1.0 dBTP, LRA <= 18

    it('passes compliant broadcast audio', () => {
      const measured: MeasuredLoudnessParams = {
        integratedLufs: -23.2,
        truePeakDbTP: -1.5,
        lraLu: 14.0,
      };

      const result = evaluateLoudnessCompliance(measured, ebu);
      expect(result.compliant).toBe(true);
      expect(result.status).toBe('optimal');
      expect(result.feedbackMessages.length).toBe(0);
    });

    it('flags non-compliance when LUFS exceeds tolerance', () => {
      const measured: MeasuredLoudnessParams = {
        integratedLufs: -20.5, // 2.5 LU louder than -23 (tolerance is 0.5)
        truePeakDbTP: -1.2,
        lraLu: 10.0,
      };

      const result = evaluateLoudnessCompliance(measured, ebu);
      expect(result.compliant).toBe(false);
      expect(result.status).toBe('non_compliant');
      expect(result.feedbackMessages.some((m) => m.includes('deviates from target'))).toBe(true);
    });

    it('flags non-compliance when True-Peak exceeds ceiling', () => {
      const measured: MeasuredLoudnessParams = {
        integratedLufs: -23.0,
        truePeakDbTP: -0.2, // Exceeds -1.0 dBTP ceiling
        lraLu: 10.0,
      };

      const result = evaluateLoudnessCompliance(measured, ebu);
      expect(result.compliant).toBe(false);
      expect(result.status).toBe('non_compliant');
      expect(result.feedbackMessages.some((m) => m.includes('exceeds maximum ceiling'))).toBe(true);
    });
  });
});
