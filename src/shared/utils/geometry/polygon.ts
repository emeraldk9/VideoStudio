/**
 * Beta S275 — pure polygon geometry for the whiteboard zone reveal.
 *
 * DOM-free on purpose: the renderer's zone editor and preview, the main
 * process's mask rasterizer, and the tests all read these same functions —
 * the whiteboard module's "one geometry, two consumers" discipline extended
 * to shapes. Every coordinate is normalized 0..1 of the padded sequence
 * frame; pixels appear only at the rasterizer boundary, as arguments.
 *
 * **The fill rule is even-odd, decided here once.** CSS `clip-path:
 * polygon()` defaults to nonzero, so the preview must emit
 * `polygon(evenodd, …)` explicitly — and the scanline rasterizer below pairs
 * crossings, which *is* even-odd. A self-intersecting freehand loop then
 * renders identically in both consumers instead of disagreeing about its
 * overlap.
 */

export interface PolygonPoint {
  x: number;
  y: number;
}

/**
 * Ramer–Douglas–Peucker polyline simplification — how a freehand gesture's
 * hundreds of pointer samples become a storable polygon. Endpoints survive;
 * interior points survive only while they deviate from the chord by more
 * than `epsilon` (same units as the points — normalized here).
 */
export function simplifyPolyline(
  points: readonly PolygonPoint[],
  epsilon: number,
): PolygonPoint[] {
  if (points.length <= 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = -1;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointToSegmentDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance <= epsilon) return [first, last];
  const head = simplifyPolyline(points.slice(0, maxIndex + 1), epsilon);
  const tail = simplifyPolyline(points.slice(maxIndex), epsilon);
  return [...head.slice(0, -1), ...tail];
}

function pointToSegmentDistance(p: PolygonPoint, a: PolygonPoint, b: PolygonPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export interface PolygonBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonBounds(points: readonly PolygonPoint[]): PolygonBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/** The vertex mean — the drag anchor and the pen's cross-axis line. (The area centroid would misplace both on a degenerate sliver.) */
export function polygonCentroid(points: readonly PolygonPoint[]): PolygonPoint {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

/**
 * Sutherland–Hodgman against one axis-aligned half-plane: the polygon kept
 * where `axis <= value` (`keep: 'lte'`) or `axis >= value` (`keep: 'gte'`).
 * This is the whole of a draw-in sweep — the visible region at progress `p`
 * is zone ∩ half-plane at the sweep front. Returns `[]` when nothing
 * survives (the zone entirely ahead of the front).
 */
export function clipPolygonHalfPlane(
  points: readonly PolygonPoint[],
  axis: 'x' | 'y',
  value: number,
  keep: 'lte' | 'gte',
): PolygonPoint[] {
  if (points.length < 3) return [];
  const inside = (point: PolygonPoint): boolean =>
    keep === 'lte' ? point[axis] <= value : point[axis] >= value;
  const output: PolygonPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const previous = points[(i + points.length - 1) % points.length];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn !== previousIn) {
      // The edge crosses the sweep line; emit the intersection.
      const span = current[axis] - previous[axis];
      const t = span === 0 ? 0 : (value - previous[axis]) / span;
      output.push({
        x: previous.x + t * (current.x - previous.x),
        y: previous.y + t * (current.y - previous.y),
      });
    }
    if (currentIn) output.push(current);
  }
  return output.length >= 3 ? output : [];
}

/**
 * Even-odd scanline spans for the mask rasterizer: for each pixel row, the
 * `[startX, endX)` pixel spans covered by the polygon. Crossings are sampled
 * at the row's centre (`y + 0.5`) and paired — pairing IS the even-odd rule.
 * Points are normalized; `width`/`height` are the raster geometry.
 */
export function polygonScanlineSpans(
  points: readonly PolygonPoint[],
  width: number,
  height: number,
): { y: number; spans: [number, number][] }[] {
  if (points.length < 3) return [];
  const rows: { y: number; spans: [number, number][] }[] = [];
  const bounds = polygonBounds(points);
  const yStart = Math.max(0, Math.floor(bounds.minY * height));
  const yEnd = Math.min(height - 1, Math.ceil(bounds.maxY * height));
  for (let y = yStart; y <= yEnd; y += 1) {
    const sampleY = (y + 0.5) / height;
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      // Half-open on each edge's y-range so a vertex shared by two edges
      // counts once, not twice — the classic double-crossing artifact.
      if (a.y <= sampleY === b.y <= sampleY) continue;
      const t = (sampleY - a.y) / (b.y - a.y);
      crossings.push(a.x + t * (b.x - a.x));
    }
    crossings.sort((left, right) => left - right);
    const spans: [number, number][] = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const startX = Math.max(0, Math.round(crossings[i] * width));
      const endX = Math.min(width, Math.round(crossings[i + 1] * width));
      if (endX > startX) spans.push([startX, endX]);
    }
    if (spans.length > 0) rows.push({ y, spans });
  }
  return rows;
}

/** The `polygon(evenodd, …)` CSS string, or `null` for a degenerate polygon (nothing to clip to). */
export function polygonClipPath(points: readonly PolygonPoint[]): string | null {
  if (points.length < 3) return null;
  const vertices = points
    .map((point) => `${(point.x * 100).toFixed(2)}% ${(point.y * 100).toFixed(2)}%`)
    .join(', ');
  return `polygon(evenodd, ${vertices})`;
}

/**
 * S6 — Calculates an SVG viewBox string for zooming/focusing on a zone's bounding box.
 * Coordinates are in frame units (default 1920x1080) with configurable padding.
 */
export function zoneThumbnailViewBox(
  points: readonly PolygonPoint[],
  frameWidth = 1920,
  frameHeight = 1080,
  paddingFraction = 0.05,
): string {
  if (points.length === 0) return `0 0 ${frameWidth} ${frameHeight}`;
  const bounds = polygonBounds(points);
  const w = Math.max(0.05, bounds.maxX - bounds.minX);
  const h = Math.max(0.05, bounds.maxY - bounds.minY);
  const padX = w * paddingFraction;
  const padY = h * paddingFraction;

  const minX = Math.max(0, (bounds.minX - padX) * frameWidth);
  const minY = Math.max(0, (bounds.minY - padY) * frameHeight);
  const boxW = Math.min(frameWidth - minX, (w + padX * 2) * frameWidth);
  const boxH = Math.min(frameHeight - minY, (h + padY * 2) * frameHeight);

  return `${minX.toFixed(1)} ${minY.toFixed(1)} ${boxW.toFixed(1)} ${boxH.toFixed(1)}`;
}

/**
 * S6 — Formats polygon points as an SVG points attribute string scaled to given dimensions.
 */
export function polygonPointsSvg(
  points: readonly PolygonPoint[],
  frameWidth = 1920,
  frameHeight = 1080,
): string {
  return points
    .map((p) => `${(p.x * frameWidth).toFixed(1)},${(p.y * frameHeight).toFixed(1)}`)
    .join(' ');
}
