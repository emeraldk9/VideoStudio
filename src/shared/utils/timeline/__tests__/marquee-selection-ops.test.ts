import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  applyMarqueeSelection,
  calculateMarqueeRect,
  calculateSelectionSummary,
  intersectClipsWithMarquee,
  resolveMarqueeModifier,
} from '../marquee-selection-ops';

const sampleTracks: SequenceTrack[] = [
  {
    id: 't-v1',
    sequenceId: 'seq1',
    kind: 'video',
    name: 'Video 1',
    orderIndex: 0,
    magnetic: false,
    locked: false,
    heightPx: 50,
  } as SequenceTrack,
  {
    id: 't-v2',
    sequenceId: 'seq1',
    kind: 'video',
    name: 'Video 2 (Locked)',
    orderIndex: 1,
    magnetic: false,
    locked: true,
    heightPx: 50,
  } as SequenceTrack,
  {
    id: 't-a1',
    sequenceId: 'seq1',
    kind: 'audio',
    name: 'Audio 1',
    orderIndex: 2,
    magnetic: false,
    locked: false,
    heightPx: 40,
  } as SequenceTrack,
];

const sampleClips: SequenceClip[] = [
  {
    id: 'c1',
    trackId: 't-v1',
    startFrames: 0,
    durationFrames: 48,
    name: 'Clip 1',
  } as unknown as SequenceClip,
  {
    id: 'c2',
    trackId: 't-v1',
    startFrames: 60,
    durationFrames: 60,
    name: 'Clip 2',
  } as unknown as SequenceClip,
  {
    id: 'c-locked',
    trackId: 't-v2',
    startFrames: 10,
    durationFrames: 100,
    name: 'Locked Clip',
  } as unknown as SequenceClip,
  {
    id: 'c3',
    trackId: 't-a1',
    startFrames: 30,
    durationFrames: 90,
    name: 'Audio Clip 1',
  } as unknown as SequenceClip,
];

describe('marquee-selection-ops', () => {
  describe('resolveMarqueeModifier', () => {
    it('resolves add on shiftKey and subtract on altKey', () => {
      expect(resolveMarqueeModifier({ shiftKey: true })).toBe('add');
      expect(resolveMarqueeModifier({ altKey: true })).toBe('subtract');
      expect(resolveMarqueeModifier({ shiftKey: true, altKey: true })).toBe('subtract');
      expect(resolveMarqueeModifier({})).toBe('replace');
    });
  });

  describe('calculateMarqueeRect', () => {
    it('normalizes drag rectangle coordinates regardless of drag direction', () => {
      // Dragging top-left to bottom-right
      const r1 = calculateMarqueeRect(100, 50, 250, 180);
      expect(r1).toEqual({ left: 100, top: 50, width: 150, height: 130 });

      // Dragging bottom-right to top-left
      const r2 = calculateMarqueeRect(250, 180, 100, 50);
      expect(r2).toEqual({ left: 100, top: 50, width: 150, height: 130 });
    });
  });

  describe('intersectClipsWithMarquee', () => {
    // laneLabelWidthPx: 100, pixelsPerFrame: 2
    // Track 1 (t-v1): top: 0, height: 50 -> bottom: 50
    // Gap: 8 -> row 2 top: 58
    // Track 2 (t-v2 locked): top: 58, height: 50 -> bottom: 108
    // Gap: 8 -> row 3 top: 116
    // Track 3 (t-a1): top: 116, height: 40 -> bottom: 156

    it('returns empty when rect is degenerate or empty', () => {
      const empty = intersectClipsWithMarquee({
        clips: sampleClips,
        tracks: sampleTracks,
        rect: { left: 0, top: 0, width: 0, height: 0 },
        pixelsPerFrame: 2,
        laneLabelWidthPx: 100,
        laneGapPx: 8,
      });
      expect(empty).toEqual([]);
    });

    it('detects single clip overlap on track 1', () => {
      // c1: startFrames: 0, durationFrames: 48 -> left: 100, right: 196
      // Marquee covers 120 to 180 horizontally, and Y: 10 to 40 (inside track 1)
      const ids = intersectClipsWithMarquee({
        clips: sampleClips,
        tracks: sampleTracks,
        rect: { left: 120, top: 10, width: 60, height: 30 },
        pixelsPerFrame: 2,
        laneLabelWidthPx: 100,
        laneGapPx: 8,
      });
      expect(ids).toEqual(['c1']);
    });

    it('skips clips on locked tracks', () => {
      // Marquee covering Y from 0 to 110 (spans t-v1 and t-v2)
      // t-v2 has c-locked which overlaps horizontally, but t-v2 is locked
      const ids = intersectClipsWithMarquee({
        clips: sampleClips,
        tracks: sampleTracks,
        rect: { left: 110, top: 0, width: 80, height: 110 },
        pixelsPerFrame: 2,
        laneLabelWidthPx: 100,
        laneGapPx: 8,
      });
      expect(ids).toContain('c1');
      expect(ids).not.toContain('c-locked');
    });

    it('detects multi-track span across video and audio tracks', () => {
      // Marquee spanning from top: 0 to bottom: 160 across all tracks, X: 150 to 250
      // c1: right is 196 -> overlaps
      // c2: startFrames: 60 -> left: 220 -> overlaps
      // c3: startFrames: 30 (left 160) on t-a1 -> overlaps
      const ids = intersectClipsWithMarquee({
        clips: sampleClips,
        tracks: sampleTracks,
        rect: { left: 150, top: 0, width: 100, height: 160 },
        pixelsPerFrame: 2,
        laneLabelWidthPx: 100,
        laneGapPx: 8,
      });
      expect(ids).toContain('c1');
      expect(ids).toContain('c2');
      expect(ids).toContain('c3');
      expect(ids).not.toContain('c-locked');
    });
  });

  describe('applyMarqueeSelection', () => {
    it('applies replace mode', () => {
      expect(applyMarqueeSelection(['c1', 'c2'], ['c3', 'c4'], 'replace')).toEqual(['c3', 'c4']);
    });

    it('applies additive mode without duplicates', () => {
      expect(applyMarqueeSelection(['c1', 'c2'], ['c2', 'c3'], 'add')).toEqual(['c1', 'c2', 'c3']);
    });

    it('applies subtractive mode', () => {
      expect(applyMarqueeSelection(['c1', 'c2', 'c3'], ['c2'], 'subtract')).toEqual(['c1', 'c3']);
    });
  });

  describe('calculateSelectionSummary', () => {
    it('returns null on empty selection', () => {
      expect(calculateSelectionSummary([], sampleClips, 24)).toBeNull();
    });

    it('calculates metrics for multi-clip selection', () => {
      // c1 (48f) + c2 (60f) = 108 frames. At 24fps: 108 / 24 = 4.5s
      const summary = calculateSelectionSummary(['c1', 'c2'], sampleClips, 24);
      expect(summary).toBeDefined();
      expect(summary?.clipCount).toBe(2);
      expect(summary?.totalDurationFrames).toBe(108);
      expect(summary?.totalDurationSeconds).toBe(4.5);
      expect(summary?.trackCount).toBe(1);
      expect(summary?.badgeText).toContain('2 clips');
      expect(summary?.badgeText).toContain('1 track');
    });

    it('correctly reports multiple tracks', () => {
      // c1 on t-v1, c3 on t-a1
      const summary = calculateSelectionSummary(['c1', 'c3'], sampleClips, 24);
      expect(summary?.clipCount).toBe(2);
      expect(summary?.trackCount).toBe(2);
      expect(summary?.badgeText).toContain('2 tracks');
    });
  });
});
