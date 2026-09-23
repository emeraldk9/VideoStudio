import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUDIO_PITCH_SETTINGS,
  VOICE_EFFECT_PRESETS,
  calculatePitchRatio,
  calculatePitchDetuneCents,
  buildFfmpegPitchFilter,
  type AudioPitchSettings,
} from '../audio-pitch-ops';

describe('Audio Pitch Shifter Engine (audio-pitch-ops)', () => {
  it('provides default settings with pitch shifting disabled', () => {
    expect(DEFAULT_AUDIO_PITCH_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AUDIO_PITCH_SETTINGS.semitones).toBe(0);
    expect(DEFAULT_AUDIO_PITCH_SETTINGS.cents).toBe(0);
    expect(DEFAULT_AUDIO_PITCH_SETTINGS.preserveFormants).toBe(true);
  });

  it('contains valid voice effect presets with distinct pitch and formant configurations', () => {
    const presetKeys = Object.keys(VOICE_EFFECT_PRESETS) as (keyof typeof VOICE_EFFECT_PRESETS)[];
    expect(presetKeys).toContain('deep_trailer');
    expect(presetKeys).toContain('helium_cartoon');
    expect(presetKeys).toContain('robot_harmonizer');
    expect(presetKeys).toContain('anonymous_interview');
    expect(presetKeys).toContain('octave_up');
    expect(presetKeys).toContain('octave_down');
    expect(presetKeys).toContain('subtle_tune');

    const deep = VOICE_EFFECT_PRESETS.deep_trailer.settings;
    expect(deep.semitones).toBe(-6);
    expect(deep.preserveFormants).toBe(true);

    const helium = VOICE_EFFECT_PRESETS.helium_cartoon.settings;
    expect(helium.semitones).toBeGreaterThan(0);
    expect(helium.preserveFormants).toBe(false);

    const octaveUp = VOICE_EFFECT_PRESETS.octave_up.settings;
    expect(octaveUp.semitones).toBe(12);

    const octaveDown = VOICE_EFFECT_PRESETS.octave_down.settings;
    expect(octaveDown.semitones).toBe(-12);
  });

  describe('calculatePitchRatio', () => {
    it('returns exactly 1.0 for zero shift', () => {
      expect(calculatePitchRatio(0, 0)).toBe(1.0);
    });

    it('returns exactly 2.0 for +12 semitones (one octave up)', () => {
      expect(calculatePitchRatio(12, 0)).toBe(2.0);
    });

    it('returns exactly 0.5 for -12 semitones (one octave down)', () => {
      expect(calculatePitchRatio(-12, 0)).toBe(0.5);
    });

    it('accurately calculates equal temperament half-step ratio (2^(1/12) ≈ 1.05946)', () => {
      expect(calculatePitchRatio(1, 0)).toBe(1.05946);
    });

    it('incorporates fine cent adjustments correctly', () => {
      // 100 cents = 1 semitone
      expect(calculatePitchRatio(0, 100)).toBe(calculatePitchRatio(1, 0));
      expect(calculatePitchRatio(0, 50)).toBeGreaterThan(1.0);
      expect(calculatePitchRatio(0, -50)).toBeLessThan(1.0);
    });
  });

  describe('calculatePitchDetuneCents', () => {
    it('calculates total cents from semitones and fine detune', () => {
      expect(calculatePitchDetuneCents(0, 0)).toBe(0);
      expect(calculatePitchDetuneCents(12, 0)).toBe(1200);
      expect(calculatePitchDetuneCents(-12, 0)).toBe(-1200);
      expect(calculatePitchDetuneCents(-6, 25)).toBe(-575);
      expect(calculatePitchDetuneCents(3, -15)).toBe(285);
    });
  });

  describe('buildFfmpegPitchFilter', () => {
    it('returns empty string when disabled or undefined', () => {
      expect(buildFfmpegPitchFilter(undefined)).toBe('');
      expect(buildFfmpegPitchFilter({ ...DEFAULT_AUDIO_PITCH_SETTINGS, enabled: false })).toBe('');
    });

    it('returns empty string when pitch shift is 0', () => {
      expect(buildFfmpegPitchFilter({ ...DEFAULT_AUDIO_PITCH_SETTINGS, enabled: true, semitones: 0, cents: 0 })).toBe('');
    });

    it('emits rubberband filter with preserved formants', () => {
      const settings: AudioPitchSettings = {
        enabled: true,
        semitones: -6,
        cents: 0,
        preserveFormants: true,
      };
      const filter = buildFfmpegPitchFilter(settings);
      expect(filter).toContain('rubberband=pitch=0.7071:formant=preserved');
    });

    it('emits rubberband filter with shifted formants when preserveFormants is false', () => {
      const settings: AudioPitchSettings = {
        enabled: true,
        semitones: 8,
        cents: 0,
        preserveFormants: false,
      };
      const filter = buildFfmpegPitchFilter(settings);
      expect(filter).toContain('rubberband=pitch=1.5874:formant=shifted');
    });
  });
});
