/**
 * Whiteboard Live Audio-Visual Reactive Ink Pulsing Operations.
 *
 * Implements real-time coupling between speech narration acoustics and stroke geometry:
 * 1. Ballistic 1-pole exponential audio envelope tracking with asymmetric attack/release.
 * 2. Non-linear stroke width expansion driven by speech RMS loudness.
 * 3. Vocal pitch (F0) harmonic micro-undulations along stroke edge contours.
 * 4. Plosive vocal transient onset detection and radial pigment shockwave burst rings.
 * 5. Audio-visual latency compensation (lookahead/delay offset).
 */

export interface AudioReactiveInkConfig {
  enabled: boolean;
  energyGain: number;          // 0.0 to 3.0 (default 1.2)
  energyGamma: number;         // 0.5 to 2.5 (default 1.0)
  attackMs: number;            // 1 to 50 ms (default 10)
  releaseMs: number;           // 10 to 300 ms (default 80)
  pitchRippleAmp: number;      // 0.0 to 10.0 px (default 2.0)
  pitchRefHz: number;          // 50 to 500 Hz (default 150)
  transientThreshold: number;  // 0.1 to 1.0 (default 0.45)
  transientBurstRadius: number;// 0 to 25 px (default 8.0)
  syncOffsetMs: number;        // -100 to +100 ms (default 0)
}

export type AudioReactiveInkSettings = Partial<AudioReactiveInkConfig>;

export const DEFAULT_AUDIO_REACTIVE_INK_CONFIG: AudioReactiveInkConfig = {
  enabled: false,
  energyGain: 1.2,
  energyGamma: 1.0,
  attackMs: 10.0,
  releaseMs: 80.0,
  pitchRippleAmp: 2.0,
  pitchRefHz: 150.0,
  transientThreshold: 0.45,
  transientBurstRadius: 8.0,
  syncOffsetMs: 0.0,
};

export interface ShockwaveRing {
  center: { x: number; y: number };
  radius: number;
  opacity: number;
  thickness: number;
}

export interface ModulatedStrokePoint {
  x: number;
  y: number;
  time: number;
  baseWidth: number;
  effectiveWidth: number;
  energy: number;
  pitchOffset: number;
  normal: { x: number; y: number };
  shockwaves: ShockwaveRing[];
}

/**
 * Ballistic audio envelope follower tracking dynamic vocal energy.
 * Uses 1-pole recursive exponential smoothing with asymmetric attack and release.
 */
export function followAudioEnvelope(
  samples: ArrayLike<number>,
  sampleRate: number = 44100,
  attackMs: number = 10.0,
  releaseMs: number = 80.0
): Float32Array {
  const len = samples.length;
  if (len === 0) return new Float32Array(0);

  const envelope = new Float32Array(len);
  const dt = 1.0 / Math.max(1, sampleRate);
  const tauAtt = Math.max(0.001, attackMs / 1000.0);
  const tauRel = Math.max(0.005, releaseMs / 1000.0);

  const alphaAtt = 1.0 - Math.exp(-dt / tauAtt);
  const alphaRel = 1.0 - Math.exp(-dt / tauRel);

  let currentEnv = 0.0;
  let maxVal = 0.0;

  for (let i = 0; i < len; i++) {
    const val = Math.abs(samples[i]);
    if (val > currentEnv) {
      currentEnv += alphaAtt * (val - currentEnv);
    } else {
      currentEnv += alphaRel * (val - currentEnv);
    }
    envelope[i] = currentEnv;
    if (currentEnv > maxVal) {
      maxVal = currentEnv;
    }
  }

  // Headroom normalization to [0.0, 1.0]
  if (maxVal > 1e-6) {
    const invMax = 1.0 / maxVal;
    for (let i = 0; i < len; i++) {
      const v = envelope[i] * invMax;
      envelope[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }

  return envelope;
}

/**
 * Detects vocal plosives and acoustic transient onsets via first-order differential.
 * Returns onset timestamps in seconds.
 */
export function detectTransientOnsets(
  envelope: ArrayLike<number>,
  sampleRate: number = 44100,
  threshold: number = 0.45,
  minIntervalMs: number = 60.0,
  diffWindowMs: number = 15.0
): number[] {
  const len = envelope.length;
  if (len < 2) return [];

  const windowSamples = Math.max(1, Math.floor(sampleRate * (diffWindowMs / 1000.0)));
  const minIntervalSamples = Math.floor(sampleRate * (minIntervalMs / 1000.0));

  const onsets: number[] = [];
  let lastOnsetIdx = -minIntervalSamples;

  for (let i = windowSamples; i < len; i++) {
    const diff = envelope[i] - envelope[i - windowSamples];
    if (diff >= threshold && (i - lastOnsetIdx) >= minIntervalSamples) {
      onsets.push(i / sampleRate);
      lastOnsetIdx = i;
    }
  }

  return onsets;
}

/**
 * Modulates stroke width based on vocal loudness energy envelope.
 * Applies gamma perceptual power curve and saturation ceiling.
 */
export function computeAudioReactiveWidth(
  baseWidth: number,
  energy: number,
  energyGain: number = 1.2,
  energyGamma: number = 1.0,
  maxScale: number = 3.0
): number {
  const e = Math.max(0.0, Math.min(1.0, energy));
  const gamma = Math.max(0.2, Math.min(3.0, energyGamma));
  const gammaE = Math.pow(e, gamma);
  const splay = 1.0 + Math.max(0.0, energyGain) * gammaE;
  const scaled = baseWidth * splay;
  return Math.max(1.0, Math.min(baseWidth * maxScale, scaled));
}

/**
 * Calculates harmonic micro-ripple displacement along stroke boundary from vocal pitch F0.
 */
export function computePitchRippleOffset(
  arcLength: number,
  pitchHz: number,
  refHz: number = 150.0,
  amplitude: number = 2.0,
  baseWavelength: number = 40.0,
  phase: number = 0.0
): number {
  const ref = Math.max(30.0, refHz);
  const hz = Math.max(30.0, Math.min(1000.0, pitchHz));
  const freqRatio = hz / ref;
  const effWavelength = Math.max(8.0, baseWavelength / freqRatio);

  const omega = (2.0 * Math.PI) / effWavelength;
  return amplitude * Math.sin(omega * arcLength + phase);
}

/**
 * Generates expanding concentric pigment shockwave rings around pen-tip for vocal plosive transients.
 */
export function generateTransientShockwaves(
  center: { x: number; y: number },
  burstRadius: number,
  intensity: number = 1.0,
  numRings: number = 2
): ShockwaveRing[] {
  const rings: ShockwaveRing[] = [];
  if (burstRadius <= 0.01) return rings;

  const count = Math.max(1, Math.min(5, Math.floor(numRings)));
  for (let i = 0; i < count; i++) {
    const frac = (i + 1) / count;
    const r = burstRadius * frac;
    const opacity = Math.max(0.05, Math.min(0.9, (1.0 - frac * 0.5) * intensity));
    const thick = Math.max(1.0, 2.0 - frac * 0.8);
    rings.push({
      center: { ...center },
      radius: r,
      opacity,
      thickness: thick,
    });
  }
  return rings;
}

/**
 * Transforms raw sketch stroke points into audio-modulated points
 * with dynamic width pulsing, pitch edge ripples, and plosive shockwaves.
 */
export function modulateStrokeWithAudio(
  points: Array<{ x: number; y: number; time: number }>,
  audioEnvelope: ArrayLike<number>,
  envSampleRate: number = 44100,
  config?: Partial<AudioReactiveInkConfig>,
  pitchTrack?: Array<{ time: number; pitchHz: number }>,
  baseStrokeWidth: number = 6.0
): ModulatedStrokePoint[] {
  const fullConfig: AudioReactiveInkConfig = {
    ...DEFAULT_AUDIO_REACTIVE_INK_CONFIG,
    ...config,
  };

  const len = points.length;
  if (!fullConfig.enabled || len === 0) {
    return points.map((p) => ({
      x: p.x,
      y: p.y,
      time: p.time,
      baseWidth: baseStrokeWidth,
      effectiveWidth: baseStrokeWidth,
      energy: 0.0,
      pitchOffset: 0.0,
      normal: { x: 0.0, y: 1.0 },
      shockwaves: [],
    }));
  }

  const transients = detectTransientOnsets(
    audioEnvelope,
    envSampleRate,
    fullConfig.transientThreshold
  );

  const envLen = audioEnvelope.length;
  const syncSec = fullConfig.syncOffsetMs / 1000.0;

  const getPitchAt = (t: number): number => {
    if (!pitchTrack || pitchTrack.length === 0) {
      return fullConfig.pitchRefHz;
    }
    let closestPitch = pitchTrack[0].pitchHz;
    let minDiff = Math.abs(pitchTrack[0].time - t);
    for (let i = 1; i < pitchTrack.length; i++) {
      const diff = Math.abs(pitchTrack[i].time - t);
      if (diff < minDiff) {
        minDiff = diff;
        closestPitch = pitchTrack[i].pitchHz;
      }
    }
    return closestPitch;
  };

  const result: ModulatedStrokePoint[] = [];
  let arcLength = 0.0;

  for (let i = 0; i < len; i++) {
    const pt = points[i];
    const px = pt.x;
    const py = pt.y;
    const ptTime = pt.time;

    // Arc length
    if (i > 0) {
      const prev = points[i - 1];
      arcLength += Math.hypot(px - prev.x, py - prev.y);
    }

    // Normal unit vector
    let dx = 1.0;
    let dy = 0.0;
    if (i < len - 1) {
      const nxt = points[i + 1];
      dx = nxt.x - px;
      dy = nxt.y - py;
    } else if (i > 0) {
      const prv = points[i - 1];
      dx = px - prv.x;
      dy = py - prv.y;
    }

    const length = Math.hypot(dx, dy);
    let nx = 0.0;
    let ny = 1.0;
    if (length > 1e-5) {
      nx = -dy / length;
      ny = dx / length;
    }

    // Sample audio envelope
    const sampleTime = ptTime + syncSec;
    const envIdx = Math.round(sampleTime * envSampleRate);
    const energy = (envIdx >= 0 && envIdx < envLen) ? Math.max(0, Math.min(1, audioEnvelope[envIdx])) : 0.0;

    const effWidth = computeAudioReactiveWidth(
      baseStrokeWidth,
      energy,
      fullConfig.energyGain,
      fullConfig.energyGamma
    );

    const pitchHz = getPitchAt(ptTime);
    const pitchOffset = computePitchRippleOffset(
      arcLength,
      pitchHz,
      fullConfig.pitchRefHz,
      fullConfig.pitchRippleAmp
    );

    // Shockwaves near transient onsets (+/- 15ms)
    const shockwaves: ShockwaveRing[] = [];
    if (fullConfig.transientBurstRadius > 0) {
      for (let j = 0; j < transients.length; j++) {
        if (Math.abs(sampleTime - transients[j]) <= 0.015) {
          const bursts = generateTransientShockwaves(
            { x: px, y: py },
            fullConfig.transientBurstRadius,
            Math.max(0.5, energy)
          );
          shockwaves.push(...bursts);
          break;
        }
      }
    }

    result.push({
      x: px,
      y: py,
      time: ptTime,
      baseWidth: baseStrokeWidth,
      effectiveWidth: effWidth,
      energy,
      pitchOffset,
      normal: { x: nx, y: ny },
      shockwaves,
    });
  }

  return result;
}

/**
 * Validates audio-reactive ink configuration.
 */
export function validateAudioReactiveInkConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const c = config as Partial<AudioReactiveInkConfig>;

  if (c.energyGain !== undefined && (typeof c.energyGain !== 'number' || c.energyGain < 0 || c.energyGain > 5)) {
    errors.push('energyGain must be a number between 0 and 5');
  }
  if (c.energyGamma !== undefined && (typeof c.energyGamma !== 'number' || c.energyGamma < 0.1 || c.energyGamma > 4)) {
    errors.push('energyGamma must be a number between 0.1 and 4');
  }
  if (c.attackMs !== undefined && (typeof c.attackMs !== 'number' || c.attackMs <= 0 || c.attackMs > 200)) {
    errors.push('attackMs must be between 1 and 200');
  }
  if (c.releaseMs !== undefined && (typeof c.releaseMs !== 'number' || c.releaseMs <= 0 || c.releaseMs > 1000)) {
    errors.push('releaseMs must be between 1 and 1000');
  }
  if (c.pitchRippleAmp !== undefined && (typeof c.pitchRippleAmp !== 'number' || c.pitchRippleAmp < 0 || c.pitchRippleAmp > 20)) {
    errors.push('pitchRippleAmp must be between 0 and 20');
  }
  if (c.transientThreshold !== undefined && (typeof c.transientThreshold !== 'number' || c.transientThreshold <= 0 || c.transientThreshold > 1)) {
    errors.push('transientThreshold must be between 0.01 and 1.0');
  }

  return { valid: errors.length === 0, errors };
}
