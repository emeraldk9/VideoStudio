/**
 * Whiteboard AI Bitmap Vectorization & Contour Auto-Trace Engine.
 * Converts raster sketches, logos, and line-art into clean, resolution-independent
 * vector polylines with topological hierarchy classification and RDP decimation.
 */

import type { Point2D } from './calligraphy-ops';

export interface AutoTraceSettings {
  enabled?: boolean;
  threshold?: number; // 0..255 (0 = auto-Otsu)
  minPathLength?: number; // min arc length in px (default 15)
  cornerTolerance?: number; // RDP tolerance epsilon (default 1.2)
}

export interface VectorContourPath {
  points: Point2D[];
  isClosed: boolean;
  length: number;
  isHole: boolean;
  hierarchyLevel: number;
}

export interface VectorizedArtPackage {
  width: number;
  height: number;
  paths: VectorContourPath[];
}

/**
 * Calculates the optimal binarization threshold for a grayscale image using Otsu's method.
 */
export function computeOtsuThreshold(grayPixels: Uint8Array | number[]): number {
  const total = grayPixels.length;
  if (total === 0) return 128;

  const histogram = new Array(256).fill(0);
  for (let i = 0; i < total; i++) {
    const val = Math.max(0, Math.min(255, Math.floor(grayPixels[i])));
    histogram[val]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let tMin = 128;
  let tMax = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > varMax) {
      varMax = between;
      tMin = t;
      tMax = t;
    } else if (between === varMax && varMax > 0) {
      tMax = t;
    }
  }

  return Math.round((tMin + tMax) / 2);
}

/**
 * Binarizes a grayscale image.
 * If invert is true, pixels darker than threshold become 1 (foreground strokes),
 * while light background pixels become 0.
 */
export function binarizeBitmap(
  grayPixels: Uint8Array | number[],
  threshold: number = 0,
  invert: boolean = true
): Uint8Array {
  const t = threshold <= 0 ? computeOtsuThreshold(grayPixels) : threshold;
  const binary = new Uint8Array(grayPixels.length);
  for (let i = 0; i < grayPixels.length; i++) {
    const val = grayPixels[i];
    if (invert) {
      binary[i] = val < t ? 1 : 0;
    } else {
      binary[i] = val >= t ? 1 : 0;
    }
  }
  return binary;
}

/**
 * Computes the arc length of a sequence of 2D points.
 */
export function calculatePolylineLength(points: Point2D[], isClosed: boolean = false): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  if (isClosed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    if (last[0] !== first[0] || last[1] !== first[1]) {
      length += Math.hypot(first[0] - last[0], first[1] - last[1]);
    }
  }
  return length;
}

/**
 * Perpendicular distance from a point to a 2D line segment.
 */
function perpendicularDistance(p: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq <= 1e-9) {
    return Math.hypot(p[0] - p1[0], p[1] - p1[1]);
  }

  const t = Math.max(0, Math.min(1, ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / segLenSq));
  const projX = p1[0] + t * dx;
  const projY = p1[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

/**
 * Classic Ramer-Douglas-Peucker (RDP) polyline decimation.
 */
export function simplifyContourRdp(pts: Point2D[], epsilon: number = 1.2): Point2D[] {
  if (pts.length <= 2 || epsilon <= 0) {
    return pts.map((p) => [p[0], p[1]]);
  }

  let dMax = 0;
  let index = 0;
  const pStart = pts[0];
  const pEnd = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], pStart, pEnd);
    if (d > dMax) {
      dMax = d;
      index = i;
    }
  }

  if (dMax > epsilon) {
    const left = simplifyContourRdp(pts.slice(0, index + 1), epsilon);
    const right = simplifyContourRdp(pts.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [
      [pStart[0], pStart[1]],
      [pEnd[0], pEnd[1]],
    ];
  }
}

/**
 * Determines whether a test point is strictly inside a closed polygon (Ray-Casting algorithm).
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  const [px, py] = point;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// 8-connected clockwise neighborhood offsets: N, NE, E, SE, S, SW, W, NW
const NEIGHBORS_8: [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/**
 * Traces closed contours from a 2D binary image using Moore-Neighbor boundary tracing.
 */
export function traceBitmapContours(
  binary: Uint8Array,
  width: number,
  height: number
): Point2D[][] {
  const contours: Point2D[][] = [];
  const visitedEdge = new Set<string>();

  const getPixel = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return binary[y * width + x];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getPixel(x, y) === 1) {
        // Check if this pixel borders a background pixel (4-connected)
        for (let d = 0; d < 8; d += 2) {
          const nx = x + NEIGHBORS_8[d][0];
          const ny = y + NEIGHBORS_8[d][1];
          if (getPixel(nx, ny) === 0) {
            const edgeKey = `${x},${y}->${d}`;
            if (!visitedEdge.has(edgeKey)) {
              // Trace contour starting here
              const contour = traceSingleContour(x, y, d, getPixel, visitedEdge);
              if (contour.length >= 3) {
                contours.push(contour);
              }
            }
          }
        }
      }
    }
  }

  return contours;
}

function traceSingleContour(
  startX: number,
  startY: number,
  initialBgDir: number,
  getPixel: (x: number, y: number) => number,
  visitedEdge: Set<string>
): Point2D[] {
  const points: Point2D[] = [[startX, startY]];
  let currX = startX;
  let currY = startY;
  let dir = initialBgDir;
  const maxSteps = 20000;

  for (let step = 0; step < maxSteps; step++) {
    visitedEdge.add(`${currX},${currY}->${dir}`);
    let nextX = currX;
    let nextY = currY;
    let found = false;
    let nextDir = 0;

    // Scan clockwise from dir
    for (let i = 0; i < 8; i++) {
      const checkDir = (dir + i) % 8;
      const tx = currX + NEIGHBORS_8[checkDir][0];
      const ty = currY + NEIGHBORS_8[checkDir][1];
      if (getPixel(tx, ty) === 1) {
        nextX = tx;
        nextY = ty;
        found = true;
        // The backtracking direction for next step is 2 steps counter-clockwise from arrival
        nextDir = (checkDir + 5) % 8;
        break;
      }
    }

    if (!found) break;

    if (nextX === startX && nextY === startY && step > 0) {
      // Loop closed
      points.push([startX, startY]);
      break;
    }

    points.push([nextX, nextY]);
    currX = nextX;
    currY = nextY;
    dir = nextDir;
  }

  return points;
}

/**
 * End-to-end vectorization of a grayscale raster image into simplified, hierarchical vector paths.
 */
export function vectorizeBitmap(
  grayPixels: Uint8Array | number[],
  width: number,
  height: number,
  options: AutoTraceSettings = {}
): VectorizedArtPackage {
  const threshold = options.threshold ?? 0;
  const minPathLength = options.minPathLength ?? 15.0;
  const cornerTolerance = options.cornerTolerance ?? 1.2;

  // 1. Binarize
  const binary = binarizeBitmap(grayPixels, threshold, true);

  // 2. Trace raw pixel contours
  const rawContours = traceBitmapContours(binary, width, height);

  // 3. Simplify via RDP and prune tiny artifacts
  const rawSimplified: { pts: Point2D[]; length: number }[] = [];
  for (const cnt of rawContours) {
    const len = calculatePolylineLength(cnt, true);
    if (len < minPathLength) continue;

    const simplified = simplifyContourRdp(cnt, cornerTolerance);
    if (simplified.length < 3) continue;

    // Ensure strictly closed loop
    if (
      simplified[0][0] !== simplified[simplified.length - 1][0] ||
      simplified[0][1] !== simplified[simplified.length - 1][1]
    ) {
      simplified.push([simplified[0][0], simplified[0][1]]);
    }

    rawSimplified.push({ pts: simplified, length: len });
  }

  // 4. Classify topological hierarchy (outer contour vs hole)
  const paths: VectorContourPath[] = [];

  for (let i = 0; i < rawSimplified.length; i++) {
    const current = rawSimplified[i];
    const testPt = current.pts[0];
    let enclosingCount = 0;

    for (let j = 0; j < rawSimplified.length; j++) {
      if (i === j) continue;
      if (isPointInPolygon(testPt, rawSimplified[j].pts)) {
        enclosingCount++;
      }
    }

    const isHole = enclosingCount % 2 === 1;

    paths.push({
      points: current.pts,
      isClosed: true,
      length: current.length,
      isHole,
      hierarchyLevel: enclosingCount,
    });
  }

  return {
    width,
    height,
    paths,
  };
}

/**
 * Serializes a VectorizedArtPackage into valid, standard SVG markup.
 */
export function generateSvgFromVectorizedArt(art: VectorizedArtPackage): string {
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.width} ${art.height}" width="${art.width}" height="${art.height}">`,
  ];

  for (const p of art.paths) {
    if (p.points.length === 0) continue;
    const dParts = [`M ${p.points[0][0].toFixed(2)} ${p.points[0][1].toFixed(2)}`];
    for (let i = 1; i < p.points.length; i++) {
      dParts.push(`L ${p.points[i][0].toFixed(2)} ${p.points[i][1].toFixed(2)}`);
    }
    if (p.isClosed) {
      dParts.push('Z');
    }
    const d = dParts.join(' ');
    const strokeColor = p.isHole ? '#666666' : '#333333';
    lines.push(`  <path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="2" />`);
  }

  lines.push('</svg>');
  return lines.join('\n');
}
