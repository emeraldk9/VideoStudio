import { describe, it, expect } from 'vitest';
import {
  sampleSurfaceTooth,
  calculateNibWearExpansion,
  applySurfaceFrictionDynamics,
} from '../surface-friction-ops';
import type { Point2D } from '../calligraphy-ops';

describe('surface-friction-ops', () => {
  it('samples varying substrate tooth roughness hierarchy', () => {
    const toothWb = sampleSurfaceTooth(100, 100, 'whiteboard');
    const toothPaper = sampleSurfaceTooth(100, 100, 'paper');
    const toothSlate = sampleSurfaceTooth(100, 100, 'slate');

    expect(toothWb).toBeLessThan(0.08);
    expect(toothPaper).toBeGreaterThan(toothWb);
    expect(toothSlate).toBeGreaterThan(toothPaper);
  });

  it('calculates asymptotic nib wear expansion over distance', () => {
    const r0 = calculateNibWearExpansion(0, 3.0, 0.001, 8.0);
    const rMid = calculateNibWearExpansion(1500, 3.0, 0.001, 8.0);
    const rMax = calculateNibWearExpansion(50000, 3.0, 0.001, 8.0);

    expect(r0).toBeCloseTo(3.0, 2);
    expect(rMid).toBeGreaterThan(r0 * 1.5);
    expect(rMax).toBeLessThanOrEqual(8.0);
  });

  it('applies tooth friction velocity drag and nib wear across trajectory', () => {
    const pts: Point2D[] = [
      [100, 100],
      [200, 100],
      [300, 100],
      [400, 100],
      [500, 100],
    ];

    const result = applySurfaceFrictionDynamics(pts, 300, {
      surfaceType: 'slate',
      toothRoughness: 0.5,
      nibWearRate: 0.5,
    });

    expect(result.effectiveVelocities.length).toBe(5);
    expect(result.radii.length).toBe(5);

    // Progressive wear
    expect(result.radii[4]).toBeGreaterThan(result.radii[0]);

    // Friction drag retards velocities below base speed
    for (const v of result.effectiveVelocities) {
      expect(v).toBeLessThanOrEqual(300);
      expect(v).toBeGreaterThan(150);
    }
  });
});
