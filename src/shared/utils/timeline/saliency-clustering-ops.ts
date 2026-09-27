/**
 * High-performance Intelligent Multi-Path Saliency Clustering & Contour Prioritization Operations.
 * Partitions discrete strokes into cohesive visual entities and determines
 * human-like hierarchical drawing order (primary landmarks/silhouettes -> component details).
 */

import type { Point2D } from './calligraphy-ops';

export type BBox2D = [number, number, number, number]; // [minX, minY, maxX, maxY]

export interface ClusteringOptions {
  maxDistance?: number;
  frameW?: number;
  frameH?: number;
}

/**
 * Calculate cumulative Euclidean arc length of a stroke.
 */
export function strokeLength(stroke: Point2D[]): number {
  if (stroke.length < 2) return 0.0;
  let total = 0.0;
  for (let i = 0; i < stroke.length - 1; i++) {
    total += Math.hypot(stroke[i + 1][0] - stroke[i][0], stroke[i + 1][1] - stroke[i][1]);
  }
  return total;
}

/**
 * Calculate axis-aligned bounding box of a stroke.
 */
export function strokeBBox(stroke: Point2D[]): BBox2D {
  if (!stroke || stroke.length === 0) {
    return [0.0, 0.0, 0.0, 0.0];
  }
  let minX = stroke[0][0];
  let minY = stroke[0][1];
  let maxX = stroke[0][0];
  let maxY = stroke[0][1];

  for (let i = 1; i < stroke.length; i++) {
    const x = stroke[i][0];
    const y = stroke[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Calculate minimum Euclidean distance between two bounding boxes.
 */
export function bboxDistance(b1: BBox2D, b2: BBox2D): number {
  const dx = Math.max(0.0, Math.max(b1[0] - b2[2], b2[0] - b1[2]));
  const dy = Math.max(0.0, Math.max(b1[1] - b2[3], b2[1] - b1[3]));
  return Math.hypot(dx, dy);
}

/**
 * Calculate minimum distance between two stroke paths with bounding-box early pruning.
 */
export function strokeMinDistance(
  s1: Point2D[],
  s2: Point2D[],
  threshold: number = 50.0
): number {
  const b1 = strokeBBox(s1);
  const b2 = strokeBBox(s2);
  const bDist = bboxDistance(b1, b2);
  if (bDist > threshold) {
    return bDist;
  }

  const step1 = Math.max(1, Math.floor(s1.length / 12));
  const step2 = Math.max(1, Math.floor(s2.length / 12));

  let minD = Infinity;
  for (let i = 0; i < s1.length; i += step1) {
    const p1 = s1[i];
    for (let j = 0; j < s2.length; j += step2) {
      const p2 = s2[j];
      const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      if (d < minD) {
        minD = d;
        if (minD <= 1.0) {
          return minD;
        }
      }
    }
  }

  return minD;
}

/**
 * Group strokes into connected visual components based on spatial proximity.
 * Returns a list of cluster index lists, e.g. [[0, 1, 2], [3, 4], [5]].
 */
export function clusterStrokes(
  strokes: Point2D[][],
  maxDistance: number = 40.0
): number[][] {
  const n = strokes.length;
  if (n === 0) return [];

  // Build adjacency list
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = strokeMinDistance(strokes[i], strokes[j], maxDistance);
      if (dist <= maxDistance) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // Connected components search (BFS)
  const visited = new Set<number>();
  const clusters: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;

    const cluster: number[] = [];
    const queue: number[] = [i];
    visited.add(i);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      cluster.push(curr);
      for (const neighbor of adj[curr]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Evaluate visual prominence / saliency score for each stroke in [0.0, 1.0].
 * Prioritizes large outer contours and visually central landmarks.
 */
export function computeStrokeSaliency(
  strokes: Point2D[][],
  frameW: number = 1920.0,
  frameH: number = 1080.0
): number[] {
  const n = strokes.length;
  if (n === 0) return [];

  const lengths = strokes.map(strokeLength);
  const maxLen = Math.max(1e-4, ...lengths);

  const cxFrame = frameW * 0.5;
  const cyFrame = frameH * 0.5;
  const maxDistCenter = Math.hypot(cxFrame, cyFrame);

  const scores: number[] = [];

  for (let i = 0; i < n; i++) {
    const bbox = strokeBBox(strokes[i]);
    const bw = bbox[2] - bbox[0];
    const bh = bbox[3] - bbox[1];
    const area = bw * bh;
    const maxArea = frameW * frameH * 0.25;
    const areaScore = Math.min(1.0, area / maxArea);

    const lenScore = Math.min(1.0, lengths[i] / maxLen);

    // Distance to frame center
    const sCx = (bbox[0] + bbox[2]) * 0.5;
    const sCy = (bbox[1] + bbox[3]) * 0.5;
    const centDist = Math.hypot(sCx - cxFrame, sCy - cyFrame);
    const centScore = Math.max(0.0, 1.0 - centDist / maxDistCenter);

    // Composite saliency: length 50%, area 35%, central bias 15%
    const score = 0.5 * lenScore + 0.35 * areaScore + 0.15 * centScore;
    scores.push(score);
  }

  return scores;
}

/**
 * Compute optimal drawing sequence:
 * 1. Clusters strokes into spatial visual assemblies.
 * 2. Ranks assemblies by focal saliency.
 * 3. Orders strokes within each assembly with outline-first greedy chaining.
 */
export function hierarchicalSaliencySort(
  strokes: Point2D[][],
  options: ClusteringOptions = {}
): number[] {
  const n = strokes.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);

  const maxDistance = options.maxDistance ?? 40.0;
  const frameW = options.frameW ?? 1920.0;
  const frameH = options.frameH ?? 1080.0;

  const saliency = computeStrokeSaliency(strokes, frameW, frameH);
  const clusters = clusterStrokes(strokes, maxDistance);

  // Score each cluster by its peak saliency + cluster mass
  const clusterScores: Array<{ score: number; indices: number[] }> = [];
  for (const c of clusters) {
    let peak = -Infinity;
    let sum = 0;
    for (const idx of c) {
      const s = saliency[idx];
      if (s > peak) peak = s;
      sum += s;
    }
    const avg = sum / c.length;
    const score = peak * 0.7 + avg * 0.3;
    clusterScores.push({ score, indices: c });
  }

  // Sort clusters descending by prominence
  clusterScores.sort((a, b) => b.score - a.score);

  const orderedIndices: number[] = [];

  for (const { indices: cIndices } of clusterScores) {
    const remaining = new Set(cIndices);

    // Start with highest-saliency stroke in cluster (primary contour)
    let firstIdx = -1;
    let maxS = -Infinity;
    for (const idx of remaining) {
      if (saliency[idx] > maxS) {
        maxS = saliency[idx];
        firstIdx = idx;
      }
    }

    orderedIndices.push(firstIdx);
    remaining.delete(firstIdx);

    // Greedy nearest neighbor chaining for remaining strokes in this cluster
    let currTip = strokes[firstIdx][strokes[firstIdx].length - 1];

    while (remaining.size > 0) {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (const candidate of remaining) {
        const candStroke = strokes[candidate];
        const candStart = candStroke[0];
        const candEnd = candStroke[candStroke.length - 1];

        // Distance to either end
        const d = Math.min(
          Math.hypot(currTip[0] - candStart[0], currTip[1] - candStart[1]),
          Math.hypot(currTip[0] - candEnd[0], currTip[1] - candEnd[1])
        );

        // Bias slightly by saliency so major strokes inside cluster precede minor details
        const weightedD = d / (0.5 + 0.5 * saliency[candidate]);
        if (weightedD < bestDist) {
          bestDist = weightedD;
          bestIdx = candidate;
        }
      }

      orderedIndices.push(bestIdx);
      remaining.delete(bestIdx);
      currTip = strokes[bestIdx][strokes[bestIdx].length - 1];
    }
  }

  return orderedIndices;
}

/**
 * Reorder strokes array directly using hierarchical saliency sorting.
 */
export function reorderStrokesBySaliency(
  strokes: Point2D[][],
  options: ClusteringOptions = {}
): Point2D[][] {
  const order = hierarchicalSaliencySort(strokes, options);
  return order.map((idx) => strokes[idx]);
}
