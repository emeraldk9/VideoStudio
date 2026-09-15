import { create } from 'zustand';

import {
  renumberTrack,
  transportDurationFrames,
  type Sequence,
  type SequenceClip,
  type SequenceDocument,
  type MarkerColor,
  type SequenceMarker,
  type SequenceRenderProgress,
  type SequenceTrack,
  type ClipOverridableField,
  type ImportedStillDurations,
  type StillDurationSource,
  type StillFrameSource,
  type TrackKind,
  type TrackRole,
} from '@shared';

import { readLocalSetting, writeLocalSetting } from '../../../shared/lib/localSetting';
import { announceTimelineError } from '../lib/announce';

import { transportClock } from './transportClock';

/**
 * Beta S145 — the Timeline Editor's document, selection and command stack.
 *
 * **Optimistic and debounced.** Every edit lands in memory immediately and the
 * whole clip list is persisted a moment later. A timeline is dragged, not
 * typed: awaiting IPC per pixel of a drag would make the surface feel bound to
 * the disk, and the document is small enough that replacing it wholesale costs
 * nothing.
 *
 * The undo stack here is **timeline-local** — a bounded list of before/after
 * clip snapshots, discarded when the sequence closes. That is deliberately not
 * the app-wide undo/redo that remains out of scope: this is local state in one
 * screen, and a timeline without undo is not shippable.
 */

/** Bounded so a long session cannot grow the stack without limit. */
const UNDO_LIMIT = 100;

/**
 * Beta S160 — one history entry: the whole document, not just the clips.
 *
 * The S145 stack held `SequenceClip[][]`, which made every track operation
 * either invisible to undo or (for `removeTrack`) a stack-clearing event —
 * tolerable while undo was only a shortcut, indefensible once it is a
 * toolbar button that would grey out for no visible reason. `spineTrackId`
 * rides along because it lives on the sequence row: restoring a deleted
 * spine track without restoring the binding would resurrect the track as a
 * plain overlay.
 */
export interface DocumentSnapshot {
  tracks: SequenceTrack[];
  clips: SequenceClip[];
  spineTrackId: string | null;
}

function snapshotOf(document: SequenceDocument): DocumentSnapshot {
  return {
    tracks: document.tracks,
    clips: document.clips,
    spineTrackId: document.sequence.spineTrackId ?? null,
  };
}

/** Batches a burst of drag mutations into one write. Long enough to coalesce a drag, short enough to feel saved. */
const PERSIST_DEBOUNCE_MS = 400;

export interface SequenceState {
  document: SequenceDocument | null;
  /** Sequences in the active project, for the picker. */
  sequences: Sequence[];
  loading: boolean;
  error: string | null;

  selectedClipIds: string[];
  playheadFrame: number;
  /** Timeline zoom, in pixels per second. */
  pixelsPerSecond: number;
  playing: boolean;
  /**
   * Shuttle speed, `J`/`K`/`L`. Negative runs the transport backwards; 0 is
   * indistinguishable from paused and is never stored (`K` sets `playing`
   * false instead), so this is only ever consulted while playing.
   */
  playbackRate: number;
  /**
   * Bumped by `Shift`+`Z`. Only the timeline panel knows its own width, so the
   * fit is *requested* here and computed there — a counter rather than a
   * boolean so two consecutive fits both fire.
   */
  fitVersion: number;

  renderProgress: SequenceRenderProgress | null;

  /**
   * Beta S253 fix — when the in-flight render started, as an epoch ms.
   *
   * In the store rather than in `RenderProgress`, because the panel unmounts
   * whenever the user navigates to another screen and a component-owned clock
   * restarts from zero on the way back. An export is exactly the thing a user
   * leaves running while they do something else, so the one number that must
   * survive leaving the screen was the one being kept where it could not.
   *
   * Stamped on the first event of a render and cleared with the progress, so
   * nothing has to observe the render's start separately.
   */
  renderStartedAt: number | null;

  /**
   * Beta S255 — the sequence the main process is rendering, or `null`.
   *
   * The authority on "a render is in flight", and deliberately not derived
   * from `renderProgress`: progress is the last event *seen*, which is a
   * different thing from a render being live, and the difference is exactly
   * what broke. It is set from the events and re-synced from
   * `sequence.activeRender()` whenever the app mounts, so a render survives
   * every screen change and project switch that unmounts the panel.
   *
   * Scoped by sequence because with two projects open over a session,
   * "something is rendering" and "*this* timeline is rendering" are different
   * questions — and answering the first as the second put one project's
   * progress bar in another project's panel.
   */
  activeRenderSequenceId: string | null;
  setActiveRenderSequenceId: (sequenceId: string | null) => void;

  /**
   * Beta S151 (F2) — what the storyboard knows about this timeline's shots.
   *
   * `runPreflight` has always accepted `headingByShotId` and `staleShotIds`;
   * nothing ever passed them, so `shot_not_approved` (a **blocking** finding,
   * the one that stops an export missing a shot) and `stale_approval` could
   * not fire. The two facts live in the Story Builder's data and are needed by
   * the render panel, which is a *sibling* slice of the assemble panel that
   * computes them — so they meet here, in the entity both already depend on,
   * rather than through a cross-slice import the architecture forbids.
   *
   * Empty is the honest default: a hand-built sequence with no storyboard
   * behind it should report nothing about shots.
   */
  storyboardReport: {
    /** Headings of shots the prefill could **not** place, by shot id. */
    unplacedHeadingByShotId: Record<string, string>;
    /** Shots whose approved take predates the shot's last prompt-affecting edit. */
    staleShotIds: string[];
  };
  setStoryboardReport: (report: SequenceState['storyboardReport']) => void;

  undoStack: DocumentSnapshot[];
  redoStack: DocumentSnapshot[];

  loadSequences: (projectId: string) => Promise<void>;
  openSequence: (sequenceId: string) => Promise<void>;
  createSequence: (input: {
    projectId: string;
    storyEpisodeId?: string | null;
    name: string;
  }) => Promise<SequenceDocument | null>;
  deleteSequence: (sequenceId: string) => Promise<void>;
  /** Renames any sequence in the project — the tab strip can rename a tab that is not open. */
  renameSequence: (sequenceId: string, name: string) => Promise<void>;
  updateSettings: (settings: {
    fps?: number;
    width?: number;
    height?: number;
    storyEpisodeId?: string | null;
    /** Beta S258 — the story folder that episode lives in; same keep/unbind lifecycle. */
    storyProjectRoot?: string | null;
    spineTrackId?: string | null;
    /** Beta S222 — where the spine's stills take their length from. */
    stillDurationSource?: StillDurationSource;
    /** Beta S474 — which of a shot's stills the spine shows. */
    stillFrameSource?: StillFrameSource;
    /** Beta S222 — imported durations by shot id; `null` clears, omitted keeps. */
    stillDurations?: ImportedStillDurations | null;
  }) => Promise<void>;
  closeSequence: () => void;

  // ------------------------------------------------- S154 — dynamic tracks

  /** Appends a track of `kind`. S165 — `role` lets it be born typed (a text lane). */
  addTrack: (kind: TrackKind, name: string, role?: TrackRole | null) => Promise<void>;
  patchTrack: (
    trackId: string,
    patch: {
      name?: string;
      locked?: boolean;
      /** S181 — the speaker, on every kind: a video track has audio to silence now. */
      muted?: boolean;
      /** S181 — the eye, split out of `muted`. Video tracks only. */
      videoEnabled?: boolean;
      heightPx?: number;
      /** S157 — audio only; `null` clears. */
      role?: TrackRole | null;
    },
  ) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  /**
   * S157 — rewrites one kind's stacking order from an ordered id list
   * (ascending `orderIndex`; for video that is bottom-of-composite first).
   * Take-the-returned-document, like every track mutation.
   */
  reorderTracks: (kind: TrackKind, orderedIds: string[]) => Promise<void>;
  /**
   * Solo — renderer-local monitoring state, deliberately **not** persisted: a
   * sequence that renders differently because someone left solo engaged is
   * the invisible-decision class this module keeps refusing (S151 F4's
   * precedent). Solo never affects the render; the preview honours it.
   */
  soloTrackIds: string[];
  toggleSolo: (trackId: string) => void;

  /** Replaces the clip list, pushing the previous one onto the undo stack. */
  commitClips: (next: SequenceClip[]) => void;
  /** Same, without an undo entry — for a load or a re-sync the user already confirmed separately. */
  setClips: (next: SequenceClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SequenceClip>, override?: ClipOverridableField) => void;
  /**
   * S160 (owner item 3) — the batch form: one map, one commit, one undo
   * entry, one debounced write. Looping `patchClip` would push N history
   * entries and make Ctrl+Z after "set six clips to 3s" a six-step chore.
   */
  patchClips: (clipIds: readonly string[], patch: Partial<SequenceClip>, override?: ClipOverridableField) => void;
  /**
   * The per-clip form of `patchClips`, for fields that live inside nested
   * objects: a flat patch would replace each clip's whole `effects` blob,
   * clobbering one clip's text content to set another's speed. The updater
   * returns the partial for *that* clip; commit and undo stay singular.
   */
  patchClipsWith: (
    clipIds: readonly string[],
    updater: (clip: SequenceClip) => Partial<SequenceClip>,
    override?: ClipOverridableField,
  ) => void;
  /**
   * S231 — pre-computed per-clip patches with per-clip override lists, in
   * one commit. The setup import's apply path: one row pins a duration, its
   * neighbour only a transition, and a shared override would pin too much.
   */
  applyClipPatches: (
    patches: Record<string, { patch: Partial<SequenceClip>; overrides?: ClipOverridableField[] }>,
  ) => void;
  removeClips: (clipIds: string[]) => void;
  undo: () => void;
  redo: () => void;

  /**
   * S160 — the active pointer tool. `'select'` is every gesture the panel
   * always had; `'split'` turns a clip click into a blade cut at the click's
   * frame; the two track-select tools turn a clip click into a directional
   * sweep. Renderer-local, never persisted — a timeline that reopens in
   * blade mode cuts something before the user notices.
   */
  toolMode: 'select' | 'split' | 'select-left' | 'select-right';
  setToolMode: (mode: SequenceState['toolMode']) => void;

  /**
   * S160 — markers (migration 066). Loaded with the document, mutated
   * through list-returning IPC. Deliberately outside the undo history:
   * an undo of a clip edit must not delete a note written after it.
   */
  markers: SequenceMarker[];
  addMarker: (frame: number) => Promise<void>;
  updateMarker: (
    markerId: string,
    patch: { frame?: number; name?: string; color?: MarkerColor; locked?: boolean },
  ) => Promise<void>;
  /**
   * S233 — the setup import's markers: added in file order through the same
   * IPC the `M` key uses, deduplicated by (frame, name) against what already
   * exists. Never deletes — an import adds facts, it does not tidy.
   */
  importMarkers: (
    entries: { frame: number; name?: string; color?: MarkerColor; locked?: boolean }[],
  ) => Promise<number>;
  removeMarker: (markerId: string) => Promise<void>;

  select: (clipIds: string[]) => void;
  setPlayhead: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setZoom: (pixelsPerSecond: number) => void;
  /**
   * S175 — the magnet. A *preference*, persisted like the shell's card sizes
   * and deliberately NOT reset when a document closes; it lives here rather
   * than `shellStore` because its only reader and writer are this slice's
   * own panel and toolbar. Alt composes as XOR in the drag hook.
   */
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  requestFit: () => void;
  setRenderProgress: (progress: SequenceRenderProgress | null) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persists the current clip list after a quiet moment.
 *
 * Reads the document at *fire* time rather than closing over it, so a burst of
 * edits during the debounce window writes the final state once instead of an
 * intermediate one. Failures surface on `error` — and, since S172, in a toast —
 * and leave the in-memory document alone: reverting a user's edit because a
 * write failed would lose work that is still perfectly valid. (The undo path
 * takes the opposite choice, for the opposite reason — see `persistSnapshot`.)
 */
function schedulePersist(get: () => SequenceState, set: (partial: Partial<SequenceState>) => void): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const document = get().document;
    if (!document) return;
    void window.api.sequence
      .replaceClips({ sequenceId: document.sequence.id, clips: document.clips })
      .catch((error: unknown) => {
        set({ error: announceTimelineError(error, 'Could not save the timeline.') });
      });
  }, PERSIST_DEBOUNCE_MS);
}

/** A snapshot laid over the live document — sequence identity kept, content replaced. */
function applySnapshot(document: SequenceDocument, snapshot: DocumentSnapshot): SequenceDocument {
  return {
    ...document,
    sequence: { ...document.sequence, spineTrackId: snapshot.spineTrackId },
    tracks: snapshot.tracks,
    clips: snapshot.clips,
  };
}

/**
 * S160 — undo/redo's persistence: the whole document, immediately.
 *
 * Not debounced like the clip path — an undo is a deliberate single action,
 * not a burst of drag frames, and the pending clip timer is cancelled because
 * `replaceDocument` supersedes anything it would have written.
 *
 * S172 — **a failure here re-reads the stored document**, the opposite of the
 * clip path's "leave the edit alone". The asymmetry is deliberate: the clip
 * path's optimistic state is work the user just did and a failed write must
 * not destroy it, whereas an undo that did not persist *did not happen* — and
 * leaving the undone state on screen is the screen telling a lie the next
 * reload will contradict. Snapping back to what is stored, plus the toast, is
 * the honest pair.
 */
function persistSnapshot(get: () => SequenceState, set: (partial: Partial<SequenceState>) => void): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const document = get().document;
  if (!document) return;
  const sequenceId = document.sequence.id;
  void window.api.sequence
    .replaceDocument({
      sequenceId,
      tracks: document.tracks,
      clips: document.clips,
      spineTrackId: document.sequence.spineTrackId ?? null,
    })
    .catch((error: unknown) => {
      set({ error: announceTimelineError(error, 'Could not save the timeline.') });
      // Re-read rather than trust the optimistic state. Guarded on the
      // sequence still being open, so a failure racing a sequence switch
      // cannot paint the old document over the new one.
      void window.api.sequence
        .get(sequenceId)
        .then((stored) => {
          if (stored && get().document?.sequence.id === sequenceId) {
            set({ document: stored });
          }
        })
        .catch(() => {
          // The re-read failing too leaves the toast as the only signal —
          // there is nothing truer to show.
        });
    });
}

/** Keeps `orderIndex` contiguous on every track after any structural change. */
function normalizeOrder(clips: SequenceClip[]): SequenceClip[] {
  const trackIds = [...new Set(clips.map((clip) => clip.trackId))];
  return trackIds.reduce((accumulated, trackId) => renumberTrack(accumulated, trackId), clips);
}

export const useSequenceStore = create<SequenceState>((set, get) => ({
  document: null,
  sequences: [],
  loading: false,
  error: null,
  selectedClipIds: [],
  playheadFrame: 0,
  pixelsPerSecond: 40,
  // S175 — persisted preference; anything but the stored 'off' means on.
  snapEnabled: readLocalSetting('ai_video_studio_timeline_snap') !== 'off',
  playing: false,
  playbackRate: 1,
  fitVersion: 0,
  renderProgress: null,
  renderStartedAt: null,
  activeRenderSequenceId: null,
  storyboardReport: { unplacedHeadingByShotId: {}, staleShotIds: [] },
  undoStack: [],
  redoStack: [],

  loadSequences: async (projectId) => {
    set({ loading: true, error: null });
    try {
      set({ sequences: await window.api.sequence.list(projectId), loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load sequences.',
      });
    }
  },

  openSequence: async (sequenceId) => {
    set({ loading: true, error: null });
    try {
      const document = await window.api.sequence.get(sequenceId);
      const markers = document ? await window.api.sequence.listMarkers(sequenceId) : [];
      set({
        document,
        markers,
        loading: false,
        selectedClipIds: [],
        playheadFrame: 0,
        playing: false,
        // A fresh document has no history — carrying the previous sequence's
        // stack over would let undo apply one timeline's clips to another.
        undoStack: [],
        redoStack: [],
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not open the sequence.',
      });
    }
  },

  createSequence: async (input) => {
    try {
      const document = await window.api.sequence.create(input);
      set((state) => ({
        document,
        markers: [],
        sequences: [document.sequence, ...state.sequences],
        selectedClipIds: [],
        playheadFrame: 0,
        undoStack: [],
        redoStack: [],
      }));
      return document;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not create the sequence.' });
      return null;
    }
  },

  deleteSequence: async (sequenceId) => {
    await window.api.sequence.delete(sequenceId);
    set((state) => ({
      sequences: state.sequences.filter((item) => item.id !== sequenceId),
      document: state.document?.sequence.id === sequenceId ? null : state.document,
    }));
  },

  renameSequence: async (sequenceId, name) => {
    const sequence = await window.api.sequence.rename({ sequenceId, name });
    if (!sequence) return;
    set((state) => ({
      // The open document only changes when it is the one renamed.
      document:
        state.document?.sequence.id === sequence.id
          ? { ...state.document, sequence }
          : state.document,
      sequences: state.sequences.map((item) => (item.id === sequence.id ? sequence : item)),
    }));
  },

  updateSettings: async (settings) => {
    const document = get().document;
    if (!document) return;
    // Not optimistic, unlike clip edits: changing fps re-scales every frame
    // count in the database, and guessing that arithmetic locally would risk
    // the UI and the stored document disagreeing about the length of the cut.
    const next = await window.api.sequence.updateSettings({
      sequenceId: document.sequence.id,
      ...settings,
    });
    if (next) set({ document: next });
  },

  closeSequence: () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    set({
      document: null,
      markers: [],
      toolMode: 'select',
      selectedClipIds: [],
      playheadFrame: 0,
      playing: false,
      undoStack: [],
      redoStack: [],
    });
  },

  // ------------------------------------------------- S154 — dynamic tracks
  //
  // Each track call takes the repository's returned document wholesale. Not
  // optimistic, unlike clip edits: adding or deleting a track changes what
  // every clip's `trackId` may legally reference, and guessing that locally
  // would let the UI and the store disagree about which tracks exist.
  //
  // S160 — every track mutation is an undoable step: the pre-call document
  // goes onto the (now full-document) undo stack once the call succeeds.
  // Track ids survive delete → undo because `replaceDocument` restores rows
  // under their original ids, so clip `trackId` references stay valid. The
  // snapshot is pushed *after* the IPC resolves — a failed call must not
  // leave a phantom entry that undoes to the same state.

  // S172 — every track action catches. These three used to have no handler at
  // all: the repository's guards (role scoping, the spine rules, the reorder
  // pin) reject by throwing, and an unhandled rejection is even quieter than
  // the `error` field nothing reads. A refused edit now says so.

  addTrack: async (kind, name, role = null) => {
    const document = get().document;
    if (!document) return;
    try {
      const next = await window.api.sequence.addTrack({
        sequenceId: document.sequence.id,
        kind,
        name,
        role,
      });
      if (next) {
        set((state) => ({
          document: next,
          undoStack: [...state.undoStack, snapshotOf(document)].slice(-UNDO_LIMIT),
          redoStack: [],
        }));
      }
    } catch (error) {
      set({ error: announceTimelineError(error, 'Could not add the track.') });
    }
  },

  patchTrack: async (trackId, patch) => {
    const document = get().document;
    if (!document) return;
    try {
      const next = await window.api.sequence.updateTrack({
        sequenceId: document.sequence.id,
        trackId,
        ...patch,
      });
      if (next) {
        set((state) => ({
          document: next,
          undoStack: [...state.undoStack, snapshotOf(document)].slice(-UNDO_LIMIT),
          redoStack: [],
        }));
      }
    } catch (error) {
      set({ error: announceTimelineError(error, 'Could not update the track.') });
    }
  },

  removeTrack: async (trackId) => {
    const document = get().document;
    if (!document) return;
    try {
      const next = await window.api.sequence.deleteTrack({ sequenceId: document.sequence.id, trackId });
      if (next) {
        set((state) => ({
          document: next,
          // Clips on the deleted track can no longer be selected. The undo
          // stack keeps the pre-delete snapshot — undo restores the track,
          // its clips and the spine binding in one step.
          selectedClipIds: state.selectedClipIds.filter((id) =>
            next.clips.some((clip) => clip.id === id),
          ),
          undoStack: [...state.undoStack, snapshotOf(document)].slice(-UNDO_LIMIT),
          redoStack: [],
          soloTrackIds: state.soloTrackIds.filter((id) => id !== trackId),
        }));
      }
    } catch (error) {
      set({ error: announceTimelineError(error, 'Could not delete the track.') });
    }
  },

  reorderTracks: async (kind, orderedIds) => {
    const document = get().document;
    if (!document) return;
    try {
      const next = await window.api.sequence.reorderTracks({
        sequenceId: document.sequence.id,
        kind,
        orderedIds,
      });
      if (next) {
        set((state) => ({
          document: next,
          undoStack: [...state.undoStack, snapshotOf(document)].slice(-UNDO_LIMIT),
          redoStack: [],
        }));
      }
    } catch (error) {
      set({ error: announceTimelineError(error, 'Could not reorder the tracks.') });
    }
  },

  toolMode: 'select',
  setToolMode: (toolMode) => set({ toolMode }),

  markers: [],
  addMarker: async (frame) => {
    const document = get().document;
    if (!document) return;
    const markers = await window.api.sequence.addMarker({
      sequenceId: document.sequence.id,
      frame: Math.max(0, Math.round(frame)),
    });
    if (markers) set({ markers });
  },
  updateMarker: async (markerId, patch) => {
    const document = get().document;
    if (!document) return;
    const markers = await window.api.sequence.updateMarker({
      sequenceId: document.sequence.id,
      markerId,
      ...patch,
    });
    if (markers) set({ markers });
  },
  importMarkers: async (entries) => {
    const document = get().document;
    if (!document || entries.length === 0) return 0;
    const seen = new Set(get().markers.map((marker) => `${marker.frame}:${marker.name}`));
    let added = 0;
    let markers: SequenceMarker[] | null = null;
    for (const entry of entries) {
      const frame = Math.max(0, Math.round(entry.frame));
      const key = `${frame}:${entry.name ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers = await window.api.sequence.addMarker({
        sequenceId: document.sequence.id,
        frame,
        name: entry.name,
        color: entry.color,
        locked: entry.locked,
      });
      added += 1;
    }
    if (markers) set({ markers });
    return added;
  },
  removeMarker: async (markerId) => {
    const document = get().document;
    if (!document) return;
    set({
      markers: await window.api.sequence.deleteMarker({
        sequenceId: document.sequence.id,
        markerId,
      }),
    });
  },

  soloTrackIds: [],
  toggleSolo: (trackId) =>
    set((state) => ({
      soloTrackIds: state.soloTrackIds.includes(trackId)
        ? state.soloTrackIds.filter((id) => id !== trackId)
        : [...state.soloTrackIds, trackId],
    })),

  setClips: (next) => {
    const document = get().document;
    if (!document) return;
    set({ document: { ...document, clips: normalizeOrder(next) } });
    schedulePersist(get, set);
  },

  commitClips: (next) => {
    const document = get().document;
    if (!document) return;
    set((state) => ({
      document: state.document ? { ...state.document, clips: normalizeOrder(next) } : null,
      // S160 — the entry is the whole document even though only clips
      // changed: one stack, one shape, so a clip undo popped after a track
      // undo cannot restore clips against tracks that no longer match.
      undoStack: [...state.undoStack, snapshotOf(document)].slice(-UNDO_LIMIT),
      // Any new edit invalidates the redo branch — the standard model, and the
      // only one that cannot resurrect a state the user has since diverged from.
      redoStack: [],
    }));
    schedulePersist(get, set);
  },

  patchClip: (clipId, patch, override) => {
    const document = get().document;
    if (!document) return;
    get().commitClips(
      document.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const next = { ...clip, ...patch };
        // Marking the field as user-owned is what makes storyboard re-sync
        // leave it alone. Without it, the next re-sync would quietly restore
        // the storyboard's value over a deliberate edit.
        if (override && !next.overrides.includes(override)) {
          next.overrides = [...next.overrides, override];
        }
        return next;
      }),
    );
  },

  patchClips: (clipIds, patch, override) => {
    get().patchClipsWith(clipIds, () => patch, override);
  },

  patchClipsWith: (clipIds, updater, override) => {
    const document = get().document;
    if (!document || clipIds.length === 0) return;
    const targets = new Set(clipIds);
    get().commitClips(
      document.clips.map((clip) => {
        if (!targets.has(clip.id)) return clip;
        const next = { ...clip, ...updater(clip) };
        if (override && !next.overrides.includes(override)) {
          next.overrides = [...next.overrides, override];
        }
        return next;
      }),
    );
  },

  applyClipPatches: (patches) => {
    // S231 — the setup import's apply: one commit (one undo step) with a
    // *per-clip* override list, because one row pins a duration while its
    // neighbour pins only a transition — a single shared override would pin
    // fields the file never set.
    const document = get().document;
    const entries = Object.entries(patches);
    if (!document || entries.length === 0) return;
    const byId = new Map(entries);
    get().commitClips(
      document.clips.map((clip) => {
        const planned = byId.get(clip.id);
        if (!planned) return clip;
        const next = { ...clip, ...planned.patch };
        const missing = (planned.overrides ?? []).filter(
          (field) => !next.overrides.includes(field),
        );
        if (missing.length > 0) next.overrides = [...next.overrides, ...missing];
        return next;
      }),
    );
  },

  removeClips: (clipIds) => {
    const document = get().document;
    if (!document) return;
    const removing = new Set(clipIds);
    get().commitClips(document.clips.filter((clip) => !removing.has(clip.id)));
    set((state) => ({
      selectedClipIds: state.selectedClipIds.filter((id) => !removing.has(id)),
    }));
  },

  undo: () => {
    const state = get();
    const previous = state.undoStack[state.undoStack.length - 1];
    if (!previous || !state.document) return;
    set({
      document: applySnapshot(state.document, previous),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, snapshotOf(state.document)].slice(-UNDO_LIMIT),
      // Clips restored from before a track delete may sit on tracks the
      // current selection cannot know about; the reverse leaves selected ids
      // pointing at nothing. Clearing is the only always-correct option.
      selectedClipIds: [],
    });
    persistSnapshot(get, set);
  },

  redo: () => {
    const state = get();
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next || !state.document) return;
    set({
      document: applySnapshot(state.document, next),
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, snapshotOf(state.document)].slice(-UNDO_LIMIT),
      selectedClipIds: [],
    });
    persistSnapshot(get, set);
  },

  setStoryboardReport: (storyboardReport) => set({ storyboardReport }),

  select: (selectedClipIds) => set({ selectedClipIds }),
  setPlayhead: (playheadFrame) => set({ playheadFrame: Math.max(0, Math.round(playheadFrame)) }),
  // Stopping always returns to 1x. A paused transport that silently remembers
  // "4x reverse" would make the next press of Space behave inexplicably.
  setPlaying: (playing) => set(playing ? { playing } : { playing, playbackRate: 1 }),
  // Bounded at 32x: past that a single rAF tick skips more than most clips are
  // long and the preview shows noise rather than the cut.
  setPlaybackRate: (rate) => set({ playbackRate: Math.min(32, Math.max(-32, rate)) }),
  requestFit: () => set((state) => ({ fitVersion: state.fitVersion + 1 })),
  setSnapEnabled: (enabled) => {
    writeLocalSetting('ai_video_studio_timeline_snap', enabled ? 'on' : 'off');
    set({ snapEnabled: enabled });
  },

  setZoom: (pixelsPerSecond) =>
    // Bounded: below 4 a whole episode is a smear, above 400 a single clip
    // fills the panel and dragging becomes unusable.
    set({ pixelsPerSecond: Math.min(400, Math.max(4, pixelsPerSecond)) }),
  setRenderProgress: (renderProgress) =>
    set((state) => {
      // A render that changed sequence is a *new* render, so the clock and
      // the estimate restart with it rather than carrying a stale start
      // across. Same event, same decision, in one place.
      const switched =
        renderProgress !== null && state.activeRenderSequenceId !== renderProgress.sequenceId;
      return {
        renderProgress,
        // First event of a render stamps the clock; clearing the progress
        // clears it. A mid-render event leaves the original stamp alone,
        // which is what makes the elapsed figure survive a trip to another
        // screen or another project.
        renderStartedAt:
          renderProgress === null ? null : switched ? Date.now() : (state.renderStartedAt ?? Date.now()),
        // `null` is only ever sent when a render settles, so it ends the
        // render as well as its progress. Leaving the id behind would pin
        // every Export button in the project disabled for the session.
        activeRenderSequenceId: renderProgress === null ? null : renderProgress.sequenceId,
      };
    }),

  setActiveRenderSequenceId: (activeRenderSequenceId) =>
    set((state) =>
      activeRenderSequenceId === null
        ? // The render is over: its progress goes with it, whatever the last
          // event happened to say.
          { activeRenderSequenceId: null, renderProgress: null, renderStartedAt: null }
        : {
            activeRenderSequenceId,
            renderStartedAt:
              state.activeRenderSequenceId === activeRenderSequenceId
                ? state.renderStartedAt
                : // Re-attaching to a render this window did not start: the
                  // true start is unknown, so the clock begins now and reads
                  // as time-since-reattach rather than inventing a figure.
                  Date.now(),
          },
    ),
}));

/**
 * The playhead as of *now* — the transport clock's live frame while playing,
 * the store's committed one otherwise.
 *
 * For event handlers (the `S` split, `I`/`O` trims) that fire mid-playback:
 * the store only re-syncs on pause (Beta S151 H2), so reading it directly
 * during play would act at wherever playback *started*, not where the user is
 * looking when they press the key.
 */
export function currentPlayheadFrame(): number {
  const state = useSequenceStore.getState();
  return state.playing && transportClock.running
    ? Math.max(0, Math.round(transportClock.frame))
    : state.playheadFrame;
}

/**
 * The transport's length in frames — the furthest end across every track,
 * audio included (S157, owner item 12). The *render* still measures itself
 * with `sequenceDurationFrames`; this selector feeds playback, the ruler and
 * the Home/End clamps, where an audio-only timeline must still run.
 */
export function selectDurationFrames(state: SequenceState): number {
  return state.document
    ? transportDurationFrames(state.document.tracks, state.document.clips)
    : 0;
}

export function selectSelectedClip(state: SequenceState): SequenceClip | null {
  if (!state.document || state.selectedClipIds.length !== 1) return null;
  return state.document.clips.find((clip) => clip.id === state.selectedClipIds[0]) ?? null;
}

/** The empty-selection result, one shared reference — see `selectSelectedClips`. */
const NO_SELECTED_CLIPS: SequenceClip[] = [];

/**
 * S160 — every selected clip, in document order. The multi-select inspector's
 * read.
 *
 * S162 — the non-empty case builds a fresh array per call, and zustand v5 runs
 * selectors inside `useSyncExternalStore` with no result memoisation, so any
 * hook subscription MUST wrap this in `useShallow` — a bare
 * `useSequenceStore(selectSelectedClips)` render-loops the component the
 * moment a clip is selected (`getSnapshot` never stabilises). `getState()`
 * call sites are unaffected.
 */
export function selectSelectedClips(state: SequenceState): SequenceClip[] {
  if (!state.document || state.selectedClipIds.length === 0) return NO_SELECTED_CLIPS;
  const ids = new Set(state.selectedClipIds);
  return state.document.clips.filter((clip) => ids.has(clip.id));
}
