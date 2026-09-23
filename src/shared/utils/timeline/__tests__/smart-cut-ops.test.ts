import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceDocument } from '../../../types/sequence';
import {
  applySmartJumpCutsToSequence,
  detectFillerWordsInClips,
  detectTimelineSilences,
  mergeCutIntervals,
  normalizeToken,
  scanSequenceForSmartCuts,
  type CutInterval,
} from '../smart-cut-ops';

describe('smart-cut-ops', () => {
  describe('normalizeToken', () => {
    it('lowercases and removes leading/trailing punctuation', () => {
      expect(normalizeToken('Um...')).toBe('um');
      expect(normalizeToken('"Like,"')).toBe('like');
      expect(normalizeToken('UH?!')).toBe('uh');
      expect(normalizeToken('actually')).toBe('actually');
    });
  });

  describe('detectTimelineSilences', () => {
    it('detects silence gaps between audio clips', () => {
      // Audio clip 1: 0 to 60 (2.0s at 30fps)
      // Audio clip 2: 120 to 180 (4.0s to 6.0s) -> Gap is 60 frames (2.0s)
      const audioClips: SequenceClip[] = [
        {
          id: 'a1',
          sequenceId: 'seq1',
          trackId: 'a1-track',
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
          label: 'Audio 1',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
        {
          id: 'a2',
          sequenceId: 'seq1',
          trackId: 'a1-track',
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
          label: 'Audio 2',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
      ];

      const silences = detectTimelineSilences(audioClips, 180, 30, 0.4, 0.08);
      expect(silences.length).toBe(1);

      const cut = silences[0];
      expect(cut.type).toBe('silence');
      // Gap was 60 to 120. With 0.08s (2.4 frames) padding on both ends:
      expect(cut.startFrame).toBeGreaterThanOrEqual(60);
      expect(cut.endFrame).toBeLessThanOrEqual(120);
      expect(cut.durationFrames).toBeGreaterThan(45);
    });

    it('ignores gaps shorter than minSilenceDurationSec', () => {
      // 5-frame gap (~0.16s at 30fps)
      const audioClips: SequenceClip[] = [
        {
          id: 'a1',
          sequenceId: 'seq1',
          trackId: 'a1-track',
          orderIndex: 0,
          sourceKind: 'audio',
          filePath: '/audio1.wav',
          startFrames: 0,
          durationFrames: 30,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Audio 1',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
        {
          id: 'a2',
          sequenceId: 'seq1',
          trackId: 'a1-track',
          orderIndex: 1,
          sourceKind: 'audio',
          filePath: '/audio2.wav',
          startFrames: 35,
          durationFrames: 30,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Audio 2',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
      ];

      const silences = detectTimelineSilences(audioClips, 65, 30, 0.4, 0.05);
      expect(silences.length).toBe(0);
    });
  });

  describe('detectFillerWordsInClips', () => {
    it('detects filler words and computes approximate frame intervals', () => {
      const subtitleClips: SequenceClip[] = [
        {
          id: 'sub1',
          sequenceId: 'seq1',
          trackId: 'text-track',
          orderIndex: 0,
          sourceKind: 'text',
          filePath: null,
          startFrames: 30,
          durationFrames: 90, // 3 seconds, 6 words -> ~15 frames per word
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Subtitle',
          colorLabel: 'violet',
          overrides: [],
          effects: {
            text: {
              text: 'Um welcome everyone, like today we start.',
              fontSizePx: 36,
              colorHex: '#ffffff',
              align: 'center',
              positionPct: { x: 0.5, y: 0.8 },
              anchor: 'bottom',
              preset: 'caption',
            },
          },
        },
      ];

      const fillers = detectFillerWordsInClips(subtitleClips, ['um', 'like'], 30);
      expect(fillers.length).toBe(2);

      expect(fillers[0].type).toBe('filler');
      expect(fillers[0].label).toContain('Um');
      expect(fillers[0].startFrame).toBe(30);

      expect(fillers[1].label).toContain('like');
      expect(fillers[1].startFrame).toBeGreaterThan(30);
    });
  });

  describe('mergeCutIntervals', () => {
    it('merges overlapping cut intervals into a single span', () => {
      const cuts: CutInterval[] = [
        {
          id: 'c1',
          startFrame: 30,
          endFrame: 50,
          durationFrames: 20,
          durationSec: 0.67,
          type: 'silence',
          label: 'Silence 1',
        },
        {
          id: 'c2',
          startFrame: 45,
          endFrame: 70,
          durationFrames: 25,
          durationSec: 0.83,
          type: 'filler',
          label: 'Filler "um"',
        },
        {
          id: 'c3',
          startFrame: 100,
          endFrame: 120,
          durationFrames: 20,
          durationSec: 0.67,
          type: 'silence',
          label: 'Silence 2',
        },
      ];

      const merged = mergeCutIntervals(cuts);
      expect(merged.length).toBe(2);

      expect(merged[0].startFrame).toBe(30);
      expect(merged[0].endFrame).toBe(70);
      expect(merged[0].durationFrames).toBe(40);

      expect(merged[1].startFrame).toBe(100);
      expect(merged[1].endFrame).toBe(120);
    });
  });

  describe('applySmartJumpCutsToSequence', () => {
    const mockDocument: SequenceDocument = {
      sequence: {
        id: 'seq-master',
        projectId: 'proj-1',
        name: 'Vlog Master',
        width: 1920,
        height: 1080,
        fps: 30,
        durationFrames: 180,
        createdAt: '2026-09-23T00:00:00Z',
        updatedAt: '2026-09-23T00:00:00Z',
      },
      tracks: [
        {
          id: 'v1',
          sequenceId: 'seq-master',
          kind: 'video',
          role: null,
          name: 'Video 1',
          orderIndex: 0,
          locked: false,
          muted: false,
          magnetic: true,
          videoEnabled: true,
          heightPx: 64,
        },
        {
          id: 'a1',
          sequenceId: 'seq-master',
          kind: 'audio',
          role: null,
          name: 'Audio 1',
          orderIndex: 1,
          locked: false,
          muted: false,
          magnetic: true,
          videoEnabled: false,
          heightPx: 48,
        },
      ],
      clips: [
        {
          id: 'vid-1',
          sequenceId: 'seq-master',
          trackId: 'v1',
          orderIndex: 0,
          sourceKind: 'video',
          filePath: '/vlog.mp4',
          startFrames: 0,
          durationFrames: 180,
          sourceInFrames: 0,
          sourceOutFrames: 180,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Vlog Take',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
        {
          id: 'aud-1',
          sequenceId: 'seq-master',
          trackId: 'a1',
          orderIndex: 0,
          sourceKind: 'audio',
          filePath: '/vlog.mp4',
          startFrames: 0,
          durationFrames: 180,
          sourceInFrames: 0,
          sourceOutFrames: 180,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Vlog Audio',
          colorLabel: 'emerald',
          overrides: [],
          effects: {},
        },
      ],
    } as unknown as SequenceDocument;

    it('slices clips, collapses gaps, and applies micro-fades to audio cuts', () => {
      // Cut interval: frame 60 to 90 (30 frames cut)
      const cuts: CutInterval[] = [
        {
          id: 'cut-1',
          startFrame: 60,
          endFrame: 90,
          durationFrames: 30,
          durationSec: 1.0,
          type: 'silence',
          label: 'Pause (1.0s)',
        },
      ];

      const result = applySmartJumpCutsToSequence(mockDocument, cuts, { microFadeFrames: 4 });

      expect(result.cutCount).toBe(1);
      expect(result.savedDurationFrames).toBe(30);
      expect(result.savedDurationSec).toBe(1.0);

      // Vid-1 and Aud-1 should each be split into 2 clips (head: 0-60, tail: 60-150)
      const vidClips = result.document.clips.filter((c) => c.sourceKind === 'video');
      expect(vidClips.length).toBe(2);

      // Head video
      expect(vidClips[0].startFrames).toBe(0);
      expect(vidClips[0].durationFrames).toBe(60);

      // Tail video (starts at 60 now, since 30 frames were cut!)
      expect(vidClips[1].startFrames).toBe(60);
      expect(vidClips[1].durationFrames).toBe(90);
      expect(vidClips[1].sourceInFrames).toBe(90);

      // Audio clips should have micro-fades
      const audClips = result.document.clips.filter((c) => c.sourceKind === 'audio');
      expect(audClips.length).toBe(2);
      expect(audClips[0].fadeOutFrames).toBe(4);
      expect(audClips[1].fadeInFrames).toBe(4);
    });

    it('scans sequence and returns consolidated cuts', () => {
      const cuts = scanSequenceForSmartCuts(mockDocument, {
        enableSilenceRemoval: true,
        minSilenceDurationSec: 0.5,
      });
      expect(Array.isArray(cuts)).toBe(true);
    });
  });
});
