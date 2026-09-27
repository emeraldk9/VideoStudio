import { describe, it, expect } from 'vitest';
import { hexToRgb, rgbToHex } from '../compositing-ops';
import {
  rgbToOklab,
  oklabToRgb,
  interpolatePerceptualColor,
  computeGradientRibbonMesh,
  generateGradientRibbonSvgDefs,
  DEFAULT_GRADIENT_WASH_SETTINGS,
} from '../gradient-wash-ribbon-ops';

describe('gradient-wash-ribbon-ops', () => {
  it('DEFAULT_GRADIENT_WASH_SETTINGS has expected properties', () => {
    expect(DEFAULT_GRADIENT_WASH_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_GRADIENT_WASH_SETTINGS.washLengthPx).toBe(45.0);
    expect(DEFAULT_GRADIENT_WASH_SETTINGS.useOklab).toBe(true);
    expect(DEFAULT_GRADIENT_WASH_SETTINGS.secondaryColorHex).toBe('#E11D48');
    expect(DEFAULT_GRADIENT_WASH_SETTINGS.ditherNoise).toBe(0.05);
  });

  describe('hex and rgb utilities', () => {
    it('converts hex to rgb and back', () => {
      const hex = '#3B82F6';
      const rgb = hexToRgb(hex);
      expect(rgb.r).toBe(0x3b);
      expect(rgb.g).toBe(0x82);
      expect(rgb.b).toBe(0xf6);

      const roundtrip = rgbToHex(rgb.r, rgb.g, rgb.b);
      expect(roundtrip.toUpperCase()).toBe(hex.toUpperCase());
    });

    it('handles 3-digit shorthand hex', () => {
      const rgb = hexToRgb('#abc');
      expect(rgb.r).toBe(0xaa);
      expect(rgb.g).toBe(0xbb);
      expect(rgb.b).toBe(0xcc);
    });
  });

  describe('OKLab color space conversion', () => {
    it('accurately roundtrips between RGB and OKLab', () => {
      const orig = { r: 220, g: 120, b: 45 };
      const lab = rgbToOklab(orig.r, orig.g, orig.b);
      const restored = oklabToRgb(lab.L, lab.a, lab.b);

      expect(Math.abs(restored.r - orig.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(restored.g - orig.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(restored.b - orig.b)).toBeLessThanOrEqual(2);
    });
  });

  describe('interpolatePerceptualColor', () => {
    it('returns boundary colors at t=0 and t=1', () => {
      expect(interpolatePerceptualColor('#FF0000', '#0000FF', 0.0)).toBe('#FF0000');
      expect(interpolatePerceptualColor('#FF0000', '#0000FF', 1.0)).toBe('#0000FF');
    });

    it('preserves vibrant green when blending blue and yellow in OKLab', () => {
      const blue = '#0000FF';
      const yellow = '#FFFF00';
      const midOklab = interpolatePerceptualColor(blue, yellow, 0.5, true);
      const rgbOklab = hexToRgb(midOklab);

      // In OKLab perceptual space, blue + yellow produces a vibrant green
      expect(rgbOklab.g).toBeGreaterThan(130);
    });
  });

  describe('computeGradientRibbonMesh', () => {
    it('returns empty mesh for fewer than 2 points', () => {
      const mesh = computeGradientRibbonMesh([{ x: 10, y: 10 }], []);
      expect(mesh.segments.length).toBe(0);
      expect(mesh.totalLength).toBe(0);
    });

    it('builds quadrilateral ribbon segments with smooth color transitions', () => {
      const points = [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
        { x: 150, y: 50 },
      ];
      const transitions = [
        { offsetFraction: 0.0, colorHex: '#0000FF' }, // blue
        { offsetFraction: 1.0, colorHex: '#FF0000' }, // red
      ];

      const mesh = computeGradientRibbonMesh(points, transitions, 8.0, 50.0, true);
      expect(mesh.segments.length).toBe(3);
      expect(mesh.totalLength).toBeCloseTo(150.0, 1);

      // Start segment should be mostly blue
      const segStartRgb = hexToRgb(mesh.segments[0].colorHex);
      expect(segStartRgb.b).toBeGreaterThan(150);

      // End segment should be mostly red
      const segEndRgb = hexToRgb(mesh.segments[2].colorHex);
      expect(segEndRgb.r).toBeGreaterThan(150);
    });
  });

  describe('generateGradientRibbonSvgDefs', () => {
    it('generates svg polygon tags for mesh segments', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ];
      const mesh = computeGradientRibbonMesh(points, [{ offsetFraction: 0, colorHex: '#123456' }], 4.0);
      const svg = generateGradientRibbonSvgDefs(mesh);

      expect(svg).toContain('<polygon');
      expect(svg).toContain('fill="#123456"');
    });
  });
});
