import { describe, it, expect } from 'vitest';
import {
  computeVelocityPooling,
  subtractiveGlazeColor,
  generateChalkDustParticles,
} from '../ink-physics-ops';
import type { Point2D } from '../calligraphy-ops';

describe('ink-physics-ops', () => {
  it('computes velocity pooling: slow pauses have larger radii and higher opacity than fast strokes', () => {
    // 10 slow points followed by 10 fast points
    const slowPoints: Point2D[] = Array.from({ length: 10 }, (_, i) => [i * 2, 50]);
    const fastPoints: Point2D[] = Array.from({ length: 10 }, (_, i) => [30 + i * 30, 50]);
    const stroke = [...slowPoints, ...fastPoints];

    const { radii, opacities } = computeVelocityPooling(stroke, 4.0, 0.6, 12.0);

    expect(radii.length).toBe(stroke.length);
    expect(opacities.length).toBe(stroke.length);

    // Mid-slow vs mid-fast
    const rSlow = radii[4];
    const rFast = radii[15];
    expect(rSlow).toBeGreaterThan(rFast);

    const opSlow = opacities[4];
    const opFast = opacities[15];
    expect(opSlow).toBeGreaterThan(opFast);
  });

  it('performs subtractive glaze color blending with darkening upon multiple passes', () => {
    const whiteCanvas: [number, number, number] = [255, 255, 255];
    const redInk: [number, number, number] = [200, 20, 20];

    // Single pass on white canvas
    const pass1 = subtractiveGlazeColor(whiteCanvas, redInk, 0.6);
    expect(pass1[0]).toBeLessThan(255);

    // Second pass over the first pass (glaze overlap)
    const pass2 = subtractiveGlazeColor(pass1, redInk, 0.6);
    // Overlap should be strictly darker than single pass
    expect(pass2[0]).toBeLessThan(pass1[0]);
    expect(pass2[1]).toBeLessThanOrEqual(pass1[1]);
    expect(pass2[2]).toBeLessThanOrEqual(pass1[2]);
  });

  it('generates chalk micro-particles that drift downwards with gravity', () => {
    const stroke: Point2D[] = [
      [50, 100],
      [100, 100],
      [150, 100],
      [200, 100],
    ];

    const particles = generateChalkDustParticles(stroke, 100, 6.0, 4.0, 42);
    expect(particles.length).toBe(100);

    // Verify all particles have positive radii and valid opacities
    for (const p of particles) {
      expect(p.radius).toBeGreaterThan(0.5);
      expect(p.opacity).toBeGreaterThan(0.1);
    }

    // Average Y of particles should be greater than the stroke's Y line (100) due to gravity
    const avgY = particles.reduce((acc, p) => acc + p.y, 0) / particles.length;
    expect(avgY).toBeGreaterThan(104.0);
  });
});
