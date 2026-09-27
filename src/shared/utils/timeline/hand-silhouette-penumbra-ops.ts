/**
 * Whiteboard Hand Shadow Soft-Penumbra Contact Ambient Occlusion with Hand Geometry Silhouette Tracing.
 * Simulates realistic perspective shadow projection for presenter hand sprites:
 * 1. Silhouette Contour Extraction: Vectorizes outer boundary contour of the custom hand sprite.
 * 2. 3D Ray Perspective Projection: Computes light ray intersections from 3D light source (Lx, Ly, Lz)
 *    through 3D hand elevation profile (tip z ~0mm -> wrist z ~65mm) onto whiteboard plane (z=0).
 * 3. Graduated Penumbra Diffusion: Optical blur radius scales with elevation (razor-sharp contact umbra
 *    at stylus nib, wide diffuse penumbra along forearm).
 * 4. Contact Ambient Occlusion: Micro-shadow directly beneath the pen tip that dissipates when lifted.
 */

export type Point3D = [number, number, number];

export interface HandShadowPenumbraSettings {
  enabled?: boolean;
  lightElevationMm?: number;        // 300..1500, default 700.0 (overhead light Z)
  lightOffsetMm?: [number, number]; // default [-250, -350]
  wristElevationMm?: number;        // 20..120, default 65.0
  umbraOpacity?: number;            // 0.1..0.85, default 0.52
  maxPenumbraBlurPx?: number;       // 6..60, default 24.0
  minUmbraBlurPx?: number;          // 1..10, default 3.0
  aoIntensity?: number;             // 0.0..0.8, default 0.40
}

export const DEFAULT_HAND_SHADOW_PENUMBRA_SETTINGS: Required<HandShadowPenumbraSettings> = {
  enabled: false,
  lightElevationMm: 700.0,
  lightOffsetMm: [-250.0, -350.0],
  wristElevationMm: 65.0,
  umbraOpacity: 0.52,
  maxPenumbraBlurPx: 24.0,
  minUmbraBlurPx: 3.0,
  aoIntensity: 0.40,
};

/**
 * Projects a 3D point P=(x, y, z) onto the board plane z=0 along the ray from light L=(Lx, Ly, Lz).
 * Formula: P' = P + (z / (Lz - z)) * (P - L)
 */
export function projectPoint3DToBoard(
  point: Point3D,
  light: Point3D
): [number, number] {
  const [px, py, pz] = point;
  const [lx, ly, lz] = light;

  const denom = Math.max(1e-3, lz - pz);
  const factor = pz / denom;

  const projX = Math.round((px + factor * (px - lx)) * 100) / 100;
  const projY = Math.round((py + factor * (py - ly)) * 100) / 100;
  return [projX, projY];
}

/**
 * Calculates distance-weighted graduated penumbra blur radius in pixels.
 * Near the stylus tip, blur is minimal (sharp umbra); near the forearm, it diffuses widely.
 */
export function calculateGraduatedPenumbraBlur(
  distanceFromTipPx: number,
  maxBlurPx = 24.0,
  minBlurPx = 3.0,
  proximityScale = 150.0
): number {
  const t = Math.max(0.0, Math.min(1.0, distanceFromTipPx / Math.max(1.0, proximityScale)));
  const blur = minBlurPx + t * (maxBlurPx - minBlurPx);
  return Math.round(blur * 10) / 10;
}

/**
 * Computes 3D elevation profile and perspective shadow projection for a 2D contour polygon.
 */
export function projectHandContourPolygon(
  contour: Array<[number, number]>,
  tipPt: [number, number],
  wristPt: [number, number],
  light: Point3D,
  wristElevationMm = 65.0,
  tipContactZMm = 0.0
): Array<[number, number]> {
  if (contour.length === 0) return [];

  const [nx, ny] = tipPt;
  const [wx, wy] = wristPt;
  const axisDx = wx - nx;
  const axisDy = wy - ny;
  const axisLenSq = Math.max(1e-4, axisDx * axisDx + axisDy * axisDy);

  return contour.map(([px, py]) => {
    // Longitudinal axis projection
    const dot = (px - nx) * axisDx + (py - ny) * axisDy;
    const t = Math.max(0.0, Math.min(1.2, dot / axisLenSq));
    const z = tipContactZMm + t * (wristElevationMm - tipContactZMm);

    return projectPoint3DToBoard([px, py, z], light);
  });
}

/**
 * Generates an SVG path string for the perspective hand shadow polygon.
 */
export function generatePerspectiveHandShadowSvgPath(
  projectedPts: Array<[number, number]>
): string {
  if (projectedPts.length < 3) return '';

  const [start, ...rest] = projectedPts;
  let d = `M ${start[0]} ${start[1]}`;
  for (const pt of rest) {
    d += ` L ${pt[0]} ${pt[1]}`;
  }
  d += ' Z';
  return d;
}
