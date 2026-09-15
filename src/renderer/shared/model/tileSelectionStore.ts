import { create } from 'zustand';

/**
 * Beta S207 — one selection model for every grid of tiles in the app.
 *
 * Beta S200 built this for the timeline media pool (`poolSelectionStore`),
 * where it replaced S180's per-path tick-list with the file-manager grammar
 * every NLE bin uses — click exclusive, Ctrl/Cmd toggle, Shift range, Ctrl+A,
 * Esc. S207 needed the same grammar over the Story Builder's *version* strips
 * (a shot's takes, a board row's reference takes), and two feature slices are
 * siblings: `features/story-builder` cannot import `features/timeline-media`.
 *
 * So it moves here rather than being written twice. That is the same call S200
 * itself made one level up — "two selection models in one grid is the same
 * misfire S180 refused" — applied to two grids instead of one.
 *
 * **Keys, not domain ids.** The caller's own tile keys are the identity
 * (`out-<id>`, `imported-<id>`, `shot-<id>` in the pool; `take-<id>` in a
 * version strip), so two tiles that happen to point at the same file are two
 * selectable things, as they are two tiles.
 *
 * **Scoped, so it clears by construction.** A selection made under
 * `library:still` is not a selection under `imported:still`; a selection under
 * `take:shot:s1:still` is not one under `take:shot:s1:video`. Readers pass
 * their scope and a mismatch reads as empty, so switching a tab, a frame or a
 * look never has to *remember* to clear — and no effect races the switch.
 *
 * Renderer-local, never persisted. It lives in `shared/model/` beside
 * `modalStore`/`toastStore` for the reason stated in `CLAUDE.md`: a
 * cross-cutting UI service with consumers in more than one slice belongs to the
 * kernel, not to whichever slice happened to need it first.
 */
interface TileSelectionState {
  scope: string | null;
  /** Selected tile keys. Unordered — a reader orders them by its own item order when it matters. */
  keys: string[];
  /** The Shift-range anchor: the last plain- or Ctrl-clicked tile. */
  anchorKey: string | null;
  /** The roving-tabindex tile — where the keyboard is. */
  focusKey: string | null;

  /** Replaces the selection under `scope`; a different scope's selection is simply forgotten. */
  setSelection: (scope: string, keys: string[], anchorKey?: string | null) => void;
  setFocus: (scope: string, focusKey: string | null) => void;
  clear: () => void;
}

const EMPTY: string[] = [];

export const useTileSelectionStore = create<TileSelectionState>((set, get) => ({
  scope: null,
  keys: EMPTY,
  anchorKey: null,
  focusKey: null,

  setSelection: (scope, keys, anchorKey) =>
    set({
      scope,
      keys,
      anchorKey: anchorKey === undefined ? (get().scope === scope ? get().anchorKey : null) : anchorKey,
      focusKey: get().scope === scope ? get().focusKey : null,
    }),
  setFocus: (scope, focusKey) =>
    set(get().scope === scope ? { focusKey } : { scope, keys: EMPTY, anchorKey: null, focusKey }),
  clear: () => set({ keys: EMPTY, anchorKey: null }),
}));

/**
 * The selected keys under `scope` — a stable empty array on a mismatch, so a
 * component may subscribe with this directly (zustand v5's `getSnapshot` must
 * see a stable reference; a fresh array per call loops React).
 */
export function selectTileKeys(state: TileSelectionState, scope: string): string[] {
  return state.scope === scope ? state.keys : EMPTY;
}

export type { TileSelectionState };
