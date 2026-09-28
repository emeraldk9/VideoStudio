/**
 * Pure DSP arithmetic and filtergraph operations for Studio Vocal De-Esser & Mains Hum Notch Filter Rack.
 *
 * Implements:
 * - High-precision vocal de-essing (split-band & wideband dynamics reduction)
 * - Soft-knee compression transfer curve for sibilant energy suppression
 * - Parametric AC mains ground-loop hum notch filter (50Hz / 60Hz fundamental + harmonics)
 * - Subsonic rumble high-pass filter
 * - Analytical frequency response modeling for interactive SVG EQ/dynamics visualizers
 * - FFmpeg filtergraph synthesis for export pipelines
 */

export type DeEsserMode = 'split_band' | 'wideband';
export type DeEsserDetectionMode = 'rms' | 'peak';
export type DeEsserAuditionMode = 'normal' | 'sibilance_solo' | 'diff';

export interface StudioDeEsserSettings {
  enabled: boolean;
  /** Center frequency of sibilance detection in Hz (4000 to 10000 Hz, default 6500 Hz). */
  frequency: number;
  /** Bandwidth / Q factor of detection band (0.5 to 4.0, default 1.5). */
  q: number;
  /** Threshold in dB (-40 to 0 dB, default -20 dB). */
  thresholdDb: number;
  /** Compression ratio (1.5 to 8.0, default 4.0). */
  ratio: number;
  /** Attack time in milliseconds (0.5 to 20 ms, default 2.0 ms). */
  attackMs: number;
  /** Release time in milliseconds (10 to 200 ms, default 50 ms). */
  releaseMs: number;
  /** Soft-knee width in dB (0 to 10 dB, default 3 dB). */
  kneeDb: number;
  /** Processing mode: split-band tames only sibilance frequencies; wideband ducks whole signal. */
  mode: DeEsserMode;
  /** Level detection algorithm: RMS (smoother) or Peak (transient-sensitive). */
  detectionMode: DeEsserDetectionMode;
  /** Audition mode: normal audio, isolated sibilance, or gain reduction difference. */
  auditionMode: DeEsserAuditionMode;
  /** Post-de-esser makeup gain in dB (0 to 6 dB, default 0 dB). */
  makeupGainDb: number;
}

export type MainsHumFrequency = 50 | 60;

export interface MainsHumNotchSettings {
  enabled: boolean;
  /** Base AC mains electrical frequency in Hz (50Hz for EU/UK/Asia/AU, 60Hz for US/Americas). */
  baseFreq: MainsHumFrequency;
  /** Number of harmonic notches to apply (1 = fundamental only, up to 4 harmonics). */
  harmonicsCount: number;
  /** Notch attenuation depth at center frequency in dB (-60 to -6 dB, default -36 dB). */
  attenuationDb: number;
  /** Notch filter Q factor / steepness (5 to 50, default 15). */
  qFactor: number;
  /** Reduction in notch depth per harmonic octave in dB (0 to 6 dB, default 3 dB). */
  harmonicRollOffDbPerOctave: number;
  /** Subsonic high-pass rumble filter cutoff in Hz (0 = disabled, 15 to 80 Hz, default 25 Hz). */
  highPassHz: number;
}

export const DEFAULT_DEESSER_SETTINGS: StudioDeEsserSettings = {
  enabled: false,
  frequency: 6500,
  q: 1.5,
  thresholdDb: -20,
  ratio: 4.0,
  attackMs: 2.0,
  releaseMs: 50,
  kneeDb: 3,
  mode: 'split_band',
  detectionMode: 'rms',
  auditionMode: 'normal',
  makeupGainDb: 0,
};

export const DEFAULT_NOTCH_FILTER_SETTINGS: MainsHumNotchSettings = {
  enabled: false,
  baseFreq: 60,
  harmonicsCount: 3,
  attenuationDb: -36,
  qFactor: 15,
  harmonicRollOffDbPerOctave: 3,
  highPassHz: 25,
};

export type DeEsserPresetKey =
  | 'female_sibilance'
  | 'male_sibilance'
  | 'harsh_cymbals_overhead'
  | 'aggressive_podcast'
  | 'transparent_broadcast'
  | 'bypass_flat';

export interface DeEsserPreset {
  name: string;
  description: string;
  settings: StudioDeEsserSettings;
}

export const DEESSER_PRESETS: Record<DeEsserPresetKey, DeEsserPreset> = {
  female_sibilance: {
    name: 'Female Vocal Sibilance',
    description: 'Targeted attenuation around 7.2kHz for bright female vocal sibilance and harshness.',
    settings: {
      enabled: true,
      frequency: 7200,
      q: 2.0,
      thresholdDb: -22,
      ratio: 4.0,
      attackMs: 1.5,
      releaseMs: 45,
      kneeDb: 3,
      mode: 'split_band',
      detectionMode: 'rms',
      auditionMode: 'normal',
      makeupGainDb: 0,
    },
  },
  male_sibilance: {
    name: 'Male Vocal Sibilance',
    description: 'Targeted suppression around 5.5kHz for deep chest voices with sibilant bite.',
    settings: {
      enabled: true,
      frequency: 5500,
      q: 1.8,
      thresholdDb: -20,
      ratio: 3.5,
      attackMs: 2.0,
      releaseMs: 50,
      kneeDb: 4,
      mode: 'split_band',
      detectionMode: 'rms',
      auditionMode: 'normal',
      makeupGainDb: 0,
    },
  },
  harsh_cymbals_overhead: {
    name: 'Harsh Cymbals & Overheads',
    description: 'Wideband soft taming for brittle hi-hats, crashes, and acoustic strum resonance.',
    settings: {
      enabled: true,
      frequency: 8500,
      q: 1.2,
      thresholdDb: -18,
      ratio: 3.0,
      attackMs: 1.0,
      releaseMs: 40,
      kneeDb: 2,
      mode: 'wideband',
      detectionMode: 'peak',
      auditionMode: 'normal',
      makeupGainDb: 0,
    },
  },
  aggressive_podcast: {
    name: 'Aggressive Broadcast De-Ess',
    description: 'Deep suppression for high-gain compressed dialogue and close condenser mics.',
    settings: {
      enabled: true,
      frequency: 6200,
      q: 2.2,
      thresholdDb: -26,
      ratio: 6.0,
      attackMs: 1.0,
      releaseMs: 35,
      kneeDb: 2,
      mode: 'split_band',
      detectionMode: 'rms',
      auditionMode: 'normal',
      makeupGainDb: 0.5,
    },
  },
  transparent_broadcast: {
    name: 'Transparent Broadcast',
    description: 'Gentle mastering-grade split-band control with soft knee for natural speech.',
    settings: {
      enabled: true,
      frequency: 6000,
      q: 1.5,
      thresholdDb: -16,
      ratio: 2.5,
      attackMs: 3.0,
      releaseMs: 70,
      kneeDb: 5,
      mode: 'split_band',
      detectionMode: 'rms',
      auditionMode: 'normal',
      makeupGainDb: 0,
    },
  },
  bypass_flat: {
    name: 'Bypass (Flat)',
    description: 'Disabled de-essing pass-through.',
    settings: DEFAULT_DEESSER_SETTINGS,
  },
};

export type MainsHumPresetKey =
  | 'mains_50hz_fundamental'
  | 'mains_50hz_harmonics'
  | 'mains_60hz_fundamental'
  | 'mains_60hz_harmonics'
  | 'ground_loop_killer_deep'
  | 'subsonic_clean_only'
  | 'bypass_flat';

export interface MainsHumPreset {
  name: string;
  description: string;
  settings: MainsHumNotchSettings;
}

export const MAINS_HUM_PRESETS: Record<MainsHumPresetKey, MainsHumPreset> = {
  mains_50hz_fundamental: {
    name: '50Hz AC Fundamental (UK / EU)',
    description: 'Surgical single-frequency notch at 50Hz for European/Asian electrical hum.',
    settings: {
      enabled: true,
      baseFreq: 50,
      harmonicsCount: 1,
      attenuationDb: -40,
      qFactor: 20,
      harmonicRollOffDbPerOctave: 3,
      highPassHz: 20,
    },
  },
  mains_50hz_harmonics: {
    name: '50Hz + Harmonics (UK / EU / Asia)',
    description: 'Cascaded notches at 50Hz, 100Hz, and 150Hz to cure complex transformer buzzing.',
    settings: {
      enabled: true,
      baseFreq: 50,
      harmonicsCount: 3,
      attenuationDb: -42,
      qFactor: 16,
      harmonicRollOffDbPerOctave: 3,
      highPassHz: 25,
    },
  },
  mains_60hz_fundamental: {
    name: '60Hz AC Fundamental (US / Americas)',
    description: 'Surgical single-frequency notch at 60Hz for North/South American electrical hum.',
    settings: {
      enabled: true,
      baseFreq: 60,
      harmonicsCount: 1,
      attenuationDb: -40,
      qFactor: 20,
      harmonicRollOffDbPerOctave: 3,
      highPassHz: 20,
    },
  },
  mains_60hz_harmonics: {
    name: '60Hz + Harmonics (US / Americas)',
    description: 'Cascaded notches at 60Hz, 120Hz, and 180Hz to eliminate severe studio ground hum.',
    settings: {
      enabled: true,
      baseFreq: 60,
      harmonicsCount: 3,
      attenuationDb: -42,
      qFactor: 16,
      harmonicRollOffDbPerOctave: 3,
      highPassHz: 25,
    },
  },
  ground_loop_killer_deep: {
    name: 'Deep Ground Loop Killer',
    description: 'Extreme -52dB notch depth across 4 harmonics with high Q factor for bad wiring.',
    settings: {
      enabled: true,
      baseFreq: 60,
      harmonicsCount: 4,
      attenuationDb: -52,
      qFactor: 24,
      harmonicRollOffDbPerOctave: 2,
      highPassHz: 30,
    },
  },
  subsonic_clean_only: {
    name: 'Subsonic Rumble Filter Only',
    description: 'Passes all audio but strips sub-audible mic stand thumps and AC rumble below 35Hz.',
    settings: {
      enabled: true,
      baseFreq: 60,
      harmonicsCount: 0,
      attenuationDb: 0,
      qFactor: 10,
      harmonicRollOffDbPerOctave: 3,
      highPassHz: 35,
    },
  },
  bypass_flat: {
    name: 'Bypass (Flat)',
    description: 'Disabled AC hum notch filter pass-through.',
    settings: DEFAULT_NOTCH_FILTER_SETTINGS,
  },
};

/**
 * Validates and clamps De-Esser parameters to valid professional ranges.
 */
export function clampDeEsserParams(settings: Partial<StudioDeEsserSettings>): StudioDeEsserSettings {
  return {
    enabled: Boolean(settings.enabled ?? DEFAULT_DEESSER_SETTINGS.enabled),
    frequency: Math.max(4000, Math.min(10000, Number(settings.frequency ?? DEFAULT_DEESSER_SETTINGS.frequency))),
    q: Math.max(0.5, Math.min(4.0, Number(settings.q ?? DEFAULT_DEESSER_SETTINGS.q))),
    thresholdDb: Math.max(-40, Math.min(0, Number(settings.thresholdDb ?? DEFAULT_DEESSER_SETTINGS.thresholdDb))),
    ratio: Math.max(1.5, Math.min(8.0, Number(settings.ratio ?? DEFAULT_DEESSER_SETTINGS.ratio))),
    attackMs: Math.max(0.5, Math.min(20.0, Number(settings.attackMs ?? DEFAULT_DEESSER_SETTINGS.attackMs))),
    releaseMs: Math.max(10, Math.min(200, Number(settings.releaseMs ?? DEFAULT_DEESSER_SETTINGS.releaseMs))),
    kneeDb: Math.max(0, Math.min(10, Number(settings.kneeDb ?? DEFAULT_DEESSER_SETTINGS.kneeDb))),
    mode: settings.mode === 'wideband' ? 'wideband' : 'split_band',
    detectionMode: settings.detectionMode === 'peak' ? 'peak' : 'rms',
    auditionMode: settings.auditionMode === 'sibilance_solo' || settings.auditionMode === 'diff'
      ? settings.auditionMode
      : 'normal',
    makeupGainDb: Math.max(0, Math.min(6, Number(settings.makeupGainDb ?? DEFAULT_DEESSER_SETTINGS.makeupGainDb))),
  };
}

/**
 * Validates and clamps Mains Hum Notch parameters to valid engineering bounds.
 */
export function clampNotchFilterParams(settings: Partial<MainsHumNotchSettings>): MainsHumNotchSettings {
  const baseFreq = settings.baseFreq === 50 ? 50 : 60;
  return {
    enabled: Boolean(settings.enabled ?? DEFAULT_NOTCH_FILTER_SETTINGS.enabled),
    baseFreq,
    harmonicsCount: Math.max(0, Math.min(4, Math.round(Number(settings.harmonicsCount ?? DEFAULT_NOTCH_FILTER_SETTINGS.harmonicsCount)))),
    attenuationDb: Math.max(-60, Math.min(-6, Number(settings.attenuationDb ?? DEFAULT_NOTCH_FILTER_SETTINGS.attenuationDb))),
    qFactor: Math.max(5, Math.min(50, Number(settings.qFactor ?? DEFAULT_NOTCH_FILTER_SETTINGS.qFactor))),
    harmonicRollOffDbPerOctave: Math.max(0, Math.min(6, Number(settings.harmonicRollOffDbPerOctave ?? DEFAULT_NOTCH_FILTER_SETTINGS.harmonicRollOffDbPerOctave))),
    highPassHz: Math.max(0, Math.min(80, Number(settings.highPassHz ?? DEFAULT_NOTCH_FILTER_SETTINGS.highPassHz))),
  };
}

/**
 * Calculates instantaneous vocal sibilance gain reduction (in positive dB) for a given input level.
 *
 * @param sibilanceLevelDb Input sibilance power in decibels (typically -50 to 0 dB)
 * @param settings Studio vocal de-esser configuration
 * @returns Non-negative decibels of attenuation (0 = no reduction, >0 = attenuation applied)
 */
export function calculateDeEsserGainReduction(
  sibilanceLevelDb: number,
  settings: StudioDeEsserSettings
): number {
  if (!settings.enabled || settings.ratio <= 1.0) {
    return 0;
  }

  const T = settings.thresholdDb;
  const R = Math.max(1.0, settings.ratio);
  const K = Math.max(0, settings.kneeDb);
  const halfK = K / 2;

  // Region 1: Below threshold and knee -> Zero attenuation
  if (K === 0 || sibilanceLevelDb <= T - halfK) {
    if (sibilanceLevelDb <= T) {
      return 0;
    }
    // Hard knee: above threshold
    const output = T + (sibilanceLevelDb - T) / R;
    return Math.max(0, sibilanceLevelDb - output);
  }

  // Region 2: Above knee upper bound -> Full compression slope
  if (sibilanceLevelDb >= T + halfK) {
    const output = T + (sibilanceLevelDb - T) / R;
    return Math.max(0, sibilanceLevelDb - output);
  }

  // Region 3: Soft-knee transition region [T - halfK, T + halfK]
  // Standard quadratic soft-knee interpolation:
  // reduction = (1 - 1/R) * (x - T + K/2)^2 / (2 * K)
  const delta = sibilanceLevelDb - T + halfK;
  const slopeFactor = 1 - 1 / R;
  const reduction = (slopeFactor * (delta * delta)) / (2 * K);

  return Math.max(0, reduction);
}

/**
 * Calculates output level (in dB) of the sibilance frequency band after de-essing and makeup gain.
 */
export function calculateDeEsserTransfer(
  inputDb: number,
  settings: StudioDeEsserSettings
): number {
  const reduction = calculateDeEsserGainReduction(inputDb, settings);
  const makeup = settings.enabled ? settings.makeupGainDb : 0;
  return inputDb - reduction + makeup;
}

export interface DeEsserCurvePoint {
  x: number;
  y: number;
  inputDb: number;
  outputDb: number;
  gainReductionDb: number;
}

/**
 * Samples points along the de-esser transfer characteristic curve to draw an interactive SVG response path.
 */
export function sampleDeEsserCurvePoints(
  settings: StudioDeEsserSettings,
  width: number,
  height: number,
  samples: number = 60,
  minDb: number = -50,
  maxDb: number = 0
): DeEsserCurvePoint[] {
  const points: DeEsserCurvePoint[] = [];
  const dbRange = maxDb - minDb;

  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const inputDb = minDb + fraction * dbRange;
    const gainReductionDb = calculateDeEsserGainReduction(inputDb, settings);
    const outputDb = calculateDeEsserTransfer(inputDb, settings);

    const x = fraction * width;
    const clampedOutput = Math.max(minDb, Math.min(maxDb, outputDb));
    const yFraction = (clampedOutput - minDb) / dbRange;
    const y = height - yFraction * height;

    points.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      inputDb: Math.round(inputDb * 10) / 10,
      outputDb: Math.round(outputDb * 10) / 10,
      gainReductionDb: Math.round(gainReductionDb * 10) / 10,
    });
  }

  return points;
}

/**
 * Calculates the frequency response gain (in dB) at an arbitrary audio frequency (in Hz)
 * under the Mains Hum Notch and subsonic rumble filtering.
 *
 * Uses continuous 2nd-order analog notch biquad magnitude equation:
 * |H(f)|^2 = [ (f^2 - f0^2)^2 + (f*f0/Q)^2 * 10^(G_db/10) ] / [ (f^2 - f0^2)^2 + (f*f0/Q)^2 ]
 */
export function calculateNotchFrequencyResponse(
  frequencyHz: number,
  settings: MainsHumNotchSettings
): number {
  if (!settings.enabled || frequencyHz <= 0) {
    return 0;
  }

  let totalGainDb = 0;

  // 1. High-Pass Subsonic Rumble Filter (2nd-order Butterworth roll-off)
  if (settings.highPassHz > 0) {
    const ratio = frequencyHz / settings.highPassHz;
    // |H_hp|^2 = (ratio^4) / (ratio^4 + 1)
    const hpPower = (ratio * ratio * ratio * ratio) / (ratio * ratio * ratio * ratio + 1);
    const hpGainDb = 10 * Math.log10(Math.max(1e-6, hpPower));
    totalGainDb += Math.max(-60, hpGainDb);
  }

  // 2. Cascaded Harmonic Notches
  for (let k = 1; k <= settings.harmonicsCount; k++) {
    const harmonicFreq = settings.baseFreq * k;
    if (harmonicFreq > 20000) break;

    // Upper harmonics roll off in depth according to harmonicRollOffDbPerOctave
    const octaveOffset = Math.log2(k);
    const depth = Math.min(-3, settings.attenuationDb + octaveOffset * settings.harmonicRollOffDbPerOctave);

    const f2 = frequencyHz * frequencyHz;
    const f0_2 = harmonicFreq * harmonicFreq;
    const deltaF2 = f2 - f0_2;
    const numeratorBase = deltaF2 * deltaF2;

    const bandwidthFactor = (frequencyHz * harmonicFreq) / settings.qFactor;
    const bandwidthSq = bandwidthFactor * bandwidthFactor;

    const linearGainPower = Math.pow(10, depth / 10);
    const num = numeratorBase + bandwidthSq * linearGainPower;
    const den = numeratorBase + bandwidthSq;

    const powerRatio = num / Math.max(1e-12, den);
    const notchDb = 10 * Math.log10(Math.max(1e-6, powerRatio));

    totalGainDb += notchDb;
  }

  return Math.max(-70, Math.min(6, totalGainDb));
}

export interface NotchCurvePoint {
  x: number;
  y: number;
  freqHz: number;
  gainDb: number;
}

/**
 * Samples points along the logarithmic frequency spectrum (from minFreq to maxFreq)
 * to render an SVG frequency response graph of the Mains Hum notch filter.
 */
export function sampleNotchFilterResponse(
  settings: MainsHumNotchSettings,
  width: number,
  height: number,
  minFreq: number = 20,
  maxFreq: number = 500,
  samples: number = 80,
  minDb: number = -48,
  maxDb: number = 6
): NotchCurvePoint[] {
  const points: NotchCurvePoint[] = [];
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logRange = logMax - logMin;
  const dbRange = maxDb - minDb;

  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const freqHz = Math.pow(10, logMin + fraction * logRange);
    const gainDb = calculateNotchFrequencyResponse(freqHz, settings);

    const x = fraction * width;
    const clampedGain = Math.max(minDb, Math.min(maxDb, gainDb));
    const yFraction = (clampedGain - minDb) / dbRange;
    const y = height - yFraction * height;

    points.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      freqHz: Math.round(freqHz * 10) / 10,
      gainDb: Math.round(gainDb * 10) / 10,
    });
  }

  return points;
}

/**
 * Generates an FFmpeg audio filter string for the Mains Hum Notch filter and high-pass rumble roll-off.
 */
export function generateNotchFilterString(settings: MainsHumNotchSettings): string {
  if (!settings.enabled) {
    return '';
  }

  const filters: string[] = [];

  // Subsonic high-pass filter
  if (settings.highPassHz > 0) {
    filters.push(`highpass=f=${Math.round(settings.highPassHz)}:width_type=q:w=0.707`);
  }

  // Cascaded notch equalizers for fundamental and harmonics
  for (let k = 1; k <= settings.harmonicsCount; k++) {
    const harmonicFreq = settings.baseFreq * k;
    if (harmonicFreq > 20000) break;

    const octaveOffset = Math.log2(k);
    const depth = Math.min(-3, settings.attenuationDb + octaveOffset * settings.harmonicRollOffDbPerOctave);
    const roundedDepth = Math.round(depth * 10) / 10;
    const q = Math.round(settings.qFactor * 10) / 10;

    filters.push(`equalizer=f=${harmonicFreq}:t=q:w=${q}:g=${roundedDepth}`);
  }

  return filters.join(',');
}

/**
 * Generates an FFmpeg audio filter string for the Vocal De-Esser.
 */
export function generateDeEsserFilterString(settings: StudioDeEsserSettings): string {
  if (!settings.enabled || settings.ratio <= 1.0) {
    return '';
  }

  // Normalized intensity from threshold and ratio:
  // e.g. -20dB and ratio 4.0 -> intensity ~0.5
  const normalizedIntensity = Math.min(1.0, Math.max(0.0, (Math.abs(settings.thresholdDb) / 40) * (settings.ratio / 8)));
  const intensity = Math.round(normalizedIntensity * 100) / 100;
  
  // Frequency mapping: 4000-10000Hz normalized to 0.0-1.0
  const normalizedFreq = Math.min(1.0, Math.max(0.0, (settings.frequency - 4000) / 6000));
  const freq = Math.round(normalizedFreq * 100) / 100;

  // Maximum amount parameter
  const maxAmount = Math.min(1.0, Math.max(0.1, settings.ratio / 8));
  const m = Math.round(maxAmount * 100) / 100;

  const modeChar = settings.mode === 'split_band' ? 's' : 'e';

  let filterStr = `deesser=i=${intensity}:m=${m}:f=${freq}:s=${modeChar}`;
  if (settings.makeupGainDb > 0) {
    filterStr += `,volume=${Math.round(settings.makeupGainDb * 10) / 10}dB`;
  }

  return filterStr;
}

/**
 * Synthesizes a unified audio filtergraph combining AC hum notch elimination and vocal de-essing.
 */
export function buildStudioDeEsserNotchFiltergraph(
  deEsser: StudioDeEsserSettings,
  notch: MainsHumNotchSettings
): string {
  const parts: string[] = [];

  const notchFilter = generateNotchFilterString(notch);
  if (notchFilter) {
    parts.push(notchFilter);
  }

  const deEsserFilter = generateDeEsserFilterString(deEsser);
  if (deEsserFilter) {
    parts.push(deEsserFilter);
  }

  return parts.join(',');
}
