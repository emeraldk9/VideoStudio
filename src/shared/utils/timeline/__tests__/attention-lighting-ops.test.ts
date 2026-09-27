import { describe, expect, it } from 'vitest';
import {
  computeDampedSpotlightPosition,
  calculateVignetteFactor,
  calculateSpotlightGain,
  generateAttentionLightingSvgFilter,
} from '../attention-lighting-ops';

describe('attention-lighting-ops', () => {
  it('smooths spotlight position with inertia damping', () => {
    const start: [number, number] = [100, 100];
    const target: [number, number] = [300, 300];

    // No prevPos -> snaps directly to target
    const init = computeDampedSpotlightPosition(target);
    expect(init).toEqual([300, 300]);

    // With prevPos and 0.8 inertia -> moves 20% of the distance
    const damped = computeDampedSpotlightPosition(target, start, 0.8);
    expect(damped[0]).toBeCloseTo(100 * 0.8 + 300 * 0.2, 1);
    expect(damped[1]).toBeCloseTo(100 * 0.8 + 300 * 0.2, 1);
  });

  it('calculates elliptical vignette attenuation', () => {
    const w = 1920;
    const h = 1080;
    const center: [number, number] = [960, 540];
    const corner: [number, number] = [0, 0];

    const centerFactor = calculateVignetteFactor(center, w, h, 0.25);
    const cornerFactor = calculateVignetteFactor(corner, w, h, 0.25);

    expect(centerFactor).toBeCloseTo(1.0, 2);
    expect(cornerFactor).toBeLessThan(0.85);
  });

  it('calculates radial spotlight Gaussian gain', () => {
    const spot: [number, number] = [500, 500];
    const near: [number, number] = [500, 500];
    const far: [number, number] = [1500, 1500];

    const gainNear = calculateSpotlightGain(near, spot, 300, 0.2);
    const gainFar = calculateSpotlightGain(far, spot, 300, 0.2);

    expect(gainNear).toBeCloseTo(1.2, 2);
    expect(gainFar).toBeCloseTo(1.0, 2);
  });

  it('generates valid SVG radial gradient overlay string', () => {
    const svg = generateAttentionLightingSvgFilter([960, 540], 400, 0.2, 0.25, 1920, 1080);
    expect(svg).toContain('<radialGradient id="attention-spotlight"');
    expect(svg).toContain('cx="50.0%"');
    expect(svg).toContain('cy="50.0%"');
  });
});
