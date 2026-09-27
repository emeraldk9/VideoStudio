/**
 * Whiteboard Felt-Tip Marker Nib Splay & Directional Fiber Compression Dynamics Operations.
 *
 * Models physical polymer fiber compression and friction drag deflection:
 * 1. Non-linear Hookean spring response with hyperbolic tangent saturation plateau.
 * 2. Asymmetrical contact footprint deflection: friction drags the nib tip backward relative to velocity.
 * 3. Velocity-aligned lateral mushrooming: stroke width widens perpendicular to motion while thinning at sharp corners.
 * 4. 2D splayed ribbon mesh generation and SVG serialization.
 */

export interface NibSplaySettings {
  enabled?: boolean;
  splayGain?: number;        // 0.2..2.5, default 1.2
  fiberStiffness?: number;   // 0.1..0.95, default 0.65
  dragDeflection?: number;   // 0.0..1.0, default 0.40
}

export const DEFAULT_NIB_SPLAY_SETTINGS: Required<NibSplaySettings> = {
  enabled: false,
  splayGain: 1.2,
  fiberStiffness: 0.65,
  dragDeflection: 0.40,
};

export interface SplayPoint2D {
  x: number;
  y: number;
}

export interface SplayRibbonQuad {
  v0: SplayPoint2D; // left start
  v1: SplayPoint2D; // right start
  v2: SplayPoint2D; // right end
  v3: SplayPoint2D; // left end
  deflectedCenter: SplayPoint2D;
  effectiveWidth: number;
}

export interface SplayRibbonMesh {
  quads: SplayRibbonQuad[];
  totalLength: number;
}

/**
 * Computes non-linear fiber compression splay width using hyperbolic tangent response.
 */
export function computeSplayWidth(
  baseWidth: number,
  pressure: number,
  splayGain = 1.2,
  fiberStiffness = 0.65
): number {
  const p = Math.max(0.0, Math.min(1.0, pressure));
  const effStiffness = Math.max(0.05, Math.min(0.95, fiberStiffness));
  const compressionRate = 2.8 * (1.0 - effStiffness);
  const splayFactor = 1.0 + splayGain * Math.tanh(compressionRate * p);
  return Math.max(1.0, Math.min(baseWidth * 3.5, baseWidth * splayFactor));
}

/**
 * Calculates backward displacement of the nib contact center due to friction drag.
 */
export function computeNibDeflection(
  point: SplayPoint2D,
  velocityUnit: SplayPoint2D,
  pressure: number,
  dragDeflection = 0.40,
  baseWidth = 6.0
): SplayPoint2D {
  const p = Math.max(0.0, Math.min(1.0, pressure));
  const deflectionMag = dragDeflection * p * baseWidth * 0.5;
  return {
    x: point.x - velocityUnit.x * deflectionMag,
    y: point.y - velocityUnit.y * deflectionMag,
  };
}

/**
 * Generates 2D splayed ribbon mesh along stroke points.
 */
export function generateSplayRibbonMesh(
  points: Array<{ x: number; y: number; pressure?: number }>,
  baseWidth = 6.0,
  splayGain = 1.2,
  fiberStiffness = 0.65,
  dragDeflection = 0.40
): SplayRibbonMesh {
  if (points.length < 2) {
    return { quads: [], totalLength: 0 };
  }

  const n = points.length;
  const velocities: SplayPoint2D[] = [];
  const normals: SplayPoint2D[] = [];
  let totalLength = 0;

  for (let i = 0; i < n; i++) {
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = points[1].x - points[0].x;
      dy = points[1].y - points[0].y;
    } else if (i === n - 1) {
      dx = points[i].x - points[i - 1].x;
      dy = points[i].y - points[i - 1].y;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dy = points[i + 1].y - points[i - 1].y;
    }

    const mag = Math.hypot(dx, dy);
    if (i > 0) {
      const stepD = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      totalLength += stepD;
    }

    if (mag > 1e-6) {
      velocities.push({ x: dx / mag, y: dy / mag });
      normals.push({ x: -dy / mag, y: dx / mag });
    } else {
      velocities.push({ x: 1.0, y: 0.0 });
      normals.push({ x: 0.0, y: 1.0 });
    }
  }

  const deflectedCenters: SplayPoint2D[] = [];
  const effectiveWidths: number[] = [];

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const p = pt.pressure !== undefined ? pt.pressure : 0.65;
    const vUnit = velocities[i];

    const center = computeNibDeflection(pt, vUnit, p, dragDeflection, baseWidth);
    const w = computeSplayWidth(baseWidth, p, splayGain, fiberStiffness);

    deflectedCenters.push(center);
    effectiveWidths.push(w);
  }

  const quads: SplayRibbonQuad[] = [];
  for (let i = 0; i < n - 1; i++) {
    const c0 = deflectedCenters[i];
    const c1 = deflectedCenters[i + 1];
    const n0 = normals[i];
    const n1 = normals[i + 1];
    const halfW0 = effectiveWidths[i] * 0.5;
    const halfW1 = effectiveWidths[i + 1] * 0.5;

    quads.push({
      v0: { x: c0.x - n0.x * halfW0, y: c0.y - n0.y * halfW0 },
      v1: { x: c0.x + n0.x * halfW0, y: c0.y + n0.y * halfW0 },
      v2: { x: c1.x + n1.x * halfW1, y: c1.y + n1.y * halfW1 },
      v3: { x: c1.x - n1.x * halfW1, y: c1.y - n1.y * halfW1 },
      deflectedCenter: c0,
      effectiveWidth: effectiveWidths[i],
    });
  }

  return { quads, totalLength };
}

/**
 * Serializes splay ribbon mesh into continuous SVG path description string.
 */
export function generateSplayRibbonSvgPath(mesh: SplayRibbonMesh): string {
  if (mesh.quads.length === 0) return '';
  return mesh.quads
    .map(
      (q) =>
        `M ${q.v0.x.toFixed(1)} ${q.v0.y.toFixed(1)} ` +
        `L ${q.v1.x.toFixed(1)} ${q.v1.y.toFixed(1)} ` +
        `L ${q.v2.x.toFixed(1)} ${q.v2.y.toFixed(1)} ` +
        `L ${q.v3.x.toFixed(1)} ${q.v3.y.toFixed(1)} Z`
    )
    .join(' ');
}
