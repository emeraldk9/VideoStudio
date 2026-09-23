import { describe, expect, it } from 'vitest';

import {
  slipClipMedia,
  slideClipPosition,
  type SequenceClip,
  type SequenceTrack,
} from '../../../index';

describe('S19 Clip Slip & Slide Editorial Trimming', () => {
  const trackV2: SequenceTrack = {
    id: 'track-v2',
    sequenceId: 'seq-1',
    orderIndex: 1,
    kind: 'video',
    name: 'V2',
    magnetic: false,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };

  const clip1: SequenceClip = {
    id: 'clip-1',
    sequenceId: 'seq-1',
    trackId: 'track-v2',
    orderIndex: 0,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/video1.mp4',
    startFrames: 0,
    durationFrames: 60, // [0, 60]
    sourceInFrames: 30,
    sourceOutFrames: 90,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip 1',
    overrides: [],
  };

  const clip2: SequenceClip = {
    id: 'clip-2',
    sequenceId: 'seq-1',
    trackId: 'track-v2',
    orderIndex: 0,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/video2.mp4',
    startFrames: 60, // [60, 110]
    durationFrames: 50,
    sourceInFrames: 20,
    sourceOutFrames: 70,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip 2',
    overrides: [],
  };

  const clip3: SequenceClip = {
    id: 'clip-3',
    sequenceId: 'seq-1',
    trackId: 'track-v2',
    orderIndex: 0,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/video3.mp4',
    startFrames: 110, // [110, 170]
    durationFrames: 60,
    sourceInFrames: 10,
    sourceOutFrames: 70,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip 3',
    overrides: [],
  };

  const clips = [clip1, clip2, clip3];

  describe('slipClipMedia', () => {
    it('slips sourceInFrames forward while preserving timeline duration and placement', () => {
      const slipped = slipClipMedia(clip2, 15);
      expect(slipped.sourceInFrames).toBe(35); // 20 + 15
      expect(slipped.sourceOutFrames).toBe(85); // 70 + 15
      expect(slipped.startFrames).toBe(60); // Timeline start unchanged
      expect(slipped.durationFrames).toBe(50); // Timeline duration unchanged
    });

    it('slips sourceInFrames backward and clamps at 0', () => {
      // Slip backward by 50 frames when sourceIn is 20
      const slipped = slipClipMedia(clip2, -50);
      expect(slipped.sourceInFrames).toBe(0);
      expect(slipped.sourceOutFrames).toBe(50); // 70 - 20 (effective shift is -20)
    });

    it('respects maxSourceFrames boundary when provided', () => {
      // clip2 duration is 50. If source total length is 100, max sourceIn is 50.
      const slipped = slipClipMedia(clip2, 80, 100);
      expect(slipped.sourceInFrames).toBe(50); // Clamped to 100 - 50
    });
  });

  describe('slideClipPosition', () => {
    it('slides clip rightward, expanding previous clip and contracting next clip', () => {
      // Slide clip2 rightward by 10 frames
      const result = slideClipPosition(clips, trackV2, 'clip-2', 10);
      const c1 = result.find((c) => c.id === 'clip-1')!;
      const c2 = result.find((c) => c.id === 'clip-2')!;
      const c3 = result.find((c) => c.id === 'clip-3')!;

      // Previous clip expands duration by 10
      expect(c1.startFrames).toBe(0);
      expect(c1.durationFrames).toBe(70);

      // Target clip shifts startFrames by 10, duration untouched
      expect(c2.startFrames).toBe(70);
      expect(c2.durationFrames).toBe(50);

      // Next clip contracts duration by 10 and moves startFrames/sourceIn
      expect(c3.startFrames).toBe(120);
      expect(c3.durationFrames).toBe(50); // 60 - 10
      expect(c3.sourceInFrames).toBe(20); // 10 + 10
    });

    it('slides clip leftward, contracting previous clip and expanding next clip', () => {
      // Slide clip2 leftward by 15 frames
      const result = slideClipPosition(clips, trackV2, 'clip-2', -15);
      const c1 = result.find((c) => c.id === 'clip-1')!;
      const c2 = result.find((c) => c.id === 'clip-2')!;
      const c3 = result.find((c) => c.id === 'clip-3')!;

      expect(c1.durationFrames).toBe(45); // 60 - 15
      expect(c2.startFrames).toBe(45); // 60 - 15
      expect(c3.startFrames).toBe(95); // 110 - 15
      expect(c3.durationFrames).toBe(75); // 60 + 15
    });

    it('clamps sliding when neighbor clip would shrink below 1 frame', () => {
      // Next clip duration is 60; attempting to slide right by 100 frames must clamp
      const result = slideClipPosition(clips, trackV2, 'clip-2', 100);
      const c3 = result.find((c) => c.id === 'clip-3')!;
      expect(c3.durationFrames).toBe(1); // Clamped so at least 1 frame remains
    });

    it('leaves clips unchanged if track is locked', () => {
      const lockedTrack: SequenceTrack = { ...trackV2, locked: true };
      const result = slideClipPosition(clips, lockedTrack, 'clip-2', 10);
      expect(result).toBe(clips);
    });
  });
});
