/**
 * High-performance 2D Vector Path Morphing & Intermediate Shape Tweening Operations.
 * Provides arc-length normalization, optimal vertex phase alignment, and wavefront pen tracking.
 */

export type Point2D = [number, number];
export type MorphPenTip = [number, number, number]; // [x, y, angle_rad]

export interface MorphFrameResult {
  interpolatedStrokes: Point2D[][];
  penTip: MorphPenTip;
}

export interface WhiteboardMorphSettings {
  enabled?: boolean;
  easing?: 'linear' | 'ease-in-out' | 'elastic';
  morphDurationSeconds?: number;
}

/**
 * Calculate total arc-length of a 2D polyline.
 */
export function pathLength(pts: Point2D[]): number {
  if (pts.length < 2) return 0.0;
  let total = 0.0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return total;
}

/**
 * Resample polyline to exactly `targetCount` equidistant arc-length vertices.
 */
export function resamplePathUniform(pts: Point2D[], targetCount: number = 100): Point2D[] {
  if (pts.length <= 1) {
    const pt: Point2D = pts.length === 1 ? [pts[0][0], pts[0][1]] : [0, 0];
    return Array.from({ length: targetCount }, () => [pt[0], pt[1]]);
  }

  const totalLen = pathLength(pts);
  if (totalLen <= 1e-6) {
    return Array.from({ length: targetCount }, () => [pts[0][0], pts[0][1]]);
  }

  const cumDist: number[] = [0.0];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    cumDist.push(cumDist[cumDist.length - 1] + seg);
  }

  const step = totalLen / Math.max(1, targetCount - 1);
  const resampled: Point2D[] = [];
  let segIdx = 0;

  for (let i = 0; i < targetCount; i++) {
    const targetD = i * step;
    while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetD) {
      segIdx++;
    }

    const d0 = cumDist[segIdx];
    const d1 = cumDist[segIdx + 1];
    const span = Math.max(1e-6, d1 - d0);
    const frac = Math.max(0.0, Math.min(1.0, (targetD - d0) / span));

    const p0 = pts[segIdx];
    const p1 = pts[segIdx + 1];
    const x = p0[0] + frac * (p1[0] - p0[0]);
    const y = p0[1] + frac * (p1[1] - p0[1]);
    resampled.push([x, y]);
  }

  return resampled;
}

/**
 * Align path orientation to minimize vertex displacement during morphing.
 * Prevents crossing and twisting when moving between different shape drawing directions.
 */
export function alignPathOrientation(
  p1: Point2D[],
  p2: Point2D[],
  isClosed: boolean = false
): Point2D[] {
  const n = p1.length;
  if (p2.length !== n || n <= 1) {
    return p2.map((p) => [p[0], p[1]]);
  }

  if (!isClosed) {
    let distDirect = 0.0;
    let distRev = 0.0;
    for (let i = 0; i < n; i++) {
      distDirect += (p1[i][0] - p2[i][0]) ** 2 + (p1[i][1] - p2[i][1]) ** 2;
      distRev += (p1[i][0] - p2[n - 1 - i][0]) ** 2 + (p1[i][1] - p2[n - 1 - i][1]) ** 2;
    }
    return distRev < distDirect ? [...p2].reverse() : p2.map((p) => [p[0], p[1]]);
  }

  // Closed loop: check circular shifts
  let bestShift = 0;
  let bestDist = Infinity;
  let bestRev = false;

  for (const rev of [false, true]) {
    const candidate = rev ? [...p2].reverse() : p2;
    const stride = Math.max(1, Math.floor(n / 30));
    for (let shift = 0; shift < n; shift += stride) {
      let d = 0.0;
      for (let i = 0; i < n; i++) {
        const cPt = candidate[(i + shift) % n];
        d += (p1[i][0] - cPt[0]) ** 2 + (p1[i][1] - cPt[1]) ** 2;
      }
      if (d < bestDist) {
        bestDist = d;
        bestShift = shift;
        bestRev = rev;
      }
    }
  }

  const chosen = bestRev ? [...p2].reverse() : p2;
  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    result.push(chosen[(i + bestShift) % n]);
  }
  return result;
}

/**
 * Linearly interpolate corresponding points between two normalized paths.
 */
export function interpolatePaths(p1: Point2D[], p2: Point2D[], t: number): Point2D[] {
  const n = Math.min(p1.length, p2.length);
  const inv = 1.0 - t;
  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    result.push([inv * p1[i][0] + t * p2[i][0], inv * p1[i][1] + t * p2[i][1]]);
  }
  return result;
}

export function easeInOutQuad(t: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, t));
  if (clamped < 0.5) {
    return 2.0 * clamped * clamped;
  }
  return 1.0 - Math.pow(-2.0 * clamped + 2.0, 2) / 2.0;
}

/**
 * Compute the complete intermediate morph frame between two stroke sets at normalized progress [0, 1].
 */
export function computeMorphFrame(
  strokesA: Point2D[][],
  strokesB: Point2D[][],
  progress: number,
  sampleCount: number = 80
): MorphFrameResult {
  const numPairs = Math.max(strokesA.length, strokesB.length);
  if (numPairs === 0) {
    return { interpolatedStrokes: [], penTip: [0, 0, 0] };
  }

  const easedT = easeInOutQuad(progress);
  const interpolated: Point2D[][] = [];

  for (let i = 0; i < numPairs; i++) {
    let sA = strokesA[i];
    let sB = strokesB[i];

    if (!sA) {
      const cx = sB.reduce((sum, p) => sum + p[0], 0) / Math.max(1, sB.length);
      const cy = sB.reduce((sum, p) => sum + p[1], 0) / Math.max(1, sB.length);
      sA = [[cx, cy], [cx, cy]];
    }

    if (!sB) {
      const cx = sA.reduce((sum, p) => sum + p[0], 0) / Math.max(1, sA.length);
      const cy = sA.reduce((sum, p) => sum + p[1], 0) / Math.max(1, sA.length);
      sB = [[cx, cy], [cx, cy]];
    }

    const normA = resamplePathUniform(sA, sampleCount);
    const normB = resamplePathUniform(sB, sampleCount);
    const alignedB = alignPathOrientation(normA, normB, false);
    interpolated.push(interpolatePaths(normA, alignedB, easedT));
  }

  // Pen tip follows the active morph wavefront on primary stroke
  let tipX = 0;
  let tipY = 0;
  let angle = 0;

  if (interpolated.length > 0 && interpolated[0].length > 0) {
    const lead = interpolated[0];
    const waveIdx = Math.min(lead.length - 1, Math.round(easedT * (lead.length - 1)));
    tipX = lead[waveIdx][0];
    tipY = lead[waveIdx][1];

    if (waveIdx < lead.length - 1) {
      const nextPt = lead[waveIdx + 1];
      angle = Math.atan2(nextPt[1] - tipY, nextPt[0] - tipX);
    } else if (waveIdx > 0) {
      const prevPt = lead[waveIdx - 1];
      angle = Math.atan2(tipY - prevPt[1], tipX - prevPt[0]);
    }
  }

  return {
    interpolatedStrokes: interpolated,
    penTip: [tipX, tipY, angle],
  };
}
