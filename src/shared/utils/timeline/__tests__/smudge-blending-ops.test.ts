import { describe, it, expect } from 'vitest';
import {
  calculateSmudgeAdvection,
  computeKneadedEraserLifting,
  generateSmudgeSvgOverlay,
} from '../smudge-blending-ops';
import type { Point2D } from '../calligraphy-ops';

describe('smudge-blending-ops', () => {
  it('calculates smudge advection particle trail parameters', () => {
    const pts: Point2D[] = [
      [50, 100],
      [100, 100],
      [150, 100],
    ];

    const trail = calculateSmudgeAdvection(pts, 30, 0.8, false);
    expect(trail.path.length).toBe(3);
    expect(trail.radius).toBe(30);
    expect(trail.opacity).toBeCloseTo(0.44, 2);
    expect(trail.blurSigma).toBeGreaterThan(10);
    expect(trail.isSubtractive).toBe(false);
  });

  it('computes subtractive kneaded eraser pigment lifting towards white paper', () => {
    const darkPigment = 50; // dark charcoal
    const radius = 25;

    // At the exact center (distance 0), lifts strongly
    const liftedCenter = computeKneadedEraserLifting(darkPigment, 0, radius, 0.8);
    expect(liftedCenter).toBeGreaterThan(200);

    // Beyond the eraser influence radius, remains untouched
    const liftedFar = computeKneadedEraserLifting(darkPigment, 60, radius, 0.8);
    expect(liftedFar).toBe(darkPigment);
  });

  it('generates SVG overlay with Gaussian blur filter markup', () => {
    const trail = calculateSmudgeAdvection(
      [
        [100, 100],
        [200, 150],
      ],
      20,
      0.6,
      true
    );

    const svg = generateSmudgeSvgOverlay(trail, 1920, 1080);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<feGaussianBlur');
    expect(svg).toContain('filter="url(#smudge-blur-');
    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="#ffffff"'); // subtractive highlight
  });
});
