/**
 * S45 — Audio Noise Gate, Downward Expander & Dialogue De-Esser / De-Hummer Engine.
 *
 * Implements mathematical downward expansion, soft-knee thresholding,
 * dynamic hysteresis gating, high-frequency sibilance suppression,
 * 50Hz/60Hz AC electrical hum notch filtering, and FFmpeg filtergraph generation.
 */

export interface ClipNoiseGateSettings {
  enabled: boolean;
  /** Gate threshold in dB (-60 to 0, default -38 dB). */
  threshold: number;
  /** Downward expansion ratio (1:1 to 20:1, default 3:1; >=12 behaves as hard gate). */
  ratio: number;
  /** Maximum attenuation floor / range in dB (-80 to 0, default -24 dB). */
  rangeDb: number;
  /** Attack time in milliseconds (0.5 to 50 ms, default 5 ms). */
  attackMs: number;
  /** Hold time in milliseconds before release begins (0 to 500 ms, default 50 ms). */
  holdMs: number;
  /** Release time in milliseconds for smooth closure (10 to 1000 ms, default 150 ms). */
  releaseMs: number;
  /** Hysteresis gap in dB between open and close threshold (0 to 12 dB, default 3 dB). */
  hysteresisDb: number;
  /** Soft-knee transition width in dB (0 to 12 dB, default 4 dB). */
  kneeDb: number;
  /** Vocal de-esser toggle for high-frequency sibilance. */
  deEsserEnabled: boolean;
  /** De-esser center frequency in Hz (4000 to 9000 Hz, default 6000 Hz). */
  deEsserFreq: number;
  /** De-esser attenuation amount in dB (0 to 18 dB, default 6 dB). */
  deEsserAmount: number;
  /** AC mains electrical ground-loop hum filter mode. */
  deHummerMode: 'off' | '50hz' | '60hz';
}

export const DEFAULT_NOISE_GATE_SETTINGS: ClipNoiseGateSettings = {
  enabled: false,
  threshold: -38,
  ratio: 3.0,
  rangeDb: -24,
  attackMs: 5,
  holdMs: 50,
  releaseMs: 150,
  hysteresisDb: 3,
  kneeDb: 4,
  deEsserEnabled: false,
  deEsserFreq: 6000,
  deEsserAmount: 6,
  deHummerMode: 'off',
};

export type NoiseGatePresetKey =
  | 'voiceover_clean'
  | 'aggressive_hard_gate'
  | 'subtle_room_expander'
  | 'de_ess_dialogue'
  | 'ac_hum_removal_60hz'
  | 'ac_hum_removal_50hz';

export interface NoiseGatePresetDefinition {
  label: string;
  description: string;
  settings: Partial<ClipNoiseGateSettings>;
}

export const NOISE_GATE_PRESETS: Record<NoiseGatePresetKey, NoiseGatePresetDefinition> = {
  voiceover_clean: {
    label: 'Voiceover Clean',
    description: 'Transparent downward expansion for podcasting, commentary, and narration.',
    settings: {
      threshold: -36,
      ratio: 3.5,
      rangeDb: -26,
      attackMs: 4,
      holdMs: 60,
      releaseMs: 160,
      hysteresisDb: 3,
      kneeDb: 5,
      deHummerMode: 'off',
      deEsserEnabled: false,
    },
  },
  aggressive_hard_gate: {
    label: 'Hard Noise Gate',
    description: 'Firm cutoff for high ambient noise or mechanical keyboard chatter.',
    settings: {
      threshold: -30,
      ratio: 16.0,
      rangeDb: -60,
      attackMs: 2,
      holdMs: 30,
      releaseMs: 90,
      hysteresisDb: 4,
      kneeDb: 1,
      deHummerMode: 'off',
      deEsserEnabled: false,
    },
  },
  subtle_room_expander: {
    label: 'Subtle Room Expander',
    description: 'Gentle 2:1 downward slope preserving natural acoustic ambiance.',
    settings: {
      threshold: -44,
      ratio: 2.0,
      rangeDb: -14,
      attackMs: 8,
      holdMs: 80,
      releaseMs: 240,
      hysteresisDb: 2,
      kneeDb: 6,
      deHummerMode: 'off',
      deEsserEnabled: false,
    },
  },
  de_ess_dialogue: {
    label: 'Vocal De-Esser',
    description: 'Tames sharp sibilant "s", "sh", and "t" frequencies.',
    settings: {
      threshold: -38,
      ratio: 3.0,
      rangeDb: -20,
      attackMs: 5,
      holdMs: 50,
      releaseMs: 150,
      deEsserEnabled: true,
      deEsserFreq: 6500,
      deEsserAmount: 8,
      deHummerMode: 'off',
    },
  },
  ac_hum_removal_60hz: {
    label: '60Hz AC Hum Filter',
    description: 'Removes 60Hz and 120Hz mains ground-loop hum (US / Americas standard).',
    settings: {
      threshold: -40,
      ratio: 2.5,
      rangeDb: -18,
      deHummerMode: '60hz',
      deEsserEnabled: false,
    },
  },
  ac_hum_removal_50hz: {
    label: '50Hz AC Hum Filter',
    description: 'Removes 50Hz and 100Hz mains ground-loop hum (European / International standard).',
    settings: {
      threshold: -40,
      ratio: 2.5,
      rangeDb: -18,
      deHummerMode: '50hz',
      deEsserEnabled: false,
    },
  },
};

/**
 * Calculates instantaneous gain reduction in dB for a given input level in dB.
 *
 * @param inputDb Input signal magnitude in decibels (typically -60 to 0 dB)
 * @param settings Noise gate / downward expander settings
 * @returns Gain reduction in dB (negative value or 0 for unity gain)
 */
export function calculateGateGainReduction(
  inputDb: number,
  settings: ClipNoiseGateSettings,
): number {
  const { threshold, ratio, rangeDb, kneeDb } = settings;
  const clampedInput = Math.max(-100, Math.min(0, inputDb));
  const halfKnee = Math.max(0, kneeDb / 2);

  // Region 1: Above knee -> Full pass-through (0 dB gain reduction)
  if (clampedInput >= threshold + halfKnee) {
    return 0;
  }

  // Region 2: Below knee -> Downward expansion
  if (clampedInput <= threshold - halfKnee) {
    // Standard downward expander equation: out = T + R * (in - T)
    // Gain reduction: out - in = (R - 1) * (in - T)
    const delta = clampedInput - threshold;
    const rawReduction = (ratio - 1) * delta;
    // Clamped to attenuation floor (rangeDb is negative)
    return Math.max(rangeDb, rawReduction);
  }

  // Region 3: Inside soft knee -> Quadratic Hermite transition
  const kneeLower = threshold - halfKnee;
  const t = (clampedInput - kneeLower) / (kneeDb || 0.001); // 0 to 1
  // Full reduction at kneeLower
  const maxKneeReduction = (ratio - 1) * (kneeLower - threshold);
  const clampedMaxReduction = Math.max(rangeDb, maxKneeReduction);

  // Smooth ease curve: (1 - t)^2
  const factor = (1 - t) * (1 - t);
  return clampedMaxReduction * factor;
}

/**
 * Generates an SVG coordinate path representing the input vs output transfer function
 * of the noise gate and downward expander.
 *
 * @param settings Noise gate settings
 * @param width Canvas width in pixels
 * @param height Canvas height in pixels
 * @param minDb Minimum dB scale floor (default -60 dB)
 * @param maxDb Maximum dB scale ceiling (default 0 dB)
 */
export function sampleGateCurvePoints(
  settings: ClipNoiseGateSettings,
  width: number,
  height: number,
  minDb = -60,
  maxDb = 0,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const steps = 60;
  const dbSpan = maxDb - minDb;

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const inDb = minDb + fraction * dbSpan;
    const gainReduction = calculateGateGainReduction(inDb, settings);
    const outDb = Math.max(minDb, Math.min(maxDb, inDb + gainReduction));

    // Map inDb [-60..0] to x [0..width]
    const x = ((inDb - minDb) / dbSpan) * width;
    // Map outDb [-60..0] to y [height..0] (SVG y=0 is top)
    const y = height - ((outDb - minDb) / dbSpan) * height;

    points.push({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    });
  }

  return points;
}

/**
 * Synthesizes FFmpeg audio filtergraph arguments implementing the gate,
 * de-esser, and de-hummer filters.
 */
export function buildFfmpegGateFilter(
  settings: ClipNoiseGateSettings | undefined,
): string | null {
  if (!settings || !settings.enabled) {
    return null;
  }

  const filters: string[] = [];

  // 1. De-Hummer Notch Filters (European 50Hz or American 60Hz + 2nd harmonic)
  if (settings.deHummerMode === '50hz') {
    filters.push('equalizer=f=50:width_type=q:w=6:g=-24');
    filters.push('equalizer=f=100:width_type=q:w=6:g=-18');
  } else if (settings.deHummerMode === '60hz') {
    filters.push('equalizer=f=60:width_type=q:w=6:g=-24');
    filters.push('equalizer=f=120:width_type=q:w=6:g=-18');
  }

  // 2. Vocal De-Esser (High frequency parametric notch)
  if (settings.deEsserEnabled && settings.deEsserAmount > 0) {
    filters.push(
      `equalizer=f=${Math.round(settings.deEsserFreq)}:width_type=q:w=2.5:g=-${settings.deEsserAmount.toFixed(1)}`,
    );
  }

  // 3. Audio Gate / Expander (agate filter in FFmpeg)
  // agate accepts threshold in linear or dB (e.g. 0.01 or -38dB)
  // range in linear factor or dB
  const thresholdDb = Math.max(-60, Math.min(0, settings.threshold));
  const ratio = Math.max(1, Math.min(20, settings.ratio));
  const range = Math.max(-80, Math.min(0, settings.rangeDb));
  const attack = Math.max(0.5, Math.min(50, settings.attackMs));
  const release = Math.max(10, Math.min(1000, settings.releaseMs));
  const knee = Math.max(0, Math.min(12, settings.kneeDb));

  // Convert dB range to attenuation ratio
  const rangeFactor = Math.pow(10, range / 20);

  filters.push(
    `agate=threshold=${thresholdDb}dB:ratio=${ratio}:range=${rangeFactor.toFixed(4)}:attack=${attack}:release=${release}:knee=${knee}dB`,
  );

  return filters.join(',');
}
