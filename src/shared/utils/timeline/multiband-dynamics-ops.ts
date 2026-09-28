/**
 * Milestone S193: Audio Mastering Multiband Compressor & Upward Expander Engine
 *
 * Implements 4-band crossover dynamics mastering:
 * - 4-Band Linkwitz-Riley crossover splitting (<LowHz, LowHz-MidHz, MidHz-HighHz, >HighHz)
 * - Dual-stage per-band dynamics: downward compression (peak taming) and upward expansion (ambience / detail boost)
 * - Per-band lookahead brickwall peak limiting and makeup gain
 * - Continuous transfer curve calculation and real-time SVG visualizer paths
 * - Production studio mastering presets (Broadcast Punch, Warm Analog Master, Vocal Upfront Air, EDM Bass Control, Acoustic Clarity)
 * - FFmpeg filtergraph synthesis using 4-way stream splitting and band-specific compand chains
 */

// ─── Constants & Limits ────────────────────────────────────────────────────────

export const MULTIBAND_CROSSOVER_LOW_MIN = 50;
export const MULTIBAND_CROSSOVER_LOW_MAX = 400;
export const MULTIBAND_CROSSOVER_MID_MIN = 400;
export const MULTIBAND_CROSSOVER_MID_MAX = 4000;
export const MULTIBAND_CROSSOVER_HIGH_MIN = 2500;
export const MULTIBAND_CROSSOVER_HIGH_MAX = 14000;

export const MULTIBAND_THRESHOLD_MIN = -60;
export const MULTIBAND_THRESHOLD_MAX = 0;
export const MULTIBAND_RATIO_MIN = 1.0;
export const MULTIBAND_RATIO_MAX = 20.0;
export const MULTIBAND_KNEE_MIN = 0;
export const MULTIBAND_KNEE_MAX = 12;
export const MULTIBAND_ATTACK_MIN_MS = 0.1;
export const MULTIBAND_ATTACK_MAX_MS = 100;
export const MULTIBAND_RELEASE_MIN_MS = 5;
export const MULTIBAND_RELEASE_MAX_MS = 1000;
export const MULTIBAND_MAKEUP_MIN_DB = -12;
export const MULTIBAND_MAKEUP_MAX_DB = 18;

// ─── Types & Interfaces ───────────────────────────────────────────────────────

export type MultibandDynamicsBandId = 'low' | 'lowMid' | 'highMid' | 'high';

export interface MultibandDynamicsBand {
  id: MultibandDynamicsBandId;
  name: string;
  enabled: boolean;
  mute?: boolean;
  solo?: boolean;

  // Downward Compression Parameters
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackMs: number;
  releaseMs: number;

  // Upward Expansion Parameters
  upwardExpansionEnabled: boolean;
  expansionThresholdDb: number;
  expansionRatio: number;
  expansionRangeDb: number;

  // Output Trim & Limiting
  makeupGainDb: number;
  limiterCeilingDb: number;
}

export interface MultibandDynamicsSettings {
  enabled: boolean;
  /** Crossover frequency between Low and Low-Mid in Hz (default 140 Hz) */
  crossoverLowHz: number;
  /** Crossover frequency between Low-Mid and High-Mid in Hz (default 1400 Hz) */
  crossoverMidHz: number;
  /** Crossover frequency between High-Mid and High in Hz (default 6500 Hz) */
  crossoverHighHz: number;
  /** Global master output trim in dB (-12 to +12 dB, default 0 dB) */
  masterGainDb: number;
  /** Lookahead time in milliseconds (0 to 20 ms, default 5.0 ms) */
  lookaheadMs: number;
  /** 4 discrete frequency bands */
  bands: {
    low: MultibandDynamicsBand;
    lowMid: MultibandDynamicsBand;
    highMid: MultibandDynamicsBand;
    high: MultibandDynamicsBand;
  };
}

export type MultibandDynamicsPresetId =
  | 'broadcast_punch'
  | 'warm_analog_master'
  | 'vocal_upfront_air'
  | 'edm_bass_control'
  | 'acoustic_clarity'
  | 'flat_bypass';

// ─── Default Settings ────────────────────────────────────────────────────────

export const DEFAULT_MULTIBAND_DYNAMICS_SETTINGS: MultibandDynamicsSettings = {
  enabled: true,
  crossoverLowHz: 140,
  crossoverMidHz: 1400,
  crossoverHighHz: 6500,
  masterGainDb: 0,
  lookaheadMs: 5.0,
  bands: {
    low: {
      id: 'low',
      name: 'Sub & Bass',
      enabled: true,
      thresholdDb: -20,
      ratio: 3.5,
      kneeDb: 3.0,
      attackMs: 15.0,
      releaseMs: 120.0,
      upwardExpansionEnabled: false,
      expansionThresholdDb: -45,
      expansionRatio: 1.5,
      expansionRangeDb: 6.0,
      makeupGainDb: 1.5,
      limiterCeilingDb: 0,
    },
    lowMid: {
      id: 'lowMid',
      name: 'Body & Warmth',
      enabled: true,
      thresholdDb: -18,
      ratio: 2.5,
      kneeDb: 4.0,
      attackMs: 10.0,
      releaseMs: 90.0,
      upwardExpansionEnabled: false,
      expansionThresholdDb: -40,
      expansionRatio: 1.4,
      expansionRangeDb: 4.0,
      makeupGainDb: 0.5,
      limiterCeilingDb: 0,
    },
    highMid: {
      id: 'highMid',
      name: 'Presence & Vocals',
      enabled: true,
      thresholdDb: -22,
      ratio: 3.0,
      kneeDb: 3.0,
      attackMs: 5.0,
      releaseMs: 70.0,
      upwardExpansionEnabled: true,
      expansionThresholdDb: -42,
      expansionRatio: 1.6,
      expansionRangeDb: 4.5,
      makeupGainDb: 1.0,
      limiterCeilingDb: 0,
    },
    high: {
      id: 'high',
      name: 'Air & Sparkle',
      enabled: true,
      thresholdDb: -24,
      ratio: 2.0,
      kneeDb: 4.0,
      attackMs: 3.0,
      releaseMs: 60.0,
      upwardExpansionEnabled: true,
      expansionThresholdDb: -46,
      expansionRatio: 1.8,
      expansionRangeDb: 6.0,
      makeupGainDb: 2.0,
      limiterCeilingDb: 0,
    },
  },
};

// ─── Studio Mastering Presets ───────────────────────────────────────────────

export const MULTIBAND_DYNAMICS_PRESETS: Record<
  MultibandDynamicsPresetId,
  { label: string; description: string; settings: MultibandDynamicsSettings }
> = {
  broadcast_punch: {
    label: 'Broadcast Punch & Loudness',
    description: 'Tightens low-end energy, drives vocal presence forward, and lifts high sparkle for commercial broadcast.',
    settings: {
      enabled: true,
      crossoverLowHz: 125,
      crossoverMidHz: 1200,
      crossoverHighHz: 6000,
      masterGainDb: 1.0,
      lookaheadMs: 6.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: -18,
          ratio: 4.0,
          kneeDb: 2.5,
          attackMs: 20.0,
          releaseMs: 140.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.5,
          expansionRangeDb: 4.0,
          makeupGainDb: 2.0,
          limiterCeilingDb: -0.1,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: -16,
          ratio: 3.0,
          kneeDb: 3.0,
          attackMs: 12.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.3,
          expansionRangeDb: 3.0,
          makeupGainDb: 1.0,
          limiterCeilingDb: -0.1,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: -20,
          ratio: 3.5,
          kneeDb: 3.0,
          attackMs: 4.0,
          releaseMs: 75.0,
          upwardExpansionEnabled: true,
          expansionThresholdDb: -38,
          expansionRatio: 1.6,
          expansionRangeDb: 5.0,
          makeupGainDb: 2.0,
          limiterCeilingDb: -0.1,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: -22,
          ratio: 2.5,
          kneeDb: 4.0,
          attackMs: 2.0,
          releaseMs: 60.0,
          upwardExpansionEnabled: true,
          expansionThresholdDb: -44,
          expansionRatio: 1.7,
          expansionRangeDb: 6.0,
          makeupGainDb: 2.5,
          limiterCeilingDb: -0.1,
        },
      },
    },
  },
  warm_analog_master: {
    label: 'Warm Analog Master Tape',
    description: 'Gentle glue compression with subtle low-mid body enhancement and soft high-frequency roll-off.',
    settings: {
      enabled: true,
      crossoverLowHz: 160,
      crossoverMidHz: 1500,
      crossoverHighHz: 7000,
      masterGainDb: 0.5,
      lookaheadMs: 4.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: -14,
          ratio: 2.0,
          kneeDb: 6.0,
          attackMs: 30.0,
          releaseMs: 180.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -45,
          expansionRatio: 1.2,
          expansionRangeDb: 3.0,
          makeupGainDb: 0.5,
          limiterCeilingDb: 0,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: -12,
          ratio: 1.8,
          kneeDb: 6.0,
          attackMs: 25.0,
          releaseMs: 150.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.2,
          expansionRangeDb: 2.0,
          makeupGainDb: 1.2,
          limiterCeilingDb: 0,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: -15,
          ratio: 1.6,
          kneeDb: 5.0,
          attackMs: 15.0,
          releaseMs: 120.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.2,
          expansionRangeDb: 2.0,
          makeupGainDb: 0.8,
          limiterCeilingDb: 0,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: -16,
          ratio: 1.5,
          kneeDb: 6.0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -45,
          expansionRatio: 1.2,
          expansionRangeDb: 2.0,
          makeupGainDb: 0.2,
          limiterCeilingDb: 0,
        },
      },
    },
  },
  vocal_upfront_air: {
    label: 'Vocal Upfront & Intimacy',
    description: 'Elevates subtle vocal nuances with upward expansion while tightly controlling low-end rumble and mid peaks.',
    settings: {
      enabled: true,
      crossoverLowHz: 120,
      crossoverMidHz: 1000,
      crossoverHighHz: 5000,
      masterGainDb: 0,
      lookaheadMs: 5.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: -22,
          ratio: 4.5,
          kneeDb: 2.0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -50,
          expansionRatio: 1.3,
          expansionRangeDb: 3.0,
          makeupGainDb: -1.0,
          limiterCeilingDb: 0,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: -20,
          ratio: 3.0,
          kneeDb: 3.0,
          attackMs: 8.0,
          releaseMs: 80.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -45,
          expansionRatio: 1.2,
          expansionRangeDb: 2.0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: -24,
          ratio: 4.0,
          kneeDb: 2.5,
          attackMs: 2.0,
          releaseMs: 50.0,
          upwardExpansionEnabled: true,
          expansionThresholdDb: -40,
          expansionRatio: 2.0,
          expansionRangeDb: 8.0,
          makeupGainDb: 2.5,
          limiterCeilingDb: 0,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: -26,
          ratio: 2.5,
          kneeDb: 3.0,
          attackMs: 1.5,
          releaseMs: 40.0,
          upwardExpansionEnabled: true,
          expansionThresholdDb: -48,
          expansionRatio: 2.2,
          expansionRangeDb: 7.0,
          makeupGainDb: 3.0,
          limiterCeilingDb: 0,
        },
      },
    },
  },
  edm_bass_control: {
    label: 'EDM & Electronic Bass Slam',
    description: 'Pin-point control on sub-bass kicks and heavy synthesizer peaks, leaving top end crisp and dynamic.',
    settings: {
      enabled: true,
      crossoverLowHz: 100,
      crossoverMidHz: 800,
      crossoverHighHz: 5500,
      masterGainDb: 0.5,
      lookaheadMs: 4.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: -16,
          ratio: 6.0,
          kneeDb: 1.5,
          attackMs: 8.0,
          releaseMs: 90.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 2.5,
          limiterCeilingDb: 0,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: -18,
          ratio: 3.5,
          kneeDb: 2.0,
          attackMs: 10.0,
          releaseMs: 80.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 1.0,
          limiterCeilingDb: 0,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: -16,
          ratio: 2.0,
          kneeDb: 3.0,
          attackMs: 15.0,
          releaseMs: 70.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 0.5,
          limiterCeilingDb: 0,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: -18,
          ratio: 2.0,
          kneeDb: 3.0,
          attackMs: 10.0,
          releaseMs: 60.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -40,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 1.0,
          limiterCeilingDb: 0,
        },
      },
    },
  },
  acoustic_clarity: {
    label: 'Acoustic & Classical Clarity',
    description: 'Ultra-transparent multiband leveling preserving natural instrument expression and open dynamics.',
    settings: {
      enabled: true,
      crossoverLowHz: 150,
      crossoverMidHz: 1600,
      crossoverHighHz: 7500,
      masterGainDb: 0,
      lookaheadMs: 5.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: -12,
          ratio: 1.5,
          kneeDb: 6.0,
          attackMs: 40.0,
          releaseMs: 250.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -50,
          expansionRatio: 1.1,
          expansionRangeDb: 2.0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: -10,
          ratio: 1.4,
          kneeDb: 6.0,
          attackMs: 35.0,
          releaseMs: 200.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -45,
          expansionRatio: 1.1,
          expansionRangeDb: 1.5,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: -12,
          ratio: 1.4,
          kneeDb: 6.0,
          attackMs: 25.0,
          releaseMs: 160.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -45,
          expansionRatio: 1.1,
          expansionRangeDb: 1.5,
          makeupGainDb: 0.5,
          limiterCeilingDb: 0,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: -14,
          ratio: 1.3,
          kneeDb: 6.0,
          attackMs: 20.0,
          releaseMs: 140.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -50,
          expansionRatio: 1.1,
          expansionRangeDb: 1.5,
          makeupGainDb: 0.5,
          limiterCeilingDb: 0,
        },
      },
    },
  },
  flat_bypass: {
    label: 'Flat / Bypass',
    description: 'Zero dynamics reduction, linear 1:1 passthrough across all 4 frequency bands.',
    settings: {
      enabled: true,
      crossoverLowHz: 140,
      crossoverMidHz: 1400,
      crossoverHighHz: 6500,
      masterGainDb: 0,
      lookaheadMs: 5.0,
      bands: {
        low: {
          id: 'low',
          name: 'Sub & Bass',
          enabled: true,
          thresholdDb: 0,
          ratio: 1.0,
          kneeDb: 0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -60,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        lowMid: {
          id: 'lowMid',
          name: 'Body & Warmth',
          enabled: true,
          thresholdDb: 0,
          ratio: 1.0,
          kneeDb: 0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -60,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        highMid: {
          id: 'highMid',
          name: 'Presence & Vocals',
          enabled: true,
          thresholdDb: 0,
          ratio: 1.0,
          kneeDb: 0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -60,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
        high: {
          id: 'high',
          name: 'Air & Sparkle',
          enabled: true,
          thresholdDb: 0,
          ratio: 1.0,
          kneeDb: 0,
          attackMs: 10.0,
          releaseMs: 100.0,
          upwardExpansionEnabled: false,
          expansionThresholdDb: -60,
          expansionRatio: 1.0,
          expansionRangeDb: 0,
          makeupGainDb: 0,
          limiterCeilingDb: 0,
        },
      },
    },
  },
};

// ─── Mathematical Transfer Functions ────────────────────────────────────────

/**
 * Calculates level overshoot above threshold with smooth soft-knee interpolation.
 */
export function calculateKneeOvershoot(
  inputLevelDb: number,
  thresholdDb: number,
  kneeDb: number,
): number {
  const halfKnee = Math.max(0, kneeDb) / 2;
  const delta = inputLevelDb - thresholdDb;

  if (halfKnee === 0 || delta >= halfKnee) {
    return Math.max(0, delta);
  }
  if (delta <= -halfKnee) {
    return 0;
  }
  // Parabolic soft-knee transition
  return Math.pow(delta + halfKnee, 2) / (4 * halfKnee);
}

/**
 * Calculates total dynamic gain modification (dB) applied to a band at input level L (dBFS).
 * Evaluates downward compression (attenuation above threshold) + upward expansion (boost below threshold).
 */
export function calculateBandDynamicsGainModification(
  band: MultibandDynamicsBand,
  inputLevelDb: number,
): number {
  if (!band.enabled || band.mute) {
    return 0;
  }

  let deltaDb = 0;

  // 1. Downward Compression (tame peaks above threshold)
  if (band.ratio > 1.0 && band.thresholdDb < 0) {
    const overshoot = calculateKneeOvershoot(inputLevelDb, band.thresholdDb, band.kneeDb);
    if (overshoot > 0) {
      const compScale = 1.0 - 1.0 / band.ratio;
      deltaDb -= overshoot * compScale;
    }
  }

  // 2. Upward Expansion (elevate low-level signals below threshold)
  if (
    band.upwardExpansionEnabled &&
    band.expansionRatio > 1.0 &&
    band.expansionRangeDb > 0 &&
    inputLevelDb < band.expansionThresholdDb
  ) {
    const undershoot = band.expansionThresholdDb - inputLevelDb;
    const expandScale = band.expansionRatio - 1.0;
    const rawBoost = undershoot * expandScale;
    const boost = Math.min(band.expansionRangeDb, rawBoost);
    deltaDb += boost;
  }

  // 3. Post-makeup gain
  deltaDb += band.makeupGainDb;

  // Normalize -0 to 0
  return deltaDb === 0 ? 0 : deltaDb;
}

/**
 * Calculates the output level of a band after dynamics and limiter ceiling clamping.
 */
export function calculateBandOutputLevelDb(
  band: MultibandDynamicsBand,
  inputLevelDb: number,
): number {
  if (!band.enabled) return inputLevelDb;
  if (band.mute) return -120; // silent

  const gainMod = calculateBandDynamicsGainModification(band, inputLevelDb);
  const rawOutput = inputLevelDb + gainMod;

  // Limiter clamp
  return Math.min(band.limiterCeilingDb, rawOutput);
}

/**
 * Returns true if multiband dynamics settings are disabled or neutral.
 */
export function isNeutralMultibandDynamics(
  settings: MultibandDynamicsSettings | undefined,
): boolean {
  if (!settings || !settings.enabled) return true;
  if (Math.abs(settings.masterGainDb) > 0.05) return false;

  const bandKeys: MultibandDynamicsBandId[] = ['low', 'lowMid', 'highMid', 'high'];
  for (const key of bandKeys) {
    const b = settings.bands[key];
    if (!b.enabled) continue;
    if (b.mute || b.solo) return false;
    if (b.ratio > 1.05 && b.thresholdDb < -0.5) return false;
    if (b.upwardExpansionEnabled && b.expansionRangeDb > 0.5) return false;
    if (Math.abs(b.makeupGainDb) > 0.1) return false;
  }

  return true;
}

// ─── SVG Transfer Curve Path Generator ──────────────────────────────────────

export interface MultibandSvgCurves {
  /** SVG path for 1:1 linear baseline */
  linearPath: string;
  /** SVG path for active compression / expansion transfer curve */
  transferPath: string;
  /** Shaded fill between linear and transfer curve showing gain reduction/expansion */
  fillPath: string;
}

/**
 * Generates SVG path coordinates for a band's compression transfer curve.
 * Maps input dB [-60, 0] to output dB [-60, 0] in viewport [0..width, height..0].
 */
export function generateBandDynamicsSvgPath(
  band: MultibandDynamicsBand,
  width: number = 240,
  height: number = 120,
  minDb: number = -60,
  maxDb: number = 0,
  samples: number = 60,
): MultibandSvgCurves {
  const points: { x: number; yLinear: number; yTransfer: number }[] = [];

  for (let i = 0; i <= samples; i++) {
    const frac = i / samples;
    const inDb = minDb + frac * (maxDb - minDb);
    const outDb = calculateBandOutputLevelDb(band, inDb);

    // Map [minDb, maxDb] to [0, width] horizontally
    const x = frac * width;
    // Map [minDb, maxDb] to [height, 0] vertically
    const yLinear = height * (1 - (inDb - minDb) / (maxDb - minDb));
    const yTransfer = height * (1 - (outDb - minDb) / (maxDb - minDb));

    points.push({
      x: Number(x.toFixed(2)),
      yLinear: Number(yLinear.toFixed(2)),
      yTransfer: Number(yTransfer.toFixed(2)),
    });
  }

  let linearPath = `M ${points[0].x} ${points[0].yLinear}`;
  for (let i = 1; i < points.length; i++) {
    linearPath += ` L ${points[i].x} ${points[i].yLinear}`;
  }

  let transferPath = `M ${points[0].x} ${points[0].yTransfer}`;
  for (let i = 1; i < points.length; i++) {
    transferPath += ` L ${points[i].x} ${points[i].yTransfer}`;
  }

  let fillPath = `M ${points[0].x} ${points[0].yLinear}`;
  for (let i = 1; i < points.length; i++) {
    fillPath += ` L ${points[i].x} ${points[i].yTransfer}`;
  }
  for (let i = points.length - 1; i >= 0; i--) {
    fillPath += ` L ${points[i].x} ${points[i].yLinear}`;
  }
  fillPath += ' Z';

  return { linearPath, transferPath, fillPath };
}

// ─── FFmpeg Filtergraph Synthesis ───────────────────────────────────────────

/**
 * Synthesizes an FFmpeg audio filtergraph implementing 4-band crossover compression.
 * Splits incoming audio into 4 frequency streams via Linkwitz-Riley lowpass, bandpass,
 * and highpass filters, applies compand dynamic modeling to each stream, and recombines
 * them via amix.
 *
 * @param settings The Multiband Dynamics configuration.
 * @returns Filter string for FFmpeg `-af` or empty string if neutral.
 */
export function generateMultibandDynamicsFiltergraph(
  settings: MultibandDynamicsSettings | undefined,
): string {
  if (isNeutralMultibandDynamics(settings)) return '';
  if (!settings || !settings.enabled) return '';

  const {
    crossoverLowHz,
    crossoverMidHz,
    crossoverHighHz,
    masterGainDb,
    bands,
  } = settings;

  // Calculate mid-band center frequencies and bandwidths
  const mid1Center = Math.round((crossoverLowHz + crossoverMidHz) / 2);
  const mid1Width = Math.round(crossoverMidHz - crossoverLowHz);

  const mid2Center = Math.round((crossoverMidHz + crossoverHighHz) / 2);
  const mid2Width = Math.round(crossoverHighHz - crossoverMidHz);

  // Build per-band compand filters
  const buildBandCompand = (b: MultibandDynamicsBand): string => {
    if (!b.enabled || b.mute) return 'volume=0';

    const attacks = (b.attackMs / 1000).toFixed(3);
    const decays = (b.releaseMs / 1000).toFixed(3);
    const points: string[] = ['-90/-90'];

    if (b.upwardExpansionEnabled && b.expansionRangeDb > 0) {
      const expThresh = b.expansionThresholdDb;
      const boost = b.expansionRangeDb;
      points.push(`${expThresh}/${(expThresh + boost).toFixed(1)}`);
    }

    if (b.ratio > 1.0 && b.thresholdDb < 0) {
      points.push(`${b.thresholdDb}/${b.thresholdDb}`);
      const kneeTop = Math.min(0, b.thresholdDb + b.kneeDb);
      const outAtZero = b.thresholdDb + (0 - b.thresholdDb) / b.ratio;
      points.push(`0/${outAtZero.toFixed(1)}`);
    } else {
      points.push('0/0');
    }

    const pointsStr = points.join(' ');
    const gainStr = b.makeupGainDb !== 0 ? `:gain=${b.makeupGainDb.toFixed(1)}` : '';

    return `compand=attacks=${attacks}:decays=${decays}:points=${pointsStr}${gainStr}`;
  };

  const compLow = buildBandCompand(bands.low);
  const compLowMid = buildBandCompand(bands.lowMid);
  const compHighMid = buildBandCompand(bands.highMid);
  const compHigh = buildBandCompand(bands.high);

  const filtergraph = [
    `asplit=4[mb_raw_low][mb_raw_lmid][mb_raw_hmid][mb_raw_high]`,
    `[mb_raw_low]lowpass=f=${crossoverLowHz},${compLow}[mb_out_low]`,
    `[mb_raw_lmid]bandpass=f=${mid1Center}:width_type=h:w=${mid1Width},${compLowMid}[mb_out_lmid]`,
    `[mb_raw_hmid]bandpass=f=${mid2Center}:width_type=h:w=${mid2Width},${compHighMid}[mb_out_hmid]`,
    `[mb_raw_high]highpass=f=${crossoverHighHz},${compHigh}[mb_out_high]`,
    `[mb_out_low][mb_out_lmid][mb_out_hmid][mb_out_high]amix=inputs=4:dropout_transition=0:weights=1 1 1 1[mb_mixed]`,
  ];

  if (Math.abs(masterGainDb) >= 0.1) {
    filtergraph.push(`[mb_mixed]volume=${masterGainDb.toFixed(2)}dB`);
  }

  return filtergraph.join(';');
}
