import { describe, it, expect } from 'vitest';
import {
  clamp,
  snapCoordinate,
  calculateGizmoDragPosition,
  calculateGizmoResize,
  calculateGizmoRotation,
  MIN_GIZMO_SCALE,
  MAX_GIZMO_SCALE,
} from '../transform-gizmo-ops';

describe('transform-gizmo-ops', () => {
  describe('clamp', () => {
    it('clamps values below minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps values above maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('preserves values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });
  });

  describe('snapCoordinate', () => {
    it('snaps within tolerance to center 0.5', () => {
      const result = snapCoordinate(0.51, [0.5], 0.02);
      expect(result.snapped).toBe(true);
      expect(result.value).toBe(0.5);
      expect(result.stop).toBe(0.5);
    });

    it('does not snap when distance exceeds tolerance', () => {
      const result = snapCoordinate(0.55, [0.5], 0.02);
      expect(result.snapped).toBe(false);
      expect(result.value).toBe(0.55);
      expect(result.stop).toBeNull();
    });
  });

  describe('calculateGizmoDragPosition', () => {
    const boxDims = { width: 1000, height: 1000 };

    it('moves position proportionally to pixel displacement without snapping', () => {
      const initial = { x: 0.2, y: 0.2 };
      const delta = { x: 100, y: 50 }; // +0.1 X, +0.05 Y
      const result = calculateGizmoDragPosition(initial, delta, boxDims, false);

      expect(result.x).toBeCloseTo(0.3, 4);
      expect(result.y).toBeCloseTo(0.25, 4);
      expect(result.activeGuides).toHaveLength(0);
    });

    it('snaps to center (0.5, 0.5) when near center stop', () => {
      const initial = { x: 0.45, y: 0.45 };
      const delta = { x: 45, y: 45 }; // -> 0.495, within 0.018 of 0.5
      const result = calculateGizmoDragPosition(initial, delta, boxDims, true);

      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0.5);
      expect(result.activeGuides.some((g) => g.axis === 'x' && g.positionPct === 0.5)).toBe(true);
      expect(result.activeGuides.some((g) => g.axis === 'y' && g.positionPct === 0.5)).toBe(true);
    });

    it('clamps position to [0, 1] frame bounds', () => {
      const initial = { x: 0.9, y: 0.9 };
      const delta = { x: 500, y: 500 };
      const result = calculateGizmoDragPosition(initial, delta, boxDims, false);

      expect(result.x).toBe(1);
      expect(result.y).toBe(1);
    });
  });

  describe('calculateGizmoResize', () => {
    const boxDims = { width: 1000, height: 1000 };

    it('increases scale when dragging south-east outward', () => {
      const initialScale = 0.5;
      const delta = { x: 100, y: 100 };
      const newScale = calculateGizmoResize(initialScale, 'se', delta, boxDims);

      expect(newScale).toBeGreaterThan(initialScale);
    });

    it('decreases scale when dragging south-east inward', () => {
      const initialScale = 0.5;
      const delta = { x: -100, y: -100 };
      const newScale = calculateGizmoResize(initialScale, 'se', delta, boxDims);

      expect(newScale).toBeLessThan(initialScale);
    });

    it('respects min and max scale bounds', () => {
      const smallScale = calculateGizmoResize(0.1, 'nw', { x: 2000, y: 2000 }, boxDims);
      expect(smallScale).toBe(MIN_GIZMO_SCALE);

      const largeScale = calculateGizmoResize(1.0, 'se', { x: 5000, y: 5000 }, boxDims);
      expect(largeScale).toBe(MAX_GIZMO_SCALE);
    });
  });

  describe('calculateGizmoRotation', () => {
    const center = { x: 500, y: 500 };

    it('returns 0 when pointer is directly above center', () => {
      const pointer = { x: 500, y: 300 }; // 0 deg (north)
      expect(calculateGizmoRotation(center, pointer)).toBe(0);
    });

    it('snaps to 0 degrees when within snap threshold', () => {
      const pointer = { x: 505, y: 300 }; // small deviation
      expect(calculateGizmoRotation(center, pointer, 3)).toBe(0);
    });

    it('computes 90 degrees when pointer is east', () => {
      const pointer = { x: 700, y: 500 };
      expect(calculateGizmoRotation(center, pointer)).toBe(90);
    });

    it('computes 180 degrees when pointer is south', () => {
      const pointer = { x: 500, y: 700 };
      expect(calculateGizmoRotation(center, pointer)).toBe(180);
    });

    it('computes -90 degrees when pointer is west', () => {
      const pointer = { x: 300, y: 500 };
      expect(calculateGizmoRotation(center, pointer)).toBe(-90);
    });
  });
});
