import { describe, expect, it } from 'vitest';

import {
  findNextCut,
  findPreviousCut,
  timelineSnapTargets,
} from '../../../index';

describe('S13 Timeline Cut Navigation & Snap Utilities', () => {
  const baseClipTargets = [0, 48, 96, 144, 240];
  const markerFrames = [30, 120];
  const durationFrames = 300;

  const allTargets = timelineSnapTargets({
    base: baseClipTargets,
    markerFrames,
    playheadFrame: null,
    sequenceEndFrame: durationFrames,
  });

  it('correctly builds sorted and deduplicated snap targets list', () => {
    // Expected: 0, 30, 48, 96, 120, 144, 240, 300
    expect(allTargets).toEqual([0, 30, 48, 96, 120, 144, 240, 300]);
  });

  describe('findPreviousCut (Up Arrow Navigation)', () => {
    it('jumps to previous cut when playhead is between edit points', () => {
      // Playhead at frame 50 -> previous cut is 48
      expect(findPreviousCut(allTargets, 50)).toBe(48);

      // Playhead at frame 119 -> previous cut is 96
      expect(findPreviousCut(allTargets, 119)).toBe(96);

      // Playhead at frame 200 -> previous cut is 144
      expect(findPreviousCut(allTargets, 200)).toBe(144);
    });

    it('jumps to earlier cut when playhead is exactly at a cut point', () => {
      // At frame 48 -> should jump to 30
      expect(findPreviousCut(allTargets, 48)).toBe(30);

      // At frame 30 -> should jump to 0
      expect(findPreviousCut(allTargets, 30)).toBe(0);
    });

    it('floors at 0 when playhead is at or before start', () => {
      expect(findPreviousCut(allTargets, 0)).toBe(0);
      expect(findPreviousCut(allTargets, -5)).toBe(0);
    });
  });

  describe('findNextCut (Down Arrow Navigation)', () => {
    it('jumps to next cut when playhead is between edit points', () => {
      // Playhead at frame 10 -> next cut is 30
      expect(findNextCut(allTargets, 10, durationFrames)).toBe(30);

      // Playhead at frame 50 -> next cut is 96
      expect(findNextCut(allTargets, 50, durationFrames)).toBe(96);

      // Playhead at frame 200 -> next cut is 240
      expect(findNextCut(allTargets, 200, durationFrames)).toBe(240);
    });

    it('jumps to next cut when playhead is exactly at a cut point', () => {
      // At frame 48 -> should jump to 96
      expect(findNextCut(allTargets, 48, durationFrames)).toBe(96);

      // At frame 0 -> should jump to 30
      expect(findNextCut(allTargets, 0, durationFrames)).toBe(30);
    });

    it('caps at durationFrames when playhead is at or past the last target', () => {
      expect(findNextCut(allTargets, 300, durationFrames)).toBe(300);
      expect(findNextCut(allTargets, 350, durationFrames)).toBe(300);
    });
  });

  describe('Gain Nudge Bounds', () => {
    it('clamps gain correctly within [-60, +12] dB range', () => {
      const nudgeGain = (current: number, delta: number) =>
        Math.min(12, Math.max(-60, current + delta));

      expect(nudgeGain(0, 1)).toBe(1);
      expect(nudgeGain(0, -1)).toBe(-1);
      expect(nudgeGain(12, 1)).toBe(12); // upper clamp
      expect(nudgeGain(-60, -1)).toBe(-60); // lower clamp
    });
  });
});
