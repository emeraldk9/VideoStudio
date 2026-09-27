import { describe, expect, it } from 'vitest';
import {
  snapPointToGridLattice,
  snapStrokePolyline,
  generateGridSvgMarkup,
  DEFAULT_PERSPECTIVE_GRID_SETTINGS,
} from '../perspective-grid-ops';
import type { Point2D } from '../calligraphy-ops';

describe('perspective-grid-ops', () => {
  it('snaps points to cartesian orthogonal lattice', () => {
    const config = {
      enabled: true,
      mode: 'cartesian' as const,
      spacingPx: 50,
      snapRadiusPx: 10,
    };

    // Point close to (100, 150) -> should snap
    const pt1: Point2D = [103, 148];
    const res1 = snapPointToGridLattice(pt1, config);
    expect(res1.didSnap).toBe(true);
    expect(res1.snappedPoint[0]).toBe(100);
    expect(res1.snappedPoint[1]).toBe(150);

    // Point far from any node -> should not snap
    const pt2: Point2D = [125, 125];
    const res2 = snapPointToGridLattice(pt2, config);
    expect(res2.didSnap).toBe(false);
    expect(res2.snappedPoint[0]).toBe(125);
    expect(res2.snappedPoint[1]).toBe(125);
  });

  it('snaps points to isometric triangular lattice', () => {
    const s = 60;
    const h = s * Math.sqrt(3) * 0.5; // ~51.96
    const config = {
      enabled: true,
      mode: 'isometric' as const,
      spacingPx: s,
      snapRadiusPx: 12,
    };

    // Row 0, col 2 -> (120, 0)
    const ptRow0: Point2D = [122, 3];
    const res0 = snapPointToGridLattice(ptRow0, config);
    expect(res0.didSnap).toBe(true);
    expect(res0.snappedPoint[0]).toBe(120);
    expect(res0.snappedPoint[1]).toBe(0);

    // Row 1 (odd row, offset by 30px) -> col 1 -> (30 + 60 = 90, h)
    const ptRow1: Point2D = [92, h - 2];
    const res1 = snapPointToGridLattice(ptRow1, config);
    expect(res1.didSnap).toBe(true);
    expect(res1.snappedPoint[0]).toBe(90);
    expect(res1.snappedPoint[1]).toBeCloseTo(h, 1);
  });

  it('snaps points to vanishing point perspective rays', () => {
    const config = {
      enabled: true,
      mode: 'perspective' as const,
      horizonYPct: 0.5,
      snapRadiusPx: 15,
    };
    const vpX = 960;
    const vpY = 540;

    // Directly down from VP (angle 90° = 1.57079 rad)
    const ptVertical: Point2D = [vpX + 3, vpY + 200];
    const res = snapPointToGridLattice(ptVertical, config, 1920, 1080);
    expect(res.didSnap).toBe(true);
    expect(res.snappedPoint[0]).toBeCloseTo(vpX, 0);
    expect(res.snappedPoint[1]).toBeCloseTo(vpY + 200, 0);
  });

  it('bypasses snapping when disabled', () => {
    const config = { enabled: false };
    const pt: Point2D = [102, 149];
    const res = snapPointToGridLattice(pt, config);
    expect(res.didSnap).toBe(false);
    expect(res.snappedPoint[0]).toBe(102);
    expect(res.snappedPoint[1]).toBe(149);
  });

  it('snaps stroke polyline vertices', () => {
    const config = {
      enabled: true,
      mode: 'cartesian' as const,
      spacingPx: 40,
      snapRadiusPx: 10,
    };
    const stroke: Point2D[] = [
      [39, 41],
      [78, 81],
      [119, 122],
    ];
    const snapped = snapStrokePolyline(stroke, config);
    expect(snapped.length).toBe(3);
    expect(snapped[0]).toEqual([40, 40]);
    expect(snapped[1]).toEqual([80, 80]);
    expect(snapped[2]).toEqual([120, 120]);
  });

  it('generates declarative SVG markup for all grid modes', () => {
    const modes = ['cartesian', 'dots', 'isometric', 'perspective'] as const;
    for (const mode of modes) {
      const svg = generateGridSvgMarkup({ enabled: true, mode, opacity: 0.25 }, 800, 600);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('viewBox="0 0 800 600"');
    }

    // Returns empty string if disabled or zero opacity
    expect(generateGridSvgMarkup({ enabled: false })).toBe('');
    expect(generateGridSvgMarkup({ enabled: true, opacity: 0 })).toBe('');
  });
});
