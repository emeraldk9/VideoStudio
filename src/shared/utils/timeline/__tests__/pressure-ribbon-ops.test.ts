import { describe, it, expect } from 'vitest';
import {
  evaluatePressureCurve,
  calculateTiltMultiplier,
  generateVariableRibbon,
  renderRibbonSvgPath,
} from '../pressure-ribbon-ops';
import type { Point2D } from '../calligraphy-ops';

describe('pressure-ribbon-ops', () => {
  it('evaluates non-linear pressure transfer curves', () => {
    const pLin = evaluatePressureCurve(0.5, 'linear', 1.0);
    const pExp = evaluatePressureCurve(0.5, 'exponential', 1.0);
    const pCal = evaluatePressureCurve(0.5, 'calligraphic', 1.0);

    expect(pLin).toBeCloseTo(0.5, 2);
    expect(pExp).toBeLessThan(pLin);
    expect(pCal).toBeGreaterThan(pLin);
  });

  it('calculates stylus 3D tilt footprint deformation', () => {
    const upright = calculateTiltMultiplier(90, 0, 0);
    expect(upright).toBeCloseTo(1.0, 2);

    const tilted = calculateTiltMultiplier(30, 90, 0); // moving perpendicular to 30 deg tilt
    expect(tilted).toBeGreaterThan(1.8);
  });

  it('generates continuous variable-width 2D ribbon mesh and SVG path', () => {
    // Horizontal stroke from x=100 to x=300
    const points: Point2D[] = [
      [100, 200],
      [150, 200],
      [200, 200],
      [250, 200],
      [300, 200],
    ];
    // Pressure ascending from 0.1 to 1.0
    const pressures = [0.1, 0.3, 0.5, 0.8, 1.0];

    const ribbon = generateVariableRibbon(points, pressures, {
      baseRadius: 10,
      minWidthRatio: 0.2,
      curve: 'sigmoid',
    });

    expect(ribbon.leftEdge.length).toBe(5);
    expect(ribbon.rightEdge.length).toBe(5);
    expect(ribbon.polygon.length).toBe(11); // 5 left + 5 right + 1 closing

    // Start width vs end width
    const wStart = Math.abs(ribbon.leftEdge[0][1] - ribbon.rightEdge[0][1]);
    const wEnd = Math.abs(ribbon.leftEdge[4][1] - ribbon.rightEdge[4][1]);
    expect(wEnd).toBeGreaterThan(wStart * 2.5);

    // Verify SVG markup
    const svg = renderRibbonSvgPath(ribbon, 800, 600);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#1f2937"');
    expect(svg).toContain('Z"');
  });
});
