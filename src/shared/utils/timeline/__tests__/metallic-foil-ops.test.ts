import { describe, it, expect } from 'vitest';
import {
  validateFoilConfig,
  resolveFoilBaseHex,
  computeLightVector3D,
  computeEmbossNormal3D,
  calculateFoilSpecularIntensity,
  calculateHolographicHue,
  generateFoilSvgFilters,
  computeFoilFoleyTelemetry,
  DEFAULT_FOIL_CONFIG,
  FOIL_PRESET_HEX,
} from '../metallic-foil-ops';

describe('metallic-foil-ops', () => {
  it('validates and clamps default and partial foil configurations', () => {
    const defaults = validateFoilConfig();
    expect(defaults.enabled).toBe(false);
    expect(defaults.preset).toBe('gold');
    expect(defaults.embossHeightPx).toBe(2.5);
    expect(defaults.bevelWidthPx).toBe(3.0);
    expect(defaults.specularShininess).toBe(32.0);

    const clamped = validateFoilConfig({
      preset: 'unknown_metal' as any,
      embossHeightPx: 100.0,
      bevelWidthPx: 0.1,
      specularShininess: 500.0,
      lightAngleDeg: 400.0,
      lightElevationDeg: 5.0,
      shimmerSpeed: 10.0,
      sparkleIntensity: 2.0,
      foleyPressVolume: -1.0,
    });

    expect(clamped.preset).toBe('gold');
    expect(clamped.embossHeightPx).toBe(8.0);
    expect(clamped.bevelWidthPx).toBe(1.0);
    expect(clamped.specularShininess).toBe(128.0);
    expect(clamped.lightAngleDeg).toBe(360.0);
    expect(clamped.lightElevationDeg).toBe(15.0);
    expect(clamped.shimmerSpeed).toBe(3.0);
    expect(clamped.sparkleIntensity).toBe(1.0);
    expect(clamped.foleyPressVolume).toBe(0.0);
  });

  it('resolves preset hexadecimal base colors and animated holographic tinting', () => {
    expect(resolveFoilBaseHex('gold')).toBe(FOIL_PRESET_HEX.gold);
    expect(resolveFoilBaseHex('silver')).toBe(FOIL_PRESET_HEX.silver);
    expect(resolveFoilBaseHex('rose_gold')).toBe(FOIL_PRESET_HEX.rose_gold);
    expect(resolveFoilBaseHex('copper')).toBe(FOIL_PRESET_HEX.copper);

    const holoA = resolveFoilBaseHex('holographic', 0.0);
    const holoB = resolveFoilBaseHex('holographic', 0.5);
    expect(holoA.startsWith('#')).toBe(true);
    expect(holoB.startsWith('#')).toBe(true);
    expect(holoA).not.toBe(holoB);
  });

  it('computes normalized 3D light vectors correctly', () => {
    const light = computeLightVector3D(45.0, 60.0);
    const len = Math.hypot(light[0], light[1], light[2]);
    expect(len).toBeCloseTo(1.0, 4);
    expect(light[2]).toBeGreaterThan(0.0); // Z should be positive for top-down light
  });

  it('derives normalized emboss surface normals', () => {
    const flatNormal = computeEmbossNormal3D(0, 0, 3.0, 2.5);
    expect(flatNormal[0]).toBe(0);
    expect(flatNormal[1]).toBe(0);
    expect(flatNormal[2]).toBe(1);

    const edgeNormal = computeEmbossNormal3D(2.0, 1.0, 3.0, 2.5);
    const len = Math.hypot(edgeNormal[0], edgeNormal[1], edgeNormal[2]);
    expect(len).toBeCloseTo(1.0, 4);
    expect(edgeNormal[0]).toBeLessThan(0); // slope points away from edge center
    expect(edgeNormal[2]).toBeGreaterThan(0);
  });

  it('calculates Blinn-Phong specular reflection intensity with shininess falloff', () => {
    const lightDir = computeLightVector3D(0.0, 90.0); // Direct overhead light
    const normal: [number, number, number] = [0, 0, 1]; // Direct upward normal

    const specLow = calculateFoilSpecularIntensity(normal, lightDir, 8.0);
    const specHigh = calculateFoilSpecularIntensity(normal, lightDir, 64.0);

    expect(specLow).toBeGreaterThan(0.9);
    expect(specHigh).toBeGreaterThan(0.9);

    // Off-angle specular falloff
    const tiltedNormal: [number, number, number] = [0.38, 0, 0.92];
    const offSpecLow = calculateFoilSpecularIntensity(tiltedNormal, lightDir, 8.0);
    const offSpecHigh = calculateFoilSpecularIntensity(tiltedNormal, lightDir, 64.0);

    expect(offSpecLow).toBeGreaterThan(offSpecHigh);
  });

  it('calculates dynamic holographic hue sweep within cyclic unit range', () => {
    const normal: [number, number, number] = [0, 0, 1];
    const hue0 = calculateHolographicHue(normal, 0.0, 1.0);
    const hue1 = calculateHolographicHue(normal, 2.5, 1.0);

    expect(hue0).toBeGreaterThanOrEqual(0.0);
    expect(hue0).toBeLessThan(1.0);
    expect(hue1).toBeGreaterThanOrEqual(0.0);
    expect(hue1).toBeLessThan(1.0);
    expect(hue0).not.toBe(hue1);
  });

  it('generates SVG lighting filter markup with custom filter ID and lighting properties', () => {
    const cfg = {
      ...DEFAULT_FOIL_CONFIG,
      preset: 'gold' as const,
      embossHeightPx: 3.5,
      lightAngleDeg: 120.0,
      lightElevationDeg: 45.0,
    };

    const svg = generateFoilSvgFilters(cfg, 'custom-foil-filter');
    expect(svg).toContain('id="custom-foil-filter"');
    expect(svg).toContain('surfaceScale="3.5"');
    expect(svg).toContain('azimuth="120.0"');
    expect(svg).toContain('elevation="45.0"');
    expect(svg).toContain(FOIL_PRESET_HEX.gold);
    expect(svg).toContain('feSpecularLighting');
    expect(svg).toContain('feDiffuseLighting');
  });

  it('computes hot stamp press and peel foley acoustics telemetry', () => {
    const telemetry = computeFoilFoleyTelemetry(1.5, {
      foleyPressVolume: 0.8,
      embossHeightPx: 4.0,
    });

    expect(telemetry.pressThumpGain).toBeGreaterThan(0.0);
    expect(telemetry.thermalHissGain).toBeGreaterThan(0.0);
    expect(telemetry.peelCrinkleGain).toBeGreaterThan(0.0);
    expect(telemetry.peakFrequencyHz).toBeGreaterThanOrEqual(50.0);
    expect(telemetry.peakFrequencyHz).toBeLessThanOrEqual(220.0);
    expect(telemetry.cycleDurationSec).toBe(1.5);
  });
});
