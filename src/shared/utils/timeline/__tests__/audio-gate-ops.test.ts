import { describe, expect, it } from 'vitest';
import {
  buildFfmpegGateFilter,
  calculateGateGainReduction,
  DEFAULT_NOISE_GATE_SETTINGS,
  NOISE_GATE_PRESETS,
  sampleGateCurvePoints,
  type ClipNoiseGateSettings,
  type NoiseGatePresetKey,
} from '../audio-gate-ops';

describe('audio-gate-ops (Step S45: Audio Noise Gate & Dialogue Cleaning)', () => {
  const activeSettings: ClipNoiseGateSettings = {
    ...DEFAULT_NOISE_GATE_SETTINGS,
    enabled: true,
    threshold: -30,
    ratio: 3.0,
    rangeDb: -24,
    kneeDb: 4,
  };

  describe('calculateGateGainReduction', () => {
    it('produces 0 dB gain reduction (unity gain) above threshold', () => {
      // Threshold is -30 dB, knee is 4 dB (upper bound is -28 dB)
      expect(calculateGateGainReduction(0, activeSettings)).toBe(0);
      expect(calculateGateGainReduction(-10, activeSettings)).toBe(0);
      expect(calculateGateGainReduction(-25, activeSettings)).toBe(0);
      expect(calculateGateGainReduction(-28, activeSettings)).toBe(0);
    });

    it('attenuates downward according to ratio below the knee', () => {
      // Threshold is -30 dB, knee lower bound is -32 dB
      // At -40 dB (10 dB below threshold):
      // Delta = -40 - (-30) = -10 dB
      // Gain reduction = (ratio - 1) * delta = (3 - 1) * -10 = -20 dB
      const reduction = calculateGateGainReduction(-40, activeSettings);
      expect(reduction).toBeCloseTo(-20, 1);
    });

    it('clamps attenuation to rangeDb floor', () => {
      // At -60 dB, downward expansion would be (2) * -30 = -60 dB,
      // but rangeDb is -24 dB, so it must clamp to -24 dB.
      const reduction = calculateGateGainReduction(-60, activeSettings);
      expect(reduction).toBe(-24);
    });

    it('smoothly interpolates inside the soft knee band', () => {
      // Knee lower bound is -32 dB, upper bound is -28 dB, center is -30 dB
      const reductionAtLower = calculateGateGainReduction(-32, activeSettings);
      const reductionAtCenter = calculateGateGainReduction(-30, activeSettings);
      const reductionAtUpper = calculateGateGainReduction(-28, activeSettings);

      expect(reductionAtUpper).toBe(0);
      expect(reductionAtCenter).toBeLessThan(0);
      expect(reductionAtCenter).toBeGreaterThan(reductionAtLower);
      expect(reductionAtLower).toBeLessThan(0);
    });
  });

  describe('sampleGateCurvePoints', () => {
    it('generates expected number of SVG coordinates within bounding dimensions', () => {
      const points = sampleGateCurvePoints(activeSettings, 200, 100);
      expect(points.length).toBe(61);

      // Verify bounds
      for (const pt of points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(200);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(100);
      }

      // First point (minDb = -60 dB)
      expect(points[0].x).toBe(0);
      // Last point (maxDb = 0 dB)
      expect(points[60].x).toBe(200);
      expect(points[60].y).toBe(0); // 0 dB corresponds to top of SVG (y = 0)
    });
  });

  describe('buildFfmpegGateFilter', () => {
    it('returns null when settings are undefined or disabled', () => {
      expect(buildFfmpegGateFilter(undefined)).toBeNull();
      expect(buildFfmpegGateFilter({ ...activeSettings, enabled: false })).toBeNull();
    });

    it('generates agate filter for standard downward expander', () => {
      const filter = buildFfmpegGateFilter(activeSettings);
      expect(filter).toContain('agate=threshold=-30dB');
      expect(filter).toContain('ratio=3');
      expect(filter).toContain('attack=5');
      expect(filter).toContain('release=150');
    });

    it('appends 50Hz and 100Hz notch filters when deHummerMode is 50hz', () => {
      const settings: ClipNoiseGateSettings = {
        ...activeSettings,
        deHummerMode: '50hz',
      };
      const filter = buildFfmpegGateFilter(settings);
      expect(filter).toContain('equalizer=f=50:width_type=q:w=6:g=-24');
      expect(filter).toContain('equalizer=f=100:width_type=q:w=6:g=-18');
      expect(filter).toContain('agate=');
    });

    it('appends 60Hz and 120Hz notch filters when deHummerMode is 60hz', () => {
      const settings: ClipNoiseGateSettings = {
        ...activeSettings,
        deHummerMode: '60hz',
      };
      const filter = buildFfmpegGateFilter(settings);
      expect(filter).toContain('equalizer=f=60:width_type=q:w=6:g=-24');
      expect(filter).toContain('equalizer=f=120:width_type=q:w=6:g=-18');
      expect(filter).toContain('agate=');
    });

    it('appends vocal de-esser notch filter when deEsserEnabled is true', () => {
      const settings: ClipNoiseGateSettings = {
        ...activeSettings,
        deEsserEnabled: true,
        deEsserFreq: 6500,
        deEsserAmount: 8,
      };
      const filter = buildFfmpegGateFilter(settings);
      expect(filter).toContain('equalizer=f=6500:width_type=q:w=2.5:g=-8.0');
      expect(filter).toContain('agate=');
    });
  });

  describe('NOISE_GATE_PRESETS', () => {
    it('includes all standard broadcast presets', () => {
      const keys = Object.keys(NOISE_GATE_PRESETS) as NoiseGatePresetKey[];
      expect(keys).toContain('voiceover_clean');
      expect(keys).toContain('aggressive_hard_gate');
      expect(keys).toContain('subtle_room_expander');
      expect(keys).toContain('de_ess_dialogue');
      expect(keys).toContain('ac_hum_removal_50hz');
      expect(keys).toContain('ac_hum_removal_60hz');

      for (const key of keys) {
        const preset = NOISE_GATE_PRESETS[key];
        expect(preset.label.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
        expect(preset.settings).toBeDefined();
      }
    });
  });
});
