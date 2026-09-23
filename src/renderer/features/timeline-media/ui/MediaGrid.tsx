import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TimelineDragSource } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useTileSelection } from '../../../shared/lib/useTileSelection';
import { addSourcesAtPlayhead, primaryTrackFor } from '../lib/add-to-timeline';
import { beginTimelineDrag } from '../lib/timeline-drag';

import { MediaTile, type MediaTileProps } from './MediaTile';

/**
 * Beta S154 — the pool's one grid, row-virtualized.
 *
 * The owner's screenshot had 287 bin items mounted at once, each an `<img>`
 * over `media://` — the exact unbounded-grid condition the Library hit first.
 * This is `LibraryScreen`'s virtualizer pattern (measured container → column
 * count → row windows), on the dependency that is already installed; the
 * callback-ref measurement is copied too, because this grid is also rendered
 * inside branches (source × type panes) and a mount-effect measurement misses
 * a conditionally-rendered node — the exact bug the Library's streaks came
 * from (2026-07-30).
 *
 * Beta S200 — the grid owns the **selection grammar** and the **drag payload**:
 *
 * - Click selects exclusively; Ctrl/Cmd+click toggles (and never begins a
 *   drag — S160's clip rule, mirrored); Shift+click selects the range from
 *   the anchor in **visual grid order**; Ctrl+A selects the pane; Esc clears;
 *   arrows move (Shift extends). The file-manager grammar every NLE bin uses.
 * - A drag from a *selected* tile carries the whole selection in grid order
 *   (bin sort order — the Premiere/Resolve rule, which for the Storyboard
 *   source is cut order); from an *unselected* tile it selects that tile
 *   exclusively and carries just it (the Finder rule).
 * - `role="listbox" aria-multiselectable` over `option` tiles.
 *
 * `scope` names which pane's selection this is (`source:type`); the store
 * reads a selection only against the scope it was made in, so a tab switch
 * clears by construction.
 *
 * Beta S207 — the grammar itself now lives in `shared/lib/useTileSelection`,
 * because the Story Builder's version strips need the identical one and sibling
 * feature slices cannot import each other. Nothing about this grid's behaviour
 * moved with it: the *drag* rules above are still this component's, and so is
 * the virtualizer-aware focus scroll it hands the hook as `onFocusMoved` —
 * a tile that is scrolled out of the window cannot be focused until its row
 * mounts, which is knowledge only a virtualized grid has.
 */

const MIN_TILE_WIDTH = 104;
const GRID_GAP = 8;

export interface MediaGridItem extends Omit<
  MediaTileProps,
  'selected' | 'focusable' | 'onPointerSelect' | 'onKeyToggle' | 'onDragStart' | 'onAdd'
> {
  key: string;
}

/** The drag/add source for one item — `null` for an inert (unplaceable) tile. */
function sourceOf(item: MediaGridItem): TimelineDragSource | null {
  if (item.filePath === null) return null;
  return {
    kind: item.kind,
    label: item.label,
    filePath: item.filePath,
    durationSeconds: item.durationSeconds,
    durationMeasured: item.durationMeasured,
    storyShotId: item.storyShotId ?? null,
    sourceTakeId: item.sourceTakeId ?? null,
  };
}

/** Placeable items among `items`, in grid order — what a drag or an add carries. */
export function placeableSources(items: readonly MediaGridItem[]): TimelineDragSource[] {
  return items.map(sourceOf).filter((source): source is TimelineDragSource => source !== null);
}

export function MediaGrid({
  items,
  empty,
  scope,
}: {
  items: MediaGridItem[];
  empty: string;
  /** Which pane's selection this grid edits — `source:type`. */
  scope: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // S200 — the hover `+` needs to know whether its kind has a lane to land
  // on; subscribing to the document here (rather than per tile) keeps the
  // answer one selector wide.
  const document = useSequenceStore((state) => state.document);
  const canAdd = useCallback(
    (item: MediaGridItem) =>
      item.filePath !== null && document !== null && primaryTrackFor(item.kind, document) !== null,
    [document],
  );

  const attachScrollElement = useCallback((element: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    scrollRef.current = element;
    if (!element) return;
    setContainerWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setContainerWidth(element.clientWidth));
    observer.observe(element);
    resizeObserverRef.current = observer;
  }, []);

  const isMeasured = containerWidth > 0;
  const columns = Math.max(1, Math.floor((containerWidth + GRID_GAP) / (MIN_TILE_WIDTH + GRID_GAP)));
  const rowCount = Math.ceil(items.length / columns);
  const tileWidth = (containerWidth - (columns - 1) * GRID_GAP) / columns;
  const rowHeight = Math.max(1, Math.round((tileWidth * 9) / 16) + GRID_GAP);

  // eslint-disable-next-line react-hooks/incompatible-library -- informational, not a defect: the React Compiler skips this component because `useVirtualizer` is a third-party hook it cannot analyze; same waiver as LibraryScreen's.
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });
  useEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight]);

  /* ── Selection grammar ─────────────────────────────────────────────── */

  /**
   * The one piece of the grammar a virtualized grid cannot inherit: the tile
   * the arrows just moved to may not be mounted. Bring its row in, then focus
   * it on the next frame, once the virtualizer has rendered it.
   */
  const focusTile = useCallback(
    (key: string, index: number) => {
      rowVirtualizer.scrollToIndex(Math.floor(index / columns));
      requestAnimationFrame(() => {
        const cells = scrollRef.current?.querySelectorAll<HTMLElement>('[data-tile-key]') ?? [];
        for (const cell of cells) {
          if (cell.dataset.tileKey !== key) continue;
          cell.querySelector<HTMLElement>('[role="option"]')?.focus();
          break;
        }
      });
    },
    [columns, rowVirtualizer],
  );

  const selection = useTileSelection({ scope, items, columns, onFocusMoved: focusTile });
  const { selectedSet, focusableKey, applyClick, setSelection } = selection;

  /* ── Drag ──────────────────────────────────────────────────────────── */

  const handleDragStart = useCallback(
    (item: MediaGridItem, event: React.DragEvent<HTMLDivElement>) => {
      // A drag from a selected tile carries the selection, in grid order; a
      // drag from an unselected tile selects it exclusively and carries it.
      const carried = selectedSet.has(item.key)
        ? items.filter((entry) => selectedSet.has(entry.key))
        : [item];
      if (!selectedSet.has(item.key)) setSelection([item.key], item.key);
      const sources = placeableSources(carried);
      if (sources.length === 0) {
        event.preventDefault();
        return;
      }
      beginTimelineDrag(event, sources);
    },
    [items, selectedSet, setSelection],
  );

  if (items.length === 0) {
    return <p className="text-xs text-text-disabled">{empty}</p>;
  }

  return (
    <div
      ref={attachScrollElement}
      {...selection.containerProps}
      aria-label="Media"
      className="h-full w-full min-h-0 flex-1 overflow-y-auto"
    >
      {!isMeasured ? null : (
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowStart = virtualRow.index * columns;
            const rowItems = items.slice(rowStart, rowStart + columns);
            return (
              <div
                key={virtualRow.key}
                className="absolute inset-x-0 grid"
                style={{
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  gap: GRID_GAP,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item) => {
                  const { key, ...tile } = item;
                  return (
                    <div key={key} data-tile-key={key} className="min-w-0">
                      <MediaTile
                        {...tile}
                        selected={selectedSet.has(key)}
                        focusable={key === focusableKey}
                        onPointerSelect={(event) =>
                          applyClick(key, {
                            ctrl: event.ctrlKey || event.metaKey,
                            shift: event.shiftKey,
                          })
                        }
                        onKeyToggle={() => applyClick(key, { ctrl: true, shift: false })}
                        onDragStart={(event) => {
                          // S160's rule, mirrored: Ctrl/Cmd is the toggle
                          // modifier and never begins a drag.
                          if (event.ctrlKey || event.metaKey) {
                            event.preventDefault();
                            return;
                          }
                          handleDragStart(item, event);
                        }}
                        onAdd={
                          canAdd(item)
                            ? () => {
                                const source = sourceOf(item);
                                if (source) addSourcesAtPlayhead([source]);
                              }
                            : null
                        }
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
