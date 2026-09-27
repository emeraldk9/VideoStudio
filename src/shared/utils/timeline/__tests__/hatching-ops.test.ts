import { describe, it, expect } from 'vitest';
import {
  rotatePoint,
  generateSinglePassHatch,
  chainSerpentineStrokes,
  generateHatchStrokes,
  Point2D,
} from '../hatching-ops';

describe('hatching-ops', () => {
  it('correctly rotates 2D points', () => {
    const pt: Point2D = [10, 0];
    const rotated = rotatePoint(pt, Math.PI / 2);
    expect(rotated[0]).toBeCloseTo(0.0, 5);
    expect(rotated[1]).toBeCloseTo(10.0, 5);
  });

  it('generates clipped scanline segments inside a rectangle', () => {
    const rect: Point2D[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];

    const segs = generateSinglePassHatch(rect, 45.0, 10.0);
    expect(segs.length).toBeGreaterThanOrEqual(8);

    // Every segment point should be inside or on bounds
    for (const [pStart, pEnd] of segs) {
      expect(pStart[0]).toBeGreaterThanOrEqual(-0.01);
      expect(pStart[0]).toBeLessThanOrEqual(100.01);
      expect(pStart[1]).toBeGreaterThanOrEqual(-0.01);
      expect(pStart[1]).toBeLessThanOrEqual(100.01);

      expect(pEnd[0]).toBeGreaterThanOrEqual(-0.01);
      expect(pEnd[0]).toBeLessThanOrEqual(100.01);
      expect(pEnd[1]).toBeGreaterThanOrEqual(-0.01);
      expect(pEnd[1]).toBeLessThanOrEqual(100.01);
    }
  });

  it('chains segments into continuous serpentine path', () => {
    const segs = generateSinglePassHatch(
      [
        [0, 0],
        [60, 0],
        [60, 60],
        [0, 60],
      ],
      0.0,
      15.0
    );

    const chained = chainSerpentineStrokes(segs);
    expect(chained.length).toBe(segs.length * 2);
  });

  it('generates multi-pass cross-hatching strokes', () => {
    const poly: Point2D[] = [
      [20, 20],
      [80, 20],
      [80, 80],
      [20, 80],
    ];

    // Single pass
    const single = generateHatchStrokes(poly, 45.0, 10.0, false);
    expect(single.length).toBe(1);
    expect(single[0].length).toBeGreaterThan(10);

    // Cross-hatch (2 passes)
    const crossed = generateHatchStrokes(poly, 45.0, 10.0, true);
    expect(crossed.length).toBe(2);
    expect(crossed[0].length).toBeGreaterThan(10);
    expect(crossed[1].length).toBeGreaterThan(10);
  });
});
