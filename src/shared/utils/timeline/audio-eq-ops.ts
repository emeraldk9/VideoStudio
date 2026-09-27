/**
 * S166 — 4-Band Parametric Audio Equalizer (EQ) Engine
 *
 * Provides:
 * 1. Studio-grade 4-band parametric EQ types:
 *    - Low Shelf (default 80 Hz)
 *    - Low-Mid Peaking Bell (default 250 Hz, Q 1.0)
 *    - High-Mid Peaking Bell (default 2500 Hz, Q 1.0)
 *    - High Shelf (default 10 kHz)
 * 2. Logarithmic frequency response calculations across 20 Hz – 20,000 Hz.
 * 3. Studio presets (Flat, Vocal Clarity, Podcast Warmth, Bass Boost, De-Mud, Bright Air, Phone/Radio, Scooped V, Broadcast Standard).
 * 4. SVG path generation for real-time interactive frequency curve HUD.
 * 5. Per-band contribution curves for individual ghost-curve rendering.
 * 6. Frame-accurate FFmpeg `equalizer` filter string generation for exports.
 * 7. Backward-compatible with legacy 3-band `mid` field.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum EQ gain in dB (±18 dB range). */
export const EQ_GAIN_MAX = 18;

/** Minimum audible frequency in Hz. */
export const EQ_FREQ_MIN = 20;

/** Maximum audible frequency in Hz. */
export const EQ_FREQ_MAX = 20000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioEqualizerBand {
  /** Gain in dB (-18 to +18 dB). 0 dB = flat. */
  gainDb: number;
  /** Center / cutoff frequency in Hz. */
  frequencyHz: number;
  /** Quality factor (bandwidth width). Standard 0.3 to 5.0, default 1.0. */
  q?: number;
}

export interface AudioEqualizerSettings {
  /** Master bypass switch. If false, audio passes through unshaped. */
  enabled: boolean;
  /** Low Shelf (Bass). Controls sub & low frequencies (default 80 Hz). */
  low: AudioEqualizerBand;
  /** Low-Mid Peaking Bell. Controls warmth & body (default 250 Hz). */
  lowMid: AudioEqualizerBand;
  /** High-Mid Peaking Bell. Controls presence & vocal clarity (default 2500 Hz). */
  highMid: AudioEqualizerBand;
  /** High Shelf (Treble / Air). Controls shimmer, sibilance & clarity (default 10 kHz). */
  high: AudioEqualizerBand;
  /** @deprecated Legacy 3-band compat. Ignored when lowMid/highMid are present. */
  mid?: AudioEqualizerBand;
}

export type AudioEqPresetId =
  | 'flat'
  | 'vocal_clarity'
  | 'podcast_warmth'
  | 'bass_boost'
  | 'de_mud'
  | 'bright_air'
  | 'phone_radio'
  | 'scooped_v'
  | 'broadcast_standard';

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_AUDIO_EQ_SETTINGS: AudioEqualizerSettings = {
  enabled: true,
  low: { gainDb: 0, frequencyHz: 80 },
  lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
  highMid: { gainDb: 0, frequencyHz: 2500, q: 1.0 },
  high: { gainDb: 0, frequencyHz: 10000 },
};

// ─── Presets ─────────────────────────────────────────────────────────────────

export const AUDIO_EQ_PRESETS: Record<
  AudioEqPresetId,
  { label: string; description: string; settings: AudioEqualizerSettings }
> = {
  flat: {
    label: 'Flat / Bypass',
    description: 'Neutral tonal balance with 0 dB adjustment across all bands.',
    settings: {
      enabled: true,
      low: { gainDb: 0, frequencyHz: 80 },
      lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
      highMid: { gainDb: 0, frequencyHz: 2500, q: 1.0 },
      high: { gainDb: 0, frequencyHz: 10000 },
    },
  },
  vocal_clarity: {
    label: 'Vocal Clarity',
    description: 'Cuts low-end rumble, gently boosts speech presence and high-end air.',
    settings: {
      enabled: true,
      low: { gainDb: -3.0, frequencyHz: 80 },
      lowMid: { gainDb: -1.5, frequencyHz: 300, q: 1.0 },
      highMid: { gainDb: 3.5, frequencyHz: 2500, q: 1.2 },
      high: { gainDb: 4.0, frequencyHz: 9000 },
    },
  },
  podcast_warmth: {
    label: 'Podcast Warmth',
    description: 'Enriches chest resonance and warms dialogue with subtle broadcast highs.',
    settings: {
      enabled: true,
      low: { gainDb: 2.5, frequencyHz: 100 },
      lowMid: { gainDb: 2.0, frequencyHz: 200, q: 0.8 },
      highMid: { gainDb: 1.0, frequencyHz: 3000, q: 1.0 },
      high: { gainDb: 2.0, frequencyHz: 7000 },
    },
  },
  bass_boost: {
    label: 'Bass Boost',
    description: 'Punchy low-frequency reinforcement for beats, trailers, and impact.',
    settings: {
      enabled: true,
      low: { gainDb: 6.0, frequencyHz: 60 },
      lowMid: { gainDb: 2.0, frequencyHz: 150, q: 0.7 },
      highMid: { gainDb: -1.0, frequencyHz: 2000, q: 0.8 },
      high: { gainDb: 0.5, frequencyHz: 8000 },
    },
  },
  de_mud: {
    label: 'De-Mud',
    description: 'Carves out boxy lower-mid clutter (300–400 Hz) to let dialogue breathe.',
    settings: {
      enabled: true,
      low: { gainDb: -1.5, frequencyHz: 80 },
      lowMid: { gainDb: -4.5, frequencyHz: 350, q: 1.4 },
      highMid: { gainDb: 1.0, frequencyHz: 3000, q: 1.0 },
      high: { gainDb: 1.5, frequencyHz: 6000 },
    },
  },
  bright_air: {
    label: 'Bright & Airy',
    description: 'Smooth high-frequency sheen for acoustic tracks and voiceover sparkle.',
    settings: {
      enabled: true,
      low: { gainDb: 0, frequencyHz: 80 },
      lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
      highMid: { gainDb: 1.5, frequencyHz: 3000, q: 0.9 },
      high: { gainDb: 5.0, frequencyHz: 10000 },
    },
  },
  phone_radio: {
    label: 'Vintage Radio / Phone',
    description: 'Bandpass effect cutting lows and highs, heavily accentuating mids.',
    settings: {
      enabled: true,
      low: { gainDb: -15.0, frequencyHz: 300 },
      lowMid: { gainDb: 4.0, frequencyHz: 800, q: 1.5 },
      highMid: { gainDb: 7.5, frequencyHz: 1800, q: 2.0 },
      high: { gainDb: -15.0, frequencyHz: 4000 },
    },
  },
  scooped_v: {
    label: 'Scooped V',
    description: 'V-shaped EQ for electronic music: boosted lows & highs, scooped mids.',
    settings: {
      enabled: true,
      low: { gainDb: 5.0, frequencyHz: 60 },
      lowMid: { gainDb: -3.0, frequencyHz: 400, q: 1.0 },
      highMid: { gainDb: -2.5, frequencyHz: 2000, q: 1.0 },
      high: { gainDb: 5.5, frequencyHz: 12000 },
    },
  },
  broadcast_standard: {
    label: 'Broadcast (EBU)',
    description: 'EBU R128 broadcast presence curve with gentle voice lift and controlled lows.',
    settings: {
      enabled: true,
      low: { gainDb: -2.0, frequencyHz: 80 },
      lowMid: { gainDb: 0.5, frequencyHz: 250, q: 0.8 },
      highMid: { gainDb: 2.0, frequencyHz: 3500, q: 1.2 },
      high: { gainDb: 1.0, frequencyHz: 10000 },
    },
  },
};

// ─── Clamping ────────────────────────────────────────────────────────────────

/**
 * Clamps a gain value within the safe EQ range [-18 dB, +18 dB].
 */
export function clampEqGain(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 0;
  return Math.max(-EQ_GAIN_MAX, Math.min(EQ_GAIN_MAX, gainDb));
}

/**
 * Clamps frequency within the human audible range [20 Hz, 20,000 Hz].
 */
export function clampEqFrequency(freqHz: number): number {
  if (!Number.isFinite(freqHz)) return 1000;
  return Math.max(EQ_FREQ_MIN, Math.min(EQ_FREQ_MAX, freqHz));
}

// ─── Backward Compatibility ──────────────────────────────────────────────────

/**
 * Resolves an `AudioEqualizerSettings` into a canonical 4-band object.
 * Handles legacy 3-band settings that only have `mid` (no `lowMid` / `highMid`)
 * by mapping `mid` → `highMid` and providing a default `lowMid`.
 */
export function resolveEqBands(settings: AudioEqualizerSettings): {
  low: AudioEqualizerBand;
  lowMid: AudioEqualizerBand;
  highMid: AudioEqualizerBand;
  high: AudioEqualizerBand;
} {
  // If lowMid and highMid are present, use them directly
  if (settings.lowMid && settings.highMid) {
    return {
      low: settings.low,
      lowMid: settings.lowMid,
      highMid: settings.highMid,
      high: settings.high,
    };
  }

  // Legacy 3-band: map mid → highMid, use default lowMid
  if (settings.mid) {
    return {
      low: settings.low,
      lowMid: { gainDb: 0, frequencyHz: 250, q: 1.0 },
      highMid: settings.mid,
      high: settings.high,
    };
  }

  // Fallback: all flat
  return {
    low: settings.low,
    lowMid: settings.lowMid ?? { gainDb: 0, frequencyHz: 250, q: 1.0 },
    highMid: settings.highMid ?? { gainDb: 0, frequencyHz: 2500, q: 1.0 },
    high: settings.high,
  };
}

// ─── Per-Band Transfer Function ──────────────────────────────────────────────

/**
 * Calculates a single band's gain contribution (in dB) at a specific test frequency.
 *
 * @param band The band parameters
 * @param type The filter type: 'lowShelf', 'bell', or 'highShelf'
 * @param freqHz The test frequency in Hz
 */
export function calculateBandGainAtFrequency(
  band: AudioEqualizerBand,
  type: 'lowShelf' | 'bell' | 'highShelf',
  freqHz: number,
): number {
  const f = Math.max(1, freqHz);
  const gain = clampEqGain(band.gainDb);
  const fc = clampEqFrequency(band.frequencyHz);

  if (type === 'lowShelf') {
    const ratio = f / fc;
    const weight = 1 / (1 + ratio * ratio);
    return gain * weight;
  }

  if (type === 'highShelf') {
    const ratio = f / fc;
    const weight = (ratio * ratio) / (1 + ratio * ratio);
    return gain * weight;
  }

  // Bell (peaking)
  const q = Math.max(0.2, Math.min(5.0, band.q ?? 1.0));
  const octDiff = Math.log2(f / fc);
  const weight = 1 / (1 + Math.pow(octDiff * q * 1.8, 2));
  return gain * weight;
}

// ─── Combined 4-Band Transfer Function ──────────────────────────────────────

/**
 * Calculates the combined EQ gain (in dB) at a specific test frequency `f` (Hz)
 * by summing the contributions of all 4 bands.
 */
export function calculateEqGainAtFrequency(
  settings: AudioEqualizerSettings | undefined,
  freqHz: number,
): number {
  if (!settings || !settings.enabled) return 0;

  const bands = resolveEqBands(settings);

  const lowContrib = calculateBandGainAtFrequency(bands.low, 'lowShelf', freqHz);
  const lowMidContrib = calculateBandGainAtFrequency(bands.lowMid, 'bell', freqHz);
  const highMidContrib = calculateBandGainAtFrequency(bands.highMid, 'bell', freqHz);
  const highContrib = calculateBandGainAtFrequency(bands.high, 'highShelf', freqHz);

  return lowContrib + lowMidContrib + highMidContrib + highContrib;
}

// ─── Neutrality Check ────────────────────────────────────────────────────────

/**
 * Returns true when all 4 bands have 0 dB gain (or settings are undefined/disabled).
 */
export function isNeutralEq(settings: AudioEqualizerSettings | undefined): boolean {
  if (!settings) return true;
  if (!settings.enabled) return true;
  const bands = resolveEqBands(settings);
  return (
    Math.abs(bands.low.gainDb) < 0.05 &&
    Math.abs(bands.lowMid.gainDb) < 0.05 &&
    Math.abs(bands.highMid.gainDb) < 0.05 &&
    Math.abs(bands.high.gainDb) < 0.05
  );
}

// ─── SVG Curve Sampling ─────────────────────────────────────────────────────

export interface EqCurvePoint {
  frequencyHz: number;
  gainDb: number;
  x: number;
  y: number;
}

/**
 * Samples the 4-band parametric EQ frequency response curve across the audible
 * spectrum (20 Hz to 20,000 Hz) mapped into SVG geometry coordinates.
 *
 * @param settings Active EQ settings
 * @param width Width of the SVG plotting area
 * @param height Height of the SVG plotting area
 * @param numPoints Number of sample steps (default 64)
 * @param maxGainDb Y-axis bound in dB (default 18 dB)
 */
export function sampleEqCurvePoints(
  settings: AudioEqualizerSettings | undefined,
  width: number,
  height: number,
  numPoints = 64,
  maxGainDb = EQ_GAIN_MAX,
): { points: EqCurvePoint[]; pathData: string } {
  const minLog = Math.log10(EQ_FREQ_MIN);
  const maxLog = Math.log10(EQ_FREQ_MAX);
  const logSpan = maxLog - minLog;

  const points: EqCurvePoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const ratio = i / (numPoints - 1);
    const logF = minLog + ratio * logSpan;
    const freqHz = Math.min(EQ_FREQ_MAX, Math.max(EQ_FREQ_MIN, Math.pow(10, logF)));
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
 * Samples a single band's frequency response curve for rendering individual
 * band ghost curves in the parametric EQ visualizer.
 */
export function sampleBandCurvePoints(
  band: AudioEqualizerBand,
  type: 'lowShelf' | 'bell' | 'highShelf',
  width: number,
  height: number,
  numPoints = 64,
  maxGainDb = EQ_GAIN_MAX,
): { points: EqCurvePoint[]; pathData: string } {
  const minLog = Math.log10(EQ_FREQ_MIN);
  const maxLog = Math.log10(EQ_FREQ_MAX);
  const logSpan = maxLog - minLog;

  const points: EqCurvePoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const ratio = i / (numPoints - 1);
    const logF = minLog + ratio * logSpan;
    const freqHz = Math.min(EQ_FREQ_MAX, Math.max(EQ_FREQ_MIN, Math.pow(10, logF)));
    const gainDb = calculateBandGainAtFrequency(band, type, freqHz);

    const x = ratio * width;
    const normalizedY = (gainDb + maxGainDb) / (2 * maxGainDb);
    const y = height * (1 - Math.max(0, Math.min(1, normalizedY)));

    points.push({ frequencyHz: freqHz, gainDb, x, y });
  }

  const pathData = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  return { points, pathData };
}

// ─── FFmpeg Filter Synthesis ─────────────────────────────────────────────────

/**
 * Builds an FFmpeg audio filter expression for the 4-band parametric EQ.
 * Emits an `equalizer` chain for each active band with non-zero gain.
 *
 * Example: `equalizer=f=80:t=s:w=1:g=-3.0,equalizer=f=250:t=q:w=1.00:g=-1.5,...`
 */
export function buildFfmpegEqFilter(
  settings: AudioEqualizerSettings | undefined,
): string {
  if (!settings || !settings.enabled) return '';

  const bands = resolveEqBands(settings);
  const filters: string[] = [];

  // Low Shelf
  const lowGain = clampEqGain(bands.low.gainDb);
  if (Math.abs(lowGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(bands.low.frequencyHz));
    filters.push(`equalizer=f=${fc}:t=s:w=1:g=${lowGain.toFixed(1)}`);
  }

  // Low-Mid Bell
  const lowMidGain = clampEqGain(bands.lowMid.gainDb);
  if (Math.abs(lowMidGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(bands.lowMid.frequencyHz));
    const q = (bands.lowMid.q ?? 1.0).toFixed(2);
    filters.push(`equalizer=f=${fc}:t=q:w=${q}:g=${lowMidGain.toFixed(1)}`);
  }

  // High-Mid Bell
  const highMidGain = clampEqGain(bands.highMid.gainDb);
  if (Math.abs(highMidGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(bands.highMid.frequencyHz));
    const q = (bands.highMid.q ?? 1.0).toFixed(2);
    filters.push(`equalizer=f=${fc}:t=q:w=${q}:g=${highMidGain.toFixed(1)}`);
  }

  // High Shelf
  const highGain = clampEqGain(bands.high.gainDb);
  if (Math.abs(highGain) >= 0.05) {
    const fc = Math.round(clampEqFrequency(bands.high.frequencyHz));
    filters.push(`equalizer=f=${fc}:t=s:w=1:g=${highGain.toFixed(1)}`);
  }

  return filters.join(',');
}
