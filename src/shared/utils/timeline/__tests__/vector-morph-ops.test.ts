import { describe, it, expect } from 'vitest';
import {
  pathLength,
  resamplePathUniform,
  alignPathOrientation,
  interpolatePaths,
  easeInOutQuad,
  computeMorphFrame,
  Point2D,
} from '../vector-morph-ops';

describe('vector-morph-ops', () => {
  it('accurately computes cumulative path length', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([[0, 0]])).toBe(0);
    expect(pathLength([[0, 0], [30, 40]])).toBeCloseTo(50.0);
    expect(pathLength([[0, 0], [10, 0], [10, 10]])).toBeCloseTo(20.0);
  });

  it('resamples path into uniform arc-length vertices', () => {
    const raw: Point2D[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];

    const resampled = resamplePathUniform(raw, 51);
    expect(resampled.length).toBe(51);
    expect(resampled[0]).toEqual([0, 0]);
    expect(resampled[50]).toEqual([100, 100]);

    // Midpoint should be exactly at the corner (100, 0)
    const mid = resampled[25];
    expect(mid[0]).toBeCloseTo(100.0, 1);
    expect(mid[1]).toBeCloseTo(0.0, 1);
  });

  it('aligns path orientation to prevent cross-twisting', () => {
    const p1: Point2D[] = [
      [0, 0],
      [50, 0],
      [100, 0],
    ];
    // Inverted direction
    const p2Inverted: Point2D[] = [
      [100, 10],
      [50, 10],
      [0, 10],
    ];

    const aligned = alignPathOrientation(p1, p2Inverted, false);
    expect(aligned[0][0]).toBe(0);
    expect(aligned[2][0]).toBe(100);
  });

  it('linearly interpolates normalized paths', () => {
    const p1: Point2D[] = [[0, 0], [10, 10]];
    const p2: Point2D[] = [[100, 100], [200, 200]];

    const mid = interpolatePaths(p1, p2, 0.5);
    expect(mid[0]).toEqual([50, 50]);
    expect(mid[1]).toEqual([105, 105]);
  });

  it('computes complete morph frame with pen tip tracking', () => {
    const triangle: Point2D[][] = [
      [
        [50, 150],
        [150, 50],
        [250, 150],
        [50, 150],
      ],
    ];
    const square: Point2D[][] = [
      [
        [60, 60],
        [240, 60],
        [240, 240],
        [60, 240],
        [60, 60],
      ],
    ];

    const start = computeMorphFrame(triangle, square, 0.0, 60);
    expect(start.interpolatedStrokes.length).toBe(1);
    expect(start.interpolatedStrokes[0].length).toBe(60);

    const mid = computeMorphFrame(triangle, square, 0.5, 60);
    expect(mid.interpolatedStrokes[0].length).toBe(60);
    expect(mid.penTip[0]).toBeGreaterThan(0);
    expect(mid.penTip[1]).toBeGreaterThan(0);
    expect(typeof mid.penTip[2]).toBe('number');

    const end = computeMorphFrame(triangle, square, 1.0, 60);
    expect(end.interpolatedStrokes[0].length).toBe(60);
  });
});
