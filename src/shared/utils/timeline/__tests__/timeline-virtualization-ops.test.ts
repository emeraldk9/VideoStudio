import { describe, expect, it } from 'vitest';

import {
  calculateVisibleClipSlice,
  calculateVirtualizedViewport,
  isClipInViewportWindow,
  LRUCache,
  MAX_CANVAS_WINDOW_WIDTH_PX,
} from '../timeline-virtualization-ops';

describe('Milestone S175 — Timeline Viewport Virtualization & Memory Pooling Ops', () => {
  describe('calculateVirtualizedViewport', () => {
    it('returns empty window for invalid dimensions', () => {
      const result = calculateVirtualizedViewport({
        scrollLeft: 0,
        viewportWidth: 0,
        totalWidthPx: 0,
      });
      expect(result.windowWidth).toBe(0);
      expect(result.isVirtualized).toBe(false);
    });

    it('does not virtualize when sequence fits comfortably within max window width', () => {
      const result = calculateVirtualizedViewport({
        scrollLeft: 100,
        viewportWidth: 1200,
        totalWidthPx: 2500,
        maxWindowWidth: 3840,
      });
      expect(result.isVirtualized).toBe(false);
      expect(result.windowLeft).toBe(0);
      expect(result.windowWidth).toBe(2500);
      expect(result.windowRight).toBe(2500);
    });

    it('virtualizes and clamps window when sequence is large (e.g. 50,000px)', () => {
      const result = calculateVirtualizedViewport({
        scrollLeft: 10000,
        viewportWidth: 1920,
        totalWidthPx: 50000,
        overscanPx: 600,
        maxWindowWidth: 3840,
        quantizeStep: 200,
      });

      expect(result.isVirtualized).toBe(true);
      // rawLeft = 10000 - 600 = 9400 -> quantized to 200 is 9400
      expect(result.windowLeft).toBe(9400);
      // windowWidth should not exceed maxWindowWidth
      expect(result.windowWidth).toBeLessThanOrEqual(MAX_CANVAS_WINDOW_WIDTH_PX);
      expect(result.windowRight).toBe(result.windowLeft + result.windowWidth);
      expect(result.windowRight).toBeGreaterThan(10000 + 1920); // covers viewport
    });

    it('clamps left edge at 0 and does not overshoot totalWidthPx on right', () => {
      const atStart = calculateVirtualizedViewport({
        scrollLeft: 50,
        viewportWidth: 1920,
        totalWidthPx: 20000,
        overscanPx: 600,
      });
      expect(atStart.windowLeft).toBe(0);

      const atEnd = calculateVirtualizedViewport({
        scrollLeft: 19500,
        viewportWidth: 1000,
        totalWidthPx: 20000,
        overscanPx: 600,
      });
      expect(atEnd.windowRight).toBeLessThanOrEqual(20000);
    });
  });

  describe('isClipInViewportWindow', () => {
    const windowLeft = 1000;
    const windowRight = 3000;

    it('returns true when clip is fully inside the window', () => {
      expect(isClipInViewportWindow(1500, 500, windowLeft, windowRight)).toBe(true);
    });

    it('returns true when clip straddles the left boundary', () => {
      expect(isClipInViewportWindow(800, 400, windowLeft, windowRight)).toBe(true);
    });

    it('returns true when clip straddles the right boundary', () => {
      expect(isClipInViewportWindow(2800, 500, windowLeft, windowRight)).toBe(true);
    });

    it('returns false when clip is entirely to the left', () => {
      expect(isClipInViewportWindow(200, 500, windowLeft, windowRight)).toBe(false);
    });

    it('returns false when clip is entirely to the right', () => {
      expect(isClipInViewportWindow(3200, 500, windowLeft, windowRight)).toBe(false);
    });

    it('returns false when clip has 0 or negative width', () => {
      expect(isClipInViewportWindow(1500, 0, windowLeft, windowRight)).toBe(false);
    });
  });

  describe('calculateVisibleClipSlice', () => {
    it('returns empty slice when clip is outside window', () => {
      const slice = calculateVisibleClipSlice(100, 200, 1000, 2000);
      expect(slice.hasVisibleColumns).toBe(false);
      expect(slice.visibleStartCol).toBe(0);
      expect(slice.visibleEndCol).toBe(0);
    });

    it('returns full columns when clip is completely inside window', () => {
      const slice = calculateVisibleClipSlice(1200, 400, 1000, 2000);
      expect(slice.hasVisibleColumns).toBe(true);
      expect(slice.visibleStartCol).toBe(0);
      expect(slice.visibleEndCol).toBe(400);
    });

    it('slices left columns when clip extends to the left of the window', () => {
      // Clip from 800 to 1400 (width 600). Window is 1000 to 2000.
      // Columns from 0 to 200 (x 800 to 1000) are outside the window.
      // Visible columns are from 200 to 600.
      const slice = calculateVisibleClipSlice(800, 600, 1000, 2000);
      expect(slice.hasVisibleColumns).toBe(true);
      expect(slice.visibleStartCol).toBe(200);
      expect(slice.visibleEndCol).toBe(600);
    });

    it('slices right columns when clip extends to the right of the window', () => {
      // Clip from 1800 to 2400 (width 600). Window is 1000 to 2000.
      // Columns from 200 to 600 (x 2000 to 2400) are outside the window.
      // Visible columns are from 0 to 200.
      const slice = calculateVisibleClipSlice(1800, 600, 1000, 2000);
      expect(slice.hasVisibleColumns).toBe(true);
      expect(slice.visibleStartCol).toBe(0);
      expect(slice.visibleEndCol).toBe(200);
    });
  });

  describe('LRUCache', () => {
    it('stores and retrieves key-value entries', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBeUndefined();
    });

    it('evicts least recently used entry when capacity is reached', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      // Access 'a' to make it most recently used; order becomes: b, c, a
      expect(cache.get('a')).toBe(1);

      // Insert 'd' -> 'b' is evicted
      cache.set('d', 4);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.size()).toBe(3);
    });

    it('handles delete and clear', () => {
      const cache = new LRUCache<string, string>(5);
      cache.set('x', '10');
      cache.set('y', '20');
      expect(cache.size()).toBe(2);

      cache.delete('x');
      expect(cache.has('x')).toBe(false);
      expect(cache.size()).toBe(1);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('y')).toBeUndefined();
    });
  });
});
