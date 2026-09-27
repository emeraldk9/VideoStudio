import { describe, expect, it } from 'vitest';
import {
  evaluateMoistureEvaporation,
  computeWaterDilution,
  computeWetStrokeWidening,
  computeWetStrokeFeather,
  generateWetGlintSvgFilterMarkup,
} from '../wet-sponge-ops';

describe('wet-sponge-ops', () => {
  it('evaluates exponential moisture evaporation over time', () => {
    const initial = 0.85;
    const dryingTime = 4.0;

    // At t=0, moisture is initial
    expect(evaluateMoistureEvaporation(initial, 0, dryingTime)).toBeCloseTo(0.85, 2);

    // At t=2 (halfway), moisture decays significantly
    const mid = evaluateMoistureEvaporation(initial, 2.0, dryingTime);
    expect(mid).toBeLessThan(0.30);
    expect(mid).toBeGreaterThan(0.02);

    // At t=6 (fully dry), moisture reaches 0
    expect(evaluateMoistureEvaporation(initial, 6.0, dryingTime)).toBe(0.0);
  });

  it('computes pigment dilution and capillary stroke widening', () => {
    const baseWidth = 5.0;
    const baseOpacity = 1.0;

    // Dry condition (moisture = 0)
    const dry = computeWetStrokeFeather(baseWidth, baseOpacity, 0.0, 0.6);
    expect(dry.widthPx).toBe(5.0);
    expect(dry.opacity).toBe(1.0);

    // Saturated condition (moisture = 1.0)
    const wet = computeWetStrokeFeather(baseWidth, baseOpacity, 1.0, 0.6);
    expect(wet.widthPx).toBeCloseTo(5.0 * 2.2, 1); // 1.0 + 1.20 = 2.2x
    expect(wet.opacity).toBeCloseTo(0.40, 2); // 1.0 - 0.60 = 0.40
  });

  it('generates valid SVG filter markup with dynamic glint', () => {
    const markup = generateWetGlintSvgFilterMarkup('sponge-glint-test', 0.80);
    expect(markup).toContain('<filter id="sponge-glint-test"');
    expect(markup).toContain('feDiffuseLighting');
    expect(markup).toContain('feComposite');
    expect(markup).toContain('k3="0.32"');
  });
});
