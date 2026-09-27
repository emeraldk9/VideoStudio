import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  applyMultiTrackMagneticRipple,
  closeGapsSynchronized,
  isTrackSyncLocked,
  rippleTrimClipMultiTrack,
} from '../magnetic-ripple-ops';

describe('magnetic-ripple-ops', () => {
  const videoTrack1: SequenceTrack = {
    id: 'track-v1',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'V1 Main Video',
    orderIndex: 0,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 64,
    role: null,
    syncLocked: true,
  };

  const videoTrack2: SequenceTrack = {
    id: 'track-v2',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'V2 B-Roll Overlay',
    orderIndex: 1,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 64,
    role: 'overlay',
    syncLocked: true,
  };

  const audioTrackNarration: SequenceTrack = {
    id: 'track-a1',
    sequenceId: 'seq-1',
    kind: 'audio',
    name: 'A1 Dialogue',
    orderIndex: 0,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 36,
    role: 'narration',
    syncLocked: true,
  };

  const audioTrackMusic: SequenceTrack = {
    id: 'track-a2',
    sequenceId: 'seq-1',
    kind: 'audio',
    name: 'A2 Music Bed',
    orderIndex: 1,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 36,
    role: 'music',
    syncLocked: false, // User turned off sync-lock for music bed!
  };

  const lockedTrack: SequenceTrack = {
    id: 'track-locked',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'V3 Watermark (Locked)',
    orderIndex: 2,
    magnetic: false,
    locked: true,
    muted: false,
    videoEnabled: true,
    heightPx: 64,
    role: null,
    syncLocked: true,
  };

  const tracks: SequenceTrack[] = [
    videoTrack1,
    videoTrack2,
    audioTrackNarration,
    audioTrackMusic,
    lockedTrack,
  ];

  const clipV1_A: SequenceClip = {
    id: 'clip-v1-a',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    label: 'Intro Shot',
    filePath: '/media/intro.mp4',
    startFrames: 0,
    durationFrames: 48,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipV1_B: SequenceClip = {
    id: 'clip-v1-b',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 1,
    sourceKind: 'video',
    label: 'Main Interview',
    filePath: '/media/interview.mp4',
    startFrames: 48,
    durationFrames: 96,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipV2_Cutaway: SequenceClip = {
    id: 'clip-v2-cutaway',
    sequenceId: 'seq-1',
    trackId: 'track-v2',
    orderIndex: 0,
    sourceKind: 'video',
    label: 'B-Roll Cutaway',
    filePath: '/media/broll.mp4',
    startFrames: 60,
    durationFrames: 36,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipA1_Voice: SequenceClip = {
    id: 'clip-a1-voice',
    sequenceId: 'seq-1',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    label: 'Voiceover',
    filePath: '/media/voice.wav',
    startFrames: 48,
    durationFrames: 96,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipA2_MusicBed: SequenceClip = {
    id: 'clip-a2-music',
    sequenceId: 'seq-1',
    trackId: 'track-a2',
    orderIndex: 0,
    sourceKind: 'audio',
    label: 'Background Score',
    filePath: '/media/music.mp3',
    startFrames: 0,
    durationFrames: 300,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const clipLocked_Watermark: SequenceClip = {
    id: 'clip-watermark',
    sequenceId: 'seq-1',
    trackId: 'track-locked',
    orderIndex: 0,
    sourceKind: 'video',
    label: 'Bug Watermark',
    filePath: '/media/watermark.png',
    startFrames: 100,
    durationFrames: 100,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    overrides: [],
  };

  const sampleClips: SequenceClip[] = [
    clipV1_A,
    clipV1_B,
    clipV2_Cutaway,
    clipA1_Voice,
    clipA2_MusicBed,
    clipLocked_Watermark,
  ];

  describe('isTrackSyncLocked', () => {
    it('returns true by default when syncLocked is undefined or true', () => {
      expect(isTrackSyncLocked(videoTrack1)).toBe(true);
      expect(isTrackSyncLocked({ syncLocked: undefined })).toBe(true);
      expect(isTrackSyncLocked({ syncLocked: true })).toBe(true);
    });

    it('returns false only when syncLocked is explicitly false', () => {
      expect(isTrackSyncLocked(audioTrackMusic)).toBe(false);
      expect(isTrackSyncLocked({ syncLocked: false })).toBe(false);
    });
  });

  describe('applyMultiTrackMagneticRipple - Ripple Deletion (Negative Delta)', () => {
    it('shifts downstream clips leftward on all sync-locked tracks', () => {
      // Delete 24 frames from frame 48 (e.g. removing the head 24 frames of Interview)
      const res = applyMultiTrackMagneticRipple({
        clips: sampleClips,
        tracks,
        rippleFrame: 48,
        deltaFrames: -24,
        primaryTrackId: 'track-v1',
        respectSyncLock: true,
      });

      // clipV1_A is before frame 48 -> unchanged
      const v1A = res.updatedClips.find((c) => c.id === 'clip-v1-a');
      expect(v1A?.startFrames).toBe(0);

      // clipV2_Cutaway starts at 60 (>= 48 + 24 = 72? No, 60 is within window or straddles)
      // Wait: window is [48, 72]. clipV2_Cutaway starts at 60 and ends at 96.
      // Starts inside [48, 72] and ends at 96 (> 72).
      // Head is trimmed by (72 - 60) = 12 frames, starts at 48, new duration = 36 - 12 = 24
      const v2 = res.updatedClips.find((c) => c.id === 'clip-v2-cutaway');
      expect(v2?.startFrames).toBe(48);
      expect(v2?.durationFrames).toBe(24);

      // clipA2_MusicBed has syncLocked: false -> stays completely untouched at 0
      const music = res.updatedClips.find((c) => c.id === 'clip-a2-music');
      expect(music?.startFrames).toBe(0);
      expect(music?.durationFrames).toBe(300);

      // locked track watermark is locked -> completely untouched
      const watermark = res.updatedClips.find((c) => c.id === 'clip-watermark');
      expect(watermark?.startFrames).toBe(100);
    });

    it('shifts clips cleanly when they start strictly after the ripple delete window', () => {
      // Suppose we have a clip starting at frame 150
      const downstreamClip: SequenceClip = {
        id: 'clip-downstream',
        sequenceId: 'seq-1',
        trackId: 'track-v1',
        orderIndex: 2,
        sourceKind: 'video',
        label: 'Outro',
        filePath: '/media/outro.mp4',
        startFrames: 150,
        durationFrames: 50,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
      };

      const res = applyMultiTrackMagneticRipple({
        clips: [...sampleClips, downstreamClip],
        tracks,
        rippleFrame: 48,
        deltaFrames: -20,
        primaryTrackId: 'track-v1',
        respectSyncLock: true,
      });

      const outro = res.updatedClips.find((c) => c.id === 'clip-downstream');
      expect(outro?.startFrames).toBe(130); // 150 - 20
    });
  });

  describe('applyMultiTrackMagneticRipple - Insertion (Positive Delta)', () => {
    it('pushes downstream clips rightward on sync-locked tracks while leaving sync-unlocked tracks fixed', () => {
      // Insert 30 frames at frame 48
      const res = applyMultiTrackMagneticRipple({
        clips: sampleClips,
        tracks,
        rippleFrame: 48,
        deltaFrames: 30,
        primaryTrackId: 'track-v1',
        respectSyncLock: true,
      });

      // clipV1_A ends at 48 (<= 48) -> untouched at 0
      const v1A = res.updatedClips.find((c) => c.id === 'clip-v1-a');
      expect(v1A?.startFrames).toBe(0);

      // clipV1_B starts at 48 (>= 48) -> pushed to 48 + 30 = 78
      const v1B = res.updatedClips.find((c) => c.id === 'clip-v1-b');
      expect(v1B?.startFrames).toBe(78);

      // clipV2_Cutaway starts at 60 (>= 48) -> pushed to 60 + 30 = 90
      const v2 = res.updatedClips.find((c) => c.id === 'clip-v2-cutaway');
      expect(v2?.startFrames).toBe(90);

      // clipA1_Voice starts at 48 (>= 48) -> pushed to 48 + 30 = 78
      const a1 = res.updatedClips.find((c) => c.id === 'clip-a1-voice');
      expect(a1?.startFrames).toBe(78);

      // clipA2_MusicBed has syncLocked: false -> stays at start 0!
      const music = res.updatedClips.find((c) => c.id === 'clip-a2-music');
      expect(music?.startFrames).toBe(0);

      expect(res.affectedClipCount).toBeGreaterThan(0);
      expect(res.affectedTrackCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rippleTrimClipMultiTrack', () => {
    it('performs synchronized tail trim and shifts downstream clips on sync-locked tracks', () => {
      // Shorten clipV1_A tail by 10 frames (from 48 to 38 frames)
      const res = rippleTrimClipMultiTrack({
        clips: sampleClips,
        tracks,
        clipId: 'clip-v1-a',
        edge: 'tail',
        deltaFrames: -10,
        respectSyncLock: true,
      });

      const trimmedV1A = res.updatedClips.find((c) => c.id === 'clip-v1-a');
      expect(trimmedV1A?.durationFrames).toBe(38);

      // Downstream clipV1_B starts at 48 -> rippled to 38
      const v1B = res.updatedClips.find((c) => c.id === 'clip-v1-b');
      expect(v1B?.startFrames).toBe(38);

      // Synced narration on A1 starts at 48 -> rippled to 38
      const a1 = res.updatedClips.find((c) => c.id === 'clip-a1-voice');
      expect(a1?.startFrames).toBe(38);

      // Unlocked music bed stays fixed at 0
      const music = res.updatedClips.find((c) => c.id === 'clip-a2-music');
      expect(music?.startFrames).toBe(0);
    });

    it('performs synchronized head trim and shifts downstream clips', () => {
      // Trim 10 frames from head of clipV1_B (start moves from 48 to 58, duration from 96 to 86)
      const res = rippleTrimClipMultiTrack({
        clips: sampleClips,
        tracks,
        clipId: 'clip-v1-b',
        edge: 'head',
        deltaFrames: 10,
        respectSyncLock: true,
      });

      const trimmedV1B = res.updatedClips.find((c) => c.id === 'clip-v1-b');
      expect(trimmedV1B?.startFrames).toBe(48);
      expect(trimmedV1B?.durationFrames).toBe(86);
    });
  });

  describe('closeGapsSynchronized', () => {
    it('closes gaps on primary track while preserving multi-track synchronization', () => {
      // Create two clips with a 20-frame gap between them on V1
      const clip1: SequenceClip = {
        ...clipV1_A,
        startFrames: 0,
        durationFrames: 50,
      };
      const clip2: SequenceClip = {
        ...clipV1_B,
        startFrames: 70, // 20 frame gap between 50 and 70
        durationFrames: 50,
      };
      const syncOverlay: SequenceClip = {
        ...clipV2_Cutaway,
        startFrames: 80,
        durationFrames: 30,
      };
      const musicBed: SequenceClip = {
        ...clipA2_MusicBed,
        startFrames: 0,
        durationFrames: 200,
      };

      const res = closeGapsSynchronized({
        clips: [clip1, clip2, syncOverlay, musicBed],
        tracks,
        primaryTrackId: 'track-v1',
        respectSyncLock: true,
      });

      expect(res.closedGapCount).toBe(1);

      // clip2 should now be abutting clip1 at frame 50
      const updatedClip2 = res.updatedClips.find((c) => c.id === clip2.id);
      expect(updatedClip2?.startFrames).toBe(50);

      // syncOverlay should be shifted left by 20 frames (from 80 to 60)
      const updatedOverlay = res.updatedClips.find((c) => c.id === syncOverlay.id);
      expect(updatedOverlay?.startFrames).toBe(60);

      // music bed (syncLocked: false) remains fixed at 0
      const updatedMusic = res.updatedClips.find((c) => c.id === musicBed.id);
      expect(updatedMusic?.startFrames).toBe(0);
    });
  });
});
