import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUDIO_ISOLATION_SETTINGS,
  AUDIO_ISOLATION_PRESETS,
  calculateSpeechGainBoost,
  calculateNoiseFloorReduction,
  buildFfmpegIsolationFilter,
  type AudioIsolationSettings,
} from '../audio-isolation-ops';

describe('audio-isolation-ops', () => {
  describe('calculateSpeechGainBoost', () => {
    it('returns 0 dB boost when clarity is 0', () => {
      const boost = calculateSpeechGainBoost(0);
      expect(boost.gainDb).toBe(0);
      expect(boost.centerFreqHz).toBe(3000);
    });

    it('returns proportional gain boost up to +8 dB at full clarity', () => {
      const half = calculateSpeechGainBoost(0.5);
      expect(half.gainDb).toBe(4.0);

      const full = calculateSpeechGainBoost(1.0);
      expect(full.gainDb).toBe(8.0);
    });

    it('clamps clarity between 0 and 1', () => {
      expect(calculateSpeechGainBoost(-0.5).gainDb).toBe(0);
      expect(calculateSpeechGainBoost(1.5).gainDb).toBe(8.0);
    });
  });

  describe('calculateNoiseFloorReduction', () => {
    it('returns 0 dB when strength is 0', () => {
      expect(calculateNoiseFloorReduction(0)).toBe(0);
    });

    it('returns -36 dB reduction at full strength', () => {
      expect(calculateNoiseFloorReduction(1.0)).toBe(-36.0);
    });

    it('scales linearly across strength values', () => {
      expect(calculateNoiseFloorReduction(0.5)).toBe(-18.0);
    });
  });

  describe('buildFfmpegIsolationFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegIsolationFilter(DEFAULT_AUDIO_ISOLATION_SETTINGS)).toBe('');
    });

    it('builds highpass and clarity boost for dialogue enhance', () => {
      const settings: AudioIsolationSettings = {
        enabled: true,
        mode: 'dialogue_enhance',
        isolationStrength: 0.5,
        speechClarity: 0.5,
        deReverbAmount: 0.3,
        levelerEnabled: false,
        targetLufs: -18,
      };
      const filter = buildFfmpegIsolationFilter(settings);
      expect(filter).toContain('highpass=f=80');
      expect(filter).toContain('equalizer=f=3000:width_type=q:w=1.4:g=4');
    });

    it('includes afftdn and bandpass for vocal_isolate mode', () => {
      const settings: AudioIsolationSettings = {
        enabled: true,
        mode: 'vocal_isolate',
        isolationStrength: 0.8,
        speechClarity: 0.2,
        deReverbAmount: 0.2,
        levelerEnabled: false,
        targetLufs: -18,
      };
      const filter = buildFfmpegIsolationFilter(settings);
      expect(filter).toContain('afftdn=nr=28.8:nf=-50');
      expect(filter).toContain('bandpass=f=1800');
    });

    it('includes stereotools for instrumental_isolate mode', () => {
      const settings: AudioIsolationSettings = {
        enabled: true,
        mode: 'instrumental_isolate',
        isolationStrength: 0.9,
        speechClarity: 0,
        deReverbAmount: 0,
        levelerEnabled: false,
        targetLufs: -18,
      };
      const filter = buildFfmpegIsolationFilter(settings);
      expect(filter).toContain('stereotools=mlev=0.1:slev=1.4');
    });

    it('includes speechnorm when levelerEnabled is true', () => {
      const settings: AudioIsolationSettings = {
        enabled: true,
        mode: 'dialogue_enhance',
        isolationStrength: 0.5,
        speechClarity: 0.5,
        deReverbAmount: 0.2,
        levelerEnabled: true,
        targetLufs: -16,
      };
      const filter = buildFfmpegIsolationFilter(settings);
      expect(filter).toContain('speechnorm=p=0.8:e=4:r=0.0001:l=1');
      expect(filter).toContain('volume=-16dB');
    });
  });

  describe('AUDIO_ISOLATION_PRESETS', () => {
    it('contains all 4 studio presets with valid parameters', () => {
      const presets = Object.keys(AUDIO_ISOLATION_PRESETS);
      expect(presets).toHaveLength(4);
      expect(presets).toContain('podcast_clarity');
      expect(presets).toContain('interview_cleanup');
      expect(presets).toContain('acapella_vocal_only');
      expect(presets).toContain('karaoke_instrumental');

      for (const key of presets as Array<keyof typeof AUDIO_ISOLATION_PRESETS>) {
        const preset = AUDIO_ISOLATION_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.settings.isolationStrength).toBeGreaterThanOrEqual(0);
        expect(preset.settings.isolationStrength).toBeLessThanOrEqual(1);
        expect(preset.settings.targetLufs).toBeLessThan(0);
      }
    });
  });
});
