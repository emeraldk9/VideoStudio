import { describe, expect, it } from 'vitest';
import {
  parseFStopValue,
  calculateCircleOfConfusion,
  calculateHandDefocusSigmas,
  generateDoFHandSvgFilterMarkup,
} from '../dof-bokeh-ops';

describe('dof-bokeh-ops', () => {
  it('correctly maps aperture enum strings to numeric f-stops', () => {
    expect(parseFStopValue('f1.4')).toBe(1.4);
    expect(parseFStopValue('f1.8')).toBe(1.8);
    expect(parseFStopValue('f2.8')).toBe(2.8);
    expect(parseFStopValue('f5.6')).toBe(5.6);
    expect(parseFStopValue()).toBe(2.8);
  });

  it('computes circle of confusion complying with lens aperture physics', () => {
    // At focal plane (Z=0)
    expect(calculateCircleOfConfusion(0.0, 0.0, 2.8)).toBe(0.0);

    // At 140mm depth
    const blurFast = calculateCircleOfConfusion(140.0, 0.0, 1.8);
    const blurSlow = calculateCircleOfConfusion(140.0, 0.0, 5.6);
    expect(blurFast).toBeGreaterThan(blurSlow);
    expect(blurSlow).toBeGreaterThan(0.0);

    // Clamping to maxBlurPx
    expect(calculateCircleOfConfusion(1000.0, 0.0, 1.4, 20.0)).toBe(20.0);
  });

  it('computes distinct tip and wrist defocus sigmas', () => {
    // Flat on board (tip_lift = 0)
    const { tipSigma, wristSigma } = calculateHandDefocusSigmas(0.0, {
      aperture: 'f2.8',
      wristElevationMm: 150,
      maxBlurPx: 25,
    });

    expect(tipSigma).toBe(0.0);
    expect(wristSigma).toBeGreaterThan(3.0);

    // Raised in air during flip (tip_lift = 80px)
    const raised = calculateHandDefocusSigmas(80.0, {
      aperture: 'f2.8',
      wristElevationMm: 150,
      tipLiftDefocus: true,
    });
    expect(raised.tipSigma).toBeGreaterThan(0.0);
    expect(raised.wristSigma).toBeGreaterThan(raised.tipSigma);
  });

  it('generates valid SVG blur filter markup', () => {
    const markup = generateDoFHandSvgFilterMarkup(0.0, 8.0, 'test-hand-dof');
    expect(markup).toContain('<filter id="test-hand-dof"');
    expect(markup).toContain('<feGaussianBlur in="SourceGraphic" stdDeviation="4"');
  });
});
