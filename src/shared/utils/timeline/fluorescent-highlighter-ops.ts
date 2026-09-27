/**
 * Whiteboard Broad Chisel-Tip Fluorescent Highlighter Sub-Layer Operations
 *
 * Implements:
 * 1. Anisotropic flat chisel-nib ribbon geometry tilted at custom angles.
 * 2. Physical subtractive multiply color blending (100% dark linework preservation).
 * 3. Semi-transparent dye accumulation and SVG highlight paths.
 */

import type { Point2D } from './sticky-stencil-ops';

export type HighlighterColorPreset = 'yellow' | 'green' | 'pink' | 'cyan' | 'orange';
export type HighlighterCompositeMode = 'subtractive_multiply' | 'under_ink';

export interface HighlighterSettings {
  enabled?: boolean;
  colorPreset?: HighlighterColorPreset;
  customColorHex?: string;
  nibWidthPx?: number;
  nibAngleDeg?: number;
  opacity?: number;
  compositeMode?: HighlighterCompositeMode;
}

export const HIGHLIGHTER_PRESETS_HEX: Record<HighlighterColorPreset, string> = {
  yellow: '#FFFA36',
  green: '#59FF59',
  pink: '#FF479C',
  cyan: '#3DE3FF',
  orange: '#FFA43B',
};

export const DEFAULT_HIGHLIGHTER_SETTINGS: Required<HighlighterSettings> = {
  enabled: false,
  colorPreset: 'yellow',
  customColorHex: '',
  nibWidthPx: 24,
  nibAngleDeg: 15,
  opacity: 0.45,
  compositeMode: 'subtractive_multiply',
};

/**
 * Resolves color hex string for the highlighter.
 */
export function getHighlighterColor(
  preset?: HighlighterColorPreset,
  customHex?: string,
): string {
  if (customHex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customHex)) {
    return customHex;
  }
  const key = preset ?? 'yellow';
  return HIGHLIGHTER_PRESETS_HEX[key] || HIGHLIGHTER_PRESETS_HEX.yellow;
}

/**
 * Computes anisotropic flat chisel-nib polygon ribbon coordinates.
 */
export function computeHighlighterRibbon(
  points: Point2D[],
  nibWidthPx: number = 24,
  nibAngleDeg: number = 15,
): Point2D[] {
  if (!points || points.length === 0) return [];

  const hw = nibWidthPx / 2;
  const rad = (nibAngleDeg * Math.PI) / 180;
  const dx = hw * Math.cos(rad);
  const dy = hw * Math.sin(rad);

  if (points.length === 1) {
    const { x, y } = points[0];
    const perpLen = hw * 0.4;
    const pdx = -perpLen * Math.sin(rad);
    const pdy = perpLen * Math.cos(rad);
    return [
      { x: Math.round((x - dx - pdx) * 100) / 100, y: Math.round((y - dy - pdy) * 100) / 100 },
      { x: Math.round((x + dx - pdx) * 100) / 100, y: Math.round((y + dy - pdy) * 100) / 100 },
      { x: Math.round((x + dx + pdx) * 100) / 100, y: Math.round((y + dy + pdy) * 100) / 100 },
      { x: Math.round((x - dx + pdx) * 100) / 100, y: Math.round((y - dy + pdy) * 100) / 100 },
    ];
  }

  const leftEdge: Point2D[] = [];
  const rightEdge: Point2D[] = [];

  for (const { x, y } of points) {
    leftEdge.push({
      x: Math.round((x - dx) * 100) / 100,
      y: Math.round((y - dy) * 100) / 100,
    });
    rightEdge.push({
      x: Math.round((x + dx) * 100) / 100,
      y: Math.round((y + dy) * 100) / 100,
    });
  }

  // Combine into single closed polygon
  return [...leftEdge, ...rightEdge.reverse()];
}

/**
 * Optical subtractive color blending.
 * Preserves 100% of underlying dark linework while tinting paper substrate.
 */
export function blendSubtractiveColor(
  baseRgb: [number, number, number],
  hlRgb: [number, number, number],
  opacity: number,
): [number, number, number] {
  const alpha = Math.max(0, Math.min(1, opacity));
  const res: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    const dyeRatio = hlRgb[i] / 255.0;
    const dyeFactor = 1.0 - alpha * (1.0 - dyeRatio);
    res[i] = Math.round(Math.max(0, Math.min(255, baseRgb[i] * dyeFactor)));
  }

  return res;
}

/**
 * Generates SVG element markup for the highlighter stroke with multiply blend mode.
 */
export function generateHighlighterSvg(
  points: Point2D[],
  settings: Partial<HighlighterSettings> = {},
): string {
  if (!points || points.length === 0) return '';
  const cfg = { ...DEFAULT_HIGHLIGHTER_SETTINGS, ...settings };
  const color = getHighlighterColor(cfg.colorPreset, cfg.customColorHex);
  const ribbon = computeHighlighterRibbon(points, cfg.nibWidthPx, cfg.nibAngleDeg);
  if (ribbon.length < 3) return '';

  const ptsStr = ribbon.map((p) => `${p.x},${p.y}`).join(' ');
  const blendMode = cfg.compositeMode === 'subtractive_multiply' ? 'mix-blend-mode: multiply;' : '';

  return `
    <polygon points="${ptsStr}" fill="${color}" opacity="${cfg.opacity}" style="${blendMode}" class="highlighter-stroke" />
  `.trim();
}
