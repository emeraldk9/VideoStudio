/**
 * Stylus Tip Pressure-To-Audio Modulation & Friction Squeak Resonance Operations
 *
 * Implements physical acoustic modulation curves for stylus drawing:
 * 1. Pressure-to-pitch shift modulation (heavy pressure deepens acoustic drag pitch).
 * 2. High-frequency stick-slip friction squeak resonance on smooth whiteboard / blackboard slate.
 * 3. Multi-stage haptic impulses (touchdown sub-bass thump, drag rumble, liftoff micro-click).
 */

export interface PressureAudioSettings {
  enabled?: boolean;
  baseFreqHz?: number;
  pitchSensitivity?: number;
  squeakThresholdPressure?: number;
  squeakThresholdVelocity?: number;
  squeakBaseFreqHz?: number;
  squeakVolume?: number;
  hapticThumpVolume?: number;
  hapticRumbleGain?: number;
}

export const DEFAULT_PRESSURE_AUDIO_SETTINGS: Required<PressureAudioSettings> = {
  enabled: false,
  baseFreqHz: 800,
  pitchSensitivity: 0.35,
  squeakThresholdPressure: 0.65,
  squeakThresholdVelocity: 250,
  squeakBaseFreqHz: 2400,
  squeakVolume: 0.5,
  hapticThumpVolume: 0.6,
  hapticRumbleGain: 0.4,
};

export interface SqueakResonanceResult {
  isResonating: boolean;
  resonanceFreq: number;
  intensity: number;
  audioGain: number;
}

/**
 * Computes frequency shift caused by stylus tip downward pressure.
 * Pressure 0.5 is neutral. Higher pressure deepens pitch (lower frequency);
 * light pressure elevates pitch (higher frequency).
 */
export function computePressurePitchModulation(
  baseFreq: number,
  pressure: number,
  sensitivity: number = 0.35,
): number {
  const p = Math.max(0, Math.min(1, Number(pressure) || 0));
  const sens = Math.max(0, Math.min(1, Number(sensitivity) || 0));
  const factor = 1.0 - (p - 0.5) * sens;
  const clampedFactor = Math.max(0.2, Math.min(2.5, factor));
  return Math.round(baseFreq * clampedFactor * 100) / 100;
}

/**
 * Evaluates stick-slip surface friction squeak resonance (e.g. marker on slick melamine or chalk screech).
 */
export function detectSqueakResonance(
  pressure: number,
  velocity: number,
  settings: Partial<PressureAudioSettings> = {},
): SqueakResonanceResult {
  const cfg = { ...DEFAULT_PRESSURE_AUDIO_SETTINGS, ...settings };
  const p = Math.max(0, Math.min(1, Number(pressure) || 0));
  const v = Math.max(0, Number(velocity) || 0);

  if (!cfg.enabled || p < cfg.squeakThresholdPressure || v < cfg.squeakThresholdVelocity) {
    return {
      isResonating: false,
      resonanceFreq: 0,
      intensity: 0,
      audioGain: 0,
    };
  }

  const pRange = Math.max(0.01, 1.0 - cfg.squeakThresholdPressure);
  const pNorm = (p - cfg.squeakThresholdPressure) / pRange;
  const vNorm = (v - cfg.squeakThresholdVelocity) / Math.max(1, cfg.squeakThresholdVelocity * 2);

  const intensity = Math.max(0, Math.min(1, pNorm * 0.6 + vNorm * 0.4));
  const resonanceFreq = Math.round(
    Math.max(1000, Math.min(8000, cfg.squeakBaseFreqHz + (v / 1000) * 400 + (p - 0.5) * 300)),
  );
  const audioGain = Math.round(intensity * cfg.squeakVolume * 1000) / 1000;

  return {
    isResonating: true,
    resonanceFreq,
    intensity: Math.round(intensity * 10000) / 10000,
    audioGain,
  };
}

/**
 * Calculates audio impulse gain for discrete haptic interaction events.
 */
export function computeHapticImpulseGain(
  event: 'touchdown' | 'drag' | 'liftoff',
  pressure: number,
  velocity: number,
  settings: Partial<PressureAudioSettings> = {},
): number {
  const cfg = { ...DEFAULT_PRESSURE_AUDIO_SETTINGS, ...settings };
  if (!cfg.enabled) return 0;

  const p = Math.max(0, Math.min(1, Number(pressure) || 0));
  const v = Math.max(0, Number(velocity) || 0);

  switch (event) {
    case 'touchdown':
      // Stronger thump with firmer initial landing pressure
      return Math.round(cfg.hapticThumpVolume * (0.5 + p * 0.5) * 1000) / 1000;
    case 'liftoff':
      // Quick snap gain
      return Math.round(cfg.hapticThumpVolume * 0.6 * 1000) / 1000;
    case 'drag': {
      // Subtle continuous rumble scaled by velocity and pressure
      const normSpeed = Math.min(1.0, v / 1000);
      return Math.round(cfg.hapticRumbleGain * normSpeed * p * 1000) / 1000;
    }
  }
}
