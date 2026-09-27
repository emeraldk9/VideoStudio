import { describe, it, expect } from 'vitest';
import {
  strokeLength,
  strokeBBox,
  bboxDistance,
  strokeMinDistance,
  clusterStrokes,
  computeStrokeSaliency,
  hierarchicalSaliencySort,
  reorderStrokesBySaliency,
} from '../saliency-clustering-ops';
import type { Point2D } from '../calligraphy-ops';

describe('saliency-clustering-ops', () => {
  it('computes stroke length, bounding box, and bounding box distance', () => {
    const stroke: Point2D[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(strokeLength(stroke)).toBeCloseTo(20.0, 5);

    const bbox = strokeBBox(stroke);
    expect(bbox).toEqual([0, 0, 10, 10]);

    const otherBBox = strokeBBox([
      [20, 0],
      [30, 0],
    ]);
    // distance between [0,0,10,10] and [20,0,30,0] is dx = 20 - 10 = 10, dy = 0 => 10
    expect(bboxDistance(bbox, otherBBox)).toBeCloseTo(10.0, 5);

    // strokeMinDistance
    const s1: Point2D[] = [[0, 0], [10, 0]];
    const s2: Point2D[] = [[15, 0], [25, 0]];
    expect(strokeMinDistance(s1, s2, 50)).toBeCloseTo(5.0, 5);
  });

  it('clusters strokes into connected visual entities based on proximity', () => {
    // Entity A at x in [0, 40]
    const strokeA1: Point2D[] = [[0, 0], [20, 0], [20, 20]];
    const strokeA2: Point2D[] = [[22, 2], [30, 5]]; // close to A1

    // Entity B at x in [300, 350]
    const strokeB1: Point2D[] = [[300, 300], [350, 300]];
    const strokeB2: Point2D[] = [[305, 305], [340, 320]]; // close to B1

    const strokes = [strokeA1, strokeB1, strokeA2, strokeB2];
    const clusters = clusterStrokes(strokes, 40.0);

    expect(clusters.length).toBe(2);
    // Entity A should contain indices 0 and 2
    // Entity B should contain indices 1 and 3
    const clusterSets = clusters.map((c) => new Set(c));
    const hasA = clusterSets.some((s) => s.has(0) && s.has(2) && !s.has(1) && !s.has(3));
    const hasB = clusterSets.some((s) => s.has(1) && s.has(3) && !s.has(0) && !s.has(2));
    expect(hasA).toBe(true);
    expect(hasB).toBe(true);
  });

  it('evaluates stroke saliency prioritizing long contours and large bounds', () => {
    const bigOutline: Point2D[] = [
      [100, 100],
      [400, 100],
      [400, 400],
      [100, 400],
      [100, 100],
    ];
    const tinyDetail: Point2D[] = [
      [200, 200],
      [205, 205],
    ];

    const scores = computeStrokeSaliency([bigOutline, tinyDetail]);
    expect(scores.length).toBe(2);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it('hierarchically sorts strokes: visual entities stay contiguous and contours precede details', () => {
    // Component 1 (left): outer box + small inner hatch
    const c1Outline: Point2D[] = [
      [50, 50],
      [150, 50],
      [150, 150],
      [50, 150],
      [50, 50],
    ];
    const c1Hatch: Point2D[] = [
      [70, 70],
      [80, 80],
    ];

    // Component 2 (right): outer box + small inner hatch
    const c2Outline: Point2D[] = [
      [800, 50],
      [900, 50],
      [900, 150],
      [800, 150],
      [800, 50],
    ];
    const c2Hatch: Point2D[] = [
      [820, 70],
      [830, 80],
    ];

    // Mixed input order: hatch1, outline2, outline1, hatch2
    // Indices: 0: c1Hatch, 1: c2Outline, 2: c1Outline, 3: c2Hatch
    const inputStrokes = [c1Hatch, c2Outline, c1Outline, c2Hatch];
    const order = hierarchicalSaliencySort(inputStrokes, { maxDistance: 60 });

    expect(order.length).toBe(4);

    // Check entity contiguity: indices {0, 2} (Entity 1) and {1, 3} (Entity 2) must each appear consecutively
    const firstTwo = new Set(order.slice(0, 2));
    const lastTwo = new Set(order.slice(2, 4));

    const isGrouped =
      (firstTwo.has(0) && firstTwo.has(2) && lastTwo.has(1) && lastTwo.has(3)) ||
      (firstTwo.has(1) && firstTwo.has(3) && lastTwo.has(0) && lastTwo.has(2));
    expect(isGrouped).toBe(true);

    // In whichever entity comes first/second, the outline must come before its hatch!
    const idxC1Outline = order.indexOf(2);
    const idxC1Hatch = order.indexOf(0);
    expect(idxC1Outline).toBeLessThan(idxC1Hatch);

    const idxC2Outline = order.indexOf(1);
    const idxC2Hatch = order.indexOf(3);
    expect(idxC2Outline).toBeLessThan(idxC2Hatch);

    // Test reorderStrokesBySaliency returns correctly ordered strokes
    const reordered = reorderStrokesBySaliency(inputStrokes, { maxDistance: 60 });
    expect(reordered.length).toBe(4);
    expect(reordered[0]).toEqual(inputStrokes[order[0]]);
  });
});
