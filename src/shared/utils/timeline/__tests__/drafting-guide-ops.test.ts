import { describe, expect, it } from 'vitest';
import {
  detectLinearGuideOpportunity,
  computeRulerAlignment,
  generateRulerSvgMarkup,
  generateCompassSvgMarkup,
} from '../drafting-guide-ops';

describe('drafting-guide-ops', () => {
  it('correctly discriminates straight segments from curved strokes', () => {
    // 1. Straight line: (0, 0) to (300, 0) with 0.5px noise
    const straight: [number, number][] = [
      [0, 0],
      [100, 0.5],
      [200, -0.5],
      [300, 0],
    ];
    const res1 = detectLinearGuideOpportunity(straight, 100);
    expect(res1.isLinear).toBe(true);
    expect(res1.chordLen).toBeCloseTo(300, 0);

    // 2. Short segment: length 50px < minLen 100px
    const shortLine: [number, number][] = [
      [0, 0],
      [50, 0],
    ];
    const res2 = detectLinearGuideOpportunity(shortLine, 100);
    expect(res2.isLinear).toBe(false);

    // 3. Curved arc: midpoint deviates by 40px
    const curved: [number, number][] = [
      [0, 0],
      [150, 40],
      [300, 0],
    ];
    const res3 = detectLinearGuideOpportunity(curved, 100);
    expect(res3.isLinear).toBe(false);
  });

  it('computes parallel ruler alignment geometry and bevel offset', () => {
    const p1: [number, number] = [100, 100];
    const p2: [number, number] = [400, 100]; // horizontal line
    const ruler = computeRulerAlignment(p1, p2, 20.0, 'wood');

    expect(ruler.angleDeg).toBeCloseTo(0, 1);
    expect(ruler.material).toBe('wood');
    expect(ruler.length).toBeGreaterThan(300);
    // Normal vector points perpendicular (y offset from 100 to 120 or 80)
    expect(ruler.origin[0]).toBeCloseTo(100, 1);
    expect(Math.abs(ruler.origin[1] - 100)).toBeCloseTo(20, 1);
  });

  it('generates SVG markup for straightedge ruler and compass', () => {
    const ruler = computeRulerAlignment([0, 0], [200, 0], 15.0, 'acrylic');
    const rulerSvg = generateRulerSvgMarkup(ruler);
    expect(rulerSvg).toContain('<rect');
    expect(rulerSvg).toContain('rgba(210, 235, 255, 0.45)');

    const compassSvg = generateCompassSvgMarkup({
      pivot: [200, 200],
      leadPos: [300, 200],
      radius: 100,
      angleDeg: 0,
    });
    expect(compassSvg).toContain('class="drafting-compass"');
    expect(compassSvg).toContain('cx="200" cy="200"');
  });
});
