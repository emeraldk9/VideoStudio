import { describe, expect, it } from 'vitest';
import {
  buildMotionPathSegments,
  calculateMotionVelocity,
  distance2D,
  estimateSegmentArcLength,
  evaluateCubicBezier2D,
  evaluateCubicBezierDerivative2D,
  evaluateMotionEasing,
  evaluateSpatialMotionPath,
  evaluateTransformAtFrame,
  extractSpatialWaypoints,
  generateMotionPathSvg,
  smoothKeyframeTangents,
  solveTForArcLength,
  type ClipKeyframe,
  type MotionPathWaypoint,
  type Vector2D,
} from '../transform-motion-path-ops';

describe('transform-motion-path-ops (Milestone S185: Video Transform Keyframing Engine & Motion Path Spline)', () => {
  describe('evaluateMotionEasing', () => {
    it('returns exact boundary values for all easing curves at 0 and 1', () => {
      const curves = [
        'linear',
        'ease_in_quad',
        'ease_out_quad',
        'ease_in_out_cubic',
        'ease_in_out_sine',
        'spring_elastic_overshoot',
        'cinematic_smooth',
      ] as const;

      for (const curve of curves) {
        expect(evaluateMotionEasing(0, curve)).toBeCloseTo(0, 5);
        expect(evaluateMotionEasing(1, curve)).toBeCloseTo(1, 5);
      }
    });

    it('evaluates linear progression accurately', () => {
      expect(evaluateMotionEasing(0.25, 'linear')).toBe(0.25);
      expect(evaluateMotionEasing(0.5, 'linear')).toBe(0.5);
      expect(evaluateMotionEasing(0.75, 'linear')).toBe(0.75);
    });

    it('evaluates cinematic smooth polynomial (smoothstep)', () => {
      // S-curve centered around 0.5
      expect(evaluateMotionEasing(0.5, 'cinematic_smooth')).toBe(0.5);
      expect(evaluateMotionEasing(0.25, 'cinematic_smooth')).toBeLessThan(0.25);
      expect(evaluateMotionEasing(0.75, 'cinematic_smooth')).toBeGreaterThan(0.75);
    });

    it('exhibits spring overshoot above 1.0 before settling', () => {
      // Elastic spring reaches peak > 1.0 around t = 0.7 - 0.9
      const values = Array.from({ length: 10 }, (_, i) => evaluateMotionEasing((i + 1) / 10, 'spring_elastic_overshoot'));
      const hasOvershoot = values.some((v) => v > 1.0);
      expect(hasOvershoot).toBe(true);
    });
  });

  describe('Cubic Bézier 2D evaluation & Arc Length', () => {
    const p0: Vector2D = { x: 0, y: 0 };
    const c1: Vector2D = { x: 0, y: 100 };
    const c2: Vector2D = { x: 100, y: 100 };
    const p1: Vector2D = { x: 100, y: 0 };

    it('evaluates start and end points at t=0 and t=1', () => {
      const at0 = evaluateCubicBezier2D(p0, c1, c2, p1, 0);
      const at1 = evaluateCubicBezier2D(p0, c1, c2, p1, 1);
      expect(at0.x).toBe(0);
      expect(at0.y).toBe(0);
      expect(at1.x).toBe(100);
      expect(at1.y).toBe(0);
    });

    it('evaluates mid-curve symmetry at t=0.5', () => {
      const atMid = evaluateCubicBezier2D(p0, c1, c2, p1, 0.5);
      expect(atMid.x).toBe(50);
      expect(atMid.y).toBe(75);
    });

    it('evaluates derivatives correctly', () => {
      const d0 = evaluateCubicBezierDerivative2D(p0, c1, c2, p1, 0);
      // At t=0, dP/dt = 3*(c1 - p0) = (0, 300)
      expect(d0.x).toBe(0);
      expect(d0.y).toBe(300);
    });

    it('computes arc length strictly greater than chord length on curved paths', () => {
      const chord = distance2D(p0, p1); // 100
      const arcLen = estimateSegmentArcLength(p0, c1, c2, p1);
      expect(chord).toBe(100);
      expect(arcLen).toBeGreaterThan(150);
    });
  });

  describe('Motion Path Catmull-Rom Spline segments', () => {
    const waypoints: MotionPathWaypoint[] = [
      { frame: 0, x: 0.1, y: 0.1 },
      { frame: 30, x: 0.5, y: 0.8 },
      { frame: 60, x: 0.9, y: 0.2 },
    ];

    it('generates N-1 cubic Bézier segments from N waypoints', () => {
      const segments = buildMotionPathSegments(waypoints);
      expect(segments.length).toBe(2);

      // Segment 1: frame 0 -> 30
      expect(segments[0].startFrame).toBe(0);
      expect(segments[0].endFrame).toBe(30);
      expect(segments[0].p0.x).toBe(0.1);
      expect(segments[0].p1.x).toBe(0.5);

      // Segment 2: frame 30 -> 60
      expect(segments[1].startFrame).toBe(30);
      expect(segments[1].endFrame).toBe(60);
      expect(segments[1].p0.x).toBe(0.5);
      expect(segments[1].p1.x).toBe(0.9);
    });

    it('interpolates position smoothly along the spline path', () => {
      const segments = buildMotionPathSegments(waypoints);

      const pos0 = evaluateSpatialMotionPath(segments, 0);
      const pos30 = evaluateSpatialMotionPath(segments, 30);
      const pos60 = evaluateSpatialMotionPath(segments, 60);

      expect(pos0?.x).toBeCloseTo(0.1, 4);
      expect(pos0?.y).toBeCloseTo(0.1, 4);
      expect(pos30?.x).toBeCloseTo(0.5, 4);
      expect(pos30?.y).toBeCloseTo(0.8, 4);
      expect(pos60?.x).toBeCloseTo(0.9, 4);
      expect(pos60?.y).toBeCloseTo(0.2, 4);

      // Intermediate point between frame 0 and 30
      const pos15 = evaluateSpatialMotionPath(segments, 15);
      expect(pos15?.x).toBeGreaterThan(0.1);
      expect(pos15?.x).toBeLessThan(0.5);
      expect(pos15?.y).toBeGreaterThan(0.1);
    });

    it('inverts arc length via solveTForArcLength for constant speed', () => {
      const segments = buildMotionPathSegments(waypoints);
      const seg = segments[0];

      const tAtZero = solveTForArcLength(seg, 0);
      const tAtFull = solveTForArcLength(seg, seg.arcLength);
      const tAtHalf = solveTForArcLength(seg, seg.arcLength / 2);

      expect(tAtZero).toBe(0);
      expect(tAtFull).toBe(1);
      expect(tAtHalf).toBeGreaterThan(0.3);
      expect(tAtHalf).toBeLessThan(0.7);
    });
  });

  describe('Motion Velocity & Auto-Orientation', () => {
    const horizontalMove: MotionPathWaypoint[] = [
      { frame: 0, x: 0.1, y: 0.5 },
      { frame: 30, x: 0.9, y: 0.5 },
    ];

    const verticalMove: MotionPathWaypoint[] = [
      { frame: 0, x: 0.5, y: 0.1 },
      { frame: 30, x: 0.5, y: 0.9 },
    ];

    it('calculates rightward velocity with 0 degree heading', () => {
      const segments = buildMotionPathSegments(horizontalMove);
      const vel = calculateMotionVelocity(segments, 15, 30, 1920, 1080);

      expect(vel.vx).toBeGreaterThan(0);
      expect(vel.vy).toBeCloseTo(0, 1);
      expect(vel.speed).toBeGreaterThan(100);
      expect(vel.headingDeg).toBeCloseTo(0, 0);
    });

    it('calculates downward velocity with 90 degree heading', () => {
      const segments = buildMotionPathSegments(verticalMove);
      const vel = calculateMotionVelocity(segments, 15, 30, 1920, 1080);

      expect(vel.vx).toBeCloseTo(0, 1);
      expect(vel.vy).toBeGreaterThan(0);
      expect(vel.headingDeg).toBeCloseTo(90, 0);
    });
  });

  describe('SVG Motion Path synthesis', () => {
    const waypoints: MotionPathWaypoint[] = [
      { frame: 0, x: 0.2, y: 0.2 },
      { frame: 20, x: 0.6, y: 0.3 },
      { frame: 40, x: 0.8, y: 0.7 },
    ];

    it('generates valid SVG path syntax with M and C commands', () => {
      const segments = buildMotionPathSegments(waypoints);
      const svg = generateMotionPathSvg(segments, waypoints, 1000, 1000);

      expect(svg.svgPathD.startsWith('M 200 200')).toBe(true);
      expect(svg.svgPathD).toContain('C');
      expect(svg.waypointPositions.length).toBe(3);
      expect(svg.sampledPoints.length).toBeGreaterThan(20);
      expect(svg.totalPathLengthPx).toBeGreaterThan(500);
    });
  });

  describe('evaluateTransformAtFrame (Full 2D state)', () => {
    const keyframes: ClipKeyframe[] = [
      { property: 'x', frame: 0, value: 0.2, interpolation: 'linear' },
      { property: 'x', frame: 40, value: 0.8, interpolation: 'linear' },
      { property: 'y', frame: 0, value: 0.2, interpolation: 'linear' },
      { property: 'y', frame: 40, value: 0.8, interpolation: 'linear' },
      { property: 'scale', frame: 0, value: 1.0, interpolation: 'linear' },
      { property: 'scale', frame: 40, value: 2.0, interpolation: 'linear' },
      { property: 'rotation', frame: 0, value: 0, interpolation: 'linear' },
      { property: 'rotation', frame: 40, value: 90, interpolation: 'linear' },
      { property: 'opacity', frame: 0, value: 0.5, interpolation: 'linear' },
      { property: 'opacity', frame: 40, value: 1.0, interpolation: 'linear' },
    ];

    it('extracts waypoints from x and y keyframes', () => {
      const waypoints = extractSpatialWaypoints(keyframes);
      expect(waypoints.length).toBe(2);
      expect(waypoints[0].frame).toBe(0);
      expect(waypoints[1].frame).toBe(40);
    });

    it('evaluates all transform properties at mid-flight frame 20', () => {
      const transform = evaluateTransformAtFrame(keyframes, {}, 20, 30);

      expect(transform.x).toBeCloseTo(0.5, 2);
      expect(transform.y).toBeCloseTo(0.5, 2);
      expect(transform.scaleX).toBeCloseTo(1.5, 2);
      expect(transform.scaleY).toBeCloseTo(1.5, 2);
      expect(transform.rotationDeg).toBeCloseTo(45, 1);
      expect(transform.opacity).toBeCloseTo(0.75, 2);
    });

    it('applies autoOrient heading offset to rotation when enabled', () => {
      const transform = evaluateTransformAtFrame(keyframes, {}, 20, 30, {
        autoOrient: true,
        boxWidthPx: 1000,
        boxHeightPx: 1000,
      });

      // In 1:1 aspect ratio, moving from (0.2, 0.2) to (0.8, 0.8) has heading 45 deg.
      // Base rotation is 45 deg.
      // Total rotation with auto-orient = 45 + 45 = 90 deg!
      expect(transform.rotationDeg).toBeCloseTo(90, 0);
    });

    it('returns defaults when no keyframes are defined', () => {
      const transform = evaluateTransformAtFrame([], { x: 0.3, y: 0.4 }, 15);
      expect(transform.x).toBe(0.3);
      expect(transform.y).toBe(0.4);
      expect(transform.scaleX).toBe(1.0);
      expect(transform.rotationDeg).toBe(0);
      expect(transform.opacity).toBe(1.0);
    });
  });

  describe('smoothKeyframeTangents', () => {
    it('calculates smooth Catmull-Rom cubic bezier handles across keyframes', () => {
      const linearKeys: ClipKeyframe[] = [
        { property: 'x', frame: 0, value: 0.1, interpolation: 'linear' },
        { property: 'x', frame: 30, value: 0.5, interpolation: 'linear' },
        { property: 'x', frame: 60, value: 0.9, interpolation: 'linear' },
      ];

      const smoothed = smoothKeyframeTangents(linearKeys);

      expect(smoothed.length).toBe(3);
      expect(smoothed[0].interpolation).toBe('bezier');
      expect(smoothed[0].handleOut).toBeDefined();
      expect(smoothed[1].interpolation).toBe('bezier');
      expect(smoothed[1].handleIn).toBeDefined();
      expect(smoothed[1].handleOut).toBeDefined();
      expect(smoothed[2].interpolation).toBe('bezier');
      expect(smoothed[2].handleIn).toBeDefined();

      // For linear progression slope = (0.9 - 0.1) / 60 = 0.8 / 60 = 0.01333
      // Handle offsets should be proportional and smooth
      expect(smoothed[1].handleIn?.frameOffset).toBeLessThan(0);
      expect(smoothed[1].handleOut?.frameOffset).toBeGreaterThan(0);
    });

    it('returns empty array when undefined or empty keyframes provided', () => {
      expect(smoothKeyframeTangents(undefined)).toEqual([]);
      expect(smoothKeyframeTangents([])).toEqual([]);
    });
  });
});

