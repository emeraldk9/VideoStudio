import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  applyClipSpeed,
  calculateSpeedDuration,
  rippleTrimToPlayhead,
} from '../speed-ops';

function makeTrack(id: string, kind: 'video' | 'audio' = 'video', magnetic = true): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    kind,
    name: id,
    orderIndex: 0,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
    magnetic,
  };
}

function makeClip(id: string, trackId: string, orderIndex: number, durationFrames: number, extra?: Partial<SequenceClip>): SequenceClip {
  return {
    id,
    sequenceId: 'seq-1',
    trackId,
    orderIndex,
    durationFrames,
    sourceInFrames: 0,
    sourceOutFrames: null,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: '/media/video.mp4',
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip',
    overrides: [],
    keyframes: [],
    ...extra,
  };
}

describe('speed-ops (Clip Speed Retiming & Ripple Trim)', () => {
  describe('calculateSpeedDuration', () => {
    it('halves duration at 2x speed', () => {
      expect(calculateSpeedDuration(100, 1.0, 2.0)).toBe(50);
    });

    it('doubles duration at 0.5x speed', () => {
      expect(calculateSpeedDuration(100, 1.0, 0.5)).toBe(200);
    });

    it('leaves duration identical at same speed', () => {
      expect(calculateSpeedDuration(100, 1.0, 1.0)).toBe(100);
    });

    it('clamps speed to MIN_CLIP_SPEED and MAX_CLIP_SPEED', () => {
      expect(calculateSpeedDuration(100, 1.0, 10.0)).toBe(25); // max 4x -> 100/4 = 25
      expect(calculateSpeedDuration(100, 1.0, 0.1)).toBe(400); // min 0.25x -> 100*4 = 400
    });
  });

  describe('applyClipSpeed', () => {
    it('updates speed on clip without rippling duration when rippleSequence is false', () => {
      const track = makeTrack('V1');
      const clip = makeClip('c1', 'V1', 0, 120);
      const next = applyClipSpeed([clip], [track], 'c1', 2.0, { rippleSequence: false });

      expect(next[0].durationFrames).toBe(120);
      expect(next[0].effects?.speed).toBe(2.0);
    });

    it('adjusts durationFrames when rippleSequence is true on a magnetic track', () => {
      const track = makeTrack('V1', 'video', true);
      const clip = makeClip('c1', 'V1', 0, 120);
      const next = applyClipSpeed([clip], [track], 'c1', 2.0, { rippleSequence: true });

      expect(next[0].durationFrames).toBe(60);
      expect(next[0].effects?.speed).toBe(2.0);
    });

    it('adjusts durationFrames and shifts downstream clips on a free track', () => {
      const track = makeTrack('V2', 'video', false);
      const clip1 = makeClip('c1', 'V2', 0, 100, { startFrames: 0 });
      const clip2 = makeClip('c2', 'V2', 1, 100, { startFrames: 100 });
      const next = applyClipSpeed([clip1, clip2], [track], 'c1', 2.0, { rippleSequence: true });

      expect(next[0].durationFrames).toBe(50);
      expect(next[0].effects?.speed).toBe(2.0);
      // Downstream clip shifted left by 50 frames
      expect(next[1].startFrames).toBe(50);
    });
  });

  describe('rippleTrimToPlayhead', () => {
    it('ripple trims head (Q) on a magnetic track', () => {
      const track = makeTrack('V1', 'video', true);
      const clip1 = makeClip('c1', 'V1', 0, 100, { sourceInFrames: 10 });
      const clip2 = makeClip('c2', 'V1', 1, 100);

      // Playhead at frame 30 of clip1 (starts at 0, ends at 100)
      const next = rippleTrimToPlayhead([clip1, clip2], [track], 30, 'head');

      expect(next[0].durationFrames).toBe(70);
      expect(next[0].sourceInFrames).toBe(40);
      expect(next[1].durationFrames).toBe(100);
    });

    it('ripple trims tail (W) on a magnetic track', () => {
      const track = makeTrack('V1', 'video', true);
      const clip1 = makeClip('c1', 'V1', 0, 100);
      const clip2 = makeClip('c2', 'V1', 1, 100);

      // Playhead at frame 70 of clip1
      const next = rippleTrimToPlayhead([clip1, clip2], [track], 70, 'tail');

      expect(next[0].durationFrames).toBe(70);
      expect(next[1].durationFrames).toBe(100);
    });

    it('shifts downstream clips left when ripple trimming tail (W) on a free track', () => {
      const track = makeTrack('V2', 'video', false);
      const clip1 = makeClip('c1', 'V2', 0, 100, { startFrames: 0 });
      const clip2 = makeClip('c2', 'V2', 1, 100, { startFrames: 120 }); // starts after gap

      // Playhead at frame 60 (tail trim removes 40 frames)
      const next = rippleTrimToPlayhead([clip1, clip2], [track], 60, 'tail');

      expect(next[0].durationFrames).toBe(60);
      // Downstream clip shifted left by 40 frames: 120 - 40 = 80
      expect(next[1].startFrames).toBe(80);
    });
  });
});
