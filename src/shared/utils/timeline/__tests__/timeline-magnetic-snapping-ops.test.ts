import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceMarker, SequenceTrack } from '../../../types/sequence';
import type { SnapTargetEntry } from '../trim-tools-ops';
import {
  SNAP_PRIORITY_WEIGHTS,
  buildTimelineSnapMatrix,
  calculateDynamicSnapTolerance,
  calculateMultiPointSnap,
  calculateSelectionBoundingBox,
} from '../timeline-magnetic-snapping-ops';

describe('timeline-magnetic-snapping-ops (Milestone S190: Timeline Smart Magnetic Alignment Guides & Multi-Point Snap Matrix)', () => {
  function createTestClip(partial: Partial<SequenceClip>): SequenceClip {
    return {
      id: 'test-clip',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'video',
      filePath: '/media/video.mp4',
      startFrames: 0,
      durationFrames: 100,
      sourceInFrames: 0,
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Test Clip',
      motionPreset: 'none',
      transitionIn: 'cut',
      transitionOut: 'cut',
      transitionFrames: 0,
      overrides: [],
      ...partial,
    };
  }

  describe('SNAP_PRIORITY_WEIGHTS', () => {
    it('ranks targets according to NLE editorial significance', () => {
      expect(SNAP_PRIORITY_WEIGHTS.playhead).toBe(1.0);
      expect(SNAP_PRIORITY_WEIGHTS.in_point).toBeGreaterThan(SNAP_PRIORITY_WEIGHTS.marker);
      expect(SNAP_PRIORITY_WEIGHTS.clip_head).toBeGreaterThan(SNAP_PRIORITY_WEIGHTS.marker);
      expect(SNAP_PRIORITY_WEIGHTS.downbeat).toBeGreaterThan(SNAP_PRIORITY_WEIGHTS.beat);
    });
  });

  describe('calculateDynamicSnapTolerance', () => {
    it('expands tolerance at slow precision speeds and tightens at high scrub speeds', () => {
      // 0 px/s (resting / slow hover)
      const slow = calculateDynamicSnapTolerance({
        velocityPxPerSec: 0,
        baseTolerancePx: 6,
        pixelsPerSecond: 100,
        fps: 25,
      });
      expect(slow.tolerancePx).toBe(12);
      expect(slow.toleranceFrames).toBe(3); // 12px / 4px_per_frame = 3 frames

      // 150 px/s (steady move)
      const normal = calculateDynamicSnapTolerance({
        velocityPxPerSec: 150,
        baseTolerancePx: 6,
        pixelsPerSecond: 100,
        fps: 25,
      });
      expect(normal.tolerancePx).toBe(6);

      // 650 px/s (fast scrub)
      const fast = calculateDynamicSnapTolerance({
        velocityPxPerSec: 650,
        baseTolerancePx: 6,
        pixelsPerSecond: 100,
        fps: 25,
      });
      expect(fast.tolerancePx).toBe(2);
    });
  });

  describe('calculateSelectionBoundingBox', () => {
    it('computes union bounds of multiple timeline clips', () => {
      const clipA = createTestClip({ id: 'a', startFrames: 50, durationFrames: 100 }); // 50 -> 150
      const clipB = createTestClip({ id: 'b', startFrames: 120, durationFrames: 80 });  // 120 -> 200

      const bounds = calculateSelectionBoundingBox([clipA, clipB]);
      expect(bounds).toEqual({
        startFrames: 50,
        endFrames: 200,
        durationFrames: 150,
      });
    });

    it('returns null on empty collection', () => {
      expect(calculateSelectionBoundingBox([])).toBeNull();
    });
  });

  describe('calculateMultiPointSnap', () => {
    const targets: SnapTargetEntry[] = [
      { frame: 100, type: 'playhead', label: 'Playhead' },
      { frame: 250, type: 'clip_head', label: 'Cut 1 In' },
      { frame: 300, type: 'marker', label: 'Marker: Intro' },
      { frame: 400, type: 'in_point', label: 'In Point' },
    ];

    it('snaps lead head edge when head is within tolerance', () => {
      // Clip duration 100, candidate head at 98 (2 frames away from Playhead at 100)
      const result = calculateMultiPointSnap({
        candidateStartFrame: 98,
        durationFrames: 100,
        targets,
        toleranceFrames: 4,
      });

      expect(result.didSnap).toBe(true);
      expect(result.snappedStartFrame).toBe(100);
      expect(result.deltaFrames).toBe(2);
      expect(result.alignmentEdge).toBe('head');
      expect(result.matchedTarget?.type).toBe('playhead');
      expect(result.activeGuide?.label).toContain('head');
      expect(result.activeGuide?.hexColor).toBe('#06b6d4'); // cyan
    });

    it('snaps tail edge when tail is closest to an environmental target', () => {
      // Clip duration 100, candidate head at 148 -> tail is at 248 (2 frames away from Cut 1 In at 250)
      const result = calculateMultiPointSnap({
        candidateStartFrame: 148,
        durationFrames: 100,
        targets,
        toleranceFrames: 4,
      });

      expect(result.didSnap).toBe(true);
      expect(result.snappedStartFrame).toBe(150); // 150 + 100 = 250 (tail aligns to 250)
      expect(result.deltaFrames).toBe(2);
      expect(result.alignmentEdge).toBe('tail');
      expect(result.matchedTarget?.type).toBe('clip_head');
      expect(result.activeGuide?.label).toContain('tail');
    });

    it('snaps midpoint when enabled and edges are out of range', () => {
      // Clip duration 100, candidate head at 252 -> midpoint is at 302 (2 frames away from Marker at 300)
      // Head (252) and Tail (352) are far from targets (Cut 1 at 250 is 2 frames away, but let's test midpoint)
      const customTargets: SnapTargetEntry[] = [
        { frame: 300, type: 'marker', label: 'Marker: Center' },
      ];

      const result = calculateMultiPointSnap({
        candidateStartFrame: 252,
        durationFrames: 100, // midpoint is 252 + 50 = 302
        targets: customTargets,
        toleranceFrames: 4,
        enableMidpointSnap: true,
      });

      expect(result.didSnap).toBe(true);
      expect(result.snappedStartFrame).toBe(250); // midpoint becomes 300 -> start is 250
      expect(result.deltaFrames).toBe(-2);
      expect(result.alignmentEdge).toBe('midpoint');
    });

    it('prioritizes higher weighted target when competing within tolerance', () => {
      // Target A: marker at 101 (w=0.7, distance=1)
      // Target B: playhead at 102 (w=1.0, distance=2)
      const competingTargets: SnapTargetEntry[] = [
        { frame: 101, type: 'marker', label: 'Marker 1' },
        { frame: 102, type: 'playhead', label: 'Playhead' },
      ];

      const result = calculateMultiPointSnap({
        candidateStartFrame: 100,
        durationFrames: 50,
        targets: competingTargets,
        toleranceFrames: 5,
      });

      expect(result.didSnap).toBe(true);
      // Playhead's much higher weight (1.0 vs 0.7) wins over the 1-frame distance difference
      expect(result.matchedTarget?.type).toBe('playhead');
      expect(result.snappedStartFrame).toBe(102);
    });

    it('bypasses snapping completely when snapEnabled is false', () => {
      const result = calculateMultiPointSnap({
        candidateStartFrame: 99,
        durationFrames: 100,
        targets,
        toleranceFrames: 10,
        snapEnabled: false,
      });

      expect(result.didSnap).toBe(false);
      expect(result.snappedStartFrame).toBe(99);
      expect(result.deltaFrames).toBe(0);
    });
  });

  describe('buildTimelineSnapMatrix', () => {
    const track1: SequenceTrack = {
      id: 'v1',
      sequenceId: 's1',
      kind: 'video',
      name: 'V1',
      orderIndex: 0,
      muted: false,
      videoEnabled: true,
      locked: false,
      magnetic: false,
      heightPx: 64,
      role: null,
    };

    const clip1 = createTestClip({ id: 'c1', trackId: 'v1', startFrames: 0, durationFrames: 100 });
    const clip2 = createTestClip({ id: 'c2', trackId: 'v1', startFrames: 120, durationFrames: 60 });

    const markers: SequenceMarker[] = [
      { id: 'm1', sequenceId: 's1', frame: 50, name: 'Downbeat 1', locked: false, markerKind: 'downbeat', color: 'ai' },
      { id: 'm2', sequenceId: 's1', frame: 75, name: 'Beat 2', locked: false, markerKind: 'beat', color: 'success' },
    ];

    it('aggregates all environmental targets and excludes ignored clips', () => {
      const matrix = buildTimelineSnapMatrix({
        tracks: [track1],
        clips: [clip1, clip2],
        markers,
        playheadFrame: 45,
        inPointFrame: 20,
        outPointFrame: 200,
        sequenceEndFrame: 300,
        ignoreClipIds: ['c1'], // dragging clip1, ignore its own boundaries
      });

      const types = matrix.map((m) => m.type);
      expect(types).toContain('playhead');
      expect(types).toContain('in_point');
      expect(types).toContain('out_point');
      expect(types).toContain('downbeat');
      expect(types).toContain('beat');
      expect(types).toContain('sequence_end');

      // Clip2 boundaries are present (start 120, end 180)
      const frames = matrix.map((m) => m.frame);
      expect(frames).toContain(120);
      expect(frames).toContain(180);

      // Clip1 boundaries (0, 100) as clip_head should not be in the matrix from c1
      const clipHeadEntries = matrix.filter((m) => m.type === 'clip_head' && m.label.includes('Test Clip'));
      expect(clipHeadEntries.every((m) => m.frame !== 100)).toBe(true);
    });
  });
});
