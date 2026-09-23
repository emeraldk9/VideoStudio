import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  isCompoundClip,
  getCompoundClipMetadata,
  createCompoundClip,
  packCompoundClip,
  unpackCompoundClip,
  resolveActiveCompoundFrame,
} from '../compound-clip-ops';

describe('compound-clip-ops', () => {
  const mockTracks: SequenceTrack[] = [
    {
      id: 'track-v1',
      sequenceId: 'seq-parent',
      name: 'V1',
      kind: 'video',
      orderIndex: 0,
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 64,
      role: null,
    },
    {
      id: 'track-v2',
      sequenceId: 'seq-parent',
      name: 'V2',
      kind: 'video',
      orderIndex: 1,
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 64,
      role: null,
    },
    {
      id: 'track-a1',
      sequenceId: 'seq-parent',
      name: 'A1',
      kind: 'audio',
      orderIndex: 0,
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 36,
      role: null,
    },
  ];

  const clipA: SequenceClip = {
    id: 'clip-a',
    sequenceId: 'seq-parent',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    label: 'Shot A',
    filePath: '/media/shot_a.mp4',
    startFrames: 24,
    durationFrames: 48,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipB: SequenceClip = {
    id: 'clip-b',
    sequenceId: 'seq-parent',
    trackId: 'track-v2',
    orderIndex: 0,
    sourceKind: 'video',
    label: 'Overlay B',
    filePath: '/media/overlay_b.mp4',
    startFrames: 48,
    durationFrames: 60,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipAudio: SequenceClip = {
    id: 'clip-audio',
    sequenceId: 'seq-parent',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    label: 'SFX Music',
    filePath: '/media/music.mp3',
    startFrames: 30,
    durationFrames: 90,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: -3,
    fadeInFrames: 10,
    fadeOutFrames: 15,
    overrides: [],
  };

  describe('isCompoundClip and metadata', () => {
    it('detects compound clips by sourceKind or effects.compound', () => {
      expect(isCompoundClip(clipA)).toBe(false);

      const compound = createCompoundClip({
        sequenceId: 'seq-parent',
        trackId: 'track-v1',
        startFrames: 24,
        durationFrames: 96,
        label: 'Compound 1',
        compoundSettings: {
          nestedSequenceId: 'nested-1',
          nestedSequenceName: 'Compound 1',
          childClipCount: 2,
          childTrackCount: 2,
          durationFrames: 96,
        },
      });

      expect(isCompoundClip(compound)).toBe(true);
      expect(getCompoundClipMetadata(compound)?.nestedSequenceId).toBe('nested-1');
    });
  });

  describe('packCompoundClip', () => {
    it('packages multiple clips across tracks into a single compound clip', () => {
      const parentClips = [clipA, clipB, clipAudio];

      const { updatedClips, compoundClip, nestedDocument } = packCompoundClip({
        clips: parentClips,
        tracks: mockTracks,
        targetClipIds: ['clip-a', 'clip-b', 'clip-audio'],
        compoundName: 'Scene 1 Composite',
        sequenceId: 'seq-parent',
      });

      // All 3 selected clips are replaced by 1 compound clip
      expect(updatedClips).toHaveLength(1);
      expect(updatedClips[0].id).toBe(compoundClip.id);
      expect(compoundClip.sourceKind).toBe('compound');
      expect(compoundClip.label).toBe('Scene 1 Composite');

      // Earliest start is clipA (24), latest end is clipAudio (30 + 90 = 120)
      // Total duration = 120 - 24 = 96 frames
      expect(compoundClip.startFrames).toBe(24);
      expect(compoundClip.durationFrames).toBe(96);

      // Verify nested sequence document
      expect(nestedDocument.sequence.name).toBe('Scene 1 Composite');
      expect(nestedDocument.clips).toHaveLength(3);
      expect(nestedDocument.tracks).toHaveLength(3); // V1, V2, A1

      // Verify child clip time normalization relative to frame 24
      const nestedA = nestedDocument.clips.find((c) => c.label === 'Shot A')!;
      const nestedB = nestedDocument.clips.find((c) => c.label === 'Overlay B')!;
      const nestedAud = nestedDocument.clips.find((c) => c.label === 'SFX Music')!;

      expect(nestedA.startFrames).toBe(0); // 24 - 24
      expect(nestedB.startFrames).toBe(24); // 48 - 24
      expect(nestedAud.startFrames).toBe(6); // 30 - 24
    });

    it('leaves unselected clips intact on the parent timeline', () => {
      const unselectedClip: SequenceClip = {
        ...clipA,
        id: 'unselected-clip',
        startFrames: 200,
        durationFrames: 50,
      };

      const parentClips = [clipA, clipB, unselectedClip];

      const { updatedClips } = packCompoundClip({
        clips: parentClips,
        tracks: mockTracks,
        targetClipIds: ['clip-a', 'clip-b'],
        sequenceId: 'seq-parent',
      });

      // 2 clips packed + 1 unselected = 2 clips total (1 compound + 1 unselected)
      expect(updatedClips).toHaveLength(2);
      expect(updatedClips.some((c) => c.id === 'unselected-clip')).toBe(true);
    });
  });

  describe('unpackCompoundClip', () => {
    it('decomposes a compound clip in place and restores original relative timing', () => {
      const parentClips = [clipA, clipB];

      const { compoundClip } = packCompoundClip({
        clips: parentClips,
        tracks: mockTracks,
        targetClipIds: ['clip-a', 'clip-b'],
        sequenceId: 'seq-parent',
      });

      // Now unpack the compound clip
      const { updatedClips, unpackedClips } = unpackCompoundClip({
        clips: [compoundClip],
        tracks: mockTracks,
        compoundClipId: compoundClip.id,
      });

      expect(updatedClips).toHaveLength(2);
      expect(unpackedClips).toHaveLength(2);

      const restoredA = unpackedClips.find((c) => c.label === 'Shot A')!;
      const restoredB = unpackedClips.find((c) => c.label === 'Overlay B')!;

      // Starts should be faithfully restored: Shot A at 24, Overlay B at 48
      expect(restoredA.startFrames).toBe(24);
      expect(restoredB.startFrames).toBe(48);
      expect(restoredA.durationFrames).toBe(48);
      expect(restoredB.durationFrames).toBe(60);
    });
  });

  describe('resolveActiveCompoundFrame', () => {
    it('resolves active child clips at given parent playhead position', () => {
      const { compoundClip } = packCompoundClip({
        clips: [clipA, clipB],
        tracks: mockTracks,
        targetClipIds: ['clip-a', 'clip-b'],
        sequenceId: 'seq-parent',
      });

      // Compound starts at frame 24.
      // At playhead 30: nestedFrame = 6 (inside Shot A, before Overlay B)
      const res1 = resolveActiveCompoundFrame({
        compoundClip,
        playheadFrame: 30,
        clipStartFrames: 24,
      });
      expect(res1.nestedFrame).toBe(6);
      expect(res1.activeChildClips).toHaveLength(1);
      expect(res1.activeChildClips[0].label).toBe('Shot A');

      // At playhead 50: nestedFrame = 26 (inside both Shot A and Overlay B)
      const res2 = resolveActiveCompoundFrame({
        compoundClip,
        playheadFrame: 50,
        clipStartFrames: 24,
      });
      expect(res2.nestedFrame).toBe(26);
      expect(res2.activeChildClips).toHaveLength(2);

      // Outside compound clip window
      const res3 = resolveActiveCompoundFrame({
        compoundClip,
        playheadFrame: 150,
        clipStartFrames: 24,
      });
      expect(res3.activeChildClips).toHaveLength(0);
    });
  });
});
