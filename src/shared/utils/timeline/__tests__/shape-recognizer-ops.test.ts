import { describe, expect, it } from 'vitest';
import {
  recognizeGeometricShape,
  generateRegularizedShapeSvgPath,
} from '../shape-recognizer-ops';
import type { Point2D } from '../calligraphy-ops';

describe('shape-recognizer-ops', () => {
  it('recognizes and regularizes a wobbly hand-drawn circle', () => {
    const rawCircle: Point2D[] = [];
    for (let i = 0; i < 32; i++) {
      const theta = (2 * Math.PI * i) / 32;
      const jitter = 2 * Math.sin(i * 3);
      const r = 50 + jitter;
      rawCircle.push([100 + r * Math.cos(theta), 100 + r * Math.sin(theta)]);
    }
    rawCircle.push(rawCircle[0]);

    const res = recognizeGeometricShape(rawCircle, 0.20);
    expect(res.shapeType).toBe('circle');
    expect(res.confidence).toBeGreaterThan(0.75);
    expect(res.regularizedPoints.length).toBeGreaterThan(20);
    expect(res.center[0]).toBeCloseTo(100, 0);
    expect(res.center[1]).toBeCloseTo(100, 0);

    const svg = generateRegularizedShapeSvgPath(res);
    expect(svg.startsWith('M ')).toBe(true);
    expect(svg.endsWith('Z')).toBe(true);
  });

  it('recognizes a hand-drawn rectangle and triangular polygons', () => {
    const rawRect: Point2D[] = [
      [50, 50], [100, 51], [150, 50],
      [151, 90], [150, 120],
      [100, 119], [50, 120],
      [49, 80], [50, 50],
    ];
    const resRect = recognizeGeometricShape(rawRect, 0.20);
    expect(resRect.shapeType).toBe('rectangle');
    expect(resRect.regularizedPoints.length).toBe(5);

    const rawTri: Point2D[] = [
      [100, 40], [120, 70], [150, 110],
      [100, 112], [50, 110],
      [75, 75], [100, 40],
    ];
    const resTri = recognizeGeometricShape(rawTri, 0.20);
    expect(resTri.shapeType).toBe('triangle');
    expect(resTri.regularizedPoints.length).toBe(4);
  });

  it('recognizes a straight line and snaps angle to horizontal', () => {
    const rawLine: Point2D[] = [];
    for (let i = 0; i < 10; i++) {
      rawLine.push([20 + i * 20, 100 + Math.sin(i * 0.4) * 1.5]);
    }
    const resLine = recognizeGeometricShape(rawLine, 0.20, true);
    expect(resLine.shapeType).toBe('line');
    expect(resLine.regularizedPoints.length).toBe(2);
    expect(resLine.rotationDeg).toBeCloseTo(0, 0);

    const svg = generateRegularizedShapeSvgPath(resLine);
    expect(svg.startsWith('M ')).toBe(true);
    expect(svg.endsWith('Z')).toBe(false); // Lines do not close with Z
  });
});
