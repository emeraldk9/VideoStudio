/**
 * S24 — Pure arithmetic and geometry operations for on-canvas transform gizmo,
 * bounding box resizing, direct positioning, and magnetic alignment snapping.
 */

export type GizmoHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rot';

export interface SnapGuideLine {
  axis: 'x' | 'y';
  positionPct: number;
  label?: string;
}

export const DEFAULT_SNAP_STOPS_X = [0, 0.05, 1 / 3, 0.5, 2 / 3, 0.95, 1];
export const DEFAULT_SNAP_STOPS_Y = [0, 0.05, 1 / 3, 0.5, 2 / 3, 0.95, 1];
export const DEFAULT_SNAP_TOLERANCE_PCT = 0.018; // ~1.8% of container

export const MIN_GIZMO_SCALE = 0.05;
export const MAX_GIZMO_SCALE = 3.0;

/**
 * Bounds a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Snaps a normalized coordinate (0..1) to the nearest stop if within tolerance.
 */
export function snapCoordinate(
  valuePct: number,
  stops: readonly number[] = DEFAULT_SNAP_STOPS_X,
  tolerancePct: number = DEFAULT_SNAP_TOLERANCE_PCT
): { value: number; snapped: boolean; stop: number | null } {
  for (const stop of stops) {
    if (Math.abs(valuePct - stop) <= tolerancePct) {
      return { value: stop, snapped: true, stop };
    }
  }
  return { value: valuePct, snapped: false, stop: null };
}

/**
 * Calculates updated center position from mouse displacement in pixels,
 * with optional magnetic alignment snapping on center and edges.
 */
export function calculateGizmoDragPosition(
  initialCenter: { x: number; y: number },
  deltaPx: { x: number; y: number },
  boxDims: { width: number; height: number },
  snapEnabled: boolean = true
): { x: number; y: number; activeGuides: SnapGuideLine[] } {
  if (boxDims.width <= 0 || boxDims.height <= 0) {
    return { x: initialCenter.x, y: initialCenter.y, activeGuides: [] };
  }

  const rawX = initialCenter.x + deltaPx.x / boxDims.width;
  const rawY = initialCenter.y + deltaPx.y / boxDims.height;

  let x = clamp(rawX, 0, 1);
  let y = clamp(rawY, 0, 1);
  const activeGuides: SnapGuideLine[] = [];

  if (snapEnabled) {
    const snapX = snapCoordinate(x, DEFAULT_SNAP_STOPS_X);
    if (snapX.snapped && snapX.stop !== null) {
      x = snapX.value;
      activeGuides.push({
        axis: 'x',
        positionPct: snapX.stop,
        label: snapX.stop === 0.5 ? 'Center X' : `${Math.round(snapX.stop * 100)}%`,
      });
    }

    const snapY = snapCoordinate(y, DEFAULT_SNAP_STOPS_Y);
    if (snapY.snapped && snapY.stop !== null) {
      y = snapY.value;
      activeGuides.push({
        axis: 'y',
        positionPct: snapY.stop,
        label: snapY.stop === 0.5 ? 'Center Y' : `${Math.round(snapY.stop * 100)}%`,
      });
    }
  }

  return { x, y, activeGuides };
}

/**
 * Calculates new uniform scale and center offset from a corner or edge handle displacement.
 */
export function calculateGizmoResize(
  initialScale: number,
  handle: GizmoHandle,
  deltaPx: { x: number; y: number },
  boxDims: { width: number; height: number },
  minScale: number = MIN_GIZMO_SCALE,
  maxScale: number = MAX_GIZMO_SCALE
): number {
  if (boxDims.width <= 0 || boxDims.height <= 0) return initialScale;

  // Use the average pixel dimension to normalize scaling displacement
  const avgDim = (boxDims.width + boxDims.height) / 2;
  const normDx = deltaPx.x / avgDim;
  const normDy = deltaPx.y / avgDim;

  let deltaScale = 0;

  switch (handle) {
    case 'se':
      deltaScale = (normDx + normDy);
      break;
    case 'nw':
      deltaScale = -(normDx + normDy);
      break;
    case 'ne':
      deltaScale = (normDx - normDy);
      break;
    case 'sw':
      deltaScale = (-normDx + normDy);
      break;
    case 'e':
      deltaScale = normDx * 2;
      break;
    case 'w':
      deltaScale = -normDx * 2;
      break;
    case 's':
      deltaScale = normDy * 2;
      break;
    case 'n':
      deltaScale = -normDy * 2;
      break;
    default:
      return initialScale;
  }

  const rawScale = initialScale + deltaScale;
  return clamp(rawScale, minScale, maxScale);
}

/**
 * Computes rotation angle in degrees from center point to pointer position.
 * Applies a ±3° snap at 0°, 90°, 180°, and -90°.
 */
export function calculateGizmoRotation(
  centerPx: { x: number; y: number },
  pointerPx: { x: number; y: number },
  snapThresholdDeg: number = 3
): number {
  const dx = pointerPx.x - centerPx.x;
  const dy = pointerPx.y - centerPx.y;

  // 0 degrees is up (stem handle pointing north)
  let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

  // Normalize to -180..180
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;

  // Snap to cardinals (0, 90, 180, -90, -180)
  const cardinals = [0, 90, 180, -90, -180];
  for (const card of cardinals) {
    if (Math.abs(deg - card) <= snapThresholdDeg) {
      return card === -180 ? 180 : card;
    }
  }

  return Math.round(deg * 10) / 10;
}
