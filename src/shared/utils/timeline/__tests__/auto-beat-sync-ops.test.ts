import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceDocument } from '../../../types/sequence';
import {
  applyAutoBeatSyncToSequence,
  buildAudioEnergyEnvelope,
  generateBeatSyncMarkers,
  snapSubtitlesToBeatGrid,
} from '../auto-beat-sync-ops';

describe('auto-beat-sync-ops', () => {
  const mockAudioClip: SequenceClip = {
    id: 'music-1',
    sequenceId: 'seq-1',
    trackId: 'a1',
    orderIndex: 0,
    sourceKind: 'audio',
    filePath: '/bgm.mp3',
    startFrames: 0,
    durationFrames: 180, // 6 seconds at 30fps
    sourceInFrames: 0,
    sourceOutFrames: 180,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'BGM Track',
    colorLabel: 'emerald',
    overrides: [],
    effects: {},
  };

  describe('buildAudioEnergyEnvelope', () => {
    it('generates energy envelope across timeline duration', () => {
      const envelope = buildAudioEnergyEnvelope([mockAudioClip], 180);
      expect(envelope.length).toBe(180);
      expect(envelope.some((v) => v > 0)).toBe(true);
    });
  });

  describe('generateBeatSyncMarkers', () => {
    it('generates rhythmic markers in drops_and_snares mode', () => {
      const { markers, bpm } = generateBeatSyncMarkers([mockAudioClip], 180, {
        mode: 'drops_and_snares',
        fps: 30,
        customBpm: 120, // 15 frames per beat at 30fps
      });

      expect(bpm).toBe(120);
      expect(markers.length).toBeGreaterThan(5);

      const drops = markers.filter((m) => m.isDrop);
      expect(drops.length).toBeGreaterThan(0);
      expect(drops[0].color).toBe('ai');
    });

    it('generates metronomic markers in metronomic_bpm mode', () => {
      const { markers, bpm } = generateBeatSyncMarkers([mockAudioClip], 180, {
        mode: 'metronomic_bpm',
        subdivision: 'bar_1',
        customBpm: 120, // Bar = 4 beats = 60 frames
        fps: 30,
      });

      expect(bpm).toBe(120);
      // At 60 frames per bar in 180 frames -> ~3-4 bars
      expect(markers.length).toBeGreaterThanOrEqual(3);
      expect(markers[0].frame).toBe(0);
      expect(markers[1].frame).toBe(60);
    });
  });

  describe('snapSubtitlesToBeatGrid', () => {
    it('snaps subtitle cues close to beats within tolerance', () => {
      const beatFrames = [0, 60, 120, 180];
      const subClips: SequenceClip[] = [
        {
          id: 'sub-1',
          sequenceId: 'seq-1',
          trackId: 'text-1',
          orderIndex: 0,
          sourceKind: 'text',
          filePath: null,
          startFrames: 58, // 2 frames away from beat 60
          durationFrames: 45,
          sourceInFrames: null,
          sourceOutFrames: null,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Subtitle 1',
          colorLabel: 'violet',
          overrides: [],
          effects: {
            text: {
              text: 'Rhythmic caption',
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

      const { updatedClips, snappedCount } = snapSubtitlesToBeatGrid(subClips, beatFrames, 5);
      expect(snappedCount).toBe(1);
      expect(updatedClips[0].startFrames).toBe(60);
    });

    it('leaves subtitle cues untouched if outside tolerance', () => {
      const beatFrames = [0, 60, 120, 180];
      const subClips: SequenceClip[] = [
        {
          id: 'sub-1',
          sequenceId: 'seq-1',
          trackId: 'text-1',
          orderIndex: 0,
          sourceKind: 'text',
          filePath: null,
          startFrames: 30, // 30 frames away from nearest beat (0 or 60)
          durationFrames: 25,
          sourceInFrames: null,
          sourceOutFrames: null,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: 'Subtitle 1',
          colorLabel: 'violet',
          overrides: [],
          effects: {
            text: {
              text: 'Offbeat caption',
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

      const { updatedClips, snappedCount } = snapSubtitlesToBeatGrid(subClips, beatFrames, 5);
      expect(snappedCount).toBe(0);
      expect(updatedClips[0].startFrames).toBe(30);
    });
  });

  describe('applyAutoBeatSyncToSequence', () => {
    const mockDocument: SequenceDocument = {
      sequence: {
        id: 'seq-dance',
        projectId: 'proj-1',
        name: 'Music Video',
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
          sequenceId: 'seq-dance',
          kind: 'video',
          role: null,
          name: 'Video Track',
          orderIndex: 0,
          locked: false,
          muted: false,
          magnetic: true,
          videoEnabled: true,
          heightPx: 64,
        },
        {
          id: 'a1',
          sequenceId: 'seq-dance',
          kind: 'audio',
          role: null,
          name: 'Music Track',
          orderIndex: 1,
          locked: false,
          muted: false,
          magnetic: false,
          videoEnabled: false,
          heightPx: 48,
        },
      ],
      clips: [
        {
          id: 'vid-long',
          sequenceId: 'seq-dance',
          trackId: 'v1',
          orderIndex: 0,
          sourceKind: 'video',
          filePath: '/dance.mp4',
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
          label: 'Dance Continuous',
          colorLabel: 'cyan',
          overrides: [],
          effects: {},
        },
        mockAudioClip,
      ],
    } as unknown as SequenceDocument;

    it('slices video clips into dynamic montage cuts on beats', () => {
      const result = applyAutoBeatSyncToSequence(mockDocument, {
        mode: 'metronomic_bpm',
        subdivision: 'bar_1',
        customBpm: 120, // 60 frames per cut
        autoCutVideo: true,
        targetVideoTrackId: 'v1',
        minSegmentFrames: 20,
        fps: 30,
      });

      expect(result.cutsCount).toBeGreaterThan(0);
      const vClips = result.document.clips.filter((c) => c.trackId === 'v1');
      expect(vClips.length).toBeGreaterThan(1);
    });

    it('supports duplicating sequence for non-destructive montage creation', () => {
      const result = applyAutoBeatSyncToSequence(mockDocument, {
        duplicateSequence: true,
      });

      expect(result.document.sequence.id).not.toBe(mockDocument.sequence.id);
      expect(result.document.sequence.name).toContain('[Beat Sync]');
    });
  });
});
