/**
 * Operations and mathematical models for AI Audio Vocal Isolation,
 * Dialogue Enhancement, Room De-Reverberation, and Stems Separation.
 */

export type AudioIsolationMode =
  | 'vocal_isolate'
  | 'instrumental_isolate'
  | 'dialogue_enhance'
  | 'de_reverb';

export type AudioIsolationPresetKey =
  | 'podcast_clarity'
  | 'interview_cleanup'
  | 'acapella_vocal_only'
  | 'karaoke_instrumental';

export interface AudioIsolationSettings {
  enabled: boolean;
  mode: AudioIsolationMode;
  isolationStrength: number; // 0.0 to 1.0 (spectral subtraction / separation depth)
  speechClarity: number; // 0.0 to 1.0 (formant articulation boost)
  deReverbAmount: number; // 0.0 to 1.0 (room reflection suppression)
  levelerEnabled: boolean; // dynamic conversational speech leveling
  targetLufs: number; // -30 to -14 dB (target speech loudness)
  preset?: AudioIsolationPresetKey;
}

export const DEFAULT_AUDIO_ISOLATION_SETTINGS: AudioIsolationSettings = {
  enabled: false,
  mode: 'dialogue_enhance',
  isolationStrength: 0.6,
  speechClarity: 0.5,
  deReverbAmount: 0.4,
  levelerEnabled: true,
  targetLufs: -18,
};

export interface AudioIsolationPresetConfig {
  name: string;
  description: string;
  settings: Omit<AudioIsolationSettings, 'enabled'>;
}

export const AUDIO_ISOLATION_PRESETS: Record<AudioIsolationPresetKey, AudioIsolationPresetConfig> = {
  podcast_clarity: {
    name: 'Podcast Clarity',
    description: 'Polished studio vocal presence with subtle room reflection removal and dialogue leveling.',
    settings: {
      mode: 'dialogue_enhance',
      isolationStrength: 0.5,
      speechClarity: 0.75,
      deReverbAmount: 0.45,
      levelerEnabled: true,
      targetLufs: -16,
      preset: 'podcast_clarity',
    },
  },
  interview_cleanup: {
    name: 'Street Interview',
    description: 'Aggressive isolation removing heavy urban traffic, air conditioners, and wind noise.',
    settings: {
      mode: 'vocal_isolate',
      isolationStrength: 0.85,
      speechClarity: 0.6,
      deReverbAmount: 0.6,
      levelerEnabled: true,
      targetLufs: -18,
      preset: 'interview_cleanup',
    },
  },
  acapella_vocal_only: {
    name: 'Acapella (Vocal Only)',
    description: 'Stems separation suppressing backing tracks, bass, drums, and synthesizers.',
    settings: {
      mode: 'vocal_isolate',
      isolationStrength: 0.95,
      speechClarity: 0.5,
      deReverbAmount: 0.2,
      levelerEnabled: false,
      targetLufs: -18,
      preset: 'acapella_vocal_only',
    },
  },
  karaoke_instrumental: {
    name: 'Karaoke (Instrumental)',
    description: 'Vocal attenuation extracting clean instrumental accompaniment.',
    settings: {
      mode: 'instrumental_isolate',
      isolationStrength: 0.9,
      speechClarity: 0.0,
      deReverbAmount: 0.1,
      levelerEnabled: false,
      targetLufs: -18,
      preset: 'karaoke_instrumental',
    },
  },
};

/**
 * Calculates parametric vocal formant enhancement filter parameters based on speech clarity slider.
 * Focuses boost in the 2.5 kHz - 3.5 kHz intelligibility band.
 */
export function calculateSpeechGainBoost(clarity: number): {
  centerFreqHz: number;
  gainDb: number;
  q: number;
} {
  const clampedClarity = Math.max(0, Math.min(1, clarity));
  // 0 -> 0 dB boost, 1 -> +8 dB boost centered at 3000 Hz
  const gainDb = Number((clampedClarity * 8.0).toFixed(1));
  return {
    centerFreqHz: 3000,
    gainDb,
    q: 1.4,
  };
}

/**
 * Calculates effective noise floor suppression in decibels (dB) given isolation strength [0.0 - 1.0].
 */
export function calculateNoiseFloorReduction(strength: number): number {
  const clampedStrength = Math.max(0, Math.min(1, strength));
  // Maps 0 -> 0 dB to 1 -> -36 dB reduction
  return Number((-clampedStrength * 36.0).toFixed(1));
}

/**
 * Synthesizes an FFmpeg audio filter expression corresponding to the vocal isolation and dialogue enhancement settings.
 */
export function buildFfmpegIsolationFilter(settings: AudioIsolationSettings): string {
  if (!settings.enabled) return '';

  const filters: string[] = [];

  // 1. Highpass filter to eliminate sub-audible rumble (<80 Hz)
  filters.push('highpass=f=80');

  // 2. Mode-specific isolation or spectral filtering
  if (settings.mode === 'vocal_isolate') {
    const noiseReductionDb = Math.abs(calculateNoiseFloorReduction(settings.isolationStrength));
    filters.push(`afftdn=nr=${noiseReductionDb.toFixed(1)}:nf=-50`);
    filters.push('bandpass=f=1800:width_type=h:w=3200');
  } else if (settings.mode === 'instrumental_isolate') {
    // Center channel vocal cancelation / attenuation
    filters.push('stereotools=mlev=0.1:slev=1.4');
  } else if (settings.mode === 'de_reverb') {
    const nr = (settings.deReverbAmount * 24).toFixed(1);
    filters.push(`afftdn=nr=${nr}:nf=-45`);
  }

  // 3. Formant articulation clarity boost
  if (settings.speechClarity > 0) {
    const boost = calculateSpeechGainBoost(settings.speechClarity);
    if (boost.gainDb > 0) {
      filters.push(`equalizer=f=${boost.centerFreqHz}:width_type=q:w=${boost.q}:g=${boost.gainDb}`);
    }
  }

  // 4. Dialogue Leveler (speechnorm)
  if (settings.levelerEnabled) {
    const target = Math.max(-30, Math.min(-14, settings.targetLufs));
    filters.push(`speechnorm=p=0.8:e=4:r=0.0001:l=1`);
    filters.push(`volume=${target}dB`);
  }

  return filters.join(',');
}
