import { describe, it, expect } from 'vitest';
import {
  updateFeltSaturation,
  computeGhostingOpacity,
  generateWiperSmearBands,
  generateEraserGhostingSvgMarkup,
  DEFAULT_ERASER_GHOSTING_SETTINGS,
} from '../eraser-smear-ghosting-ops';

describe('eraser-smear-ghosting-ops', () => {
  it('DEFAULT_ERASER_GHOSTING_SETTINGS has expected values', () => {
    expect(DEFAULT_ERASER_GHOSTING_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_ERASER_GHOSTING_SETTINGS.feltSaturationRate).toBe(0.08);
    expect(DEFAULT_ERASER_GHOSTING_SETTINGS.smearOpacity).toBe(0.06);
    expect(DEFAULT_ERASER_GHOSTING_SETTINGS.ghostPersistence).toBe(0.05);
    expect(DEFAULT_ERASER_GHOSTING_SETTINGS.cleaningDecayRate).toBe(0.40);
  });

  describe('updateFeltSaturation', () => {
    it('accumulates saturation based on cleared pixels', () => {
      const initial = 0.10;
      const updated = updateFeltSaturation(initial, 5000, 0.08);
      // gain = (5000 / 1000) * 0.08 = 0.40 -> total = 0.50
      expect(updated).toBeCloseTo(0.50, 4);
    });

    it('clamps saturation at ceiling of 1.0', () => {
      const maxed = updateFeltSaturation(0.95, 4000, 0.08);
      expect(maxed).toBe(1.0);
    });
  });

  describe('computeGhostingOpacity', () => {
    it('returns base persistence on first pass', () => {
      const op1 = computeGhostingOpacity(1, 0.06, 0.40);
      expect(op1).toBeCloseTo(0.06, 4);
    });

    it('decays exponentially with successive cleaning passes', () => {
      const op1 = computeGhostingOpacity(1, 0.06, 0.40);
      const op2 = computeGhostingOpacity(2, 0.06, 0.40);
      const op3 = computeGhostingOpacity(3, 0.06, 0.40);

      expect(op2).toBeCloseTo(0.036, 4);
      expect(op3).toBeCloseTo(0.0216, 4);
      expect(op3).toBeLessThan(op2);
    });
  });

  describe('generateWiperSmearBands', () => {
    it('returns empty mesh for fewer than 2 points', () => {
      const mesh = generateWiperSmearBands([{ x: 10, y: 10 }]);
      expect(mesh.quads.length).toBe(0);
      expect(mesh.totalLength).toBe(0);
    });

    it('generates trailing smear quads spanning eraser width', () => {
      const path = [
        { x: 20, y: 50 },
        { x: 80, y: 50 },
        { x: 140, y: 50 },
      ];
      const mesh = generateWiperSmearBands(path, 30.0, 0.8, 0.05);

      expect(mesh.quads.length).toBe(2);
      expect(mesh.totalLength).toBeCloseTo(120.0, 1);
      expect(mesh.quads[0].opacity).toBeCloseTo(0.04, 3);
      // Width perpendicular to motion is 30px (half-width 15px above and below y=50)
      expect(mesh.quads[0].v0.y).toBeCloseTo(35.0, 1);
      expect(mesh.quads[0].v1.y).toBeCloseTo(65.0, 1);
    });
  });

  describe('generateEraserGhostingSvgMarkup', () => {
    it('produces SVG polygon tags for smear and wraps ghost snippet', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
      ];
      const mesh = generateWiperSmearBands(path, 20.0, 1.0, 0.1);
      const ghostSvg = '<path d="M 10 10 L 20 20" stroke="#000" />';
      const markup = generateEraserGhostingSvgMarkup(mesh, ghostSvg, 0.04);

      expect(markup).toContain('<polygon points="');
      expect(markup).toContain('<g opacity="0.040"');
      expect(markup).toContain(ghostSvg);
    });

    it('handles empty mesh and empty ghost snippet cleanly', () => {
      const markup = generateEraserGhostingSvgMarkup({ quads: [], totalLength: 0 });
      expect(markup).toBe('');
    });
  });
});
