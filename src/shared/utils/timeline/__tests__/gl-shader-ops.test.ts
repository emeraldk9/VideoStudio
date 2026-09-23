import { describe, expect, it } from 'vitest';
import {
  degreesToRadians,
  hexToNormalizedRgb,
  packChromaKeyUniforms,
  packColorGradingUniforms,
  packFilmEmulationUniforms,
  packLensOpticsUniforms,
  packMaskUniforms,
  resolveGpuEffects,
  SHAPE_MASK_GL_IDS,
} from '../gl-shader-ops';
import { DEFAULT_FILM_EMULATION_SETTINGS } from '../film-emulation-ops';
import { DEFAULT_LENS_OPTICS_SETTINGS } from '../lens-optics-ops';
import { DEFAULT_COLOR_GRADING } from '../color-grading-ops';
import { DEFAULT_MASK_SETTINGS } from '../mask-ops';

describe('Milestone S69: Real-Time WebGL Shader Preview Harmonization & GPU Effect Acceleration', () => {
  describe('Color & Angle Conversion Utilities', () => {
    it('parses standard 6-digit and 3-digit hex colors to normalized RGB [0..1]', () => {
      const green = hexToNormalizedRgb('#00FF00');
      expect(green[0]).toBeCloseTo(0);
      expect(green[1]).toBeCloseTo(1);
      expect(green[2]).toBeCloseTo(0);

      const blueShort = hexToNormalizedRgb('#00F');
      expect(blueShort[0]).toBeCloseTo(0);
      expect(blueShort[1]).toBeCloseTo(0);
      expect(blueShort[2]).toBeCloseTo(1);

      const white = hexToNormalizedRgb('#FFFFFF');
      expect(white[0]).toBeCloseTo(1);
      expect(white[1]).toBeCloseTo(1);
      expect(white[2]).toBeCloseTo(1);

      const invalid = hexToNormalizedRgb('invalid');
      expect(invalid[1]).toBe(1); // fallback green
    });

    it('converts degrees to radians accurately', () => {
      expect(degreesToRadians(0)).toBeCloseTo(0);
      expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
      expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
      expect(degreesToRadians(360)).toBeCloseTo(Math.PI * 2);
    });
  });

  describe('Film Emulation Uniform Packing (packFilmEmulationUniforms)', () => {
    it('returns zeroes when undefined or disabled', () => {
      const u1 = packFilmEmulationUniforms(undefined);
      expect(u1[0]).toBe(0); // enabled = 0

      const u2 = packFilmEmulationUniforms({ ...DEFAULT_FILM_EMULATION_SETTINGS, enabled: false });
      expect(u2[0]).toBe(0);
    });

    it('packs grain, halation and frame-derived time seed when enabled', () => {
      const u = packFilmEmulationUniforms(
        {
          enabled: true,
          grain: {
            enabled: true,
            intensity: 0.65,
            size: 1.2,
            chromatic: false,
            roughness: 0.8,
          },
          halation: {
            enabled: true,
            threshold: 0.82,
            radiusPx: 12,
            intensity: 0.5,
            hueShiftDeg: 0,
          },
          gateWeave: {
            enabled: false,
            amplitudeX: 0,
            amplitudeY: 0,
            speedHz: 0,
            jitterPct: 0,
          },
        },
        45, // playhead frame
      );

      expect(u[0]).toBe(1.0); // enabled
      expect(u[1]).toBeCloseTo(0.65); // grain intensity
      expect(u[2]).toBeCloseTo(0.8); // roughness
      expect(u[3]).toBeCloseTo(0.82); // halation threshold
      expect(u[4]).toBeCloseTo(0.5); // halation intensity
      expect(u[5]).toBeGreaterThan(0); // time seed
    });
  });

  describe('Lens Optics Uniform Packing (packLensOpticsUniforms)', () => {
    it('returns zeroes when disabled', () => {
      const u = packLensOpticsUniforms({ ...DEFAULT_LENS_OPTICS_SETTINGS, enabled: false });
      expect(u[0]).toBe(0);
    });

    it('packs barrel distortion, chromatic aberration and anamorphic stretch', () => {
      const u = packLensOpticsUniforms({
        ...DEFAULT_LENS_OPTICS_SETTINGS,
        enabled: true,
        distortionK1: -0.25, // barrel
        distortionK2: 0.05,
        chromaticAberrationPx: 8,
        chromaticAberrationAngleDeg: 45,
        anamorphicRatio: 1.33,
      });

      expect(u[0]).toBe(1.0); // enabled
      expect(u[1]).toBeCloseTo(-0.25); // k1
      expect(u[2]).toBeCloseTo(0.05); // k2
      expect(u[3]).toBe(8); // chromatic aberration px
      expect(u[4]).toBeCloseTo(Math.PI / 4); // 45 deg in radians
      expect(u[5]).toBeCloseTo(1.33); // anamorphic ratio
    });
  });

  describe('Chroma Key Uniform Packing (packChromaKeyUniforms)', () => {
    it('returns zeroes when disabled', () => {
      const u = packChromaKeyUniforms({
        enabled: false,
        keyColorHex: '#00FF00',
        similarity: 0.4,
        smoothness: 0.1,
        spillSuppression: 0.5,
      });
      expect(u[0]).toBe(0);
    });

    it('packs keyColor normalized components, similarity, and spill suppression', () => {
      const u = packChromaKeyUniforms({
        enabled: true,
        keyColorHex: '#0000FF', // blue screen
        similarity: 0.35,
        smoothness: 0.08,
        spillSuppression: 0.85,
      });

      expect(u[0]).toBe(1.0); // enabled
      expect(u[1]).toBeCloseTo(0.0); // R
      expect(u[2]).toBeCloseTo(0.0); // G
      expect(u[3]).toBeCloseTo(1.0); // B
      expect(u[4]).toBeCloseTo(0.35); // similarity
      expect(u[5]).toBeCloseTo(0.08); // smoothness
      expect(u[6]).toBeCloseTo(0.85); // spill suppression
    });
  });

  describe('3-Way Color Grading Uniform Packing (packColorGradingUniforms)', () => {
    it('returns zeroes when neutral', () => {
      const u = packColorGradingUniforms(DEFAULT_COLOR_GRADING);
      expect(u[0]).toBe(0);
    });

    it('packs lift, gamma, gain, and temperature/tint offsets', () => {
      const u = packColorGradingUniforms({
        ...DEFAULT_COLOR_GRADING,
        lift: { r: 0.1, g: -0.05, b: 0.0, luma: 0.05 },
        gamma: { r: 0.0, g: 0.2, b: -0.1, luma: 0.0 },
        gain: { r: 0.15, g: 0.15, b: 0.3, luma: 0.1 },
        temperature: 25,
        tint: -15,
      });

      expect(u[0]).toBe(1.0); // enabled
      // Lift
      expect(u[1]).toBeCloseTo((0.1 + 0.05) * 0.5);
      expect(u[2]).toBeCloseTo((-0.05 + 0.05) * 0.5);
      // Gamma
      expect(u[4]).toBeCloseTo(1.0);
      expect(u[5]).toBeCloseTo(1.0 + 0.2 * 0.8);
      // Gain
      expect(u[7]).toBeCloseTo(1.0 + (0.15 + 0.1));
      expect(u[9]).toBeCloseTo(1.0 + (0.3 + 0.1));
      // Temp / Tint
      expect(u[10]).toBeCloseTo(0.25);
      expect(u[11]).toBeCloseTo(-0.15);
    });
  });

  describe('Geometric Shape Mask Uniform Packing (packMaskUniforms)', () => {
    it('returns zeroes when shape is none or disabled', () => {
      const u1 = packMaskUniforms({ ...DEFAULT_MASK_SETTINGS, enabled: false });
      expect(u1[0]).toBe(0);

      const u2 = packMaskUniforms({ ...DEFAULT_MASK_SETTINGS, enabled: true, shape: 'none' });
      expect(u2[0]).toBe(0);
    });

    it('packs rectangle mask geometry with rotation and feather', () => {
      const u = packMaskUniforms({
        enabled: true,
        shape: 'rectangle',
        x: 0.5,
        y: 0.5,
        width: 0.8,
        height: 0.4,
        feather: 20,
        rotation: 30,
        invert: true,
      });

      expect(u[0]).toBe(1.0); // enabled
      expect(u[1]).toBe(SHAPE_MASK_GL_IDS.rectangle);
      expect(u[2]).toBe(0.5); // center X
      expect(u[3]).toBe(0.5); // center Y
      expect(u[4]).toBeCloseTo(0.4); // half-width
      expect(u[5]).toBeCloseTo(0.2); // half-height
      expect(u[6]).toBeCloseTo(degreesToRadians(30)); // rotation rad
      expect(u[7]).toBeCloseTo(0.1); // feather
      expect(u[8]).toBe(1.0); // invert
    });

    it('packs circle mask geometry with non-inverted alpha', () => {
      const u = packMaskUniforms({
        enabled: true,
        shape: 'circle',
        x: 0.3,
        y: 0.7,
        width: 0.5,
        height: 0.5,
        feather: 10,
        invert: false,
      });

      expect(u[0]).toBe(1.0);
      expect(u[1]).toBe(SHAPE_MASK_GL_IDS.circle);
      expect(u[2]).toBeCloseTo(0.3);
      expect(u[3]).toBeCloseTo(0.7);
      expect(u[8]).toBe(0.0); // not inverted
    });
  });

  describe('Aggregated GPU Effects Resolver (resolveGpuEffects)', () => {
    it('resolves all 5 uniform payloads from a composite ClipEffects payload', () => {
      const effects = {
        filmEmulation: { ...DEFAULT_FILM_EMULATION_SETTINGS, enabled: true },
        lensOptics: { ...DEFAULT_LENS_OPTICS_SETTINGS, enabled: true, distortionK1: -0.1 },
        chromaKey: {
          enabled: true,
          keyColorHex: '#00FF00',
          similarity: 0.4,
          smoothness: 0.1,
          spillSuppression: 0.5,
        },
        colorGrade: { ...DEFAULT_COLOR_GRADING, temperature: 40 },
        mask: { ...DEFAULT_MASK_SETTINGS, enabled: true, shape: 'circle' as const },
      };

      const resolved = resolveGpuEffects(effects, 10);
      expect(resolved.film[0]).toBe(1.0);
      expect(resolved.lens[0]).toBe(1.0);
      expect(resolved.chroma[0]).toBe(1.0);
      expect(resolved.grade[0]).toBe(1.0);
      expect(resolved.mask[0]).toBe(1.0);
    });
  });
});
