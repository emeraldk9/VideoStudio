import { describe, expect, it } from 'vitest';
import {
  AUDIO_EQ_PRESETS,
  DEFAULT_AUDIO_EQ_SETTINGS,
  EQ_GAIN_MAX,
  EQ_FREQ_MIN,
  EQ_FREQ_MAX,
  buildFfmpegEqFilter,
  calculateBandGainAtFrequency,
  calculateEqGainAtFrequency,
  clampEqFrequency,
  clampEqGain,
  isNeutralEq,
  resolveEqBands,
  sampleBandCurvePoints,
  sampleEqCurvePoints,
  type AudioEqualizerSettings,
} from '../audio-eq-ops';
import { clipEffectsSchema } from '../effects';

describe('audio-eq-ops (Milestone S166: 4-Band Parametric Audio Equalizer)', () => {
  describe('Constants & Presets', () => {
    it('has neutral default 4-band audio EQ settings', () => {
      expect(DEFAULT_AUDIO_EQ_SETTINGS.enabled).toBe(true);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.low.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.lowMid.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.highMid.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.high.gainDb).toBe(0);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.low.frequencyHz).toBe(80);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.lowMid.frequencyHz).toBe(250);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.highMid.frequencyHz).toBe(2500);
      expect(DEFAULT_AUDIO_EQ_SETTINGS.high.frequencyHz).toBe(10000);
    });

    it('contains all essential studio presets including S166 additions', () => {
      const presets = Object.keys(AUDIO_EQ_PRESETS);
      expect(presets).toContain('flat');
      expect(presets).toContain('vocal_clarity');
      expect(presets).toContain('podcast_warmth');
      expect(presets).toContain('bass_boost');
      expect(presets).toContain('de_mud');
      expect(presets).toContain('bright_air');
      expect(presets).toContain('phone_radio');
      expect(presets).toContain('scooped_v');
      expect(presets).toContain('broadcast_standard');

      for (const key of presets) {
        const p = AUDIO_EQ_PRESETS[key as keyof typeof AUDIO_EQ_PRESETS];
        expect(p.label).toBeDefined();
        expect(p.description).toBeDefined();
        expect(p.settings.low.gainDb).toBeGreaterThanOrEqual(-EQ_GAIN_MAX);
        expect(p.settings.low.gainDb).toBeLessThanOrEqual(EQ_GAIN_MAX);
        expect(p.settings.lowMid.gainDb).toBeGreaterThanOrEqual(-EQ_GAIN_MAX);
        expect(p.settings.lowMid.gainDb).toBeLessThanOrEqual(EQ_GAIN_MAX);
        expect(p.settings.highMid.gainDb).toBeGreaterThanOrEqual(-EQ_GAIN_MAX);
        expect(p.settings.highMid.gainDb).toBeLessThanOrEqual(EQ_GAIN_MAX);
        expect(p.settings.high.gainDb).toBeGreaterThanOrEqual(-EQ_GAIN_MAX);
        expect(p.settings.high.gainDb).toBeLessThanOrEqual(EQ_GAIN_MAX);
      }
    });
  });

  describe('Clamping & Sanitation', () => {
    it('clamps gain within safe [-18, +18] dB limits', () => {
      expect(clampEqGain(0)).toBe(0);
      expect(clampEqGain(-25)).toBe(-18);
      expect(clampEqGain(25)).toBe(18);
      expect(clampEqGain(NaN)).toBe(0);
      expect(clampEqGain(Infinity)).toBe(0);
    });

    it('clamps frequency within audible [20, 20000] Hz limits', () => {
      expect(clampEqFrequency(1000)).toBe(1000);
      expect(clampEqFrequency(5)).toBe(EQ_FREQ_MIN);
      expect(clampEqFrequency(40000)).toBe(EQ_FREQ_MAX);
      expect(clampEqFrequency(NaN)).toBe(1000);
    });
  });

  describe('Backward Compatibility & resolveEqBands', () => {
    it('resolves 4-band settings directly when lowMid and highMid are present', () => {
      const settings: AudioEqualizerSettings = {
        enabled: true,
        low: { gainDb: 3, frequencyHz: 80 },
        lowMid: { gainDb: -2, frequencyHz: 300, q: 1.2 },
        highMid: { gainDb: 4, frequencyHz: 2800, q: 0.9 },
        high: { gainDb: -1, frequencyHz: 12000 },
      };
      const resolved = resolveEqBands(settings);
      expect(resolved.low.gainDb).toBe(3);
      expect(resolved.lowMid.gainDb).toBe(-2);
      expect(resolved.highMid.gainDb).toBe(4);
      expect(resolved.high.gainDb).toBe(-1);
    });

    it('resolves legacy 3-band settings mapping mid -> highMid and providing default lowMid', () => {
      const legacy: AudioEqualizerSettings = {
        enabled: true,
        low: { gainDb: 2, frequencyHz: 100 },
        high: { gainDb: 5, frequencyHz: 8000 },
        mid: { gainDb: 3.5, frequencyHz: 1500, q: 1.5 },
      } as unknown as AudioEqualizerSettings;

      const resolved = resolveEqBands(legacy);
      expect(resolved.low.gainDb).toBe(2);
      expect(resolved.lowMid.gainDb).toBe(0);
      expect(resolved.lowMid.frequencyHz).toBe(250);
      expect(resolved.highMid.gainDb).toBe(3.5);
      expect(resolved.highMid.frequencyHz).toBe(1500);
      expect(resolved.high.gainDb).toBe(5);
    });
  });

  describe('Neutrality Check (isNeutralEq)', () => {
    it('identifies neutral and non-neutral EQ configurations', () => {
      expect(isNeutralEq(undefined)).toBe(true);
      expect(isNeutralEq(DEFAULT_AUDIO_EQ_SETTINGS)).toBe(true);
      expect(isNeutralEq(AUDIO_EQ_PRESETS.flat.settings)).toBe(true);

      const modified: AudioEqualizerSettings = {
        ...DEFAULT_AUDIO_EQ_SETTINGS,
        lowMid: { gainDb: 2.0, frequencyHz: 250 },
      };
      expect(isNeutralEq(modified)).toBe(false);

      const disabledModified: AudioEqualizerSettings = {
        ...modified,
        enabled: false,
      };
      expect(isNeutralEq(disabledModified)).toBe(true);
    });
  });

  describe('Frequency Response Calculations', () => {
    it('returns 0 dB across all frequencies when disabled or neutral', () => {
      expect(calculateEqGainAtFrequency(undefined, 1000)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 100)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 1000)).toBe(0);
      expect(calculateEqGainAtFrequency(DEFAULT_AUDIO_EQ_SETTINGS, 10000)).toBe(0);
    });

    it('calculates single-band gains accurately', () => {
      const shelfBand = { gainDb: 6.0, frequencyHz: 100 };
      // Well below cutoff -> close to full gain
      expect(calculateBandGainAtFrequency(shelfBand, 'lowShelf', 20)).toBeGreaterThan(5.0);
      // Well above cutoff -> roll-off close to 0
      expect(calculateBandGainAtFrequency(shelfBand, 'lowShelf', 10000)).toBeLessThan(0.1);

      const bellBand = { gainDb: 4.0, frequencyHz: 1000, q: 1.0 };
      // Exactly at center freq -> full gain
      expect(calculateBandGainAtFrequency(bellBand, 'bell', 1000)).toBeCloseTo(4.0, 1);
      // Far from center -> roll-off
      expect(calculateBandGainAtFrequency(bellBand, 'bell', 100)).toBeLessThan(0.5);
    });

    it('sums all 4 bands for total response', () => {
      const settings: AudioEqualizerSettings = {
        enabled: true,
        low: { gainDb: 4.0, frequencyHz: 80 },
        lowMid: { gainDb: 3.0, frequencyHz: 300, q: 1.0 },
        highMid: { gainDb: -2.0, frequencyHz: 2000, q: 1.0 },
        high: { gainDb: 5.0, frequencyHz: 10000 },
      };

      // At low frequencies (30 Hz), low shelf dominates
      const lowGain = calculateEqGainAtFrequency(settings, 30);
      expect(lowGain).toBeGreaterThan(3.5);

      // At 2000 Hz, highMid cut dominates
      const midCut = calculateEqGainAtFrequency(settings, 2000);
      expect(midCut).toBeLessThan(0);

      // At high frequencies (15000 Hz), high shelf dominates
      const highGain = calculateEqGainAtFrequency(settings, 15000);
      expect(highGain).toBeGreaterThan(3.0);
    });
  });

  describe('SVG Curve Sampling', () => {
    it('samples 4-band curve points within bounds and generates SVG path', () => {
      const curve = sampleEqCurvePoints(AUDIO_EQ_PRESETS.bass_boost.settings, 440, 160, 64, 18);
      expect(curve.points).toHaveLength(64);
      expect(curve.pathData).toMatch(/^M [0-9.]+ [0-9.]+/);
      expect(curve.points[0].frequencyHz).toBeCloseTo(20, 0);
      expect(curve.points[63].frequencyHz).toBeCloseTo(20000, 0);

      for (const pt of curve.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(440);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(160);
      }
    });

    it('samples individual band ghost curve points', () => {
      const bandCurve = sampleBandCurvePoints(
        { gainDb: 5.0, frequencyHz: 250, q: 1.2 },
        'bell',
        440,
        160,
        32,
        18,
      );
      expect(bandCurve.points).toHaveLength(32);
      expect(bandCurve.pathData).toMatch(/^M/);
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

    it('generates accurate 4-band FFmpeg equalizer filter chains for active presets', () => {
      const vocalClarity = AUDIO_EQ_PRESETS.vocal_clarity.settings;
      const filter = buildFfmpegEqFilter(vocalClarity);

      expect(filter).toContain('equalizer=f=80:t=s:w=1:g=-3.0');
      expect(filter).toContain('equalizer=f=300:t=q:w=1.00:g=-1.5');
      expect(filter).toContain('equalizer=f=2500:t=q:w=1.20:g=3.5');
      expect(filter).toContain('equalizer=f=9000:t=s:w=1:g=4.0');
    });

    it('omits bands with 0 dB adjustment from the filter chain', () => {
      const customEq: AudioEqualizerSettings = {
        enabled: true,
        low: { gainDb: 4.5, frequencyHz: 90 },
        lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
        highMid: { gainDb: 0, frequencyHz: 2500, q: 1.0 },
        high: { gainDb: 0, frequencyHz: 8000 },
      };

      const filter = buildFfmpegEqFilter(customEq);
      expect(filter).toBe('equalizer=f=90:t=s:w=1:g=4.5');
      expect(filter).not.toContain('f=250');
      expect(filter).not.toContain('f=2500');
      expect(filter).not.toContain('f=8000');
    });
  });

  describe('Clip Effects Schema Validation', () => {
    it('validates clip effects with embedded 4-band equalizer settings', () => {
      const effects = {
        speed: 1.0,
        equalizer: {
          enabled: true,
          low: { gainDb: -2.5, frequencyHz: 100 },
          lowMid: { gainDb: 1.0, frequencyHz: 400, q: 1.0 },
          highMid: { gainDb: 3.0, frequencyHz: 2000, q: 1.2 },
          high: { gainDb: 4.0, frequencyHz: 8000 },
        },
      };

      const parsed = clipEffectsSchema.safeParse(effects);
      expect(parsed.success).toBe(true);
    });

    it('rejects out-of-range equalizer gain in schema (> 18 dB)', () => {
      const effects = {
        equalizer: {
          enabled: true,
          low: { gainDb: 25, frequencyHz: 100 }, // exceeds max 18 dB
          lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
          highMid: { gainDb: 0, frequencyHz: 2500, q: 1.0 },
          high: { gainDb: 0, frequencyHz: 8000 },
        },
      };

      const parsed = clipEffectsSchema.safeParse(effects);
      expect(parsed.success).toBe(false);
    });
  });
});
