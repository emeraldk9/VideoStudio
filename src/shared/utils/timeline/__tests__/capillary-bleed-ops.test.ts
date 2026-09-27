import { describe, it, expect } from 'vitest';
import {
  lineSegmentIntersection,
  detectStrokeIntersections,
  computeDendriticBloomPoints,
  generateCapillaryBleedSvgDefs,
  DEFAULT_CAPILLARY_BLEED_SETTINGS,
} from '../capillary-bleed-ops';

describe('capillary-bleed-ops', () => {
  it('DEFAULT_CAPILLARY_BLEED_SETTINGS has expected default values', () => {
    expect(DEFAULT_CAPILLARY_BLEED_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_CAPILLARY_BLEED_SETTINGS.dryingTimeSec).toBe(2.0);
    expect(DEFAULT_CAPILLARY_BLEED_SETTINGS.bleedBloomRadiusPx).toBe(6.0);
    expect(DEFAULT_CAPILLARY_BLEED_SETTINGS.solventDilution).toBe(0.35);
    expect(DEFAULT_CAPILLARY_BLEED_SETTINGS.featherSpikes).toBe(6);
  });

  describe('lineSegmentIntersection', () => {
    it('detects intersecting orthogonal segments', () => {
      const p1 = { x: 0, y: 50 };
      const p2 = { x: 100, y: 50 };
      const p3 = { x: 50, y: 0 };
      const p4 = { x: 50, y: 100 };

      const res = lineSegmentIntersection(p1, p2, p3, p4);
      expect(res.hit).toBe(true);
      expect(res.point?.x).toBeCloseTo(50, 4);
      expect(res.point?.y).toBeCloseTo(50, 4);
    });

    it('returns hit=false for parallel segments', () => {
      const p1 = { x: 0, y: 10 };
      const p2 = { x: 100, y: 10 };
      const p3 = { x: 0, y: 20 };
      const p4 = { x: 100, y: 20 };

      const res = lineSegmentIntersection(p1, p2, p3, p4);
      expect(res.hit).toBe(false);
    });

    it('returns hit=false for non-intersecting collinear-disjoint segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 20, y: 0 };
      const p4 = { x: 30, y: 0 };

      const res = lineSegmentIntersection(p1, p2, p3, p4);
      expect(res.hit).toBe(false);
    });
  });

  describe('detectStrokeIntersections', () => {
    it('generates bleed node for wet-on-wet crossing within drying window', () => {
      const strokeA = {
        points: [
          { x: 10, y: 50, timestamp: 1.0 },
          { x: 90, y: 50, timestamp: 1.2 },
        ],
        colorHex: '#111827',
      };
      const strokeB = {
        points: [
          { x: 50, y: 10, timestamp: 1.4 },
          { x: 50, y: 90, timestamp: 1.6 },
        ],
        colorHex: '#E11D48',
      };

      const nodes = detectStrokeIntersections([strokeA, strokeB], 2.0, 8.0);
      expect(nodes.length).toBe(1);
      expect(nodes[0].pos.x).toBeCloseTo(50, 2);
      expect(nodes[0].pos.y).toBeCloseTo(50, 2);
      expect(nodes[0].wetness).toBeGreaterThan(0.7);
      expect(nodes[0].bloomRadius).toBeGreaterThan(5.0);
    });

    it('skips bleed node when intersection occurs after drying window has passed', () => {
      const strokeA = {
        points: [
          { x: 10, y: 50, timestamp: 1.0 },
          { x: 90, y: 50, timestamp: 1.2 },
        ],
        colorHex: '#111827',
      };
      const strokeDry = {
        points: [
          { x: 50, y: 10, timestamp: 4.5 }, // 3.3s > 2.0s
          { x: 50, y: 90, timestamp: 4.7 },
        ],
        colorHex: '#E11D48',
      };

      const nodes = detectStrokeIntersections([strokeA, strokeDry], 2.0);
      expect(nodes.length).toBe(0);
    });
  });

  describe('computeDendriticBloomPoints', () => {
    it('generates alternating spike points radiating outward', () => {
      const center = { x: 50, y: 50 };
      const pts = computeDendriticBloomPoints(center, 10.0, 0.8, 6);

      expect(pts.length).toBe(12);
      // All points should surround center
      for (const p of pts) {
        const dist = Math.hypot(p.x - center.x, p.y - center.y);
        expect(dist).toBeGreaterThan(5.0);
        expect(dist).toBeLessThan(20.0);
      }
    });
  });

  describe('generateCapillaryBleedSvgDefs', () => {
    it('produces svg polygon and dilution core elements', () => {
      const nodes = [
        {
          pos: { x: 40, y: 40 },
          wetness: 0.85,
          bloomRadius: 7.0,
          blendedColorHex: '#E11D48',
        },
      ];

      const svg = generateCapillaryBleedSvgDefs(nodes, 0.35, 6);
      expect(svg).toContain('<polygon points="');
      expect(svg).toContain('fill="#E11D48"');
      expect(svg).toContain('<circle cx="40.0" cy="40.0"');
    });

    it('returns empty string when no bleed nodes present', () => {
      expect(generateCapillaryBleedSvgDefs([])).toBe('');
    });
  });
});
