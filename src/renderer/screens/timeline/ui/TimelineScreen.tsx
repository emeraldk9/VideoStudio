import { useEffect, useRef } from 'react';

import {
  duplicateClips,
  findNextCut,
  findPreviousCut,
  framesToSeconds,
  insertFreezeFrame,
  layoutTrack,
  rippleDelete,
  snapTargets,
  splitAtFrame,
  timelineSnapTargets,
  transportDurationFrames,
  trimClipEdge,
  findGapAtFrame,
  closeTrackGap,
  slipClipMedia,
  rippleTrimToPlayhead,
  toggleDefaultTransition,
  createAdjustmentLayerClip,
} from '@shared';

import { useProjectStore } from '../../../entities/project';
import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { useModalStore } from '../../../shared/model/modalStore';

import {
  AudioMixerDock,
  ClipInspector,
  TimelinePanel,
  TimelineToolbar,
} from '../../../features/timeline-edit';
import { MediaPanel } from '../../../features/timeline-media';
import { ensureOverlayTrack } from '../../../features/timeline-media/lib/ensure-free-track';
import { TimelinePreview } from '../../../features/timeline-preview';
import { useVideoScopesStore } from '../../../features/timeline-preview/model/videoScopesStore';
import { WatermarkBatchModal } from '../../../features/watermark-removal';
import { Spinner } from '../../../shared/ui/Spinner';

import { TimelineWorkspace } from './TimelineWorkspace';
import { TopNavigation } from './TopNavigation';

/**
 * Beta S145 — the Timeline Editor Studio.
 *
 * Route-level composition only, per the FSD layering: the header, three
 * panels and the timeline itself, each owned by its own feature slice.
 *
 * **The workspace is always visible** (owner direction, 2026-08-12). The
 * screen guarantees a document rather than asking for one: on entry it opens
 * the project's most recent sequence, and creates one if the project has
 * none. There is no picker page and no empty-state page — a fresh project
 * lands in the full workspace with empty lanes, which is what "new sequence"
 * means here: an empty stage, not a different screen. This is the iMovie/
 * CapCut model, and it also spares every panel from growing a null-document
 * branch.
 */
export function TimelineScreen() {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const document = useSequenceStore((state) => state.document);
  const loading = useSequenceStore((state) => state.loading);
  const loadSequences = useSequenceStore((state) => state.loadSequences);
  const openSequence = useSequenceStore((state) => state.openSequence);
  const createSequence = useSequenceStore((state) => state.createSequence);
  const undo = useSequenceStore((state) => state.undo);
  const redo = useSequenceStore((state) => state.redo);
  const removeClips = useSequenceStore((state) => state.removeClips);
  const setPlaying = useSequenceStore((state) => state.setPlaying);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const setPlaybackRate = useSequenceStore((state) => state.setPlaybackRate);
  const requestFit = useSequenceStore((state) => state.requestFit);

  /**
   * Guards the auto-create against firing twice: `loadSequences` +
   * `createSequence` are async, and React 18 dev double-invokes effects. A
   * second visit-while-creating would otherwise mint two "Untitled sequence"
   * rows for one project.
   */
  const ensuring = useRef(false);

  useEffect(() => {
    if (!activeProjectId || ensuring.current) return;
    ensuring.current = true;
    void (async () => {
      try {
        await loadSequences(activeProjectId);
        const state = useSequenceStore.getState();
        // A document already open for this project survives navigation away
        // and back; don't reopen over it (that would discard the undo stack).
        if (state.document && state.sequences.some((item) => item.id === state.document?.sequence.id)) {
          return;
        }
        if (state.sequences.length > 0) {
          // Most recent — `list` orders by `updated_at DESC`.
          await openSequence(state.sequences[0].id);
        } else {
          await createSequence({
            projectId: activeProjectId,
            // H1 — born bound when a story episode is open; the assemble
            // panel adopts one at first fill otherwise.
            
            name: 'Untitled sequence',
          });
        }
      } finally {
        ensuring.current = false;
      }
    })();
  }, [activeProjectId, createSequence, loadSequences, openSequence]);

  /**
   * Transport and edit shortcuts — the §4.7 map, completed in Beta S151 (F5).
   *
   * Scoped to this screen and inert inside a text field — a timeline whose
   * spacebar plays while you are renaming a clip is a timeline that fights you.
   *
   * `J`/`K`/`L` is the shuttle every NLE has had since tape: repeated `L`
   * doubles forward speed, repeated `J` doubles reverse, `K` stops. It is
   * cheap here because the preview's clock is wall-clock derived — the rate is
   * a multiplier on elapsed time, not a second timing mechanism.
   *
   * `I`/`O` trim the selected clip's head/tail **to the playhead**, which is
   * the same operation the trim handles perform; both go through
   * `trimClipEdge` so they cannot disagree about clamping.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const state = useSequenceStore.getState();
      const fps = state.document?.sequence.fps ?? 24;
      // S157 — the transport's length, audio included, so Home/End and the
      // step clamps reach the end of an audio-only sequence.
      const duration = state.document
        ? transportDurationFrames(state.document.tracks, state.document.clips)
        : 0;
      const key = event.key.toLowerCase();

      if (event.key === ' ') {
        event.preventDefault();
        setPlaying(!state.playing);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      // S160 — Ctrl+Y, the Windows redo. Both bindings stay live; this build
      // is Windows-first but Cmd+Shift+Z remains the macOS reflex.
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      // S160 — select every clip on an unlocked track.
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault();
        if (state.document) {
          const unlocked = new Set(
            state.document.tracks.filter((track) => !track.locked).map((track) => track.id),
          );
          state.select(
            state.document.clips.filter((clip) => unlocked.has(clip.trackId)).map((clip) => clip.id),
          );
        }
        return;
      }
      // S27 — Ctrl+C / Cmd+C: Copy selected clips
      if ((event.ctrlKey || event.metaKey) && key === 'c' && !event.shiftKey) {
        event.preventDefault();
        state.copySelection();
        return;
      }
      // S27 — Ctrl+X / Cmd+X: Cut selected clips (Ctrl+Shift+X: Ripple Cut)
      if ((event.ctrlKey || event.metaKey) && key === 'x') {
        event.preventDefault();
        state.cutSelection(event.shiftKey);
        return;
      }
      // S27 — Ctrl+V / Cmd+V: Overwrite Paste (Ctrl+Shift+V: Ripple Insert Paste)
      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault();
        state.pasteClipboard({ ripple: event.shiftKey });
        return;
      }
      // S12 — Ctrl+D / Cmd+D: Duplicate selected clips
      if ((event.ctrlKey || event.metaKey) && key === 'd') {
        event.preventDefault();
        if (state.document && state.selectedClipIds.length > 0) {
          const { clips: next, duplicatedClips } = duplicateClips(
            state.document.clips,
            state.document.tracks,
            state.selectedClipIds,
            () => crypto.randomUUID(),
          );
          if (next !== state.document.clips) {
            state.commitClips(next);
            state.select(duplicatedClips.map((c) => c.id));
          }
        }
        return;
      }
      // S23 — Shift+D: Apply / toggle default transition (Cross Dissolve) on selected clips
      if (
        event.shiftKey &&
        (key === 'd' || key === 'D') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (state.document && state.selectedClipIds.length > 0) {
          let nextClips = state.document.clips;
          for (const id of state.selectedClipIds) {
            nextClips = toggleDefaultTransition(nextClips, id);
          }
          if (nextClips !== state.document.clips) {
            state.commitClips(nextClips);
          }
        }
        return;
      }
      // S29 — Shift+S: Toggle real-time audio scrubbing engine
      if (
        event.shiftKey &&
        (key === 's' || key === 'S') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        state.toggleAudioScrub();
        return;
      }
      // S31 — Shift+C: Toggle broadcast video scopes (Waveform, Parade, Vectorscope)
      if (
        event.shiftKey &&
        (key === 'c' || key === 'C') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        useVideoScopesStore.getState().toggleIsOpen();
        return;
      }
      // S21 — Ctrl+R / Cmd+R: Open Speed / Duration retiming modal
      if ((event.ctrlKey || event.metaKey) && key === 'r' && state.selectedClipIds.length > 0) {
        event.preventDefault();
        useModalStore.getState().openModal('speed');
        return;
      }
      // S67 — Alt+K: Toggle track automation curve lane on selected clip(s)
      if (
        event.altKey &&
        (key === 'k' || key === 'K') &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        for (const id of state.selectedClipIds) {
          window.dispatchEvent(
            new CustomEvent('toggle-clip-automation', {
              detail: { clipId: id },
            }),
          );
        }
        return;
      }
      // S72 — Alt+R: Toggle in-clip speed ramp Bézier curve editor on selected clip(s)
      if (
        event.altKey &&
        (key === 'r' || key === 'R') &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        for (const id of state.selectedClipIds) {
          window.dispatchEvent(
            new CustomEvent('toggle-clip-speed-ramp', {
              detail: { clipId: id },
            }),
          );
        }
        return;
      }
      // S12 — Alt+F: Freeze frame at playhead
      if (event.altKey && key === 'f') {
        event.preventDefault();
        if (state.document && state.selectedClipIds.length === 1) {
          const clip = state.document.clips.find((c) => c.id === state.selectedClipIds[0]);
          if (clip && clip.sourceKind === 'video' && clip.filePath) {
            const track = state.document.tracks.find((t) => t.id === clip.trackId);
            if (track) {
              const placed = layoutTrack(state.document.clips, track).find((p) => p.clip.id === clip.id);
              const frame = state.playheadFrame;
              if (placed && frame > placed.startFrames && frame < placed.endFrames) {
                const offset = frame - placed.startFrames;
                const sourceIn = placed.clip.sourceInFrames ?? 0;
                const atSeconds = framesToSeconds(sourceIn + offset, fps);
                void window.api.sequence
                  .captureFrame({
                    sourcePath: clip.filePath,
                    atSeconds,
                    sequenceId: state.document.sequence.id,
                  })
                  .then((capture) => {
                    if (!capture?.imagePath) return;
                    const freezeDurationFrames = Math.round(3 * fps);
                    const res = insertFreezeFrame(
                      state.document!.clips,
                      track,
                      clip.id,
                      frame,
                      capture.imagePath,
                      freezeDurationFrames,
                      {
                        splitId: crypto.randomUUID(),
                        freezeId: crypto.randomUUID(),
                      },
                    );
                    if (res) {
                      state.commitClips(res.clips);
                      state.select([res.freezeClip.id]);
                    }
                  });
              }
            }
          }
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedClipIds.length > 0) {
        event.preventDefault();
        // S160 — Shift+Delete ripples: the clips go *and* the time they held.
        if (event.shiftKey && state.document) {
          state.commitClips(
            rippleDelete(state.document.clips, state.document.tracks, state.selectedClipIds),
          );
          state.select([]);
          return;
        }
        removeClips(state.selectedClipIds);
        return;
      }

      // S17 — Shift+Delete / Shift+Backspace with NO clips selected closes the gap under the playhead
      if ((event.key === 'Delete' || event.key === 'Backspace') && event.shiftKey && state.selectedClipIds.length === 0 && state.document) {
        event.preventDefault();
        const frame = currentPlayheadFrame();
        for (const track of state.document.tracks) {
          if (track.locked || track.magnetic) continue;
          const gap = findGapAtFrame(state.document.clips, track, frame);
          if (gap) {
            const next = closeTrackGap(state.document.clips, track, gap);
            if (next !== state.document.clips) {
              state.commitClips(next);
              return;
            }
          }
        }
        return;
      }

      // S14 — Shift+M / Alt+M: Jump to Next / Previous marker
      if (key === 'm' && (event.shiftKey || event.altKey) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (state.markers.length > 0) {
          const markerFrames = state.markers.map((m) => m.frame);
          const from = currentPlayheadFrame();
          setPlaying(false);
          if (event.altKey) {
            setPlayhead(findPreviousCut(markerFrames, from));
          } else {
            setPlayhead(findNextCut(markerFrames, from, duration));
          }
        }
        return;
      }

      // S160 (owner item 8) — tool selection, the Premiere letters. Bare
      // keypresses, so they sit before the shuttle/step block only by not
      // colliding with it.
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        // S21 — `Q`: Ripple trim head to playhead
        if (key === 'q' && state.document) {
          event.preventDefault();
          const next = rippleTrimToPlayhead(
            state.document.clips,
            state.document.tracks,
            currentPlayheadFrame(),
            'head',
            state.selectedClipIds,
          );
          if (next !== state.document.clips) state.commitClips(next);
          return;
        }
        // S21 — `W`: Ripple trim tail to playhead
        if (key === 'w' && state.document) {
          event.preventDefault();
          const next = rippleTrimToPlayhead(
            state.document.clips,
            state.document.tracks,
            currentPlayheadFrame(),
            'tail',
            state.selectedClipIds,
          );
          if (next !== state.document.clips) state.commitClips(next);
          return;
        }
        if (key === 'v') {
          event.preventDefault();
          state.setToolMode('select');
          return;
        }
        if (key === 'c') {
          event.preventDefault();
          state.setToolMode('split');
          return;
        }
        if (key === 'b') {
          event.preventDefault();
          state.setToolMode('ripple');
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          state.setToolMode('roll');
          return;
        }
        if (key === 'a') {
          event.preventDefault();
          state.setToolMode(event.shiftKey ? 'select-left' : 'select-right');
          return;
        }
        if (event.key === 'Escape') {
          // Esc clears the selection and comes home to the select tool —
          // the standard bail-out in every NLE.
          event.preventDefault();
          state.setToolMode('select');
          state.select([]);
          return;
        }
        // S160 / S14 — `M` drops a marker at the playhead; if marker exists, opens editor
        if (key === 'm') {
          event.preventDefault();
          const frame = currentPlayheadFrame();
          const existing = state.markers.find((m) => Math.abs(m.frame - frame) <= 0.5);
          if (existing) {
            state.setEditingMarkerId(existing.id);
          } else {
            void state.addMarker(frame);
          }
          return;
        }
        // S27 — `;` (semicolon): Lift work area (leaves gap)
        if (event.key === ';') {
          event.preventDefault();
          state.liftWorkArea();
          return;
        }
        // S27 — `'` (apostrophe): Extract work area (ripples timeline backward)
        if (event.key === "'") {
          event.preventDefault();
          state.extractWorkArea();
          return;
        }
        // S22 — `G`: Open Audio Gain & Fades modal for selected clip
        if (key === 'g' && state.selectedClipIds.length > 0) {
          event.preventDefault();
          useModalStore.getState().openModal('audio-gain');
          return;
        }
      }

      // S13 — Up/Down Arrow: Jump playhead to previous/next edit cut point or marker
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (state.document) {
          const clipTargets = snapTargets(state.document.tracks, state.document.clips);
          const markerFrames = state.markers.map((m) => m.frame);
          const allTargets = timelineSnapTargets({
            base: clipTargets,
            markerFrames,
            playheadFrame: null,
            sequenceEndFrame: duration,
          });
          const from = currentPlayheadFrame();
          setPlaying(false);
          if (event.key === 'ArrowUp') {
            setPlayhead(findPreviousCut(allTargets, from));
          } else {
            setPlayhead(findNextCut(allTargets, from, duration));
          }
        }
        return;
      }

      // S13 — `[` / `]`: Nudge selected clip(s) gain by ±1 dB
      if ((key === '[' || key === ']') && state.selectedClipIds.length > 0 && state.document) {
        event.preventDefault();
        const deltaDb = key === ']' ? 1 : -1;
        state.patchClipsWith(state.selectedClipIds, (clip) => {
          const currentGain = clip.gainDb ?? 0;
          const nextGain = Math.min(12, Math.max(-60, currentGain + deltaDb));
          return { gainDb: nextGain };
        });
        return;
      }

      // S19 — Alt+ArrowLeft / Alt+ArrowRight slips media inside selected clip
      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && state.selectedClipIds.length === 1 && state.document) {
        event.preventDefault();
        const selectedId = state.selectedClipIds[0];
        const targetClip = state.document.clips.find((c) => c.id === selectedId);
        if (targetClip && (targetClip.sourceKind === 'video' || targetClip.sourceKind === 'audio') && targetClip.filePath) {
          const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1);
          const next = slipClipMedia(targetClip, delta);
          state.patchClip(targetClip.id, {
            sourceInFrames: next.sourceInFrames,
            sourceOutFrames: next.sourceOutFrames,
          });
          return;
        }
      }

      // Step. One frame, or one second with Shift — the pairing every editor
      // expects, and the reason the playhead is stored in frames at all.
      // `currentPlayheadFrame` rather than the store: during playback the
      // store holds where play *started* (Beta S151 H2), and stepping from
      // there instead of from the visible playhead would jump backwards.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = (event.shiftKey ? fps : 1) * (event.key === 'ArrowLeft' ? -1 : 1);
        const from = currentPlayheadFrame();
        setPlaying(false);
        setPlayhead(Math.min(duration, Math.max(0, from + step)));
        return;
      }
      // S20 — Loop Playback toggle: Ctrl+L / Cmd+L
      if ((event.ctrlKey || event.metaKey) && key === 'l') {
        event.preventDefault();
        state.toggleLooping();
        return;
      }

      // S20 — Clear In/Out points: Alt+X, or Alt+I (clear in), Alt+O (clear out)
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'x') {
          event.preventDefault();
          state.clearInOutPoints();
          return;
        }
        if (key === 'i') {
          event.preventDefault();
          state.setInPoint(null);
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          state.setOutPoint(null);
          return;
        }
        // S62 — Add Adjustment Layer: Alt+A
        if (key === 'a') {
          event.preventDefault();
          const doc = state.document;
          if (!doc) return;
          const fps = doc.sequence.fps;
          const startFrames = currentPlayheadFrame();
          const durationFrames = Math.max(1, Math.round(fps * 5));
          void ensureOverlayTrack('Adjustment Layers', startFrames, durationFrames).then((trackId) => {
            const fresh = useSequenceStore.getState();
            if (!trackId || !fresh.document) return;
            const newClip = createAdjustmentLayerClip({
              sequenceId: fresh.document.sequence.id,
              trackId,
              startFrames,
              durationFrames,
              orderIndex: fresh.document.clips.filter((c) => c.trackId === trackId).length,
            });
            fresh.commitClips([...fresh.document.clips, newClip]);
            fresh.select([newClip.id]);
          });
          return;
        }
        // S64 — Create Compound Clip: Alt+G (or Alt+Shift+G for Decompose)
        if (key === 'g') {
          event.preventDefault();
          if (event.shiftKey) {
            const selIds = state.selectedClipIds;
            if (selIds.length === 1) {
              state.decomposeCompoundClip(selIds[0]);
            }
          } else {
            if (state.selectedClipIds.length > 0) {
              void state.createCompoundClipFromSelection();
            }
          }
          return;
        }
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setPlayhead(event.key === 'Home' ? (state.inPointFrame ?? 0) : (state.outPointFrame ?? duration));
        return;
      }

      // Shuttle. Each press compounds from the current rate rather than
      // cycling a fixed list, so J-J-L lands back at 1x reverse the way a jog
      // wheel would.
      if (key === 'j' || key === 'l') {
        event.preventDefault();
        const forward = key === 'l';
        const current = state.playing ? state.playbackRate : 0;
        const next = forward
          ? current >= 1
            ? current * 2
            : 1
          : current <= -1
            ? current * 2
            : -1;
        setPlaybackRate(next);
        setPlaying(true);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        setPlaying(false);
        return;
      }

      // Fit the whole sequence to the panel. The panel measures itself; this
      // only asks.
      if (key === 'z' && event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        requestFit();
        return;
      }

      // `S` — split at the playhead. S160 widened it from the spine to the
      // cut: the selection when there is one, every unlocked track's clip
      // under the playhead otherwise. A cut at a boundary returns null and
      // nothing happens, which is the correct blade behaviour rather than an
      // error worth announcing.
      if (key === 's' && !event.ctrlKey && !event.metaKey && state.document) {
        const split = splitAtFrame(
          state.document.clips,
          state.document.tracks,
          currentPlayheadFrame(),
          state.selectedClipIds,
          () => crypto.randomUUID(),
        );
        if (split) {
          event.preventDefault();
          state.commitClips(split);
        }
        return;
      }

      // In / out: If 1 clip is selected, trims that clip's edge.
      // S20: If NO clips are selected, marks timeline Work Area In / Out!
      if ((key === 'i' || key === 'o') && !event.ctrlKey && !event.metaKey && !event.altKey && state.document) {
        if (state.selectedClipIds.length === 1) {
          const clipId = state.selectedClipIds[0];
          const clip = state.document.clips.find((item) => item.id === clipId);
          if (!clip) return;
          const clipTrack = state.document.tracks.find((item) => item.id === clip.trackId);
          if (!clipTrack || clipTrack.locked) return;
          const placed = layoutTrack(state.document.clips, clipTrack).find(
            (item) => item.clip.id === clipId,
          );
          if (!placed) return;
          const edge = key === 'i' ? 'start' : 'end';
          const from = edge === 'start' ? placed.startFrames : placed.endFrames;
          const next = trimClipEdge(state.document.clips, clipId, edge, currentPlayheadFrame() - from);
          if (next !== state.document.clips) {
            event.preventDefault();
            state.commitClips(next);
          }
          return;
        }
        if (state.selectedClipIds.length === 0) {
          event.preventDefault();
          const frame = currentPlayheadFrame();
          if (key === 'i') {
            state.setInPoint(frame);
          } else {
            state.setOutPoint(frame);
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, removeClips, requestFit, setPlaybackRate, setPlayhead, setPlaying, undo]);

  // Only while the guaranteed document is still on its way (first visit, or a
  // project switch). Never a page of its own — a frame of spinner, then the
  // workspace.
  if (!document) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TopNavigation />
        <div className="flex flex-1 items-center justify-center">
          {loading || activeProjectId ? (
            <Spinner size="md" />
          ) : (
            <p className="text-sm text-text-disabled">Open a project to edit its timeline.</p>
          )}
        </div>
        <WatermarkBatchModal />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopNavigation />
      <div className="min-h-0 flex-1">
        <TimelineWorkspace
          media={
            /* The pool's grid owns its own scrolling; the column does not
               scroll as a whole. `RenderPanel` rides in through the slot —
               `timeline-media` and `timeline-render` are siblings and compose
               here, at the screen, never through each other. */
            <MediaPanel />
          }
          player={
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-1">
              <TimelinePreview />
            </div>
          }
          inspector={
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-2">
              <ClipInspector />
            </div>
          }
          dock={
            <>
              <TimelineToolbar />
              <TimelinePanel />
              <AudioMixerDock />
            </>
          }
        />
      </div>
      {/*
        Beta S353 — mounted by the screen, not by `ModalHost`.

        Since S313 the Timeline is **window-only**: it renders under
        `DetachedApp`, which deliberately mounts no `AppLayout` and therefore no
        `ModalHost`. So the media pool's and the clip menu's "Remove watermark"
        set `activeModal` in this window's own store and nothing rendered a
        dialog for it — the press did nothing at all.

        Mounting it here rather than teaching `DetachedApp` to mount `ModalHost`
        is deliberate twice over. `ModalHost` carries every globally-reachable
        dialog, including `CrashRecoveryDialog`, which self-gates on its own
        fetch — a second window mounting all of them would double those fetches
        and could show one dialog in two places. And this dialog in particular
        *must* live in the same window as the sequence store it re-points on a
        derive: `relinkOpenSequence` reads `useSequenceStore.getState()`, and a
        copy in the main window would relink a document that is not open there.

        It self-gates on `activeModal`, so mounting it unconditionally costs a
        component that renders a closed `Modal` — the same contract `ModalHost`
        relies on. Precedent: S273's stages mount their own dialogs for the same
        reason.
      */}
      <WatermarkBatchModal />
    </div>
  );
}
