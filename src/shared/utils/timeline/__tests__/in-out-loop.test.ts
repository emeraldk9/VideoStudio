import { describe, expect, it } from 'vitest';

import {
  clampInPoint,
  clampOutPoint,
  computeEffectiveWorkArea,
  stepLoopPlayback,
} from '../in-out-ops';

describe('in-out-ops (Work Area In/Out & Loop Playback)', () => {
  describe('computeEffectiveWorkArea', () => {
    it('defaults to full sequence duration when in/out points are null', () => {
      const area = computeEffectiveWorkArea({ inPointFrame: null, outPointFrame: null }, 240);
      expect(area.startFrame).toBe(0);
      expect(area.endFrame).toBe(240);
      expect(area.durationFrames).toBe(240);
      expect(area.isCustom).toBe(false);
    });

    it('computes work area with inPoint only', () => {
      const area = computeEffectiveWorkArea({ inPointFrame: 60, outPointFrame: null }, 240);
      expect(area.startFrame).toBe(60);
      expect(area.endFrame).toBe(240);
      expect(area.durationFrames).toBe(180);
      expect(area.isCustom).toBe(true);
    });

    it('computes work area with outPoint only', () => {
      const area = computeEffectiveWorkArea({ inPointFrame: null, outPointFrame: 150 }, 240);
      expect(area.startFrame).toBe(0);
      expect(area.endFrame).toBe(150);
      expect(area.durationFrames).toBe(150);
      expect(area.isCustom).toBe(true);
    });

    it('computes work area with both inPoint and outPoint', () => {
      const area = computeEffectiveWorkArea({ inPointFrame: 48, outPointFrame: 120 }, 240);
      expect(area.startFrame).toBe(48);
      expect(area.endFrame).toBe(120);
      expect(area.durationFrames).toBe(72);
      expect(area.isCustom).toBe(true);
    });

    it('clamps in and out points within sequence bounds', () => {
      const area = computeEffectiveWorkArea({ inPointFrame: -10, outPointFrame: 300 }, 240);
      expect(area.startFrame).toBe(0);
      expect(area.endFrame).toBe(240);
      expect(area.durationFrames).toBe(240);
    });
  });

  describe('clampInPoint and clampOutPoint', () => {
    it('sets inPoint and keeps outPoint when inPoint < outPoint', () => {
      const res = clampInPoint(30, 100, 200);
      expect(res.inPointFrame).toBe(30);
      expect(res.outPointFrame).toBe(100);
    });

    it('clears outPoint when inPoint >= outPoint', () => {
      const res = clampInPoint(100, 80, 200);
      expect(res.inPointFrame).toBe(100);
      expect(res.outPointFrame).toBeNull();
    });

    it('sets outPoint and keeps inPoint when outPoint > inPoint', () => {
      const res = clampOutPoint(120, 50, 200);
      expect(res.inPointFrame).toBe(50);
      expect(res.outPointFrame).toBe(120);
    });

    it('clears inPoint when outPoint <= inPoint', () => {
      const res = clampOutPoint(40, 60, 200);
      expect(res.inPointFrame).toBeNull();
      expect(res.outPointFrame).toBe(40);
    });

    it('allows clearing inPoint or outPoint with null', () => {
      expect(clampInPoint(null, 100, 200)).toEqual({ inPointFrame: null, outPointFrame: 100 });
      expect(clampOutPoint(null, 50, 200)).toEqual({ inPointFrame: 50, outPointFrame: null });
    });
  });

  describe('stepLoopPlayback', () => {
    const workArea = {
      startFrame: 24,
      endFrame: 96,
      durationFrames: 72,
      isCustom: true,
    };

    it('stops at end boundary when not looping (forward playback)', () => {
      const res = stepLoopPlayback(96, 1, workArea, false);
      expect(res.shouldStop).toBe(true);
      expect(res.nextFrame).toBe(96);
    });

    it('wraps to startFrame when looping (forward playback)', () => {
      const res = stepLoopPlayback(96, 1, workArea, true);
      expect(res.shouldStop).toBe(false);
      expect(res.nextFrame).toBe(24);
    });

    it('stops at start boundary when not looping (reverse playback)', () => {
      const res = stepLoopPlayback(24, -1, workArea, false);
      expect(res.shouldStop).toBe(true);
      expect(res.nextFrame).toBe(24);
    });

    it('wraps to endFrame when looping (reverse playback)', () => {
      const res = stepLoopPlayback(24, -1, workArea, true);
      expect(res.shouldStop).toBe(false);
      expect(res.nextFrame).toBe(96);
    });

    it('continues playback within work area without wrapping or stopping', () => {
      const res = stepLoopPlayback(50, 1, workArea, true);
      expect(res.shouldStop).toBe(false);
      expect(res.nextFrame).toBe(50);
    });
  });
});
