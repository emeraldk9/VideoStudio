/**
 * Whiteboard Sticky Notes, Board Magnets & Paper Stencil Masking Operations
 *
 * Implements stationery rendering and spatial clipping:
 * 1. Procedural Sticky Notes with natural tilt angle and corner peel drop shadow.
 * 2. Visual board magnets, pushpins, and tape anchors.
 * 3. Paper stencil aperture polygon clipping for negative space drawing.
 */

export type StickyNoteColorPreset = 'canary' | 'pink' | 'cyan' | 'mint' | 'orange';
export type StickyPinStyle = 'magnet' | 'pushpin' | 'tape' | 'none';
export type StencilShape = 'rectangle' | 'circle' | 'speech_bubble';

export interface Point2D {
  x: number;
  y: number;
}

export interface StickyNoteSettings {
  enabled?: boolean;
  colorPreset?: StickyNoteColorPreset;
  customColorHex?: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotationDeg?: number;
  peelElevationPx?: number;
  pinStyle?: StickyPinStyle;
}

export interface StencilMaskSettings {
  enabled?: boolean;
  shape?: StencilShape;
  invertMask?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  radius?: number;
}

export const STICKY_NOTE_PRESETS_HEX: Record<StickyNoteColorPreset, string> = {
  canary: '#FFF875',
  pink: '#FFB7C5',
  cyan: '#A0E8FF',
  mint: '#B8F2B8',
  orange: '#FFCF87',
};

export const DEFAULT_STICKY_NOTE_SETTINGS: Required<StickyNoteSettings> = {
  enabled: false,
  colorPreset: 'canary',
  customColorHex: '',
  posX: 250,
  posY: 250,
  width: 220,
  height: 220,
  rotationDeg: -3.5,
  peelElevationPx: 12,
  pinStyle: 'magnet',
};

export const DEFAULT_STENCIL_MASK_SETTINGS: Required<StencilMaskSettings> = {
  enabled: false,
  shape: 'rectangle',
  invertMask: false,
  posX: 300,
  posY: 300,
  width: 400,
  height: 300,
  radius: 150,
};

/**
 * Resolves color hex code for sticky note substrate.
 */
export function getStickyNoteColor(
  preset?: StickyNoteColorPreset,
  customHex?: string,
): string {
  if (customHex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customHex)) {
    return customHex;
  }
  const key = preset ?? 'canary';
  return STICKY_NOTE_PRESETS_HEX[key] || STICKY_NOTE_PRESETS_HEX.canary;
}

/**
 * Computes 4 corners of a rotated rectangle.
 */
export function computeRotatedQuad(
  center: Point2D,
  size: { width: number; height: number },
  rotDeg: number,
): Point2D[] {
  const hw = size.width / 2;
  const hh = size.height / 2;
  const rad = (rotDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const localCorners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  return localCorners.map(([lx, ly]) => ({
    x: Math.round((center.x + lx * cosA - ly * sinA) * 100) / 100,
    y: Math.round((center.y + lx * sinA + ly * cosA) * 100) / 100,
  }));
}

/**
 * Ray-casting algorithm to test whether a 2D point is inside a polygon.
 */
export function isPointInsideStencilPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Clips a polyline against a stencil polygon.
 * Splits continuous stroke into segments inside (or outside, if inverted) the stencil.
 */
export function clipPolylineToStencil(
  points: Point2D[],
  stencilPoly: Point2D[],
  invertMask: boolean = false,
): Point2D[][] {
  if (!points || points.length === 0 || !stencilPoly || stencilPoly.length < 3) {
    return points && points.length > 0 ? [points] : [];
  }

  const segments: Point2D[][] = [];
  let currentSegment: Point2D[] = [];

  for (const pt of points) {
    const inside = isPointInsideStencilPolygon(pt, stencilPoly);
    const keep = invertMask ? !inside : inside;

    if (keep) {
      currentSegment.push(pt);
    } else {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Generates standalone SVG element string for the sticky note with shadow and pin.
 */
export function generateStickyNoteSvg(settings: StickyNoteSettings): string {
  const cfg = { ...DEFAULT_STICKY_NOTE_SETTINGS, ...settings };
  const color = getStickyNoteColor(cfg.colorPreset, cfg.customColorHex);
  const quad = computeRotatedQuad(
    { x: cfg.posX, y: cfg.posY },
    { width: cfg.width, height: cfg.height },
    cfg.rotationDeg,
  );

  const pointsStr = quad.map((p) => `${p.x},${p.y}`).join(' ');
  const shadowOffset = cfg.peelElevationPx * 0.6;
  const shadowBlur = Math.max(2, cfg.peelElevationPx * 0.8);

  const shadowPoints = quad
    .map((p) => `${p.x + shadowOffset * 0.5},${p.y + shadowOffset}`)
    .join(' ');

  let pinElement = '';
  if (cfg.pinStyle === 'magnet') {
    const topMidX = (quad[0].x + quad[1].x) / 2;
    const topMidY = (quad[0].y + quad[1].y) / 2 + cfg.height * 0.08;
    pinElement = `
      <circle cx="${topMidX}" cy="${topMidY}" r="9" fill="#222" />
      <circle cx="${topMidX}" cy="${topMidY}" r="7" fill="#e53e3e" />
      <circle cx="${topMidX - 2}" cy="${topMidY - 2}" r="2" fill="#fff" opacity="0.8" />
    `;
  } else if (cfg.pinStyle === 'pushpin') {
    const topMidX = (quad[0].x + quad[1].x) / 2;
    const topMidY = (quad[0].y + quad[1].y) / 2 + cfg.height * 0.08;
    pinElement = `
      <circle cx="${topMidX}" cy="${topMidY}" r="6" fill="#3182ce" stroke="#2b6cb0" stroke-width="1.5" />
      <circle cx="${topMidX - 1}" cy="${topMidY - 1}" r="1.5" fill="#fff" opacity="0.9" />
    `;
  }

  return `
    <g class="sticky-note-wrapper" id="sticky-note">
      <polygon points="${shadowPoints}" fill="rgba(0,0,0,0.22)" filter="blur(${shadowBlur}px)" />
      <polygon points="${pointsStr}" fill="${color}" stroke="rgba(0,0,0,0.12)" stroke-width="1" />
      ${pinElement}
    </g>
  `.trim();
}
