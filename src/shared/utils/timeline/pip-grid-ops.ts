/**
 * Pure arithmetic, geometry calculation, and multi-video layout engine
 * for VideoStudio Picture-in-Picture (PiP), Split-Screen & Video Grids.
 *
 * Implements:
 * - 10 Curated split-screen & video grid layouts:
 *   - 'split_horizontal_50': Side-by-side vertical split (50/50 left/right)
 *   - 'split_vertical_50': Top/bottom split (50/50 top/bottom)
 *   - 'grid_2x2': Classic 4-camera quad view (2x2)
 *   - 'grid_3_split': 1 dominant primary video (60% left), 2 stacked secondary videos (40% right)
 *   - 'grid_3x3': 9-video wall (3x3)
 *   - 'pip_floating_br': Floating PiP inset in bottom-right corner
 *   - 'pip_floating_tr': Floating PiP inset in top-right corner
 *   - 'pip_floating_tl': Floating PiP inset in top-left corner
 *   - 'pip_floating_bl': Floating PiP inset in bottom-left corner
 *   - 'triple_portrait_16x9': 3 vertical 9:16 mobile feeds framed side-by-side in a 16:9 frame
 * - Normalized bounding box calculation { xPct, yPct, widthPct, heightPct }
 * - Customizable borders, corner radii, drop shadows, and inter-cell gap spacing
 * - FFmpeg multi-stream filter complex generator for master export renders
 */

import type { SequenceClip } from '../../types/sequence';

export type PipGridLayoutType =
  | 'split_horizontal_50'
  | 'split_vertical_50'
  | 'grid_2x2'
  | 'grid_3_split'
  | 'grid_3x3'
  | 'split_3_columns'
  | 'split_1_top_2_bottom'
  | 'split_2_top_1_bottom'
  | 'split_cinema_2'
  | 'pip_floating_br'
  | 'pip_floating_tr'
  | 'pip_floating_tl'
  | 'pip_floating_bl'
  | 'triple_portrait_16x9';

export interface GridCellRect {
  xPct: number;      // 0.0 to 1.0 (left offset as fraction of frame)
  yPct: number;      // 0.0 to 1.0 (top offset as fraction of frame)
  widthPct: number;  // 0.0 to 1.0 (width as fraction of frame)
  heightPct: number; // 0.0 to 1.0 (height as fraction of frame)
}

export interface ClipPipGridSettings {
  enabled: boolean;
  layout: PipGridLayoutType;
  cellIndex: number;          // 0-indexed cell position in the layout
  gapPx?: number;             // 0 to 30px spacing between cells
  borderWidthPx?: number;     // 0 to 20px outline
  borderColorHex?: string;    // #ffffff, #000000, etc.
  cornerRadiusPx?: number;    // 0 to 50px rounded corners
  shadow?: boolean;           // drop shadow for floating insets
}

export interface PipGridLayoutDefinition {
  layout: PipGridLayoutType;
  label: string;
  category: 'split' | 'grid' | 'pip' | 'social';
  maxCells: number;
  description: string;
}

export const PIP_GRID_LAYOUTS: readonly PipGridLayoutDefinition[] = [
  {
    layout: 'split_horizontal_50',
    label: 'Side-by-Side (50/50)',
    category: 'split',
    maxCells: 2,
    description: 'Vertical split dividing the screen evenly between two subjects (interviews, comparisons)',
  },
  {
    layout: 'split_vertical_50',
    label: 'Top & Bottom (50/50)',
    category: 'split',
    maxCells: 2,
    description: 'Horizontal split with one video on top and one below (before/after, reaction)',
  },
  {
    layout: 'grid_2x2',
    label: 'Quad View (2x2)',
    category: 'grid',
    maxCells: 4,
    description: 'Classic 4-camera grid dividing the frame into four equal quadrants',
  },
  {
    layout: 'grid_3_split',
    label: '1 Main + 2 Stacked',
    category: 'grid',
    maxCells: 3,
    description: 'One large focus video on the left (60%) with two stacked feeds on the right (40%)',
  },
  {
    layout: 'grid_3x3',
    label: '9-Video Wall (3x3)',
    category: 'grid',
    maxCells: 9,
    description: 'High-density 9-camera mosaic grid for multi-angle performances or CCTV looks',
  },
  {
    layout: 'pip_floating_br',
    label: 'PiP Bottom-Right',
    category: 'pip',
    maxCells: 1,
    description: 'Floating Picture-in-Picture window inset in the bottom-right corner',
  },
  {
    layout: 'pip_floating_tr',
    label: 'PiP Top-Right',
    category: 'pip',
    maxCells: 1,
    description: 'Floating Picture-in-Picture window inset in the top-right corner',
  },
  {
    layout: 'pip_floating_tl',
    label: 'PiP Top-Left',
    category: 'pip',
    maxCells: 1,
    description: 'Floating Picture-in-Picture window inset in the top-left corner',
  },
  {
    layout: 'pip_floating_bl',
    label: 'PiP Bottom-Left',
    category: 'pip',
    maxCells: 1,
    description: 'Floating Picture-in-Picture window inset in the bottom-left corner',
  },
  {
    layout: 'triple_portrait_16x9',
    label: '3x Mobile in 16:9',
    category: 'social',
    maxCells: 3,
    description: 'Three vertical 9:16 mobile feeds framed side-by-side inside a 16:9 widescreen canvas',
  },
  {
    layout: 'split_3_columns',
    label: '3 Vertical Columns (33/33/33)',
    category: 'split',
    maxCells: 3,
    description: 'Three equal vertical video columns side-by-side (trios, product showcases)',
  },
  {
    layout: 'split_1_top_2_bottom',
    label: '1 Top + 2 Bottom Split',
    category: 'grid',
    maxCells: 3,
    description: 'One wide master shot on top with two reaction or guest cams side-by-side below',
  },
  {
    layout: 'split_2_top_1_bottom',
    label: '2 Top + 1 Bottom Split',
    category: 'grid',
    maxCells: 3,
    description: 'Two speaker feeds on top with a wide screen-share or presentation feed below',
  },
  {
    layout: 'split_cinema_2',
    label: 'Dual Cinema Strips (2.39:1)',
    category: 'split',
    maxCells: 2,
    description: 'Two anamorphic ultra-widescreen letterboxed strips stacked with center gutter',
  },
];

export const DEFAULT_PIP_GRID_SETTINGS: ClipPipGridSettings = {
  enabled: false,
  layout: 'pip_floating_br',
  cellIndex: 0,
  gapPx: 4,
  borderWidthPx: 2,
  borderColorHex: '#ffffff',
  cornerRadiusPx: 8,
  shadow: true,
};

/**
 * Calculates normalized bounding boxes [0, 1] for all cells in a chosen layout.
 * Optional gap fraction can be introduced to space adjacent cells.
 */
export function calculateGridLayoutCells(
  layout: PipGridLayoutType,
  gapFraction: number = 0
): GridCellRect[] {
  const g = Math.max(0, Math.min(0.05, gapFraction));

  switch (layout) {
    case 'split_horizontal_50': {
      const halfW = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: halfW, heightPct: 1 },
        { xPct: 0.5 + g / 2, yPct: 0, widthPct: halfW, heightPct: 1 },
      ];
    }

    case 'split_vertical_50': {
      const halfH = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: 1, heightPct: halfH },
        { xPct: 0, yPct: 0.5 + g / 2, widthPct: 1, heightPct: halfH },
      ];
    }

    case 'grid_2x2': {
      const cellW = 0.5 - g / 2;
      const cellH = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: cellW, heightPct: cellH }, // Top-Left
        { xPct: 0.5 + g / 2, yPct: 0, widthPct: cellW, heightPct: cellH }, // Top-Right
        { xPct: 0, yPct: 0.5 + g / 2, widthPct: cellW, heightPct: cellH }, // Bottom-Left
        { xPct: 0.5 + g / 2, yPct: 0.5 + g / 2, widthPct: cellW, heightPct: cellH }, // Bottom-Right
      ];
    }

    case 'grid_3_split': {
      // Left 60%, Right two stacked 40%
      const leftW = 0.6 - g / 2;
      const rightW = 0.4 - g / 2;
      const halfH = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: leftW, heightPct: 1 }, // Main left
        { xPct: 0.6 + g / 2, yPct: 0, widthPct: rightW, heightPct: halfH }, // Top-Right
        { xPct: 0.6 + g / 2, yPct: 0.5 + g / 2, widthPct: rightW, heightPct: halfH }, // Bottom-Right
      ];
    }

    case 'grid_3x3': {
      const w = 1 / 3 - (g * 2) / 3;
      const h = 1 / 3 - (g * 2) / 3;
      const cells: GridCellRect[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          cells.push({
            xPct: col * (w + g),
            yPct: row * (h + g),
            widthPct: w,
            heightPct: h,
          });
        }
      }
      return cells;
    }

    case 'pip_floating_br': {
      // 28% width, 16:9 aspect, pinned bottom-right with 4% margin
      const w = 0.28;
      const h = 0.28;
      return [{ xPct: 0.96 - w, yPct: 0.96 - h, widthPct: w, heightPct: h }];
    }

    case 'pip_floating_tr': {
      const w = 0.28;
      const h = 0.28;
      return [{ xPct: 0.96 - w, yPct: 0.04, widthPct: w, heightPct: h }];
    }

    case 'pip_floating_tl': {
      const w = 0.28;
      const h = 0.28;
      return [{ xPct: 0.04, yPct: 0.04, widthPct: w, heightPct: h }];
    }

    case 'pip_floating_bl': {
      const w = 0.28;
      const h = 0.28;
      return [{ xPct: 0.04, yPct: 0.96 - h, widthPct: w, heightPct: h }];
    }

    case 'triple_portrait_16x9': {
      // Three 9:16 vertical videos in 16:9 canvas
      // Each has width ~0.26, height ~0.92, centered
      const cellW = 0.26;
      const cellH = 0.92;
      const startX = (1 - (cellW * 3 + g * 2)) / 2;
      const startY = (1 - cellH) / 2;
      return [
        { xPct: startX, yPct: startY, widthPct: cellW, heightPct: cellH },
        { xPct: startX + cellW + g, yPct: startY, widthPct: cellW, heightPct: cellH },
        { xPct: startX + (cellW + g) * 2, yPct: startY, widthPct: cellW, heightPct: cellH },
      ];
    }

    case 'split_3_columns': {
      const colW = (1 - g * 2) / 3;
      return [
        { xPct: 0, yPct: 0, widthPct: colW, heightPct: 1 },
        { xPct: colW + g, yPct: 0, widthPct: colW, heightPct: 1 },
        { xPct: (colW + g) * 2, yPct: 0, widthPct: colW, heightPct: 1 },
      ];
    }

    case 'split_1_top_2_bottom': {
      const halfH = 0.5 - g / 2;
      const halfW = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: 1, heightPct: halfH },
        { xPct: 0, yPct: 0.5 + g / 2, widthPct: halfW, heightPct: halfH },
        { xPct: 0.5 + g / 2, yPct: 0.5 + g / 2, widthPct: halfW, heightPct: halfH },
      ];
    }

    case 'split_2_top_1_bottom': {
      const halfH = 0.5 - g / 2;
      const halfW = 0.5 - g / 2;
      return [
        { xPct: 0, yPct: 0, widthPct: halfW, heightPct: halfH },
        { xPct: 0.5 + g / 2, yPct: 0, widthPct: halfW, heightPct: halfH },
        { xPct: 0, yPct: 0.5 + g / 2, widthPct: 1, heightPct: halfH },
      ];
    }

    case 'split_cinema_2': {
      const h = 0.44;
      const startY = Math.max(0, (1 - (h * 2 + g)) / 2);
      return [
        { xPct: 0, yPct: startY, widthPct: 1, heightPct: h },
        { xPct: 0, yPct: startY + h + g, widthPct: 1, heightPct: h },
      ];
    }

    default:
      return [{ xPct: 0, yPct: 0, widthPct: 1, heightPct: 1 }];
  }
}

/**
 * Returns the resolved bounding rectangle for a clip configured with pipGrid settings.
 */
export function getClipGridRect(
  settings: ClipPipGridSettings | undefined,
  fallbackIndex: number = 0
): GridCellRect | undefined {
  if (!settings || !settings.enabled) {
    return undefined;
  }

  const cells = calculateGridLayoutCells(settings.layout, (settings.gapPx ?? 0) / 1000);
  const targetIndex = settings.cellIndex !== undefined ? settings.cellIndex : fallbackIndex;
  const safeIndex = Math.max(0, Math.min(cells.length - 1, targetIndex));

  return cells[safeIndex] ?? cells[0];
}

/**
 * Builds CSS style properties for preview positioning of a PiP / grid clip.
 */
export function buildCssGridStyle(
  settings: ClipPipGridSettings | undefined,
  fallbackIndex: number = 0
): React.CSSProperties {
  if (!settings || !settings.enabled) {
    return {};
  }

  const rect = getClipGridRect(settings, fallbackIndex);
  if (!rect) return {};

  const border =
    settings.borderWidthPx && settings.borderWidthPx > 0
      ? `${settings.borderWidthPx}px solid ${settings.borderColorHex || '#ffffff'}`
      : undefined;

  const borderRadius = settings.cornerRadiusPx ? `${settings.cornerRadiusPx}px` : undefined;

  const boxShadow = settings.shadow
    ? '0 8px 24px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.45)'
    : undefined;

  return {
    left: `${(rect.xPct * 100).toFixed(2)}%`,
    top: `${(rect.yPct * 100).toFixed(2)}%`,
    width: `${(rect.widthPct * 100).toFixed(2)}%`,
    height: `${(rect.heightPct * 100).toFixed(2)}%`,
    objectFit: 'cover',
    border,
    borderRadius,
    boxShadow,
  };
}

/**
 * Builds FFmpeg complex filter expression for compositing grid cells.
 */
export function buildFfmpegGridFilter(
  layout: PipGridLayoutType,
  cellIndex: number,
  canvasWidth: number = 1920,
  canvasHeight: number = 1080
): { scale: string; overlay: string } {
  const cells = calculateGridLayoutCells(layout);
  const safeIndex = Math.max(0, Math.min(cells.length - 1, cellIndex));
  const rect = cells[safeIndex];

  const w = Math.round(rect.widthPct * canvasWidth);
  const h = Math.round(rect.heightPct * canvasHeight);
  const x = Math.round(rect.xPct * canvasWidth);
  const y = Math.round(rect.yPct * canvasHeight);

  return {
    scale: `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    overlay: `overlay=${x}:${y}`,
  };
}

/**
 * Automatically assigns sequential grid layout settings across an array of overlapping clips.
 */
export function autoAssignCollageGrid(
  clips: readonly { id: string }[],
  layout: PipGridLayoutType,
  options?: {
    gapPx?: number;
    borderWidthPx?: number;
    borderColorHex?: string;
    cornerRadiusPx?: number;
    shadow?: boolean;
  },
): { clipId: string; pipGrid: ClipPipGridSettings }[] {
  const def = PIP_GRID_LAYOUTS.find((l) => l.layout === layout);
  const maxCells = def?.maxCells ?? 4;

  return clips.slice(0, maxCells).map((clip, index) => ({
    clipId: clip.id,
    pipGrid: {
      enabled: true,
      layout,
      cellIndex: index,
      gapPx: options?.gapPx ?? 4,
      borderWidthPx: options?.borderWidthPx ?? 2,
      borderColorHex: options?.borderColorHex ?? '#ffffff',
      cornerRadiusPx: options?.cornerRadiusPx ?? 8,
      shadow: options?.shadow ?? true,
    },
  }));
}

