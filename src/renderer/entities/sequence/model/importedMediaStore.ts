import { create } from 'zustand';

import type { ImportedMediaFile, MediaSourceKind, RemoveImportedMediaResult } from '@shared';

import { useSequenceStore } from './sequenceStore';

/**
 * Beta S180 — the media pool's Imported source, as project state.
 *
 * It lived in a `useState` inside `FilesPane` until now, which had one visible
 * consequence and one invisible one. Visible: the media area unmounts whenever
 * the rail switches to Text / Effects / Export and whenever the source switches
 * to Storyboard, so every import vanished on the next click and never survived
 * a restart. Invisible, and the reason this is an entity store rather than a
 * `useRef` higher up the tree: **the main process cannot consult renderer
 * state**, and `media://` will not serve a file it cannot find in a record it
 * owns — so while the pool was renderer-local, every imported still, video and
 * audio was refused 403 and rendered as a dead tile.
 *
 * So the main process owns the list and this store mirrors it. Every mutation
 * returns the whole pool and is taken wholesale, the same rule the track
 * mutations follow: the alternative is guessing locally at a list whose
 * usage counts only the database can compute.
 *
 * S200 — the per-path `selected` tick-list this store carried since S180 is
 * gone: selection is the pool's (`shared/model/tileSelectionStore`, one
 * grammar for every source), and the pane maps its keys back to paths.
 */

interface ImportedMediaState {
  /** The active project's pool, newest first. Empty until `load` resolves. */
  media: ImportedMediaFile[];
  /** Which project `media` describes — a stale pool must never be shown against another. */
  projectId: string | null;
  /** A pick, drop or removal is in flight; the pane disables its controls. */
  busy: boolean;

  load: (projectId: string) => Promise<void>;
  pick: (projectId: string, kind: MediaSourceKind) => Promise<void>;
  importDropped: (projectId: string, paths: string[]) => Promise<void>;
  /**
   * Resolves with the main process's verdict so the caller can show the
   * usage-aware confirm; the pool is already updated by the time it does.
   */
  remove: (
    projectId: string,
    paths: string[],
    deleteClips?: boolean,
  ) => Promise<RemoveImportedMediaResult>;
}

export const useImportedMediaStore = create<ImportedMediaState>((set, get) => ({
  media: [],
  projectId: null,
  busy: false,

  load: async (projectId) => {
    // A *different* project's pool is dropped before the await, not after: a
    // slow load would otherwise leave the pane showing another project's
    // files, which are exactly the files it must not offer. Re-loading the
    // same project keeps what is on screen — this runs on every remount of
    // the pane (the media area unmounts for the Text / Effects / Export
    // rails), and blanking the grid each time would be the old bug's
    // symptom reproduced by its own fix.
    if (get().projectId !== projectId) {
      set({ media: [], projectId });
    }
    const media = await window.api.sequence.listMedia(projectId);
    // A project switch during the round trip wins — this response is stale.
    if (get().projectId !== projectId) return;
    set({ media });
  },

  pick: async (projectId, kind) => {
    set({ busy: true });
    try {
      const media = await window.api.sequence.pickMedia(kind, projectId);
      if (get().projectId !== projectId) return;
      set({ media });
    } finally {
      set({ busy: false });
    }
  },

  importDropped: async (projectId, paths) => {
    if (paths.length === 0) return;
    set({ busy: true });
    try {
      const media = await window.api.sequence.importDroppedMedia(projectId, paths);
      if (get().projectId !== projectId) return;
      set({ media });
    } finally {
      set({ busy: false });
    }
  },

  remove: async (projectId, paths, deleteClips) => {
    set({ busy: true });
    try {
      const { result, media } = await window.api.sequence.removeMedia({
        projectId,
        paths,
        deleteClips,
      });
      if (get().projectId === projectId) set({ media });
      if (result.deletedClipIds && result.deletedClipIds.length > 0) {
        useSequenceStore.getState().removeClips(result.deletedClipIds);
      }
      return result;
    } finally {
      set({ busy: false });
    }
  },
}));

/**
 * Pool entries nothing on any timeline references — what "Remove unused"
 * sweeps.
 *
 * Takes the list, **not the state**, so it cannot be handed to
 * `useImportedMediaStore` as a subscription selector. That distinction is
 * load-bearing rather than stylistic: zustand v5 runs selectors inside
 * `useSyncExternalStore` with no result memoisation, so a selector returning a
 * fresh array on every call makes `getSnapshot` unstable and React loops to
 * "Maximum update depth exceeded" — which, with no error boundary above the
 * pool, unmounts the tree. S162 hit exactly this with `selectSelectedClips`.
 * Call it inside a `useMemo` over `media`.
 */
export function selectUnusedMedia(media: readonly ImportedMediaFile[]): ImportedMediaFile[] {
  return media.filter((file) => file.usage.clipCount === 0);
}
