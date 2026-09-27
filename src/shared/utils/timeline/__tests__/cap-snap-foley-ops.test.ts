import { describe, it, expect } from 'vitest';
import {
  synthesizeCapPopSamples,
  synthesizeCapSnapSamples,
  synthesizeMagneticDockSamples,
  calculateMagneticSnapOffset,
  DEFAULT_CAP_SNAP_FOLEY_SETTINGS,
} from '../cap-snap-foley-ops';

describe('cap-snap-foley-ops', () => {
  it('DEFAULT_CAP_SNAP_FOLEY_SETTINGS has reasonable defaults', () => {
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.volume).toBe(0.75);
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.snapSharpness).toBe(0.80);
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.suctionDepth).toBe(0.65);
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.magneticSnapDistancePx).toBe(35.0);
    expect(DEFAULT_CAP_SNAP_FOLEY_SETTINGS.autoFoleyOnToolSwap).toBe(true);
  });

  describe('synthesizeCapPopSamples', () => {
    it('synthesizes valid normalized cavitation pop samples', () => {
      const sampleRate = 44100;
      const volume = 0.8;
      const suctionDepth = 0.7;
      const samples = synthesizeCapPopSamples(sampleRate, volume, suctionDepth);

      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBe(Math.floor(0.035 * sampleRate));

      // All samples bounded within [-1.0, 1.0]
      let maxAbs = 0;
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(-1.0);
        expect(samples[i]).toBeLessThanOrEqual(1.0);
        const absVal = Math.abs(samples[i]);
        if (absVal > maxAbs) maxAbs = absVal;
      }

      // Peak amplitude close to volume
      expect(maxAbs).toBeCloseTo(volume, 2);

      // Cavitation pulse decays toward tail
      const tailSum = Math.abs(samples[samples.length - 1]) + Math.abs(samples[samples.length - 2]);
      expect(tailSum).toBeLessThan(0.15);
    });
  });

  describe('synthesizeCapSnapSamples', () => {
    it('synthesizes dual-transient mechanical snap samples', () => {
      const sampleRate = 44100;
      const volume = 0.7;
      const sharpness = 0.85;
      const samples = synthesizeCapSnapSamples(sampleRate, volume, sharpness);

      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBe(Math.floor(0.045 * sampleRate));

      let maxAbs = 0;
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(-1.0);
        expect(samples[i]).toBeLessThanOrEqual(1.0);
        const absVal = Math.abs(samples[i]);
        if (absVal > maxAbs) maxAbs = absVal;
      }

      expect(maxAbs).toBeCloseTo(volume, 2);
      expect(maxAbs).toBeGreaterThan(0.5);
    });
  });

  describe('synthesizeMagneticDockSamples', () => {
    it('synthesizes dual-frequency metallic-plastic dock strike impulse', () => {
      const sampleRate = 44100;
      const volume = 0.65;
      const samples = synthesizeMagneticDockSamples(sampleRate, volume);

      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBe(Math.floor(0.040 * sampleRate));

      let maxAbs = 0;
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(-1.0);
        expect(samples[i]).toBeLessThanOrEqual(1.0);
        const absVal = Math.abs(samples[i]);
        if (absVal > maxAbs) maxAbs = absVal;
      }

      expect(maxAbs).toBeCloseTo(volume, 2);

      // Rapidly attenuates
      const tail = Math.abs(samples[samples.length - 1]);
      expect(tail).toBeLessThan(0.05);
    });
  });

  describe('calculateMagneticSnapOffset', () => {
    it('locks rigidly when within capture threshold (< 6px)', () => {
      const snap = calculateMagneticSnapOffset(3.5, 35.0);
      expect(snap.isLocked).toBe(true);
      expect(snap.pullRatio).toBe(1.0);

      const snapZero = calculateMagneticSnapOffset(0.0, 35.0);
      expect(snapZero.isLocked).toBe(true);
      expect(snapZero.pullRatio).toBe(1.0);
    });

    it('returns zero pull and unlocked beyond snap radius', () => {
      const snapFar = calculateMagneticSnapOffset(45.0, 35.0);
      expect(snapFar.isLocked).toBe(false);
      expect(snapFar.pullRatio).toBe(0.0);
    });

    it('computes non-linear pull ratio inside capture field', () => {
      const snapClose = calculateMagneticSnapOffset(10.0, 35.0);
      const snapMid = calculateMagneticSnapOffset(20.0, 35.0);

      expect(snapClose.isLocked).toBe(false);
      expect(snapMid.isLocked).toBe(false);
      expect(snapClose.pullRatio).toBeGreaterThan(snapMid.pullRatio);
      expect(snapClose.pullRatio).toBeGreaterThan(0.25);
      expect(snapClose.pullRatio).toBeLessThanOrEqual(0.95);
    });
  });
});
