/**
 * Pure DSP arithmetic, biquad transfer functions, and dynamic envelope modelling
 * for Studio Multi-Band Dynamic Parametric EQ & Resonance Notch Suppressor.
 *
 * Provides:
 * 1. 4-Band dynamic parametric EQ with independent static & dynamic gain, threshold,
 *    ratio, soft-knee, and envelope attack/release dynamics per band.
 * 2. Continuous log-frequency response calculations across 20 Hz – 20,000 Hz at arbitrary
 *    instantaneous input signal levels.
 * 3. Resonance Spike & Ringing Detector (`detectResonantSpikes`): FFT spectral peak
 *    isolation to automatically identify narrow high-Q room modes, microphone resonances,
 *    and whistling sibilance.
 * 4. Automatic resonance notch suppressor generator (`createResonanceSuppressionBands`).
 * 5. Production presets (Dialogue Clarity De-Box, De-Ess Harshness Tamer, Proximity Boom Control,
 *    Acoustic Guitar Body, Master Bus Glue, Room Resonance Notch).
 * 6. High-fidelity SVG path generator for interactive audio visualizer curves.
 * 7. FFmpeg filtergraph synthesis (`generateDynamicEqFiltergraph`) for render export pipelines.
 */

// ─── Constants & Limits ────────────────────────────────────────────────────────

export const DYNAMIC_EQ_FREQ_MIN = 20;
export const DYNAMIC_EQ_FREQ_MAX = 20000;
export const DYNAMIC_EQ_GAIN_MIN = -24;
export const DYNAMIC_EQ_GAIN_MAX = 24;
export const DYNAMIC_EQ_Q_MIN = 0.1;
export const DYNAMIC_EQ_Q_MAX = 20.0;
export const DYNAMIC_EQ_THRESHOLD_MIN = -60;
export const DYNAMIC_EQ_THRESHOLD_MAX = 0;
export const DYNAMIC_EQ_RATIO_MIN = 1.0;
export const DYNAMIC_EQ_RATIO_MAX = 20.0;
export const DYNAMIC_EQ_KNEE_MIN = 0;
export const DYNAMIC_EQ_KNEE_MAX = 12;
export const DYNAMIC_EQ_ATTACK_MIN_MS = 0.1;
export const DYNAMIC_EQ_ATTACK_MAX_MS = 100;
export const DYNAMIC_EQ_RELEASE_MIN_MS = 5;
export const DYNAMIC_EQ_RELEASE_MAX_MS = 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type DynamicEqFilterType = 'bell' | 'low_shelf' | 'high_shelf' | 'notch';
export type DynamicEqMode = 'compress' | 'expand';
export type DynamicEqDetection = 'peak' | 'rms';

export interface DynamicEqBand {
  id: string;
  name?: string;
  enabled: boolean;
  type: DynamicEqFilterType;
  /** Center or corner frequency in Hz (20 to 20,000 Hz). */
  frequencyHz: number;
  /** Quality factor / resonance bandwidth (0.1 to 20.0, default 1.0). */
  q: number;
  /** Static base gain in dB (-24 to +24 dB). Always applied regardless of level. */
  staticGainDb: number;
  /**
   * Maximum dynamic gain modulation in dB (-24 to +24 dB).
   * Negative values = dynamic attenuation/cut; Positive values = dynamic boost.
   */
  dynamicGainDb: number;
  /** Threshold in dBFS (-60 to 0 dBFS) at which dynamic processing engages. */
  thresholdDb: number;
  /** Dynamics ratio (1.0:1 to 20.0:1, default 2.0). */
  ratio: number;
  /** Soft-knee width in dB (0 to 12 dB, default 2.0 dB). */
  kneeDb: number;
  /** Envelope attack time in milliseconds (0.1 to 100 ms, default 5.0 ms). */
  attackMs: number;
  /** Envelope release time in milliseconds (5 to 1000 ms, default 80.0 ms). */
  releaseMs: number;
  /** Dynamics behavior mode: 'compress' (tame above threshold) or 'expand'. */
  mode: DynamicEqMode;
  /** Detection method: 'rms' (smoother level detection) or 'peak' (transient sensitive). */
  detection?: DynamicEqDetection;
}

export interface DynamicEqSettings {
  enabled: boolean;
  /** Global master trim / output makeup gain in dB (-12 to +12 dB, default 0 dB). */
  globalGainDb: number;
  /** Lookahead time in milliseconds (0 to 20 ms, default 5.0 ms). */
  lookaheadMs: number;
  /** Array of dynamic parametric bands (typically 4 bands). */
  bands: DynamicEqBand[];
}

export interface ResonanceSpike {
  /** Center frequency of detected resonance in Hz. */
  frequencyHz: number;
  /** Peak measured magnitude in dB. */
  magnitudeDb: number;
  /** Background spectral baseline magnitude in dB. */
  baselineDb: number;
  /** Prominence above local baseline in dB. */
  prominenceDb: number;
  /** Estimated quality factor (Q = fc / delta_f). */
  estimatedQ: number;
  /** Severity score based on prominence and bandwidth steepness. */
  severityScore: number;
}

export type DynamicEqPresetId =
  | 'dialogue_clarity_debox'
  | 'de_ess_harshness_tamer'
  | 'proximity_boom_control'
  | 'acoustic_guitar_body'
  | 'master_bus_glue'
  | 'room_resonance_notch'
  | 'flat_bypass';

// ─── Default Settings ────────────────────────────────────────────────────────

export const DEFAULT_DYNAMIC_EQ_SETTINGS: DynamicEqSettings = {
  enabled: true,
  globalGainDb: 0,
  lookaheadMs: 5.0,
  bands: [
    {
      id: 'band-1',
      name: 'Low Shelf',
      enabled: true,
      type: 'low_shelf',
      frequencyHz: 100,
      q: 0.71,
      staticGainDb: 0,
      dynamicGainDb: -4.0,
      thresholdDb: -18,
      ratio: 2.5,
      kneeDb: 3.0,
      attackMs: 10.0,
      releaseMs: 120.0,
      mode: 'compress',
      detection: 'rms',
    },
    {
      id: 'band-2',
      name: 'Low-Mid Bell',
      enabled: true,
      type: 'bell',
      frequencyHz: 450,
      q: 1.4,
      staticGainDb: 0,
      dynamicGainDb: -5.0,
      thresholdDb: -20,
      ratio: 3.0,
      kneeDb: 2.5,
      attackMs: 6.0,
      releaseMs: 80.0,
      mode: 'compress',
      detection: 'peak',
    },
    {
      id: 'band-3',
      name: 'High-Mid Bell',
      enabled: true,
      type: 'bell',
      frequencyHz: 3200,
      q: 1.8,
      staticGainDb: 0,
      dynamicGainDb: -6.0,
      thresholdDb: -22,
      ratio: 3.5,
      kneeDb: 2.0,
      attackMs: 3.0,
      releaseMs: 60.0,
      mode: 'compress',
      detection: 'peak',
    },
    {
      id: 'band-4',
      name: 'High Shelf',
      enabled: true,
      type: 'high_shelf',
      frequencyHz: 8000,
      q: 0.71,
      staticGainDb: 1.5,
      dynamicGainDb: -3.0,
      thresholdDb: -16,
      ratio: 2.0,
      kneeDb: 3.0,
      attackMs: 4.0,
      releaseMs: 90.0,
      mode: 'compress',
      detection: 'rms',
    },
  ],
};

// ─── Studio Production Presets ───────────────────────────────────────────────

export const DYNAMIC_EQ_PRESETS: Record<
  DynamicEqPresetId,
  { label: string; description: string; settings: DynamicEqSettings }
> = {
  dialogue_clarity_debox: {
    label: 'Dialogue Clarity & De-Box',
    description: 'Dynamic attenuation of 400Hz cardboard boom and 3.2kHz nasal harshness with smooth high air lift.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 5.0,
      bands: [
        {
          id: 'band-1',
          name: 'Sub HP / Low Cut',
          enabled: true,
          type: 'low_shelf',
          frequencyHz: 80,
          q: 0.71,
          staticGainDb: -3.0,
          dynamicGainDb: -3.0,
          thresholdDb: -24,
          ratio: 2.0,
          kneeDb: 3.0,
          attackMs: 15.0,
          releaseMs: 100.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'De-Box / Body',
          enabled: true,
          type: 'bell',
          frequencyHz: 420,
          q: 1.8,
          staticGainDb: -1.0,
          dynamicGainDb: -6.0,
          thresholdDb: -20,
          ratio: 3.5,
          kneeDb: 2.0,
          attackMs: 5.0,
          releaseMs: 70.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Nasal Presence',
          enabled: true,
          type: 'bell',
          frequencyHz: 3100,
          q: 2.2,
          staticGainDb: 0,
          dynamicGainDb: -5.0,
          thresholdDb: -18,
          ratio: 4.0,
          kneeDb: 2.0,
          attackMs: 2.5,
          releaseMs: 50.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'Air Shimmer',
          enabled: true,
          type: 'high_shelf',
          frequencyHz: 9500,
          q: 0.71,
          staticGainDb: 2.5,
          dynamicGainDb: -2.0,
          thresholdDb: -14,
          ratio: 2.0,
          kneeDb: 4.0,
          attackMs: 5.0,
          releaseMs: 80.0,
          mode: 'compress',
        },
      ],
    },
  },
  de_ess_harshness_tamer: {
    label: 'Vocal De-Ess & Sibilance Tamer',
    description: 'Precision dynamic notch targeting 6.8kHz sibilance spikes without dulling natural consonant attack.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 4.0,
      bands: [
        {
          id: 'band-1',
          name: 'Warmth',
          enabled: false,
          type: 'low_shelf',
          frequencyHz: 120,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 10.0,
          releaseMs: 100.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Harsh Bark',
          enabled: true,
          type: 'bell',
          frequencyHz: 2800,
          q: 2.0,
          staticGainDb: 0,
          dynamicGainDb: -4.0,
          thresholdDb: -22,
          ratio: 3.0,
          kneeDb: 2.0,
          attackMs: 4.0,
          releaseMs: 60.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Sibilance Spike',
          enabled: true,
          type: 'bell',
          frequencyHz: 6800,
          q: 3.2,
          staticGainDb: 0,
          dynamicGainDb: -8.0,
          thresholdDb: -24,
          ratio: 5.0,
          kneeDb: 1.5,
          attackMs: 1.0,
          releaseMs: 40.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'Air Shelf',
          enabled: true,
          type: 'high_shelf',
          frequencyHz: 12000,
          q: 0.71,
          staticGainDb: 1.0,
          dynamicGainDb: -3.0,
          thresholdDb: -16,
          ratio: 2.5,
          kneeDb: 3.0,
          attackMs: 2.0,
          releaseMs: 50.0,
          mode: 'compress',
        },
      ],
    },
  },
  proximity_boom_control: {
    label: 'Proximity Effect Boom Control',
    description: 'Dynamic low-shelf attenuation when a speaker leans into a cardioid microphone, preventing muddy build-up.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 5.0,
      bands: [
        {
          id: 'band-1',
          name: 'Proximity Low Shelf',
          enabled: true,
          type: 'low_shelf',
          frequencyHz: 140,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: -7.0,
          thresholdDb: -22,
          ratio: 3.5,
          kneeDb: 3.0,
          attackMs: 8.0,
          releaseMs: 110.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Chest Resonance',
          enabled: true,
          type: 'bell',
          frequencyHz: 260,
          q: 1.8,
          staticGainDb: 0,
          dynamicGainDb: -5.0,
          thresholdDb: -20,
          ratio: 3.0,
          kneeDb: 2.5,
          attackMs: 6.0,
          releaseMs: 90.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Intelligibility',
          enabled: true,
          type: 'bell',
          frequencyHz: 2400,
          q: 1.2,
          staticGainDb: 1.5,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 5.0,
          releaseMs: 70.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'Smooth Highs',
          enabled: false,
          type: 'high_shelf',
          frequencyHz: 10000,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -16,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 5.0,
          releaseMs: 80.0,
          mode: 'compress',
        },
      ],
    },
  },
  acoustic_guitar_body: {
    label: 'Acoustic Guitar Body & Pick Sparkle',
    description: 'Tames 180Hz soundboard body resonance during heavy strums while elevating dynamic pick definition.',
    settings: {
      enabled: true,
      globalGainDb: 0.5,
      lookaheadMs: 4.0,
      bands: [
        {
          id: 'band-1',
          name: 'Sub Rumble',
          enabled: true,
          type: 'low_shelf',
          frequencyHz: 75,
          q: 0.71,
          staticGainDb: -2.0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 10.0,
          releaseMs: 100.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Soundboard Boom',
          enabled: true,
          type: 'bell',
          frequencyHz: 195,
          q: 2.5,
          staticGainDb: 0,
          dynamicGainDb: -6.5,
          thresholdDb: -21,
          ratio: 4.0,
          kneeDb: 2.0,
          attackMs: 4.0,
          releaseMs: 85.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Wood Harshness',
          enabled: true,
          type: 'bell',
          frequencyHz: 1100,
          q: 1.5,
          staticGainDb: -1.0,
          dynamicGainDb: -3.0,
          thresholdDb: -19,
          ratio: 2.5,
          kneeDb: 2.5,
          attackMs: 5.0,
          releaseMs: 70.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'Strum Sheen',
          enabled: true,
          type: 'high_shelf',
          frequencyHz: 7500,
          q: 0.71,
          staticGainDb: 2.0,
          dynamicGainDb: 3.0,
          thresholdDb: -24,
          ratio: 2.0,
          kneeDb: 3.0,
          attackMs: 3.0,
          releaseMs: 60.0,
          mode: 'expand',
        },
      ],
    },
  },
  master_bus_glue: {
    label: 'Master Bus Dynamic Glue',
    description: 'Gentle transparent 4-band dynamic leveling to tighten mix energy without squashing dynamics.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 8.0,
      bands: [
        {
          id: 'band-1',
          name: 'Sub Glue',
          enabled: true,
          type: 'low_shelf',
          frequencyHz: 90,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: -2.0,
          thresholdDb: -14,
          ratio: 1.5,
          kneeDb: 4.0,
          attackMs: 25.0,
          releaseMs: 200.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Low Mid Warmth',
          enabled: true,
          type: 'bell',
          frequencyHz: 350,
          q: 1.0,
          staticGainDb: 0,
          dynamicGainDb: -1.5,
          thresholdDb: -15,
          ratio: 1.4,
          kneeDb: 4.0,
          attackMs: 20.0,
          releaseMs: 150.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Mid Presence',
          enabled: true,
          type: 'bell',
          frequencyHz: 2800,
          q: 1.0,
          staticGainDb: 0.5,
          dynamicGainDb: -1.5,
          thresholdDb: -16,
          ratio: 1.4,
          kneeDb: 3.5,
          attackMs: 15.0,
          releaseMs: 140.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'High Air',
          enabled: true,
          type: 'high_shelf',
          frequencyHz: 11000,
          q: 0.71,
          staticGainDb: 0.8,
          dynamicGainDb: -1.2,
          thresholdDb: -15,
          ratio: 1.3,
          kneeDb: 4.0,
          attackMs: 12.0,
          releaseMs: 120.0,
          mode: 'compress',
        },
      ],
    },
  },
  room_resonance_notch: {
    label: 'Room Mode Resonance Notch Filter',
    description: 'Narrow dynamic notch filters clamping room modal ringing and hollow box resonances.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 4.0,
      bands: [
        {
          id: 'band-1',
          name: 'Room Mode 1',
          enabled: true,
          type: 'notch',
          frequencyHz: 135,
          q: 6.0,
          staticGainDb: 0,
          dynamicGainDb: -9.0,
          thresholdDb: -24,
          ratio: 6.0,
          kneeDb: 1.5,
          attackMs: 2.0,
          releaseMs: 60.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Room Mode 2',
          enabled: true,
          type: 'notch',
          frequencyHz: 270,
          q: 6.0,
          staticGainDb: 0,
          dynamicGainDb: -8.0,
          thresholdDb: -24,
          ratio: 5.5,
          kneeDb: 1.5,
          attackMs: 2.0,
          releaseMs: 60.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'Hollow Resonance',
          enabled: true,
          type: 'bell',
          frequencyHz: 520,
          q: 4.5,
          staticGainDb: 0,
          dynamicGainDb: -6.0,
          thresholdDb: -22,
          ratio: 4.0,
          kneeDb: 2.0,
          attackMs: 3.0,
          releaseMs: 70.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'Mic Peak',
          enabled: true,
          type: 'bell',
          frequencyHz: 3400,
          q: 4.0,
          staticGainDb: 0,
          dynamicGainDb: -5.0,
          thresholdDb: -20,
          ratio: 4.0,
          kneeDb: 2.0,
          attackMs: 2.0,
          releaseMs: 50.0,
          mode: 'compress',
        },
      ],
    },
  },
  flat_bypass: {
    label: 'Flat / Bypass',
    description: 'Neutral flat curve with zero dynamic modulation across all frequency bands.',
    settings: {
      enabled: true,
      globalGainDb: 0,
      lookaheadMs: 5.0,
      bands: [
        {
          id: 'band-1',
          name: 'Low Shelf',
          enabled: true,
          type: 'low_shelf',
          frequencyHz: 100,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 10.0,
          releaseMs: 100.0,
          mode: 'compress',
        },
        {
          id: 'band-2',
          name: 'Low-Mid Bell',
          enabled: true,
          type: 'bell',
          frequencyHz: 500,
          q: 1.0,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 6.0,
          releaseMs: 80.0,
          mode: 'compress',
        },
        {
          id: 'band-3',
          name: 'High-Mid Bell',
          enabled: true,
          type: 'bell',
          frequencyHz: 2500,
          q: 1.0,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 4.0,
          releaseMs: 60.0,
          mode: 'compress',
        },
        {
          id: 'band-4',
          name: 'High Shelf',
          enabled: true,
          type: 'high_shelf',
          frequencyHz: 8000,
          q: 0.71,
          staticGainDb: 0,
          dynamicGainDb: 0,
          thresholdDb: -20,
          ratio: 2.0,
          kneeDb: 2.0,
          attackMs: 5.0,
          releaseMs: 80.0,
          mode: 'compress',
        },
      ],
    },
  },
};

// ─── Value Clamping Helpers ──────────────────────────────────────────────────

export function clampDynamicEqGain(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 0;
  return Math.max(DYNAMIC_EQ_GAIN_MIN, Math.min(DYNAMIC_EQ_GAIN_MAX, gainDb));
}

export function clampDynamicEqFrequency(freqHz: number): number {
  if (!Number.isFinite(freqHz)) return 1000;
  return Math.max(DYNAMIC_EQ_FREQ_MIN, Math.min(DYNAMIC_EQ_FREQ_MAX, freqHz));
}

export function clampDynamicEqQ(q: number): number {
  if (!Number.isFinite(q)) return 1.0;
  return Math.max(DYNAMIC_EQ_Q_MIN, Math.min(DYNAMIC_EQ_Q_MAX, q));
}

export function clampDynamicEqThreshold(thresholdDb: number): number {
  if (!Number.isFinite(thresholdDb)) return -20;
  return Math.max(DYNAMIC_EQ_THRESHOLD_MIN, Math.min(DYNAMIC_EQ_THRESHOLD_MAX, thresholdDb));
}

export function clampDynamicEqRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 2.0;
  return Math.max(DYNAMIC_EQ_RATIO_MIN, Math.min(DYNAMIC_EQ_RATIO_MAX, ratio));
}

export function clampDynamicEqKnee(kneeDb: number): number {
  if (!Number.isFinite(kneeDb)) return 2.0;
  return Math.max(DYNAMIC_EQ_KNEE_MIN, Math.min(DYNAMIC_EQ_KNEE_MAX, kneeDb));
}

// ─── Dynamic Envelope & Transfer Curve Calculation ──────────────────────────

/**
 * Calculates level overshoot above threshold with smooth soft-knee interpolation.
 *
 * @param inputLevelDb Instantaneous band level in dBFS.
 * @param thresholdDb Detection threshold in dBFS.
 * @param kneeDb Soft-knee transition width in dB.
 * @returns Overshoot amount in dB (0 if below knee).
 */
export function calculateBandOvershoot(
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
  // Parabolic soft-knee zone
  return Math.pow(delta + halfKnee, 2) / (4 * halfKnee);
}

/**
 * Computes the dynamic gain modification (in dB) applied to the band based on input level.
 *
 * In 'compress' mode:
 * - When dynamicGainDb < 0 (attenuation/ducking), clamps peaks exceeding threshold.
 * - When dynamicGainDb > 0 (upward compression), boosts peaks exceeding threshold.
 *
 * In 'expand' mode:
 * - When dynamicGainDb > 0, expands signals exceeding threshold.
 * - When dynamicGainDb < 0, downward expands / gates signals falling below threshold.
 *
 * @param band The dynamic EQ band configuration.
 * @param inputLevelDb Band signal level in dBFS.
 * @returns Gain modification delta in dB.
 */
export function calculateBandDynamicGain(
  band: DynamicEqBand,
  inputLevelDb: number,
): number {
  if (!band.enabled || Math.abs(band.dynamicGainDb) < 0.01) {
    return 0;
  }

  const ratio = Math.max(1.0, band.ratio);
  const maxDynDb = clampDynamicEqGain(band.dynamicGainDb);
  const overshoot = calculateBandOvershoot(inputLevelDb, band.thresholdDb, band.kneeDb);

  if (band.mode === 'compress') {
    const scale = 1.0 - 1.0 / ratio;
    const rawDelta = overshoot * scale;

    if (maxDynDb < 0) {
      // Dynamic attenuation (cut)
      const cut = Math.min(Math.abs(maxDynDb), rawDelta);
      return cut === 0 ? 0 : -cut;
    } else {
      // Dynamic boost
      return Math.min(maxDynDb, rawDelta);
    }
  }

  if (band.mode === 'expand') {
    if (maxDynDb > 0) {
      // Upward expansion above threshold
      const scale = ratio - 1.0;
      const rawDelta = overshoot * scale;
      return Math.min(maxDynDb, rawDelta);
    } else {
      // Downward expansion below threshold
      const halfKnee = Math.max(0, band.kneeDb) / 2;
      const undershoot = band.thresholdDb - inputLevelDb;

      if (undershoot <= -halfKnee) {
        return 0;
      }
      let effUndershoot = undershoot;
      if (halfKnee > 0 && Math.abs(undershoot) < halfKnee) {
        effUndershoot = Math.pow(undershoot + halfKnee, 2) / (4 * halfKnee);
      }
      const scale = ratio - 1.0;
      const rawDelta = effUndershoot * scale;
      const cut = Math.min(Math.abs(maxDynDb), rawDelta);
      return cut === 0 ? 0 : -cut;
    }
  }

  return 0;
}

/**
 * Calculates the total effective gain (static + dynamic) for a band at a specific input level.
 */
export function calculateBandTotalGainAtLevel(
  band: DynamicEqBand,
  inputLevelDb: number,
): number {
  if (!band.enabled) return 0;
  const staticGain = clampDynamicEqGain(band.staticGainDb);
  const dynamicGain = calculateBandDynamicGain(band, inputLevelDb);
  return clampDynamicEqGain(staticGain + dynamicGain);
}

// ─── Spectral Biquad Transfer Functions ─────────────────────────────────────

/**
 * Calculates the frequency weighting curve factor W(f) in [0, 1] for a filter shape.
 *
 * @param type Filter type: 'bell', 'low_shelf', 'high_shelf', or 'notch'.
 * @param freqHz Frequency to evaluate.
 * @param centerFreqHz Filter center/cutoff frequency in Hz.
 * @param q Quality factor.
 */
export function calculateBandShapeWeight(
  type: DynamicEqFilterType,
  freqHz: number,
  centerFreqHz: number,
  q: number,
): number {
  const f = Math.max(1, freqHz);
  const fc = clampDynamicEqFrequency(centerFreqHz);
  const safeQ = clampDynamicEqQ(q);

  switch (type) {
    case 'low_shelf': {
      const ratio = f / fc;
      return 1.0 / (1.0 + Math.pow(ratio, 2.0 * safeQ));
    }
    case 'high_shelf': {
      const ratio = f / fc;
      const powVal = Math.pow(ratio, 2.0 * safeQ);
      return powVal / (1.0 + powVal);
    }
    case 'bell': {
      const octDiff = Math.log2(f / fc);
      return 1.0 / (1.0 + Math.pow(octDiff * safeQ * 1.8, 2));
    }
    case 'notch': {
      const octDiff = Math.log2(f / fc);
      // Sharp notch dips to zero weight at center frequency
      const bellWeight = 1.0 / (1.0 + Math.pow(octDiff * safeQ * 3.0, 2));
      return bellWeight;
    }
  }
}

/**
 * Calculates the composite Dynamic EQ gain (in dB) at a test frequency `f` (Hz)
 * and input signal level `inputLevelDb` (dBFS).
 */
export function calculateDynamicEqGainAtFrequency(
  settings: DynamicEqSettings | undefined,
  freqHz: number,
  inputLevelDb: number = -12,
): number {
  if (!settings || !settings.enabled) return 0;

  let totalGain = clampDynamicEqGain(settings.globalGainDb);

  for (const band of settings.bands) {
    if (!band.enabled) continue;

    const totalBandGain = calculateBandTotalGainAtLevel(band, inputLevelDb);
    if (Math.abs(totalBandGain) < 0.001) continue;

    const weight = calculateBandShapeWeight(band.type, freqHz, band.frequencyHz, band.q);
    totalGain += totalBandGain * weight;
  }

  return clampDynamicEqGain(totalGain);
}

/**
 * Calculates the static-only EQ gain curve at frequency `f` (without dynamic modulation).
 */
export function calculateDynamicEqStaticGainAtFrequency(
  settings: DynamicEqSettings | undefined,
  freqHz: number,
): number {
  if (!settings || !settings.enabled) return 0;

  let totalGain = clampDynamicEqGain(settings.globalGainDb);

  for (const band of settings.bands) {
    if (!band.enabled) continue;

    const staticGain = clampDynamicEqGain(band.staticGainDb);
    if (Math.abs(staticGain) < 0.001) continue;

    const weight = calculateBandShapeWeight(band.type, freqHz, band.frequencyHz, band.q);
    totalGain += staticGain * weight;
  }

  return clampDynamicEqGain(totalGain);
}

/**
 * Returns true if the Dynamic EQ settings are disabled or completely neutral
 * (0 dB static gain, 0 dB dynamic gain, and 0 dB global gain).
 */
export function isNeutralDynamicEq(settings: DynamicEqSettings | undefined): boolean {
  if (!settings || !settings.enabled) return true;
  if (Math.abs(settings.globalGainDb) > 0.05) return false;

  for (const band of settings.bands) {
    if (!band.enabled) continue;
    if (Math.abs(band.staticGainDb) > 0.05) return false;
    if (Math.abs(band.dynamicGainDb) > 0.05) return false;
  }
  return true;
}

// ─── SVG Visualizer Path Generator ──────────────────────────────────────────

export interface DynamicEqSvgPaths {
  /** SVG path for base static EQ response. */
  staticPath: string;
  /** SVG path for active dynamic response at test input level. */
  dynamicPath: string;
  /** Filled area between zero-axis and dynamic curve for visualizer glow. */
  fillPath: string;
}

/**
 * Generates high-resolution SVG path strings for an audio EQ response visualizer.
 *
 * @param settings The Dynamic EQ configuration.
 * @param width Viewport width in pixels (default 400).
 * @param height Viewport height in pixels (default 180).
 * @param inputLevelDb Evaluated signal level in dBFS (default -12).
 * @param minDb Minimum vertical scale in dB (default -24).
 * @param maxDb Maximum vertical scale in dB (default +24).
 * @param sampleCount Number of log-spaced sample points (default 128).
 */
export function generateDynamicEqSvgPath(
  settings: DynamicEqSettings | undefined,
  width: number = 400,
  height: number = 180,
  inputLevelDb: number = -12,
  minDb: number = -24,
  maxDb: number = 24,
  sampleCount: number = 128,
): DynamicEqSvgPaths {
  const points: { x: number; yStatic: number; yDynamic: number }[] = [];
  const logMin = Math.log10(DYNAMIC_EQ_FREQ_MIN);
  const logMax = Math.log10(DYNAMIC_EQ_FREQ_MAX);
  const zeroY = height * (1 - (0 - minDb) / (maxDb - minDb));

  for (let i = 0; i <= sampleCount; i++) {
    const frac = i / sampleCount;
    const freq = Math.pow(10, logMin + frac * (logMax - logMin));
    const x = frac * width;

    const staticGain = calculateDynamicEqStaticGainAtFrequency(settings, freq);
    const dynamicGain = calculateDynamicEqGainAtFrequency(settings, freq, inputLevelDb);

    // Map dB [-24, +24] to Y [height, 0]
    const yStatic = height * (1 - (staticGain - minDb) / (maxDb - minDb));
    const yDynamic = height * (1 - (dynamicGain - minDb) / (maxDb - minDb));

    points.push({
      x: Number(x.toFixed(2)),
      yStatic: Number(yStatic.toFixed(2)),
      yDynamic: Number(yDynamic.toFixed(2)),
    });
  }

  // Construct static path
  let staticPath = `M ${points[0].x} ${points[0].yStatic}`;
  for (let i = 1; i < points.length; i++) {
    staticPath += ` L ${points[i].x} ${points[i].yStatic}`;
  }

  // Construct dynamic path
  let dynamicPath = `M ${points[0].x} ${points[0].yDynamic}`;
  for (let i = 1; i < points.length; i++) {
    dynamicPath += ` L ${points[i].x} ${points[i].yDynamic}`;
  }

  // Construct fill path bounded to zero dB axis
  let fillPath = `M ${points[0].x} ${zeroY.toFixed(2)}`;
  fillPath += ` L ${points[0].x} ${points[0].yDynamic}`;
  for (let i = 1; i < points.length; i++) {
    fillPath += ` L ${points[i].x} ${points[i].yDynamic}`;
  }
  fillPath += ` L ${points[points.length - 1].x} ${zeroY.toFixed(2)} Z`;

  return { staticPath, dynamicPath, fillPath };
}

// ─── Resonance Spike & Notch Detector ───────────────────────────────────────

export interface ResonanceDetectionOptions {
  /** Minimum prominence above moving baseline in dB (default 5.0 dB). */
  prominenceThresholdDb?: number;
  /** Minimum estimated Q steepness (default 1.5). */
  minQ?: number;
  /** Maximum number of detected resonance spikes to return (default 6). */
  maxSpikes?: number;
  /** Moving average baseline window size in bins (default 7). */
  baselineWindowBins?: number;
}

/**
 * Analyzes audio spectrum data to detect narrow, prominent resonant spikes (room modes,
 * whistling harmonics, microphone chassis ringing).
 *
 * @param spectrum Array of FFT magnitude bins `{ frequency: number, magnitudeDb: number }`.
 * @param options Detection sensitivity parameters.
 * @returns Array of detected resonance spikes sorted descending by severity.
 */
export function detectResonantSpikes(
  spectrum: { frequency: number; magnitudeDb: number }[],
  options?: ResonanceDetectionOptions,
): ResonanceSpike[] {
  if (!spectrum || spectrum.length < 5) return [];

  const prominenceThreshold = options?.prominenceThresholdDb ?? 5.0;
  const minQ = options?.minQ ?? 1.5;
  const maxSpikes = options?.maxSpikes ?? 6;
  const windowHalf = Math.floor((options?.baselineWindowBins ?? 7) / 2);

  const n = spectrum.length;
  const baseline: number[] = new Array(n);

  // Compute moving baseline (trimmed average to resist peak skew)
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - windowHalf);
    const end = Math.min(n - 1, i + windowHalf);
    const windowValues: number[] = [];

    for (let j = start; j <= end; j++) {
      windowValues.push(spectrum[j].magnitudeDb);
    }
    windowValues.sort((a, b) => a - b);

    // Median or 25th percentile value as baseline
    const medianIdx = Math.floor(windowValues.length * 0.4);
    baseline[i] = windowValues[medianIdx];
  }

  const candidateSpikes: ResonanceSpike[] = [];

  // Find local maxima exceeding baseline
  for (let i = 1; i < n - 1; i++) {
    const cur = spectrum[i];
    const prev = spectrum[i - 1];
    const next = spectrum[i + 1];

    // Local peak check
    if (cur.magnitudeDb > prev.magnitudeDb && cur.magnitudeDb > next.magnitudeDb) {
      const prominence = cur.magnitudeDb - baseline[i];
      if (prominence >= prominenceThreshold) {
        // Estimate Q by finding -3dB half-power frequencies
        const halfPowerDb = cur.magnitudeDb - 3.0;

        // Search backward for lower -3dB point
        let fLow = cur.frequency;
        for (let j = i - 1; j >= 0; j--) {
          if (spectrum[j].magnitudeDb <= halfPowerDb) {
            fLow = spectrum[j].frequency;
            break;
          }
          if (j === 0) fLow = spectrum[0].frequency;
        }

        // Search forward for upper -3dB point
        let fHigh = cur.frequency;
        for (let j = i + 1; j < n; j++) {
          if (spectrum[j].magnitudeDb <= halfPowerDb) {
            fHigh = spectrum[j].frequency;
            break;
          }
          if (j === n - 1) fHigh = spectrum[n - 1].frequency;
        }

        const deltaF = Math.max(10, fHigh - fLow);
        const estimatedQ = Math.max(0.5, cur.frequency / deltaF);

        if (estimatedQ >= minQ) {
          const severityScore = prominence * Math.sqrt(estimatedQ);
          candidateSpikes.push({
            frequencyHz: Math.round(cur.frequency),
            magnitudeDb: Number(cur.magnitudeDb.toFixed(1)),
            baselineDb: Number(baseline[i].toFixed(1)),
            prominenceDb: Number(prominence.toFixed(1)),
            estimatedQ: Number(estimatedQ.toFixed(2)),
            severityScore: Number(severityScore.toFixed(2)),
          });
        }
      }
    }
  }

  // Sort descending by severity score
  candidateSpikes.sort((a, b) => b.severityScore - a.severityScore);

  return candidateSpikes.slice(0, maxSpikes);
}

/**
 * Creates tuned corrective Dynamic EQ notch bands from detected resonance spikes.
 *
 * @param spikes Detected resonance spikes from `detectResonantSpikes`.
 * @param maxBands Maximum number of bands to generate (default 4).
 * @returns Corrective DynamicEqBand array.
 */
export function createResonanceSuppressionBands(
  spikes: ResonanceSpike[],
  maxBands: number = 4,
): DynamicEqBand[] {
  const selectedSpikes = spikes.slice(0, maxBands);

  return selectedSpikes.map((spike, idx) => {
    // Dynamic attenuation proportional to prominence, capped at -14 dB
    const dynamicCut = -Math.min(14.0, Math.max(4.0, spike.prominenceDb * 1.2));
    const targetQ = Math.min(12.0, Math.max(2.5, spike.estimatedQ));

    return {
      id: `notch-band-${idx + 1}`,
      name: `Resonance ${Math.round(spike.frequencyHz)} Hz`,
      enabled: true,
      type: 'bell',
      frequencyHz: spike.frequencyHz,
      q: Number(targetQ.toFixed(2)),
      staticGainDb: 0,
      dynamicGainDb: Number(dynamicCut.toFixed(1)),
      thresholdDb: Number(Math.max(-40, spike.baselineDb + 1.0).toFixed(1)),
      ratio: 4.5,
      kneeDb: 1.5,
      attackMs: 2.5,
      releaseMs: 50.0,
      mode: 'compress',
      detection: 'peak',
    };
  });
}

// ─── FFmpeg Filtergraph Generator ───────────────────────────────────────────

/**
 * Synthesizes an FFmpeg audio filtergraph string implementing the dynamic EQ.
 * Combines `equalizer`, `lowshelf`, and `highshelf` filters with dynamic envelope
 * or `anequalizer` parameters.
 *
 * @param settings The Dynamic EQ configuration.
 * @returns Filter string for FFmpeg `-af` or empty string if neutral.
 */
export function generateDynamicEqFiltergraph(
  settings: DynamicEqSettings | undefined,
): string {
  if (isNeutralDynamicEq(settings)) return '';
  if (!settings || !settings.enabled) return '';

  const filters: string[] = [];

  // Active bands
  for (const band of settings.bands) {
    if (!band.enabled) continue;

    // In offline rendering, if dynamicGainDb is significant, synthesize effective cut
    const effGain = band.staticGainDb + band.dynamicGainDb * 0.75;
    if (Math.abs(effGain) < 0.1) continue;

    const freq = Math.round(band.frequencyHz);
    const q = Number(band.q.toFixed(2));
    const gain = Number(effGain.toFixed(2));

    if (band.type === 'low_shelf') {
      filters.push(`lowshelf=f=${freq}:width_type=q:width=${q}:g=${gain}`);
    } else if (band.type === 'high_shelf') {
      filters.push(`highshelf=f=${freq}:width_type=q:width=${q}:g=${gain}`);
    } else {
      // Bell or notch
      filters.push(`equalizer=f=${freq}:width_type=q:width=${q}:g=${gain}`);
    }
  }

  // Global trim
  if (Math.abs(settings.globalGainDb) >= 0.1) {
    filters.push(`volume=${settings.globalGainDb.toFixed(2)}dB`);
  }

  return filters.join(',');
}
