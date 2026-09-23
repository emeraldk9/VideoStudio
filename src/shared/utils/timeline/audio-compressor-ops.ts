/**
 * Pure arithmetic and geometry operations for Dynamic Range Audio Compressor & Peak Limiter.
 *
 * Implements standard analog/digital compression transfer characteristics:
 * - Linear passthrough below threshold: y = x
 * - Smooth quadratic soft-knee transition: |x - T| <= K/2
 * - Compressed slope above knee: y = T + (x - T) / R
 * - Post-compression makeup gain
 */

export interface AudioCompressorSettings {
  enabled: boolean;
  threshold: number;   // dB (-60 to 0)
  ratio: number;       // ratio (1 to 20)
  knee: number;        // dB (0 to 40)
  attack: number;      // seconds (0.001 to 1.0)
  release: number;     // seconds (0.01 to 1.0)
  makeupGain: number;  // dB (0 to 24)
}

export type CompressorPresetKey =
  | 'broadcast_voice'
  | 'gentle_master_glue'
  | 'punchy_drums_bass'
  | 'acoustic_leveler'
  | 'brickwall_peak_limiter'
  | 'bypass_flat';

export interface CompressorPreset {
  name: string;
  description: string;
  settings: AudioCompressorSettings;
}

export const COMPRESSOR_PRESETS: Record<CompressorPresetKey, CompressorPreset> = {
  bypass_flat: {
    name: 'Bypass (Flat)',
    description: 'Zero dynamics reduction, linear 1:1 passthrough',
    settings: {
      enabled: false,
      threshold: 0,
      ratio: 1,
      knee: 0,
      attack: 0.01,
      release: 0.1,
      makeupGain: 0,
    },
  },
  broadcast_voice: {
    name: 'Broadcast Voice',
    description: 'Even dialogue volume, high vocal presence & intelligibility',
    settings: {
      enabled: true,
      threshold: -18,
      ratio: 3,
      knee: 6,
      attack: 0.01,
      release: 0.12,
      makeupGain: 4,
    },
  },
  gentle_master_glue: {
    name: 'Gentle Master Glue',
    description: 'Transparent bus compression that glues mixed elements together',
    settings: {
      enabled: true,
      threshold: -12,
      ratio: 1.5,
      knee: 10,
      attack: 0.03,
      release: 0.25,
      makeupGain: 1.5,
    },
  },
  punchy_drums_bass: {
    name: 'Punchy Drums & Bass',
    description: 'Fast release with punchy transient preservation',
    settings: {
      enabled: true,
      threshold: -20,
      ratio: 4,
      knee: 4,
      attack: 0.025,
      release: 0.08,
      makeupGain: 5,
    },
  },
  acoustic_leveler: {
    name: 'Acoustic Leveler',
    description: 'Smooth and gentle leveling for acoustic guitars and ambient pads',
    settings: {
      enabled: true,
      threshold: -16,
      ratio: 2.5,
      knee: 8,
      attack: 0.02,
      release: 0.2,
      makeupGain: 3,
    },
  },
  brickwall_peak_limiter: {
    name: 'Brickwall Peak Limiter',
    description: 'Strict peak ceiling limiter to prevent digital clipping',
    settings: {
      enabled: true,
      threshold: -2,
      ratio: 20,
      knee: 0,
      attack: 0.001,
      release: 0.05,
      makeupGain: 0,
    },
  },
};

export const DEFAULT_COMPRESSOR_SETTINGS: AudioCompressorSettings = {
  enabled: true,
  threshold: -18,
  ratio: 3,
  knee: 6,
  attack: 0.01,
  release: 0.12,
  makeupGain: 3,
};

/**
 * Calculates the static output level (in dB) for a given input level (in dB).
 * Supports both hard knee (knee = 0) and soft knee (knee > 0).
 */
export function calculateCompressorOutputDb(
  inputDb: number,
  settings: AudioCompressorSettings
): number {
  if (!settings.enabled || settings.ratio <= 1) {
    return inputDb + (settings.enabled ? settings.makeupGain : 0);
  }

  const T = settings.threshold;
  const R = Math.max(1, settings.ratio);
  const K = Math.max(0, settings.knee);
  const halfK = K / 2;

  let compressedDb: number;

  if (K === 0 || inputDb < T - halfK) {
    if (inputDb <= T) {
      compressedDb = inputDb;
    } else {
      compressedDb = T + (inputDb - T) / R;
    }
  } else if (inputDb > T + halfK) {
    compressedDb = T + (inputDb - T) / R;
  } else {
    // Within soft-knee transition region: [T - halfK, T + halfK]
    // Standard quadratic interpolation formula used in digital dynamics processing:
    // y = x + (1/R - 1) * (x - T + K/2)^2 / (2 * K)
    const delta = inputDb - T + halfK;
    compressedDb = inputDb + ((1 / R - 1) * (delta * delta)) / (2 * K);
  }

  return compressedDb + settings.makeupGain;
}

/**
 * Calculates the static gain reduction (in dB) for a given input level.
 * Always returns a non-negative number representing decibels attenuated (0 = no reduction).
 */
export function calculateGainReductionDb(
  inputDb: number,
  settings: AudioCompressorSettings
): number {
  if (!settings.enabled || settings.ratio <= 1) {
    return 0;
  }
  // Theoretical uncompressed output without makeup gain
  const outputWithoutMakeup = calculateCompressorOutputDb(inputDb, {
    ...settings,
    makeupGain: 0,
  });
  return Math.max(0, inputDb - outputWithoutMakeup);
}

export interface CompressorCurvePoint {
  x: number;
  y: number;
  inputDb: number;
  outputDb: number;
}

/**
 * Samples points along the compression transfer characteristic curve to draw an SVG path.
 * Input range is mapped from minDb (-60 dB) to maxDb (0 dB).
 */
export function sampleCompressorCurvePoints(
  settings: AudioCompressorSettings,
  width: number,
  height: number,
  samples: number = 60,
  minDb: number = -60,
  maxDb: number = 0
): CompressorCurvePoint[] {
  const points: CompressorCurvePoint[] = [];
  const dbRange = maxDb - minDb;

  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const inputDb = minDb + fraction * dbRange;
    const outputDb = calculateCompressorOutputDb(inputDb, settings);

    // Map inputDb to X (left = minDb, right = maxDb)
    const x = fraction * width;

    // Map outputDb to Y (top = maxDb, bottom = minDb)
    const clampedOutput = Math.max(minDb, Math.min(maxDb, outputDb));
    const yFraction = (clampedOutput - minDb) / dbRange;
    const y = height - yFraction * height;

    points.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      inputDb: Math.round(inputDb * 10) / 10,
      outputDb: Math.round(outputDb * 10) / 10,
    });
  }

  return points;
}

/**
 * Builds an FFmpeg audio filter string for export (using `acompressor`).
 */
export function buildFfmpegCompressorFilter(settings: AudioCompressorSettings): string {
  if (!settings.enabled || settings.ratio <= 1) {
    return '';
  }

  // FFmpeg acompressor arguments:
  // threshold: level in dB (default 0.125 = -18dB)
  // ratio: (1 to 20)
  // attack: in milliseconds (0.01 to 2000)
  // release: in milliseconds (0.01 to 9000)
  // makeup: in dB (1 to 64)
  // knee: in dB (1 to 8)
  const threshold = Math.round(settings.threshold * 10) / 10;
  const ratio = Math.round(settings.ratio * 10) / 10;
  const attackMs = Math.max(1, Math.round(settings.attack * 1000));
  const releaseMs = Math.max(10, Math.round(settings.release * 1000));
  const makeupDb = Math.max(0, Math.round(settings.makeupGain * 10) / 10);
  const kneeDb = Math.max(1, Math.round(settings.knee * 10) / 10);

  return `acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=${attackMs}:release=${releaseMs}:makeup=${makeupDb}dB:knee=${kneeDb}dB`;
}
