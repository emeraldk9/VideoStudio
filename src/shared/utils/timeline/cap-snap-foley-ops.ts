/**
 * Whiteboard Marker Cap Snap & Pressure Vacuum Click Foley Acoustics Operations.
 * Procedurally synthesizes authentic physical marker handling foley sounds and magnetic dock kinematics:
 * 1. Uncap Suction Pop: Pneumatic vacuum seal release cavitation pulse (downward frequency sweep + air rush).
 * 2. Recap Snap: Dual-transient mechanical plastic click (retention lip detent impact + barrel body resonance).
 * 3. Magnetic Dock Latch: Metallic-plastic latch impulse when approaching magnetic whiteboard frame.
 * 4. Non-Linear Magnetic Kinematics: Inverse-square capture pull and dock slot snapping.
 */

export type CapEventType = 'uncap_pop' | 'recap_snap' | 'magnetic_dock';

export interface CapSnapFoleySettings {
  enabled?: boolean;
  volume?: number;                    // 0.0..1.0, default 0.75
  snapSharpness?: number;             // 0.1..1.0, default 0.80
  suctionDepth?: number;              // 0.1..1.0, default 0.65
  magneticSnapDistancePx?: number;    // 10..100, default 35.0
  autoFoleyOnToolSwap?: boolean;      // default true
}

export const DEFAULT_CAP_SNAP_FOLEY_SETTINGS: Required<CapSnapFoleySettings> = {
  enabled: true,
  volume: 0.75,
  snapSharpness: 0.80,
  suctionDepth: 0.65,
  magneticSnapDistancePx: 35.0,
  autoFoleyOnToolSwap: true,
};

/**
 * Synthesizes marker uncap vacuum suction pop (cavitation pressure pulse).
 * Returns Float32Array of normalized audio samples in [-1.0, 1.0].
 */
export function synthesizeCapPopSamples(
  sampleRate = 44100,
  volume = 0.75,
  suctionDepth = 0.65
): Float32Array {
  const durationSec = 0.035;
  const numSamples = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(numSamples);

  const fStart = 550.0 + 300.0 * suctionDepth;
  const fEnd = 180.0 + 60.0 * suctionDepth;
  const decayTau = 0.009;
  const freqDelta = fStart - fEnd;
  const attackSamples = Math.max(1, Math.floor(0.0015 * sampleRate));

  let prevNoise = 0.0;
  const alpha = 0.25;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Phase integral for downward exponential chirp
    const phi = 2.0 * Math.PI * (fEnd * t - decayTau * freqDelta * (Math.exp(-t / decayTau) - 1.0));
    const tonal = Math.sin(phi);

    let env = Math.exp(-t / 0.008);
    if (i < attackSamples) {
      env *= i / attackSamples;
    }

    // Deterministic pseudo-random noise for subtle air decompression
    const rawNoise = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2.0 - 1.0;
    const filteredNoise = alpha * rawNoise + (1.0 - alpha) * prevNoise;
    prevNoise = filteredNoise;

    out[i] = (tonal * 0.82 + filteredNoise * 0.18) * env;
  }

  // Normalize
  let peak = 1e-6;
  for (let i = 0; i < numSamples; i++) {
    const absVal = Math.abs(out[i]);
    if (absVal > peak) peak = absVal;
  }
  const normFactor = (Math.max(0.0, Math.min(1.0, volume)) / peak);
  for (let i = 0; i < numSamples; i++) {
    out[i] = Math.max(-1.0, Math.min(1.0, out[i] * normFactor));
  }

  return out;
}

/**
 * Synthesizes mechanical cap recap snap.
 * Contains dual-transient impact: primary sharp detent snap + secondary hollow barrel resonance.
 */
export function synthesizeCapSnapSamples(
  sampleRate = 44100,
  volume = 0.75,
  sharpness = 0.80
): Float32Array {
  const durationSec = 0.045;
  const numSamples = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(numSamples);

  const snapFreq = 2400.0 + 1200.0 * sharpness;
  const snapTau = 0.004 + 0.002 * (1.0 - sharpness);
  const delaySec = 0.0055;
  const delaySamples = Math.floor(delaySec * sampleRate);
  const bodyFreq = 880.0 + 200.0 * (1.0 - sharpness);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const snapEnv = Math.exp(-t / snapTau);
    const snap = Math.sin(2.0 * Math.PI * snapFreq * t) * snapEnv;

    let body = 0.0;
    if (i >= delaySamples) {
      const tDelayed = t - delaySec;
      const bodyEnv = Math.exp(-tDelayed / 0.018);
      body = Math.sin(2.0 * Math.PI * bodyFreq * tDelayed) * bodyEnv;
    }

    out[i] = snap * 0.70 + body * 0.45;
  }

  // Normalize
  let peak = 1e-6;
  for (let i = 0; i < numSamples; i++) {
    const absVal = Math.abs(out[i]);
    if (absVal > peak) peak = absVal;
  }
  const normFactor = (Math.max(0.0, Math.min(1.0, volume)) / peak);
  for (let i = 0; i < numSamples; i++) {
    out[i] = Math.max(-1.0, Math.min(1.0, out[i] * normFactor));
  }

  return out;
}

/**
 * Synthesizes metallic-plastic strike impulse for magnetic dock latching.
 */
export function synthesizeMagneticDockSamples(
  sampleRate = 44100,
  volume = 0.70
): Float32Array {
  const durationSec = 0.040;
  const numSamples = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(numSamples);

  const f1 = 1850.0;
  const f2 = 3300.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env1 = Math.exp(-t / 0.007);
    const env2 = Math.exp(-t / 0.004);
    out[i] = Math.sin(2.0 * Math.PI * f1 * t) * env1 * 0.65 +
             Math.sin(2.0 * Math.PI * f2 * t) * env2 * 0.35;
  }

  let peak = 1e-6;
  for (let i = 0; i < numSamples; i++) {
    const absVal = Math.abs(out[i]);
    if (absVal > peak) peak = absVal;
  }
  const normFactor = (Math.max(0.0, Math.min(1.0, volume)) / peak);
  for (let i = 0; i < numSamples; i++) {
    out[i] = Math.max(-1.0, Math.min(1.0, out[i] * normFactor));
  }

  return out;
}

/**
 * Calculates non-linear magnetic pull ratio and dock lock state.
 */
export function calculateMagneticSnapOffset(
  distPx: number,
  snapRadiusPx = 35.0
): { pullRatio: number; isLocked: boolean } {
  if (distPx <= 1e-4 || distPx < 6.0) {
    return { pullRatio: 1.0, isLocked: true };
  }
  if (distPx > snapRadiusPx) {
    return { pullRatio: 0.0, isLocked: false };
  }

  const normalized = distPx / snapRadiusPx;
  const pullRatio = Math.max(0.25, Math.min(0.95, 1.0 - Math.pow(normalized, 1.8)));
  return { pullRatio, isLocked: false };
}
