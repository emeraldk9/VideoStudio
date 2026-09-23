import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ErrorBoundary } from '../../../shared/ui/ErrorBoundary';
import { ResizeHandle } from './ResizeHandle';

/**
 * Beta S154 — the editor's frame: a 2×3 grid the whole screen lives in.
 *
 * ```
 * media │ player │ inspector      ← top zone, 70% (30 / 40 / 30)
 * ══════╪════════╪══════════      ← row handle
 *        the dock                 ← bottom, 30%
 * ```
 *
 * One CSS grid owns both axes, and the three handles are **real grid tracks**
 * rather than absolutely-positioned overlays — so a column resize cannot drift
 * the dock out of alignment with the columns above it, because there is
 * nothing to drift: the browser lays out both from the same template.
 *
 * The ratios are component state persisted to `localStorage` (read-on-init,
 * the `shellStore.libraryCardSize` pattern) and deliberately **not** a store:
 * the panes are laid out by this grid and none of them reads its own size, so
 * a store subscription would exist for no subscriber.
 *
 * Minimums are clamped here, in pixels against the measured container — not
 * with CSS `minmax()`, which interacts badly with `fr` once a track hits its
 * floor (the remaining `fr` tracks reflow around a pinned one and the handle
 * position stops corresponding to the stored ratio).
 */

const STORAGE_KEY = 'ai_video_studio_timeline_layout';

/** Owner-specified defaults (2026-08-13): 70/30 vertically, 30/40/30 across. */
const DEFAULTS = { dock: 30, left: 30, right: 30 } as const;

/** Pixel floors. Top zone / dock, then the three columns. */
const MIN_TOP_PX = 200;
const MIN_DOCK_PX = 160;
const MIN_LEFT_PX = 240;
const MIN_CENTER_PX = 320;
const MIN_RIGHT_PX = 240;

const HANDLE_PX = 6;

interface Ratios {
  /** The dock's share of the workspace height, percent. */
  dock: number;
  /** The media column's share of the width, percent. */
  left: number;
  /** The inspector column's share of the width, percent. */
  right: number;
}

function readStoredRatios(): Ratios {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    const candidate = parsed as Partial<Ratios>;
    const percent = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100
        ? value
        : fallback;
    return {
      dock: percent(candidate.dock, DEFAULTS.dock),
      left: percent(candidate.left, DEFAULTS.left),
      right: percent(candidate.right, DEFAULTS.right),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export interface TimelineWorkspaceProps {
  media: ReactNode;
  player: ReactNode;
  inspector: ReactNode;
  dock: ReactNode;
}

export function TimelineWorkspace({ media, player, inspector, dock }: TimelineWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratios, setRatios] = useState<Ratios>(readStoredRatios);
  /** The ratio set as of drag start — deltas apply to this, not to the live value. */
  const dragBase = useRef<Ratios>(ratios);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ratios));
  }, [ratios]);

  /** Clamp a dock percentage so both rows respect their pixel floors. */
  const clampDock = useCallback((percent: number): number => {
    const height = containerRef.current?.clientHeight ?? 0;
    if (height <= MIN_TOP_PX + MIN_DOCK_PX + HANDLE_PX) return percent;
    const usable = height - HANDLE_PX;
    const min = (MIN_DOCK_PX / usable) * 100;
    const max = 100 - (MIN_TOP_PX / usable) * 100;
    return Math.min(max, Math.max(min, percent));
  }, []);

  /** Clamp one column's percentage so all three respect their pixel floors. */
  const clampColumn = useCallback((percent: number, other: number, ownMinPx: number): number => {
    const width = containerRef.current?.clientWidth ?? 0;
    if (width <= MIN_LEFT_PX + MIN_CENTER_PX + MIN_RIGHT_PX + 2 * HANDLE_PX) return percent;
    const usable = width - 2 * HANDLE_PX;
    const min = (ownMinPx / usable) * 100;
    const max = 100 - other - (MIN_CENTER_PX / usable) * 100;
    return Math.min(max, Math.max(min, percent));
  }, []);

  const heightPct = useCallback((): number => {
    const height = containerRef.current?.clientHeight ?? 0;
    return height > HANDLE_PX ? 100 / (height - HANDLE_PX) : 0;
  }, []);
  const widthPct = useCallback((): number => {
    const width = containerRef.current?.clientWidth ?? 0;
    return width > 2 * HANDLE_PX ? 100 / (width - 2 * HANDLE_PX) : 0;
  }, []);

  const beginDrag = useCallback(() => {
    dragBase.current = ratios;
  }, [ratios]);

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-0 w-full"
      style={{
        gridTemplateRows: `minmax(0, ${100 - ratios.dock}fr) ${HANDLE_PX}px minmax(0, ${ratios.dock}fr)`,
        gridTemplateColumns: `minmax(0, ${ratios.left}fr) ${HANDLE_PX}px minmax(0, ${100 - ratios.left - ratios.right}fr) ${HANDLE_PX}px minmax(0, ${ratios.right}fr)`,
      }}
    >
      {/* S160 (owner item 5) — the top inset lives HERE, on the grid's own
          sections, not in each pane: the middle and right columns shipped
          without one (their content sat flush against the window chrome)
          because every pane padded itself and two forgot. One owner, no drift. */}
      <section aria-label="Media" className="flex min-h-0 min-w-0 flex-col overflow-hidden pt-2">
        {media}
      </section>

      <ResizeHandle
        orientation="vertical"
        label="Resize media column"
        value={ratios.left}
        min={10}
        max={60}
        onDragStart={beginDrag}
        onDrag={(deltaPx) =>
          setRatios((current) => ({
            ...current,
            left: clampColumn(dragBase.current.left + deltaPx * widthPct(), current.right, MIN_LEFT_PX),
          }))
        }
        onKeyChange={(next) =>
          setRatios((current) => ({
            ...current,
            left: clampColumn(next, current.right, MIN_LEFT_PX),
          }))
        }
        onReset={() => setRatios((current) => ({ ...current, left: DEFAULTS.left }))}
      />

      <section aria-label="Player" className="flex min-h-0 min-w-0 flex-col overflow-hidden pt-2">
        <ErrorBoundary fallbackTitle="Player Error">
          {player}
        </ErrorBoundary>
      </section>

      <ResizeHandle
        orientation="vertical"
        label="Resize inspector column"
        value={ratios.right}
        min={10}
        max={60}
        onDragStart={beginDrag}
        onDrag={(deltaPx) =>
          setRatios((current) => ({
            ...current,
            // The inspector's handle sits on its left edge, so dragging left
            // (negative delta) grows the column.
            right: clampColumn(dragBase.current.right - deltaPx * widthPct(), current.left, MIN_RIGHT_PX),
          }))
        }
        onKeyChange={(next) =>
          setRatios((current) => ({
            ...current,
            right: clampColumn(next, current.left, MIN_RIGHT_PX),
          }))
        }
        onReset={() => setRatios((current) => ({ ...current, right: DEFAULTS.right }))}
      />

      <section aria-label="Clip properties" className="flex min-h-0 min-w-0 flex-col overflow-hidden pt-2">
        <ErrorBoundary fallbackTitle="Inspector Error">
          {inspector}
        </ErrorBoundary>
      </section>

      {/* The row handle spans every column — one bar under the whole top zone. */}
      <ResizeHandle
        orientation="horizontal"
        label="Resize timeline dock"
        className="col-span-full row-start-2"
        value={ratios.dock}
        min={10}
        max={70}
        onDragStart={beginDrag}
        onDrag={(deltaPx) =>
          setRatios((current) => ({
            ...current,
            // Dragging up (negative delta) grows the dock.
            dock: clampDock(dragBase.current.dock - deltaPx * heightPct()),
          }))
        }
        onKeyChange={(next) => setRatios((current) => ({ ...current, dock: clampDock(next) }))}
        onReset={() => setRatios((current) => ({ ...current, dock: DEFAULTS.dock }))}
      />

      <section
        aria-label="Timeline dock"
        className="col-span-full row-start-3 flex min-h-0 min-w-0 flex-col overflow-hidden"
      >
        {dock}
      </section>
    </div>
  );
}
