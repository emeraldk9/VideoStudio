import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESSURE_AUDIO_SETTINGS,
  computeHapticImpulseGain,
  computePressurePitchModulation,
  detectSqueakResonance,
} from '../pressure-audio-resonance-ops';

describe('pressure-audio-resonance-ops', () => {
  it('modulates pitch based on downward tip pressure', () => {
    const baseFreq = 800;
    // Neutral pressure (0.5) should yield base frequency
    expect(computePressurePitchModulation(baseFreq, 0.5, 0.4)).toBe(800);

    // Heavy pressure (1.0) deepens pitch
    const heavy = computePressurePitchModulation(baseFreq, 1.0, 0.4);
    expect(heavy).toBeLessThan(800);
    expect(heavy).toBeCloseTo(800 * 0.8, 1);

    // Light pressure (0.0) raises pitch
    const light = computePressurePitchModulation(baseFreq, 0.0, 0.4);
    expect(light).toBeGreaterThan(800);
  });

  it('detects stick-slip squeak friction resonance only when exceeding thresholds', () => {
    const settings = {
      ...DEFAULT_PRESSURE_AUDIO_SETTINGS,
      enabled: true,
      squeakThresholdPressure: 0.7,
      squeakThresholdVelocity: 300,
      squeakBaseFreqHz: 2500,
      squeakVolume: 0.8,
    };

    // Sub-threshold pressure or velocity should not resonate
    const quiet = detectSqueakResonance(0.5, 200, settings);
    expect(quiet.isResonating).toBe(false);
    expect(quiet.intensity).toBe(0);
    expect(quiet.audioGain).toBe(0);

    // High pressure & high velocity triggers squeak resonance
    const squeak = detectSqueakResonance(0.85, 450, settings);
    expect(squeak.isResonating).toBe(true);
    expect(squeak.intensity).toBeGreaterThan(0);
    expect(squeak.resonanceFreq).toBeGreaterThanOrEqual(2500);
    expect(squeak.audioGain).toBeGreaterThan(0);
  });

  it('respects disabled state in squeak detection', () => {
    const disabledSettings = {
      ...DEFAULT_PRESSURE_AUDIO_SETTINGS,
      enabled: false,
    };
    const res = detectSqueakResonance(0.9, 500, disabledSettings);
    expect(res.isResonating).toBe(false);
    expect(res.audioGain).toBe(0);
  });

  it('computes accurate haptic impulse gain for touchdown, drag, and liftoff', () => {
    const settings = {
      ...DEFAULT_PRESSURE_AUDIO_SETTINGS,
      enabled: true,
      hapticThumpVolume: 0.6,
      hapticRumbleGain: 0.4,
    };

    const touchdown = computeHapticImpulseGain('touchdown', 0.8, 100, settings);
    expect(touchdown).toBeGreaterThan(0);
    expect(touchdown).toBeCloseTo(0.6 * (0.5 + 0.8 * 0.5), 2);

    const liftoff = computeHapticImpulseGain('liftoff', 0.1, 50, settings);
    expect(liftoff).toBeCloseTo(0.6 * 0.6, 2);

    const drag = computeHapticImpulseGain('drag', 0.5, 500, settings);
    expect(drag).toBeGreaterThan(0);
  });
});
