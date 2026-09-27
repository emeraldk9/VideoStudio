import { describe, it, expect } from 'vitest';
import {
  computeNibAnchoredTransform,
  applyAffineToPoint,
  calculateDynamicHandTilt,
} from '../hand-pose-ops';
import type { Point2D } from '../calligraphy-ops';

describe('hand-pose-ops', () => {
  it('guarantees nib contact point invariance under arbitrary rotations and scales', () => {
    const spriteNib: Point2D = [35.0, 180.0];
    const targetCanvas: Point2D = [500.0, 300.0];

    // Test across full circle rotations and various scaling factors
    const testAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    const testScales = [0.5, 0.8, 1.0, 1.5, 2.0];

    for (const angle of testAngles) {
      for (const scale of testScales) {
        const matrix = computeNibAnchoredTransform(spriteNib, targetCanvas, angle, scale);
        const mappedNib = applyAffineToPoint(matrix, spriteNib);

        expect(mappedNib[0]).toBeCloseTo(targetCanvas[0], 4);
        expect(mappedNib[1]).toBeCloseTo(targetCanvas[1], 4);
      }
    }
  });

  it('calculates velocity-dependent dynamic forearm tilt', () => {
    // Zero velocity maintains base angle
    expect(calculateDynamicHandTilt([0, 0], 15.0)).toBeCloseTo(15.0, 3);

    // Velocity parallel to base angle has no extra tilt
    const parallelTilt = calculateDynamicHandTilt([20, 0], 0.0, 0.5);
    expect(parallelTilt).toBeCloseTo(0.0, 3);

    // Downward perpendicular velocity produces positive tilt (wrist flexing forward)
    const downwardTilt = calculateDynamicHandTilt([0, 20], 0.0, 0.5);
    expect(downwardTilt).toBeGreaterThan(5.0);
    expect(downwardTilt).toBeLessThanOrEqual(18.0);
  });
});
