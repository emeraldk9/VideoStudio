/**
 * Whiteboard Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective.
 * Assists technical diagramming, architectural sketching, and 3D geometric illustration:
 * 1. Substrate grids: Cartesian (orthogonal), Isometric (30°/90°/150°), Perspective (vanishing point), and Dots.
 * 2. Magnetic pen-tip snapping to nearest lattice nodes within capture radius.
 * 3. Declarative SVG grid markup generator for live viewport overlays.
 */

import type { Point2D } from './calligraphy-ops';

export type PerspectiveGridMode = 'cartesian' | 'isometric' | 'perspective' | 'dots';

export interface PerspectiveGridSettings {
  enabled?: boolean;
  mode?: PerspectiveGridMode;
  spacingPx?: number; // Distance between grid lines/dots (10..200, default 40)
  snapRadiusPx?: number; // Magnetic capture radius in px (2..40, default 12)
  horizonYPct?: number; // Horizon line position 0.1..0.9 (default 0.40)
  opacity?: number; // Visual grid line opacity 0.05..0.60 (default 0.20)
  gridColor?: string; // Subdued grid tint (hex color, default '#a0a0a0')
}

export const DEFAULT_PERSPECTIVE_GRID_SETTINGS: Required<PerspectiveGridSettings> = {
  enabled: true,
  mode: 'isometric',
  spacingPx: 40,
  snapRadiusPx: 12,
  horizonYPct: 0.4,
  opacity: 0.2,
  gridColor: '#a0a0a0',
};

export interface GridSnapResult {
  snappedPoint: Point2D;
  didSnap: boolean;
}

/**
 * Snaps a 2D coordinate to the nearest grid node/ray if within snapRadiusPx.
 */
export function snapPointToGridLattice(
  point: Point2D,
  settings?: PerspectiveGridSettings,
  canvasWidth = 1920,
  canvasHeight = 1080
): GridSnapResult {
  const cfg: Required<PerspectiveGridSettings> = {
    ...DEFAULT_PERSPECTIVE_GRID_SETTINGS,
    ...settings,
  };

  if (!cfg.enabled) {
    return { snappedPoint: [point[0], point[1]], didSnap: false };
  }

  const [x, y] = point;
  const s = Math.max(5, cfg.spacingPx);
  const rSnap = Math.max(1, cfg.snapRadiusPx);
  const rSnapSq = rSnap * rSnap;

  if (cfg.mode === 'cartesian' || cfg.mode === 'dots') {
    const snapX = Math.round(x / s) * s;
    const snapY = Math.round(y / s) * s;
    const distSq = (x - snapX) ** 2 + (y - snapY) ** 2;
    if (distSq <= rSnapSq) {
      return { snappedPoint: [snapX, snapY], didSnap: true };
    }
    return { snappedPoint: [x, y], didSnap: false };
  }

  if (cfg.mode === 'isometric') {
    // Equilateral triangular lattice (60° / 30° diagonals)
    // Row height h = s * sqrt(3) / 2
    const hRow = s * Math.sqrt(3) * 0.5;
    const rowIdx = Math.round(y / hRow);
    const nodeY = rowIdx * hRow;

    // Alternating horizontal offset for triangular packing
    const isOdd = Math.abs(rowIdx) % 2 === 1;
    const offsetX = isOdd ? s * 0.5 : 0;
    const colIdx = Math.round((x - offsetX) / s);
    const nodeX = colIdx * s + offsetX;

    const distSq = (x - nodeX) ** 2 + (y - nodeY) ** 2;
    if (distSq <= rSnapSq) {
      return { snappedPoint: [nodeX, nodeY], didSnap: true };
    }
    return { snappedPoint: [x, y], didSnap: false };
  }

  if (cfg.mode === 'perspective') {
    const vpY = canvasHeight * cfg.horizonYPct;
    const vpX = canvasWidth * 0.5;

    // Only snap points below horizon line
    if (y > vpY + 10) {
      const dy = y - vpY;
      const dx = x - vpX;
      const angleRad = Math.atan2(dy, dx);
      const stepRad = (10 * Math.PI) / 180; // 10 degree quantized rays
      const snappedAngle = Math.round(angleRad / stepRad) * stepRad;
      const rayLen = Math.hypot(dx, dy);

      const targetX = vpX + rayLen * Math.cos(snappedAngle);
      const targetY = vpY + rayLen * Math.sin(snappedAngle);

      if (Math.hypot(x - targetX, y - targetY) <= rSnap) {
        return { snappedPoint: [targetX, targetY], didSnap: true };
      }
    }
    return { snappedPoint: [x, y], didSnap: false };
  }

  return { snappedPoint: [x, y], didSnap: false };
}

/**
 * Snaps all vertices of a polyline stroke to the substrate grid.
 */
export function snapStrokePolyline(
  points: Point2D[],
  settings?: PerspectiveGridSettings,
  canvasWidth = 1920,
  canvasHeight = 1080
): Point2D[] {
  if (!settings?.enabled || points.length === 0) {
    return points.map((p) => [p[0], p[1]] as Point2D);
  }

  return points.map((pt) => {
    const { snappedPoint } = snapPointToGridLattice(pt, settings, canvasWidth, canvasHeight);
    return snappedPoint;
  });
}

/**
 * Generates an SVG markup string for rendering the grid substrate as an overlay.
 */
export function generateGridSvgMarkup(
  settings?: PerspectiveGridSettings,
  canvasWidth = 1920,
  canvasHeight = 1080
): string {
  const cfg: Required<PerspectiveGridSettings> = {
    ...DEFAULT_PERSPECTIVE_GRID_SETTINGS,
    ...settings,
  };

  if (!cfg.enabled || cfg.opacity <= 0.001) {
    return '';
  }

  const s = Math.max(10, Math.round(cfg.spacingPx));
  const elements: string[] = [];
  const strokeAttr = `stroke="${cfg.gridColor}" stroke-width="1" stroke-opacity="${cfg.opacity.toFixed(2)}"`;

  if (cfg.mode === 'cartesian') {
    for (let x = 0; x <= canvasWidth; x += s) {
      elements.push(`<line x1="${x}" y1="0" x2="${x}" y2="${canvasHeight}" ${strokeAttr} />`);
    }
    for (let y = 0; y <= canvasHeight; y += s) {
      elements.push(`<line x1="0" y1="${y}" x2="${canvasWidth}" y2="${y}" ${strokeAttr} />`);
    }
  } else if (cfg.mode === 'dots') {
    const fillAttr = `fill="${cfg.gridColor}" fill-opacity="${cfg.opacity.toFixed(2)}"`;
    for (let x = Math.round(s / 2); x < canvasWidth; x += s) {
      for (let y = Math.round(s / 2); y < canvasHeight; y += s) {
        elements.push(`<circle cx="${x}" cy="${y}" r="1.5" ${fillAttr} />`);
      }
    }
  } else if (cfg.mode === 'isometric') {
    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += s) {
      elements.push(`<line x1="${x}" y1="0" x2="${x}" y2="${canvasHeight}" ${strokeAttr} />`);
    }
    // 30-degree and -30-degree diagonal lines
    const tan30 = Math.tan((30 * Math.PI) / 180);
    const diagStep = Math.round(s * Math.sqrt(3));
    for (let offset = -canvasHeight; offset <= canvasWidth + canvasHeight; offset += diagStep) {
      const p1X = offset;
      const p1Y = 0;
      const p2X = Math.round(offset + canvasHeight / tan30);
      const p2Y = canvasHeight;
      elements.push(`<line x1="${p1X}" y1="${p1Y}" x2="${p2X}" y2="${p2Y}" ${strokeAttr} />`);

      const p4X = Math.round(offset - canvasHeight / tan30);
      elements.push(`<line x1="${p1X}" y1="${p1Y}" x2="${p4X}" y2="${p2Y}" ${strokeAttr} />`);
    }
  } else if (cfg.mode === 'perspective') {
    const vpY = Math.round(canvasHeight * cfg.horizonYPct);
    const vpX = Math.round(canvasWidth * 0.5);

    // Horizon line
    elements.push(`<line x1="0" y1="${vpY}" x2="${canvasWidth}" y2="${vpY}" stroke="${cfg.gridColor}" stroke-width="1.5" stroke-dasharray="4,4" stroke-opacity="${cfg.opacity.toFixed(2)}" />`);

    // Perspective vanishing rays
    for (let angleDeg = 10; angleDeg <= 170; angleDeg += 12) {
      const rad = (angleDeg * Math.PI) / 180;
      const xEnd = Math.round(vpX + (canvasHeight - vpY) / Math.tan(rad));
      elements.push(`<line x1="${vpX}" y1="${vpY}" x2="${xEnd}" y2="${canvasHeight}" ${strokeAttr} />`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" style="pointer-events:none;">\n${elements.join('\n')}\n</svg>`;
}
