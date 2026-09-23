import { describe, it, expect } from 'vitest';
import {
  REVERB_SPACES,
  REVERB_PRESETS,
  DEFAULT_REVERB_SETTINGS,
  clampReverbDecay,
  clampReverbLevel,
  generateSyntheticImpulseResponse,
  buildFfmpegReverbFilter,
  type AudioReverbSettings,
} from '../audio-reverb-ops';

describe('audio-reverb-ops', () => {
  describe('REVERB_SPACES', () => {
    it('contains all 6 distinct acoustic spaces with complete metadata', () => {
      expect(REVERB_SPACES).toHaveLength(6);
      const spaces = REVERB_SPACES.map((s) => s.space);
      expect(spaces).toContain('booth');
      expect(spaces).toContain('room');
      expect(spaces).toContain('hall');
      expect(spaces).toContain('cathedral');
      expect(spaces).toContain('plate');
      expect(spaces).toContain('delay');

      for (const def of REVERB_SPACES) {
        expect(def.label).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.defaultDecay).toBeGreaterThan(0);
        expect(['studio', 'architectural', 'vintage', 'echo']).toContain(def.category);
      }
    });
  });

  describe('REVERB_PRESETS', () => {
    it('provides high quality studio presets with valid settings', () => {
      const keys = Object.keys(REVERB_PRESETS);
      expect(keys.length).toBeGreaterThanOrEqual(5);

      for (const [id, preset] of Object.entries(REVERB_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.settings.enabled).toBe(true);
        expect(preset.settings.decaySeconds).toBeGreaterThanOrEqual(0.1);
        expect(preset.settings.wetLevel).toBeGreaterThan(0);
        expect(preset.settings.wetLevel).toBeLessThanOrEqual(1);
        expect(preset.settings.dryLevel).toBeGreaterThan(0);
        expect(preset.settings.dryLevel).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Clamping utilities', () => {
    it('clampReverbDecay bounds decay time between 0.1s and 10.0s', () => {
      expect(clampReverbDecay(0)).toBe(0.1);
      expect(clampReverbDecay(-5)).toBe(0.1);
      expect(clampReverbDecay(15)).toBe(10.0);
      expect(clampReverbDecay(2.4)).toBe(2.4);
      expect(clampReverbDecay(NaN)).toBe(1.2);
    });

    it('clampReverbLevel bounds gain levels between 0.0 and 1.0', () => {
      expect(clampReverbLevel(-0.5)).toBe(0.0);
      expect(clampReverbLevel(1.5)).toBe(1.0);
      expect(clampReverbLevel(0.42)).toBe(0.42);
      expect(clampReverbLevel(NaN)).toBe(0.0);
    });
  });

  describe('generateSyntheticImpulseResponse', () => {
    it('generates two stereo Float32Array channels with correct length', () => {
      const sampleRate = 44100;
      const decaySeconds = 1.0;
      const ir = generateSyntheticImpulseResponse(sampleRate, decaySeconds, 0.4);

      expect(ir.left).toBeInstanceOf(Float32Array);
      expect(ir.right).toBeInstanceOf(Float32Array);
      expect(ir.left.length).toBe(sampleRate * decaySeconds);
      expect(ir.right.length).toBe(sampleRate * decaySeconds);
    });

    it('exhibits exponential energy decay from onset to tail', () => {
      const sampleRate = 16000;
      const decaySeconds = 1.5;
      const ir = generateSyntheticImpulseResponse(sampleRate, decaySeconds, 0.3);

      // Average energy in first 50ms
      const earlySamples = Math.round(sampleRate * 0.05);
      let earlyEnergy = 0;
      for (let i = 0; i < earlySamples; i++) {
        earlyEnergy += Math.abs(ir.left[i]) + Math.abs(ir.right[i]);
      }
      earlyEnergy /= earlySamples * 2;

      // Average energy in last 50ms of the decay tail
      const tailStart = ir.left.length - earlySamples;
      let tailEnergy = 0;
      for (let i = tailStart; i < ir.left.length; i++) {
        tailEnergy += Math.abs(ir.left[i]) + Math.abs(ir.right[i]);
      }
      tailEnergy /= earlySamples * 2;

      expect(earlyEnergy).toBeGreaterThan(tailEnergy * 10);
    });

    it('produces uncorrelated stereo channels (true spatial width)', () => {
      const ir = generateSyntheticImpulseResponse(8000, 0.5, 0.2);
      // Left and right must not be identical
      let diffCount = 0;
      for (let i = 0; i < 100; i++) {
        if (Math.abs(ir.left[i] - ir.right[i]) > 0.001) {
          diffCount++;
        }
      }
      expect(diffCount).toBeGreaterThan(90);
    });
  });

  describe('buildFfmpegReverbFilter', () => {
    it('returns empty string when disabled or wetLevel is zero', () => {
      expect(buildFfmpegReverbFilter(DEFAULT_REVERB_SETTINGS)).toBe('');

      const disabled: AudioReverbSettings = {
        ...DEFAULT_REVERB_SETTINGS,
        enabled: true,
        wetLevel: 0,
      };
      expect(buildFfmpegReverbFilter(disabled)).toBe('');
    });

    it('generates aecho multi-tap filter for acoustic room and hall spaces', () => {
      const hallSettings: AudioReverbSettings = {
        enabled: true,
        space: 'hall',
        decaySeconds: 2.5,
        preDelayMs: 25,
        wetLevel: 0.35,
        dryLevel: 0.9,
        highDamping: 0.3,
      };

      const filter = buildFfmpegReverbFilter(hallSettings);
      expect(filter).toContain('aecho=');
      expect(filter).toContain('0.90:0.35:');
      // Must contain staggered delay taps separated by |
      expect(filter).toMatch(/aecho=0\.90:0\.35:\d+\|\d+\|\d+\|\d+:/);
    });

    it('generates aecho filter with stereo delay and feedback for delay space', () => {
      const delaySettings: AudioReverbSettings = {
        enabled: true,
        space: 'delay',
        decaySeconds: 1.0,
        preDelayMs: 0,
        wetLevel: 0.4,
        dryLevel: 0.85,
        highDamping: 0.2,
        echoDelayMs: 220,
        echoFeedback: 0.5,
      };

      const filter = buildFfmpegReverbFilter(delaySettings);
      expect(filter).toContain('aecho=');
      expect(filter).toContain('0.85:0.40:');
      expect(filter).toContain('220|330:0.50|0.30');
    });
  });
});
