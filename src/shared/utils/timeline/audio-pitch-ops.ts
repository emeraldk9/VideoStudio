/**
 * S49 — Audio Pitch Shifter, Formant Preserver & Creative Voice Effects Engine.
 *
 * Implements pitch transposition, fine cents detuning, formant preservation,
 * and creative vocal effect presets for both real-time preview and export rendering.
 */

export type VoiceEffectPresetKey =
  | 'deep_trailer'
  | 'helium_cartoon'
  | 'robot_harmonizer'
  | 'anonymous_interview'
  | 'octave_up'
  | 'octave_down'
  | 'subtle_tune';

export interface AudioPitchSettings {
  enabled: boolean;
  /** Coarse pitch transposition in semitones [-24..24], where 0 is unshifted. */
  semitones: number;
  /** Fine pitch detune in cents [-100..100], where 100 cents = 1 semitone. */
  cents: number;
  /** Decouples fundamental pitch from vocal tract formants to prevent chipmunk distortion on speech. */
  preserveFormants: boolean;
  /** Optional manual formant shift in semitones [-12..12]. */
  formantShiftSemitones?: number;
  /** Optional active preset key. */
  preset?: VoiceEffectPresetKey;
}

export const DEFAULT_AUDIO_PITCH_SETTINGS: AudioPitchSettings = {
  enabled: false,
  semitones: 0,
  cents: 0,
  preserveFormants: true,
  formantShiftSemitones: 0,
  preset: undefined,
};

export interface VoiceEffectPresetDefinition {
  label: string;
  description: string;
  settings: AudioPitchSettings;
}

export const VOICE_EFFECT_PRESETS: Record<VoiceEffectPresetKey, VoiceEffectPresetDefinition> = {
  deep_trailer: {
    label: 'Deep Movie Trailer',
    description: 'Dramatic low-pitched cinematic trailer narrator voice with natural vocal chest resonance.',
    settings: {
      enabled: true,
      semitones: -6,
      cents: 0,
      preserveFormants: true,
      formantShiftSemitones: -2,
      preset: 'deep_trailer',
    },
  },
  helium_cartoon: {
    label: 'Helium Chipmunk',
    description: 'Playful cartoon high pitch with shifted formants for high-energy comedic effect.',
    settings: {
      enabled: true,
      semitones: 8,
      cents: 0,
      preserveFormants: false,
      formantShiftSemitones: 4,
      preset: 'helium_cartoon',
    },
  },
  robot_harmonizer: {
    label: 'Synthesizer Harmonizer',
    description: 'Slightly lifted modern harmonized pitch effect for tech and futuristic narration.',
    settings: {
      enabled: true,
      semitones: 3,
      cents: -10,
      preserveFormants: false,
      formantShiftSemitones: 0,
      preset: 'robot_harmonizer',
    },
  },
  anonymous_interview: {
    label: 'Anonymous Disguise',
    description: 'Standard journalistic voice anonymizer lowering pitch while protecting speech intelligibility.',
    settings: {
      enabled: true,
      semitones: -4,
      cents: -20,
      preserveFormants: true,
      formantShiftSemitones: -3,
      preset: 'anonymous_interview',
    },
  },
  octave_up: {
    label: 'Full Octave Up (+12)',
    description: 'Exact one-octave pitch shift (+12 semitones) doubling musical frequencies.',
    settings: {
      enabled: true,
      semitones: 12,
      cents: 0,
      preserveFormants: true,
      formantShiftSemitones: 0,
      preset: 'octave_up',
    },
  },
  octave_down: {
    label: 'Full Octave Down (-12)',
    description: 'Exact one-octave pitch drop (-12 semitones) halving fundamental frequencies.',
    settings: {
      enabled: true,
      semitones: -12,
      cents: 0,
      preserveFormants: true,
      formantShiftSemitones: 0,
      preset: 'octave_down',
    },
  },
  subtle_tune: {
    label: 'Subtle Pitch Correction',
    description: 'Micro-tonal adjustment (+15 cents) for fine vocal harmony alignment.',
    settings: {
      enabled: true,
      semitones: 0,
      cents: 15,
      preserveFormants: true,
      formantShiftSemitones: 0,
      preset: 'subtle_tune',
    },
  },
};

/**
 * Calculates total linear pitch multiplier ratio:
 * R = 2^((semitones + cents / 100) / 12)
 */
export function calculatePitchRatio(semitones: number, cents: number = 0): number {
  const totalSemitones = semitones + cents / 100;
  return Number(Math.pow(2, totalSemitones / 12).toFixed(5));
}

/**
 * Calculates total pitch detune in cents:
 * centsTotal = semitones * 100 + cents
 */
export function calculatePitchDetuneCents(semitones: number, cents: number = 0): number {
  return Math.round(semitones * 100 + cents);
}

/**
 * Synthesizes an FFmpeg audio filter chain for pitch shifting during export.
 * Emits rubberband pitch/formant filter when applicable, or sample rate retune + tempo compensation.
 */
export function buildFfmpegPitchFilter(settings: AudioPitchSettings | undefined): string {
  if (!settings || !settings.enabled) {
    return '';
  }

  const semitones = settings.semitones;
  const cents = settings.cents;
  if (semitones === 0 && cents === 0) {
    return '';
  }

  const pitchRatio = calculatePitchRatio(semitones, cents);
  if (Math.abs(pitchRatio - 1.0) < 0.0001) {
    return '';
  }

  // Use rubberband filter if formants are preserved or specified
  const formantMode = settings.preserveFormants ? 'preserved' : 'shifted';
  return `rubberband=pitch=${pitchRatio.toFixed(4)}:formant=${formantMode}`;
}
