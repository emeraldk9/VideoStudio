import { describe, expect, it } from 'vitest';
import {
  AUDIO_EQ_PRESETS,
  DEFAULT_AUDIO_EQ_SETTINGS,
  buildFfmpegEqFilter,
  calculateEqGainAtFrequency,
  clampEqFrequency,
  clampEqGain,
  sampleEqCurvePoints,
  type AudioEqualizerSettings,
} from '../audio-eq-ops';
import { clipEffectsSchema } from '../effects';

describe('audio-eq-ops (Step S35: 3-Band Parametric Audio Equalizer)', () => {
  describe('Constants & Presets', () => {
    it('has neutral default audio EQ settings', () => {
      expect(DEFAULT_AUDIO_EQ_SETTINGS.enabled).toBe(true);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.low.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.mid.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.high.gainDb).toBe(0);
    });

    it('contains all essential studio presets', () => {
      const presets = Object.keys(AUDIO_EQ_PRESETS);
      expect(presets).toContain('flat');
      expect(presets).toContain('vocal_clarity');
      expect(presets).toContain('podcast_warmth');
      expect(presets).toContain('bass_boost');
      expect(presets).toContain('de_mud');
      expect(presets).toContain('bright_air');
      expect(presets).toContain('phone_radio');

      for (const key of presets) {
        const p = AUDIO_EQ_PRESETS[key as keyof typeof AUDIO_EQ_PRESETS];
        expect(p.label).toBeDefined();
        expect(p.description).toBeDefined();
        expect(p.settings.low.gainDb).toBeGreaterThanOrEqual(-15);
        expect(p.settings.low.gainDb).toBeLessThanOrEqual(15);
        expect(p.settings.mid.gainDb).toBeGreaterThanOrEqual(-15);
        expect(p.settings.mid.gainDb).toBeLessThanOrEqual(15);
        expect(p.settings.high.gainDb).toBeGreaterThanOrEqual(-15);
        expect(p.settings.high.gainDb).toBeLessThanOrEqual(15);
      }
    });
  });

  describe('Clamping & Sanitation', () => {
    it('clamps gain within safe [-15, +15] dB limits', () => {
      expect(clampEqGain(0)).toBe(0);
      expect(clampEqGain(-20)).toBe(-15);
      expect(clampEqGain(25)).toBe(15);
      expect(clampEqGain(NaN)).toBe(0);
      expect(clampEqGain(Infinity)).toBe(0);
    });

    it('clamps frequency within audible [20, 20000] Hz limits', () => {
      expect(clampEqFrequency(1000)).toBe(1000);
      expect(clampEqFrequency(5)).toBe(20);
      expect(clampEqFrequency(40000)).toBe(20000);
      expect(clampEqFrequency(NaN)).toBe(1000);
    });
  });

  describe('Frequency Response Calculations', () => {
    it('returns zero gain across the spectrum when EQ is disabled or flat', () => {
      const disabledEq: AudioEqualizerSettings = {
        ...DEFAULT_AUDIO_EQ_SETTINGS,
        enabled: false,
        low: { gainDb: 10, frequencyHz: 100 },
      };
      expect(calculateEqGainAtFrequency(disabledEq, 100)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 100)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 1000)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 10000)).toBe(0);
    });

    it('evaluates Bass Boost preset with high low-end gain tapering off at highs', () => {
      const bassBoost = AUDIO_EQ_PRESETS.bass_boost.settings;
      const lowResponse = calculateEqGainAtFrequency(bassBoost, 60);
      const midResponse = calculateEqGainAtFrequency(bassBoost, 600);
      const highResponse = calculateEqGainAtFrequency(bassBoost, 10000);

      expect(lowResponse).toBeGreaterThan(3.5); // Boost at sub/bass (shelf fc=80Hz)
      expect(midResponse).toBeLessThan(0); // Slight dip around 600 Hz
      expect(Math.abs(highResponse)).toBeLessThan(1.0); // Near flat at treble
    });

    it('evaluates Bright Air preset boosting high frequencies', () => {
      const brightAir = AUDIO_EQ_PRESETS.bright_air.settings;
      const lowResponse = calculateEqGainAtFrequency(brightAir, 60);
      const highResponse = calculateEqGainAtFrequency(brightAir, 10000);

      expect(Math.abs(lowResponse)).toBeLessThan(0.5);
      expect(highResponse).toBeGreaterThan(2.5); // High shelf boost (fc=10kHz)
    });

    it('evaluates Phone/Radio bandpass preset cutting lows and highs while boosting mids', () => {
      const phoneRadio = AUDIO_EQ_PRESETS.phone_radio.settings;
      const subResponse = calculateEqGainAtFrequency(phoneRadio, 80);
      const midResponse = calculateEqGainAtFrequency(phoneRadio, 1800);
      const highResponse = calculateEqGainAtFrequency(phoneRadio, 12000);

      expect(subResponse).toBeLessThan(-10);
      expect(midResponse).toBeGreaterThan(4.0); // Mid presence peak
      expect(highResponse).toBeLessThan(-10);
    });
  });

  describe('SVG Curve Path Geometry Generation', () => {
    it('generates the specified number of sample points and valid SVG path data', () => {
      const width = 340;
      const height = 80;
      const { points, pathData } = sampleEqCurvePoints(
        AUDIO_EQ_PRESETS.vocal_clarity.settings,
        width,
        height,
        64,
        18,
      );

      expect(points.length).toBe(64);
      expect(pathData.startsWith('M')).toBe(true);
      expect(pathData).toContain('L');

      // Check boundaries
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(height);
        expect(p.frequencyHz).toBeGreaterThanOrEqual(20);
        expect(p.frequencyHz).toBeLessThanOrEqual(20000);
      }
    });

    it('centers flat EQ response at midpoint height (0 dB line)', () => {
      const height = 80;
      const { points } = sampleEqCurvePoints(
        DEFAULT_AUDIO_EQ_SETTINGS,
        340,
        height,
        16,
        18,
      );

      for (const p of points) {
        expect(p.y).toBeCloseTo(height / 2, 2); // Exactly height/2 = 40
      }
    });
  });

  describe('FFmpeg Audio Filter Generation', () => {
    it('returns empty string when EQ is disabled or all gains are 0 dB', () => {
      expect(buildFfmpegEqFilter(undefined)).toBe('');
      expect(buildFfmpegEqFilter(DEFAULT_AUDIO_EQ_SETTINGS)).toBe('');

      const disabledEq: AudioEqualizerSettings = {
        ...AUDIO_EQ_PRESETS.bass_boost.settings,
        enabled: false,
      };
      expect(buildFfmpegEqFilter(disabledEq)).toBe('');
    });

    it('generates accurate FFmpeg equalizer filter chains for active presets', () => {
      const vocalClarity = AUDIO_EQ_PRESETS.vocal_clarity.settings;
      const filter = buildFfmpegEqFilter(vocalClarity);

      expect(filter).toContain('equalizer=f=100:t=s:w=1:g=-3.0');
      expect(filter).toContain('equalizer=f=2500:t=q:w=1.20:g=3.0');
      expect(filter).toContain('equalizer=f=9000:t=s:w=1:g=4.0');
    });

    it('omits bands with 0 dB adjustment from the filter chain', () => {
      const customEq: AudioEqualizerSettings = {
        enabled: true,
        low: { gainDb: 4.5, frequencyHz: 90 },
        mid: { gainDb: 0, frequencyHz: 1000 },
        high: { gainDb: 0, frequencyHz: 8000 },
      };

      const filter = buildFfmpegEqFilter(customEq);
      expect(filter).toBe('equalizer=f=90:t=s:w=1:g=4.5');
      expect(filter).not.toContain('f=1000');
      expect(filter).not.toContain('f=8000');
    });
  });

  describe('Clip Effects Schema Validation', () => {
    it('validates clip effects with embedded equalizer settings', () => {
      const effects = {
        speed: 1.0,
        equalizer: {
          enabled: true,
          low: { gainDb: -2.5, frequencyHz: 100 },
          mid: { gainDb: 3.0, frequencyHz: 2000, q: 1.2 },
          high: { gainDb: 4.0, frequencyHz: 8000 },
        },
      };

      const parsed = clipEffectsSchema.safeParse(effects);
      expect(parsed.success).toBe(true);
    });

    it('rejects out-of-range equalizer gain in schema', () => {
      const effects = {
        equalizer: {
          enabled: true,
          low: { gainDb: 25, frequencyHz: 100 }, // exceeds max 15 dB
          mid: { gainDb: 0, frequencyHz: 1000 },
          high: { gainDb: 0, frequencyHz: 8000 },
        },
      };

      const parsed = clipEffectsSchema.safeParse(effects);
      expect(parsed.success).toBe(false);
    });
  });
});
