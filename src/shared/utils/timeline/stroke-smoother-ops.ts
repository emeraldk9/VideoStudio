/**
 * High-performance 2D Stroke Decimation, Ramer-Douglas-Peucker (RDP) Simplification,
 * Sharp Corner Snapping & Dynamic Catmull-Rom Bézier Smoothing Engine.
 */

export type Point2D = [number, number];
export type TangentPoint2D = [number, number, number]; // [x, y, tangent_angle_rad]
export type CubicBezierSegment = [Point2D, Point2D, Point2D, Point2D]; // [b0, b1, b2, b3]

/**
 * Euclidean distance between two 2D points.
 */
export function pointDistance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}

/**
 * Calculate shortest perpendicular distance from a point to a line segment.
 */
export function perpendicularDistance(
  pt: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq <= 1e-9) {
    return pointDistance(pt, lineStart);
  }

  const t = Math.max(
    0.0,
    Math.min(
      1.0,
      ((pt[0] - lineStart[0]) * dx + (pt[1] - lineStart[1]) * dy) / segLenSq
    )
  );

  const projX = lineStart[0] + t * dx;
  const projY = lineStart[1] + t * dy;
  return pointDistance(pt, [projX, projY]);
}

/**
 * Detect sharp corner landmark indices along a polyline where turning angle exceeds threshold.
 * Prevents geometric features (90-deg angles, arrowheads, boxes) from being cut during decimation.
 */
export function detectCornerIndices(
  pts: Point2D[],
  step: number = 2,
  angleThresholdDeg: number = 55.0
): number[] {
  const n = pts.length;
  if (n <= 2 * step + 1) return [];

  const cosThreshold = Math.cos((angleThresholdDeg * Math.PI) / 180.0);
  const corners: number[] = [];

  for (let i = step; i < n - step; i++) {
    const pPrev = pts[i - step];
    const pCurr = pts[i];
    const pNext = pts[i + step];

    const v1x = pCurr[0] - pPrev[0];
    const v1y = pCurr[1] - pPrev[1];
    const v2x = pNext[0] - pCurr[0];
    const v2y = pNext[1] - pCurr[1];

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1e-4 || len2 < 1e-4) continue;

    const dot = Math.max(-1.0, Math.min(1.0, (v1x * v2x + v1y * v2y) / (len1 * len2)));

    // Turning angle: if dot <= cosThreshold (meaning angle >= angleThresholdDeg)
    if (dot <= cosThreshold) {
      if (corners.length === 0 || i - corners[corners.length - 1] > step) {
        corners.push(i);
      }
    }
  }

  return corners;
}

/**
 * Classic Ramer-Douglas-Peucker (RDP) polyline decimation.
 * Reduces redundant collinear points within tolerance epsilon.
 */
export function ramerDouglasPeucker(
  pts: Point2D[],
  epsilon: number = 1.2
): Point2D[] {
  if (pts.length <= 2) {
    return pts.map(p => [p[0], p[1]]);
  }

  let dMax = 0.0;
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
    const left = ramerDouglasPeucker(pts.slice(0, index + 1), epsilon);
    const right = ramerDouglasPeucker(pts.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [[pStart[0], pStart[1]], [pEnd[0], pEnd[1]]];
  }
}

/**
 * Corner-preserving stroke simplification.
 * Splits polyline at sharp corners, simplifies each piece via RDP, and re-stitches.
 */
export function simplifyStroke(
  pts: Point2D[],
  epsilon: number = 1.2,
  cornerAngleDeg: number = 55.0
): Point2D[] {
  if (pts.length <= 2) {
    return pts.map(p => [p[0], p[1]]);
  }

  const corners = detectCornerIndices(pts, 2, cornerAngleDeg);
  if (corners.length === 0) {
    return ramerDouglasPeucker(pts, epsilon);
  }

  const splitPoints = [0, ...corners, pts.length - 1];
  const simplified: Point2D[] = [];

  for (let k = 0; k < splitPoints.length - 1; k++) {
    const segStart = splitPoints[k];
    const segEnd = splitPoints[k + 1];
    const subPts = pts.slice(segStart, segEnd + 1);
    const subSimplified = ramerDouglasPeucker(subPts, epsilon);

    if (simplified.length === 0) {
      simplified.push(...subSimplified);
    } else {
      simplified.push(...subSimplified.slice(1));
    }
  }

  return simplified;
}

/**
 * Convert simplified polyline into continuous C^1 cubic Bézier segments using Catmull-Rom tangents.
 */
export function fitCatmullRomToBezier(pts: Point2D[]): CubicBezierSegment[] {
  const n = pts.length;
  if (n < 2) return [];

  if (n === 2) {
    const p0 = pts[0];
    const p1 = pts[1];
    const b1: Point2D = [p0[0] + (p1[0] - p0[0]) / 3.0, p0[1] + (p1[1] - p0[1]) / 3.0];
    const b2: Point2D = [p0[0] + 2.0 * (p1[0] - p0[0]) / 3.0, p0[1] + 2.0 * (p1[1] - p0[1]) / 3.0];
    return [[p0, b1, b2, p1]];
  }

  // Extend with ghost endpoints
  const pExt: Point2D[] = [
    [2.0 * pts[0][0] - pts[1][0], 2.0 * pts[0][1] - pts[1][1]],
    ...pts,
    [2.0 * pts[n - 1][0] - pts[n - 2][0], 2.0 * pts[n - 1][1] - pts[n - 2][1]]
  ];

  const bezierSegments: CubicBezierSegment[] = [];

  for (let i = 1; i < pExt.length - 2; i++) {
    const p0 = pExt[i - 1];
    const p1 = pExt[i];
    const p2 = pExt[i + 1];
    const p3 = pExt[i + 2];

    const b0 = p1;
    const b1: Point2D = [p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0];
    const b2: Point2D = [p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0];
    const b3 = p2;

    bezierSegments.push([b0, b1, b2, b3]);
  }

  return bezierSegments;
}

/**
 * Sample a cubic Bézier curve at parameter u in [0, 1].
 * Returns [x, y, tangent_angle_rad].
 */
export function sampleBezierSegment(
  b0: Point2D,
  b1: Point2D,
  b2: Point2D,
  b3: Point2D,
  u: number
): TangentPoint2D {
  const clampedU = Math.max(0.0, Math.min(1.0, u));
  const omu = 1.0 - clampedU;
  const omu2 = omu * omu;
  const omu3 = omu2 * omu;
  const u2 = clampedU * clampedU;
  const u3 = u2 * clampedU;

  // Position B(u)
  const x = omu3 * b0[0] + 3.0 * omu2 * clampedU * b1[0] + 3.0 * omu * u2 * b2[0] + u3 * b3[0];
  const y = omu3 * b0[1] + 3.0 * omu2 * clampedU * b1[1] + 3.0 * omu * u2 * b2[1] + u3 * b3[1];

  // Derivative B'(u)
  const c1 = 3.0 * omu2;
  const c2 = 6.0 * omu * clampedU;
  const c3 = 3.0 * u2;

  const dx = c1 * (b1[0] - b0[0]) + c2 * (b2[0] - b1[0]) + c3 * (b3[0] - b2[0]);
  const dy = c1 * (b1[1] - b0[1]) + c2 * (b2[1] - b1[1]) + c3 * (b3[1] - b2[1]);

  let tangentAngle = 0.0;
  if (Math.hypot(dx, dy) < 1e-6) {
    tangentAngle = Math.atan2(b3[1] - b0[1], b3[0] - b0[0]);
  } else {
    tangentAngle = Math.atan2(dy, dx);
  }

  return [x, y, tangentAngle];
}

/**
 * Resample an entire stroke into smooth, uniformly-spaced trajectory points with continuous tangent angles.
 */
export function sampleSmoothTrajectory(
  pts: Point2D[],
  stepDistance: number = 3.0,
  epsilon: number = 1.2,
  cornerAngleDeg: number = 55.0
): TangentPoint2D[] {
  const simplified = simplifyStroke(pts, epsilon, cornerAngleDeg);
  if (simplified.length < 2) {
    if (simplified.length === 1) {
      return [[simplified[0][0], simplified[0][1], 0.0]];
    }
    return [];
  }

  const segments = fitCatmullRomToBezier(simplified);
  const result: TangentPoint2D[] = [];

  for (const [b0, b1, b2, b3] of segments) {
    const chord = pointDistance(b0, b3);
    const hull = pointDistance(b0, b1) + pointDistance(b1, b2) + pointDistance(b2, b3);
    const estLen = (chord + hull) / 2.0;

    const samples = Math.max(2, Math.ceil(estLen / Math.max(0.5, stepDistance)));
    for (let s = 0; s < samples; s++) {
      if (result.length > 0 && s === 0) continue; // Skip redundant joint
      const u = s / (samples - 1);
      result.push(sampleBezierSegment(b0, b1, b2, b3, u));
    }
  }

  return result;
}
