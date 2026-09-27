import { describe, expect, it } from 'vitest';
import {
  computeShadowOffsetVector,
  calculatePenumbraBlur,
  generateContactShadowCssFilter,
  DEFAULT_CONTACT_SHADOW_SETTINGS,
} from '../contact-shadow-ops';

describe('contact-shadow-ops', () => {
  it('computes directional shadow offset vectors correctly', () => {
    // Top-left light (315° NW) casts shadow to bottom-right (SE: dx > 0, dy > 0)
    const [dx315, dy315] = computeShadowOffsetVector(315, 10, false);
    expect(dx315).toBeGreaterThan(0);
    expect(dy315).toBeGreaterThan(0);

    // North light (0°) casts shadow downward to South (dx = 0, dy = +10)
    const [dx0, dy0] = computeShadowOffsetVector(0, 10, false);
    expect(dx0).toBeCloseTo(0, 1);
    expect(dy0).toBeCloseTo(10, 1);

    // East light (90°) casts shadow to West (dx = -10, dy = 0)
    const [dx90, dy90] = computeShadowOffsetVector(90, 10, false);
    expect(dx90).toBeCloseTo(-10, 1);
    expect(dy90).toBeCloseTo(0, 1);
  });

  it('increases offset and blur during pen lift', () => {
    const [dxTouch, dyTouch] = computeShadowOffsetVector(315, 10, false);
    const [dxLift, dyLift] = computeShadowOffsetVector(315, 10, true, 0.5);

    const distTouch = Math.hypot(dxTouch, dyTouch);
    const distLift = Math.hypot(dxLift, dyLift);
    expect(distLift).toBeGreaterThan(distTouch);
  });

  it('calculates distance-weighted penumbra blur radius', () => {
    const baseBlur = 15.0;
    // At pen tip (distance = 0), shadow is sharper umbra
    const blurTip = calculatePenumbraBlur(0, baseBlur, false);
    expect(blurTip).toBeLessThan(baseBlur);

    // Far from pen tip (distance = 200px), shadow reaches full diffuse penumbra
    const blurWrist = calculatePenumbraBlur(200, baseBlur, false);
    expect(blurWrist).toBeCloseTo(baseBlur, 1);

    // When lifting, blur expands
    const blurLift = calculatePenumbraBlur(0, baseBlur, true, 0.5);
    expect(blurLift).toBeGreaterThan(baseBlur);
  });

  it('generates drop-shadow CSS filter with appropriate opacity and blur', () => {
    const filter = generateContactShadowCssFilter({
      enabled: true,
      lightAngleDeg: 315,
      shadowOpacity: 0.40,
      blurRadiusPx: 12,
      offsetDistancePx: 8,
    });

    expect(filter.startsWith('drop-shadow(')).toBe(true);
    expect(filter).toContain('rgba(0, 0, 0, 0.40)');

    // Disabled returns 'none'
    expect(generateContactShadowCssFilter({ enabled: false })).toBe('none');
    expect(generateContactShadowCssFilter({ shadowOpacity: 0 })).toBe('none');
  });
});
