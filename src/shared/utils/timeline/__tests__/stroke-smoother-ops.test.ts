import { describe, it, expect } from 'vitest';
import {
  pointDistance,
  perpendicularDistance,
  detectCornerIndices,
  ramerDouglasPeucker,
  simplifyStroke,
  fitCatmullRomToBezier,
  sampleBezierSegment,
  sampleSmoothTrajectory,
  Point2D,
} from '../stroke-smoother-ops';

describe('stroke-smoother-ops', () => {
  it('correctly calculates point distance and perpendicular distance', () => {
    expect(pointDistance([0, 0], [3, 4])).toBeCloseTo(5.0);

    // Point exactly on segment
    expect(perpendicularDistance([5, 0], [0, 0], [10, 0])).toBeCloseTo(0.0);

    // Point perpendicular to midpoint
    expect(perpendicularDistance([5, 5], [0, 0], [10, 0])).toBeCloseTo(5.0);

    // Point beyond segment endpoints (clamped to start or end)
    expect(perpendicularDistance([-3, 4], [0, 0], [10, 0])).toBeCloseTo(5.0);
    expect(perpendicularDistance([13, 4], [0, 0], [10, 0])).toBeCloseTo(5.0);
  });

  it('detects sharp corner landmark vertices', () => {
    // Construct polyline with 90-degree corner at (50, 0)
    const pts: Point2D[] = [];
    for (let x = 0; x <= 50; x += 5) pts.push([x, 0]);
    for (let y = 5; y <= 50; y += 5) pts.push([50, y]);

    const corners = detectCornerIndices(pts, 2, 55.0);
    expect(corners.length).toBeGreaterThanOrEqual(1);

    const cornerPoint = pts[corners[0]];
    expect(cornerPoint[0]).toBe(50);
    expect(cornerPoint[1]).toBe(0);
  });

  it('decimates collinear points using RDP algorithm', () => {
    // 50 collinear points on a line y = 2x
    const pts: Point2D[] = [];
    for (let i = 0; i <= 50; i++) {
      pts.push([i, i * 2]);
    }

    const simplified = ramerDouglasPeucker(pts, 0.5);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[1]).toEqual([50, 100]);
  });

  it('preserves sharp corners during simplifyStroke', () => {
    // Create an L-shaped path with subtle jitter
    const pts: Point2D[] = [];
    for (let x = 0; x <= 100; x++) {
      pts.push([x, 10 + (x % 2 === 0 ? 0.1 : -0.1)]);
    }
    for (let y = 11; y <= 80; y++) {
      pts.push([100 + (y % 2 === 0 ? 0.1 : -0.1), y]);
    }

    const simplified = simplifyStroke(pts, 1.0, 55.0);

    // Reduction ratio should exceed 75%
    const ratio = 1 - simplified.length / pts.length;
    expect(ratio).toBeGreaterThan(0.75);

    // Corner at (100, 10) must be preserved
    const hasCorner = simplified.some(
      p => Math.abs(p[0] - 100) <= 2 && Math.abs(p[1] - 10) <= 2
    );
    expect(hasCorner).toBe(true);
  });

  it('fits Catmull-Rom cubic Bezier curves and evaluates smooth samples', () => {
    const pts: Point2D[] = [
      [0, 0],
      [50, 20],
      [100, 0],
      [150, -20],
      [200, 0],
    ];

    const segments = fitCatmullRomToBezier(pts);
    expect(segments.length).toBe(4);

    // Check first segment endpoints match points
    expect(segments[0][0]).toEqual([0, 0]);
    expect(segments[0][3]).toEqual([50, 20]);

    // Sample segment at u = 0.5
    const [x, y, angle] = sampleBezierSegment(
      segments[0][0],
      segments[0][1],
      segments[0][2],
      segments[0][3],
      0.5
    );
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(50);
    expect(typeof angle).toBe('number');
    expect(angle).toBeGreaterThanOrEqual(-Math.PI);
    expect(angle).toBeLessThanOrEqual(Math.PI);
  });

  it('samples smooth trajectory end-to-end', () => {
    const raw: Point2D[] = [];
    for (let t = 0; t <= 100; t++) {
      raw.push([t, Math.sin((t / 20) * Math.PI) * 20]);
    }

    const traj = sampleSmoothTrajectory(raw, 5.0, 1.0, 55.0);
    expect(traj.length).toBeGreaterThan(10);

    // Every sample must have valid coordinates and tangent angles
    for (const [x, y, theta] of traj) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(theta)).toBe(true);
      expect(theta).toBeGreaterThanOrEqual(-Math.PI);
      expect(theta).toBeLessThanOrEqual(Math.PI);
    }
  });
});
