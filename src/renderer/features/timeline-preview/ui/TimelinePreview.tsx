import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  buildCssFilter,
  clipAtFrame,
  clipSpeed,
  DIP_DEFAULT_COLOR_HEX,
  FLASH_DEFAULT_COLOR_HEX,
  effectiveBoundaryTransition,
  formatTimecode,
  framesToSeconds,
  layoutTrack,
  motionAt,
  composeMatchNudge,
  motionCssTransform,
  resolveClipMotion,
  resolveFilterValues,
  resolveWhiteboardDrawSeconds,
  spineTrackOf,
  toMediaUrl,
  valueAtFrame,
  WHITEBOARD_TRACE_DEFAULTS,
  whiteboardCadenceQuantizeSeconds,
  whiteboardClipPath,
  whiteboardRevealAt,
  whiteboardRows,
  whiteboardTraceFrontAt,
  whiteboardTraceMaskAlpha,
  whiteboardZoneClipPath,
  whiteboardZoneFrontAt,
  whiteboardZoneStateAt,
  type ClipTransition,
  type ClipTransitionParams,
  type PlacedClip,
  type SequenceTrack,
  type TextContent,
} from '@shared';

import {
  currentPlayheadFrame,
  useSequenceStore,
  selectDurationFrames,
  transportClock,
} from '../../../entities/sequence';
import { IconButton } from '../../../shared/ui/IconButton';
import { InfoPopover } from '../../../shared/ui/InfoPopover';
import { GlCompositor, type GlSource } from '../lib/gl/GlCompositor';
import { buildFrameGraph, layerFor, planTransition } from '../lib/gl/frame-graph';
import { useWhiteboardTrace, type WhiteboardTraceArtifact } from '../lib/useWhiteboardTrace';
import { whiteboardStillFilter } from '../lib/whiteboardLookFilter';

import { StudioOverlayGuides } from './StudioOverlayGuides';
import { WhiteboardLookDefs } from './WhiteboardLookDefs';

/**
 * Beta S145 — the preview, as a **switcher** rather than a compositor.
 *
 * A real NLE composites frames itself (WebGL/WebCodecs, or a native engine).
 * That is a large, ongoing commitment and not what this module is for. Instead:
 * one `<video>` and one `<img>` stacked, a single `requestAnimationFrame`
 * clock, and at each tick the playhead resolves to a clip — swap the image for
 * a still, applying Ken Burns as a CSS transform driven off the same clock.
 *
 * **Playback is real playback** (Beta S151 H2): on play at 1x the `<video>`
 * element *plays* — its decoder runs at its own rate — and the clock is only a
 * corrector, re-seeking on genuine divergence. S145 drove `currentTime` per
 * tick instead, which restarts the decode pipeline at display rate and turns
 * every video clip into a stutter of key-frame seeks. Seek-per-tick remains
 * exactly right for what it is right for: paused scrubbing and the `J`/`L`
 * shuttle, both of which are visual search rather than playback.
 *
 * The per-tick position lives in `transportClock`, not the store (H2's other
 * half): only this component and the playhead line need it per frame, and
 * routing it through zustand re-rendered every lane and clip at display rate.
 * The store is committed once, on stop — the document of record, not the
 * animation channel.
 *
 * What makes seeking viable at all is `media://`'s HTTP **byte-range**
 * support: `<video>` can seek a local file cheaply, with no preview server,
 * no blob URLs and no copying.
 *
 * **What it does not do, said plainly in the UI:** ducking previews unducked,
 * and the texture transition families (pixelize, radial) preview as plain
 * dissolves — S227's boundary pass shows dissolves, dips, wipes and slides
 * from the same `effectiveBoundaryTransition` the export reads. What remains
 * is a disclosed approximation, and the right trade for a module explicitly
 * scoped as not-CapCut — the draft render is the escape hatch for anyone who
 * needs the truth.
 */
export function TimelinePreview() {
  const document = useSequenceStore((state) => state.document);
  const storedFrame = useSequenceStore((state) => state.playheadFrame);
  const playing = useSequenceStore((state) => state.playing);
  const playbackRate = useSequenceStore((state) => state.playbackRate);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const setPlaying = useSequenceStore((state) => state.setPlaying);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * S249 — the compositor's decoders. The spine's `<video>`/`<img>` above are
   * slot B (the incoming picture); these two are slot A, the *outgoing* one.
   *
   * `underlayVideoRef` is the element the DOM switcher never had: with one
   * `<video>` there was nowhere to show a second clip's frame, which is why
   * the honesty line has always said a video under a dissolve holds nothing.
   */
  const stillImgRef = useRef<HTMLImageElement | null>(null);
  const underlayImgRef = useRef<HTMLImageElement | null>(null);
  const underlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<GlCompositor | null>(null);
  const overlayVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const rafRef = useRef<number | null>(null);

  /**
   * The live position while playing, local to this component. The rest of the
   * timeline follows `transportClock` (the playhead line) or the store (all
   * document-level consumers); only the switcher needs a React re-render per
   * tick, and only for itself — so it subscribes to the clock like any other
   * external system, and renders from the store whenever the clock is not
   * running.
   */
  const [liveFrame, setLiveFrame] = useState(0);
  useEffect(() => transportClock.subscribe(setLiveFrame), []);
  const playheadFrame = playing && transportClock.running ? liveFrame : storedFrame;

  // Studio Safe Areas & Guide Overlays (Blender VSE & Broadcast Standard)
  const [safeAreas, setSafeAreas] = useState(false);
  const [thirdsGrid, setThirdsGrid] = useState(false);
  const [socialZones, setSocialZones] = useState(false);

  const fps = document?.sequence.fps ?? 24;
  const clips = useMemo(() => document?.clips ?? [], [document]);
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);
  // The switcher shows the spine — S154 phase 1; z-order stacking is phase 2.
  const spineTrack = document ? spineTrackOf(document) : null;
  // S181 — visibility is the **eye** now. `muted` used to mean "hidden" on a
  // video track because such a track had no audio to silence; once its clips
  // carry sound, one flag cannot mean both (see `SequenceTrack.videoEnabled`).
  const videoLane = useMemo(
    () => (spineTrack?.videoEnabled ? layoutTrack(clips, spineTrack) : []),
    [clips, spineTrack],
  );
  const current: PlacedClip | null = clipAtFrame(videoLane, playheadFrame);
  /**
   * S227 — the boundary pass: while the playhead sits inside the incoming
   * clip's transition window, the outgoing clip's media is mounted underneath
   * and the incoming is styled per family. The window and its winner come
   * from the SAME `effectiveBoundaryTransition` the render's `join()` reads —
   * the two-consumer pattern — so the preview and the export cannot disagree
   * about which junctions transition, or for how long.
   */
  const boundary = useMemo(() => {
    if (!current) return null;
    const index = videoLane.indexOf(current);
    if (index <= 0) return null;
    const previous = videoLane[index - 1];
    const effective = effectiveBoundaryTransition(current.clip, previous.clip);
    if (effective.type === 'cut' || effective.frames <= 0) return null;
    const intoClip = playheadFrame - current.startFrames;
    if (intoClip < 0 || intoClip >= effective.frames) return null;
    return {
      type: effective.type,
      // +1 so the window's last frame lands at exactly 1 — the frame the
      // export's xfade finishes on.
      progress: Math.min(1, (intoClip + 1) / effective.frames),
      previous,
    };
  }, [current, videoLane, playheadFrame]);
  const boundaryLook =
    boundary && current
      ? boundaryVisual(boundary.type, boundary.progress, current.clip.effects?.transition)
      : null;
  // Underlay: the outgoing clip's held frame. A still is exactly what the
  // export clone-holds; a video's last decoded frame is not seekable without
  // a second player, so it falls back to nothing (disclosed in the ⓘ).
  const underlayUrl =
    boundary?.previous.clip.sourceKind === 'still'
      ? toMediaUrl(boundary.previous.clip.filePath)
      : undefined;
  const underlayMotion = boundary
    ? resolveClipMotion(
        boundary.previous.clip.motionPreset,
        boundary.previous.clip.effects?.motion,
        boundary.previous.clip.durationFrames,
        fps,
      )
    : undefined;
  /**
   * S154 phase 2 — the overlay stack: every non-muted free video track's clip
   * under the playhead, bottom-to-top, painted above the spine in the same
   * z-order the composite renders. The preview *is* a compositor now for
   * full-frame stacking; transforms and keyframes stay export-side until
   * phase 6.
   */
  const overlayStack = useMemo(() => {
    const overlayTracks = (document?.tracks ?? [])
      .filter(
        (track) =>
          track.kind === 'video' &&
          track.videoEnabled &&
          track.id !== document?.sequence.spineTrackId,
      )
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return overlayTracks
      .map((track) => clipAtFrame(layoutTrack(clips, track), playheadFrame))
      .filter((placed): placed is PlacedClip => placed !== null)
      // S157 — effect clips are not overlays; they become the frame filter below.
      .filter((placed) => placed.clip.sourceKind !== 'effect');
  }, [clips, document, playheadFrame]);

  /**
   * S157 — the adjustment layers under the playhead, as one CSS `filter`
   * applied to the whole frame: every effect clip on a non-muted video track
   * whose window contains the playhead, in track order — the same order the
   * export's windowed pass applies them.
   */
  const frameFilter = useMemo(() => {
    const parts = (document?.tracks ?? [])
      .filter((track) => track.kind === 'video' && track.videoEnabled)
      .flatMap((track) =>
        layoutTrack(clips, track).filter(
          (placed) =>
            placed.clip.sourceKind === 'effect' &&
            playheadFrame >= placed.startFrames &&
            playheadFrame < placed.endFrames,
        ),
      )
      .map((placed) => buildCssFilter(placed.clip.effects))
      .filter((filter) => filter.length > 0);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }, [clips, document, playheadFrame]);
  /**
   * S181 — the level a video clip's **own** audio plays at, or 0 for silent.
   *
   * Four gates, and each answers a different question the user can ask:
   * whether the transport is in a state where sound makes sense, whether they
   * muted this clip, whether they muted its track, and whether solo has
   * narrowed monitoring elsewhere. Only the last is renderer-local — solo
   * shapes monitoring and never the export.
   *
   * The gain itself reads through the same `valueAtFrame` ladder the audio
   * elements use, so a volume keyframe shapes a video clip's audio exactly as
   * it shapes an audio clip's. That is the whole point of the field having
   * lived on every clip since migration 060.
   */
  const sourceAudioVolume = useCallback(
    (placed: PlacedClip, track: SequenceTrack | null | undefined, audible: boolean): number => {
      if (!audible) return 0;
      if (placed.clip.sourceAudioEnabled === false) return 0;
      if (track?.muted) return 0;
      if (soloTrackIds.length > 0 && track && !soloTrackIds.includes(track.id)) return 0;
      const gainDb = valueAtFrame(
        placed.clip.keyframes,
        'volume',
        playheadFrame - placed.startFrames,
        placed.clip.gainDb,
      );
      return Math.min(1, Math.max(0, 10 ** (gainDb / 20)));
    },
    [playheadFrame, soloTrackIds],
  );

  const trackById = useMemo(
    () => new Map((document?.tracks ?? []).map((track) => [track.id, track])),
    [document],
  );

  /**
   * Every audible clip: non-muted audio tracks, narrowed to the soloed set
   * while one is engaged. Solo is renderer-local monitoring — it shapes this
   * list and nothing in the export.
   */
  const audioPlaced = useMemo(() => {
    const audioTracks = (document?.tracks ?? []).filter(
      (track) =>
        track.kind === 'audio' &&
        !track.muted &&
        (soloTrackIds.length === 0 || soloTrackIds.includes(track.id)),
    );
    return audioTracks.flatMap((track) => layoutTrack(clips, track));
  }, [clips, document, soloTrackIds]);

  /**
   * The transport clock.
   *
   * Wall-clock time, not a frame counter incremented per tick: rAF fires at
   * the display's rate, which is 60Hz or 120Hz and never the sequence's fps,
   * so counting frames would play a 24fps timeline at 2.5x on a 60Hz screen.
   * The shuttle rate is a multiplier on elapsed *time* for the same reason.
   */
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const startedAt = performance.now();
    const startFrame = useSequenceStore.getState().playheadFrame;
    transportClock.start(startFrame);

    const finish = (frame: number) => {
      transportClock.stop();
      setPlayhead(frame);
      setPlaying(false);
    };

    const tick = () => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const frame = startFrame + elapsedSeconds * fps * playbackRate;
      if (frame >= durationFrames) {
        finish(durationFrames);
        return;
      }
      // Running backwards, 0 is the end of the road. Stopping there rather
      // than clamping-and-continuing means `J` at the head does not sit
      // burning frames against a floor.
      if (frame <= 0) {
        finish(0);
        return;
      }
      transportClock.publish(frame);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // Effect teardown with `playing` still true is a rate change or an
      // unmount mid-play; teardown *because* the user paused runs after
      // `setPlaying(false)` already committed. Either way the store must end
      // up holding where playback actually stopped.
      if (transportClock.running) {
        transportClock.stop();
        setPlayhead(transportClock.frame);
      }
    };
  }, [playing, playbackRate, fps, durationFrames, setPlayhead, setPlaying]);

  /**
   * Keeps the video element on the frame the playhead names.
   *
   * Two regimes, on purpose (H2):
   *
   * - **Playing at 1x** — the element plays itself and this only corrects.
   *   The 0.25s tolerance is deliberately looser than the scrub threshold: a
   *   decoder tracking its own clock drifts slowly, and correcting a barely
   *   visible drift with a seek causes the visible hitch it was meant to fix.
   * - **Paused, or shuttling** — seek per position change. Frame-accurate and
   *   direction-agnostic, which playback is not (no `<video>` plays smoothly
   *   in reverse), at the cost of decode-per-seek that visual search accepts.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || current?.clip.sourceKind !== 'video') return;
    const intoClip = playheadFrame - current.startFrames;
    // S154 phase 3 — a sped clip consumes source at `speed`× the timeline
    // rate, in the preview exactly as in the export's `-t duration*speed`.
    const speed = clipSpeed(current.clip.effects);
    const target = framesToSeconds((current.clip.sourceInFrames ?? 0) + intoClip * speed, fps);

    const realtime = playing && playbackRate === 1;
    // S181 — the clip's own audio. Gated on `realtime` for the same reason the
    // audio bed is: shuttling is a *visual* search, and playing sound at 4x
    // (or backwards) is noise no editor expects to hear.
    video.volume = sourceAudioVolume(current, trackById.get(current.clip.trackId), realtime);
    if (realtime) {
      if (video.playbackRate !== speed) video.playbackRate = speed;
      if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target;
      if (video.paused) void video.play().catch(() => undefined);
      return;
    }
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - target) > 0.08) {
      video.currentTime = target;
    }
  }, [current, playheadFrame, playing, playbackRate, fps, sourceAudioVolume, trackById]);

  /** Overlay videos track the same clock with the same two-regime correction. */
  useEffect(() => {
    const realtime = playing && playbackRate === 1;
    for (const placed of overlayStack) {
      if (placed.clip.sourceKind !== 'video') continue;
      const element = overlayVideoRefs.current[placed.clip.id];
      if (!element) continue;
      const intoClip = playheadFrame - placed.startFrames;
      const target = framesToSeconds((placed.clip.sourceInFrames ?? 0) + intoClip, fps);
      element.volume = sourceAudioVolume(placed, trackById.get(placed.clip.trackId), realtime);
      if (realtime) {
        if (Math.abs(element.currentTime - target) > 0.25) element.currentTime = target;
        if (element.paused) void element.play().catch(() => undefined);
        continue;
      }
      if (!element.paused) element.pause();
      if (Math.abs(element.currentTime - target) > 0.08) element.currentTime = target;
    }
  }, [overlayStack, playheadFrame, playing, playbackRate, fps, sourceAudioVolume, trackById]);

  /** Audio tracks follow the same clock, each element playing inside its own clip. */
  useEffect(() => {
    // Shuttling is a *visual* search. Playing audio at 4x (or backwards) is
    // noise, and no editor expects to hear it — `J`/`L` scrub the picture and
    // mute the bed until the transport returns to 1x.
    const audible = playing && playbackRate === 1;
    for (const placed of audioPlaced) {
      const element = audioRefs.current[placed.clip.id];
      if (!element) continue;
      const inside = playheadFrame >= placed.startFrames && playheadFrame < placed.endFrames;
      if (!inside || !audible) {
        if (!element.paused) element.pause();
        continue;
      }
      // dB → linear, clamped to what an HTMLMediaElement accepts. S154 phase
      // 6: a volume curve reads at the clip-relative playhead, exactly the
      // `valueAtFrame` the export's expression ladder is defined against.
      const gainDb = valueAtFrame(
        placed.clip.keyframes,
        'volume',
        playheadFrame - placed.startFrames,
        placed.clip.gainDb,
      );
      element.volume = Math.min(1, Math.max(0, 10 ** (gainDb / 20)));
      // S154 phase 3 — head trim and tempo, matching the export's atrim/atempo.
      const tempo = clipSpeed(placed.clip.effects);
      if (element.playbackRate !== tempo) element.playbackRate = tempo;
      const target = framesToSeconds(
        (placed.clip.sourceInFrames ?? 0) + (playheadFrame - placed.startFrames) * tempo,
        fps,
      );
      // Same two-regime logic as the video: a playing element tracks its own
      // clock and only genuine divergence is corrected.
      if (Math.abs(element.currentTime - target) > 0.25) element.currentTime = target;
      if (element.paused) void element.play().catch(() => undefined);
    }
  }, [audioPlaced, playheadFrame, playing, playbackRate, fps]);

  const stillUrl =
    current?.clip.sourceKind === 'still' ? toMediaUrl(current.clip.filePath) : undefined;
  const videoUrl =
    current?.clip.sourceKind === 'video' ? toMediaUrl(current.clip.filePath) : undefined;

  /**
   * S154 phase 5 — a text clip as a styled `<div>`, positioned and sized from
   * the same `TextContent` the export's `drawtext` reads. Font size is
   * authored against the sequence height, so it scales by the measured box.
   * The typography will not match `drawtext`'s system font exactly — a
   * disclosed approximation of the same species as the honesty line's others.
   */
  const [boxHeight, setBoxHeight] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setBoxHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  /**
   * S154 phase 6 — an overlay's box: PiP statics plus x/y curves, read at the
   * clip-relative playhead through the same `valueAtFrame` the export's
   * expression ladder is defined against.
   */
  const overlayStyle = (placed: PlacedClip): React.CSSProperties => {
    const transform = placed.clip.effects?.transform;
    const scaleBox = transform?.scale ?? 1;
    const frame = playheadFrame - placed.startFrames;
    const cx = valueAtFrame(placed.clip.keyframes, 'x', frame, transform?.x ?? 0.5);
    const cy = valueAtFrame(placed.clip.keyframes, 'y', frame, transform?.y ?? 0.5);
    return {
      left: `${((cx - scaleBox / 2) * 100).toFixed(3)}%`,
      top: `${((cy - scaleBox / 2) * 100).toFixed(3)}%`,
      width: `${(scaleBox * 100).toFixed(3)}%`,
      height: `${(scaleBox * 100).toFixed(3)}%`,
      opacity: transform?.opacity,
      filter: buildCssFilter(placed.clip.effects) || undefined,
    };
  };

  /**
   * S160 (owner item 9) — drag a selected text clip around the frame.
   *
   * The gesture writes `effects.text.positionPct` — never `transform.x/y`:
   * a text overlay's placement lives inside `drawtext` in the render graph
   * (it deliberately receives no position expressions), so a transform would
   * move the preview and not the export. Local state carries the live
   * position during the drag; **one** `patchClip` fires on release, so the
   * whole gesture is one undo entry — the `useTimelineDrag` contract, in
   * fraction space.
   *
   * Snapping: centre and thirds on both axes, within ~1.5% of the frame.
   * `Shift` constrains to the dominant axis; `Alt` suppresses snapping.
   */
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const patchClip = useSequenceStore((state) => state.patchClip);
  const textDragRef = useRef<{
    clipId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originPct: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const [textDragPct, setTextDragPct] = useState<{
    clipId: string;
    x: number;
    y: number;
    snapped: { x: boolean; y: boolean };
  } | null>(null);

  const SNAP_STOPS = [1 / 3, 0.5, 2 / 3];
  const SNAP_TOLERANCE = 0.015;

  const applyTextDrag = (event: React.PointerEvent): { x: number; y: number; snapped: { x: boolean; y: boolean } } | null => {
    const drag = textDragRef.current;
    const bounds = boxRef.current?.getBoundingClientRect();
    if (!drag || !bounds || bounds.width === 0 || bounds.height === 0) return null;
    let dx = (event.clientX - drag.startX) / bounds.width;
    let dy = (event.clientY - drag.startY) / bounds.height;
    // Shift — one axis only, whichever the hand has committed to.
    if (event.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let x = Math.min(1, Math.max(0, drag.originPct.x + dx));
    let y = Math.min(1, Math.max(0, drag.originPct.y + dy));
    const snapped = { x: false, y: false };
    if (!event.altKey) {
      for (const stop of SNAP_STOPS) {
        if (Math.abs(x - stop) < SNAP_TOLERANCE) {
          x = stop;
          snapped.x = true;
        }
        if (Math.abs(y - stop) < SNAP_TOLERANCE) {
          y = stop;
          snapped.y = true;
        }
      }
    }
    return { x, y, snapped };
  };

  const renderText = (clipId: string, effectsText: TextContent | undefined) => {
    if (!effectsText || !document) return null;
    const textScale = boxHeight > 0 ? boxHeight / document.sequence.height : 0;
    if (textScale === 0) return null;
    // Interactive only while its clip is selected — an inert title never
    // fights the transport, and selection is the universal "edit me" state.
    const draggable = selectedClipIds.length === 1 && selectedClipIds[0] === clipId;
    const live = textDragPct?.clipId === clipId ? textDragPct : null;
    const anchor = effectsText.anchor ?? 'middle';
    const translateY = anchor === 'top' ? '0' : anchor === 'bottom' ? '-100%' : '-50%';
    const position = live ?? effectsText.positionPct;
    return (
      <div
        key={`text-${clipId}`}
        aria-hidden={draggable ? undefined : 'true'}
        className={`absolute whitespace-pre-wrap ${
          draggable
            ? 'cursor-move ring-1 ring-accent-ai/60 pointer-events-auto touch-none'
            : 'pointer-events-none'
        }`}
        style={{
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
          transform: `translate(${
            effectsText.align === 'center' ? '-50%' : effectsText.align === 'right' ? '-100%' : '0'
          }, ${translateY})`,
          fontSize: effectsText.fontSizePx * textScale,
          fontWeight: 700,
          lineHeight: 1.2,
          color: effectsText.colorHex,
          textAlign: effectsText.align,
          backgroundColor: effectsText.box
            ? `${effectsText.box.colorHex}${Math.round(effectsText.box.opacity * 255)
                .toString(16)
                .padStart(2, '0')}`
            : undefined,
          padding: effectsText.box ? effectsText.box.paddingPx * textScale : undefined,
        }}
        onPointerDown={
          draggable
            ? (event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                textDragRef.current = {
                  clipId,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originPct: { ...effectsText.positionPct },
                  moved: false,
                };
              }
            : undefined
        }
        onPointerMove={
          draggable
            ? (event) => {
                const drag = textDragRef.current;
                if (drag?.clipId !== clipId) return;
                // Click-vs-drag threshold — a selection click must not push
                // an undo entry (the useTimelineDrag rule, in pixels).
                if (
                  !drag.moved &&
                  Math.abs(event.clientX - drag.startX) < 3 &&
                  Math.abs(event.clientY - drag.startY) < 3
                ) {
                  return;
                }
                drag.moved = true;
                const next = applyTextDrag(event);
                if (next) setTextDragPct({ clipId, ...next });
              }
            : undefined
        }
        onPointerUp={
          draggable
            ? (event) => {
                const drag = textDragRef.current;
                textDragRef.current = null;
                const live2 = textDragPct;
                setTextDragPct(null);
                if (!drag?.moved || !live2) return;
                const clip = document.clips.find((item) => item.id === clipId);
                if (!clip?.effects?.text) return;
                patchClip(clipId, {
                  effects: {
                    ...clip.effects,
                    text: { ...clip.effects.text, positionPct: { x: live2.x, y: live2.y } },
                  },
                });
                event.preventDefault();
              }
            : undefined
        }
        onPointerCancel={
          draggable
            ? () => {
                textDragRef.current = null;
                setTextDragPct(null);
              }
            : undefined
        }
      >
        {effectsText.text}
      </div>
    );
  };

  /**
   * S161 — the whiteboard reveal's per-tick state, when the spine still
   * carries one. Progress runs over the *draw window* (resolved from the
   * clip at eval time — S279), not the clip — past it the clamp holds the
   * finished frame, exactly the export's `min(t/D,1)`.
   */
  const whiteboard = (() => {
    const settings = current?.clip.effects?.whiteboard;
    if (!settings || current?.clip.sourceKind !== 'still') return null;
    // S279 — the window derives from the clip at eval time (fraction wins,
    // legacy absolute honored) — the exact seconds the export resolves.
    const drawSecs = resolveWhiteboardDrawSeconds(settings, current.clip.durationFrames, fps);
    // S296 — the reveal clock steps when a cadence is set (the export's
    // `floor(t*C)/C`, in seconds form); smooth passes elapsed time through.
    const wbElapsed = whiteboardCadenceQuantizeSeconds(
      framesToSeconds(Math.max(0, playheadFrame - current.startFrames), fps),
      settings,
    );
    const wbProgress = Math.min(1, Math.max(0, wbElapsed / Math.max(1 / 120, drawSecs)));
    // S275 — the zone reveal: one clipped layer per user-drawn zone, the pen
    // at the shared front. Zones absent (the pattern chosen before any were
    // drawn) degrades to serpentine — the export's `zoneModeFor` fallback.
    if (settings.pattern === 'zones' && settings.zones && settings.zones.length > 0) {
      return {
        progress: wbProgress,
        rows: 1,
        hand: settings.hand,
        // S303 — the board look, read by the still's CSS filter below.
        look: settings.look,
        zones: settings.zones,
        trace: null,
        front: whiteboardZoneFrontAt(wbProgress, settings.zones),
      };
    }
    // S277/S278 — a trace clip carries its knobs so the artifact fetch below
    // can ask for the real stroke order; until (or unless) that lands, the
    // wipe (R=1) stands in, as the ⓘ line discloses.
    const trace =
      settings.pattern === 'trace' ? (settings.trace ?? WHITEBOARD_TRACE_DEFAULTS) : null;
    const rows = trace ? 1 : whiteboardRows(settings);
    const state = whiteboardRevealAt(wbProgress, rows);
    return {
      progress: wbProgress,
      rows,
      hand: settings.hand,
      look: settings.look,
      zones: null,
      trace,
      front: { x: state.frontX, y: state.frontY } as { x: number; y: number } | null,
    };
  })();

  // S278 — the Sketch pattern's traced artifact, from the same cache the
  // export reads. `null` while loading/refused/failed keeps the wipe.
  const traceArtifact = useWhiteboardTrace(
    whiteboard?.trace && current?.clip.filePath && document
      ? {
          filePath: current.clip.filePath,
          trace: whiteboard.trace,
          frameWidth: document.sequence.width,
          frameHeight: document.sequence.height,
        }
      : null,
  );
  // The pen glyph's position: the real pen path once traced (null during the
  // fill bloom — the hand leaves), the wipe front otherwise.
  const wbGlyphFront =
    whiteboard === null
      ? null
      : whiteboard.trace && traceArtifact
        ? whiteboardTraceFrontAt(traceArtifact.penPath, whiteboard.progress)
        : whiteboard.front;

  // S228 — Ken Burns from the shared model, off the same clock. `motionAt`
  // is the exact closed form `still-motion.ts` compiles to zoompan
  // expressions, so the preview and the render move the same way *by
  // construction* — the previous hand-written CSS pan travelled ~13.4% of
  // the frame while the export travelled 10.7%, precisely because this was
  // written twice. A moving clip cover-fits (`object-cover`) like the
  // export's crop, so the pan crosses picture rather than letterbox.
  const resolvedMotion = (() => {
    if (!current) return undefined;
    let curve = resolveClipMotion(
      current.clip.motionPreset,
      current.clip.effects?.motion,
      current.clip.durationFrames,
      fps,
    );
    // S237 — the match dissolve's alignment: the same composer the render
    // calls, under the same not-first-clip guard.
    const match = current.clip.effects?.transition?.match;
    if (
      current.clip.transitionIn === 'match_dissolve' &&
      match &&
      videoLane.indexOf(current) > 0
    ) {
      curve = composeMatchNudge(curve, match.out, match.in, current.clip.transitionFrames);
    }
    return curve;
  })();
  // S237 — reframe editing: the selected clip under the playhead with a
  // reframe move shows the full cover-fit frame and two draggable viewport
  // rects instead of the live motion — you place a composition against the
  // still picture, not against a moving one.
  const reframeMotion =
    current &&
    selectedClipIds.length === 1 &&
    selectedClipIds[0] === current.clip.id &&
    current.clip.effects?.motion?.preset === 'reframe'
      ? current.clip.effects.motion
      : null;
  const motionTransform =
    !reframeMotion && resolvedMotion && current
      ? motionCssTransform(
          motionAt(
            resolvedMotion,
            playheadFrame - current.startFrames,
            current.clip.durationFrames,
          ),
        )
      : undefined;

  // ---------------------------------------------------------------- S249
  //
  // The GL compositor. Everything above this line is unchanged: the clock,
  // both seeking regimes, every audio element and the whole DOM switcher are
  // still here and still correct, because the compositor only *paints*.
  //
  // `glEnabled` is a one-way latch. It starts true, goes false the first time
  // a context cannot be made, a draw throws, or the context is lost — and
  // never comes back within the session. A driver this shader upsets should
  // cost fidelity, not a preview, and a path that flickers between two
  // renderers per frame would be worse than either.

  const [glEnabled, setGlEnabled] = useState(true);

  /**
   * Bumped whenever one of the compositor's decoders has a new frame to
   * offer. Without it a paused scrub onto a clip that has not decoded yet
   * would paint background and never come back — while playing the next tick
   * would fix it, but scrubbing has no next tick.
   */
  const [mediaTick, setMediaTick] = useState(0);
  const bumpMedia = useCallback(() => setMediaTick((tick) => tick + 1), []);

  /**
   * Which frames the compositor may paint.
   *
   * Three spine kinds route through DOM-only machinery the shader has no
   * equivalent for — a whiteboard reveal is a clip-path animation, a text
   * clip is typography, and reframe editing deliberately shows a *still*
   * frame with drag handles over it. On those frames the canvas is unmounted
   * and the switcher underneath is simply visible, which is the same fallback
   * the latch uses.
   */
  const glActive =
    glEnabled &&
    current !== null &&
    whiteboard === null &&
    reframeMotion === null &&
    (current.clip.sourceKind === 'still' || current.clip.sourceKind === 'video');

  /**
   * S249's first win: the outgoing **video**'s held frame.
   *
   * A second element, mounted only inside a transition window over a video,
   * seeked to that clip's last source frame — exactly the frame the export's
   * `tpad=stop_mode=clone` holds. The DOM switcher could not do this with one
   * `<video>`, which is the whole of the honesty line's "holds nothing".
   */
  const underlayVideoUrl =
    glActive && boundary?.previous.clip.sourceKind === 'video'
      ? toMediaUrl(boundary.previous.clip.filePath)
      : undefined;

  useEffect(() => {
    const element = underlayVideoRef.current;
    if (!element || boundary?.previous.clip.sourceKind !== 'video') return;
    const outgoing = boundary.previous.clip;
    const speed = clipSpeed(outgoing.effects);
    // The last frame the export would have reached before the clone-hold.
    const target = framesToSeconds(
      (outgoing.sourceInFrames ?? 0) + Math.max(0, outgoing.durationFrames - 1) * speed,
      fps,
    );
    if (Math.abs(element.currentTime - target) > 0.05) element.currentTime = target;
  }, [boundary, fps]);

  /**
   * The adjustment layers as numbers, in the order the export applies them.
   * The CSS string above is the fallback path's rendering of the same list —
   * one `resolveFilterValues` behind both, so they cannot disagree about the
   * grade, only about how much of it each can express.
   */
  const adjustments = useMemo(
    () =>
      (document?.tracks ?? [])
        .filter((track) => track.kind === 'video' && track.videoEnabled)
        .flatMap((track) =>
          layoutTrack(clips, track).filter(
            (placed) =>
              placed.clip.sourceKind === 'effect' &&
              playheadFrame >= placed.startFrames &&
              playheadFrame < placed.endFrames,
          ),
        )
        .map((placed) => resolveFilterValues(placed.clip.effects)),
    [clips, document, playheadFrame],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!glActive || !canvas) return;
    if (!compositorRef.current) {
      const compositor = GlCompositor.create(canvas);
      if (!compositor) {
        setGlEnabled(false);
        return;
      }
      compositorRef.current = compositor;
    }
    const lose = (): void => setGlEnabled(false);
    canvas.addEventListener('webglcontextlost', lose);
    return () => canvas.removeEventListener('webglcontextlost', lose);
  }, [glActive]);

  useEffect(
    () => () => {
      compositorRef.current?.dispose();
      compositorRef.current = null;
    },
    [],
  );

  /**
   * One paint per render, and a render happens per clock tick while playing
   * and per playhead change while scrubbing — so the canvas follows exactly
   * what the switcher followed, with no second loop to keep in step.
   *
   * `useLayoutEffect` with no dependency array on purpose: the frame to paint
   * is a function of a dozen derived values, and a dependency list that
   * missed one would drop frames in a way nobody could reproduce.
   */
  useLayoutEffect(() => {
    const compositor = compositorRef.current;
    if (!glActive || !compositor || !current) return;
    if (compositor.isFailed()) {
      setGlEnabled(false);
      return;
    }

    const elementFor = (
      element: HTMLVideoElement | HTMLImageElement | null,
    ): GlSource | null => {
      if (!element) return null;
      const width =
        element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
      const height =
        element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
      return width > 0 && height > 0 ? { element, width, height } : null;
    };

    const incoming = layerFor({
      slot: 'b',
      clipId: current.clip.id,
      motion: resolvedMotion
        ? motionAt(resolvedMotion, playheadFrame - current.startFrames, current.clip.durationFrames)
        : undefined,
      effects: current.clip.effects,
    });

    const previous = boundary?.previous.clip;
    const outgoing =
      previous && underlayMotion
        ? layerFor({
            slot: 'a',
            clipId: previous.id,
            // The held frame is `motionAt` at the outgoing clip's final frame —
            // exactly the state the export's clone-hold freezes.
            motion: motionAt(underlayMotion, previous.durationFrames - 1, previous.durationFrames),
            effects: previous.effects,
          })
        : previous
          ? layerFor({ slot: 'a', clipId: previous.id, motion: undefined, effects: previous.effects })
          : null;

    const sourceA = elementFor(
      previous?.sourceKind === 'video' ? underlayVideoRef.current : underlayImgRef.current,
    );
    const graph = buildFrameGraph({
      incoming,
      // A boundary whose outgoing media has not decoded yet is not a
      // transition this frame: the shader would blend against a black slot,
      // which reads as a flash the export never has.
      outgoing: boundary && sourceA ? outgoing : null,
      transition: boundary
        ? planTransition(boundary.type, boundary.progress, current.clip.effects?.transition)
        : null,
      adjustments,
    });

    const sourceB = elementFor(
      current.clip.sourceKind === 'video' ? videoRef.current : stillImgRef.current,
    );
    // Black, not the workspace tone: the export pads with black and its canvas
    // is black, so the letterbox bars this shader paints are the export's.
    if (!compositor.draw(graph, { a: graph.transition ? sourceA : null, b: sourceB }, [0, 0, 0])) {
      setGlEnabled(false);
    }
  }, [
    glActive,
    current,
    resolvedMotion,
    playheadFrame,
    boundary,
    underlayMotion,
    adjustments,
    mediaTick,
  ]);

  const seqWidth = document?.sequence.width ?? 1920;
  const seqHeight = document?.sequence.height ?? 1080;
  const sequenceAspect = `${seqWidth} / ${seqHeight}`;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Monitor Header HUD */}
      <div className="flex items-center justify-between px-1 text-[11px] text-text-secondary select-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono rounded-md bg-bg-app border border-hairline px-2.5 py-0.5 text-text-secondary text-[11px]">
            <span className="material-symbols-outlined text-[13px] text-accent-ai">aspect_ratio</span>
            {seqWidth}×{seqHeight}
            <span className="text-text-disabled">·</span>
            {seqWidth > seqHeight ? '16:9' : seqWidth === seqHeight ? '1:1' : '9:16'}
          </span>
          <span className="font-mono text-text-disabled text-[11px]">{fps} fps</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Studio Guides Controls */}
          <div className="flex items-center bg-bg-app border border-hairline rounded-md p-0.5 mr-1 gap-0.5">
            <button
              type="button"
              onClick={() => setSafeAreas((prev) => !prev)}
              className={`p-1 rounded text-[11px] flex items-center justify-center transition-colors ${
                safeAreas ? 'bg-accent-ai/20 text-accent-ai font-medium' : 'text-text-disabled hover:text-text-secondary'
              }`}
              title="Toggle Safe Areas (Title 90% / Action 93%)"
            >
              <span className="material-symbols-outlined text-[14px]">crop_free</span>
            </button>
            <button
              type="button"
              onClick={() => setThirdsGrid((prev) => !prev)}
              className={`p-1 rounded text-[11px] flex items-center justify-center transition-colors ${
                thirdsGrid ? 'bg-accent-ai/20 text-accent-ai font-medium' : 'text-text-disabled hover:text-text-secondary'
              }`}
              title="Toggle Rule of Thirds (3x3 Grid)"
            >
              <span className="material-symbols-outlined text-[14px]">grid_4x4</span>
            </button>
            <button
              type="button"
              onClick={() => setSocialZones((prev) => !prev)}
              className={`p-1 rounded text-[11px] flex items-center justify-center transition-colors ${
                socialZones ? 'bg-accent-ai/20 text-accent-ai font-medium' : 'text-text-disabled hover:text-text-secondary'
              }`}
              title="Toggle Social UI Safe Zones (TikTok/Reels UI)"
            >
              <span className="material-symbols-outlined text-[14px]">stay_current_portrait</span>
            </button>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              playing ? 'bg-accent-success/15 text-accent-success' : 'bg-bg-app border border-hairline text-text-secondary'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                playing ? 'bg-accent-success animate-pulse' : 'bg-text-disabled'
              }`}
            />
            {playing ? 'Playing' : 'Paused'}
          </span>
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative mx-auto w-full overflow-hidden rounded-[var(--radius-card)] bg-[#07080b] shadow-inner border border-hairline/60"
        // S249 — the shader applies the adjustment layers itself, and a CSS
        // filter on the box would put them over the canvas a second time.
        style={{
          aspectRatio: sequenceAspect,
          maxHeight: 'calc(100vh - 350px)',
          filter: glActive ? undefined : frameFilter,
        }}
      >
        {/* S227 — the outgoing clip held under the transition window, exactly
            what the export's tpad-clone shows. Mounted before (beneath) the
            incoming media in paint order. */}
        {underlayUrl && boundary ? (
          <img
            ref={underlayImgRef}
            src={underlayUrl}
            onLoad={bumpMedia}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full ${underlayMotion ? 'object-cover' : 'object-contain'}`}
            style={{
              // S228 — the held frame is `motionAt` at the outgoing clip's
              // final frame: exactly the state the export's tpad-clone holds.
              transform: underlayMotion
                ? motionCssTransform(
                    motionAt(
                      underlayMotion,
                      boundary.previous.clip.durationFrames - 1,
                      boundary.previous.clip.durationFrames,
                    ),
                  )
                : undefined,
              filter: buildCssFilter(boundary.previous.clip.effects) || undefined,
            }}
          />
        ) : null}
        {/* S249 — the outgoing video's held frame. `hidden` in the visual
            sense only: it is laid out and decoding, because the compositor
            reads it with texImage2D. Muted, because the mix is the audio
            elements' job and this element exists to hold one picture. */}
        {underlayVideoUrl ? (
          <video
            ref={underlayVideoRef}
            src={underlayVideoUrl}
            onLoadedData={bumpMedia}
            onSeeked={bumpMedia}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        ) : null}
        {stillUrl && whiteboard ? (
          /* S161 — the whiteboard reveal: a white board, the still clipped
             by the serpentine polygon, and a pen glyph at the front. The
             polygon comes from the SAME `whiteboardRevealAt` the export's
             expressions encode, recomputed per tick off the shared clock —
             the two-consumer pattern. The bundled hand PNG is main-process
             territory, so the preview stands a glyph in for it; the export
             draws the real hand (disclosed in the ⓘ). */
          <div className="relative h-full w-full bg-media-board" style={boundaryLook?.incoming}>
            <WhiteboardLookDefs />
            {whiteboard.zones ? (
              /* S275 — one layer per zone, each clipped by the SAME
                 `whiteboardZoneStateAt` polygon the export's masks encode
                 (even-odd on both sides). Pending zones clip to nothing and
                 skip their layer entirely. */
              whiteboard.zones.map((zone, index) => {
                const zoneClip = whiteboardZoneClipPath(
                  whiteboardZoneStateAt(whiteboard.progress, whiteboard.zones, index),
                );
                if (!zoneClip) return null;
                return (
                  <img
                    // Zones have no ids and reorders rebuild the layers — the
                    // index is the identity here.
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    src={stillUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{
                      clipPath: zoneClip,
                      filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                    }}
                  />
                );
              })
            ) : whiteboard.trace && traceArtifact ? (
              /* S278 — the real traced reveal: a canvas whose per-pixel alpha
                 is the SAME threshold-vs-time-map comparison the export runs
                 (`whiteboardTraceMaskAlpha` — the two-consumer pattern, third
                 verse). The map came from the render's own cache. */
              <TraceRevealCanvas
                artifact={traceArtifact}
                stillUrl={stillUrl}
                progress={whiteboard.progress}
                filter={whiteboardStillFilter(current?.clip.effects, whiteboard.look)}
              />
            ) : (
              <img
                src={stillUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain"
                style={{
                  clipPath: whiteboardClipPath(whiteboard.progress, whiteboard.rows),
                  filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                }}
              />
            )}
            {whiteboard.progress < 1 && whiteboard.hand !== 'none' && wbGlyphFront ? (
              <span
                aria-hidden="true"
                className="material-symbols-outlined absolute text-3xl text-media-ink"
                style={{
                  left: `${wbGlyphFront.x * 100}%`,
                  top: `${wbGlyphFront.y * 100}%`,
                }}
              >
                {/* The glyph follows the Hand setting. It was `stylus` for
                    both, so Pen and Marker previewed identically — the one
                    place the setting was legible before the export, and it
                    said nothing. `ink_marker` is the blunt chisel twin of
                    the thin `stylus`, matching how the two bundled hand PNGs
                    now differ (nib width, not just barrel colour). Both
                    ligatures are in the bundled full-set font. */}
                {whiteboard.hand === 'marker' ? 'ink_marker' : 'stylus'}
              </span>
            ) : null}
          </div>
        ) : stillUrl ? (
          <img
            ref={stillImgRef}
            src={stillUrl}
            onLoad={bumpMedia}
            alt=""
            aria-hidden="true"
            className={`h-full w-full ${resolvedMotion ? 'object-cover' : 'object-contain'}`}
            style={{
              // S227 — a slide's translate composes before the Ken Burns move.
              transform:
                [boundaryLook?.incoming.transform, motionTransform].filter(Boolean).join(' ') ||
                undefined,
              opacity: boundaryLook?.incoming.opacity,
              clipPath: boundaryLook?.incoming.clipPath,
              filter: buildCssFilter(current?.clip.effects) || undefined,
            }}
          />
        ) : null}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedData={bumpMedia}
            onSeeked={bumpMedia}
            // S181 — no `muted`. Volume is driven per frame by the sync effect
            // above; hardcoding it here is what silently discarded every video
            // clip's audio, in a way the export then disagreed with.
            playsInline
            className="h-full w-full object-contain"
            style={{
              ...boundaryLook?.incoming,
              filter: buildCssFilter(current?.clip.effects) || undefined,
            }}
          />
        ) : null}
        {/* S227 — the dip veil: the solid the picture passes through, exact
            for fade to black/white because it is the same arithmetic. */}
        {boundaryLook?.veil ? (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: boundaryLook.veil.color,
              opacity: boundaryLook.veil.opacity,
            }}
          />
        ) : null}
        {/* S249 — the compositor's canvas, painted over the switcher rather
            than replacing it: the elements underneath stay mounted as
            decoders and keep their audio, and hiding them would risk a
            browser deprioritising the decode this reads. Mounted after the
            veil and before the text/reframe/overlay layers, so the paint
            order is exactly the switcher's. */}
        {glActive ? (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}
        {/* S237 — reframe editing: the two authored viewports as draggable
            rects over the full cover-fit frame. A drags `from`, B drags
            `to`; scale lives in the inspector. */}
        {reframeMotion && current ? (
          <>
            <ReframeRect
              label="A"
              viewpoint={reframeMotion.from ?? { x: 0.5, y: 0.5, scale: 1 }}
              className="border-accent-ai text-accent-ai"
              onMove={(x, y) =>
                patchClip(
                  current.clip.id,
                  {
                    effects: {
                      ...current.clip.effects,
                      motion: {
                        ...reframeMotion,
                        from: { ...(reframeMotion.from ?? { x: 0.5, y: 0.5, scale: 1 }), x, y },
                      },
                    },
                  },
                  'motionPreset',
                )
              }
            />
            <ReframeRect
              label="B"
              viewpoint={reframeMotion.to ?? { x: 0.5, y: 0.5, scale: 1.2 }}
              className="border-accent-warning text-accent-warning"
              onMove={(x, y) =>
                patchClip(
                  current.clip.id,
                  {
                    effects: {
                      ...current.clip.effects,
                      motion: {
                        ...reframeMotion,
                        to: { ...(reframeMotion.to ?? { x: 0.5, y: 0.5, scale: 1.2 }), x, y },
                      },
                    },
                  },
                  'motionPreset',
                )
              }
            />
          </>
        ) : null}
        {/* A text clip on the spine renders over black — the export's canvas.
            `media-scrim-strong` is the invariant family's darkest member
            (85% black over the workspace tone); the export is pure black, a
            preview-only shade the honesty line's "approximates" covers. */}
        {current?.clip.sourceKind === 'text' ? (
          <>
            <div className="absolute inset-0 bg-media-scrim-strong" />
            {renderText(current.clip.id, current.clip.effects?.text)}
          </>
        ) : null}
        {/* The overlay stack, bottom-to-top above the spine — full-frame in
            phase 2, exactly what the composite renders. */}
        {overlayStack.map((placed) =>
          placed.clip.sourceKind === 'text' ? (
            renderText(placed.clip.id, placed.clip.effects?.text)
          ) : placed.clip.sourceKind === 'video' ? (
            <video
              key={placed.clip.id}
              ref={(element) => {
                overlayVideoRefs.current[placed.clip.id] = element;
              }}
              src={toMediaUrl(placed.clip.filePath) ?? undefined}
              playsInline
              className="absolute object-contain"
              style={overlayStyle(placed)}
            />
          ) : (
            <img
              key={placed.clip.id}
              src={toMediaUrl(placed.clip.filePath) ?? undefined}
              alt=""
              aria-hidden="true"
              className="absolute object-contain"
              style={overlayStyle(placed)}
            />
          ),
        )}
        {/* S160 — alignment guides, visible only while a text drag is
            actually snapped to a stop; the line is the "you are aligned"
            confirmation, not decoration. */}
        {textDragPct?.snapped.x ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-accent-ai/70"
            style={{ left: `${textDragPct.x * 100}%` }}
          />
        ) : null}
        {textDragPct?.snapped.y ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-accent-ai/70"
            style={{ top: `${textDragPct.y * 100}%` }}
          />
        ) : null}
        {!current && overlayStack.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-disabled">
            Nothing at the playhead.
          </div>
        ) : null}

        {/* Studio Safe Areas, Grids & Social Overlays */}
        <StudioOverlayGuides
          showSafeAreas={safeAreas}
          showThirdsGrid={thirdsGrid}
          showSocialZones={socialZones}
        />
      </div>

      {/* Transport bar */}
      <div className="grid grid-cols-3 items-center gap-2 pt-1 select-none">
        {/* Left: Elapsed / total timecode readout in a sleek dark pill HUD */}
        <div className="justify-self-start flex items-center gap-1.5 rounded-md border border-hairline bg-bg-app px-2.5 py-1 shadow-xs">
          <span className="material-symbols-outlined text-[14px] text-accent-ai">schedule</span>
          <span className="font-mono text-xs font-semibold text-text-primary">
            {formatTimecode(playheadFrame, fps)}
          </span>
          <span className="font-mono text-xs text-text-disabled">/</span>
          <span className="font-mono text-xs text-text-secondary">
            {formatTimecode(durationFrames, fps)}
          </span>
        </div>

        {/* Centre: Transport controls with frame-stepping and accented play/pause */}
        <div className="flex items-center gap-1 justify-self-center">
          <IconButton icon="first_page" label="Go to start (Home)" size="sm" onClick={() => setPlayhead(0)} />
          <IconButton
            icon="chevron_left"
            label="Back one frame (←)"
            size="sm"
            onClick={() => {
              setPlaying(false);
              setPlayhead(Math.max(0, currentPlayheadFrame() - 1));
            }}
          />
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-ai text-text-on-accent shadow-md hover:brightness-110 active:scale-95 transition-all"
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            <span className="material-symbols-outlined text-[19px]">
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <IconButton
            icon="chevron_right"
            label="Forward one frame (→)"
            size="sm"
            onClick={() => {
              setPlaying(false);
              setPlayhead(Math.min(durationFrames, currentPlayheadFrame() + 1));
            }}
          />
          <IconButton
            icon="last_page"
            label="Go to end (End)"
            size="sm"
            onClick={() => setPlayhead(durationFrames)}
          />
        </div>

        <div className="flex items-center gap-2 justify-self-end">
          {/* Shuttle rate readout */}
          {playing && playbackRate !== 1 ? (
            <span className="rounded bg-accent-ai/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-ai">
              {playbackRate > 0 ? '▶' : '◀'} {Math.abs(playbackRate)}×
            </span>
          ) : null}
          <InfoPopover label="About preview accuracy" align="left">
            {glActive
              ? `Every transition family previews in place — dissolves and their variants, dips, wipes, slides, pixelize and radial — blending in linear light the way the export does, and a video clip under a transition now holds its last frame. Grades preview in full, including gamma, sharpen and vignette and an effect clip’s. Still approximated: ducking previews unducked, the blur dissolve’s softness is a nine-tap stand-in for the export’s kernel, and a whiteboard clip’s drawn hand renders only in the export, while its board look (sketch, pencil, comic) previews as an SVG approximation of the export’s edge chain rather than the chain itself — the Sketch pattern previews its real traced strokes (a plain wipe stands in until the trace loads), and a whiteboard, text or reframe frame falls back to the older preview, which approximates more.`
              : `Dissolves, dips, wipes and slides preview in place; pixelize and radial preview as plain dissolves, and a video clip under a dissolve holds nothing where the export holds its last frame. Ducking and gamma/sharpen/vignette — including an effect clip’s — appear in the export. A whiteboard clip’s drawn hand renders in the export, and its board look (sketch, pencil, comic) previews only as an approximation of the export’s edge chain; the preview shows the reveal with a pen or marker glyph, and the Sketch pattern previews its real traced strokes (a plain wipe until the trace loads). The preview approximates all of these.`}
          </InfoPopover>
        </div>
      </div>

      {/* Audio elements are mounted but never shown — the preview's sound. */}
      {audioPlaced.map((placed) => (
        <audio
          key={placed.clip.id}
          ref={(element) => {
            audioRefs.current[placed.clip.id] = element;
          }}
          src={toMediaUrl(placed.clip.filePath)}
          preload="auto"
          className="hidden"
        />
      ))}
    </div>
  );
}

/**
 * S227 — how one transition family looks mid-window, as CSS.
 *
 * Dips and the geometric families (wipes, slides, circle open) are the same
 * arithmetic the export runs, so they preview exactly; the texture families
 * (pixelize, radial, circle close, and S230's dissolve variants) degrade to a
 * plain opacity ramp — a disclosed approximation, per the ⓘ. `progress` runs
 * (0, 1], landing on 1 at the window's final frame like the export's xfade.
 */
function boundaryVisual(
  type: ClipTransition,
  progress: number,
  params: ClipTransitionParams | undefined,
): {
  incoming: React.CSSProperties;
  veil?: { color: string; opacity: number };
} {
  const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
  switch (type) {
    case 'dip_to_color': {
      // S230 — exact: the veil is the authored colour and the same
      // half-in/half-out arithmetic the export's custom expression runs.
      const color = params?.colorHex ?? DIP_DEFAULT_COLOR_HEX;
      return {
        incoming: { opacity: Math.max(0, progress * 2 - 1) },
        veil: { color, opacity: 1 - Math.abs(progress * 2 - 1) },
      };
    }
    case 'flash_frame':
      // S230 — exact: the window *is* the flash; solid for its 1–3 frames.
      return {
        incoming: {},
        veil: { color: params?.colorHex ?? FLASH_DEFAULT_COLOR_HEX, opacity: 1 },
      };
    case 'fade_black':
    case 'fade_white': {
      // First half: the outgoing sinks into the colour. Second half: the
      // incoming rises out of it. The veil peaks at the midpoint. CSS
      // keywords, not tokens: this is the export's literal fade colour
      // (`fade=...:color=black|white`), not a themable surface.
      const color = type === 'fade_white' ? 'white' : 'black';
      return {
        incoming: { opacity: Math.max(0, progress * 2 - 1) },
        veil: { color, opacity: 1 - Math.abs(progress * 2 - 1) },
      };
    }
    case 'wipe_left':
      return { incoming: { clipPath: `inset(0 0 0 ${pct(1 - progress)})` } };
    case 'wipe_right':
      return { incoming: { clipPath: `inset(0 ${pct(1 - progress)} 0 0)` } };
    case 'wipe_up':
      return { incoming: { clipPath: `inset(${pct(1 - progress)} 0 0 0)` } };
    case 'wipe_down':
      return { incoming: { clipPath: `inset(0 0 ${pct(1 - progress)} 0)` } };
    case 'slide_left':
      return { incoming: { transform: `translateX(${pct(1 - progress)})` } };
    case 'slide_right':
      return { incoming: { transform: `translateX(-${pct(1 - progress)})` } };
    case 'slide_up':
      return { incoming: { transform: `translateY(${pct(1 - progress)})` } };
    case 'slide_down':
      return { incoming: { transform: `translateY(-${pct(1 - progress)})` } };
    case 'circle_open':
      return { incoming: { clipPath: `circle(${pct(progress * 0.75)} at 50% 50%)` } };
    default:
      // crossfade exactly; pixelize/radial/circle_close approximately.
      return { incoming: { opacity: progress } };
  }
}

/**
 * S278 — the Sketch reveal, painted for real.
 *
 * A 2D canvas at the time-map's own resolution (≤ 960 long edge, the frame's
 * aspect): per tick every pixel's alpha is `whiteboardTraceMaskAlpha(map,
 * progress)` — the preview-side statement of the export's `threshold` +
 * `gblur` — then the still is `source-in` composited, contain-fit exactly as
 * the export pads it. ~0.5M alpha writes per tick is a few milliseconds;
 * deliberately NOT the GL compositor, whose two-slot frame-graph is bounded
 * on purpose and would grow a third texture concept for one clip kind.
 */
function TraceRevealCanvas({
  artifact,
  stillUrl,
  progress,
  filter,
}: {
  artifact: WhiteboardTraceArtifact;
  stillUrl: string;
  progress: number;
  filter?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<ImageData | null>(null);
  /** Bumped when the still finishes decoding — the draw effect's wake-up. */
  const [imageTick, setImageTick] = useState(0);

  useEffect(() => {
    const image = new Image();
    image.src = stillUrl;
    image.onload = () => {
      imageRef.current = image;
      setImageTick((tick) => tick + 1);
    };
    return () => {
      image.onload = null;
      imageRef.current = null;
    };
  }, [stillUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height, map } = artifact;
    let mask = maskRef.current;
    if (mask?.width !== width || mask?.height !== height) {
      mask = context.createImageData(width, height);
      maskRef.current = mask;
    }
    // Unreachable — the branch above assigns whenever the ref was empty; this
    // states it for the type system.
    if (!mask) return;
    const data = mask.data;
    for (let i = 0; i < map.length; i += 1) {
      data[i * 4 + 3] = Math.round(whiteboardTraceMaskAlpha(map[i], progress) * 255);
    }
    context.clearRect(0, 0, width, height);
    context.putImageData(mask, 0, 0);
    // The still, contain-fit into the frame the way the export pads it, kept
    // only where the mask has revealed; the board shows through the rest.
    context.globalCompositeOperation = 'source-in';
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    context.globalCompositeOperation = 'source-over';
  }, [artifact, progress, imageTick]);

  return (
    <canvas
      ref={canvasRef}
      width={artifact.width}
      height={artifact.height}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ filter }}
    />
  );
}

/**
 * S237 — one draggable viewport rect. Position is the viewport centre in
 * source fractions; the box is `1/scale` of the frame on each axis, which is
 * exactly the crop the export samples. Pointer deltas convert through the
 * parent's own pixel size, and the centre clamps to the pannable range the
 * same way `motionAt` clamps it.
 */
function ReframeRect({
  label,
  viewpoint,
  className,
  onMove,
}: {
  label: string;
  viewpoint: { x: number; y: number; scale: number };
  className: string;
  onMove: (x: number, y: number) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; fromX: number; fromY: number } | null>(null);
  const half = 1 / (2 * Math.max(1, viewpoint.scale));
  const clampCentre = (value: number): number => Math.min(1 - half, Math.max(half, value));
  return (
    <div
      role="slider"
      aria-label={`Reframe ${label} position`}
      aria-valuetext={`${(viewpoint.x * 100).toFixed(0)}%, ${(viewpoint.y * 100).toFixed(0)}%`}
      tabIndex={0}
      className={`absolute z-30 cursor-move border-2 ${className}`}
      style={{
        left: `${((viewpoint.x - half) * 100).toFixed(2)}%`,
        top: `${((viewpoint.y - half) * 100).toFixed(2)}%`,
        width: `${(2 * half * 100).toFixed(2)}%`,
        height: `${(2 * half * 100).toFixed(2)}%`,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          fromX: viewpoint.x,
          fromY: viewpoint.y,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        const parent = event.currentTarget.parentElement;
        if (drag?.pointerId !== event.pointerId || !parent) return;
        const width = parent.clientWidth || 1;
        const height = parent.clientHeight || 1;
        onMove(
          clampCentre(drag.fromX + (event.clientX - drag.startX) / width),
          clampCentre(drag.fromY + (event.clientY - drag.startY) / height),
        );
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <span className="absolute left-1 top-0 text-xs font-bold">{label}</span>
    </div>
  );
}
