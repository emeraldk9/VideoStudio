import { describe, it, expect } from 'vitest';
import type { SequenceClip } from '../../../types/sequence';
import {
  clampTransitionFrames,
  calculateTransitionDragFrames,
  applyClipTransition,
  removeClipTransition,
  toggleDefaultTransition,
  getTransitionIcon,
  DEFAULT_TRANSITION_TYPE,
  DEFAULT_TRANSITION_FRAMES,
} from '../transition-ops';

const makeClip = (id: string, duration: number, transitionIn: any = 'cut', transitionFrames: number = 0): SequenceClip => ({
  id,
  sequenceId: 'seq-1',
  trackId: 'track-1',
  orderIndex: 0,
  sourceKind: 'video',
  filePath: 'c:/mock.mp4',
  durationFrames: duration,
  startFrames: 0,
  sourceInFrames: 0,
  sourceOutFrames: duration,
  transitionIn,
  transitionFrames,
  motionPreset: 'none',
  gainDb: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  label: `Clip ${id}`,
  overrides: [],
  effects: undefined,
});

describe('transition-ops', () => {
  describe('clampTransitionFrames', () => {
    it('clamps to 1 minimum', () => {
      expect(clampTransitionFrames(0, 100)).toBe(1);
      expect(clampTransitionFrames(-10, 100)).toBe(1);
    });

    it('clamps to clip duration maximum', () => {
      expect(clampTransitionFrames(150, 100)).toBe(100);
      expect(clampTransitionFrames(12, 10)).toBe(10);
    });

    it('preserves valid frame numbers within bounds', () => {
      expect(clampTransitionFrames(12, 50)).toBe(12);
      expect(clampTransitionFrames(24.4, 50)).toBe(24);
    });
  });

  describe('calculateTransitionDragFrames', () => {
    it('computes frame delta from pixel movement', () => {
      // 100px drag at 10px/frame = 10 frames added to initial 12 = 22 frames
      const result = calculateTransitionDragFrames(12, 100, 10, 50);
      expect(result).toBe(22);
    });

    it('clamps dragged duration to maxClipFrames', () => {
      const result = calculateTransitionDragFrames(12, 500, 10, 30);
      expect(result).toBe(30);
    });

    it('returns initialFrames if pxPerFrame is invalid', () => {
      expect(calculateTransitionDragFrames(12, 100, 0, 50)).toBe(12);
    });
  });

  describe('applyClipTransition', () => {
    it('applies transition type and specified duration to target clip', () => {
      const clips = [makeClip('c1', 100), makeClip('c2', 100)];
      const updated = applyClipTransition(clips, 'c1', 'fade_black', 24);

      expect(updated[0].transitionIn).toBe('fade_black');
      expect(updated[0].transitionFrames).toBe(24);
      expect(updated[1].transitionIn).toBe('cut');
    });

    it('applies default duration when no frame duration is specified', () => {
      const clips = [makeClip('c1', 100)];
      const updated = applyClipTransition(clips, 'c1', 'crossfade');

      expect(updated[0].transitionIn).toBe('crossfade');
      expect(updated[0].transitionFrames).toBe(DEFAULT_TRANSITION_FRAMES);
    });

    it('resets frames to 0 when applying cut', () => {
      const clips = [makeClip('c1', 100, 'crossfade', 24)];
      const updated = applyClipTransition(clips, 'c1', 'cut');

      expect(updated[0].transitionIn).toBe('cut');
      expect(updated[0].transitionFrames).toBe(0);
    });
  });

  describe('removeClipTransition', () => {
    it('clears transition on specified clip', () => {
      const clips = [makeClip('c1', 100, 'wipe_left', 18)];
      const updated = removeClipTransition(clips, 'c1');

      expect(updated[0].transitionIn).toBe('cut');
      expect(updated[0].transitionFrames).toBe(0);
    });
  });

  describe('toggleDefaultTransition', () => {
    it('adds crossfade if clip currently has cut', () => {
      const clips = [makeClip('c1', 100)];
      const updated = toggleDefaultTransition(clips, 'c1');

      expect(updated[0].transitionIn).toBe(DEFAULT_TRANSITION_TYPE);
      expect(updated[0].transitionFrames).toBe(DEFAULT_TRANSITION_FRAMES);
    });

    it('removes transition if clip currently has non-cut transition', () => {
      const clips = [makeClip('c1', 100, 'crossfade', 12)];
      const updated = toggleDefaultTransition(clips, 'c1');

      expect(updated[0].transitionIn).toBe('cut');
      expect(updated[0].transitionFrames).toBe(0);
    });
  });

  describe('getTransitionIcon', () => {
    it('returns appropriate icon names for transitions', () => {
      expect(getTransitionIcon('crossfade')).toBe('blur_linear');
      expect(getTransitionIcon('fade_black')).toBe('brightness_empty');
      expect(getTransitionIcon('dip_to_color')).toBe('palette');
      expect(getTransitionIcon('wipe_left')).toBe('arrow_back');
      expect(getTransitionIcon('cut')).toBe('content_cut');
    });
  });
});
