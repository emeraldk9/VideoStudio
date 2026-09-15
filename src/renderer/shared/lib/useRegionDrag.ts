import { useCallback, useRef, useState } from 'react';

/** A rectangle normalized to its container (0..1, origin top-left). */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `move` drags the whole rect; the eight compass points resize the edges they name. */
export type RegionHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const REGION_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

/** Which guide, if any, an edge snapped to on the last move — drawn by the caller. */
export interface RegionSnapGuides {
  x?: number;
  y?: number;
}

/**
 * Guide positions a dragged edge may snap to, in normalized units — typically
 * the image edges plus every *other* region's edges.
 */
export interface RegionSnapOptions {
  xs: readonly number[];
  ys: readonly number[];
  /** Normalized distance within which an edge snaps. */
  threshold: number;
}

/** Per-gesture settings, supplied at `startDrag` because they depend on which rect is grabbed. */
export interface RegionDragGesture {
  snap?: RegionSnapOptions;
  /**
   * Receives this gesture's updates instead of the hook-level `onChange`.
   * An editor over several rects needs to know *which* one moved, and the
   * cleanest place to bind that is where the gesture begins.
   */
  onChange?: (rect: NormalizedRect, guides: RegionSnapGuides) => void;
  onEnd?: () => void;
}

/**
 * Beta S235 — dragging and resizing a normalized rectangle over an image.
 *
 * ## Why this lives in `shared/lib`
 *
 * `features/story-builder`'s sheet-layout editor and `features/watermark-
 * removal`'s region picker both need exactly this, and slices are siblings
 * that may not import each other, so the only legal way to share the
 * mechanics is to move them down a layer. S235 landed the hook with the
 * watermark box as its first consumer and the sheet editor as a documented
 * duplicate; the editor has since adopted it, which is where the snapping
 * came from.
 *
 * ## Why document-level listeners rather than pointer capture
 *
 * A resize handle is a few pixels across. Capturing the pointer on the handle
 * means a fast drag that outruns the element loses the gesture halfway through
 * — the rect stops following the cursor and the user has to grab it again.
 * Listening on the document for the duration of the gesture keeps the drag
 * attached however far or fast the pointer travels, including outside the
 * window.
 */
export interface UseRegionDragOptions {
  /** Called on every pointer move with the updated rect, unless the gesture names its own receiver. */
  onChange?: (rect: NormalizedRect, guides: RegionSnapGuides) => void;
  /** Called once when the pointer is released or the gesture is cancelled. */
  onEnd?: () => void;
  /**
   * Smallest edge, as a fraction of the container.
   *
   * A rect is allowed to be genuinely small — a Veo text mark is under 2% of a
   * 1280px frame — so this floor is deliberately tiny. It exists only to stop a
   * rect collapsing to zero, which would be unselectable and would produce a
   * degenerate crop downstream. The sheet editor raises it to match its
   * store's own clamp.
   */
  minSize?: number;
}

const DEFAULT_MIN_SIZE = 0.005;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** The nearest guide within the threshold, or nothing. */
function snapTo(
  value: number,
  candidates: readonly number[] | undefined,
  threshold: number,
): number | undefined {
  if (!candidates) return undefined;
  let best: number | undefined;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= threshold && (best === undefined || distance < Math.abs(best - value))) {
      best = candidate;
    }
  }
  return best;
}

/**
 * One pointer move applied to the rect the gesture started on. Pure, so the
 * arithmetic — which is the part that goes wrong — is testable without a DOM.
 *
 * Translation clamps the *origin* against the rect's own size, so a rect
 * dragged past an edge stops flush with it rather than being squashed;
 * resizing is a different gesture and stays one. Resizing moves only the edges
 * the handle names, with the far edge fixed and the size derived rather than
 * accumulated — otherwise rounding drifts the opposite edge over a long drag.
 * A snap is only taken when it keeps the rect at least `minSize`.
 */
export function applyRegionDrag(
  origin: NormalizedRect,
  handle: RegionHandle,
  dx: number,
  dy: number,
  minSize: number,
  snap?: RegionSnapOptions,
): { rect: NormalizedRect; guides: RegionSnapGuides } {
  const guides: RegionSnapGuides = {};
  const threshold = snap?.threshold ?? 0;

  if (handle === 'move') {
    let x = Math.max(0, Math.min(1 - origin.w, origin.x + dx));
    let y = Math.max(0, Math.min(1 - origin.h, origin.y + dy));
    // Either edge of each axis may snap; the near edge is tried first.
    const left = snapTo(x, snap?.xs, threshold);
    const right = left === undefined ? snapTo(x + origin.w, snap?.xs, threshold) : undefined;
    if (left !== undefined) {
      x = left;
      guides.x = left;
    } else if (right !== undefined) {
      x = right - origin.w;
      guides.x = right;
    }
    const top = snapTo(y, snap?.ys, threshold);
    const bottom = top === undefined ? snapTo(y + origin.h, snap?.ys, threshold) : undefined;
    if (top !== undefined) {
      y = top;
      guides.y = top;
    } else if (bottom !== undefined) {
      y = bottom - origin.h;
      guides.y = bottom;
    }
    return { rect: { x, y, w: origin.w, h: origin.h }, guides };
  }

  let x0 = origin.x;
  let y0 = origin.y;
  let x1 = origin.x + origin.w;
  let y1 = origin.y + origin.h;
  if (handle.includes('w')) x0 = Math.max(0, Math.min(x1 - minSize, x0 + dx));
  if (handle.includes('e')) x1 = Math.min(1, Math.max(x0 + minSize, x1 + dx));
  if (handle.includes('n')) y0 = Math.max(0, Math.min(y1 - minSize, y0 + dy));
  if (handle.includes('s')) y1 = Math.min(1, Math.max(y0 + minSize, y1 + dy));

  if (handle.includes('w')) {
    const snapped = snapTo(x0, snap?.xs, threshold);
    if (snapped !== undefined && snapped < x1 - minSize) {
      x0 = snapped;
      guides.x = snapped;
    }
  }
  if (handle.includes('e')) {
    const snapped = snapTo(x1, snap?.xs, threshold);
    if (snapped !== undefined && snapped > x0 + minSize) {
      x1 = snapped;
      guides.x = snapped;
    }
  }
  if (handle.includes('n')) {
    const snapped = snapTo(y0, snap?.ys, threshold);
    if (snapped !== undefined && snapped < y1 - minSize) {
      y0 = snapped;
      guides.y = snapped;
    }
  }
  if (handle.includes('s')) {
    const snapped = snapTo(y1, snap?.ys, threshold);
    if (snapped !== undefined && snapped > y0 + minSize) {
      y1 = snapped;
      guides.y = snapped;
    }
  }

  return {
    rect: { x: clamp01(x0), y: clamp01(y0), w: x1 - x0, h: y1 - y0 },
    guides,
  };
}

export function useRegionDrag({ onChange, onEnd, minSize = DEFAULT_MIN_SIZE }: UseRegionDragOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback(
    (
      event: React.PointerEvent,
      rect: NormalizedRect,
      handle: RegionHandle,
      gesture: RegionDragGesture = {},
    ) => {
      // Without this a drag that begins on the overlay also starts a native
      // image drag or a text selection, and the gesture fights the browser.
      event.preventDefault();
      event.stopPropagation();

      const emit = gesture.onChange ?? onChange;
      const container = containerRef.current;
      if (!container || !emit) return;

      const bounds = container.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;

      const startX = event.clientX;
      const startY = event.clientY;
      // Only the geometry: a caller may hand in a richer object (a draft region
      // with its own key), and what comes back must not carry stale copies.
      const origin: NormalizedRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      setDragging(true);

      const onMove = (move: PointerEvent) => {
        const dx = (move.clientX - startX) / bounds.width;
        const dy = (move.clientY - startY) / bounds.height;
        const next = applyRegionDrag(origin, handle, dx, dy, minSize, gesture.snap);
        emit(next.rect, next.guides);
      };

      const onUp = () => {
        setDragging(false);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        gesture.onEnd?.();
        onEnd?.();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      // `pointercancel` matters: the OS can take the pointer away (a touch
      // becoming a scroll, a window losing focus mid-drag). Without it the
      // listeners survive the gesture and the next click keeps resizing.
      document.addEventListener('pointercancel', onUp);
    },
    [minSize, onChange, onEnd],
  );

  return { containerRef, startDrag, dragging };
}

/** Inline styles positioning one resize handle on the rect's edge. */
export function regionHandleStyle(handle: (typeof REGION_HANDLES)[number]): React.CSSProperties {
  return {
    position: 'absolute',
    width: 10,
    height: 10,
    cursor: `${handle}-resize`,
    left: handle.includes('w') ? -5 : handle.includes('e') ? undefined : 'calc(50% - 5px)',
    right: handle.includes('e') ? -5 : undefined,
    top: handle.includes('n') ? -5 : handle.includes('s') ? undefined : 'calc(50% - 5px)',
    bottom: handle.includes('s') ? -5 : undefined,
  };
}
