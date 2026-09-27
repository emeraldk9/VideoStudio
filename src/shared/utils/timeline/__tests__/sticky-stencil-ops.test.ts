import { describe, expect, it } from 'vitest';
import {
  clipPolylineToStencil,
  computeRotatedQuad,
  generateStickyNoteSvg,
  getStickyNoteColor,
  isPointInsideStencilPolygon,
} from '../sticky-stencil-ops';

describe('sticky-stencil-ops', () => {
  it('resolves preset and custom hex colors correctly', () => {
    expect(getStickyNoteColor('canary')).toBe('#FFF875');
    expect(getStickyNoteColor('pink')).toBe('#FFB7C5');
    expect(getStickyNoteColor('canary', '#123456')).toBe('#123456');
    expect(getStickyNoteColor('mint', 'invalid-hex')).toBe('#B8F2B8');
  });

  it('computes rotated quad vertices around center point', () => {
    const center = { x: 200, y: 200 };
    const size = { width: 100, height: 100 };
    // 0 deg: top-left (150, 150), top-right (250, 150), bottom-right (250, 250), bottom-left (150, 250)
    const quad = computeRotatedQuad(center, size, 0);
    expect(quad).toHaveLength(4);
    expect(quad[0]).toEqual({ x: 150, y: 150 });
    expect(quad[1]).toEqual({ x: 250, y: 150 });
    expect(quad[2]).toEqual({ x: 250, y: 250 });
    expect(quad[3]).toEqual({ x: 150, y: 250 });

    // Rotate 90 deg: top-left rotates to top-right
    const quad90 = computeRotatedQuad(center, size, 90);
    expect(quad90[0].x).toBeCloseTo(250, 1);
    expect(quad90[0].y).toBeCloseTo(150, 1);
  });

  it('detects point in polygon via ray-casting', () => {
    const poly = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ];
    expect(isPointInsideStencilPolygon({ x: 200, y: 200 }, poly)).toBe(true);
    expect(isPointInsideStencilPolygon({ x: 50, y: 50 }, poly)).toBe(false);
    expect(isPointInsideStencilPolygon({ x: 400, y: 200 }, poly)).toBe(false);
  });

  it('clips stroke polyline into segments inside or outside stencil', () => {
    const stencil = [
      { x: 200, y: 200 },
      { x: 400, y: 200 },
      { x: 400, y: 400 },
      { x: 200, y: 400 },
    ];
    // Polyline running through stencil: (100, 300) -> (500, 300)
    const stroke = [
      { x: 100, y: 300 },
      { x: 150, y: 300 },
      { x: 250, y: 300 },
      { x: 350, y: 300 },
      { x: 450, y: 300 },
      { x: 500, y: 300 },
    ];

    // Inside segments
    const inside = clipPolylineToStencil(stroke, stencil, false);
    expect(inside).toHaveLength(1);
    expect(inside[0]).toEqual([
      { x: 250, y: 300 },
      { x: 350, y: 300 },
    ]);

    // Outside segments (inverted mask)
    const outside = clipPolylineToStencil(stroke, stencil, true);
    expect(outside).toHaveLength(2);
    expect(outside[0]).toEqual([
      { x: 100, y: 300 },
      { x: 150, y: 300 },
    ]);
    expect(outside[1]).toEqual([
      { x: 450, y: 300 },
      { x: 500, y: 300 },
    ]);
  });

  it('generates valid SVG markup with drop shadow and magnet pin', () => {
    const svg = generateStickyNoteSvg({
      enabled: true,
      colorPreset: 'cyan',
      posX: 200,
      posY: 200,
      pinStyle: 'magnet',
    });
    expect(svg).toContain('<g class="sticky-note-wrapper"');
    expect(svg).toContain('fill="#A0E8FF"');
    expect(svg).toContain('fill="#e53e3e"'); // magnet circle
  });
});
