/**
 * Timeline Viewport Virtualization & High-Capacity Waveform Memory Pooling Ops
 * (Milestone S175)
 *
 * Provides horizontal scroll window calculation, clip culling, visible column
 * slicing, and an in-memory LRU cache for audio peaks and filmstrip sheets.
 */

export interface ViewportWindow {
  windowLeft: number;
  windowWidth: number;
  windowRight: number;
  isVirtualized: boolean;
}

export interface ViewportWindowOptions {
  scrollLeft: number;
  viewportWidth: number;
  totalWidthPx: number;
  overscanPx?: number;
  maxWindowWidth?: number;
  quantizeStep?: number;
}

export const DEFAULT_VIEWPORT_OVERSCAN_PX = 600;
export const DEFAULT_VIEWPORT_QUANTIZE_PX = 200;
export const MAX_CANVAS_WINDOW_WIDTH_PX = 3840;

/**
 * Calculates a bounded viewport window for virtualized timeline canvases.
 * Prevents allocating oversized backing stores (e.g. 100,000px wide) which exhaust
 * GPU memory and trigger Chromium canvas dimension limits.
 */
export function calculateVirtualizedViewport(options: ViewportWindowOptions): ViewportWindow {
  const {
    scrollLeft,
    viewportWidth,
    totalWidthPx,
    overscanPx = DEFAULT_VIEWPORT_OVERSCAN_PX,
    maxWindowWidth = MAX_CANVAS_WINDOW_WIDTH_PX,
    quantizeStep = DEFAULT_VIEWPORT_QUANTIZE_PX,
  } = options;

  if (totalWidthPx <= 0 || viewportWidth <= 0) {
    return {
      windowLeft: 0,
      windowWidth: 0,
      windowRight: 0,
      isVirtualized: false,
    };
  }

  // If the total sequence width is small enough to fit within max window width,
  // do not virtualize — render the full canvas directly without shifting.
  if (totalWidthPx <= maxWindowWidth) {
    return {
      windowLeft: 0,
      windowWidth: Math.max(1, Math.round(totalWidthPx)),
      windowRight: Math.max(1, Math.round(totalWidthPx)),
      isVirtualized: false,
    };
  }

  // Calculate raw visible bounds with overscan buffer
  const rawLeft = Math.max(0, scrollLeft - overscanPx);
  // Quantize left position to prevent constant micro-shifts and canvas reallocations
  const windowLeft = Math.floor(rawLeft / quantizeStep) * quantizeStep;

  const rawRight = Math.min(totalWidthPx, scrollLeft + viewportWidth + overscanPx);
  const targetWidth = Math.max(1, rawRight - windowLeft);
  const windowWidth = Math.min(maxWindowWidth, Math.round(targetWidth));
  const windowRight = windowLeft + windowWidth;

  return {
    windowLeft,
    windowWidth,
    windowRight,
    isVirtualized: true,
  };
}

/**
 * Checks whether a clip's horizontal range overlaps the current viewport window.
 * Allows O(1) early culling of off-screen clips.
 */
export function isClipInViewportWindow(
  clipStartPx: number,
  clipWidthPx: number,
  windowLeft: number,
  windowRight: number,
): boolean {
  if (clipWidthPx <= 0) return false;
  return clipStartPx + clipWidthPx >= windowLeft && clipStartPx <= windowRight;
}

export interface VisibleClipSlice {
  visibleStartCol: number;
  visibleEndCol: number;
  hasVisibleColumns: boolean;
}

/**
 * Calculates the visible column range [visibleStartCol, visibleEndCol) relative
 * to the clip's local start position, avoiding looping through tens of thousands
 * of off-screen peak columns.
 */
export function calculateVisibleClipSlice(
  clipStartPx: number,
  clipWidthPx: number,
  windowLeft: number,
  windowRight: number,
): VisibleClipSlice {
  const totalColumns = Math.max(1, Math.floor(clipWidthPx));

  if (!isClipInViewportWindow(clipStartPx, clipWidthPx, windowLeft, windowRight)) {
    return {
      visibleStartCol: 0,
      visibleEndCol: 0,
      hasVisibleColumns: false,
    };
  }

  const startCol = Math.max(0, Math.floor(windowLeft - clipStartPx));
  const endCol = Math.min(totalColumns, Math.ceil(windowRight - clipStartPx));

  return {
    visibleStartCol: Math.max(0, Math.min(startCol, totalColumns)),
    visibleEndCol: Math.max(startCol, Math.min(endCol, totalColumns)),
    hasVisibleColumns: endCol > startCol,
  };
}

/**
 * High-performance generic Least-Recently-Used (LRU) cache.
 * Keeps memory bounded by evicting oldest entries when capacity is exceeded.
 */
export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, V>;

  constructor(capacity: number = 64) {
    this.capacity = Math.max(1, capacity);
    this.map = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    // Refresh access order: remove and re-insert
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Evict oldest entry (first item in Map iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

/** Global LRU cache for audio peak slices (up to 128 distinct media files) */
export const audioPeaksLRUCache = new LRUCache<string, number[] | null>(128);

/** Global LRU cache for filmstrip sheet metadata (up to 64 distinct video files) */
export const filmstripSheetLRUCache = new LRUCache<string, any>(64);
