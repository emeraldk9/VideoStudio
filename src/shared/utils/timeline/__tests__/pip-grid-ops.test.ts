import { describe, it, expect } from 'vitest';
import {
  PIP_GRID_LAYOUTS,
  DEFAULT_PIP_GRID_SETTINGS,
  calculateGridLayoutCells,
  getClipGridRect,
  buildCssGridStyle,
  buildFfmpegGridFilter,
  autoAssignCollageGrid,
  type ClipPipGridSettings,
} from '../pip-grid-ops';

describe('pip-grid-ops', () => {
  describe('PIP_GRID_LAYOUTS', () => {
    it('contains all 14 curated layout templates with complete metadata', () => {
      expect(PIP_GRID_LAYOUTS).toHaveLength(14);
      const keys = PIP_GRID_LAYOUTS.map((l) => l.layout);
      expect(keys).toContain('split_horizontal_50');
      expect(keys).toContain('split_vertical_50');
      expect(keys).toContain('grid_2x2');
      expect(keys).toContain('grid_3_split');
      expect(keys).toContain('grid_3x3');
      expect(keys).toContain('pip_floating_br');
      expect(keys).toContain('pip_floating_tr');
      expect(keys).toContain('pip_floating_tl');
      expect(keys).toContain('pip_floating_bl');
      expect(keys).toContain('triple_portrait_16x9');
      // S75 New Layouts
      expect(keys).toContain('split_3_columns');
      expect(keys).toContain('split_1_top_2_bottom');
      expect(keys).toContain('split_2_top_1_bottom');
      expect(keys).toContain('split_cinema_2');

      for (const def of PIP_GRID_LAYOUTS) {
        expect(def.label).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.maxCells).toBeGreaterThanOrEqual(1);
        expect(['split', 'grid', 'pip', 'social']).toContain(def.category);
      }
    });
  });

  describe('calculateGridLayoutCells', () => {
    it('calculates 2 cells for split_horizontal_50 side-by-side', () => {
      const cells = calculateGridLayoutCells('split_horizontal_50', 0);
      expect(cells).toHaveLength(2);
      expect(cells[0].xPct).toBe(0);
      expect(cells[0].widthPct).toBe(0.5);
      expect(cells[0].heightPct).toBe(1);

      expect(cells[1].xPct).toBe(0.5);
      expect(cells[1].widthPct).toBe(0.5);
      expect(cells[1].heightPct).toBe(1);
    });

    it('calculates 2 cells for split_vertical_50 stacked', () => {
      const cells = calculateGridLayoutCells('split_vertical_50', 0);
      expect(cells).toHaveLength(2);
      expect(cells[0].yPct).toBe(0);
      expect(cells[0].heightPct).toBe(0.5);

      expect(cells[1].yPct).toBe(0.5);
      expect(cells[1].heightPct).toBe(0.5);
    });

    it('calculates 4 quadrants for grid_2x2', () => {
      const cells = calculateGridLayoutCells('grid_2x2', 0);
      expect(cells).toHaveLength(4);
      for (const cell of cells) {
        expect(cell.widthPct).toBe(0.5);
        expect(cell.heightPct).toBe(0.5);
        expect(cell.xPct).toBeGreaterThanOrEqual(0);
        expect(cell.yPct).toBeGreaterThanOrEqual(0);
      }
    });

    it('calculates 3 cells for grid_3_split with 60% main left and two 40% stacked right', () => {
      const cells = calculateGridLayoutCells('grid_3_split', 0);
      expect(cells).toHaveLength(3);
      // Main left
      expect(cells[0].xPct).toBe(0);
      expect(cells[0].widthPct).toBe(0.6);
      expect(cells[0].heightPct).toBe(1);
      // Top right
      expect(cells[1].xPct).toBe(0.6);
      expect(cells[1].widthPct).toBe(0.4);
      expect(cells[1].heightPct).toBe(0.5);
      // Bottom right
      expect(cells[2].xPct).toBe(0.6);
      expect(cells[2].widthPct).toBe(0.4);
      expect(cells[2].heightPct).toBe(0.5);
    });

    it('calculates 9 cells for grid_3x3', () => {
      const cells = calculateGridLayoutCells('grid_3x3', 0);
      expect(cells).toHaveLength(9);
      for (const cell of cells) {
        expect(cell.widthPct).toBeCloseTo(1 / 3, 3);
        expect(cell.heightPct).toBeCloseTo(1 / 3, 3);
      }
    });

    it('calculates 1 inset cell for pip_floating_br in the bottom-right corner', () => {
      const cells = calculateGridLayoutCells('pip_floating_br', 0);
      expect(cells).toHaveLength(1);
      expect(cells[0].xPct).toBeGreaterThan(0.6);
      expect(cells[0].yPct).toBeGreaterThan(0.6);
      expect(cells[0].widthPct).toBe(0.28);
    });

    it('calculates 3 vertical cells for triple_portrait_16x9', () => {
      const cells = calculateGridLayoutCells('triple_portrait_16x9', 0);
      expect(cells).toHaveLength(3);
      for (const cell of cells) {
        expect(cell.heightPct).toBe(0.92);
        expect(cell.widthPct).toBe(0.26);
      }
    });

    it('calculates 3 equal column cells for split_3_columns (S75)', () => {
      const cells = calculateGridLayoutCells('split_3_columns', 0);
      expect(cells).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(cells[i].widthPct).toBeCloseTo(1 / 3, 3);
        expect(cells[i].heightPct).toBe(1);
        expect(cells[i].xPct).toBeCloseTo(i / 3, 3);
      }
    });

    it('calculates 1 top hero and 2 bottom cells for split_1_top_2_bottom (S75)', () => {
      const cells = calculateGridLayoutCells('split_1_top_2_bottom', 0);
      expect(cells).toHaveLength(3);
      // Top hero
      expect(cells[0].xPct).toBe(0);
      expect(cells[0].yPct).toBe(0);
      expect(cells[0].widthPct).toBe(1);
      expect(cells[0].heightPct).toBe(0.5);
      // Bottom left
      expect(cells[1].xPct).toBe(0);
      expect(cells[1].yPct).toBe(0.5);
      expect(cells[1].widthPct).toBe(0.5);
      expect(cells[1].heightPct).toBe(0.5);
      // Bottom right
      expect(cells[2].xPct).toBe(0.5);
      expect(cells[2].yPct).toBe(0.5);
      expect(cells[2].widthPct).toBe(0.5);
      expect(cells[2].heightPct).toBe(0.5);
    });

    it('calculates 2 top cells and 1 bottom hero for split_2_top_1_bottom (S75)', () => {
      const cells = calculateGridLayoutCells('split_2_top_1_bottom', 0);
      expect(cells).toHaveLength(3);
      // Top left
      expect(cells[0].xPct).toBe(0);
      expect(cells[0].yPct).toBe(0);
      expect(cells[0].widthPct).toBe(0.5);
      expect(cells[0].heightPct).toBe(0.5);
      // Top right
      expect(cells[1].xPct).toBe(0.5);
      expect(cells[1].yPct).toBe(0);
      expect(cells[1].widthPct).toBe(0.5);
      expect(cells[1].heightPct).toBe(0.5);
      // Bottom hero
      expect(cells[2].xPct).toBe(0);
      expect(cells[2].yPct).toBe(0.5);
      expect(cells[2].widthPct).toBe(1);
      expect(cells[2].heightPct).toBe(0.5);
    });

    it('calculates cinematic letterbox horizontal dual split for split_cinema_2 (S75)', () => {
      const cells = calculateGridLayoutCells('split_cinema_2', 0);
      expect(cells).toHaveLength(2);
      expect(cells[0].yPct).toBe(0.06);
      expect(cells[0].heightPct).toBe(0.44);
      expect(cells[1].yPct).toBe(0.50);
      expect(cells[1].heightPct).toBe(0.44);
    });
  });

  describe('getClipGridRect', () => {
    it('returns undefined if settings are missing or disabled', () => {
      expect(getClipGridRect(undefined)).toBeUndefined();
      expect(getClipGridRect(DEFAULT_PIP_GRID_SETTINGS)).toBeUndefined();
    });

    it('returns specified cell position and clamps overflow indices safely', () => {
      const settings: ClipPipGridSettings = {
        enabled: true,
        layout: 'split_horizontal_50',
        cellIndex: 1,
      };
      const rect = getClipGridRect(settings);
      expect(rect).toBeDefined();
      expect(rect?.xPct).toBe(0.5);

      // Overflow cellIndex 99 on a 2-cell layout should clamp to index 1
      const overflow = getClipGridRect({ ...settings, cellIndex: 99 });
      expect(overflow?.xPct).toBe(0.5);
    });
  });

  describe('buildCssGridStyle', () => {
    it('returns empty style when disabled', () => {
      expect(buildCssGridStyle(undefined)).toEqual({});
      expect(buildCssGridStyle(DEFAULT_PIP_GRID_SETTINGS)).toEqual({});
    });

    it('generates percentage dimensions, borders, radii and shadows when enabled', () => {
      const settings: ClipPipGridSettings = {
        enabled: true,
        layout: 'pip_floating_br',
        cellIndex: 0,
        borderWidthPx: 3,
        borderColorHex: '#00F0FF',
        cornerRadiusPx: 12,
        shadow: true,
      };

      const style = buildCssGridStyle(settings);
      expect(style.width).toBe('28.00%');
      expect(style.height).toBe('28.00%');
      expect(style.border).toBe('3px solid #00F0FF');
      expect(style.borderRadius).toBe('12px');
      expect(style.boxShadow).toContain('rgba(0, 0, 0,');
    });
  });

  describe('buildFfmpegGridFilter', () => {
    it('generates scale and overlay filter expressions for 1080p canvas', () => {
      const filter = buildFfmpegGridFilter('split_horizontal_50', 0, 1920, 1080);
      expect(filter.scale).toContain('scale=960:1080');
      expect(filter.overlay).toBe('overlay=0:0');

      const filterRight = buildFfmpegGridFilter('split_horizontal_50', 1, 1920, 1080);
      expect(filterRight.scale).toContain('scale=960:1080');
      expect(filterRight.overlay).toBe('overlay=960:0');
    });
  });

  describe('autoAssignCollageGrid', () => {
    it('automatically assigns sequential cell slots across overlapping clips up to layout capacity', () => {
      const mockClips = [
        { id: 'clip-1', startFrames: 0, durationFrames: 100 },
        { id: 'clip-2', startFrames: 0, durationFrames: 100 },
        { id: 'clip-3', startFrames: 0, durationFrames: 100 },
        { id: 'clip-4', startFrames: 0, durationFrames: 100 },
      ];

      const assignments = autoAssignCollageGrid(mockClips, 'split_1_top_2_bottom', {
        borderWidthPx: 2,
        borderColorHex: '#FFFFFF',
        cornerRadiusPx: 8,
      });

      // Layout maxCells is 3, so first 3 clips get assigned unique slots
      expect(assignments).toHaveLength(3);
      expect(assignments[0]).toEqual({
        clipId: 'clip-1',
        pipGrid: {
          enabled: true,
          layout: 'split_1_top_2_bottom',
          cellIndex: 0,
          borderWidthPx: 2,
          borderColorHex: '#FFFFFF',
          cornerRadiusPx: 8,
          gapPx: 4,
          shadow: true,
        },
      });

      expect(assignments[1].pipGrid.cellIndex).toBe(1);
      expect(assignments[2].pipGrid.cellIndex).toBe(2);
    });
  });
});
