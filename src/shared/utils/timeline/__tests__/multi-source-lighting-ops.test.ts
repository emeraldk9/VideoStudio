import { describe, it, expect } from 'vitest';
import {
  computeLuminaireOffsetVector,
  calculateEffectivePenumbraBlur,
  computePhotometricDualPenumbra,
  generateMultiSourceShadowCssFilters,
  DEFAULT_MULTI_SOURCE_LIGHTING_SETTINGS,
  DEFAULT_KEY_LIGHT,
  DEFAULT_FILL_LIGHT,
} from '../multi-source-lighting-ops';

describe('multi-source-lighting-ops', () => {
  it('correctly calculates 2D directional projection offsets for Key (NW 315°) and Fill (NE 45°)', () => {
    // NW 315° casts shadow to SE (positive dx, positive dy)
    const [kdx, kdy] = computeLuminaireOffsetVector(315.0, 14.0, 0.0);
    expect(kdx).toBeGreaterThan(0);
    expect(kdy).toBeGreaterThan(0);

    // NE 45° casts shadow to SW (negative dx, positive dy)
    const [fdx, fdy] = computeLuminaireOffsetVector(45.0, 22.0, 0.0);
    expect(fdx).toBeLessThan(0);
    expect(fdy).toBeGreaterThan(0);

    // Elevation increases offset distance
    const [elevDx, elevDy] = computeLuminaireOffsetVector(315.0, 14.0, 25.0);
    expect(elevDx).toBeGreaterThan(kdx);
    expect(elevDy).toBeGreaterThan(kdy);
  });

  it('calculates inverse-square elevation penumbra blur diffusion', () => {
    const baseBlur = 10.0;
    const blurAtBoard = calculateEffectivePenumbraBlur(baseBlur, 0.0, true);
    expect(blurAtBoard).toBe(10.0);

    const blurElevated = calculateEffectivePenumbraBlur(baseBlur, 20.0, true);
    expect(blurElevated).toBeGreaterThan(blurAtBoard);
    // Inverse square sqrt(1 + 20 * 0.08) = sqrt(2.6) ≈ 1.61 => ~16.1
    expect(blurElevated).toBeCloseTo(16.1, 1);
  });

  it('computes photometric dual-penumbra fusion attenuation', () => {
    // When only key light is present
    const keyOnly = computePhotometricDualPenumbra(1.0, 0.0, 0.75, 0.35);
    expect(keyOnly).toBe(0.75);

    // When both key and fill overlap (1 - (1 - 0.75)*(1 - 0.35) = 1 - 0.25*0.65 = 1 - 0.1625 = 0.8375)
    const dualOverlap = computePhotometricDualPenumbra(1.0, 1.0, 0.75, 0.35);
    expect(dualOverlap).toBeGreaterThan(keyOnly);
    expect(dualOverlap).toBeCloseTo(0.838, 2);

    // Zero shadow
    const zeroShadow = computePhotometricDualPenumbra(0.0, 0.0, 0.75, 0.35);
    expect(zeroShadow).toBe(0);
  });

  it('generates multi-layer CSS drop-shadow filters with AO when touching and dissipates when lifted', () => {
    const disabledFilter = generateMultiSourceShadowCssFilters({ enabled: false });
    expect(disabledFilter).toBe('none');

    // Enabled while touching board: should include Key, Fill, and contact AO
    const touchingFilter = generateMultiSourceShadowCssFilters({
      enabled: true,
      liftHeightPx: 0,
      ambientOcclusionIntensity: 0.4,
    }, false);
    expect(touchingFilter).toContain('drop-shadow');
    // Contains three drop-shadow components (Key, Fill, AO)
    const dropCount = (touchingFilter.match(/drop-shadow/g) || []).length;
    expect(dropCount).toBe(3);

    // When lifting: AO is omitted
    const liftingFilter = generateMultiSourceShadowCssFilters({
      enabled: true,
      liftHeightPx: 10,
    }, true);
    const liftingDropCount = (liftingFilter.match(/drop-shadow/g) || []).length;
    expect(liftingDropCount).toBe(2);
  });
});
