/**
 * Whiteboard Smart Geometric Shape Recognition & Snap-to-Vector Primitive Operations.
 * Identifies wobbly hand-drawn strokes and regularizes them into crisp primitives:
 * 1. Straight Line with optional angle snapping (0°, 15°, 30°, 45°, 90°).
 * 2. Circle / Ellipse via centroid isoperimetric compactness.
 * 3. Rectangle / Quadrilateral via 4-corner orthogonalization.
 * 4. Triangle via 3-corner planar reduction.
 */

import type { Point2D } from './calligraphy-ops';

export type GeometricPrimitiveType = 'circle' | 'rectangle' | 'triangle' | 'line' | 'freehand';

export interface ShapeRecognitionSettings {
  enabled?: boolean;
  snapTolerance?: number; // 0.1..0.5, default 0.20
  angleSnap?: boolean; // default true
  morphDurationSec?: number; // 0.1..1.0, default 0.30
}

export interface RecognizedShape {
  shapeType: GeometricPrimitiveType;
  confidence: number;
  regularizedPoints: Point2D[];
  center: Point2D;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rotationDeg: number;
}

function dist(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

function pathLength(points: Point2D[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += dist(points[i], points[i + 1]);
  }
  return len;
}

function polygonArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) * 0.5;
}

function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return [...points];

  function perpDist(pt: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const norm = Math.hypot(dx, dy);
    if (norm < 1e-9) return dist(pt, lineStart);
    return Math.abs(dy * pt[0] - dx * pt[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]) / norm;
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = rdpSimplify(points.slice(0, index + 1), epsilon);
    const rec2 = rdpSimplify(points.slice(index), epsilon);
    return rec1.slice(0, -1).concat(rec2);
  }
  return [points[0], points[end]];
}

/**
 * Classifies raw stroke points into geometric primitives and returns regularized coordinates.
 */
export function recognizeGeometricShape(
  points: Point2D[],
  snapTolerance: number = 0.20,
  angleSnap: boolean = true,
  sampleCirclePts: number = 32,
): RecognizedShape {
  const n = points.length;
  if (n < 2) {
    const pt: Point2D = points[0] ?? [0, 0];
    return {
      shapeType: 'freehand',
      confidence: 1.0,
      regularizedPoints: [...points],
      center: pt,
      bounds: { minX: pt[0], minY: pt[1], maxX: pt[0], maxY: pt[1] },
      rotationDeg: 0,
    };
  }

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = { minX, minY, maxX, maxY };
  const center: Point2D = [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
  const totalLen = pathLength(points);

  if (totalLen < 10.0) {
    return {
      shapeType: 'freehand',
      confidence: 1.0,
      regularizedPoints: [...points],
      center,
      bounds,
      rotationDeg: 0,
    };
  }

  // 1. Straight Line Check
  const chord = dist(points[0], points[points.length - 1]);
  const chordRatio = chord / totalLen;
  if (chordRatio >= 0.92 - snapTolerance * 0.1) {
    const pStart = points[0];
    let pEnd = points[points.length - 1];
    const dx = pEnd[0] - pStart[0];
    const dy = pEnd[1] - pStart[1];
    let angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;

    if (angleSnap) {
      const snapAngles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
                          195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360];
      const closest = snapAngles.reduce((prev, curr) =>
        Math.abs(((curr - angleDeg + 180) % 360) - 180) < Math.abs(((prev - angleDeg + 180) % 360) - 180) ? curr : prev
      );
      if (Math.abs(((closest - angleDeg + 180) % 360) - 180) <= 8.0) {
        const rad = (closest * Math.PI) / 180;
        pEnd = [pStart[0] + chord * Math.cos(rad), pStart[1] + chord * Math.sin(rad)];
        angleDeg = closest % 360;
      }
    }

    return {
      shapeType: 'line',
      confidence: Math.min(1.0, chordRatio),
      regularizedPoints: [pStart, pEnd],
      center: [(pStart[0] + pEnd[0]) * 0.5, (pStart[1] + pEnd[1]) * 0.5],
      bounds: {
        minX: Math.min(pStart[0], pEnd[0]),
        minY: Math.min(pStart[1], pEnd[1]),
        maxX: Math.max(pStart[0], pEnd[0]),
        maxY: Math.max(pStart[1], pEnd[1]),
      },
      rotationDeg: angleDeg,
    };
  }

  // 2. Closed Shape Check
  const closureDist = dist(points[0], points[points.length - 1]);
  const isClosed = closureDist < totalLen * 0.25;

  if (isClosed) {
    const closedPts = [...points];
    if (closureDist > 1e-4) {
      closedPts.push(points[0]);
    }

    const area = polygonArea(closedPts);
    const perimeter = pathLength(closedPts);

    // Centroid
    const meanCx = closedPts.slice(0, -1).reduce((sum, p) => sum + p[0], 0) / (closedPts.length - 1);
    const meanCy = closedPts.slice(0, -1).reduce((sum, p) => sum + p[1], 0) / (closedPts.length - 1);
    const shapeCenter: Point2D = [meanCx, meanCy];

    // 2a. Corner Analysis via RDP
    const epsilon = Math.max(4.0, perimeter * 0.038);
    const simplified = rdpSimplify(closedPts, epsilon);
    const vertices = simplified.length >= 2 && dist(simplified[0], simplified[simplified.length - 1]) < 12.0
      ? simplified.slice(0, -1)
      : simplified;

    const numCorners = vertices.length;

    // Triangle: 3 corners
    if (numCorners === 3) {
      return {
        shapeType: 'triangle',
        confidence: 0.90,
        regularizedPoints: [...vertices, vertices[0]],
        center: shapeCenter,
        bounds,
        rotationDeg: 0,
      };
    }

    // Rectangle / Square: 4 corners
    if (numCorners === 4) {
      const rectPts: Point2D[] = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ];
      return {
        shapeType: 'rectangle',
        confidence: 0.88,
        regularizedPoints: rectPts,
        center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5],
        bounds,
        rotationDeg: 0,
      };
    }

    // 2b. Circularity for non-cornered loops
    const qCircle = (4.0 * Math.PI * area) / (perimeter * perimeter + 1e-9);
    const radii = closedPts.slice(0, -1).map((p) => dist(p, shapeCenter));
    const meanR = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    const stdR = Math.sqrt(radii.reduce((sum, r) => sum + (r - meanR) ** 2, 0) / radii.length);
    const cvR = stdR / (meanR + 1e-9);

    if (cvR < 0.22 + snapTolerance * 0.05 && qCircle > 0.65 - snapTolerance * 0.15) {
      const circlePts: Point2D[] = [];
      for (let i = 0; i < sampleCirclePts; i++) {
        const theta = (2.0 * Math.PI * i) / sampleCirclePts;
        circlePts.push([
          shapeCenter[0] + meanR * Math.cos(theta),
          shapeCenter[1] + meanR * Math.sin(theta),
        ]);
      }
      circlePts.push(circlePts[0]);
      return {
        shapeType: 'circle',
        confidence: Math.max(0.0, Math.min(1.0, 1.0 - cvR)),
        regularizedPoints: circlePts,
        center: shapeCenter,
        bounds: {
          minX: shapeCenter[0] - meanR,
          minY: shapeCenter[1] - meanR,
          maxX: shapeCenter[0] + meanR,
          maxY: shapeCenter[1] + meanR,
        },
        rotationDeg: 0,
      };
    }
  }

  return {
    shapeType: 'freehand',
    confidence: 0.50,
    regularizedPoints: [...points],
    center,
    bounds,
    rotationDeg: 0,
  };
}

/**
 * Converts regularized points into SVG `<path d="..." />` syntax.
 */
export function generateRegularizedShapeSvgPath(shape: RecognizedShape): string {
  const pts = shape.regularizedPoints;
  if (!pts || pts.length === 0) return '';
  const d = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
  for (let i = 1; i < pts.length; i++) {
    d.push(`L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`);
  }
  if (shape.shapeType !== 'line' && shape.shapeType !== 'freehand') {
    d.push('Z');
  }
  return d.join(' ');
}
