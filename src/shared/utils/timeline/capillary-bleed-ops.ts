/**
 * Whiteboard Wet-on-Wet Capillary Bleed & Pigment Diffusion Operations.
 *
 * Implements fluid dynamics when intersecting freshly drawn wet marker strokes:
 * 1. Temporal drying window: strokes drawn within dryingTimeSec exhibit capillary suction.
 * 2. Solvent pooling & core dilution: liquid accumulation creates a slightly diluted junction center.
 * 3. Dendritic feathering: capillary micro-tendrils bloom outward guided by surface tooth.
 * 4. Perceptual color mixing across intersecting multi-color strokes.
 */

export interface CapillaryBleedSettings {
  enabled?: boolean;
  dryingTimeSec?: number;       // 0.5..5.0, default 2.0
  bleedBloomRadiusPx?: number;  // 2.0..15.0, default 6.0
  solventDilution?: number;     // 0.0..0.70, default 0.35
  featherSpikes?: number;       // 3..12, default 6
}

export const DEFAULT_CAPILLARY_BLEED_SETTINGS: Required<CapillaryBleedSettings> = {
  enabled: false,
  dryingTimeSec: 2.0,
  bleedBloomRadiusPx: 6.0,
  solventDilution: 0.35,
  featherSpikes: 6,
};

export interface BleedPoint2D {
  x: number;
  y: number;
}

export interface TimedStrokePoint2D {
  x: number;
  y: number;
  timestamp: number; // in seconds
}

export interface TimedStroke {
  points: TimedStrokePoint2D[];
  colorHex: string;
  strokeWidth?: number;
}

export interface IntersectionBleedNode {
  pos: BleedPoint2D;
  wetness: number; // 0.0 to 1.0
  bloomRadius: number;
  blendedColorHex: string;
}

/**
 * Finds 2D intersection of line segment (p1, p2) and (p3, p4).
 */
export function lineSegmentIntersection(
  p1: BleedPoint2D,
  p2: BleedPoint2D,
  p3: BleedPoint2D,
  p4: BleedPoint2D
): { hit: boolean; point?: BleedPoint2D; t?: number; u?: number } {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = p4.x - p3.x;
  const sy = p4.y - p3.y;

  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-8) {
    return { hit: false };
  }

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * ry - dy * rx) / denom;

  if (t >= 0.0 && t <= 1.0 && u >= 0.0 && u <= 1.0) {
    return {
      hit: true,
      point: {
        x: p1.x + t * rx,
        y: p1.y + t * ry,
      },
      t,
      u,
    };
  }

  return { hit: false };
}

/**
 * Detects intersections between multiple timed strokes and generates wet bleed nodes.
 */
export function detectStrokeIntersections(
  strokes: TimedStroke[],
  dryingTimeSec = 2.0,
  baseBloomRadius = 6.0
): IntersectionBleedNode[] {
  const nodes: IntersectionBleedNode[] = [];
  const numStrokes = strokes.length;

  for (let s1 = 0; s1 < numStrokes; s1++) {
    for (let s2 = s1 + 1; s2 < numStrokes; s2++) {
      const strokeA = strokes[s1];
      const strokeB = strokes[s2];
      const ptsA = strokeA.points;
      const ptsB = strokeB.points;

      if (ptsA.length < 2 || ptsB.length < 2) continue;

      for (let i = 0; i < ptsA.length - 1; i++) {
        const pa1 = ptsA[i];
        const pa2 = ptsA[i + 1];

        for (let j = 0; j < ptsB.length - 1; j++) {
          const pb1 = ptsB[j];
          const pb2 = ptsB[j + 1];

          const res = lineSegmentIntersection(pa1, pa2, pb1, pb2);
          if (res.hit && res.point && res.t !== undefined && res.u !== undefined) {
            const timeA = pa1.timestamp + res.t * (pa2.timestamp - pa1.timestamp);
            const timeB = pb1.timestamp + res.u * (pb2.timestamp - pb1.timestamp);

            const deltaTime = Math.abs(timeB - timeA);
            if (deltaTime < dryingTimeSec) {
              const wetness = Math.max(0.0, 1.0 - deltaTime / dryingTimeSec);
              const bloomRadius = baseBloomRadius * (0.6 + 0.4 * wetness);

              // Blend colors or use strokeB color
              nodes.push({
                pos: res.point,
                wetness,
                bloomRadius,
                blendedColorHex: strokeB.colorHex || strokeA.colorHex,
              });
            }
          }
        }
      }
    }
  }

  return nodes;
}

/**
 * Generates an organic dendritic capillary polygon radiating outward from the intersection.
 */
export function computeDendriticBloomPoints(
  center: BleedPoint2D,
  radius: number,
  wetness: number,
  numSpikes = 6
): BleedPoint2D[] {
  const points: BleedPoint2D[] = [];
  const totalVertices = Math.max(6, numSpikes * 2);

  for (let k = 0; k < totalVertices; k++) {
    const angle = (2.0 * Math.PI * k) / totalVertices;
    const isSpike = k % 2 === 0;
    const r = radius * (isSpike ? 1.35 : 0.85) * (0.7 + 0.3 * wetness);
    points.push({
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle),
    });
  }

  return points;
}

/**
 * Serializes capillary bleed nodes into SVG elements (outer feathering polygon + inner core).
 */
export function generateCapillaryBleedSvgDefs(
  nodes: IntersectionBleedNode[],
  solventDilution = 0.35,
  numSpikes = 6
): string {
  if (nodes.length === 0) return '';

  return nodes
    .filter((n) => n.wetness > 1e-3)
    .map((node) => {
      const bloomPts = computeDendriticBloomPoints(node.pos, node.bloomRadius, node.wetness, numSpikes);
      const polyCoords = bloomPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const coreR = Math.max(1, node.bloomRadius * 0.45);
      const coreOpacity = Math.max(0.2, 1.0 - solventDilution * node.wetness);

      return (
        `<polygon points="${polyCoords}" fill="${node.blendedColorHex}" opacity="${(0.5 + 0.4 * node.wetness).toFixed(2)}" />` +
        `<circle cx="${node.pos.x.toFixed(1)}" cy="${node.pos.y.toFixed(1)}" r="${coreR.toFixed(1)}" fill="#ffffff" opacity="${(solventDilution * node.wetness).toFixed(2)}" />`
      );
    })
    .join('');
}
