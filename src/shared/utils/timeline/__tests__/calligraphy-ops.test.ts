import { describe, it, expect } from 'vitest';
import {
  computePointNormals,
  computeVariableWidths,
  extrudeVariableWidthPolygon,
  buildSvgPolygonPath,
  Point2D,
} from '../calligraphy-ops';

describe('calligraphy-ops', () => {
  it('correctly calculates point normal vectors and tangent angles', () => {
    const pts: Point2D[] = [
      [0, 50],
      [50, 50],
      [100, 50],
    ];

    const { normals, angles } = computePointNormals(pts);
    expect(normals.length).toBe(3);
    expect(angles.length).toBe(3);

    // For horizontal line moving right, tangent is [1, 0], angle is 0, normal is [0, 1]
    for (const [nx, ny] of normals) {
      expect(nx).toBeCloseTo(0.0, 4);
      expect(ny).toBeCloseTo(1.0, 4);
    }
    for (const ang of angles) {
      expect(ang).toBeCloseTo(0.0, 4);
    }
  });

  it('computes tapered widths at stroke start and end', () => {
    const pts: Point2D[] = [];
    for (let x = 0; x <= 100; x += 5) {
      pts.push([x, 20]);
    }

    const { angles } = computePointNormals(pts);
    const widths = computeVariableWidths(pts, angles, 10.0, { taper: true, minWidthRatio: 0.3 });

    expect(widths.length).toBe(pts.length);
    const midIdx = Math.floor(pts.length / 2);

    expect(widths[0]).toBeLessThan(widths[midIdx] * 0.6);
    expect(widths[widths.length - 1]).toBeLessThan(widths[midIdx] * 0.6);
  });

  it('modulates line width based on chisel nib angle', () => {
    // 45-degree stroke
    const ptsThin: Point2D[] = [
      [0, 0],
      [50, 50],
    ];
    const { angles: angThin } = computePointNormals(ptsThin);
    const wThin = computeVariableWidths(ptsThin, angThin, 10.0, {
      taper: false,
      chiselNib: true,
      nibAngleDeg: 45.0,
    });

    // 135-degree stroke (perpendicular to 45 deg)
    const ptsBroad: Point2D[] = [
      [0, 50],
      [50, 0],
    ];
    const { angles: angBroad } = computePointNormals(ptsBroad);
    const wBroad = computeVariableWidths(ptsBroad, angBroad, 10.0, {
      taper: false,
      chiselNib: true,
      nibAngleDeg: 45.0,
    });

    expect(wThin[0]).toBeLessThan(wBroad[0] * 0.5);
  });

  it('extrudes closed 2D polygon with round caps and converts to SVG path', () => {
    const pts: Point2D[] = [
      [10, 10],
      [50, 10],
      [90, 10],
    ];

    const poly = extrudeVariableWidthPolygon(pts, 6.0, { taper: true });
    expect(poly.length).toBeGreaterThan(pts.length * 2);

    const svgPath = buildSvgPolygonPath(poly);
    expect(svgPath.startsWith('M ')).toBe(true);
    expect(svgPath.endsWith(' Z')).toBe(true);
  });
});
