import { describe, it, expect } from 'vitest';
import {
  TTS_VOICE_PERSONAS,
  estimateSpeechDurationSeconds,
  generateSyntheticSpeechWav,
  createSpeechAudioClipForCaption,
  type TTSVoicePersonaId,
} from '../tts-generator-ops';
import type { SequenceClip } from '../../../types/sequence';

describe('tts-generator-ops', () => {
  describe('TTS_VOICE_PERSONAS', () => {
    it('defines 6 distinct voice personas with valid timbre profiles', () => {
      const personas = Object.keys(TTS_VOICE_PERSONAS) as TTSVoicePersonaId[];
      expect(personas).toEqual([
        'narrator_epic',
        'storyteller_female',
        'cyber_robot',
        'calm_educator',
        'energetic_creator',
        'news_anchor',
      ]);

      for (const p of Object.values(TTS_VOICE_PERSONAS)) {
        expect(p.name).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.defaultRate).toBeGreaterThanOrEqual(0.5);
        expect(p.defaultRate).toBeLessThanOrEqual(2.0);
        expect(p.timbreProfile.fundamentalFreqHz).toBeGreaterThan(50);
        expect(p.timbreProfile.formantFrequencies).toHaveLength(3);
      }
    });
  });

  describe('estimateSpeechDurationSeconds', () => {
    it('returns a minimum safe duration for empty or whitespace text', () => {
      expect(estimateSpeechDurationSeconds('')).toBe(0.5);
      expect(estimateSpeechDurationSeconds('   ')).toBe(0.5);
    });

    it('estimates reasonable durations for short and long sentences', () => {
      const short = estimateSpeechDurationSeconds('Welcome to VideoStudio.');
      expect(short).toBeGreaterThan(0.8);
      expect(short).toBeLessThan(3.0);

      const long = estimateSpeechDurationSeconds(
        'In this tutorial, we will explore advanced video compositing, optical flow retiming, and broadcast audio mastering.'
      );
      expect(long).toBeGreaterThan(4.0);
      expect(long).toBeLessThan(12.0);
    });

    it('scales duration inversely with speech rate', () => {
      const sentence = 'Fast or slow speech timing test with punctuation.';
      const normal = estimateSpeechDurationSeconds(sentence, 1.0);
      const fast = estimateSpeechDurationSeconds(sentence, 1.5);
      const slow = estimateSpeechDurationSeconds(sentence, 0.75);

      expect(fast).toBeLessThan(normal);
      expect(slow).toBeGreaterThan(normal);
    });
  });

  describe('generateSyntheticSpeechWav', () => {
    it('generates a valid RIFF/WAVE header and 16-bit PCM samples', () => {
      const wavBytes = generateSyntheticSpeechWav('Hello world', {
        durationSeconds: 1.0,
        sampleRate: 48000,
        voicePersonaId: 'narrator_epic',
      });

      expect(wavBytes.length).toBeGreaterThan(44);

      // Check RIFF header: "RIFF"
      const riffHeader = String.fromCharCode(...wavBytes.slice(0, 4));
      expect(riffHeader).toBe('RIFF');

      // Check WAVE header: "WAVE"
      const waveHeader = String.fromCharCode(...wavBytes.slice(8, 12));
      expect(waveHeader).toBe('WAVE');

      // Check fmt chunk: "fmt "
      const fmtHeader = String.fromCharCode(...wavBytes.slice(12, 16));
      expect(fmtHeader).toBe('fmt ');

      // Check data chunk: "data"
      const dataHeader = String.fromCharCode(...wavBytes.slice(36, 40));
      expect(dataHeader).toBe('data');

      // 1.0 second @ 48000 Hz, 16-bit mono = 48000 * 2 = 96000 bytes + 44 byte header = 96044 bytes
      expect(wavBytes.length).toBe(96044);
    });
  });

  describe('createSpeechAudioClipForCaption', () => {
    const mockCaption: SequenceClip = {
      id: 'caption-cue-1',
      sequenceId: 'seq-1',
      trackId: 'track-captions',
      orderIndex: 0,
      sourceKind: 'text',
      filePath: null,
      startFrames: 60,
      durationFrames: 90,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Caption Cue 1',
      overrides: [],
      effects: {
        text: {
          text: 'Deep learning audio synthesis in VideoStudio',
          fontSizePx: 44,
          colorHex: '#FFFFFF',
          align: 'center',
          positionPct: { x: 0.5, y: 0.85 },
          preset: 'caption',
        },
      },
    };

    it('creates an aligned audio clip with matching sequence and linkedClipId', () => {
      const audioClip = createSpeechAudioClipForCaption(
        mockCaption,
        '/media/tts_voice_1.wav',
        75,
        'track-speech',
        'Narrator',
      );

      expect(audioClip.sourceKind).toBe('audio');
      expect(audioClip.trackId).toBe('track-speech');
      expect(audioClip.startFrames).toBe(60); // Exact alignment with caption
      expect(audioClip.durationFrames).toBe(75);
      expect(audioClip.filePath).toBe('/media/tts_voice_1.wav');
      expect(audioClip.linkedClipId).toBe('caption-cue-1');
      expect(audioClip.label).toContain('TTS: Narrator');
    });
  });
});
