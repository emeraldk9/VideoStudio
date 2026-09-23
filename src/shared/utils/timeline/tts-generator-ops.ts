/**
 * Pure arithmetic, audio waveform synthesis, and AI voice persona engine
 * for VideoStudio Text-to-Speech (TTS) and closed caption voiceover generation.
 *
 * Implements:
 * - Curated TTS voice personas (Narrator, Storyteller, Cyber Robot, Calm Educator, Energetic Creator, News Anchor)
 * - Phonetic speech cadence and duration estimation
 * - Pure 48 kHz 16-bit PCM WAV audio buffer generator
 * - Synchronized speech audio clip creation with automatic track layout
 */

import type { SequenceClip } from '../../types/sequence';

export type TTSVoicePersonaId =
  | 'narrator_epic'
  | 'storyteller_female'
  | 'cyber_robot'
  | 'calm_educator'
  | 'energetic_creator'
  | 'news_anchor';

export interface TTSVoicePersona {
  id: TTSVoicePersonaId;
  name: string;
  category: 'narrative' | 'commercial' | 'character' | 'educational';
  description: string;
  gender: 'male' | 'female' | 'neutral';
  defaultRate: number; // 0.5 to 2.0
  defaultPitch: number; // -10 to +10 semitones
  timbreProfile: {
    fundamentalFreqHz: number; // e.g. 110Hz for deep male, 220Hz for female
    formantFrequencies: [number, number, number]; // F1, F2, F3 formant peaks
    harmonicResonance: number; // 0.0 to 1.0
  };
}

export const TTS_VOICE_PERSONAS: Record<TTSVoicePersonaId, TTSVoicePersona> = {
  narrator_epic: {
    id: 'narrator_epic',
    name: 'Narrator (Epic & Warm)',
    category: 'narrative',
    description: 'Deep, resonant, cinematic authority with rich lower harmonic presence',
    gender: 'male',
    defaultRate: 0.95,
    defaultPitch: -2,
    timbreProfile: {
      fundamentalFreqHz: 105,
      formantFrequencies: [500, 1500, 2500],
      harmonicResonance: 0.85,
    },
  },
  storyteller_female: {
    id: 'storyteller_female',
    name: 'Storyteller (Engaging)',
    category: 'narrative',
    description: 'Warm, articulate, expressive delivery ideal for reels and documentary audio',
    gender: 'female',
    defaultRate: 1.0,
    defaultPitch: 1,
    timbreProfile: {
      fundamentalFreqHz: 210,
      formantFrequencies: [650, 1750, 2850],
      harmonicResonance: 0.8,
    },
  },
  cyber_robot: {
    id: 'cyber_robot',
    name: 'Cyberpunk Synthesizer',
    category: 'character',
    description: 'Electrifying vocoder robot voice with quantized harmonic modulation',
    gender: 'neutral',
    defaultRate: 1.1,
    defaultPitch: -4,
    timbreProfile: {
      fundamentalFreqHz: 90,
      formantFrequencies: [400, 1200, 2200],
      harmonicResonance: 0.95,
    },
  },
  calm_educator: {
    id: 'calm_educator',
    name: 'Calm Educator',
    category: 'educational',
    description: 'Measured, friendly, clear instruction for tutorials and explainer videos',
    gender: 'female',
    defaultRate: 0.9,
    defaultPitch: 0,
    timbreProfile: {
      fundamentalFreqHz: 195,
      formantFrequencies: [600, 1600, 2700],
      harmonicResonance: 0.75,
    },
  },
  energetic_creator: {
    id: 'energetic_creator',
    name: 'Energetic Creator',
    category: 'commercial',
    description: 'Upbeat, punchy, dynamic delivery crafted for viral shorts and ads',
    gender: 'male',
    defaultRate: 1.15,
    defaultPitch: 3,
    timbreProfile: {
      fundamentalFreqHz: 140,
      formantFrequencies: [550, 1650, 2600],
      harmonicResonance: 0.78,
    },
  },
  news_anchor: {
    id: 'news_anchor',
    name: 'News Anchor (Broadcast)',
    category: 'commercial',
    description: 'Crisp, neutral, broadcast-standard cadence with crystal intelligibility',
    gender: 'male',
    defaultRate: 1.05,
    defaultPitch: 0,
    timbreProfile: {
      fundamentalFreqHz: 125,
      formantFrequencies: [520, 1550, 2550],
      harmonicResonance: 0.82,
    },
  },
};

/**
 * Estimates spoken duration in seconds based on text length, word count,
 * punctuation pause cadence, and speed rate.
 */
export function estimateSpeechDurationSeconds(text: string, rate = 1.0): number {
  const clean = text.trim();
  if (!clean) return 0.5;

  const clampedRate = Math.max(0.5, Math.min(2.0, rate));
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Average 2.6 words per second at 1.0x rate
  const speechSecs = wordCount / 2.6;

  // Additional natural pauses for punctuation
  const majorPauses = (clean.match(/[.!?]/g) || []).length;
  const minorPauses = (clean.match(/[,;:\-\n]/g) || []).length;
  const pauseSecs = majorPauses * 0.4 + minorPauses * 0.2;

  const totalSecs = (speechSecs + pauseSecs) / clampedRate;
  return Number(Math.max(0.5, Math.min(180, totalSecs)).toFixed(2));
}

export interface SpeechWavOptions {
  durationSeconds?: number;
  sampleRate?: number; // default 48000
  pitchOffsetSemitones?: number;
  voicePersonaId?: TTSVoicePersonaId;
}

/**
 * Generates a valid standard 48 kHz 16-bit mono PCM WAV audio buffer containing
 * synthetic vocal formant tones corresponding to the chosen voice persona.
 */
export function generateSyntheticSpeechWav(
  text: string,
  options?: SpeechWavOptions,
): Uint8Array {
  const sampleRate = options?.sampleRate ?? 48000;
  const personaId = options?.voicePersonaId ?? 'narrator_epic';
  const persona = TTS_VOICE_PERSONAS[personaId] ?? TTS_VOICE_PERSONAS.narrator_epic;

  const durationSec =
    options?.durationSeconds ?? estimateSpeechDurationSeconds(text, persona.defaultRate);
  const totalSamples = Math.max(sampleRate / 4, Math.floor(sampleRate * durationSec));

  const pitchMultiplier = Math.pow(2, (options?.pitchOffsetSemitones ?? persona.defaultPitch) / 12);
  const f0 = persona.timbreProfile.fundamentalFreqHz * pitchMultiplier;
  const [f1, f2, f3] = persona.timbreProfile.formantFrequencies;

  // 16-bit PCM = 2 bytes per sample
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // 1. RIFF Chunk Header
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeAscii(view, 8, 'WAVE');

  // 2. fmt Chunk
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // 3. data Chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // 4. Synthesize Vocal Waveform Samples
  let byteOffset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Amplitude envelope: 50ms fade-in, 50ms fade-out
    const attack = Math.min(1, t / 0.05);
    const release = Math.min(1, (durationSec - t) / 0.05);
    const envelope = Math.max(0, attack * release);

    // Fundamental oscillation with formant harmonic resonance
    const fundamental = Math.sin(2 * Math.PI * f0 * t);
    const formant1 = 0.4 * Math.sin(2 * Math.PI * f1 * t);
    const formant2 = 0.25 * Math.sin(2 * Math.PI * f2 * t);
    const formant3 = 0.15 * Math.sin(2 * Math.PI * f3 * t);

    // Voice cadence modulation (speech rhythm pulsing every ~150ms)
    const cadence = 0.8 + 0.2 * Math.sin(2 * Math.PI * 6.5 * t);

    const raw = (fundamental + formant1 + formant2 + formant3) * envelope * cadence * 0.35;
    const sample = Math.max(-1, Math.min(1, raw));
    const int16 = sample < 0 ? sample * 32768 : sample * 32767;

    view.setInt16(byteOffset, Math.round(int16), true);
    byteOffset += 2;
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Creates a synchronized `SequenceClip` with `sourceKind: 'audio'` aligned with a caption cue.
 */
export function createSpeechAudioClipForCaption(
  captionClip: SequenceClip,
  audioFilePath: string,
  durationFrames: number,
  targetAudioTrackId: string,
  personaName = 'Narrator',
): SequenceClip {
  return {
    id: crypto.randomUUID(),
    sequenceId: captionClip.sequenceId,
    trackId: targetAudioTrackId,
    orderIndex: captionClip.orderIndex,
    sourceKind: 'audio',
    filePath: audioFilePath,
    startFrames: captionClip.startFrames ?? 0,
    durationFrames: Math.max(1, durationFrames),
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 2,
    fadeOutFrames: 2,
    label: `TTS: ${personaName} - ${captionClip.effects?.text?.text?.slice(0, 24) ?? 'Speech'}`,
    colorLabel: 'violet',
    overrides: [],
    linkedClipId: captionClip.id,
    syncOffsetFrames: 0,
  };
}
