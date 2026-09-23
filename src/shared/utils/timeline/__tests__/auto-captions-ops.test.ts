import { describe, expect, it } from 'vitest';
import {
  CADENCE_PACING_PRESETS,
  SPOKEN_LANGUAGES,
  detectSpeechSegmentsVAD,
  groupWordsIntoCues,
  transcribeSpeechUtterances,
  generateAutoCaptionsForSequence,
  type SpeechSegment,
} from '../auto-captions-ops';
import type { SequenceClip, SequenceDocument } from '../../../types/sequence';

describe('auto-captions-ops (Step S80: AI Auto-Captions & Cadence Alignment)', () => {
  describe('Presets & Language Registries', () => {
    it('defines standard cadence pacing presets', () => {
      expect(CADENCE_PACING_PRESETS.viral_punchy.maxCpl).toBe(18);
      expect(CADENCE_PACING_PRESETS.viral_punchy.maxWordsPerCue).toBe(3);
      expect(CADENCE_PACING_PRESETS.standard_broadcast.maxCpl).toBe(37);
      expect(CADENCE_PACING_PRESETS.short_phrase.maxCpl).toBe(26);
    });

    it('contains major spoken languages with sample phrases', () => {
      expect(SPOKEN_LANGUAGES.en.samplePhrases.length).toBeGreaterThan(0);
      expect(SPOKEN_LANGUAGES.es.samplePhrases.length).toBeGreaterThan(0);
      expect(SPOKEN_LANGUAGES.ja.samplePhrases.length).toBeGreaterThan(0);
      expect(SPOKEN_LANGUAGES.vi.samplePhrases.length).toBeGreaterThan(0);
    });
  });

  describe('detectSpeechSegmentsVAD', () => {
    it('returns empty array when no audio clips provided', () => {
      expect(detectSpeechSegmentsVAD([])).toEqual([]);
    });

    it('merges audio clips within silence gap threshold', () => {
      // 30 fps: clip 1: 0 to 60 frames (0.0s to 2.0s)
      // clip 2: 66 to 120 frames (2.2s to 4.0s) -> gap is 0.2s (< 0.35s default threshold)
      const clips: SequenceClip[] = [
        {
          id: 'audio-1',
          sequenceId: 'seq-1',
          trackId: 'track-a1',
          orderIndex: 0,
          sourceKind: 'audio',
          filePath: '/audio1.wav',
          startFrames: 0,
          durationFrames: 60,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Voiceover 1',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
        {
          id: 'audio-2',
          sequenceId: 'seq-1',
          trackId: 'track-a1',
          orderIndex: 1,
          sourceKind: 'audio',
          filePath: '/audio2.wav',
          startFrames: 66,
          durationFrames: 54,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Voiceover 2',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
      ];

      const merged = detectSpeechSegmentsVAD(clips, 30, 0.35);
      expect(merged.length).toBe(1);
      expect(merged[0].startSec).toBe(0);
      expect(merged[0].endSec).toBe(4.0);
    });

    it('separates audio clips when silence gap exceeds threshold', () => {
      // clip 1: 0 to 60 frames (0.0s to 2.0s)
      // clip 2: 120 to 180 frames (4.0s to 6.0s) -> gap is 2.0s (> 0.35s threshold)
      const clips: SequenceClip[] = [
        {
          id: 'audio-1',
          sequenceId: 'seq-1',
          trackId: 'track-a1',
          orderIndex: 0,
          sourceKind: 'audio',
          filePath: '/audio1.wav',
          startFrames: 0,
          durationFrames: 60,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Voiceover 1',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
        {
          id: 'audio-2',
          sequenceId: 'seq-1',
          trackId: 'track-a1',
          orderIndex: 1,
          sourceKind: 'audio',
          filePath: '/audio2.wav',
          startFrames: 120,
          durationFrames: 60,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Voiceover 2',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
      ];

      const intervals = detectSpeechSegmentsVAD(clips, 30, 0.35);
      expect(intervals.length).toBe(2);
      expect(intervals[0].startSec).toBe(0);
      expect(intervals[0].endSec).toBe(2.0);
      expect(intervals[1].startSec).toBe(4.0);
      expect(intervals[1].endSec).toBe(6.0);
    });
  });

  describe('transcribeSpeechUtterances', () => {
    it('produces speech segments with timed words and valid monotonic timestamps', () => {
      const intervals = [{ startSec: 1.0, endSec: 4.5 }];
      const segments = transcribeSpeechUtterances(intervals, 'en');

      expect(segments.length).toBe(1);
      const seg = segments[0];
      expect(seg.words.length).toBeGreaterThan(0);
      expect(seg.startSec).toBe(1.0);
      expect(seg.endSec).toBe(4.5);

      for (let i = 0; i < seg.words.length; i++) {
        const w = seg.words[i];
        expect(w.startSec).toBeLessThan(w.endSec);
        expect(w.confidence).toBeGreaterThanOrEqual(0.9);
        if (i > 0) {
          expect(w.startSec).toBeGreaterThanOrEqual(seg.words[i - 1].startSec);
        }
      }
    });

    it('handles multiple spoken languages', () => {
      const intervals = [{ startSec: 0, endSec: 3.0 }];
      const esSegments = transcribeSpeechUtterances(intervals, 'es');
      const jaSegments = transcribeSpeechUtterances(intervals, 'ja');

      expect(esSegments[0].text.length).toBeGreaterThan(0);
      expect(jaSegments[0].text.length).toBeGreaterThan(0);
    });
  });

  describe('groupWordsIntoCues', () => {
    it('groups words into punchy viral cues (1-3 words, max 18 CPL)', () => {
      const mockSegment: SpeechSegment = {
        id: 'seg-1',
        startSec: 0,
        endSec: 4.0,
        text: 'The quick brown fox jumps over the lazy dog',
        words: [
          { word: 'The', startSec: 0.0, endSec: 0.3, confidence: 0.95 },
          { word: 'quick', startSec: 0.3, endSec: 0.7, confidence: 0.95 },
          { word: 'brown', startSec: 0.7, endSec: 1.1, confidence: 0.95 },
          { word: 'fox', startSec: 1.1, endSec: 1.5, confidence: 0.95 },
          { word: 'jumps', startSec: 1.5, endSec: 2.0, confidence: 0.95 },
          { word: 'over', startSec: 2.0, endSec: 2.5, confidence: 0.95 },
          { word: 'the', startSec: 2.5, endSec: 2.8, confidence: 0.95 },
          { word: 'lazy', startSec: 2.8, endSec: 3.3, confidence: 0.95 },
          { word: 'dog', startSec: 3.3, endSec: 3.8, confidence: 0.95 },
        ],
      };

      const cues = groupWordsIntoCues([mockSegment], 'viral_punchy');
      expect(cues.length).toBeGreaterThanOrEqual(3);

      for (const cue of cues) {
        expect(cue.words.length).toBeLessThanOrEqual(3);
        expect(cue.text.length).toBeLessThanOrEqual(18);
        expect(cue.startSec).toBeLessThan(cue.endSec);
      }
    });

    it('groups words conforming to broadcast standard (37 CPL)', () => {
      const mockSegment: SpeechSegment = {
        id: 'seg-1',
        startSec: 0,
        endSec: 5.0,
        text: 'Welcome to this in-depth masterclass on video editing and storytelling',
        words: [
          { word: 'Welcome', startSec: 0.0, endSec: 0.5, confidence: 0.96 },
          { word: 'to', startSec: 0.5, endSec: 0.7, confidence: 0.96 },
          { word: 'this', startSec: 0.7, endSec: 1.0, confidence: 0.96 },
          { word: 'in-depth', startSec: 1.0, endSec: 1.6, confidence: 0.96 },
          { word: 'masterclass', startSec: 1.6, endSec: 2.4, confidence: 0.96 },
          { word: 'on', startSec: 2.4, endSec: 2.6, confidence: 0.96 },
          { word: 'video', startSec: 2.6, endSec: 3.1, confidence: 0.96 },
          { word: 'editing', startSec: 3.1, endSec: 3.7, confidence: 0.96 },
          { word: 'and', startSec: 3.7, endSec: 4.0, confidence: 0.96 },
          { word: 'storytelling', startSec: 4.0, endSec: 4.9, confidence: 0.96 },
        ],
      };

      const cues = groupWordsIntoCues([mockSegment], 'standard_broadcast');
      expect(cues.length).toBeGreaterThanOrEqual(1);

      for (const cue of cues) {
        expect(cue.text.length).toBeLessThanOrEqual(37);
      }
    });
  });

  describe('generateAutoCaptionsForSequence', () => {
    const mockDocument = {
      sequence: {
        id: 'seq-1',
        name: 'Main Sequence',
        width: 1920,
        height: 1080,
        fps: 30,
        sampleRate: 48000,
        audioChannels: 2,
      },
      tracks: [
        {
          id: 'v1',
          sequenceId: 'seq-1',
          kind: 'video',
          role: null,
          name: 'Video 1',
          orderIndex: 0,
          locked: false,
          muted: false,
          magnetic: false,
          videoEnabled: true,
          heightPx: 64,
        },
        {
          id: 'sub1',
          sequenceId: 'seq-1',
          kind: 'video',
          role: 'text',
          name: 'Subtitles',
          orderIndex: 1,
          locked: false,
          muted: false,
          magnetic: false,
          videoEnabled: true,
          heightPx: 28,
        },
        {
          id: 'a1',
          sequenceId: 'seq-1',
          kind: 'audio',
          role: 'narration',
          name: 'Dialogue A1',
          orderIndex: 0,
          locked: false,
          muted: false,
          magnetic: false,
          videoEnabled: false,
          heightPx: 36,
        },
      ],
      clips: [
        {
          id: 'audio-voice',
          sequenceId: 'seq-1',
          trackId: 'a1',
          orderIndex: 0,
          sourceKind: 'audio',
          filePath: '/dialogue.wav',
          startFrames: 15,
          durationFrames: 90, // 3 seconds at 30 fps
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Dialogue Speech',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
      ],
    } as unknown as SequenceDocument;

    it('generates subtitle SequenceClips assigned to target text track', () => {
      const generated = generateAutoCaptionsForSequence(mockDocument, {
        targetTrackId: 'sub1',
        language: 'en',
        pacingPreset: 'short_phrase',
        stylePresetId: 'modern',
      });

      expect(generated.length).toBeGreaterThan(0);
      for (const clip of generated) {
        expect(clip.trackId).toBe('sub1');
        expect(clip.sourceKind).toBe('text');
        expect(clip.effects?.text).toBeDefined();
        expect(clip.effects?.text?.text).toBe(clip.label);
        expect(clip.effects?.text?.preset).toBe('caption');
        expect(clip.startFrames).toBeGreaterThanOrEqual(0);
        expect(clip.durationFrames).toBeGreaterThan(0);
      }
    });

    it('handles documents with no audio clips via graceful demonstration fallback', () => {
      const silentDoc: SequenceDocument = {
        ...mockDocument,
        clips: [],
      };

      const generated = generateAutoCaptionsForSequence(silentDoc, {
        targetTrackId: 'sub1',
        language: 'es',
        pacingPreset: 'viral_punchy',
      });

      expect(generated.length).toBeGreaterThan(0);
      expect(generated[0].effects?.text?.animation?.type).toBe('karaoke_highlight');
    });
  });
});
