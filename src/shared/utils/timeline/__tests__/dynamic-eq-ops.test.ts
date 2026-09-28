import { describe, it, expect } from 'vitest';
import {
  clampDynamicEqGain,
  clampDynamicEqFrequency,
  clampDynamicEqQ,
  clampDynamicEqThreshold,
  clampDynamicEqRatio,
  clampDynamicEqKnee,
  calculateBandOvershoot,
  calculateBandDynamicGain,
  calculateBandTotalGainAtLevel,
  calculateBandShapeWeight,
  calculateDynamicEqGainAtFrequency,
  calculateDynamicEqStaticGainAtFrequency,
  isNeutralDynamicEq,
  generateDynamicEqSvgPath,
  detectResonantSpikes,
  createResonanceSuppressionBands,
  generateDynamicEqFiltergraph,
  DEFAULT_DYNAMIC_EQ_SETTINGS,
  DYNAMIC_EQ_PRESETS,
  type DynamicEqBand,
  type DynamicEqSettings,
} from '../dynamic-eq-ops';

describe('dynamic-eq-ops', () => {
  describe('clamping helpers', () => {
    it('clamps gain within [-24, +24] dB', () => {
      expect(clampDynamicEqGain(-35)).toBe(-24);
      expect(clampDynamicEqGain(30)).toBe(24);
      expect(clampDynamicEqGain(6.5)).toBe(6.5);
      expect(clampDynamicEqGain(NaN)).toBe(0);
    });

    it('clamps frequency within [20, 20000] Hz', () => {
      expect(clampDynamicEqFrequency(5)).toBe(20);
      expect(clampDynamicEqFrequency(30000)).toBe(20000);
      expect(clampDynamicEqFrequency(1000)).toBe(1000);
      expect(clampDynamicEqFrequency(NaN)).toBe(1000);
    });

    it('clamps Q within [0.1, 20.0]', () => {
      expect(clampDynamicEqQ(0.02)).toBe(0.1);
      expect(clampDynamicEqQ(25)).toBe(20.0);
      expect(clampDynamicEqQ(1.41)).toBe(1.41);
    });

    it('clamps threshold within [-60, 0] dBFS', () => {
      expect(clampDynamicEqThreshold(-80)).toBe(-60);
      expect(clampDynamicEqThreshold(5)).toBe(0);
      expect(clampDynamicEqThreshold(-18)).toBe(-18);
    });

    it('clamps ratio within [1.0, 20.0]', () => {
      expect(clampDynamicEqRatio(0.5)).toBe(1.0);
      expect(clampDynamicEqRatio(25)).toBe(20.0);
      expect(clampDynamicEqRatio(3.5)).toBe(3.5);
    });

    it('clamps knee within [0, 12] dB', () => {
      expect(clampDynamicEqKnee(-2)).toBe(0);
      expect(clampDynamicEqKnee(15)).toBe(12);
      expect(clampDynamicEqKnee(2.5)).toBe(2.5);
    });
  });

  describe('calculateBandOvershoot', () => {
    it('returns 0 when level is well below threshold with hard knee', () => {
      expect(calculateBandOvershoot(-30, -20, 0)).toBe(0);
    });

    it('returns exact difference when level is above threshold with hard knee', () => {
      expect(calculateBandOvershoot(-10, -20, 0)).toBe(10);
    });

    it('returns smooth parabolic interpolation within soft-knee zone', () => {
      // Threshold = -20, Knee = 4 (halfKnee = 2, zone: [-22, -18])
      expect(calculateBandOvershoot(-24, -20, 4)).toBe(0);
      // At center of knee (delta = 0): (0 + 2)^2 / (4 * 2) = 4 / 8 = 0.5
      expect(calculateBandOvershoot(-20, -20, 4)).toBeCloseTo(0.5, 4);
      // Above upper knee bound (level = -16, delta = 4 > 2): linear 4
      expect(calculateBandOvershoot(-16, -20, 4)).toBe(4);
    });
  });

  describe('calculateBandDynamicGain', () => {
    const testBand: DynamicEqBand = {
      id: 'test-bell',
      enabled: true,
      type: 'bell',
      frequencyHz: 1000,
      q: 1.0,
      staticGainDb: 0,
      dynamicGainDb: -6.0,
      thresholdDb: -20,
      ratio: 2.0,
      kneeDb: 0,
      attackMs: 5,
      releaseMs: 50,
      mode: 'compress',
    };

    it('returns 0 when signal is below threshold', () => {
      expect(calculateBandDynamicGain(testBand, -30)).toBe(0);
    });

    it('attenuates signal proportionally to overshoot and ratio', () => {
      // Input = -10, Threshold = -20, Overshoot = 10 dB
      // Scale = 1 - 1/2 = 0.5. Expected cut = -5.0 dB
      expect(calculateBandDynamicGain(testBand, -10)).toBeCloseTo(-5.0, 2);
    });

    it('caps attenuation at dynamicGainDb ceiling', () => {
      // Input = 0, Overshoot = 20 dB, Scale = 0.5 => raw delta = 10 dB
      // dynamicGainDb is -6.0, so it should cap at -6.0 dB
      expect(calculateBandDynamicGain(testBand, 0)).toBe(-6.0);
    });

    it('handles upward expansion mode when signal exceeds threshold', () => {
      const expandBand: DynamicEqBand = {
        ...testBand,
        dynamicGainDb: 4.0,
        mode: 'expand',
        ratio: 1.5,
      };
      // Input = -16, Threshold = -20, Overshoot = 4 dB
      // Expansion scale = 1.5 - 1 = 0.5 => delta = +2 dB
      expect(calculateBandDynamicGain(expandBand, -16)).toBeCloseTo(2.0, 2);
    });

    it('returns 0 when band is disabled', () => {
      expect(calculateBandDynamicGain({ ...testBand, enabled: false }, 0)).toBe(0);
    });
  });

  describe('calculateBandTotalGainAtLevel', () => {
    it('sums static and dynamic gains accurately', () => {
      const band: DynamicEqBand = {
        id: 'band',
        enabled: true,
        type: 'bell',
        frequencyHz: 3000,
        q: 1.0,
        staticGainDb: 2.0,
        dynamicGainDb: -4.0,
        thresholdDb: -20,
        ratio: 2.0,
        kneeDb: 0,
        attackMs: 5,
        releaseMs: 50,
        mode: 'compress',
      };
      // At -30 dB (below threshold): static only = +2.0 dB
      expect(calculateBandTotalGainAtLevel(band, -30)).toBe(2.0);

      // At -10 dB (10 dB overshoot, 5 dB cut): 2.0 - 5.0 => capped by dynamicGainDb (-4.0) => 2.0 - 4.0 = -2.0 dB
      expect(calculateBandTotalGainAtLevel(band, -10)).toBeCloseTo(-2.0, 2);
    });
  });

  describe('calculateBandShapeWeight', () => {
    it('returns maximum 1.0 at center frequency for bell filter', () => {
      const weight = calculateBandShapeWeight('bell', 1000, 1000, 1.0);
      expect(weight).toBeCloseTo(1.0, 4);
    });

    it('attenuates bell filter weight symmetrically away from center frequency', () => {
      const weightLow = calculateBandShapeWeight('bell', 500, 1000, 1.0);
      const weightHigh = calculateBandShapeWeight('bell', 2000, 1000, 1.0);
      expect(weightLow).toBeCloseTo(weightHigh, 2);
      expect(weightLow).toBeLessThan(0.3);
    });

    it('calculates low shelf weighting correctly', () => {
      // f << fc: weight ~ 1.0
      expect(calculateBandShapeWeight('low_shelf', 20, 100, 1.0)).toBeGreaterThan(0.95);
      // f = fc: weight = 0.5
      expect(calculateBandShapeWeight('low_shelf', 100, 100, 1.0)).toBeCloseTo(0.5, 4);
      // f >> fc: weight ~ 0
      expect(calculateBandShapeWeight('low_shelf', 5000, 100, 1.0)).toBeLessThan(0.01);
    });

    it('calculates high shelf weighting correctly', () => {
      // f << fc: weight ~ 0
      expect(calculateBandShapeWeight('high_shelf', 100, 10000, 1.0)).toBeLessThan(0.01);
      // f = fc: weight = 0.5
      expect(calculateBandShapeWeight('high_shelf', 10000, 10000, 1.0)).toBeCloseTo(0.5, 4);
      // f >> fc: weight ~ 1.0
      expect(calculateBandShapeWeight('high_shelf', 18000, 10000, 1.0)).toBeGreaterThan(0.7);
    });
  });

  describe('composite frequency response', () => {
    it('returns 0 dB across all frequencies for neutral settings', () => {
      const neutralSettings = DYNAMIC_EQ_PRESETS.flat_bypass.settings;
      expect(isNeutralDynamicEq(neutralSettings)).toBe(true);
      expect(calculateDynamicEqGainAtFrequency(neutralSettings, 1000)).toBe(0);
      expect(calculateDynamicEqStaticGainAtFrequency(neutralSettings, 1000)).toBe(0);
    });

    it('computes static gain accurately at center frequency', () => {
      const settings: DynamicEqSettings = {
        enabled: true,
        globalGainDb: 0,
        lookaheadMs: 5,
        bands: [
          {
            id: 'b1',
            enabled: true,
            type: 'bell',
            frequencyHz: 1000,
            q: 2.0,
            staticGainDb: 4.0,
            dynamicGainDb: 0,
            thresholdDb: -20,
            ratio: 2.0,
            kneeDb: 0,
            attackMs: 5,
            releaseMs: 50,
            mode: 'compress',
          },
        ],
      };
      const gainAtFc = calculateDynamicEqStaticGainAtFrequency(settings, 1000);
      expect(gainAtFc).toBeCloseTo(4.0, 2);
    });

    it('dynamically adapts response when input level exceeds threshold', () => {
      const settings: DynamicEqSettings = {
        enabled: true,
        globalGainDb: 0,
        lookaheadMs: 5,
        bands: [
          {
            id: 'b1',
            enabled: true,
            type: 'bell',
            frequencyHz: 1000,
            q: 2.0,
            staticGainDb: 0,
            dynamicGainDb: -6.0,
            thresholdDb: -20,
            ratio: 3.0,
            kneeDb: 0,
            attackMs: 5,
            releaseMs: 50,
            mode: 'compress',
          },
        ],
      };
      // At quiet level (-30 dBFS): gain is 0 dB
      expect(calculateDynamicEqGainAtFrequency(settings, 1000, -30)).toBe(0);

      // At loud level (-10 dBFS): 10dB overshoot * (1 - 1/3) = 6.67dB cut, capped at -6dB
      expect(calculateDynamicEqGainAtFrequency(settings, 1000, -10)).toBeCloseTo(-6.0, 1);
    });
  });

  describe('generateDynamicEqSvgPath', () => {
    it('generates valid SVG path strings with sample coordinates', () => {
      const paths = generateDynamicEqSvgPath(DEFAULT_DYNAMIC_EQ_SETTINGS, 400, 180, -12);
      expect(paths.staticPath).toContain('M 0');
      expect(paths.dynamicPath).toContain('M 0');
      expect(paths.fillPath).toContain('M 0');
      expect(paths.fillPath).toContain('Z');
    });
  });

  describe('detectResonantSpikes & createResonanceSuppressionBands', () => {
    it('identifies synthetic resonance peaks cleanly', () => {
      // Create synthetic spectrum with flat -30 dB baseline and sharp resonance peak at 500 Hz
      const spectrum: { frequency: number; magnitudeDb: number }[] = [];
      for (let f = 100; f <= 1000; f += 25) {
        let mag = -30;
        if (f === 500) mag = -15; // +15 dB spike
        if (f === 475 || f === 525) mag = -24;
        spectrum.push({ frequency: f, magnitudeDb: mag });
      }

      const spikes = detectResonantSpikes(spectrum, {
        prominenceThresholdDb: 6.0,
        minQ: 1.5,
      });

      expect(spikes.length).toBeGreaterThanOrEqual(1);
      const mainSpike = spikes[0];
      expect(mainSpike.frequencyHz).toBe(500);
      expect(mainSpike.prominenceDb).toBeGreaterThanOrEqual(10);
      expect(mainSpike.estimatedQ).toBeGreaterThanOrEqual(2.0);

      // Verify automatic notch band creation
      const notchBands = createResonanceSuppressionBands(spikes, 2);
      expect(notchBands.length).toBe(spikes.length);
      expect(notchBands[0].frequencyHz).toBe(500);
      expect(notchBands[0].type).toBe('bell');
      expect(notchBands[0].mode).toBe('compress');
      expect(notchBands[0].dynamicGainDb).toBeLessThan(0);
    });
  });

  describe('generateDynamicEqFiltergraph', () => {
    it('returns empty string for neutral settings', () => {
      expect(generateDynamicEqFiltergraph(DYNAMIC_EQ_PRESETS.flat_bypass.settings)).toBe('');
    });

    it('generates valid FFmpeg filter strings for active dynamic EQ', () => {
      const filterStr = generateDynamicEqFiltergraph(DEFAULT_DYNAMIC_EQ_SETTINGS);
      expect(filterStr).toContain('lowshelf=');
      expect(filterStr).toContain('equalizer=');
      expect(filterStr).toContain('highshelf=');
    });
  });

  describe('presets catalog', () => {
    it('has all documented studio presets available', () => {
      const presetKeys = Object.keys(DYNAMIC_EQ_PRESETS);
      expect(presetKeys).toContain('dialogue_clarity_debox');
      expect(presetKeys).toContain('de_ess_harshness_tamer');
      expect(presetKeys).toContain('proximity_boom_control');
      expect(presetKeys).toContain('acoustic_guitar_body');
      expect(presetKeys).toContain('master_bus_glue');
      expect(presetKeys).toContain('room_resonance_notch');
      expect(presetKeys).toContain('flat_bypass');
    });
  });
});
