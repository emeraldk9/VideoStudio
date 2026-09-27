import { describe, it, expect } from 'vitest';
import {
  computeOtsuThreshold,
  binarizeBitmap,
  isPointInPolygon,
  calculatePolylineLength,
  simplifyContourRdp,
  traceBitmapContours,
  vectorizeBitmap,
  generateSvgFromVectorizedArt,
} from '../bitmap-vectorizer-ops';
import type { Point2D } from '../calligraphy-ops';

describe('bitmap-vectorizer-ops', () => {
  it('computes Otsu threshold for bimodal pixel distributions', () => {
    // 50 dark pixels (value 20) and 50 light pixels (value 240)
    const pixels = new Uint8Array(100);
    for (let i = 0; i < 50; i++) pixels[i] = 20;
    for (let i = 50; i < 100; i++) pixels[i] = 240;

    const threshold = computeOtsuThreshold(pixels);
    expect(threshold).toBeGreaterThan(20);
    expect(threshold).toBeLessThan(240);
  });

  it('binarizes grayscale bitmap correctly with invert=true', () => {
    const pixels = new Uint8Array([10, 20, 200, 250]);
    const binary = binarizeBitmap(pixels, 100, true);
    expect(binary[0]).toBe(1);
    expect(binary[1]).toBe(1);
    expect(binary[2]).toBe(0);
    expect(binary[3]).toBe(0);
  });

  it('tests point in polygon geometric inclusion', () => {
    const square: Point2D[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];

    expect(isPointInPolygon([5, 5], square)).toBe(true);
    expect(isPointInPolygon([15, 5], square)).toBe(false);
    expect(isPointInPolygon([-1, -1], square)).toBe(false);
  });

  it('simplifies polylines via RDP preserving endpoints', () => {
    const collinear: Point2D[] = [
      [0, 0],
      [1, 0.1],
      [2, 0.05],
      [3, 0],
      [4, 0],
    ];
    const simplified = simplifyContourRdp(collinear, 0.5);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[1]).toEqual([4, 0]);
  });

  it('calculates polyline length accurately', () => {
    const line: Point2D[] = [
      [0, 0],
      [3, 4], // distance 5
      [3, 0], // distance 4
    ];
    expect(calculatePolylineLength(line, false)).toBeCloseTo(9, 2);
    // Closed back to (0,0): distance 3 -> total 12
    expect(calculatePolylineLength(line, true)).toBeCloseTo(12, 2);
  });

  it('traces closed contours from a binary raster grid', () => {
    // 8x8 image with a 4x4 foreground box in the middle
    const w = 8;
    const h = 8;
    const binary = new Uint8Array(w * h);

    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        binary[y * w + x] = 1;
      }
    }

    const contours = traceBitmapContours(binary, w, h);
    expect(contours.length).toBeGreaterThan(0);
    const mainContour = contours[0];
    expect(mainContour.length).toBeGreaterThanOrEqual(4);
    // Loops back to starting point
    expect(mainContour[0]).toEqual(mainContour[mainContour.length - 1]);
  });

  it('performs end-to-end vectorization, topological hole detection, and SVG output', () => {
    const w = 20;
    const h = 20;
    const gray = new Uint8Array(w * h).fill(255); // white paper

    // Draw an outer solid box from (3,3) to (16,16)
    for (let y = 3; y <= 16; y++) {
      for (let x = 3; x <= 16; x++) {
        gray[y * w + x] = 20; // dark ink
      }
    }

    // Carve a hollow white hole inside from (7,7) to (12,12)
    for (let y = 7; y <= 12; y++) {
      for (let x = 7; x <= 12; x++) {
        gray[y * w + x] = 255; // paper hole
      }
    }

    const art = vectorizeBitmap(gray, w, h, {
      threshold: 128,
      minPathLength: 8,
      cornerTolerance: 0.8,
    });

    expect(art.width).toBe(w);
    expect(art.height).toBe(h);
    expect(art.paths.length).toBeGreaterThanOrEqual(1);

    // Verify SVG generation
    const svg = generateSvgFromVectorizedArt(art);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 20 20"');
    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="#333333"');
    expect(svg).toContain('</svg>');
  });
});
