import { describe, it, expect } from 'vitest';
import {
  computeSplayWidth,
  computeNibDeflection,
  generateSplayRibbonMesh,
  generateSplayRibbonSvgPath,
  DEFAULT_NIB_SPLAY_SETTINGS,
} from '../nib-splay-compression-ops';

describe('nib-splay-compression-ops', () => {
  it('DEFAULT_NIB_SPLAY_SETTINGS has expected default values', () => {
    expect(DEFAULT_NIB_SPLAY_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_NIB_SPLAY_SETTINGS.splayGain).toBe(1.2);
    expect(DEFAULT_NIB_SPLAY_SETTINGS.fiberStiffness).toBe(0.65);
    expect(DEFAULT_NIB_SPLAY_SETTINGS.dragDeflection).toBe(0.40);
  });

  describe('computeSplayWidth', () => {
    it('increases non-linearly with pressure', () => {
      const baseWidth = 6.0;
      const wLow = computeSplayWidth(baseWidth, 0.15, 1.2, 0.65);
      const wHigh = computeSplayWidth(baseWidth, 0.90, 1.2, 0.65);

      expect(wLow).toBeGreaterThanOrEqual(baseWidth);
      expect(wHigh).toBeGreaterThan(wLow);
      expect(wHigh).toBeGreaterThanOrEqual(baseWidth * 1.5);
    });

    it('stiffer fiber resists lateral splay expansion', () => {
      const baseWidth = 6.0;
      const wSoft = computeSplayWidth(baseWidth, 0.80, 1.2, 0.20);
      const wStiff = computeSplayWidth(baseWidth, 0.80, 1.2, 0.85);

      expect(wSoft).toBeGreaterThan(wStiff);
    });

    it('clamps pressure and respects minimum/maximum bounds', () => {
      const baseWidth = 6.0;
      const wNegative = computeSplayWidth(baseWidth, -0.5);
      const wExcess = computeSplayWidth(baseWidth, 5.0);

      expect(wNegative).toBe(baseWidth);
      expect(wExcess).toBeLessThanOrEqual(baseWidth * 3.5);
    });
  });

  describe('computeNibDeflection', () => {
    it('deflects contact center backwards relative to velocity', () => {
      const pt = { x: 100, y: 100 };
      const velRight = { x: 1, y: 0 };
      const displaced = computeNibDeflection(pt, velRight, 0.8, 0.5, 6.0);

      expect(displaced.x).toBeLessThan(pt.x);
      expect(displaced.y).toBeCloseTo(pt.y, 4);
    });

    it('deflection increases with pressure and drag factor', () => {
      const pt = { x: 50, y: 50 };
      const velDown = { x: 0, y: 1 };
      const d1 = computeNibDeflection(pt, velDown, 0.3, 0.4, 6.0);
      const d2 = computeNibDeflection(pt, velDown, 0.9, 0.4, 6.0);

      expect(d2.y).toBeLessThan(d1.y);
    });
  });

  describe('generateSplayRibbonMesh', () => {
    it('returns empty mesh for fewer than 2 points', () => {
      const mesh = generateSplayRibbonMesh([{ x: 10, y: 10 }]);
      expect(mesh.quads.length).toBe(0);
      expect(mesh.totalLength).toBe(0);
    });

    it('builds quadrilateral splayed ribbon mesh along stroke', () => {
      const points = [
        { x: 0, y: 50, pressure: 0.2 },
        { x: 50, y: 50, pressure: 0.5 },
        { x: 100, y: 50, pressure: 0.9 },
      ];

      const mesh = generateSplayRibbonMesh(points, 6.0, 1.3, 0.5, 0.4);
      expect(mesh.quads.length).toBe(2);
      expect(mesh.totalLength).toBeCloseTo(100.0, 1);

      // Higher pressure at end should result in wider quad
      expect(mesh.quads[1].effectiveWidth).toBeGreaterThan(mesh.quads[0].effectiveWidth);
    });
  });

  describe('generateSplayRibbonSvgPath', () => {
    it('serializes mesh quads into SVG path string', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ];
      const mesh = generateSplayRibbonMesh(points, 5.0);
      const svg = generateSplayRibbonSvgPath(mesh);

      expect(svg).toContain('M ');
      expect(svg).toContain('L ');
      expect(svg).toContain(' Z');
    });

    it('returns empty string for empty mesh', () => {
      expect(generateSplayRibbonSvgPath({ quads: [], totalLength: 0 })).toBe('');
    });
  });
});
