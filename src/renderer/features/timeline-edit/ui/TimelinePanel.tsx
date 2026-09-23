import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_DROP_SECONDS,
  TIMELINE_DRAG_MIME,
  clipAllowedOnTrack,
  deleteToPlayhead,
  droppableOnTrack,
  duplicateClips,
  framesToSeconds,
  insertFreezeFrame,
  isOverlayTrack,
  isTextTrack,
  layoutTrack,
  mediaKindForPath,
  moveClipToTrack,
  moveSelectionBy,
  separateClipAudio,
  parseTimelineDrag,
  placeSourcesAt,
  rippleDelete,
  applyAutoRippleInsert,
  resolveCollisionBumping,
  snapFrame,
  snapTargets,
  splitAtFrame,
  timelineSnapTargets,
  buildSnapTargetsWithMeta,
  executeRippleTrim,
  executeRollingEdit,
  type SnapTargetEntry,
  selectTimelineWatermarkTargets,
  formatTimecode,
  splitClipAtFrame,
  tracksInDisplayOrder,
  trimClipEdge,
  findTrackGaps,
  findGapAtFrame,
  closeTrackGap,
  closeAllGapsOnTrack,
  closeAllGapsAcrossTracks,
  insertTextClipAt,
  createAdjustmentLayerClip,
  isCompoundClip,
  rippleTrimToPlayhead,
  toggleDefaultTransition,
  removeClipTransition,
  setClipColorLabel,
  selectClipsByColorLabel,
  COLOR_LABEL_DEFINITIONS,
  CLIP_COLOR_LABELS,
  propagateLinkedClipMove,
  applyDualSystemAudioSync,
  linkClips,
  unlinkClips,
  type ClipColorLabel,
  type TimelineTrackGap,
  type SequenceClip,
  type SequenceMarker,
  type SequenceTrack,
  type TimelineDragItem,
} from '@shared';

import { useProjectStore } from '../../../entities/project';
import {
  correctDroppedDurations,
  currentPlayheadFrame,
  useImportedMediaStore,
  useMediaDragStore,
  useSequenceStore,
  selectDurationFrames,
  selectSelectedClip,
  transportClock,
} from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { useModalStore } from '../../../shared/model/modalStore';
import { useToastStore } from '../../../shared/model/toastStore';
import { ContextMenu, type ContextMenuItem } from '../../../shared/ui/ContextMenu';
import { IconButton } from '../../../shared/ui/IconButton';
import { SNAP_THRESHOLD_PX, useTimelineDrag, type DragState } from '../lib/useTimelineDrag';

import { MarkerModal } from './MarkerModal';
import { SpeedModal } from './SpeedModal';
import { AudioGainModal } from './AudioGainModal';
import { SubtitleModal } from './SubtitleModal';
import { AutoReframeModal } from './AutoReframeModal';
import { AutoBeatSyncModal } from './AutoBeatSyncModal';
import { LANE_LABEL_WIDTH_PX, TimelineTrackRow } from './TimelineLane';
import { SketchKeyframeLane } from './SketchKeyframeLane';
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
  const toolMode = useSequenceStore((state) => state.toolMode);

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
  const spineTrack = useMemo(
    () => tracks.find((t) => t.id === spineTrackId) ?? null,
    [tracks, spineTrackId],
  );
  const spineClips = useMemo(
    () => (spineTrack ? clips.filter((c) => c.trackId === spineTrack.id) : []),
    [clips, spineTrack],
  );
  const hasSpineSketches = useMemo(
    () => spineClips.some((c) => Boolean(c.effects?.whiteboard)),
    [spineClips],
  );
  const fps = document?.sequence.fps ?? 24;
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);
  const snapEnabled = useSequenceStore((state) => state.snapEnabled);
  const markersForTargets = useSequenceStore((state) => state.markers);
  const inPointFrame = useSequenceStore((state) => state.inPointFrame);
  const outPointFrame = useSequenceStore((state) => state.outPointFrame);

  /**
   * S175 & S28 — target sets layered for stability. Clip edges
   * are a document fact and rebuild only on a commit; the static set adds
   * markers, sequence end, and In/Out points; the move set adds the playhead.
   * `metaSnapTargets` adds semantic labels for the Smart Magnetic HUD.
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
        inPointFrame,
        outPointFrame,
      }),
    [clipTargets, markerFrames, durationFrames, inPointFrame, outPointFrame],
  );
  const moveTargets = useMemo(
    () =>
      timelineSnapTargets({
        base: clipTargets,
        markerFrames,
        playheadFrame,
        sequenceEndFrame: durationFrames,
        inPointFrame,
        outPointFrame,
      }),
    [clipTargets, markerFrames, playheadFrame, durationFrames, inPointFrame, outPointFrame],
  );
  const metaSnapTargets = useMemo(
    () =>
      buildSnapTargetsWithMeta({
        tracks,
        clips,
        markers: markersForTargets,
        playheadFrame,
        inPointFrame,
        outPointFrame,
        sequenceEndFrame: durationFrames,
      }),
    [tracks, clips, markersForTargets, playheadFrame, inPointFrame, outPointFrame, durationFrames],
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

        const proposedStart = Math.max(0, (clip.startFrames ?? 0) + state.deltaFrames);
        if (toolMode === 'ripple') {
          commitClips(
            applyAutoRippleInsert(clips, track, clip.id, proposedStart, clip.durationFrames),
          );
          return;
        }

        const { snappedStart } = resolveCollisionBumping(
          clips,
          track,
          clip.id,
          proposedStart,
          clip.durationFrames,
          15,
        );
        const actualDelta = snappedStart - (clip.startFrames ?? 0);
        let updated = clips.map((item) =>
          item.id === clip.id ? { ...item, startFrames: snappedStart } : item,
        );
        if (clip.linkedClipId && actualDelta !== 0) {
          updated = propagateLinkedClipMove(
            { ...clip, startFrames: snappedStart },
            actualDelta,
            updated,
            tracks,
          );
        }
        commitClips(updated);
        return;
      }

      // Trim. When Ripple Edit tool is active, ripple downstream clips;
      // when Rolling Edit tool is active, adjust abutting clips while preserving duration;
      // otherwise, perform standard edge trim.
      const edge = state.kind === 'trim-start' ? 'start' : 'end';
      if (toolMode === 'ripple') {
        const next = executeRippleTrim(clips, tracks, clip.id, edge, state.deltaFrames);
        if (next !== clips) commitClips(next);
        return;
      }
      if (toolMode === 'roll') {
        const placed = layoutTrack(clips, track).find((p) => p.clip.id === clip.id);
        const junctionFrame = edge === 'end' ? (placed?.endFrames ?? 0) : (placed?.startFrames ?? 0);
        const next = executeRollingEdit(clips, tracks, junctionFrame, state.deltaFrames, track.id);
        if (next !== clips) commitClips(next);
        return;
      }
      const next = trimClipEdge(clips, clip.id, edge, state.deltaFrames);
      if (next !== clips) commitClips(next);
    },
    [clips, commitClips, document, laneTargetAt, moveClipToNewTrack, toolMode, tracks],
  );

  /**
   * S175 & S28 — the snap indicator & Smart Magnetic HUD badge, driven imperatively
   * from `onDelta`. Zero React state per move.
   */
  const snapLineRef = useRef<HTMLDivElement | null>(null);
  const snapBadgeRef = useRef<HTMLDivElement | null>(null);
  const handleDragDelta = useCallback(
    (deltaFrames: number, snappedTarget: number | null, snapLabel?: string) => {
      // S176 — the live drag offset: one custom-property write per pointer
      // event moves every flagged clip. Direct rather than rAF-coalesced.
      sizerRef.current?.style.setProperty(
        '--drag-dx',
        `${deltaFrames * (pixelsPerSecond / fps)}px`,
      );
      const line = snapLineRef.current;
      const badge = snapBadgeRef.current;
      if (!line) return;
      if (snappedTarget === null) {
        line.style.display = 'none';
        if (badge) badge.style.display = 'none';
        return;
      }
      line.style.display = 'block';
      line.style.left = `calc(var(--lane-label-w) + ${snappedTarget * (pixelsPerSecond / fps)}px)`;
      if (badge) {
        badge.textContent = snapLabel || `${snappedTarget}f`;
        badge.style.display = 'block';
      }
    },
    [fps, pixelsPerSecond],
  );

  const { drag, begin, move, end } = useTimelineDrag({
    pixelsPerSecond,
    fps,
    targets: moveTargets,
    scrubTargets: staticTargets,
    metaTargets: metaSnapTargets,
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
    if (snapBadgeRef.current) snapBadgeRef.current.style.display = 'none';
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
  /** S17 — right-click state for empty trough space / gaps */
  const [troughMenu, setTroughMenu] = useState<{
    x: number;
    y: number;
    track: SequenceTrack;
    frame: number;
    gap: TimelineTrackGap | null;
  } | null>(null);
  // S353 — the pool's path→id map is the only thing that can name an imported
  // clip's `sequence_media` row, which is its watermark identity.
  const importedMedia = useImportedMediaStore((state) => state.media);
  const openWatermarkBatchModal = useModalStore((store) => store.openWatermarkBatchModal);
  const isSpeedModalOpen = useModalStore((state) => state.activeModal === 'speed');
  const isAudioGainModalOpen = useModalStore((state) => state.activeModal === 'audio-gain');
  const isSubtitleModalOpen = useModalStore((state) => state.activeModal === MODAL_IDS.SUBTITLES);
  const isAutoReframeModalOpen = useModalStore((state) => state.activeModal === MODAL_IDS.AUTO_REFRAME);
  const isBeatSyncModalOpen = useModalStore((state) => state.activeModal === MODAL_IDS.BEAT_SYNC);
  const closeModal = useModalStore((state) => state.closeModal);
  const selectedClip = useSequenceStore(selectSelectedClip);
  const [speedModalClip, setSpeedModalClip] = useState<SequenceClip | null>(null);
  const [audioGainModalClip, setAudioGainModalClip] = useState<SequenceClip | null>(null);
  const [subtitleModalTrackId, setSubtitleModalTrackId] = useState<string | null>(null);

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
        label: 'Duplicate',
        shortcut: 'Ctrl+D',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const { clips: next, duplicatedClips } = duplicateClips(
            s.document.clips,
            s.document.tracks,
            targetIds,
            () => crypto.randomUUID(),
          );
          if (next !== s.document.clips) {
            s.commitClips(next);
            s.select(duplicatedClips.map((c) => c.id));
          }
        },
      },
      // S64 — Compound Clips & Nested Sequences
      ...(targetIds.length >= 1
        ? [
            {
              label: 'Create Compound Clip...',
              shortcut: 'Alt+G',
              icon: 'auto_awesome_motion',
              onSelect: () => {
                void state().createCompoundClipFromSelection();
              },
            },
          ]
        : []),
      ...(isCompoundClip(menu.clip)
        ? [
            {
              label: 'Open in Timeline (Step Into)',
              icon: 'open_in_new',
              onSelect: () => {
                void state().stepIntoCompoundClip(menu.clip);
              },
            },
            {
              label: 'Decompose in Place',
              shortcut: 'Alt+Shift+G',
              icon: 'unfold_more',
              onSelect: () => {
                state().decomposeCompoundClip(menu.clip.id);
              },
            },
          ]
        : []),
      {
        label: 'Copy',
        shortcut: 'Ctrl+C',
        icon: 'copy_all',
        onSelect: () => {
          state().copySelection();
        },
      },
      {
        label: 'Cut',
        shortcut: 'Ctrl+X',
        icon: 'content_cut',
        onSelect: () => {
          state().cutSelection(false);
        },
      },
      {
        label: 'Ripple Cut',
        shortcut: 'Ctrl+Shift+X',
        onSelect: () => {
          state().cutSelection(true);
        },
      },
      ...(state().timelineClipboard
        ? [
            {
              label: 'Paste at playhead',
              shortcut: 'Ctrl+V',
              icon: 'content_paste',
              onSelect: () => {
                state().pasteClipboard({ ripple: false });
              },
            },
            {
              label: 'Ripple Insert Paste',
              shortcut: 'Ctrl+Shift+V',
              icon: 'content_paste_go',
              onSelect: () => {
                state().pasteClipboard({ ripple: true });
              },
            },
          ]
        : []),
      {
        label:
          menu.clip.transitionIn && menu.clip.transitionIn !== 'cut'
            ? 'Remove transition'
            : 'Apply default transition (Cross Dissolve)',
        shortcut: 'Shift+D',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          let nextClips = s.document.clips;
          for (const id of targetIds) {
            nextClips = toggleDefaultTransition(nextClips, id);
          }
          if (nextClips !== s.document.clips) {
            s.commitClips(nextClips);
          }
        },
      },
      ...(menu.clip.transitionIn && menu.clip.transitionIn !== 'cut'
        ? [
            {
              label: 'Clear transition',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                let nextClips = s.document.clips;
                for (const id of targetIds) {
                  nextClips = removeClipTransition(nextClips, id);
                }
                if (nextClips !== s.document.clips) {
                  s.commitClips(nextClips);
                }
              },
            },
          ]
        : []),
      // S25 — Studio Clip Color Labels
      {
        label: 'Color: Rose (A-Roll)',
        dotColor: 'bg-rose-500',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'rose'));
        },
      },
      {
        label: 'Color: Amber (Review)',
        dotColor: 'bg-amber-500',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'amber'));
        },
      },
      {
        label: 'Color: Emerald (Music)',
        dotColor: 'bg-emerald-500',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'emerald'));
        },
      },
      {
        label: 'Color: Cyan (B-Roll)',
        dotColor: 'bg-cyan-500',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'cyan'));
        },
      },
      {
        label: 'Color: Violet (Titles)',
        dotColor: 'bg-violet-500',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'violet'));
        },
      },
      ...(menu.clip.colorLabel && menu.clip.colorLabel !== 'default'
        ? [
            {
              label: 'Reset Label Color',
              icon: 'format_color_reset',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                s.commitClips(setClipColorLabel(s.document.clips, targetIds, 'default'));
              },
            },
            {
              label: `Select all ${COLOR_LABEL_DEFINITIONS[menu.clip.colorLabel].name} clips`,
              icon: 'select_all',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                const matches = selectClipsByColorLabel(s.document.clips, menu.clip.colorLabel!);
                s.select(matches);
              },
            },
          ]
        : []),
      // S67 — Toggle Automation Curve Lane
      {
        label: 'Toggle Automation Curve',
        shortcut: 'Alt+K',
        icon: 'timeline',
        onSelect: () => {
          for (const id of targetIds) {
            window.dispatchEvent(
              new CustomEvent('toggle-clip-automation', {
                detail: { clipId: id },
              }),
            );
          }
        },
      },
      // S72 — Toggle Speed Ramp Curve
      {
        label: 'Toggle Speed Ramp Curve',
        shortcut: 'Alt+R',
        icon: 'speed',
        onSelect: () => {
          for (const id of targetIds) {
            window.dispatchEvent(
              new CustomEvent('toggle-clip-speed-ramp', {
                detail: { clipId: id },
              }),
            );
          }
        },
      },
      ...(menu.clip.sourceKind === 'video' && menu.clip.filePath
        ? [
            {
              label: 'Separate audio',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                const res = separateClipAudio(
                  s.document.clips,
                  s.document.tracks,
                  menu.clip.id,
                  () => crypto.randomUUID(),
                );
                if (res) {
                  s.commitClips(res.clips);
                  s.select([res.createdClip.id]);
                }
              },
            },
            {
              label: menu.clip.sourceAudioEnabled === false ? 'Unmute video audio' : 'Mute video audio',
              onSelect: () => {
                const s = state();
                s.patchClip(menu.clip.id, {
                  sourceAudioEnabled: menu.clip.sourceAudioEnabled === false,
                });
              },
            },
          ]
        : []),
      // S76 — Dual-System Audio Auto-Sync & A/V Clip Linking
      ...(menu.clip.linkedClipId
        ? [
            {
              label: 'Unlink Clips',
              shortcut: 'Ctrl+Shift+L',
              icon: 'link_off',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                const nextClips = unlinkClips(menu.clip.id, s.document.clips);
                s.commitClips(nextClips);
                useToastStore.getState().pushToast({ message: 'Clips unlinked', variant: 'info' });
              },
            },
          ]
        : targetIds.length === 2
          ? [
              {
                label: 'Link Clips',
                shortcut: 'Ctrl+L',
                icon: 'link',
                onSelect: () => {
                  const s = state();
                  if (!s.document) return;
                  const c1 = s.document.clips.find((c) => c.id === targetIds[0]);
                  const c2 = s.document.clips.find((c) => c.id === targetIds[1]);
                  if (!c1 || !c2) return;
                  const [linkedA, linkedB] = linkClips(c1, c2);
                  const nextClips = s.document.clips.map((c) =>
                    c.id === linkedA.id ? linkedA : c.id === linkedB.id ? linkedB : c,
                  );
                  s.commitClips(nextClips);
                  useToastStore.getState().pushToast({ message: 'Clips linked in sync', variant: 'success' });
                },
              },
            ]
          : []),
      ...(() => {
        if (!document) return [];
        const selectedClips = document.clips.filter((c) => targetIds.includes(c.id));
        const videoClip = selectedClips.find((c) => c.sourceKind === 'video');
        const audioClip = selectedClips.find((c) => c.sourceKind === 'audio');
        if (selectedClips.length === 2 && videoClip && audioClip) {
          return [
            {
              label: 'Auto-Sync Audio by Waveform...',
              icon: 'sync',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                const vStart = videoClip.startFrames ?? 0;
                const aStart = audioClip.startFrames ?? 0;
                const naturalLag = Math.round(aStart - vStart);
                const { updatedVideoClip, updatedAudioClip } = applyDualSystemAudioSync(
                  videoClip,
                  audioClip,
                  naturalLag,
                  { muteScratchAudio: true, linkClips: true },
                );
                const nextClips = s.document.clips.map((c) =>
                  c.id === updatedVideoClip.id
                    ? updatedVideoClip
                    : c.id === updatedAudioClip.id
                      ? updatedAudioClip
                      : c,
                );
                s.commitClips(nextClips);
                useToastStore.getState().pushToast({
                  message: `Auto-synchronized and linked "${audioClip.label || 'Audio'}" with "${videoClip.label || 'Video'}" (scratch audio muted)`,
                  variant: 'success',
                });
              },
            },
          ];
        }
        return [];
      })(),
      ...(() => {
        if (menu.clip.sourceKind !== 'video' || !menu.clip.filePath || !document) return [];
        const track = document.tracks.find((t) => t.id === menu.clip.trackId);
        if (!track) return [];
        const placed = layoutTrack(document.clips, track).find((p) => p.clip.id === menu.clip.id);
        if (!placed) return [];
        const playhead = currentPlayheadFrame();
        if (playhead <= placed.startFrames || playhead >= placed.endFrames) return [];

        return [
          {
            label: 'Insert freeze frame (3s)',
            shortcut: 'Alt+F',
            onSelect: async () => {
              const s = state();
              if (!s.document) return;
              const currentTrack = s.document.tracks.find((t) => t.id === menu.clip.trackId);
              if (!currentTrack) return;
              const currentPlaced = layoutTrack(s.document.clips, currentTrack).find((p) => p.clip.id === menu.clip.id);
              if (!currentPlaced) return;

              const frame = currentPlayheadFrame();
              const offset = frame - currentPlaced.startFrames;
              const sourceIn = currentPlaced.clip.sourceInFrames ?? 0;
              const atSeconds = framesToSeconds(sourceIn + offset, fps);

              const capture = await window.api.sequence.captureFrame({
                sourcePath: menu.clip.filePath!,
                atSeconds,
                sequenceId: s.document.sequence.id,
              });

              if (!capture?.imagePath) return;

              const freezeDurationFrames = Math.round(3 * fps);
              const res = insertFreezeFrame(
                s.document.clips,
                currentTrack,
                menu.clip.id,
                frame,
                capture.imagePath,
                freezeDurationFrames,
                {
                  splitId: crypto.randomUUID(),
                  freezeId: crypto.randomUUID(),
                },
              );
              if (res) {
                s.commitClips(res.clips);
                s.select([res.freezeClip.id]);
              }
            },
          },
        ];
      })(),
      ...(menu.clip.sourceKind !== 'still' && menu.clip.sourceKind !== 'text'
        ? [
            {
              label: 'Speed / Duration...',
              shortcut: 'Ctrl+R',
              onSelect: () => {
                setSpeedModalClip(menu.clip);
                useModalStore.getState().openModal('speed');
              },
            },
          ]
        : []),
      ...(menu.clip.sourceKind === 'text'
        ? [
            {
              label: 'Export Captions (.srt / .vtt)...',
              onSelect: () => {
                setSubtitleModalTrackId(menu.clip.trackId);
                useModalStore.getState().openModal(MODAL_IDS.SUBTITLES);
              },
            },
          ]
        : []),
      ...(menu.clip.sourceKind === 'audio' || menu.clip.sourceKind === 'video'
        ? [
            {
              label: 'Audio Gain & Fades...',
              shortcut: 'G',
              onSelect: () => {
                setAudioGainModalClip(menu.clip);
                useModalStore.getState().openModal('audio-gain');
              },
            },
            {
              label: 'Add 1s Fade In & Out',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                const half = Math.floor(menu.clip.durationFrames / 2);
                s.patchClip(menu.clip.id, {
                  fadeInFrames: Math.min(half, Math.round(fps)),
                  fadeOutFrames: Math.min(half, Math.round(fps)),
                });
              },
            },
            {
              label: 'Reset Audio Gain (0 dB)',
              onSelect: () => {
                const s = state();
                if (!s.document) return;
                s.patchClip(menu.clip.id, { gainDb: 0 });
              },
            },
          ]
        : []),
      {
        label: 'Ripple trim start to playhead',
        shortcut: 'Q',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = rippleTrimToPlayhead(
            s.document.clips,
            s.document.tracks,
            currentPlayheadFrame(),
            'head',
            targetIds,
          );
          if (next !== s.document.clips) s.commitClips(next);
        },
      },
      {
        label: 'Ripple trim end to playhead',
        shortcut: 'W',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = rippleTrimToPlayhead(
            s.document.clips,
            s.document.tracks,
            currentPlayheadFrame(),
            'tail',
            targetIds,
          );
          if (next !== s.document.clips) s.commitClips(next);
        },
      },
      {
        label: 'Add marker here',
        shortcut: 'M',
        onSelect: () => {
          void state().addMarker(currentPlayheadFrame());
        },
      },
      {
        label: 'Add marker (Green Sync)',
        onSelect: () => {
          void state().addMarker(currentPlayheadFrame(), { color: 'success', name: 'Sync' });
        },
      },
      {
        label: 'Add marker (Amber Review)',
        onSelect: () => {
          void state().addMarker(currentPlayheadFrame(), { color: 'warning', name: 'Review' });
        },
      },
      {
        label: 'Add marker (Sky Info)',
        onSelect: () => {
          void state().addMarker(currentPlayheadFrame(), { color: 'info', name: 'Info' });
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
  }, [document, fps, importedMedia, menu, openWatermarkBatchModal]);

  const handleClipContextMenu = useCallback(
    (event: React.MouseEvent, clip: SequenceClip) => {
      event.preventDefault();
      setTroughMenu(null);
      // Right-click on an unselected clip selects it first — the universal
      // grammar; acting on a clip the menu is not about would be a trap.
      const current = useSequenceStore.getState().selectedClipIds;
      if (!current.includes(clip.id)) select([clip.id]);
      setMenu({ x: event.clientX, y: event.clientY, clip });
    },
    [select],
  );

  /** S17 — handler for right-clicking on empty lane space / gaps */
  const handleTroughContextMenu = useCallback(
    (event: React.MouseEvent, track: SequenceTrack, frame: number) => {
      event.preventDefault();
      const state = useSequenceStore.getState();
      if (!state.document) return;
      setMenu(null);
      const gap = findGapAtFrame(state.document.clips, track, frame);
      setTroughMenu({
        x: event.clientX,
        y: event.clientY,
        track,
        frame,
        gap,
      });
    },
    [],
  );

  /** S20 — ruler context menu state */
  const [rulerMenu, setRulerMenu] = useState<{ x: number; y: number; frame: number } | null>(null);

  const handleRulerContextMenu = useCallback((event: React.MouseEvent, frame: number) => {
    event.preventDefault();
    setMenu(null);
    setTroughMenu(null);
    setRulerMenu({ x: event.clientX, y: event.clientY, frame });
  }, []);

  const rulerMenuItems = useMemo((): ContextMenuItem[] => {
    if (!rulerMenu || !document) return [];
    const state = () => useSequenceStore.getState();
    const roundedFrame = Math.max(0, Math.round(rulerMenu.frame));
    const items: ContextMenuItem[] = [
      {
        label: `Mark In at ${formatTimecode(roundedFrame, fps)}`,
        shortcut: 'I',
        onSelect: () => state().setInPoint(roundedFrame),
      },
      {
        label: `Mark Out at ${formatTimecode(roundedFrame, fps)}`,
        shortcut: 'O',
        onSelect: () => state().setOutPoint(roundedFrame),
      },
    ];

    if (state().inPointFrame !== null || state().outPointFrame !== null) {
      items.push({
        label: 'Clear In/Out points',
        shortcut: 'Alt+X',
        onSelect: () => state().clearInOutPoints(),
      });
    }

    items.push({
      label: `Add marker at ${formatTimecode(roundedFrame, fps)}`,
      shortcut: 'M',
      onSelect: () => void state().addMarker(roundedFrame),
    });

    return items;
  }, [rulerMenu, document, fps]);

  /** S17 — context menu items for empty lane space and gap ripple deletion */
  const troughMenuItems = useMemo((): ContextMenuItem[] => {
    if (!troughMenu || !document) return [];
    const state = () => useSequenceStore.getState();
    const { track, frame, gap } = troughMenu;
    const roundedFrame = Math.max(0, Math.round(frame));
    const items: ContextMenuItem[] = [];

    if (gap) {
      items.push({
        label: `Close gap (${formatTimecode(gap.durationFrames, fps)})`,
        shortcut: 'Shift+Del',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = closeTrackGap(s.document.clips, track, gap);
          if (next !== s.document.clips) s.commitClips(next);
        },
      });
    }

    const trackGaps = findTrackGaps(document.clips, track, true);
    if (trackGaps.length > 0) {
      items.push({
        label: `Close all gaps on track ${track.name}`,
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = closeAllGapsOnTrack(s.document.clips, track, true);
          if (next !== s.document.clips) s.commitClips(next);
        },
      });
    }

    const hasAnyGaps = document.tracks.some(
      (t) => !t.locked && !t.magnetic && findTrackGaps(document.clips, t, true).length > 0,
    );
    if (hasAnyGaps) {
      items.push({
        label: 'Close all gaps across timeline',
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const next = closeAllGapsAcrossTracks(s.document.clips, s.document.tracks, true);
          if (next !== s.document.clips) s.commitClips(next);
        },
      });
    }

    items.push({
      label: `Add marker at ${formatTimecode(roundedFrame, fps)}`,
      shortcut: 'M',
      onSelect: () => {
        void state().addMarker(roundedFrame);
      },
    });

    if (!track.locked) {
      items.push({
        label: `Insert title text at ${formatTimecode(roundedFrame, fps)}`,
        onSelect: () => {
          const s = state();
          if (!s.document) return;
          const { clips: next, textClip } = insertTextClipAt(
            s.document.clips,
            track,
            roundedFrame,
            Math.round(fps * 3),
            () => crypto.randomUUID(),
          );
          s.commitClips(next);
          s.select([textClip.id]);
        },
      });

      if (track.kind === 'video') {
        items.push({
          label: `Insert Adjustment Layer at ${formatTimecode(roundedFrame, fps)}`,
          shortcut: 'Alt+A',
          onSelect: () => {
            const s = state();
            if (!s.document) return;
            const durationFrames = Math.max(1, Math.round(fps * 5));
            const newClip = createAdjustmentLayerClip({
              sequenceId: s.document.sequence.id,
              trackId: track.id,
              startFrames: roundedFrame,
              durationFrames,
              orderIndex: s.document.clips.filter((c) => c.trackId === track.id).length,
            });
            s.commitClips([...s.document.clips, newClip]);
            s.select([newClip.id]);
          },
        });
      }

      items.push({
        label: `Import Subtitles (.srt / .vtt) to ${track.name}...`,
        onSelect: () => {
          setSubtitleModalTrackId(track.id);
          useModalStore.getState().openModal(MODAL_IDS.SUBTITLES);
        },
      });
    }

    if (state().timelineClipboard && !track.locked) {
      items.push(
        {
          label: `Paste at ${formatTimecode(roundedFrame, fps)} (Ctrl+V)`,
          icon: 'content_paste',
          onSelect: () => {
            state().setPlayhead(roundedFrame);
            state().pasteClipboard({ ripple: false, targetTrackId: track.id });
          },
        },
        {
          label: `Ripple Insert Paste at ${formatTimecode(roundedFrame, fps)} (Ctrl+Shift+V)`,
          icon: 'content_paste_go',
          onSelect: () => {
            state().setPlayhead(roundedFrame);
            state().pasteClipboard({ ripple: true, targetTrackId: track.id });
          },
        },
      );
    }

    items.push({
      label: `Split all unlocked tracks at ${formatTimecode(roundedFrame, fps)}`,
      onSelect: () => {
        const s = state();
        if (!s.document) return;
        const next = splitAtFrame(
          s.document.clips,
          s.document.tracks,
          roundedFrame,
          [],
          () => crypto.randomUUID(),
        );
        if (next) s.commitClips(next);
      },
    });

    // S20 — In/Out points on empty lane space
    items.push({
      label: `Mark In at ${formatTimecode(roundedFrame, fps)}`,
      shortcut: 'I',
      onSelect: () => {
        state().setInPoint(roundedFrame);
      },
    });

    items.push({
      label: `Mark Out at ${formatTimecode(roundedFrame, fps)}`,
      shortcut: 'O',
      onSelect: () => {
        state().setOutPoint(roundedFrame);
      },
    });

    if (state().inPointFrame !== null || state().outPointFrame !== null) {
      items.push({
        label: 'Clear In/Out points',
        shortcut: 'Alt+X',
        onSelect: () => {
          state().clearInOutPoints();
        },
      });
    }

    return items;
  }, [troughMenu, document, fps]);

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
      { ripple: toolMode === 'ripple', bumperToleranceFrames: 15 },
    );
    if (result.placedIds.length === 0) return;
    state.commitClips(result.clips);
    state.select(result.placedIds);
    correctDroppedDurations(result.placed, fresh.sequence.id);
  }, [toolMode]);

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

  /** Resolves raw external files dropped from the OS into placeable TimelineDragItem entries. */
  const importAndBuildItems = useCallback(
    async (filePaths: string[]): Promise<TimelineDragItem[]> => {
      const projectId = useProjectStore.getState().activeProjectId;
      if (!projectId || filePaths.length === 0) return [];
      try {
        await useImportedMediaStore.getState().importDropped(projectId, filePaths);
      } catch (err) {
        console.error('Failed to import dropped external files', err);
      }
      const pool = useImportedMediaStore.getState().media;
      const items: TimelineDragItem[] = [];
      for (const rawPath of filePaths) {
        const norm = rawPath.replace(/\\/g, '/').toLowerCase();
        const found = pool.find((m) => m.path.replace(/\\/g, '/').toLowerCase() === norm);
        const kind = found?.kind ?? mediaKindForPath(rawPath);
        if (!kind) continue;
        const label = found?.label ?? rawPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Clip';
        const durationSeconds =
          found?.durationSec && found.durationSec > 0 ? found.durationSec : DEFAULT_DROP_SECONDS;
        items.push({
          kind,
          label,
          filePath: found?.path ?? rawPath,
          presetId: null,
          durationSeconds,
          measured: Boolean(found?.durationSec && found.durationSec > 0),
          storyShotId: null,
          sourceTakeId: null,
        });
      }
      return items;
    },
    [],
  );

  const handleDropExternalFiles = useCallback(
    async (targetTrack: SequenceTrack, filePaths: string[], frame: number) => {
      const items = await importAndBuildItems(filePaths);
      if (items.length === 0) return;
      if (droppableOnTrack(items, targetTrack)) {
        placeItems(targetTrack, items, frame);
      } else {
        await dropOnNewTrack(items, frame);
      }
    },
    [dropOnNewTrack, importAndBuildItems, placeItems],
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
  const editingMarkerId = useSequenceStore((state) => state.editingMarkerId);
  const setEditingMarkerId = useSequenceStore((state) => state.setEditingMarkerId);
  const setInPoint = useSequenceStore((state) => state.setInPoint);
  const setOutPoint = useSequenceStore((state) => state.setOutPoint);
  const clearInOutPoints = useSequenceStore((state) => state.clearInOutPoints);
  /** Marker being edited via MarkerModal, synced with global store state. */
  const editingMarker = useMemo(
    () => markers.find((m) => m.id === editingMarkerId) ?? null,
    [markers, editingMarkerId],
  );

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
              onContextMenu={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const frame = Math.max(0, (event.clientX - bounds.left) / pixelsPerFrame);
                handleRulerContextMenu(event, frame);
              }}
            >
              <TimelineRuler
                durationFrames={durationFrames}
                fps={fps}
                pixelsPerSecond={pixelsPerSecond}
                widthPx={widthPx}
              />

              {/* S20 — Work Area highlight band on ruler */}
              {(inPointFrame !== null || outPointFrame !== null) && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-10 bg-accent-ai/20 border-t-2 border-b border-accent-ai shadow-sm"
                  style={{
                    left: (inPointFrame ?? 0) * pixelsPerFrame,
                    width: Math.max(
                      0,
                      ((outPointFrame ?? durationFrames) - (inPointFrame ?? 0)) * pixelsPerFrame,
                    ),
                  }}
                />
              )}

              {/* S20 — In-Point Bracket on ruler */}
              {inPointFrame !== null && (
                <div
                  className="group absolute top-0 z-25 pointer-events-auto"
                  style={{ left: inPointFrame * pixelsPerFrame }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`In Point: ${formatTimecode(inPointFrame, fps)} (Alt+I or double-click to clear)`}
                    title={`In Point: ${formatTimecode(inPointFrame, fps)} (Alt+I to clear)`}
                    className="flex h-7 w-3 cursor-ew-resize items-center justify-center rounded-r bg-accent-ai text-[11px] font-bold text-white shadow-md transition-transform hover:scale-110 active:brightness-125 select-none"
                    onDoubleClick={() => setInPoint(null)}
                  >
                    [
                  </button>
                </div>
              )}

              {/* S20 — Out-Point Bracket on ruler */}
              {outPointFrame !== null && (
                <div
                  className="group absolute top-0 z-25 pointer-events-auto -translate-x-full"
                  style={{ left: outPointFrame * pixelsPerFrame }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`Out Point: ${formatTimecode(outPointFrame, fps)} (Alt+O or double-click to clear)`}
                    title={`Out Point: ${formatTimecode(outPointFrame, fps)} (Alt+O to clear)`}
                    className="flex h-7 w-3 cursor-ew-resize items-center justify-center rounded-l bg-accent-ai text-[11px] font-bold text-white shadow-md transition-transform hover:scale-110 active:brightness-125 select-none"
                    onDoubleClick={() => setOutPoint(null)}
                  >
                    ]
                  </button>
                </div>
              )}

              {/* S160 — marker flags; S174 — inside the strip, so they stay
                  pinned with the scale they annotate. Trough-space left (the
                  wrapper's origin already sits past the gutter). Click seeks;
                  double-click opens full edit modal; shift-click toggles lock; right-click deletes. */}
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="group absolute top-0 z-20"
                  style={{ left: marker.frame * pixelsPerFrame }}
                >
                  {/* S233 — a locked marker is a sync point (R5): it draws
                      the lock glyph, shift-click toggles the lock, and
                      right-click refuses to delete it while locked. Double-click
                      opens MarkerModal to view/edit notes, rename, or change color. */}
                  <button
                    type="button"
                    aria-label={`Marker: ${marker.name || 'unnamed'}${marker.locked ? ' (locked sync point)' : ''} — click seeks, double-click edits details, shift-click ${marker.locked ? 'unlocks' : 'locks'}, right-click deletes`}
                    className={`relative material-symbols-outlined material-symbols-outlined--filled -translate-x-1/2 cursor-pointer text-[14px] leading-none transition-transform hover:scale-125 ${MARKER_CLASSES[marker.color] ?? 'text-accent-ai'}`}
                    style={{ marginTop: 13 }}
                    onClick={(event) => {
                      if (event.shiftKey) {
                        void updateMarker(marker.id, { locked: !marker.locked });
                        return;
                      }
                      setPlayhead(marker.frame);
                    }}
                    onDoubleClick={() => setEditingMarkerId(marker.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (marker.locked) return;
                      void removeMarker(marker.id);
                    }}
                  >
                    {marker.locked ? 'lock' : 'bookmark'}
                    {marker.notes ? (
                      <span
                        className="absolute -top-1 -right-1 block h-2 w-2 rounded-full bg-text-primary ring-2 ring-bg-canvas"
                        title="Has notes"
                      />
                    ) : null}
                  </button>

                  {/* S3 — floating tooltip displaying marker name, timecode & notes preview */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col gap-0.5 rounded-[var(--radius-card)] bg-bg-panel px-2.5 py-1.5 shadow-xl border border-hairline z-50 min-w-[150px] max-w-[260px] whitespace-normal">
                    <div className="flex items-center justify-between gap-2 border-b border-hairline/60 pb-1">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {marker.name || 'Marker'}
                      </span>
                      <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap">
                        {formatTimecode(marker.frame, fps)}
                      </span>
                    </div>
                    {marker.notes ? (
                      <p className="text-[11px] text-text-secondary line-clamp-3 leading-relaxed pt-0.5">
                        {marker.notes}
                      </p>
                    ) : (
                      <span className="text-[10px] italic text-text-disabled pt-0.5">
                        Double-click to add notes
                      </span>
                    )}
                  </div>
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
            className={`relative flex flex-1 flex-col gap-2 ${toolMode === 'split' ? 'cursor-crosshair' : toolMode === 'ripple' ? 'cursor-col-resize' : toolMode === 'roll' ? 'cursor-ew-resize' : ''}`}
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
              if (event.dataTransfer.types.includes('Files')) {
                if (laneTargetAt(event.clientY)?.type !== 'new') {
                  updateDropLanding(null);
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                updateDropLanding({ type: 'new' });
                if (snapLineRef.current) snapLineRef.current.style.display = 'none';
                return;
              }
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
              if (event.dataTransfer.types.includes('Files')) {
                if (laneTargetAt(event.clientY)?.type !== 'new') return;
                event.preventDefault();
                const filePaths = Array.from(event.dataTransfer.files)
                  .map((file) => {
                    try {
                      return window.api?.webUtils?.getPathForFile?.(file) || (file as any).path;
                    } catch {
                      return (file as any).path;
                    }
                  })
                  .filter((p): p is string => Boolean(p));
                if (filePaths.length > 0) {
                  const frame = frameAtClientX(event.clientX);
                  void (async () => {
                    const items = await importAndBuildItems(filePaths);
                    if (items.length > 0) {
                      await dropOnNewTrack(items, frame);
                    }
                  })();
                }
                return;
              }
              const payload = event.dataTransfer.getData(TIMELINE_DRAG_MIME);
              if (!payload || laneTargetAt(event.clientY)?.type !== 'new') return;
              event.preventDefault();
              const items = parseTimelineDrag(payload);
              if (items.length === 0) return;
              void dropOnNewTrack(items, frameAtClientX(event.clientX));
            }}
          >
            {displayTracks.map((track) => (
              <Fragment key={track.id}>
                <TimelineTrackRow
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
                  onTroughContextMenu={handleTroughContextMenu}
                  activeGap={troughMenu?.gap ?? null}
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
                  onDropExternalFiles={handleDropExternalFiles}
                  onReorderStart={handleReorderStart}
                  onReorderMove={handleReorderMove}
                  onReorderEnd={handleReorderEnd}
                  onMarqueeStart={handleMarqueeStart}
                />
                {/* S5 — Dedicated Sketch In/Out Keyframe Lane, visible only when sketches are enabled on the spine */}
                {track.id === spineTrackId && hasSpineSketches && spineTrack && (
                  <SketchKeyframeLane
                    spineTrack={spineTrack}
                    spineClips={spineClips}
                    fps={fps}
                    pixelsPerSecond={pixelsPerSecond}
                    widthPx={widthPx}
                    selectedClipIds={selectedClipIds}
                  />
                )}
              </Fragment>
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
          {/* S175 & S28 — Smart Magnetic Snapping Guideline with dynamic HUD badge */}
          <div
            ref={snapLineRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-30 w-0"
            style={{ display: 'none' }}
          >
            <span className="absolute inset-y-0 -left-[1px] block w-[2px] bg-accent-ai shadow-[0_0_10px_rgba(99,102,241,0.9)] ring-1 ring-white/20" />
            <span className="absolute -top-1 -left-[3px] block h-2 w-2 rotate-45 bg-accent-ai shadow-[0_0_6px_rgba(99,102,241,1)]" />
            <div
              ref={snapBadgeRef}
              className="absolute top-2 left-2.5 px-2 py-0.5 rounded-[4px] bg-bg-panel/95 border border-accent-ai/70 shadow-[0_4px_12px_rgba(0,0,0,0.6)] text-[10px] font-mono font-semibold text-accent-ai whitespace-nowrap pointer-events-none backdrop-blur-md z-40"
              style={{ display: 'none' }}
            />
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

          {/* S20 — Work Area In/Out vertical boundary lines across lanes */}
          {inPointFrame !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 w-0"
              style={{ left: `calc(var(--lane-label-w) + ${inPointFrame * pixelsPerFrame}px)` }}
            >
              <span className="absolute inset-y-0 left-0 block w-px border-l-2 border-dashed border-accent-ai/70" />
            </div>
          )}
          {outPointFrame !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 w-0"
              style={{ left: `calc(var(--lane-label-w) + ${outPointFrame * pixelsPerFrame}px)` }}
            >
              <span className="absolute inset-y-0 left-0 block w-px border-l-2 border-dashed border-accent-ai/70" />
            </div>
          )}
        </div>
      </div>

      {/* S160 — the clip context menu (the renderer's first right-click). */}
      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menuItems}
        onClose={() => setMenu(null)}
        aria-label="Clip actions"
      />

      {/* S17 — the empty space / gap context menu */}
      <ContextMenu
        position={troughMenu ? { x: troughMenu.x, y: troughMenu.y } : null}
        items={troughMenuItems}
        onClose={() => setTroughMenu(null)}
        aria-label="Track and gap actions"
      />

      {/* S20 — the ruler context menu */}
      <ContextMenu
        position={rulerMenu ? { x: rulerMenu.x, y: rulerMenu.y } : null}
        items={rulerMenuItems}
        onClose={() => setRulerMenu(null)}
        aria-label="Ruler actions"
      />

      {/* S3 / S14 — Marker details & notes editor modal */}
      <MarkerModal
        open={Boolean(editingMarker)}
        marker={editingMarker}
        fps={fps}
        onClose={() => setEditingMarkerId(null)}
        onSave={(patch) => {
          if (!editingMarker) return;
          void updateMarker(editingMarker.id, patch);
        }}
        onDelete={(markerId) => {
          void removeMarker(markerId);
        }}
      />

      {/* S21 — Speed & Duration retiming modal */}
      {isSpeedModalOpen && (speedModalClip || selectedClip) && (
        <SpeedModal
          open={isSpeedModalOpen}
          clip={speedModalClip ?? selectedClip}
          document={document}
          fps={fps}
          onClose={() => {
            setSpeedModalClip(null);
            closeModal();
          }}
        />
      )}

      {/* S22 — Audio Gain & Fades HUD modal */}
      {isAudioGainModalOpen && (audioGainModalClip || selectedClip) && (
        <AudioGainModal
          open={isAudioGainModalOpen}
          clip={audioGainModalClip ?? selectedClip}
          fps={fps}
          onClose={() => {
            setAudioGainModalClip(null);
            closeModal();
          }}
        />
      )}

      {/* S26 — Subtitle & Caption Import/Export Modal */}
      {isSubtitleModalOpen && (
        <SubtitleModal
          open={isSubtitleModalOpen}
          document={document}
          fps={fps}
          initialTrackId={subtitleModalTrackId}
          onClose={() => {
            setSubtitleModalTrackId(null);
            closeModal();
          }}
        />
      )}

      {/* S82 — AI Auto-Reframe & Dynamic Aspect Ratio Modal */}
      {isAutoReframeModalOpen && (
        <AutoReframeModal
          open={isAutoReframeModalOpen}
          document={document}
          fps={fps}
          onClose={closeModal}
        />
      )}

      {/* S84 — CapCut AI Auto-Beats & Dynamic Music Cut Synchronizer */}
      {isBeatSyncModalOpen && (
        <AutoBeatSyncModal
          open={isBeatSyncModalOpen}
          document={document}
          fps={fps}
          onClose={closeModal}
        />
      )}
    </section>
  );
}
