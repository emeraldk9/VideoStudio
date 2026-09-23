import { describe, expect, it } from 'vitest';
import type { SequenceClip } from '../../../types/sequence';
import {
  attachClipToTrajectory,
  bakeTrajectoryToKeyframes,
  smoothTrajectory,
  simulateMotionTracking,
  type MotionTrackingTrajectory,
  type TrackedPoint,
} from '../motion-tracking-ops';

describe('motion-tracking-ops (Step S47: Motion Tracking & 2D Point Feature Follower)', () => {
  const mockTrajectory: MotionTrackingTrajectory = {
    id: 'traj_1',
    name: 'Hero Skater',
    sourceClipId: 'clip_video_1',
    startFrame: 0,
    smoothed: false,
    averageConfidence: 0.95,
    points: [
      { frame: 0, x: 0.2, y: 0.3, confidence: 0.96 },
      { frame: 1, x: 0.25, y: 0.32, confidence: 0.94 },
      { frame: 2, x: 0.3, y: 0.35, confidence: 0.95 },
      { frame: 3, x: 0.36, y: 0.37, confidence: 0.93 },
      { frame: 4, x: 0.42, y: 0.4, confidence: 0.95 },
    ],
  };

  describe('smoothTrajectory', () => {
    it('preserves start and end points exactly', () => {
      const smoothed = smoothTrajectory(mockTrajectory.points, 0.3);
      expect(smoothed.length).toBe(mockTrajectory.points.length);
      expect(smoothed[0].x).toBe(mockTrajectory.points[0].x);
      expect(smoothed[0].y).toBe(mockTrajectory.points[0].y);
      expect(smoothed[smoothed.length - 1].x).toBe(
        mockTrajectory.points[mockTrajectory.points.length - 1].x,
      );
      expect(smoothed[smoothed.length - 1].y).toBe(
        mockTrajectory.points[mockTrajectory.points.length - 1].y,
      );
    });

    it('attenuates high-frequency artificial jitter in raw points', () => {
      // Create path with alternating zig-zag jitter
      const noisyPoints: TrackedPoint[] = [
        { frame: 0, x: 0.2, y: 0.5, confidence: 0.9 },
        { frame: 1, x: 0.4, y: 0.5, confidence: 0.9 }, // +0.2 spike
        { frame: 2, x: 0.2, y: 0.5, confidence: 0.9 }, // -0.2 drop
        { frame: 3, x: 0.4, y: 0.5, confidence: 0.9 }, // +0.2 spike
        { frame: 4, x: 0.2, y: 0.5, confidence: 0.9 },
      ];

      const smoothed = smoothTrajectory(noisyPoints, 0.25);
      // Smoothed interior points should be closer to 0.3 average than 0.4 spike
      expect(smoothed[1].x).toBeLessThan(0.4);
      expect(smoothed[2].x).toBeGreaterThan(0.2);
    });

    it('handles short point arrays gracefully', () => {
      expect(smoothTrajectory([])).toEqual([]);
      const single: TrackedPoint[] = [{ frame: 0, x: 0.5, y: 0.5, confidence: 1 }];
      expect(smoothTrajectory(single)).toEqual(single);
    });
  });

  describe('bakeTrajectoryToKeyframes', () => {
    it('bakes both x and y properties for every frame by default', () => {
      const keys = bakeTrajectoryToKeyframes(mockTrajectory);
      // 5 points * 2 properties = 10 keyframes
      expect(keys.length).toBe(10);

      const xKeys = keys.filter((k) => k.property === 'x');
      const yKeys = keys.filter((k) => k.property === 'y');
      expect(xKeys.length).toBe(5);
      expect(yKeys.length).toBe(5);

      expect(xKeys[0].value).toBe(0.2);
      expect(yKeys[0].value).toBe(0.3);
      expect(xKeys[4].value).toBe(0.42);
      expect(yKeys[4].value).toBe(0.4);
    });

    it('applies positional offset to all baked coordinates', () => {
      const offset = { x: 0.1, y: -0.05 };
      const keys = bakeTrajectoryToKeyframes(mockTrajectory, { offset });

      const firstX = keys.find((k) => k.property === 'x' && k.frame === 0);
      const firstY = keys.find((k) => k.property === 'y' && k.frame === 0);
      expect(firstX?.value).toBeCloseTo(0.3, 3);
      expect(firstY?.value).toBeCloseTo(0.25, 3);
    });

    it('decimates by stepFrames and guarantees the final frame is included', () => {
      // 5 points (0, 1, 2, 3, 4) with step 2 -> frames 0, 2, 4
      const keys = bakeTrajectoryToKeyframes(mockTrajectory, { stepFrames: 2 });
      const frames = [...new Set(keys.map((k) => k.frame))];
      expect(frames).toEqual([0, 2, 4]);
    });
  });

  describe('attachClipToTrajectory', () => {
    const mockTextClip: SequenceClip = {
      id: 'clip_callout_text',
      sequenceId: 'seq1',
      trackId: 'track_overlay_v2',
      orderIndex: 0,
      sourceKind: 'text',
      filePath: null,
      startFrames: 0,
      durationFrames: 30,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Player Tag',
      overrides: [],
      keyframes: [
        { property: 'scale', frame: 0, value: 1.2, interpolation: 'linear' },
        { property: 'opacity', frame: 0, value: 0.9, interpolation: 'linear' },
        { property: 'x', frame: 0, value: 0.1, interpolation: 'linear' }, // Should be replaced
      ],
      effects: {
        transform: { opacity: 1, scale: 1, x: 0.1, y: 0.1 },
      },
    };

    it('attaches clip to trajectory, preserving scale and opacity while replacing x and y', () => {
      const attached = attachClipToTrajectory(mockTextClip, mockTrajectory, { x: 0, y: -0.1 });

      const scaleKeys = attached.keyframes?.filter((k) => k.property === 'scale');
      const opacityKeys = attached.keyframes?.filter((k) => k.property === 'opacity');
      const xKeys = attached.keyframes?.filter((k) => k.property === 'x');
      const yKeys = attached.keyframes?.filter((k) => k.property === 'y');

      expect(scaleKeys?.length).toBe(1);
      expect(opacityKeys?.length).toBe(1);
      expect(xKeys?.length).toBe(5);
      expect(yKeys?.length).toBe(5);

      // Verify offset y: 0.3 - 0.1 = 0.2
      expect(yKeys?.[0].value).toBeCloseTo(0.2, 3);
      expect(attached.effects?.transform?.x).toBeCloseTo(0.2, 3);
      expect(attached.effects?.transform?.y).toBeCloseTo(0.2, 3);
    });
  });

  describe('simulateMotionTracking', () => {
    it('generates smooth paths for all simulation types', () => {
      const types = [
        'linear_pan',
        'parabolic_arc',
        'orbital_circle',
        'wandering_subject',
      ] as const;

      for (const t of types) {
        const points = simulateMotionTracking({ x: 0.3, y: 0.4 }, t, 20, 0.001);
        expect(points.length).toBe(20);
        expect(points[0].frame).toBe(0);
        expect(points[19].frame).toBe(19);

        for (const pt of points) {
          expect(pt.x).toBeGreaterThanOrEqual(0);
          expect(pt.x).toBeLessThanOrEqual(1);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(1);
          expect(pt.confidence).toBeGreaterThan(0.85);
        }
      }
    });
  });
});
