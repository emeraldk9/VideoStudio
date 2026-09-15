import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  TIMELINE_DRAG_MIME,
  clipAllowedOnTrack,
  deleteToPlayhead,
  droppableOnTrack,
  isOverlayTrack,
  isTextTrack,
  layoutTrack,
  moveClipToTrack,
  moveSelectionBy,
  parseTimelineDrag,
  placeSourcesAt,
  rippleDelete,
  snapFrame,
  snapTargets,
  splitAtFrame,
  timelineSnapTargets,
  selectTimelineWatermarkTargets,
  splitClipAtFrame,
  tracksInDisplayOrder,
  trimClipEdge,
  type SequenceClip,
  type SequenceTrack,
  type TimelineDragItem,
} from '@shared';

import {
  correctDroppedDurations,
  currentPlayheadFrame,
  useImportedMediaStore,
  useMediaDragStore,
  useSequenceStore,
  selectDurationFrames,
  transportClock,
} from '../../../entities/sequence';
import { useModalStore } from '../../../shared/model/modalStore';
import { ContextMenu, type ContextMenuItem } from '../../../shared/ui/ContextMenu';
import { IconButton } from '../../../shared/ui/IconButton';
import { SNAP_THRESHOLD_PX, useTimelineDrag, type DragState } from '../lib/useTimelineDrag';

import { RenameInput } from './RenameInput';
import { LANE_LABEL_WIDTH_PX, TimelineTrackRow } from './TimelineLane';
import { TIMELINE_RULER_HEIGHT_PX, TimelineRuler } from './TimelineRuler';

/**
 * Beta S145 — the timeline surface: ruler, three lanes, playhead.
 *
 * Flat and canvas-toned per the design system's own timeline spec, at the
 * `--timeline-h` height token that has existed unused since the system was
 * written. Structural definition comes from tone, not borders.
 */

/** Vertical gap between lane rows — Tailwind's `gap-2`, shared by the row-geometry math. */
const LANE_GAP_PX = 8;

/**
 * S157 — where a vertical position lands: a track row (the row plus its
 * trailing gap, so the 8px gutter resolves to its neighbour rather than
 * minting surprise tracks), or the open space below the lanes, which is the
 * "drag out of the lane" target that creates one.
 */
type LaneTarget = { type: 'row'; track: SequenceTrack } | { type: 'new' };

/**
 * S200 — where an external (pool) drag would land: a row, keyed by track id
 * so the identity guard below can compare cheaply, or the new-track zone.
 */
type DropLanding = { type: 'row'; trackId: string } | { type: 'new' };

/** The typed lane a kind mints when dropped below the last row. */
function newTrackLabel(kind: TimelineDragItem['kind']): string {
  if (kind === 'audio') return 'audio';
  if (kind === 'text') return 'text';
  if (kind === 'effect') return 'overlay';
  return 'video';
}

export function TimelinePanel() {
  const document = useSequenceStore((state) => state.document);
  const pixelsPerSecond = useSequenceStore((state) => state.pixelsPerSecond);
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const playheadFrame = useSequenceStore((state) => state.playheadFrame);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const select = useSequenceStore((state) => state.select);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const setZoom = useSequenceStore((state) => state.setZoom);
  const fitVersion = useSequenceStore((state) => state.fitVersion);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** S174 — the content sizer, owner of `--playhead-x`/`--lane-label-w`. */
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const dragTarget = useRef<{ clip: SequenceClip; edge?: 'start' | 'end' } | null>(null);
  const addTrack = useSequenceStore((state) => state.addTrack);
  const reorderTracks = useSequenceStore((state) => state.reorderTracks);

  const clips = useMemo(() => document?.clips ?? [], [document]);
  const tracks = useMemo(() => document?.tracks ?? [], [document]);
  const displayTracks = useMemo(() => tracksInDisplayOrder(tracks), [tracks]);
  const spineTrackId = document?.sequence.spineTrackId ?? null;
  const fps = document?.sequence.fps ?? 24;
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);
  const snapEnabled = useSequenceStore((state) => state.snapEnabled);
  const markersForTargets = useSequenceStore((state) => state.markers);

  /**
   * S175 — three target sets, deliberately layered for stability. Clip edges
   * are a document fact and rebuild only on a commit; the static set adds
   * markers and the sequence end; the move set adds the playhead. Split
   * because the playhead moves per scrub — folding it into one memo would
   * rebuild the array per pointer event — and because a scrub snapping to
   * the playhead's own parked position would fight the gesture.
   */
  const clipTargets = useMemo(() => snapTargets(tracks, clips), [tracks, clips]);
  const markerFrames = useMemo(
    () => markersForTargets.map((marker) => marker.frame),
    [markersForTargets],
  );
  const staticTargets = useMemo(
    () =>
      timelineSnapTargets({
        base: clipTargets,
        markerFrames,
        playheadFrame: null,
        sequenceEndFrame: durationFrames,
      }),
    [clipTargets, markerFrames, durationFrames],
  );
  const moveTargets = useMemo(
    () =>
      timelineSnapTargets({
        base: clipTargets,
        markerFrames,
        playheadFrame,
        sequenceEndFrame: durationFrames,
      }),
    [clipTargets, markerFrames, playheadFrame, durationFrames],
  );

  /**
   * `Shift`+`Z` — fit the sequence to the panel.
   *
   * The screen raises `fitVersion` and this computes the zoom, because only
   * the panel knows how wide it actually is. `LANE_LABEL_WIDTH_PX` comes off
   * the top because the lane troughs start after the labels, and a fit that
   * ignored them would push the last clip just past the right edge.
   */
  useEffect(() => {
    if (fitVersion === 0) return;
    const element = scrollRef.current;
    if (!element || durationFrames <= 0) return;
    const available = element.clientWidth - LANE_LABEL_WIDTH_PX - 16;
    if (available <= 0) return;
    setZoom(available / (durationFrames / fps));
  }, [fitVersion, durationFrames, fps, setZoom]);

  /**
   * Beta S151 (H2) — during playback the playhead follows `transportClock`
   * with direct style writes, bypassing React entirely.
   *
   * S145 routed every clock tick through `setPlayhead`, which re-rendered this
   * panel, all three lanes, every clip and every waveform at display rate to
   * move a 1px line. The store now updates only on pause/stop, and this
   * subscription is the line's animation channel in between. The subscription
   * is unconditional — the clock only publishes while running, so an idle
   * subscription costs nothing, and the rendered `left` (from the committed
   * store value) takes over the moment playback stops.
   */
  useEffect(
    () =>
      transportClock.subscribe((frame) => {
        // S174 — one custom-property write moves both playhead halves (the
        // cap in the pinned strip and the line over the lanes). Still zero
        // React per tick; the committed render sets the same property inline
        // and takes over on stop.
        sizerRef.current?.style.setProperty(
          '--playhead-x',
          `${frame * (pixelsPerSecond / fps)}px`,
        );
      }),
    [pixelsPerSecond, fps],
  );

  /**
   * Beta S154 (B4) — the one width the ruler and every trough render at.
   *
   * Two formulas used to exist: the ruler sized itself from the sequence
   * duration and the lanes clamped to `Math.max(600, …)` — so on a short
   * sequence the ruler ended at 0:02, the troughs at 600px, and neither
   * reached the edge of a 2000px panel (owner's screenshot, 2026-08-13).
   * Now: the content's width, or the visible panel's, whichever is larger —
   * an empty sequence presents full-width drop targets under a scale that
   * spans them.
   */
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setPanelWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const widthPx = Math.max(
    panelWidth - LANE_LABEL_WIDTH_PX - 16,
    (durationFrames / fps) * pixelsPerSecond,
  );

  /**
   * S157 — resolves the pointer's vertical position to a lane target.
   *
   * Row geometry is re-derived from the same numbers the rows render from
   * (height clamp + `gap-2`), so the hit test cannot drift from the layout.
   * A row *owns its trailing gap* — an 8px gutter that minted tracks would
   * turn every slightly-diagonal drag into a surprise lane. Only the open
   * space below the last row is the new-track zone.
   */
  const laneTargetAt = useCallback(
    (clientY: number): LaneTarget | null => {
      const element = lanesRef.current;
      if (!element) return null;
      const y = clientY - element.getBoundingClientRect().top;
      if (y < 0) return null;
      let cursor = 0;
      for (const track of displayTracks) {
        cursor += Math.max(24, track.heightPx) + LANE_GAP_PX;
        if (y < cursor) return { type: 'row', track };
      }
      return { type: 'new' };
    },
    [displayTracks],
  );

  /** "Drag out of the lane creates a lane" — mint a track the clip may live on, then move onto it.
      S165 — the minted lane is typed by the clip: text mints a text lane, an
      effect an overlay lane, media a plain video lane. */
  const moveClipToNewTrack = useCallback(
    async (clip: SequenceClip, sourceTrack: SequenceTrack, deltaFrames: number) => {
      const kind = sourceTrack.kind;
      if (kind === 'audio') {
        await addTrack('audio', `Audio ${tracks.filter((t) => t.kind === 'audio').length + 1}`);
      } else if (clip.sourceKind === 'text') {
        const count = tracks.filter((t) => isTextTrack(t)).length;
        await addTrack('video', count > 0 ? `Text ${count + 1}` : 'Text', 'text');
      } else if (clip.sourceKind === 'effect') {
        const count = tracks.filter((t) => isOverlayTrack(t)).length;
        await addTrack('video', count > 0 ? `Overlay ${count + 1}` : 'Overlay', 'overlay');
      } else {
        await addTrack('video', `Video ${tracks.filter((t) => t.kind === 'video').length}`);
      }
      const state = useSequenceStore.getState();
      const fresh = state.document;
      if (!fresh) return;
      const target = fresh.tracks
        .filter((track) => track.kind === kind)
        .sort((a, b) => b.orderIndex - a.orderIndex)[0];
      if (!target || target.id === sourceTrack.id) return;
      const next = moveClipToTrack(fresh.clips, clip.id, sourceTrack, target, deltaFrames);
      if (next) state.commitClips(next);
    },
    [addTrack, tracks],
  );

  /**
   * Applies a finished gesture.
   *
   * Move on a **magnetic track is a reorder**, not a reposition: there is no
   * coordinate to write — the clip is spliced into the position its new
   * centre lands in. Move on a free track *is* a reposition, because those
   * carry explicit offsets. Getting this backwards would either put gaps in
   * the spine or make narration snap to the clip before it.
   *
   * S157 — the pointer's vertical landing decides *which* track first: a
   * different row is a cross-track splice, the space below the lanes mints a
   * track (`moveClipToNewTrack`), and only a same-row landing runs the
   * original horizontal logic.
   */
  const applyDrag = useCallback(
    (state: DragState) => {
      const target = dragTarget.current;
      dragTarget.current = null;
      if (!target || !document) return;
      const { clip } = target;
      const track = tracks.find((item) => item.id === clip.trackId);
      if (!track) return;

      if (state.kind === 'move') {
        // S160 (owner item 3) — group drag: grabbing a clip that belongs to
        // a multi-selection moves the whole selection by the same delta.
        // Horizontal only — a cross-track landing for N clips on M tracks
        // has no single well-defined answer, so the vertical grammar stays
        // single-clip and the group's landing is always its own rows.
        const selection = useSequenceStore.getState().selectedClipIds;
        if (selection.length > 1 && selection.includes(clip.id)) {
          if (state.deltaFrames === 0) return;
          commitClips(moveSelectionBy(clips, tracks, selection, state.deltaFrames));
          return;
        }

        const landing = laneTargetAt(state.clientY);
        if (landing?.type === 'new') {
          void moveClipToNewTrack(clip, track, state.deltaFrames);
          return;
        }
        if (landing?.type === 'row' && landing.track.id !== track.id) {
          const next = moveClipToTrack(clips, clip.id, track, landing.track, state.deltaFrames);
          if (next) commitClips(next);
          return;
        }
        // Same row from here — a vertical wobble that came home is a no-op.
        if (state.deltaFrames === 0) return;

        if (track.magnetic) {
          const placed = layoutTrack(clips, track);
          const current = placed.findIndex((item) => item.clip.id === clip.id);
          if (current < 0) return;
          const centre = placed[current].startFrames + state.deltaFrames + clip.durationFrames / 2;
          let next = placed.findIndex((item) => centre < item.endFrames);
          if (next < 0) next = placed.length - 1;
          if (next === current) return;

          const ordered = placed.map((item) => item.clip);
          const [moved] = ordered.splice(current, 1);
          ordered.splice(next, 0, moved);
          const reordered = ordered.map((item, index) => ({ ...item, orderIndex: index }));
          commitClips([...clips.filter((item) => item.trackId !== track.id), ...reordered]);
          return;
        }

        commitClips(
          clips.map((item) =>
            item.id === clip.id
              ? { ...item, startFrames: Math.max(0, (item.startFrames ?? 0) + state.deltaFrames) }
              : item,
          ),
        );
        return;
      }

      // Trim. The source range and the timeline length move together, so a
      // trimmed clip shows a different part of its source rather than the same
      // part stretched. `trimClipEdge` is shared with the `I`/`O` keys so the
      // handle and the keyboard cannot drift apart.
      const edge = state.kind === 'trim-start' ? 'start' : 'end';
      const next = trimClipEdge(clips, clip.id, edge, state.deltaFrames);
      if (next !== clips) commitClips(next);
    },
    [clips, commitClips, document, laneTargetAt, moveClipToNewTrack, tracks],
  );

  /**
   * S175 — the snap indicator, driven imperatively from `onDelta` (the app's
   * `TimelinePreview` snap-line language: 1px accent at 70%, visible only
   * while a target actually holds the gesture). No React state per move.
   */
  const snapLineRef = useRef<HTMLDivElement | null>(null);
  const handleDragDelta = useCallback(
    (deltaFrames: number, snappedTarget: number | null) => {
      // S176 — the live drag offset: one custom-property write per pointer
      // event moves every flagged clip. Direct rather than rAF-coalesced —
      // two style writes per event are nothing next to the full-tree render
      // each event used to cost, and coalescing would lag the hand.
      sizerRef.current?.style.setProperty(
        '--drag-dx',
        `${deltaFrames * (pixelsPerSecond / fps)}px`,
      );
      const line = snapLineRef.current;
      if (!line) return;
      if (snappedTarget === null) {
        line.style.display = 'none';
        return;
      }
      line.style.display = 'block';
      line.style.left = `calc(var(--lane-label-w) + ${snappedTarget * (pixelsPerSecond / fps)}px)`;
    },
    [fps, pixelsPerSecond],
  );

  const { drag, begin, move, end } = useTimelineDrag({
    pixelsPerSecond,
    fps,
    targets: moveTargets,
    scrubTargets: staticTargets,
    snapEnabled,
    onCommit: applyDrag,
    onScrub: setPlayhead,
    onDelta: handleDragDelta,
  });

  // Neither live channel may survive its gesture — the line hides and the
  // offset zeroes the moment the drag ends, however it ends.
  useEffect(() => {
    if (drag) return;
    if (snapLineRef.current) snapLineRef.current.style.display = 'none';
    sizerRef.current?.style.setProperty('--drag-dx', '0px');
  }, [drag]);

  /**
   * S176 — which clips the live offset moves. A move drags the grabbed clip,
   * or the whole selection when the grabbed clip belongs to one — minus
   * locked tracks, mirroring `moveSelectionBy`'s own skip so nothing
   * previews a move the commit will refuse. (Magnetic-track members
   * translate too: that is the "carrying" preview; the commit re-splices.)
   * A trim moves only the grabbed edge's clip.
   */
  const liveDragClipIds = useMemo<ReadonlySet<string> | null>(() => {
    if (!drag?.clipId) return null;
    if (drag.kind === 'move') {
      if (selectedClipIds.length > 1 && selectedClipIds.includes(drag.clipId)) {
        const lockedTracks = new Set(tracks.filter((track) => track.locked).map((track) => track.id));
        return new Set(
          clips
            .filter((clip) => selectedClipIds.includes(clip.id) && !lockedTracks.has(clip.trackId))
            .map((clip) => clip.id),
        );
      }
      return new Set([drag.clipId]);
    }
    if (drag.kind === 'trim-start' || drag.kind === 'trim-end') return new Set([drag.clipId]);
    return null;
  }, [clips, drag, selectedClipIds, tracks]);

  /**
   * Live landing target while a clip is mid-move — the row to highlight, or
   * the new-track ghost. State written from the pointer-move handler (refs
   * are off-limits during render), fed by the same `laneTargetAt` the commit
   * uses, so what lights up is exactly what a release would do.
   */
  const [landingState, setMoveLanding] = useState<LaneTarget | null>(null);
  // Gated on the live gesture rather than cleared by an effect — stale state
  // is unreachable while no move-drag is running.
  const moveLanding = drag?.kind === 'move' ? landingState : null;
  /**
   * S173 — `laneTargetAt` builds a fresh object per call, so writing it
   * per-pointermove was a guaranteed re-render per pointer event even while
   * the resolved target never changed. The ref remembers the last *identity*
   * (track id / 'new' / none) and the setState fires only on an actual change
   * — ~2 renders per drag instead of ~100.
   */
  const landingIdentityRef = useRef<string | null>(null);
  const updateMoveLanding = useCallback(
    (landing: LaneTarget | null) => {
      const identity = landing === null ? null : landing.type === 'new' ? 'new' : landing.track.id;
      if (identity === landingIdentityRef.current) return;
      landingIdentityRef.current = identity;
      setMoveLanding(landing);
    },
    [],
  );

  const dragSource = useMemo(() => {
    if (drag?.kind !== 'move' || !drag.clipId) return null;
    const clip = clips.find((item) => item.id === drag.clipId);
    if (!clip) return null;
    const track = tracks.find((item) => item.id === clip.trackId) ?? null;
    return track ? { clip, track } : null;
  }, [clips, drag, tracks]);
  const dragSourceTrackId = dragSource?.track.id ?? null;
  /** S165 — the highlight runs the same legality predicate a release runs. */
  const dragClip = dragSource?.clip ?? null;

  /**
   * S157 (D2) — track z-order drag, a vertical pointer gesture on the header.
   *
   * Kept apart from `useTimelineDrag` on purpose: that hook's vocabulary is
   * frames on the horizontal axis, and a header drag has no frame component.
   * The gesture reorders **within the kind group** (video stack above audio
   * stack — `tracksInDisplayOrder`'s invariant), and for video the display
   * order *is* the composite's z-order reversed, so this is the "order the
   * lane Z level" control.
   */
  const reorderRef = useRef<{ track: SequenceTrack; startY: number } | null>(null);
  const [reorderHover, setReorderHover] = useState<{
    trackId: string;
    /** Insertion position among the group's rows, dragged row excluded. */
    index: number;
  } | null>(null);

  /** Display-order geometry of one kind's rows, dragged row excluded.
      S166 — the spine is excluded too: it still occupies vertical space in
      the walk, but it is never an insertion slot — the composite's floor. */
  const groupRows = useCallback(
    (kind: SequenceTrack['kind'], excludeId: string) => {
      let top = 0;
      const rows: { track: SequenceTrack; top: number; height: number }[] = [];
      for (const track of displayTracks) {
        const height = Math.max(24, track.heightPx);
        if (track.kind === kind && track.id !== excludeId && track.id !== spineTrackId) {
          rows.push({ track, top, height });
        }
        top += height + LANE_GAP_PX;
      }
      return rows;
    },
    [displayTracks, spineTrackId],
  );

  const handleReorderStart = useCallback(
    (track: SequenceTrack, clientY: number) => {
      // S166 — the spine's header is inert: the floor of the composite does
      // not reorder (the row also never offers the gesture, belt and braces).
      if (track.id === spineTrackId) return;
      reorderRef.current = { track, startY: clientY };
    },
    [spineTrackId],
  );

  const handleReorderMove = useCallback(
    (clientY: number) => {
      const current = reorderRef.current;
      const element = lanesRef.current;
      if (!current || !element) return;
      // A hand's tremor is a click (the rename double-click travels through
      // here); the gesture only becomes a reorder past the same 8px the clip
      // drag uses.
      if (Math.abs(clientY - current.startY) <= 8 && reorderHover === null) return;
      // S166 — edge auto-scroll: a drag held near the dock's rim scrolls the
      // lane list, so reordering works past the visible rows. Move-driven
      // (each pointer event nudges); the geometry below reads live rects, so
      // the scrolled position self-corrects.
      const scroller = scrollRef.current;
      if (scroller) {
        const rim = scroller.getBoundingClientRect();
        // S174 — the top threshold sits below the pinned strip, or the zone
        // would be hidden behind the chrome.
        if (clientY < rim.top + TIMELINE_RULER_HEIGHT_PX + 24) scroller.scrollTop -= 12;
        else if (clientY > rim.bottom - 24) scroller.scrollTop += 12;
      }
      const y = clientY - element.getBoundingClientRect().top;
      const rows = groupRows(current.track.kind, current.track.id);
      let index = rows.length;
      for (let i = 0; i < rows.length; i += 1) {
        if (y < rows[i].top + rows[i].height / 2) {
          index = i;
          break;
        }
      }
      setReorderHover({ trackId: current.track.id, index });
    },
    [groupRows, reorderHover],
  );

  const handleReorderEnd = useCallback(() => {
    const current = reorderRef.current;
    reorderRef.current = null;
    const hover = reorderHover;
    setReorderHover(null);
    if (!current || !hover) return;
    const isVideo = current.track.kind === 'video';
    // S166 — the spine is pinned: it is not a slot (`groupRows` skips it) and
    // it re-enters the committed order at the bottom of the composite, which
    // also normalizes a pre-S166 document whose spine had been dragged.
    const group = displayTracks.filter(
      (track) => track.kind === current.track.kind && (!isVideo || track.id !== spineTrackId),
    );
    const without = group.filter((track) => track.id !== current.track.id);
    const insertAt = Math.min(hover.index, without.length);
    without.splice(insertAt, 0, current.track);
    if (without.every((track, index) => track.id === group[index]?.id)) return;
    // Display order is descending `orderIndex` for video (top of composite
    // first) and ascending for audio; the repository wants ascending — for
    // video that means the spine first, then the stack bottom-up.
    const ascending = isVideo ? [...without].reverse() : without;
    void reorderTracks(current.track.kind, [
      ...(isVideo && spineTrackId ? [spineTrackId] : []),
      ...ascending.map((track) => track.id),
    ]);
  }, [displayTracks, reorderHover, reorderTracks, spineTrackId]);

  // S166 — Escape abandons a live header drag: the ref and hover clear, and
  // the captured pointer's remaining events fall through the null ref as
  // no-ops until release.
  useEffect(() => {
    if (reorderHover === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      reorderRef.current = null;
      setReorderHover(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reorderHover]);

  /**
   * S166 — the ⋮ menu's deterministic reorder: swap with the display-order
   * neighbour, committed through the same `reorderTracks` door the drag uses
   * so the two affordances cannot drift. The spine is in no group and gets
   * no items; `canMoveTrack` disables the edges.
   */
  const moveGroupOf = useCallback(
    (track: SequenceTrack) =>
      displayTracks.filter(
        (item) => item.kind === track.kind && item.id !== spineTrackId,
      ),
    [displayTracks, spineTrackId],
  );

  const canMoveTrack = useCallback(
    (track: SequenceTrack, direction: 'up' | 'down'): boolean => {
      if (track.id === spineTrackId) return false;
      const group = moveGroupOf(track);
      const index = group.findIndex((item) => item.id === track.id);
      if (index < 0) return false;
      return direction === 'up' ? index > 0 : index < group.length - 1;
    },
    [moveGroupOf, spineTrackId],
  );

  const moveTrack = useCallback(
    (track: SequenceTrack, direction: 'up' | 'down') => {
      const group = moveGroupOf(track);
      const index = group.findIndex((item) => item.id === track.id);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= group.length) return;
      const next = [...group];
      [next[index], next[target]] = [next[target], next[index]];
      const isVideo = track.kind === 'video';
      const ascending = isVideo ? [...next].reverse() : next;
      void reorderTracks(track.kind, [
        ...(isVideo && spineTrackId ? [spineTrackId] : []),
        ...ascending.map((item) => item.id),
      ]);
    },
    [moveGroupOf, reorderTracks, spineTrackId],
  );

  /**
   * S157 — marquee (rubber-band) selection, the mouse's quick multi-select.
   *
   * Starts from a press on *empty* trough space (`TimelineTrackRow` filters
   * that; clips capture their own pointer, the ruler owns scrubbing, headers
   * own reorder — the empty trough was the one unclaimed surface). While the
   * drag runs, every clip the rectangle touches is selected **live** through
   * the ordinary `select` action, so the highlight is the same one a click
   * produces. Shift at press time unions with the prior selection; a press
   * that never travels is a click on nothing and clears it — the standard
   * NLE grammar.
   *
   * Coordinates are content-space (relative to the lanes container), derived
   * from client coordinates against the live bounding rect each move — which
   * makes mid-drag horizontal scrolling self-correcting.
   */
  const marqueeRef = useRef<{ startX: number; startY: number; baseSelection: string[] } | null>(
    null,
  );
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const marqueePoint = useCallback((event: React.PointerEvent) => {
    const bounds = lanesRef.current?.getBoundingClientRect();
    return bounds
      ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: 0, y: 0 };
  }, []);

  const handleMarqueeStart = useCallback(
    (event: React.PointerEvent, _track: SequenceTrack) => {
      // S160 — the marquee belongs to the select tool; a blade or sweep
      // press on empty trough space does nothing rather than rubber-band.
      if (useSequenceStore.getState().toolMode !== 'select') return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = marqueePoint(event);
      marqueeRef.current = {
        startX: point.x,
        startY: point.y,
        baseSelection: event.shiftKey ? useSequenceStore.getState().selectedClipIds : [],
      };
    },
    [marqueePoint],
  );

  /** Clip ids inside the rect — locked tracks skipped, geometry re-derived from the rows. */
  const clipsInRect = useCallback(
    (rect: { left: number; top: number; width: number; height: number }): string[] => {
      const ids: string[] = [];
      let rowTop = 0;
      for (const track of displayTracks) {
        const height = Math.max(24, track.heightPx);
        const rowBottom = rowTop + height;
        if (!track.locked && rowBottom > rect.top && rowTop < rect.top + rect.height) {
          for (const placed of layoutTrack(clips, track)) {
            const left = LANE_LABEL_WIDTH_PX + placed.startFrames * (pixelsPerSecond / fps);
            const right = LANE_LABEL_WIDTH_PX + placed.endFrames * (pixelsPerSecond / fps);
            if (right > rect.left && left < rect.left + rect.width) ids.push(placed.clip.id);
          }
        }
        rowTop = rowBottom + LANE_GAP_PX;
      }
      return ids;
    },
    [clips, displayTracks, fps, pixelsPerSecond],
  );

  const handleMarqueeMove = useCallback(
    (event: React.PointerEvent) => {
      const current = marqueeRef.current;
      if (!current) return;
      const point = marqueePoint(event);
      const rect = {
        left: Math.min(current.startX, point.x),
        top: Math.min(current.startY, point.y),
        width: Math.abs(point.x - current.startX),
        height: Math.abs(point.y - current.startY),
      };
      setMarqueeRect(rect);
      select([...new Set([...current.baseSelection, ...clipsInRect(rect)])]);
    },
    [clipsInRect, marqueePoint, select],
  );

  const handleMarqueeEnd = useCallback(() => {
    const current = marqueeRef.current;
    marqueeRef.current = null;
    const rect = marqueeRect;
    setMarqueeRect(null);
    if (!current) return;
    // No travel = a click on empty space: clear (or keep the base under
    // Shift, which makes a stray shift-click harmless).
    if (!rect || (rect.width < 4 && rect.height < 4)) {
      select(current.baseSelection);
    }
  }, [marqueeRect, select]);

  /** Y of the insertion indicator line, in lanes-container coordinates. */
  const reorderIndicatorY = useMemo(() => {
    if (!reorderHover) return null;
    const dragged = tracks.find((track) => track.id === reorderHover.trackId);
    if (!dragged) return null;
    const rows = groupRows(dragged.kind, dragged.id);
    if (rows.length === 0) return null;
    if (reorderHover.index >= rows.length) {
      const last = rows[rows.length - 1];
      return last.top + last.height + LANE_GAP_PX / 2;
    }
    return Math.max(1, rows[reorderHover.index].top - LANE_GAP_PX / 2);
  }, [groupRows, reorderHover, tracks]);

  const toolMode = useSequenceStore((state) => state.toolMode);

  /**
   * S160 (owner item 8) — the directional sweep: select the clicked clip and
   * everything to one side of it, Premiere's Track Select Forward/Backward.
   * All unlocked tracks by default; `additive` (Shift held) narrows to the
   * clicked clip's own track — Shift already means "modify the scope" here.
   */
  const sweepSelect = useCallback(
    (clipId: string, direction: 'left' | 'right', ownTrackOnly: boolean) => {
      const clicked = clips.find((item) => item.id === clipId);
      if (!clicked) return;
      const clickedTrack = tracks.find((item) => item.id === clicked.trackId);
      if (!clickedTrack) return;
      const origin = layoutTrack(clips, clickedTrack).find((item) => item.clip.id === clipId);
      if (!origin) return;
      const ids: string[] = [];
      for (const track of tracks) {
        if (track.locked) continue;
        if (ownTrackOnly && track.id !== clickedTrack.id) continue;
        for (const placed of layoutTrack(clips, track)) {
          if (
            direction === 'right'
              ? placed.startFrames >= origin.startFrames
              : placed.startFrames <= origin.startFrames
          ) {
            ids.push(placed.clip.id);
          }
        }
      }
      select(ids);
    },
    [clips, select, tracks],
  );

  const handleSelect = useCallback(
    (clipId: string, additive: boolean) => {
      // The split tool never touches the selection — a blade that selected
      // what it was about to cut would push a second undo-visible change.
      if (toolMode === 'split') return;
      if (toolMode === 'select-left' || toolMode === 'select-right') {
        sweepSelect(clipId, toolMode === 'select-left' ? 'left' : 'right', additive);
        return;
      }
      const current = useSequenceStore.getState().selectedClipIds;
      // S160 — Ctrl/Cmd toggles; Shift only ever adds. `additive` arrives as
      // shift|ctrl|meta from the clip, with ctrl/meta flagged separately.
      select(additive ? [...new Set([...current, clipId])] : [clipId]);
    },
    [select, sweepSelect, toolMode],
  );

  /** Ctrl/Cmd+click — the toggle half of the selection grammar. */
  const handleToggleSelect = useCallback(
    (clipId: string) => {
      if (toolMode !== 'select') return;
      const current = useSequenceStore.getState().selectedClipIds;
      select(
        current.includes(clipId)
          ? current.filter((id) => id !== clipId)
          : [...current, clipId],
      );
    },
    [select, toolMode],
  );

  /**
   * S160 — the split tool's click: cut this track at the pointer's frame.
   * Alt extends the cut through every unlocked track at that x.
   */
  const bladeAt = useCallback(
    (clientX: number, track: SequenceTrack, everyTrack: boolean) => {
      const bounds = lanesRef.current?.getBoundingClientRect();
      if (!bounds || !document) return;
      const frame = Math.max(0, (clientX - bounds.left - LANE_LABEL_WIDTH_PX) / (pixelsPerSecond / fps));
      const next = everyTrack
        ? splitAtFrame(clips, tracks, frame, [], () => crypto.randomUUID())
        : splitClipAtFrame(clips, track, frame, crypto.randomUUID());
      if (next) commitClips(next);
    },
    [clips, commitClips, document, fps, pixelsPerSecond, tracks],
  );

  /** S160 — right-click state: where, and on which clip. */
  const [menu, setMenu] = useState<{ x: number; y: number; clip: SequenceClip } | null>(null);
  // S353 — the pool's path→id map is the only thing that can name an imported
  // clip's `sequence_media` row, which is its watermark identity.
  const importedMedia = useImportedMediaStore((state) => state.media);
  const openWatermarkBatchModal = useModalStore((store) => store.openWatermarkBatchModal);

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!menu || !document) return [];
    const state = () => useSequenceStore.getState();
    const targetIds = useSequenceStore
      .getState()
      .selectedClipIds.includes(menu.clip.id)
      ? useSequenceStore.getState().selectedClipIds
      : [menu.clip.id];
    // S353 — the same selection, as the deduplicated list of *files* a clean
    // would act on. Resolved through the pool's path→id map, which is the only
    // thing that can name an imported clip's `sequence_media` row.
    const targeted = new Set(targetIds);
    const watermarkTargets = selectTimelineWatermarkTargets(
      document.clips.filter((clip) => targeted.has(clip.id)),
      new Map(importedMedia.map((file) => [file.path, file.id])),
    );
    return [
      {
        label: 'Split at playhead',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = splitAtFrame(
            s.document.clips,
            s.document.tracks,
            currentPlayheadFrame(),
            targetIds,
            () => crypto.randomUUID(),
          );
          if (next) s.commitClips(next);
        },
      },
      {
        label: 'Delete left of playhead',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = deleteToPlayhead(
            s.document.clips,
            s.document.tracks,
            currentPlayheadFrame(),
            targetIds,
            'left',
          );
          if (next !== s.document.clips) s.commitClips(next);
        },
      },
      {
        label: 'Delete right of playhead',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = deleteToPlayhead(
            s.document.clips,
            s.document.tracks,
            currentPlayheadFrame(),
            targetIds,
            'right',
          );
          if (next !== s.document.clips) s.commitClips(next);
        },
      },
      {
        label: 'Add marker here',
        onSelect: () => {
          void state().addMarker(currentPlayheadFrame());
        },
      },
      /**
       * Beta S353 — the clip-level door into the watermark cleaner.
       *
       * Acts on the **files** behind the selection, not on the clips: three
       * clips of one plate are one item of work, and
       * `selectTimelineWatermarkTargets` collapses them. Hidden rather than
       * disabled when nothing in the selection resolves to a source — a text
       * clip, an audio clip, or a file the pool has no record of — because a
       * permanently greyed row teaches nothing about why.
       */
      ...(watermarkTargets.length > 0
        ? [
            {
              label:
                watermarkTargets.length === 1
                  ? 'Remove watermark'
                  : `Remove watermark from ${watermarkTargets.length} sources`,
              onSelect: () => {
                openWatermarkBatchModal(
                  watermarkTargets.map((target) => ({
                    ...target.ref,
                    label: target.label,
                    mediaType: target.mediaType,
                  })),
                );
              },
            },
          ]
        : []),
      {
        label: 'Delete',
        danger: true,
        onSelect: () => state().removeClips(targetIds),
      },
      {
        label: 'Ripple delete',
        danger: true,
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(rippleDelete(s.document.clips, s.document.tracks, targetIds));
          s.select([]);
        },
      },
    ];
  }, [document, importedMedia, menu, openWatermarkBatchModal]);

  const handleClipContextMenu = useCallback(
    (event: React.MouseEvent, clip: SequenceClip) => {
      event.preventDefault();
      // Right-click on an unselected clip selects it first — the universal
      // grammar; acting on a clip the menu is not about would be a trap.
      const current = useSequenceStore.getState().selectedClipIds;
      if (!current.includes(clip.id)) select([clip.id]);
      setMenu({ x: event.clientX, y: event.clientY, clip });
    },
    [select],
  );

  /**
   * S200 — places resolved drag items on a track at a frame: one
   * `placeSourcesAt`, one commit (one undo entry), the placed clips become
   * the selection (the next verb is almost always on what was just placed),
   * and the S151 duration correction runs as one batch. Reads the store
   * rather than the render's `clips` so the new-track path — which awaits a
   * track mint first — places into the fresh document.
   */
  const placeItems = useCallback((track: SequenceTrack, items: readonly TimelineDragItem[], frame: number) => {
    const state = useSequenceStore.getState();
    const fresh = state.document;
    if (!fresh) return;
    const result = placeSourcesAt(
      fresh.clips,
      track,
      items,
      frame,
      fresh.sequence.fps,
      fresh.sequence.id,
      () => crypto.randomUUID(),
    );
    if (result.placedIds.length === 0) return;
    state.commitClips(result.clips);
    state.select(result.placedIds);
    correctDroppedDurations(result.placed, fresh.sequence.id);
  }, []);

  const handleDrop = useCallback(
    (track: SequenceTrack, payload: string, frame: number) => {
      const items = parseTimelineDrag(payload);
      if (items.length === 0) return;
      placeItems(track, items, frame);
    },
    [placeItems],
  );

  /**
   * S200 — the in-flight pool drag (published by the pool at `dragstart`,
   * because `getData` is sealed during `dragover`), and where it would land.
   * `dropLanding` is React state, guarded by identity like the move landing:
   * it changes only when the *target lane* changes, never per pointer event
   * — the ghost's position rides `--drop-x` on the trough.
   */
  const dragItems = useMediaDragStore((state) => state.items);
  const [dropLandingState, setDropLanding] = useState<DropLanding | null>(null);
  const dropLanding = dragItems ? dropLandingState : null;
  const dropLandingIdentityRef = useRef<string | null>(null);
  const updateDropLanding = useCallback((landing: DropLanding | null) => {
    const identity = landing === null ? null : landing.type === 'new' ? 'new' : landing.trackId;
    if (identity === dropLandingIdentityRef.current) return;
    dropLandingIdentityRef.current = identity;
    setDropLanding(landing);
  }, []);

  /**
   * The lane's mid-drag question: may this drag land here, and at what frame?
   * Legality is `droppableOnTrack` — the same predicate `placeSourcesAt`
   * applies, so what lights up is what a release does. A free lane snaps
   * (`Alt` suppresses, matching S173's moves) and drives the snap line; a
   * magnetic lane has no frame to snap — the slot decides.
   */
  const handleDropHover = useCallback(
    (track: SequenceTrack, rawFrame: number, altKey: boolean): number | null => {
      if (!dragItems || !droppableOnTrack(dragItems, track)) {
        updateDropLanding(null);
        return null;
      }
      updateDropLanding({ type: 'row', trackId: track.id });
      const line = snapLineRef.current;
      if (track.magnetic) {
        if (line) line.style.display = 'none';
        return rawFrame;
      }
      const snapping = snapEnabled !== altKey;
      const tolerance = SNAP_THRESHOLD_PX / (pixelsPerSecond / fps);
      const frame = snapping ? snapFrame(rawFrame, moveTargets, tolerance) : rawFrame;
      const held = snapping && frame !== rawFrame;
      if (line) {
        line.style.display = held ? 'block' : 'none';
        if (held) line.style.left = `calc(var(--lane-label-w) + ${frame * (pixelsPerSecond / fps)}px)`;
      }
      return Math.round(frame);
    },
    [dragItems, fps, moveTargets, pixelsPerSecond, snapEnabled, updateDropLanding],
  );

  /**
   * The pointer's frame in the lanes' trough space, for the new-track drop —
   * the troughs start `LANE_LABEL_WIDTH_PX` into the lanes container.
   */
  const frameAtClientX = useCallback(
    (clientX: number) => {
      const element = lanesRef.current;
      if (!element) return 0;
      const x = clientX - element.getBoundingClientRect().left - LANE_LABEL_WIDTH_PX;
      return Math.max(0, Math.round(x / (pixelsPerSecond / fps)));
    },
    [fps, pixelsPerSecond],
  );

  /** "Drop below the lanes creates a lane" — the pool-drag form of `moveClipToNewTrack`, typed by the drag. */
  const dropOnNewTrack = useCallback(
    async (items: readonly TimelineDragItem[], frame: number) => {
      const kind = items[0]?.kind;
      if (!kind) return;
      const state = useSequenceStore.getState();
      const current = state.document?.tracks ?? [];
      if (kind === 'audio') {
        await state.addTrack('audio', `Audio ${current.filter((t) => t.kind === 'audio').length + 1}`);
      } else if (kind === 'text') {
        const count = current.filter((t) => isTextTrack(t)).length;
        await state.addTrack('video', count > 0 ? `Text ${count + 1}` : 'Text', 'text');
      } else if (kind === 'effect') {
        const count = current.filter((t) => isOverlayTrack(t)).length;
        await state.addTrack('video', count > 0 ? `Overlay ${count + 1}` : 'Overlay', 'overlay');
      } else {
        await state.addTrack('video', `Video ${current.filter((t) => t.kind === 'video').length}`);
      }
      const fresh = useSequenceStore.getState().document;
      if (!fresh) return;
      const trackKind = kind === 'audio' ? 'audio' : 'video';
      const target = fresh.tracks
        .filter((track) => track.kind === trackKind)
        .sort((a, b) => b.orderIndex - a.orderIndex)[0];
      if (target) placeItems(target, items, frame);
    },
    [placeItems],
  );

  /**
   * A pool drag that leaves the lanes entirely (over the preview, the pool
   * itself) must drop its landing and its snap line — `dragleave` is
   * unreliable across nested targets, so one document-level `dragover`
   * listener for the life of the drag answers "are we still over the lanes".
   */
  useEffect(() => {
    if (!dragItems) {
      updateDropLanding(null);
      if (snapLineRef.current) snapLineRef.current.style.display = 'none';
      return;
    }
    const onDragOver = (event: DragEvent) => {
      const lanes = lanesRef.current;
      if (lanes && event.target instanceof Node && lanes.contains(event.target)) return;
      updateDropLanding(null);
      if (snapLineRef.current) snapLineRef.current.style.display = 'none';
    };
    // `window.document` — `document` is the sequence document in this scope.
    window.document.addEventListener('dragover', onDragOver);
    return () => window.document.removeEventListener('dragover', onDragOver);
  }, [dragItems, updateDropLanding]);

  const markers = useSequenceStore((state) => state.markers);
  const updateMarker = useSequenceStore((state) => state.updateMarker);
  const removeMarker = useSequenceStore((state) => state.removeMarker);
  /** S160 — the marker being renamed in place, if any. */
  const [renamingMarkerId, setRenamingMarkerId] = useState<string | null>(null);

  if (!document) return null;

  const pixelsPerFrame = pixelsPerSecond / fps;

  /** Marker palette — accent token classes, resolved by name (migration 066's rule). */
  const MARKER_CLASSES: Record<string, string> = {
    ai: 'text-accent-ai',
    success: 'text-accent-success',
    warning: 'text-accent-warning',
    info: 'text-accent-info',
  };

  return (
    <section
      aria-label="Timeline"
      // Beta S154 — fills the dock the workspace grid gives it; the dock's
      // *size* is the user's, via the row handle. `--timeline-h` no longer
      // fixes this height — the grid's clamp owns the minimum.
      className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-bg-canvas p-3"
      onWheel={(event) => {
        // Ctrl/Cmd + wheel is the universal zoom gesture; a bare wheel must
        // keep scrolling or the panel becomes unnavigable on a trackpad.
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        setZoom(pixelsPerSecond * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
      }}
    >
      {/* The empty stage still shows its lanes — the workspace is always
          visible and drop targets have to exist before anything is on them.
          One dim line says what goes here; it vanishes with the first clip. */}
      {clips.length === 0 ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-xs text-text-disabled">
          Lay out your storyboard from the Media panel, or drag files onto a track.
        </p>
      ) : null}
      {/* S157 (owner item 4) — `overflow-y-auto` + `min-h-full`: the lane
          region fills the dock however short the track list is, and scrolls
          when it outgrows it, instead of ending mid-panel. */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
        // S174 — any future scrollIntoView lands rows below the pinned strip.
        style={{ scrollPaddingTop: TIMELINE_RULER_HEIGHT_PX }}
      >
        {/* Exactly label + troughs wide: the old `widthPx + 64` slack minted a
            phantom horizontal scroll even when everything fit.

            S174 — the sizer also carries the strip's shared coordinates as
            inherited CSS custom properties: `--lane-label-w` (the gutter
            width, so no CSS hardcodes 152) and `--playhead-x` (the playhead
            in trough space). One imperative write to `--playhead-x` moves
            the cap in the pinned strip *and* the line over the lanes — the
            `transportClock` rule (S151 H2: never a React render per tick)
            generalized from one follower to two. */}
        <div
          ref={sizerRef}
          className="relative flex min-h-full min-w-full flex-col gap-2"
          style={
            {
              width: LANE_LABEL_WIDTH_PX + widthPx,
              '--lane-label-w': `${LANE_LABEL_WIDTH_PX}px`,
              '--playhead-x': `${playheadFrame * pixelsPerFrame}px`,
              // S176 — the live drag offset; every clip flagged dragging/
              // trimming follows this one variable.
              '--drag-dx': '0px',
            } as React.CSSProperties
          }
        >
          {/* S174 — the chrome strip: pinned to the top of the scroller
              (sticky against the same element that scrolls X, so it still
              translates horizontally with the content). It hosts the
              add-track corner, the ruler, the marker flags and the playhead
              cap — the last two moved in from the sizer, where a pinned
              ruler would have left them scrolling away underneath it. */}
          <div className="sticky top-0 z-30 flex shrink-0 bg-bg-canvas">
            {/* S157 follow-up — the gutter above the track headers holds the
                add-track actions, beside the column they grow (owner ask,
                2026-08-13; they briefly lived in the dock toolbar).
                S174 — it is also the frozen corner: sticky on the second
                axis, one z-tier above the ruler so the scale slides under
                it. First `sticky left-0` in the codebase. */}
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 bg-bg-canvas px-1.5"
              style={{ width: LANE_LABEL_WIDTH_PX }}
            >
              {/* S165 follow-up (owner, 2026-08-14) — each add button wears
                  the glyph of the lane it mints, 1:1 with the lane headers
                  below: videocam = video, wand = overlay, T = text, eq =
                  audio. `movie` belongs to the spine alone — the video add
                  briefly wore it and broke the button↔lane pairing for
                  exactly one type (owner report, fix 3). The old
                  `video_call` camera sat on the *overlay* add and
                  `library_music`'s stacked squares read as nothing — both
                  replaced when the plain video lane got its own door. */}
              <IconButton
                size="sm"
                icon="videocam"
                label="Add video track"
                onClick={() =>
                  void addTrack('video', `Video ${tracks.filter((t) => t.kind === 'video').length}`)
                }
              />
              <IconButton
                size="sm"
                icon="auto_fix_high"
                label="Add overlay track"
                onClick={() => {
                  const count = tracks.filter((t) => isOverlayTrack(t)).length;
                  void addTrack('video', count > 0 ? `Overlay ${count + 1}` : 'Overlay', 'overlay');
                }}
              />
              <IconButton
                size="sm"
                icon="title"
                label="Add text track"
                onClick={() => {
                  const count = tracks.filter((t) => isTextTrack(t)).length;
                  void addTrack('video', count > 0 ? `Text ${count + 1}` : 'Text', 'text');
                }}
              />
              <IconButton
                size="sm"
                icon="graphic_eq"
                label="Add audio track"
                onClick={() =>
                  void addTrack('audio', `Audio ${tracks.filter((t) => t.kind === 'audio').length + 1}`)
                }
              />
            </div>
            <div
              className="relative min-w-0 flex-1 cursor-ew-resize"
              onPointerDown={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const frame = Math.max(0, (event.clientX - bounds.left) / pixelsPerFrame);
                setPlayhead(frame);
                begin(event, 'scrub', null, frame);
              }}
              onPointerMove={move}
              onPointerUp={end}
            >
              <TimelineRuler
                durationFrames={durationFrames}
                fps={fps}
                pixelsPerSecond={pixelsPerSecond}
                widthPx={widthPx}
              />

              {/* S160 — marker flags; S174 — inside the strip, so they stay
                  pinned with the scale they annotate. Trough-space left (the
                  wrapper's origin already sits past the gutter). Click seeks;
                  double-click renames; right-click deletes. */}
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="absolute top-0 z-20"
                  style={{ left: marker.frame * pixelsPerFrame }}
                >
                  {renamingMarkerId === marker.id ? (
                    <div className="absolute left-0 top-6 z-30 w-40">
                      <RenameInput
                        initialValue={marker.name || 'Marker'}
                        ariaLabel={`Marker name at frame ${marker.frame}`}
                        maxLength={120}
                        className="w-full rounded-[var(--radius-input)] border border-hairline bg-bg-app px-1 text-xs outline-none focus:border-text-disabled"
                        onCommit={(name) => {
                          setRenamingMarkerId(null);
                          void updateMarker(marker.id, { name });
                        }}
                        onCancel={() => setRenamingMarkerId(null)}
                      />
                    </div>
                  ) : null}
                  {/* S233 — a locked marker is a sync point (R5): it draws
                      the lock glyph, shift-click toggles the lock, and
                      right-click refuses to delete it while locked — the
                      moments the sound design must hit should not vanish on
                      a stray click. */}
                  <button
                    type="button"
                    aria-label={`Marker: ${marker.name || 'unnamed'}${marker.locked ? ' (locked sync point)' : ''} — click seeks, double-click renames, shift-click ${marker.locked ? 'unlocks' : 'locks'}, right-click deletes`}
                    title={`${marker.name || 'Marker'}${marker.locked ? ' · locked sync point — shift-click to unlock' : ''}`}
                    className={`material-symbols-outlined material-symbols-outlined--filled -translate-x-1/2 cursor-pointer text-[14px] leading-none ${MARKER_CLASSES[marker.color] ?? 'text-accent-ai'}`}
                    style={{ marginTop: 13 }}
                    onClick={(event) => {
                      if (event.shiftKey) {
                        void updateMarker(marker.id, { locked: !marker.locked });
                        return;
                      }
                      setPlayhead(marker.frame);
                    }}
                    onDoubleClick={() => setRenamingMarkerId(marker.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (marker.locked) return;
                      void removeMarker(marker.id);
                    }}
                  >
                    {marker.locked ? 'lock' : 'bookmark'}
                  </button>
                </div>
              ))}

              {/* S174 — the playhead's head: a stub of the line across the
                  strip plus the grab cap, pinned with the ruler. The
                  full-height line over the lanes is a separate element
                  following the same `--playhead-x`, so the two halves cannot
                  drift. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 z-20 w-0"
                style={{ left: 'var(--playhead-x)' }}
              >
                <span className="absolute inset-y-0 left-0 block w-px bg-accent-ai" />
                <span
                  className="pointer-events-auto absolute top-0 block h-3.5 w-[11px] -translate-x-1/2 cursor-ew-resize bg-accent-ai"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)' }}
                  onPointerDown={(event) => {
                    // The gesture starts where the playhead already is — a cap
                    // grab must not jump the frame the way a ruler click does.
                    begin(event, 'scrub', null, playheadFrame);
                  }}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
              </div>
            </div>
          </div>

          <div
            ref={lanesRef}
            className={`relative flex flex-1 flex-col gap-2 ${toolMode === 'split' ? 'cursor-crosshair' : ''}`}
            onPointerMove={(event) => {
              move(event);
              // The landing preview follows the pointer, not the commit — a
              // captured pointer's events bubble through here mid-drag.
              if (drag?.kind === 'move') updateMoveLanding(laneTargetAt(event.clientY));
              handleMarqueeMove(event);
            }}
            onPointerUp={(event) => {
              end(event);
              handleMarqueeEnd();
            }}
            onPointerCancel={(event) => {
              end(event);
              handleMarqueeEnd();
            }}
            // S200 — the troughs stop propagation, so what reaches here is
            // the space between and below the rows: only the zone below the
            // last lane is a target (a new track); a gap or a header is not.
            onDragOver={(event) => {
              if (!dragItems || ![...event.dataTransfer.types].includes(TIMELINE_DRAG_MIME)) return;
              if (laneTargetAt(event.clientY)?.type !== 'new') {
                updateDropLanding(null);
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              updateDropLanding({ type: 'new' });
              if (snapLineRef.current) snapLineRef.current.style.display = 'none';
            }}
            onDrop={(event) => {
              const payload = event.dataTransfer.getData(TIMELINE_DRAG_MIME);
              if (!payload || laneTargetAt(event.clientY)?.type !== 'new') return;
              event.preventDefault();
              const items = parseTimelineDrag(payload);
              if (items.length === 0) return;
              void dropOnNewTrack(items, frameAtClientX(event.clientX));
            }}
          >
            {displayTracks.map((track) => (
              <TimelineTrackRow
                key={track.id}
                track={track}
                clips={clips}
                fps={fps}
                pixelsPerSecond={pixelsPerSecond}
                widthPx={widthPx}
                selectedClipIds={selectedClipIds}
                dimmed={soloTrackIds.length > 0 && track.kind === 'audio' && !soloTrackIds.includes(track.id)}
                lifted={reorderHover?.trackId === track.id}
                liveDragClipIds={liveDragClipIds}
                liveDragKind={drag?.kind ?? null}
                onMoveUp={canMoveTrack(track, 'up') ? () => moveTrack(track, 'up') : null}
                onMoveDown={canMoveTrack(track, 'down') ? () => moveTrack(track, 'down') : null}
                dropTarget={
                  (moveLanding?.type === 'row' &&
                    moveLanding.track.id === track.id &&
                    track.id !== dragSourceTrackId &&
                    dragClip !== null &&
                    dragSource !== null &&
                    track.kind === dragSource.track.kind &&
                    clipAllowedOnTrack(dragClip, track) &&
                    !track.locked) ||
                  (dropLanding?.type === 'row' && dropLanding.trackId === track.id)
                }
                dropItems={
                  dropLanding?.type === 'row' && dropLanding.trackId === track.id ? dragItems : null
                }
                onSelect={handleSelect}
                onToggleSelect={handleToggleSelect}
                onClipContextMenu={handleClipContextMenu}
                onMoveStart={(event, clip) => {
                  // S160 — the blade tool: a clip click cuts at the pointer's
                  // frame instead of picking the clip up. Alt = every track.
                  if (toolMode === 'split') {
                    bladeAt(event.clientX, track, event.altKey);
                    return;
                  }
                  // The sweep tools select on click; nothing is dragged.
                  if (toolMode !== 'select') return;
                  dragTarget.current = { clip };
                  // A fresh gesture must not inherit the previous one's glow.
                  updateMoveLanding(null);
                  const placed = layoutTrack(clips, track).find((item) => item.clip.id === clip.id);
                  begin(event, 'move', clip, placed?.startFrames ?? 0);
                }}
                onTrimStart={(event, clip, edge) => {
                  dragTarget.current = { clip, edge };
                  // **The gesture begins at the edge being dragged**, in
                  // absolute frames — not at 0, which is what S145 shipped.
                  // With origin 0 the hook's `Math.max(0, origin + delta)`
                  // floor clamped every leftward drag to nothing, so the head
                  // could not extend and the tail could not shorten; and the
                  // snap targets (absolute clip edges) were being compared
                  // against a delta, which is a different coordinate space.
                  const placed = layoutTrack(clips, track).find(
                    (item) => item.clip.id === clip.id,
                  );
                  begin(
                    event,
                    edge === 'start' ? 'trim-start' : 'trim-end',
                    clip,
                    edge === 'start' ? (placed?.startFrames ?? 0) : (placed?.endFrames ?? 0),
                    // S176 — the same clamps `trimClipEdge` applies on
                    // commit, given to the hook so the live preview cannot
                    // promise a trim the commit will refuse: the tail keeps
                    // ≥1 frame; the head keeps ≥1 frame and cannot reach
                    // before the source's own start (stills have no source
                    // range and extend without bound).
                    edge === 'end'
                      ? { minDelta: 1 - clip.durationFrames, maxDelta: Number.MAX_SAFE_INTEGER }
                      : {
                          minDelta:
                            clip.sourceInFrames != null
                              ? -clip.sourceInFrames
                              : -Number.MAX_SAFE_INTEGER,
                          maxDelta: clip.durationFrames - 1,
                        },
                  );
                }}
                onDropHover={handleDropHover}
                onDropFile={handleDrop}
                onReorderStart={handleReorderStart}
                onReorderMove={handleReorderMove}
                onReorderEnd={handleReorderEnd}
                onMarqueeStart={handleMarqueeStart}
              />
            ))}
            {/* S157 — the space below the last lane is the "drag out of the
                lane" zone; a mid-move hover shows what a release would mint.
                (The add-track buttons themselves moved to the dock toolbar.) */}
            {moveLanding?.type === 'new' || dropLanding?.type === 'new' ? (
              <div
                className="pointer-events-none flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-dashed border-accent-ai text-xs text-accent-ai"
                style={{ marginLeft: LANE_LABEL_WIDTH_PX }}
              >
                {/* S165 — the ghost names the typed lane a release would mint.
                    S200 — a pool drag names it by the drag's kind. */}
                New{' '}
                {newTrackLabel(
                  dropLanding?.type === 'new'
                    ? (dragItems?.[0]?.kind ?? 'still')
                    : dragSource?.track.kind === 'audio'
                      ? 'audio'
                      : (dragClip?.sourceKind ?? 'still'),
                )}{' '}
                track
              </div>
            ) : null}
            {/* Insertion line while a header is being dragged to reorder.
                S166 — it eases between slots instead of teleporting. */}
            {reorderIndicatorY !== null ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-accent-ai transition-[top] duration-100 ease-out"
                style={{ top: reorderIndicatorY }}
              />
            ) : null}
            {/* The marquee rectangle — the drag's own footprint; selection is
                already applied live through the store as it moves. */}
            {marqueeRect ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-20 rounded-sm border border-accent-ai bg-accent-ai/10"
                style={marqueeRect}
              />
            ) : null}
          </div>

          {/* Playhead — a grab cap in the ruler strip over a 1px line spanning
              every track (owner item 13, the CapCut head). The wrapper and the
              line stay pointer-transparent so a click still reaches the clip
              beneath; only the cap itself takes the pointer, driving the same
              scrub gesture as the ruler. While playing, `transportClock`'s
              subscription moves the wrapper directly; the rendered position is
              the committed (paused) one. */}
          {/* S175 — the snap indicator: where the gesture is currently held.
              Imperative (display/left written from `onDelta`), never React
              state — a line that re-rendered the panel per pointermove would
              undo the S173 work it rides on. */}
          <div
            ref={snapLineRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 w-0"
            style={{ display: 'none' }}
          >
            <span className="absolute inset-y-0 left-0 block w-px bg-accent-ai/70" />
          </div>

          {/* S174 — the playhead's body: spans the sizer under the strip
              (the strip's opaque background hides the overlap; its own stub
              takes over there) and follows the same `--playhead-x` as the
              cap. `inset-y-0` replaces the old hand-summed track-height
              formula — the line self-sizes. z-10, deliberately *below* the
              pinned rails: an accent line riding on the frozen headers when
              scrolled right would read as a bug. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 w-0"
            style={{ left: 'calc(var(--lane-label-w) + var(--playhead-x))' }}
          >
            <span className="absolute inset-y-0 left-0 block w-px bg-accent-ai" />
          </div>
        </div>
      </div>

      {/* S160 — the clip context menu (the renderer's first right-click). */}
      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menuItems}
        onClose={() => setMenu(null)}
        aria-label="Clip actions"
      />
    </section>
  );
}
