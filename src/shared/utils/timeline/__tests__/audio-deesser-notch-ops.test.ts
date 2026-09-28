import { describe, expect, it } from 'vitest';
import {
  buildStudioDeEsserNotchFiltergraph,
  calculateDeEsserGainReduction,
  calculateDeEsserTransfer,
  calculateNotchFrequencyResponse,
  clampDeEsserParams,
  clampNotchFilterParams,
  DEFAULT_DEESSER_SETTINGS,
  DEFAULT_NOTCH_FILTER_SETTINGS,
  DEESSER_PRESETS,
  generateDeEsserFilterString,
  generateNotchFilterString,
  MAINS_HUM_PRESETS,
  sampleDeEsserCurvePoints,
  sampleNotchFilterResponse,
  type MainsHumNotchSettings,
  type StudioDeEsserSettings,
} from '../audio-deesser-notch-ops';

describe('audio-deesser-notch-ops (Milestone S183: Vocal De-Esser & Mains Hum Notch Filter Rack)', () => {
  const activeDeEsser: StudioDeEsserSettings = {
    ...DEFAULT_DEESSER_SETTINGS,
    enabled: true,
    thresholdDb: -20,
    ratio: 4.0,
    kneeDb: 4,
    frequency: 6500,
    makeupGainDb: 1.0,
  };

  const activeNotch: MainsHumNotchSettings = {
    ...DEFAULT_NOTCH_FILTER_SETTINGS,
    enabled: true,
    baseFreq: 60,
    harmonicsCount: 3,
    attenuationDb: -36,
    qFactor: 15,
    harmonicRollOffDbPerOctave: 3,
    highPassHz: 25,
  };

  describe('parameter clamping & sanitization', () => {
    it('clamps de-esser parameters within safe professional ranges', () => {
      const clamped = clampDeEsserParams({
        frequency: 25000, // too high
        q: 0.1, // too low
        thresholdDb: 10, // above 0
        ratio: 25, // too high
        attackMs: 0.1, // too fast
        releaseMs: 500, // too slow
        kneeDb: 20, // too wide
        makeupGainDb: 15, // too high
      });

      expect(clamped.frequency).toBe(10000);
      expect(clamped.q).toBe(0.5);
      expect(clamped.thresholdDb).toBe(0);
      expect(clamped.ratio).toBe(8.0);
      expect(clamped.attackMs).toBe(0.5);
      expect(clamped.releaseMs).toBe(200);
      expect(clamped.kneeDb).toBe(10);
      expect(clamped.makeupGainDb).toBe(6);
    });

    it('clamps mains hum notch parameters within valid ranges', () => {
      const clamped = clampNotchFilterParams({
        baseFreq: 50,
        harmonicsCount: 10, // max 4
        attenuationDb: -90, // min -60
        qFactor: 100, // max 50
        highPassHz: 120, // max 80
      });

      expect(clamped.baseFreq).toBe(50);
      expect(clamped.harmonicsCount).toBe(4);
      expect(clamped.attenuationDb).toBe(-60);
      expect(clamped.qFactor).toBe(50);
      expect(clamped.highPassHz).toBe(80);
    });
  });

  describe('calculateDeEsserGainReduction', () => {
    it('returns 0 dB reduction when de-esser is bypassed', () => {
      const bypassed = { ...activeDeEsser, enabled: false };
      expect(calculateDeEsserGainReduction(-10, bypassed)).toBe(0);
      expect(calculateDeEsserGainReduction(0, bypassed)).toBe(0);
    });

    it('returns 0 dB reduction below the threshold and soft knee', () => {
      // Threshold is -20 dB, knee is 4 dB -> lower knee boundary is -22 dB
      expect(calculateDeEsserGainReduction(-40, activeDeEsser)).toBe(0);
      expect(calculateDeEsserGainReduction(-25, activeDeEsser)).toBe(0);
      expect(calculateDeEsserGainReduction(-22, activeDeEsser)).toBe(0);
    });

    it('attenuates sibilance above upper knee boundary according to compression ratio', () => {
      // Upper knee boundary is -18 dB (-20 + 2).
      // At -10 dB: delta from threshold is 10 dB.
      // Expected output = T + delta / R = -20 + 10 / 4 = -17.5 dB
      // Reduction = input - output = -10 - (-17.5) = 7.5 dB
      const reduction = calculateDeEsserGainReduction(-10, activeDeEsser);
      expect(reduction).toBeCloseTo(7.5, 2);
    });

    it('smoothly interpolates inside the soft-knee zone', () => {
      // Knee band: [-22 dB, -18 dB], center is -20 dB
      const redLower = calculateDeEsserGainReduction(-22, activeDeEsser);
      const redCenter = calculateDeEsserGainReduction(-20, activeDeEsser);
      const redUpper = calculateDeEsserGainReduction(-18, activeDeEsser);

      expect(redLower).toBe(0);
      expect(redCenter).toBeGreaterThan(0);
      expect(redCenter).toBeLessThan(redUpper);
      expect(redUpper).toBeGreaterThan(redCenter);
    });
  });

  describe('calculateDeEsserTransfer & SVG curve generation', () => {
    it('applies makeup gain to transfer output', () => {
      // Below threshold (-30 dB): reduction is 0 dB, makeupGainDb is 1.0 dB
      const output = calculateDeEsserTransfer(-30, activeDeEsser);
      expect(output).toBe(-29.0);
    });

    it('samples SVG response points across dynamic range', () => {
      const points = sampleDeEsserCurvePoints(activeDeEsser, 300, 150, 60, -50, 0);
      expect(points.length).toBe(61);

      for (const pt of points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(300);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(150);
        expect(pt.gainReductionDb).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('calculateNotchFrequencyResponse (Mains Hum & Harmonics)', () => {
    it('returns 0 dB when notch filter is bypassed', () => {
      const bypassed = { ...activeNotch, enabled: false };
      expect(calculateNotchFrequencyResponse(60, bypassed)).toBe(0);
      expect(calculateNotchFrequencyResponse(120, bypassed)).toBe(0);
    });

    it('imposes deep notch attenuation at the AC fundamental (60 Hz)', () => {
      const responseAt60 = calculateNotchFrequencyResponse(60, activeNotch);
      // Expected notch depth is ~ -36 dB (or slightly deeper combined with HP)
      expect(responseAt60).toBeLessThanOrEqual(-30);
    });

    it('notches the 2nd harmonic (120 Hz) and 3rd harmonic (180 Hz)', () => {
      const responseAt120 = calculateNotchFrequencyResponse(120, activeNotch);
      const responseAt180 = calculateNotchFrequencyResponse(180, activeNotch);

      expect(responseAt120).toBeLessThanOrEqual(-25);
      expect(responseAt180).toBeLessThanOrEqual(-20);
    });

    it('preserves clean pass-through far away from notches', () => {
      // 1000 Hz is far from 60/120/180 Hz notches
      const responseAt1k = calculateNotchFrequencyResponse(1000, activeNotch);
      expect(responseAt1k).toBeCloseTo(0, 1);
    });

    it('rolls off subsonic rumble below highPassHz (25 Hz)', () => {
      const responseAt10 = calculateNotchFrequencyResponse(10, activeNotch);
      const responseAt25 = calculateNotchFrequencyResponse(25, activeNotch);

      // 10 Hz should suffer strong high-pass attenuation compared to 25 Hz
      expect(responseAt10).toBeLessThan(responseAt25);
      expect(responseAt10).toBeLessThan(-10);
    });

    it('samples notch filter logarithmic frequency response points', () => {
      const points = sampleNotchFilterResponse(activeNotch, 400, 120, 20, 500, 50);
      expect(points.length).toBe(51);

      // Ensure points start at 20Hz and end at 500Hz
      expect(points[0].freqHz).toBeCloseTo(20, 0);
      expect(points[points.length - 1].freqHz).toBeCloseTo(500, 0);

      for (const pt of points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(400);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(120);
      }
    });
  });

  describe('Presets', () => {
    it('verifies all de-esser presets have valid properties', () => {
      for (const key of Object.keys(DEESSER_PRESETS) as (keyof typeof DEESSER_PRESETS)[]) {
        const preset = DEESSER_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.settings.frequency).toBeGreaterThanOrEqual(4000);
        expect(preset.settings.thresholdDb).toBeLessThanOrEqual(0);
      }
    });

    it('verifies all mains hum presets have valid frequencies', () => {
      for (const key of Object.keys(MAINS_HUM_PRESETS) as (keyof typeof MAINS_HUM_PRESETS)[]) {
        const preset = MAINS_HUM_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect([50, 60]).toContain(preset.settings.baseFreq);
      }
    });
  });

  describe('FFmpeg filtergraph synthesis', () => {
    it('generates FFmpeg notch filter string with highpass and cascaded equalizers', () => {
      const filterStr = generateNotchFilterString(activeNotch);
      expect(filterStr).toContain('highpass=f=25:width_type=q:w=0.707');
      expect(filterStr).toContain('equalizer=f=60:t=q:w=15:g=-36');
      expect(filterStr).toContain('equalizer=f=120:t=q:w=15');
      expect(filterStr).toContain('equalizer=f=180:t=q:w=15');
    });

    it('generates FFmpeg de-esser filter string', () => {
      const filterStr = generateDeEsserFilterString(activeDeEsser);
      expect(filterStr).toContain('deesser=');
      expect(filterStr).toContain(':s=s'); // split-band
      expect(filterStr).toContain('volume=1dB'); // makeup gain
    });

    it('builds combined studio de-esser and notch filtergraph', () => {
      const combined = buildStudioDeEsserNotchFiltergraph(activeDeEsser, activeNotch);
      expect(combined).toContain('highpass=f=25');
      expect(combined).toContain('equalizer=f=60');
      expect(combined).toContain('deesser=');
    });

    it('returns empty string when both filters are disabled', () => {
      const disabledDeEsser = { ...activeDeEsser, enabled: false };
      const disabledNotch = { ...activeNotch, enabled: false };
      expect(buildStudioDeEsserNotchFiltergraph(disabledDeEsser, disabledNotch)).toBe('');
    });
  });
});
