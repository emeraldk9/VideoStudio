/**
 * High-performance 2D Procedural Cross-Hatching & Graphite Shading Operations.
 * Generates angled scanlines clipped to arbitrary 2D polygons with continuous serpentine chaining.
 */

export type Point2D = [number, number];
export type LineSegment = [Point2D, Point2D];

export interface HatchSettings {
  angleDeg?: number;
  spacingPx?: number;
  crossHatch?: boolean;
}

/**
 * Rotate a 2D point around the origin [0, 0] by angleRad.
 */
export function rotatePoint(pt: Point2D, angleRad: number): Point2D {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return [pt[0] * cosA - pt[1] * sinA, pt[0] * sinA + pt[1] * cosA];
}

/**
 * Generate parallel scanline segments clipped inside a 2D polygon at angleDeg.
 */
export function generateSinglePassHatch(
  polygon: Point2D[],
  angleDeg: number = 45.0,
  spacingPx: number = 12.0
): LineSegment[] {
  const n = polygon.length;
  if (n < 3) return [];

  const rad = (angleDeg * Math.PI) / 180.0;
  // Rotate polygon by -rad so scanlines become horizontal
  const rotPoly = polygon.map((p) => rotatePoint(p, -rad));

  const yVals = rotPoly.map((p) => p[1]);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);

  const step = Math.max(2.0, spacingPx);
  let curY = minY + step * 0.5;
  const rawSegments: LineSegment[] = [];

  while (curY < maxY) {
    const intersections: number[] = [];
    for (let i = 0; i < n; i++) {
      const p1 = rotPoly[i];
      const p2 = rotPoly[(i + 1) % n];

      // Scanline intersects edge (p1, p2)
      if ((p1[1] <= curY && curY < p2[1]) || (p2[1] <= curY && curY < p1[1])) {
        const t = (curY - p1[1]) / (p2[1] - p1[1]);
        const ix = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(ix);
      }
    }

    intersections.sort((a, b) => a - b);

    // Pair up intersections
    for (let k = 0; k < intersections.length - 1; k += 2) {
      const xStart = intersections[k];
      const xEnd = intersections[k + 1];
      if (xEnd - xStart > 0.5) {
        // Rotate back by +rad
        const pStart = rotatePoint([xStart, curY], rad);
        const pEnd = rotatePoint([xEnd, curY], rad);
        rawSegments.push([pStart, pEnd]);
      }
    }

    curY += step;
  }

  return rawSegments;
}

/**
 * Chain individual hatch line segments into a continuous serpentine path,
 * alternating forward and backward directions to simulate human wrist shading.
 */
export function chainSerpentineStrokes(segments: LineSegment[]): Point2D[] {
  if (segments.length === 0) return [];

  const chained: Point2D[] = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const [pStart, pEnd] = segments[idx];
    if (idx % 2 === 0) {
      chained.push(pStart, pEnd);
    } else {
      chained.push(pEnd, pStart);
    }
  }

  return chained;
}

/**
 * Generate full hatched stroke paths inside a polygon.
 * If crossHatch is true, generates a secondary intersecting pass rotated by 90 degrees.
 */
export function generateHatchStrokes(
  polygon: Point2D[],
  angleDeg: number = 45.0,
  spacingPx: number = 12.0,
  crossHatch: boolean = false
): Point2D[][] {
  const passes = [angleDeg];
  if (crossHatch) {
    passes.push(angleDeg + 90.0);
  }

  const allStrokes: Point2D[][] = [];
  for (const ang of passes) {
    const segs = generateSinglePassHatch(polygon, ang, spacingPx);
    const chained = chainSerpentineStrokes(segs);
    if (chained.length >= 2) {
      allStrokes.push(chained);
    }
  }

  return allStrokes;
}
