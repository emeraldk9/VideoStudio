/**
 * High-performance 2D Dynamic Pen Calligraphy, Pressure-Sensitive Brush Extrusion & Nib Modeling Operations.
 * Extrudes variable-width polygonal envelopes with velocity tapering and anisotropic chisel nib dynamics.
 */

export type Point2D = [number, number];

export interface WhiteboardBrushDynamics {
  taper?: boolean;
  chiselNib?: boolean;
  nibAngleDeg?: number;
  minWidthRatio?: number;
}

/**
 * Compute unit normal vectors and tangent velocity angles for polyline vertices.
 */
export function computePointNormals(pts: Point2D[]): {
  normals: Point2D[];
  angles: number[];
} {
  const n = pts.length;
  if (n === 0) return { normals: [], angles: [] };
  if (n === 1) return { normals: [[0.0, 1.0]], angles: [0.0] };

  const normals: Point2D[] = [];
  const angles: number[] = [];

  for (let i = 0; i < n; i++) {
    let dx = 0.0;
    let dy = 0.0;

    if (i === 0) {
      dx = pts[1][0] - pts[0][0];
      dy = pts[1][1] - pts[0][1];
    } else if (i === n - 1) {
      dx = pts[n - 1][0] - pts[n - 2][0];
      dy = pts[n - 1][1] - pts[n - 2][1];
    } else {
      dx = pts[i + 1][0] - pts[i - 1][0];
      dy = pts[i + 1][1] - pts[i - 1][1];
    }

    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      normals.push([0.0, 1.0]);
      angles.push(0.0);
    } else {
      const tx = dx / len;
      const ty = dy / len;
      // Normal perpendicular to tangent (counter-clockwise 90 deg)
      normals.push([-ty, tx]);
      angles.push(Math.atan2(ty, tx));
    }
  }

  return { normals, angles };
}

/**
 * Compute instantaneous stroke widths incorporating speed tapering and chisel nib angle geometry.
 */
export function computeVariableWidths(
  pts: Point2D[],
  angles: number[],
  baseWidth: number = 5.0,
  dynamics?: WhiteboardBrushDynamics
): number[] {
  const n = pts.length;
  if (n === 0) return [];

  const taper = dynamics?.taper ?? true;
  const chiselNib = dynamics?.chiselNib ?? false;
  const nibRad = ((dynamics?.nibAngleDeg ?? 45.0) * Math.PI) / 180.0;
  const minRatio = Math.max(0.1, Math.min(1.0, dynamics?.minWidthRatio ?? 0.35));

  const segLens: number[] = [0.0];
  for (let i = 1; i < n; i++) {
    segLens.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const avgSeg = n > 1 ? segLens.reduce((a, b) => a + b, 0) / (n - 1) : 1.0;
  const taperSpan = Math.max(2, Math.min(12, Math.floor(n / 5)));

  const widths: number[] = [];

  for (let i = 0; i < n; i++) {
    let w = baseWidth;

    // 1. Start and End tapering + speed thinning
    if (taper && n > 2) {
      let startFactor = 1.0;
      let endFactor = 1.0;

      if (i < taperSpan) {
        const frac = i / Math.max(1, taperSpan);
        startFactor = minRatio + (1.0 - minRatio) * (0.5 - 0.5 * Math.cos(Math.PI * frac));
      }
      if (n - 1 - i < taperSpan) {
        const frac = (n - 1 - i) / Math.max(1, taperSpan);
        endFactor = minRatio + (1.0 - minRatio) * (0.5 - 0.5 * Math.cos(Math.PI * frac));
      }

      const speedRatio = segLens[i] / Math.max(1e-4, avgSeg);
      const velocityThinning = Math.max(minRatio, 1.0 - 0.35 * Math.min(2.0, speedRatio));

      w *= Math.min(startFactor, endFactor) * velocityThinning;
    }

    // 2. Anisotropic Chisel Nib geometry
    if (chiselNib) {
      const angleDiff = angles[i] - nibRad;
      const nibFactor = Math.sin(angleDiff) ** 2 + 0.22 * Math.cos(angleDiff) ** 2;
      w *= Math.max(minRatio, nibFactor);
    }

    widths.push(Math.max(1.0, w));
  }

  return widths;
}

/**
 * Extrude polyline into a closed 2D polygon with left and right normal offsets and rounded end-caps.
 */
export function extrudeVariableWidthPolygon(
  pts: Point2D[],
  baseWidth: number = 5.0,
  dynamics?: WhiteboardBrushDynamics
): Point2D[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [p[0], p[1]]);

  const { normals, angles } = computePointNormals(pts);
  const widths = computeVariableWidths(pts, angles, baseWidth, dynamics);

  const leftPts: Point2D[] = [];
  const rightPts: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const halfW = widths[i] * 0.5;
    const [nx, ny] = normals[i];
    const [px, py] = pts[i];

    leftPts.push([px + nx * halfW, py + ny * halfW]);
    rightPts.push([px - nx * halfW, py - ny * halfW]);
  }

  const polygon: Point2D[] = [];

  // Round start cap
  const p0 = pts[0];
  const r0 = widths[0] * 0.5;
  const ang0 = angles[0];
  const capSteps = 4;
  for (let k = 0; k <= capSteps; k++) {
    const th = ang0 - Math.PI / 2.0 - (Math.PI * k) / capSteps;
    polygon.push([p0[0] + r0 * Math.cos(th), p0[1] + r0 * Math.sin(th)]);
  }

  polygon.push(...leftPts);

  // Round end cap
  const pn = pts[n - 1];
  const rn = widths[n - 1] * 0.5;
  const angn = angles[n - 1];
  for (let k = 0; k <= capSteps; k++) {
    const th = angn + Math.PI / 2.0 - (Math.PI * k) / capSteps;
    polygon.push([pn[0] + rn * Math.cos(th), pn[1] + rn * Math.sin(th)]);
  }

  polygon.push(...[...rightPts].reverse());

  return polygon;
}

/**
 * Convert extruded polygon coordinates into an SVG path data string (`d="..."`).
 */
export function buildSvgPolygonPath(polygon: Point2D[]): string {
  if (polygon.length === 0) return '';
  let d = `M ${polygon[0][0].toFixed(2)} ${polygon[0][1].toFixed(2)}`;
  for (let i = 1; i < polygon.length; i++) {
    d += ` L ${polygon[i][0].toFixed(2)} ${polygon[i][1].toFixed(2)}`;
  }
  d += ' Z';
  return d;
}
