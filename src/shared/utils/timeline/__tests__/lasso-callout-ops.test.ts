import { describe, expect, it } from 'vitest';
import {
  computeLassoPulseFactor,
  detectLassoLoop,
  generateLassoCalloutSvg,
} from '../lasso-callout-ops';

describe('lasso-callout-ops', () => {
  it('detects closed circular stroke as a valid lasso gesture', () => {
    const cx = 200;
    const cy = 200;
    const r = 60;
    const numPts = 24;
    const points = [];
    for (let i = 0; i < numPts; i++) {
      const angle = (2 * Math.PI * i) / numPts;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }
    // Small gap at end
    points.push({ x: cx + r - 8, y: cy + 4 });

    const result = detectLassoLoop(points);
    expect(result.isLasso).toBe(true);
    expect(Math.abs(result.center.x - cx)).toBeLessThan(10);
    expect(Math.abs(result.center.y - cy)).toBeLessThan(10);
    expect(result.area).toBeGreaterThan(8000);
    expect(result.bbox.width).toBeGreaterThanOrEqual(100);
  });

  it('rejects open polyline strokes with large gaps', () => {
    const openStroke = [
      { x: 50, y: 100 },
      { x: 100, y: 120 },
      { x: 150, y: 100 },
      { x: 200, y: 150 },
      { x: 250, y: 120 },
      { x: 300, y: 180 },
      { x: 350, y: 160 },
      { x: 400, y: 200 },
    ];
    const result = detectLassoLoop(openStroke);
    expect(result.isLasso).toBe(false);
  });

  it('computes periodic breathing pulse scale and opacity', () => {
    const p1 = computeLassoPulseFactor(0.0, 1.0);
    const p2 = computeLassoPulseFactor(0.25, 1.0);
    expect(p1.scale).toBeCloseTo(1.0, 2);
    expect(p2.scale).toBeGreaterThan(1.0);
    expect(p1.opacity).toBeGreaterThan(0);
    expect(p2.opacity).toBeGreaterThan(0);
  });

  it('generates pulse beacon, pin badge, and magnifier SVG markup', () => {
    const mockLasso = {
      isLasso: true,
      center: { x: 200, y: 200 },
      bbox: { x: 150, y: 150, width: 100, height: 100 },
      area: 7850,
      gap: 12,
      perimeter: 380,
    };

    const beaconSvg = generateLassoCalloutSvg(mockLasso, 0.5, {
      calloutStyle: 'pulse_beacon',
      glowColorHex: '#ffdc33',
    });
    expect(beaconSvg).toContain('lasso-callout-beacon');
    expect(beaconSvg).toContain('#ffdc33');

    const badgeSvg = generateLassoCalloutSvg(mockLasso, 0.5, {
      calloutStyle: 'badge_pin',
      badgeLabel: '2',
    });
    expect(badgeSvg).toContain('lasso-callout-badge');
    expect(badgeSvg).toContain('>2<');

    const loupeSvg = generateLassoCalloutSvg(mockLasso, 0.5, {
      calloutStyle: 'magnifier_loupe',
    });
    expect(loupeSvg).toContain('lasso-callout-loupe');
  });
});
