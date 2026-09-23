import { describe, it, expect } from 'vitest';
import {
  LUT_PRESETS,
  DEFAULT_LUT_SETTINGS,
  parseCubeLut,
  sampleLut3D,
  buildCssLutFilter,
  buildFfmpegLutFilter,
  type ClipLutSettings,
  type Lut3DTable,
} from '../lut-ops';

describe('lut-ops', () => {
  describe('LUT_PRESETS', () => {
    it('contains all 6 curated cinematic presets with complete metadata', () => {
      expect(LUT_PRESETS).toHaveLength(6);
      const keys = LUT_PRESETS.map((p) => p.key);
      expect(keys).toContain('teal_orange');
      expect(keys).toContain('kodak_vision3');
      expect(keys).toContain('fuji_eterna');
      expect(keys).toContain('bleach_bypass');
      expect(keys).toContain('noir_monochrome');
      expect(keys).toContain('vintage_polaroid');

      for (const preset of LUT_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(['cinematic', 'film_stock', 'vintage', 'monochrome']).toContain(preset.category);
        expect(preset.generateCss(1.0)).toBeTruthy();
      }
    });
  });

  describe('parseCubeLut', () => {
    it('correctly parses standard .cube format with header and 3D data lines', () => {
      const cubeContent = `
# Exported by DaVinci Resolve
TITLE "Test 2x2x2 Cube"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

      const table = parseCubeLut(cubeContent);
      expect(table.size).toBe(2);
      expect(table.title).toBe('Test 2x2x2 Cube');
      expect(table.data.length).toBe(2 * 2 * 2 * 3); // 24 floats
      expect(table.domainMin).toEqual([0, 0, 0]);
      expect(table.domainMax).toEqual([1, 1, 1]);

      // Check corner values
      expect(table.data[0]).toBe(0.0); // R at (0, 0, 0)
      expect(table.data[table.data.length - 1]).toBe(1.0); // B at (1, 1, 1)
    });

    it('infers cube size from data count if header is missing LUT_3D_SIZE', () => {
      const simpleCube = `
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;
      const table = parseCubeLut(simpleCube);
      expect(table.size).toBe(2);
    });
  });

  describe('sampleLut3D (Trilinear Interpolation)', () => {
    // Identity 2x2x2 cube mapping (r, g, b) -> (r, g, b)
    const identityCube: Lut3DTable = {
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array([
        // z=0, y=0: (0,0,0), (1,0,0)
        0.0, 0.0, 0.0,   1.0, 0.0, 0.0,
        // z=0, y=1: (0,1,0), (1,1,0)
        0.0, 1.0, 0.0,   1.0, 1.0, 0.0,
        // z=1, y=0: (0,0,1), (1,0,1)
        0.0, 0.0, 1.0,   1.0, 0.0, 1.0,
        // z=1, y=1: (0,1,1), (1,1,1)
        0.0, 1.0, 1.0,   1.0, 1.0, 1.0,
      ]),
    };

    it('returns exact corner values on an identity cube', () => {
      expect(sampleLut3D(identityCube, 0, 0, 0)).toEqual([0, 0, 0]);
      expect(sampleLut3D(identityCube, 1, 0, 0)).toEqual([1, 0, 0]);
      expect(sampleLut3D(identityCube, 0, 1, 0)).toEqual([0, 1, 0]);
      expect(sampleLut3D(identityCube, 1, 1, 1)).toEqual([1, 1, 1]);
    });

    it('linearly interpolates middle points', () => {
      const mid = sampleLut3D(identityCube, 0.5, 0.5, 0.5);
      expect(mid[0]).toBeCloseTo(0.5, 4);
      expect(mid[1]).toBeCloseTo(0.5, 4);
      expect(mid[2]).toBeCloseTo(0.5, 4);
    });

    it('clamps inputs outside the [0, 1] range safely', () => {
      const below = sampleLut3D(identityCube, -0.5, 0.2, 0.8);
      expect(below[0]).toBe(0.0);

      const above = sampleLut3D(identityCube, 1.5, 0.5, 0.5);
      expect(above[0]).toBe(1.0);
    });
  });

  describe('buildCssLutFilter', () => {
    it('returns empty string when disabled or intensity is zero', () => {
      expect(buildCssLutFilter(undefined)).toBe('');
      expect(buildCssLutFilter(DEFAULT_LUT_SETTINGS)).toBe('');

      const zeroIntensity: ClipLutSettings = {
        enabled: true,
        preset: 'teal_orange',
        intensity: 0,
      };
      expect(buildCssLutFilter(zeroIntensity)).toBe('');
    });

    it('generates parameterized CSS filters for presets', () => {
      const tealOrange: ClipLutSettings = {
        enabled: true,
        preset: 'teal_orange',
        intensity: 1.0,
      };
      const css = buildCssLutFilter(tealOrange);
      expect(css).toContain('contrast(');
      expect(css).toContain('saturate(');
      expect(css).toContain('sepia(');
      expect(css).toContain('hue-rotate(');

      const noir: ClipLutSettings = {
        enabled: true,
        preset: 'noir_monochrome',
        intensity: 1.0,
      };
      const noirCss = buildCssLutFilter(noir);
      expect(noirCss).toContain('grayscale(1.000)');
    });

    it('scales CSS filter values when intensity is partial', () => {
      const halfIntensity: ClipLutSettings = {
        enabled: true,
        preset: 'noir_monochrome',
        intensity: 0.5,
      };
      const css = buildCssLutFilter(halfIntensity);
      expect(css).toContain('grayscale(0.500)');
    });
  });

  describe('buildFfmpegLutFilter', () => {
    it('returns empty string when disabled or intensity is zero', () => {
      expect(buildFfmpegLutFilter(undefined)).toBe('');
      expect(buildFfmpegLutFilter(DEFAULT_LUT_SETTINGS)).toBe('');
    });

    it('emits lut3d filter with customCubePath', () => {
      const custom: ClipLutSettings = {
        enabled: true,
        customCubePath: '/path/to/cinematic.cube',
        intensity: 1.0,
      };
      expect(buildFfmpegLutFilter(custom)).toBe("lut3d=file='/path/to/cinematic.cube'");
    });

    it('emits color balance and eq filters for presets', () => {
      const tealOrange: ClipLutSettings = {
        enabled: true,
        preset: 'teal_orange',
        intensity: 1.0,
      };
      expect(buildFfmpegLutFilter(tealOrange)).toContain('colorbalance=');

      const bleach: ClipLutSettings = {
        enabled: true,
        preset: 'bleach_bypass',
        intensity: 1.0,
      };
      expect(buildFfmpegLutFilter(bleach)).toContain('eq=contrast=');
    });
  });
});
