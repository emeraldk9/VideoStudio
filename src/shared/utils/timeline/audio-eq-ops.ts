/**
 * Beta S154 / Step S35 — 3-Band Parametric Audio Equalizer (EQ) Engine
 *
 * Provides:
 * 1. Studio-grade 3-band parametric EQ types (Low Shelf / Bass, Mid Peaking Bell, High Shelf / Treble).
 * 2. Logarithmic frequency response calculations across 20 Hz to 20,000 Hz.
 * 3. Studio presets (Flat, Vocal Clarity, Podcast Warmth, Bass Boost, De-Mud, Bright Air, Phone/Radio).
 * 4. SVG path generation for the real-time interactive frequency curve HUD.
 * 5. Frame-accurate FFmpeg `equalizer` filter string generation for exports.
 */

export interface AudioEqualizerBand {
  /** Gain in dB (-15 to +15 dB). 0 dB = flat. */
  gainDb: number;
  /** Center / cutoff frequency in Hz. */
  frequencyHz: number;
  /** Quality factor (bandwidth width). Standard 0.5 to 3.0, default 1.0. */
  q?: number;
}

export interface AudioEqualizerSettings {
  /** Master bypass switch. If false, audio passes through unshaped. */
  enabled: boolean;
  /** Low Shelf (Bass). Controls sub & low frequencies (e.g. 40–250 Hz). */
  low: AudioEqualizerBand;
  /** Mid Peaking Bell. Controls vocal presence & core tonal character (e.g. 250–4000 Hz). */
  mid: AudioEqualizerBand;
  /** High Shelf (Treble / Air). Controls shimmer, sibilance & clarity (e.g. 4000–16000 Hz). */
  high: AudioEqualizerBand;
}

export type AudioEqPresetId =
  | 'flat'
  | 'vocal_clarity'
  | 'podcast_warmth'
  | 'bass_boost'
  | 'de_mud'
  | 'bright_air'
  | 'phone_radio';

export const DEFAULT_AUDIO_EQ_SETTINGS: AudioEqualizerSettings = {
  enabled: true,
  low: { gainDb: 0, frequencyHz: 100 },
  mid: { gainDb: 0, frequencyHz: 1000, q: 1.0 },
  high: { gainDb: 0, frequencyHz: 8000 },
};

export const AUDIO_EQ_PRESETS: Record<
  AudioEqPresetId,
  { label: string; description: string; settings: AudioEqualizerSettings }
> = {
  flat: {
    label: 'Flat / Bypass',
    description: 'Neutral tonal balance with 0 dB adjustment across all bands.',
    settings: {
      enabled: true,
      low: { gainDb: 0, frequencyHz: 100 },
      mid: { gainDb: 0, frequencyHz: 1000, q: 1.0 },
      high: { gainDb: 0, frequencyHz: 8000 },
    },
  },
  vocal_clarity: {
    label: 'Vocal Clarity',
    description: 'Cuts low-end rumble, gently boosts speech presence and high-end air.',
    settings: {
      enabled: true,
      low: { gainDb: -3.0, frequencyHz: 100 },
      mid: { gainDb: 3.0, frequencyHz: 2500, q: 1.2 },
      high: { gainDb: 4.0, frequencyHz: 9000 },
    },
  },
  podcast_warmth: {
    label: 'Podcast Warmth',
    description: 'Enriches chest resonance and warms dialogue with subtle broadcast highs.',
    settings: {
      enabled: true,
      low: { gainDb: 2.5, frequencyHz: 120 },
      mid: { gainDb: 1.5, frequencyHz: 800, q: 1.0 },
      high: { gainDb: 2.0, frequencyHz: 7000 },
    },
  },
  bass_boost: {
    label: 'Bass Boost',
    description: 'Punchy low-frequency reinforcement for beats, trailers, and impact.',
    settings: {
      enabled: true,
      low: { gainDb: 6.0, frequencyHz: 80 },
      mid: { gainDb: -1.0, frequencyHz: 600, q: 0.8 },
      high: { gainDb: 0.5, frequencyHz: 8000 },
    },
  },
  de_mud: {
    label: 'De-Mud',
    description: 'Carves out boxy lower-mid clutter (300-400 Hz) to let dialogue breathe.',
    settings: {
      enabled: true,
      low: { gainDb: -1.5, frequencyHz: 100 },
      mid: { gainDb: -4.5, frequencyHz: 350, q: 1.4 },
      high: { gainDb: 1.5, frequencyHz: 6000 },
    },
  },
  bright_air: {
    label: 'Bright & Airy',
    description: 'Smooth high-frequency sheen for acoustic tracks and voiceover sparkle.',
    settings: {
      enabled: true,
      low: { gainDb: 0, frequencyHz: 100 },
      mid: { gainDb: 1.0, frequencyHz: 3000, q: 0.9 },
      high: { gainDb: 5.0, frequencyHz: 10000 },
    },
  },
  phone_radio: {
    label: 'Vintage Radio / Phone',
    description: 'Bandpass effect cutting lows and highs, heavily accentuating mids.',
    settings: {
      enabled: true,
      low: { gainDb: -15.0, frequencyHz: 300 },
      mid: { gainDb: 7.5, frequencyHz: 1800, q: 2.0 },
      high: { gainDb: -15.0, frequencyHz: 4000 },
    },
  },
};

/**
 * Clamps a gain value within the safe EQ range [-15 dB, +15 dB].
 */
export function clampEqGain(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 0;
  return Math.max(-15, Math.min(15, gainDb));
}

/**
 * Clamps frequency within the human audible range [20 Hz, 20,000 Hz].
 */
export function clampEqFrequency(freqHz: number): number {
  if (!Number.isFinite(freqHz)) return 1000;
  return Math.max(20, Math.min(20000, freqHz));
}

/**
 * Calculates the combined EQ gain (in dB) at a specific test frequency `f` (Hz).
 *
 * Models standard 2nd-order analog/biquad filter transfer curves:
 * - Low-shelf roll-off / boost: $g_{low} / (1 + (f/f_c)^2)$
 * - High-shelf roll-off / boost: $g_{high} \cdot (f/f_c)^2 / (1 + (f/f_c)^2)$
 * - Mid peaking bell: Gaussian-Q bell curve centered at $f_c$
 */
export function calculateEqGainAtFrequency(
  settings: AudioEqualizerSettings | undefined,
  freqHz: number,
): number {
  if (!settings || !settings.enabled) return 0;

  const f = Math.max(1, freqHz);

  // 1. Low Shelf Response
  const lowGain = clampEqGain(settings.low.gainDb);
  const lowFc = clampEqFrequency(settings.low.frequencyHz);
  const lowRatio = f / lowFc;
  const lowWeight = 1 / (1 + lowRatio * lowRatio);
  const lowContrib = lowGain * lowWeight;

  // 2. High Shelf Response
  const highGain = clampEqGain(settings.high.gainDb);
  const highFc = clampEqFrequency(settings.high.frequencyHz);
  const highRatio = f / highFc;
  const highWeight = (highRatio * highRatio) / (1 + highRatio * highRatio);
  const highContrib = highGain * highWeight;

  // 3. Mid Peaking Bell Response
  const midGain = clampEqGain(settings.mid.gainDb);
  const midFc = clampEqFrequency(settings.mid.frequencyHz);
  const midQ = Math.max(0.2, Math.min(5.0, settings.mid.q ?? 1.0));
  // Octave distance normalized by Q bandwidth
  const octDiff = Math.log2(f / midFc);
  const midWeight = 1 / (1 + Math.pow(octDiff * midQ * 1.8, 2));
  const midContrib = midGain * midWeight;

  return lowContrib + midContrib + highContrib;
}

export interface EqCurvePoint {
  frequencyHz: number;
  gainDb: number;
  x: number;
  y: number;
}

/**
 * Samples the 3-band parametric EQ frequency response curve across the audible
 * spectrum (20 Hz to 20,000 Hz) mapped into SVG geometry coordinates.
 *
 * @param settings Active EQ settings
 * @param width Width of the SVG plotting area
 * @param height Height of the SVG plotting area
 * @param numPoints Number of sample steps (default 64)
 * @param maxGainDb Y-axis bound in dB (default 15 dB)
 */
export function sampleEqCurvePoints(
  settings: AudioEqualizerSettings | undefined,
  width: number,
  height: number,
  numPoints = 64,
  maxGainDb = 15,
): { points: EqCurvePoint[]; pathData: string } {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const logSpan = maxLog - minLog;

  const points: EqCurvePoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const ratio = i / (numPoints - 1);
    const logF = minLog + ratio * logSpan;
    const freqHz = Math.min(20000, Math.max(20, Math.pow(10, logF)));
    const gainDb = calculateEqGainAtFrequency(settings, freqHz);

    const x = ratio * width;
    // Map [-maxGainDb, +maxGainDb] to [height, 0] (top is +maxGainDb, bottom is -maxGainDb)
    const normalizedY = (gainDb + maxGainDb) / (2 * maxGainDb);
    const y = height * (1 - Math.max(0, Math.min(1, normalizedY)));

    points.push({ frequencyHz: freqHz, gainDb, x, y });
  }

  const pathData = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  return { points, pathData };
}

/**
 * Builds an FFmpeg audio filter expression for the 3-band parametric EQ.
 * Emits an `equalizer` chain for each active band with non-zero gain.
 *
 * Example: `equalizer=f=100:t=s:w=1:g=-3.0,equalizer=f=2500:t=q:w=1.2:g=3.0,equalizer=f=9000:t=s:w=1:g=4.0`
 */
export function buildFfmpegEqFilter(
  settings: AudioEqualizerSettings | undefined,
): string {
  if (!settings || !settings.enabled) return '';

  const filters: string[] = [];

  const lowGain = clampEqGain(settings.low.gainDb);
  if (Math.abs(lowGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(settings.low.frequencyHz));
    filters.push(`equalizer=f=${fc}:t=s:w=1:g=${lowGain.toFixed(1)}`);
  }

  const midGain = clampEqGain(settings.mid.gainDb);
  if (Math.abs(midGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(settings.mid.frequencyHz));
    const q = (settings.mid.q ?? 1.0).toFixed(2);
    filters.push(`equalizer=f=${fc}:t=q:w=${q}:g=${midGain.toFixed(1)}`);
  }

  const highGain = clampEqGain(settings.high.gainDb);
  if (Math.abs(highGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(settings.high.frequencyHz));
    filters.push(`equalizer=f=${fc}:t=s:w=1:g=${highGain.toFixed(1)}`);
  }

  return filters.join(',');
}
