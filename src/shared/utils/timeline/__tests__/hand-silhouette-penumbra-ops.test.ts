import { describe, it, expect } from 'vitest';
import {
  projectPoint3DToBoard,
  calculateGraduatedPenumbraBlur,
  projectHandContourPolygon,
  generatePerspectiveHandShadowSvgPath,
  DEFAULT_HAND_SHADOW_PENUMBRA_SETTINGS,
} from '../hand-silhouette-penumbra-ops';

describe('hand-silhouette-penumbra-ops', () => {
  it('correctly projects 3D vertices to board surface plane z=0', () => {
    const light = [-200, -300, 600] as [number, number, number];

    // Contact point at z=0 has zero perspective displacement
    const [tipX, tipY] = projectPoint3DToBoard([100, 150, 0], light);
    expect(tipX).toBe(100);
    expect(tipY).toBe(150);

    // Elevated wrist vertex at z=60 casts extended shadow away from light
    const [wristX, wristY] = projectPoint3DToBoard([200, 250, 60], light);
    expect(wristX).toBeGreaterThan(200);
    expect(wristY).toBeGreaterThan(250);
  });

  it('calculates graduated penumbra blur scaling from tip umbra to forearm penumbra', () => {
    // Near tip: tight blur (3.0px)
    const tipBlur = calculateGraduatedPenumbraBlur(0, 24.0, 3.0, 150.0);
    expect(tipBlur).toBe(3.0);

    // Midway: interpolated blur
    const midBlur = calculateGraduatedPenumbraBlur(75, 24.0, 3.0, 150.0);
    expect(midBlur).toBeGreaterThan(tipBlur);
    expect(midBlur).toBeCloseTo(13.5, 1);

    // Far along forearm: max penumbra blur (24.0px)
    const forearmBlur = calculateGraduatedPenumbraBlur(180, 24.0, 3.0, 150.0);
    expect(forearmBlur).toBe(24.0);
  });

  it('projects hand contour polygon with distance-weighted elevation profile', () => {
    const light = [-250, -350, 700] as [number, number, number];
    const tipPt = [50, 50] as [number, number];
    const wristPt = [150, 250] as [number, number];

    const contour: Array<[number, number]> = [
      [50, 50],   // tip
      [80, 120],  // palm
      [150, 250], // wrist
      [120, 240], // wrist other side
    ];

    const projected = projectHandContourPolygon(contour, tipPt, wristPt, light, 70.0, 0.0);
    expect(projected.length).toBe(4);

    // Tip point has minimal/zero offset
    expect(projected[0][0]).toBeCloseTo(50, 0);
    expect(projected[0][1]).toBeCloseTo(50, 0);

    // Wrist point has significant perspective shear displacement
    expect(projected[2][0]).toBeGreaterThan(150);
    expect(projected[2][1]).toBeGreaterThan(250);
  });

  it('generates closed SVG path data for perspective hand shadow polygon', () => {
    const emptyPath = generatePerspectiveHandShadowSvgPath([]);
    expect(emptyPath).toBe('');

    const pts: Array<[number, number]> = [
      [10, 10],
      [50, 20],
      [80, 70],
    ];
    const svgPath = generatePerspectiveHandShadowSvgPath(pts);
    expect(svgPath).toBe('M 10 10 L 50 20 L 80 70 Z');
  });
});
