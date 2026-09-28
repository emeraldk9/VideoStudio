import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPECTRAL_DUCKING_SETTINGS,
  SPECTRAL_DUCKING_PRESETS,
  calculateSpectralBandGains,
  calculateSpectralResponseCurve,
  generateSpectralDuckingFilterString,
  type SpectralDuckingSettings,
} from '../spectral-ducking-ops';

describe('spectral-ducking-ops (Milestone S189: Frequency-Selective Spectral Audio Ducking Engine)', () => {
  describe('DEFAULT_SPECTRAL_DUCKING_SETTINGS', () => {
    it('provides broadcast-calibrated defaults', () => {
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.enabled).toBe(true);
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.mode).toBe('spectral_formant');
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.thresholdDb).toBe(-28);
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.duckingDepthDb).toBe(-10);
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.lowCrossoverHz).toBe(250);
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.highCrossoverHz).toBe(4000);
      expect(DEFAULT_SPECTRAL_DUCKING_SETTINGS.lookaheadMs).toBe(20);
    });
  });

  describe('SPECTRAL_DUCKING_PRESETS', () => {
    it('defines distinct calibrated presets', () => {
      expect(SPECTRAL_DUCKING_PRESETS.transparent_speech.settings.duckingDepthDb).toBe(-9);
      expect(SPECTRAL_DUCKING_PRESETS.broadcast_podcast.settings.duckingDepthDb).toBe(-12);
      expect(SPECTRAL_DUCKING_PRESETS.subtle_acoustic.settings.duckingDepthDb).toBe(-6);
      expect(SPECTRAL_DUCKING_PRESETS.high_impact_trailer.settings.duckingDepthDb).toBe(-15);
    });
  });

  describe('calculateSpectralBandGains', () => {
    it('returns zero attenuation when dialogue is below threshold', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        thresholdDb: -24,
      };

      const result = calculateSpectralBandGains(-35, settings); // dialogue quiet (-35 dB)
      expect(result.lowGainDb).toBe(0);
      expect(result.midGainDb).toBe(0);
      expect(result.highGainDb).toBe(0);
      expect(result.midLinearMultiplier).toBe(1);
      expect(result.isDuckingActive).toBe(false);
    });

    it('attenuates ONLY speech formant mid-band in spectral_formant mode', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        mode: 'spectral_formant',
        thresholdDb: -28,
        duckingDepthDb: -12,
        ratio: 4.0,
      };

      // Dialogue active at -16 dB (12 dB above threshold)
      // Compression excess: 12 / 4 = 3 dB -> raw attenuation = -(12 - 3) = -9 dB
      const result = calculateSpectralBandGains(-16, settings);

      expect(result.lowGainDb).toBe(0); // Bass is 100% untouched
      expect(result.highGainDb).toBe(0); // High sheen is 100% untouched
      expect(result.midGainDb).toBe(-9); // Formant band is ducked by -9 dB
      expect(result.midLinearMultiplier).toBeCloseTo(0.3548, 2);
      expect(result.isDuckingActive).toBe(true);
    });

    it('attenuates all bands equally in broadband mode', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        mode: 'broadband',
        thresholdDb: -28,
        duckingDepthDb: -12,
        ratio: 4.0,
      };

      const result = calculateSpectralBandGains(-16, settings);
      expect(result.lowGainDb).toBe(-9);
      expect(result.midGainDb).toBe(-9);
      expect(result.highGainDb).toBe(-9);
      expect(result.isDuckingActive).toBe(true);
    });

    it('clamps attenuation to duckingDepthDb floor under extreme dialogue levels', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        thresholdDb: -28,
        duckingDepthDb: -10, // maximum cut is -10 dB
        ratio: 4.0,
      };

      const result = calculateSpectralBandGains(0, settings); // 0 dBFS screaming dialogue
      expect(result.midGainDb).toBe(-10); // Clamped to -10 dB floor
    });

    it('returns unity when ducking is disabled', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        enabled: false,
      };

      const result = calculateSpectralBandGains(0, settings);
      expect(result.midGainDb).toBe(0);
      expect(result.isDuckingActive).toBe(false);
    });
  });

  describe('calculateSpectralResponseCurve', () => {
    it('produces smooth frequency curve carving out speech formants', () => {
      const frequencies = [30, 80, 250, 1000, 2000, 4000, 8000, 16000];
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        mode: 'spectral_formant',
        lowCrossoverHz: 250,
        highCrossoverHz: 4000,
        duckingDepthDb: -12,
      };

      const curve = calculateSpectralResponseCurve(frequencies, -10, settings);

      const findAtten = (f: number) => curve.find((p) => p.frequencyHz === f)!.attenuationDb;

      // Sub-bass (30Hz, 80Hz) should have very little attenuation (< 1 dB)
      expect(Math.abs(findAtten(30))).toBeLessThan(1.0);
      expect(Math.abs(findAtten(80))).toBeLessThan(1.5);

      // Core formant frequencies (1000Hz, 2000Hz) should experience strong attenuation
      expect(Math.abs(findAtten(1000))).toBeGreaterThan(7.0);
      expect(Math.abs(findAtten(2000))).toBeGreaterThan(7.0);

      // High air (16000Hz) should have very little attenuation (< 1.5 dB)
      expect(Math.abs(findAtten(16000))).toBeLessThan(1.5);
    });

    it('returns flat response when inactive', () => {
      const frequencies = [100, 1000, 10000];
      const curve = calculateSpectralResponseCurve(frequencies, -40); // silence
      expect(curve.every((p) => p.attenuationDb === 0)).toBe(true);
    });
  });

  describe('generateSpectralDuckingFilterString', () => {
    it('generates 3-band crossover filtergraph for spectral_formant mode', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        mode: 'spectral_formant',
        lowCrossoverHz: 250,
        highCrossoverHz: 4000,
        thresholdDb: -28,
        duckingDepthDb: -10,
        attackMs: 20,
        releaseMs: 400,
        ratio: 4.0,
      };

      const filter = generateSpectralDuckingFilterString({
        keyLabel: 'dialogue_stem',
        targetLabel: 'bgm_bed',
        outputLabel: 'ducked_bgm',
        settings,
      });

      expect(filter).toContain('[bgm_bed]asplit=3[bed_lo][bed_mid][bed_hi]');
      expect(filter).toContain('lowpass=f=250[lo_clean]');
      expect(filter).toContain('highpass=f=4000[hi_clean]');
      expect(filter).toContain('bandpass=f=2125:width_type=h:w=3750[mid_raw]');
      expect(filter).toContain('[mid_raw][dialogue_stem]sidechaincompress');
      expect(filter).toContain('amix=inputs=3:dropout_transition=0:weights=1 1 1[ducked_bgm]');
    });

    it('generates single-pass sidechaincompress in broadband mode', () => {
      const settings: SpectralDuckingSettings = {
        ...DEFAULT_SPECTRAL_DUCKING_SETTINGS,
        mode: 'broadband',
      };

      const filter = generateSpectralDuckingFilterString({
        keyLabel: 'vox',
        targetLabel: 'music',
        outputLabel: 'out',
        settings,
      });

      expect(filter).toContain('[music][vox]sidechaincompress=');
      expect(filter).not.toContain('asplit=3');
    });

    it('returns anull bypass when ducking is disabled', () => {
      const filter = generateSpectralDuckingFilterString({
        keyLabel: 'vox',
        targetLabel: 'music',
        outputLabel: 'out',
        settings: { ...DEFAULT_SPECTRAL_DUCKING_SETTINGS, enabled: false },
      });

      expect(filter).toBe('[music]anull[out]');
    });
  });
});
