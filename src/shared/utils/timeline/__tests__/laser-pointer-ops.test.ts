import { describe, expect, it } from 'vitest';
import {
  resolveLaserColor,
  evaluatePhosphorDecay,
  generateLaserPointerSvgFilterMarkup,
  LASER_COLORS,
} from '../laser-pointer-ops';

describe('laser-pointer-ops', () => {
  it('resolves standard wavelength color presets and custom overrides', () => {
    expect(resolveLaserColor('emerald')).toBe(LASER_COLORS.emerald);
    expect(resolveLaserColor('ruby')).toBe(LASER_COLORS.ruby);
    expect(resolveLaserColor('violet')).toBe(LASER_COLORS.violet);

    expect(resolveLaserColor('emerald', '#ffff00')).toBe('#ffff00');
    expect(resolveLaserColor('emerald', 'invalid')).toBe(LASER_COLORS.emerald);
  });

  it('evaluates exponential phosphor decay over elapsed time', () => {
    const tau = 0.8;

    // At t=0, full intensity
    expect(evaluatePhosphorDecay(0.0, tau)).toBe(1.0);

    // At t=tau, intensity is 1/e ~ 0.368
    expect(evaluatePhosphorDecay(tau, tau)).toBeCloseTo(0.368, 2);

    // At t=5*tau, intensity is near zero
    expect(evaluatePhosphorDecay(4.0, tau)).toBeLessThan(0.02);
  });

  it('generates valid SVG filter markup with chromatic laser bloom', () => {
    const markup = generateLaserPointerSvgFilterMarkup('laser-test-filter', '#ff2233', 20.0);
    expect(markup).toContain('<filter id="laser-test-filter"');
    expect(markup).toContain('flood-color="#ff2233"');
    expect(markup).toContain('stdDeviation="9.0"');
    expect(markup).toContain('feMerge');
  });
});
