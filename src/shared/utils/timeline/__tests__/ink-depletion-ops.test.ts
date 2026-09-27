import { describe, expect, it } from 'vitest';
import {
  calculateStrokeDepletion,
  rechargeReservoirLevel,
  applyChalkMicroChatter,
  generateStriationMaskSvg,
  DEFAULT_INK_DEPLETION_SETTINGS,
} from '../ink-depletion-ops';

describe('ink-depletion-ops', () => {
  it('calculates solvent depletion over stroke travel', () => {
    // 0 px travel should leave level at 1.0
    expect(calculateStrokeDepletion(0, 1.0, 0.002, 0.35)).toBe(1.0);

    // 200 px travel at rate 0.002: 1.0 - 0.4 = 0.6
    expect(calculateStrokeDepletion(200, 1.0, 0.002, 0.35)).toBeCloseTo(0.6, 2);

    // 500 px travel at rate 0.002: would be 0.0, but clamped to minSaturation 0.35
    expect(calculateStrokeDepletion(500, 1.0, 0.002, 0.35)).toBe(0.35);
  });

  it('recharges capillary reservoir level during rest', () => {
    const initial = 0.4;
    // 1 second rest at recharge rate 0.25 -> 0.4 + 0.25 = 0.65
    expect(rechargeReservoirLevel(initial, 1.0, 0.25)).toBeCloseTo(0.65, 2);

    // 4 seconds rest should cap at 1.0
    expect(rechargeReservoirLevel(initial, 4.0, 0.25)).toBe(1.0);

    // Negative or zero duration does not change level
    expect(rechargeReservoirLevel(initial, 0, 0.25)).toBe(initial);
  });

  it('applies chalk micro-chatter modulation', () => {
    const opacities = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const segmentLengths = [10, 10, 10, 10, 10, 10, 10];
    const chattered = applyChalkMicroChatter(opacities, segmentLengths, 0.15);

    expect(chattered.length).toBe(opacities.length);
    // Values should fluctuate and stay within [0.05, 1.0]
    for (const val of chattered) {
      expect(val).toBeGreaterThanOrEqual(0.05);
      expect(val).toBeLessThanOrEqual(1.0);
    }
  });

  it('generates declarative SVG striation mask markup', () => {
    const svg = generateStriationMaskSvg(120, 24, 5, 0.6);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 120 24"');
    expect(svg.match(/<line/g)?.length).toBe(5);
  });
});
