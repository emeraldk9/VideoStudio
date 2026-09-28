import { describe, it, expect } from 'vitest';
import {
  calculateKneeOvershoot,
  calculateBandDynamicsGainModification,
  calculateBandOutputLevelDb,
  isNeutralMultibandDynamics,
  generateBandDynamicsSvgPath,
  generateMultibandDynamicsFiltergraph,
  DEFAULT_MULTIBAND_DYNAMICS_SETTINGS,
  MULTIBAND_DYNAMICS_PRESETS,
  type MultibandDynamicsBand,
  type MultibandDynamicsSettings,
} from '../multiband-dynamics-ops';

describe('multiband-dynamics-ops', () => {
  describe('calculateKneeOvershoot', () => {
    it('returns 0 when level is below threshold with hard knee', () => {
      expect(calculateKneeOvershoot(-30, -20, 0)).toBe(0);
    });

    it('returns exact level difference when level is above threshold with hard knee', () => {
      expect(calculateKneeOvershoot(-10, -20, 0)).toBe(10);
    });

    it('computes parabolic soft-knee interpolation accurately', () => {
      // Threshold = -20, Knee = 4 (halfKnee = 2, zone: [-22, -18])
      expect(calculateKneeOvershoot(-24, -20, 4)).toBe(0);
      expect(calculateKneeOvershoot(-20, -20, 4)).toBeCloseTo(0.5, 4);
      expect(calculateKneeOvershoot(-16, -20, 4)).toBe(4);
    });
  });

  describe('calculateBandDynamicsGainModification & output level', () => {
    const testBand: MultibandDynamicsBand = {
      id: 'highMid',
      name: 'Presence',
      enabled: true,
      thresholdDb: -20,
      ratio: 2.0, // 2:1 ratio: 10dB overshoot => 5dB reduction
      kneeDb: 0,
      attackMs: 5,
      releaseMs: 50,
      upwardExpansionEnabled: true,
      expansionThresholdDb: -40,
      expansionRatio: 1.5, // 1.5:1 expansion: 10dB undershoot => 5dB boost
      expansionRangeDb: 6.0,
      makeupGainDb: 2.0,
      limiterCeilingDb: 0,
    };

    it('applies downward compression when signal exceeds threshold', () => {
      // In = -10 dBFS, Overshoot = 10 dB.
      // Comp reduction = -10 * (1 - 1/2) = -5 dB.
      // Makeup gain = +2 dB.
      // Total gain modification = -5 + 2 = -3 dB.
      const gainMod = calculateBandDynamicsGainModification(testBand, -10);
      expect(gainMod).toBeCloseTo(-3.0, 2);

      // Output level = -10 + (-3) = -13 dBFS.
      const outLevel = calculateBandOutputLevelDb(testBand, -10);
      expect(outLevel).toBeCloseTo(-13.0, 2);
    });

    it('applies upward expansion when signal is below expansion threshold', () => {
      // In = -50 dBFS, Undershoot = 10 dB.
      // Expansion boost = min(6.0, 10 * 0.5) = +5 dB.
      // Makeup gain = +2 dB.
      // Total gain modification = +5 + 2 = +7 dB.
      const gainMod = calculateBandDynamicsGainModification(testBand, -50);
      expect(gainMod).toBeCloseTo(7.0, 2);

      // Output level = -50 + 7 = -43 dBFS.
      const outLevel = calculateBandOutputLevelDb(testBand, -50);
      expect(outLevel).toBeCloseTo(-43.0, 2);
    });

    it('clamps output level to limiter ceiling', () => {
      const hotBand: MultibandDynamicsBand = {
        ...testBand,
        thresholdDb: -10,
        ratio: 1.0, // no compression
        makeupGainDb: 6.0,
        limiterCeilingDb: -0.5,
      };
      // In = -2 dBFS, Makeup = +6 dB => raw output = +4 dBFS.
      // Should be clamped to ceiling -0.5 dBFS.
      const outLevel = calculateBandOutputLevelDb(hotBand, -2);
      expect(outLevel).toBe(-0.5);
    });

    it('mutes output completely when band mute is enabled', () => {
      const mutedBand: MultibandDynamicsBand = {
        ...testBand,
        mute: true,
      };
      expect(calculateBandOutputLevelDb(mutedBand, -10)).toBe(-120);
    });
  });

  describe('isNeutralMultibandDynamics', () => {
    it('returns true for flat bypass preset', () => {
      expect(isNeutralMultibandDynamics(MULTIBAND_DYNAMICS_PRESETS.flat_bypass.settings)).toBe(true);
    });

    it('returns false when active compression or expansion is configured', () => {
      expect(isNeutralMultibandDynamics(DEFAULT_MULTIBAND_DYNAMICS_SETTINGS)).toBe(false);
      expect(isNeutralMultibandDynamics(MULTIBAND_DYNAMICS_PRESETS.broadcast_punch.settings)).toBe(false);
    });

    it('returns true for undefined or disabled settings', () => {
      expect(isNeutralMultibandDynamics(undefined)).toBe(true);
      expect(isNeutralMultibandDynamics({ ...DEFAULT_MULTIBAND_DYNAMICS_SETTINGS, enabled: false })).toBe(true);
    });
  });

  describe('generateBandDynamicsSvgPath', () => {
    it('generates valid SVG path strings for transfer curves', () => {
      const paths = generateBandDynamicsSvgPath(DEFAULT_MULTIBAND_DYNAMICS_SETTINGS.bands.highMid, 240, 120);
      expect(paths.linearPath).toContain('M 0');
      expect(paths.transferPath).toContain('M 0');
      expect(paths.fillPath).toContain('M 0');
      expect(paths.fillPath).toContain('Z');
    });
  });

  describe('generateMultibandDynamicsFiltergraph', () => {
    it('returns empty string for neutral or bypass settings', () => {
      expect(generateMultibandDynamicsFiltergraph(MULTIBAND_DYNAMICS_PRESETS.flat_bypass.settings)).toBe('');
    });

    it('generates 4-stream split and amix filtergraph for active multiband dynamics', () => {
      const filterStr = generateMultibandDynamicsFiltergraph(DEFAULT_MULTIBAND_DYNAMICS_SETTINGS);
      expect(filterStr).toContain('asplit=4');
      expect(filterStr).toContain('lowpass=');
      expect(filterStr).toContain('bandpass=');
      expect(filterStr).toContain('highpass=');
      expect(filterStr).toContain('compand=');
      expect(filterStr).toContain('amix=inputs=4');
    });
  });

  describe('presets catalog', () => {
    it('includes all studio mastering presets', () => {
      const keys = Object.keys(MULTIBAND_DYNAMICS_PRESETS);
      expect(keys).toContain('broadcast_punch');
      expect(keys).toContain('warm_analog_master');
      expect(keys).toContain('vocal_upfront_air');
      expect(keys).toContain('edm_bass_control');
      expect(keys).toContain('acoustic_clarity');
      expect(keys).toContain('flat_bypass');
    });
  });
});
