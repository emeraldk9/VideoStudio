import { useCallback, useMemo } from 'react';
import type { KeyboardEvent } from 'react';

import { selectTileKeys, useTileSelectionStore } from '../model/tileSelectionStore';

/**
 * Beta S207 — the file-manager selection grammar, as a hook.
 *
 * Beta S200 wrote this inline in the media pool's `MediaGrid`, and it is the
 * grammar every NLE bin, file manager and photo library uses: **click** selects
 * exclusively, **Ctrl/Cmd+click** toggles, **Shift+click** takes the range from
 * the anchor in visual order, **Ctrl+A** selects the collection, **Esc** clears,
 * **arrows** move (Shift extends). Tiles are `option`s in a
 * `listbox aria-multiselectable`, which is the WAI-ARIA pattern for a
 * multi-select collection — S200 specifically rejected `role="checkbox"` as
 * "right for a tick-list, wrong for what I am about to drag", and the same
 * reasoning holds for "what I am about to delete".
 *
 * It moves out of that component because the Story Builder's version strips
 * need the identical grammar and sibling feature slices cannot import each
 * other. Two hand-written copies of a keyboard grammar is how Ctrl+A comes to
 * mean two different things in one app.
 *
 * ## What stays with the caller
 *
 * **Scrolling and focus.** `onFocusMoved` is called after the focus key moves,
 * and the caller decides what that means: the media pool is row-virtualized, so
 * it must `scrollToIndex` and then find the tile in the next frame; a plain
 * wrapping strip only needs `scrollIntoView`. Baking either one in here would
 * make the hook depend on a virtualizer or silently fail on a virtualized grid.
 *
 * **Geometry.** `columns` drives ArrowUp/ArrowDown. A single-row or wrapping
 * strip passes `1`, which makes the vertical arrows step like the horizontal
 * ones rather than jumping an imagined row height.
 */

export interface TileSelectionItem {
  key: string;
}

export interface UseTileSelectionOptions {
  /**
   * Which collection's selection this is. A selection is only ever read against
   * the scope it was made in, so changing this clears by construction — no
   * effect racing a tab, frame or look switch.
   */
  scope: string;
  /** The collection, in **visual order**. Shift-ranges and arrows both walk this. */
  items: readonly TileSelectionItem[];
  /** Grid columns for the vertical arrows. `1` for a strip; defaults to `1`. */
  columns?: number;
  /**
   * Called after the focus key moves, with the tile to bring into view. The
   * caller owns scrolling and `.focus()` — see the note above.
   */
  onFocusMoved?: (key: string, index: number) => void;
}

export interface TileSelection {
  selectedKeys: string[];
  selectedSet: Set<string>;
  /**
   * The roving-tabindex tile: the focused one, else the first selected, else
   * the first item. `null` only for an empty collection.
   */
  focusableKey: string | null;
  /** Applies one click's meaning — exclusive, toggle, or range. */
  applyClick: (key: string, modifiers: { ctrl: boolean; shift: boolean }) => void;
  setSelection: (keys: string[], anchorKey?: string | null) => void;
  selectAll: () => void;
  clear: () => void;
  /** Spread onto the collection's container. */
  containerProps: {
    role: 'listbox';
    'aria-multiselectable': true;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /** Spread onto each tile's focusable element. */
  optionProps: (key: string) => {
    role: 'option';
    'aria-selected': boolean;
    tabIndex: number;
  };
}

export function useTileSelection({
  scope,
  items,
  columns = 1,
  onFocusMoved,
}: UseTileSelectionOptions): TileSelection {
  const selectedKeys = useTileSelectionStore((state) => selectTileKeys(state, scope));
  const anchorKey = useTileSelectionStore((state) => (state.scope === scope ? state.anchorKey : null));
  const focusKey = useTileSelectionStore((state) => (state.scope === scope ? state.focusKey : null));
  const setSelectionInStore = useTileSelectionStore((state) => state.setSelection);
  const setFocus = useTileSelectionStore((state) => state.setFocus);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const indexOfKey = useCallback(
    (key: string) => items.findIndex((item) => item.key === key),
    [items],
  );

  const setSelection = useCallback(
    (keys: string[], anchor?: string | null) => setSelectionInStore(scope, keys, anchor),
    [scope, setSelectionInStore],
  );

  const applyClick = useCallback(
    (key: string, modifiers: { ctrl: boolean; shift: boolean }) => {
      if (modifiers.shift && anchorKey !== null && indexOfKey(anchorKey) >= 0) {
        const from = indexOfKey(anchorKey);
        const to = indexOfKey(key);
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        // Range replaces (Finder / Explorer / Premiere), keeping the anchor.
        setSelectionInStore(scope, items.slice(lo, hi + 1).map((item) => item.key), anchorKey);
      } else if (modifiers.ctrl) {
        setSelectionInStore(
          scope,
          selectedSet.has(key) ? selectedKeys.filter((entry) => entry !== key) : [...selectedKeys, key],
          key,
        );
      } else {
        setSelectionInStore(scope, [key], key);
      }
      setFocus(scope, key);
    },
    [anchorKey, indexOfKey, items, scope, selectedKeys, selectedSet, setFocus, setSelectionInStore],
  );

  const moveFocus = useCallback(
    (delta: number, extend: boolean) => {
      if (items.length === 0) return;
      const currentKey = focusKey ?? selectedKeys[0] ?? items[0].key;
      const current = Math.max(0, indexOfKey(currentKey));
      const next = Math.min(items.length - 1, Math.max(0, current + delta));
      const nextKey = items[next].key;
      applyClick(nextKey, { ctrl: false, shift: extend });
      onFocusMoved?.(nextKey, next);
    },
    [applyClick, focusKey, indexOfKey, items, onFocusMoved, selectedKeys],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        setSelectionInStore(scope, items.map((item) => item.key));
        return;
      }
      if (event.key === 'Escape') {
        // Not swallowed when there is nothing to clear: Escape's next meaning
        // up the tree is usually "close the dialog", and a strip that ate it
        // would strand a user inside a modal.
        if (selectedKeys.length === 0) return;
        event.preventDefault();
        // `stopPropagation` is load-bearing, not belt-and-braces. `Modal`
        // listens for Escape on `document` (`Modal.tsx:107`), and
        // `preventDefault` does nothing to a listener already registered
        // there — so without this, clearing a selection inside a dialog also
        // closes the dialog, which is the opposite of "back out one step".
        event.stopPropagation();
        setSelectionInStore(scope, []);
        return;
      }
      const step =
        event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowLeft' ? -1
        : event.key === 'ArrowDown' ? columns
        : event.key === 'ArrowUp' ? -columns
        : 0;
      // Every other key falls through untouched — the caller's own handler
      // still gets Delete, Enter and its approve shortcut.
      if (step === 0) return;
      event.preventDefault();
      moveFocus(step, event.shiftKey);
    },
    [columns, items, moveFocus, scope, selectedKeys.length, setSelectionInStore],
  );

  const focusableKey =
    items.length === 0
      ? null
      : focusKey !== null && indexOfKey(focusKey) >= 0
        ? focusKey
        : (items.find((item) => selectedSet.has(item.key))?.key ?? items[0].key);

  const optionProps = useCallback(
    (key: string) => ({
      role: 'option' as const,
      'aria-selected': selectedSet.has(key),
      tabIndex: key === focusableKey ? 0 : -1,
    }),
    [focusableKey, selectedSet],
  );

  return {
    selectedKeys,
    selectedSet,
    focusableKey,
    applyClick,
    setSelection,
    selectAll: useCallback(
      () => setSelectionInStore(scope, items.map((item) => item.key)),
      [items, scope, setSelectionInStore],
    ),
    clear: useCallback(() => setSelectionInStore(scope, []), [scope, setSelectionInStore]),
    containerProps: {
      role: 'listbox',
      'aria-multiselectable': true,
      onKeyDown,
    },
    optionProps,
  };
}
