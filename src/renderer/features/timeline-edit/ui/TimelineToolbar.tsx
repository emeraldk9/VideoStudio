import { useMemo } from 'react';

import {
  deleteToPlayhead,
  duplicateClips,
  framesToSeconds,
  insertFreezeFrame,
  layoutTrack,
  rippleDelete,
  separateClipAudio,
  splitAtFrame,
  findGapAtFrame,
  closeTrackGap,
  closeAllGapsAcrossTracks,
  rippleTrimToPlayhead,
  toggleDefaultTransition,
  computeMasterStereoLevels,
  computeTrackStereoLevels,
  dbToMeterPercent,
  createAdjustmentLayerClip,
  BUS_MASTER,
  DEFAULT_SUBMIX_BUSES,
  resolveTrackBus,
  computeSubmixBusLevels,
  computeMasterWithBuses,
  type StereoMeterLevels,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { useModalStore } from '../../../shared/model/modalStore';
import { IconButton } from '../../../shared/ui/IconButton';
import { MenuButton } from '../../../shared/ui/MenuButton';
import { ensureOverlayTrack } from '../../timeline-media/lib/ensure-free-track';

import { MagnetIcon } from './MagnetIcon';
import { SequenceTabs } from './SequenceTabs';
import { useAudioMixerStore } from '../model/audioMixerStore';

/**
 * Beta S157 — the dock's toolbar: one row above the lanes holding everything
 * that used to be scattered around the timeline.
 *
 * - The sequence tabs (S154's `SequenceTabs`, now a child rather than the row
 *   itself).
 * - The zoom cluster (owner item 14), right-aligned: −/slider/+/fit. The
 *   slider works in **log space** over the store's own 4–400 px/s clamp — a
 *   linear slider spends half its travel between 200 and 400 where the
 *   difference is invisible, while zoom perception is ratio-shaped.
 * - The fps · geometry chip, formerly the screen header's only survivor. It
 *   stays display-only here; Phase G gives geometry a real editor in the
 *   export panel.
 */

/** S160 — the pointer tools, in toolbar order. Icons + shortcut in the label. */
const TOOLS = [
  { mode: 'select', icon: 'arrow_selector_tool', label: 'Select tool (V)' },
  { mode: 'split', icon: 'content_cut', label: 'Split tool (C)' },
  { mode: 'ripple', icon: 'swap_horiz', label: 'Ripple Edit tool (B)' },
  { mode: 'roll', icon: 'view_column', label: 'Rolling Edit tool (N)' },
  { mode: 'select-right', icon: 'keyboard_double_arrow_right', label: 'Select rightward (A)' },
  { mode: 'select-left', icon: 'keyboard_double_arrow_left', label: 'Select leftward (Shift+A)' },
] as const;

const MIN_PPS = 4;
const MAX_PPS = 400;
const LOG_MIN = Math.log(MIN_PPS);
const LOG_MAX = Math.log(MAX_PPS);

/** One wheel-notch of the panel's Ctrl+wheel gesture — the buttons match it. */
const ZOOM_STEP = 1.15;

/** S29 — Compact Master Bus Stereo Peak Meter with clickable Mixer Console toggle */
function CompactMasterVuMeter() {
  const isPlaying = useSequenceStore((s) => s.playing);
  const audioScrubEnabled = useSequenceStore((s) => s.audioScrubEnabled);
  const playheadFrame = useSequenceStore((s) => s.playheadFrame);
  const document = useSequenceStore((s) => s.document);

  const masterVolumeDb = useAudioMixerStore((s) => s.masterVolumeDb);
  const masterLimiter = useAudioMixerStore((s) => s.masterLimiter);
  const trackMixer = useAudioMixerStore((s) => s.trackMixer);
  const trackBusRouting = useAudioMixerStore((s) => s.trackBusRouting);
  const submixBuses = useAudioMixerStore((s) => s.submixBuses);
  const masterCompressor = useAudioMixerStore((s) => s.masterCompressor);
  const toggleMixer = useAudioMixerStore((s) => s.toggleIsOpen);

  const tracks = document?.tracks ?? [];
  const clips = document?.clips ?? [];

  const masterLevels = useMemo(() => {
    if (!document || (!isPlaying && !audioScrubEnabled)) {
      return { leftDb: -60, rightDb: -60, peakDb: -60, isClipping: false };
    }

    const isSoloEngaged = Object.values(trackMixer).some((t) => t.solo);
    const trackLevelsMap: Record<string, StereoMeterLevels> = {};
    for (const track of tracks) {
      trackLevelsMap[track.id] = computeTrackStereoLevels({
        track,
        clips,
        playheadFrame,
        trackMixerState: trackMixer[track.id],
        isSoloEngaged,
      });
    }

    const busLevels = computeSubmixBusLevels({
      trackLevels: trackLevelsMap,
      tracks,
      routingMap: trackBusRouting,
      busStates: submixBuses,
      buses: DEFAULT_SUBMIX_BUSES,
    });

    const unrouted = tracks
      .filter((t) => resolveTrackBus(t, trackBusRouting) === BUS_MASTER)
      .map((t) => trackLevelsMap[t.id])
      .filter(Boolean);

    const res = computeMasterWithBuses({
      busLevels,
      busStates: submixBuses,
      unroutedTrackLevels: unrouted,
      masterVolumeDb,
      masterLimiter,
      masterCompressor,
    });

    return res.masterLevels;
  }, [
    document,
    tracks,
    clips,
    playheadFrame,
    trackMixer,
    trackBusRouting,
    submixBuses,
    masterCompressor,
    masterVolumeDb,
    masterLimiter,
    isPlaying,
    audioScrubEnabled,
  ]);

  const leftPct = dbToMeterPercent(masterLevels.leftDb);
  const rightPct = dbToMeterPercent(masterLevels.rightDb);
  const peakDb = Math.max(masterLevels.leftDb, masterLevels.rightDb);
  const isClipping = peakDb >= 0;

  return (
    <button
      type="button"
      onClick={toggleMixer}
      title={`Master Bus VU: ${peakDb > -60 ? peakDb.toFixed(1) + ' dB' : '-∞ dB'} (Click to toggle Audio Mixer Console)`}
      aria-label="Master audio peak meter"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-card border border-hairline bg-bg-canvas/90 hover:border-accent-ai/50 transition-colors h-7 select-none cursor-pointer"
    >
      <div className="flex items-end gap-0.5 h-4 w-3 bg-black/70 p-[1px] rounded-sm">
        {/* Left channel */}
        <div className="relative w-1 h-full bg-slate-800 rounded-[1px] overflow-hidden flex flex-col justify-end">
          <div
            className="w-full transition-[height] duration-75 ease-out rounded-[1px]"
            style={{
              height: `${leftPct}%`,
              backgroundColor:
                masterLevels.leftDb >= 0 ? '#ef4444' : masterLevels.leftDb >= -3 ? '#eab308' : '#22c55e',
            }}
          />
        </div>
        {/* Right channel */}
        <div className="relative w-1 h-full bg-slate-800 rounded-[1px] overflow-hidden flex flex-col justify-end">
          <div
            className="w-full transition-[height] duration-75 ease-out rounded-[1px]"
            style={{
              height: `${rightPct}%`,
              backgroundColor:
                masterLevels.rightDb >= 0 ? '#ef4444' : masterLevels.rightDb >= -3 ? '#eab308' : '#22c55e',
            }}
          />
        </div>
      </div>
      <span
        className={`text-[10px] font-mono tabular-nums font-semibold ${
          isClipping ? 'text-red-500 font-bold' : 'text-text-muted'
        }`}
      >
        {peakDb <= -59
          ? '-∞'
          : `${peakDb > 0 ? '+' : ''}${peakDb.toFixed(0)}`}
      </span>
    </button>
  );
}

export function TimelineToolbar() {
  const document = useSequenceStore((state) => state.document);
  const pixelsPerSecond = useSequenceStore((state) => state.pixelsPerSecond);
  const setZoom = useSequenceStore((state) => state.setZoom);
  const snapEnabled = useSequenceStore((state) => state.snapEnabled);
  const setSnapEnabled = useSequenceStore((state) => state.setSnapEnabled);
  const requestFit = useSequenceStore((state) => state.requestFit);
  const undo = useSequenceStore((state) => state.undo);
  const redo = useSequenceStore((state) => state.redo);
  const canUndo = useSequenceStore((state) => state.undoStack.length > 0);
  const canRedo = useSequenceStore((state) => state.redoStack.length > 0);
  const toolMode = useSequenceStore((state) => state.toolMode);
  const setToolMode = useSequenceStore((state) => state.setToolMode);
  const hasSelection = useSequenceStore((state) => state.selectedClipIds.length > 0);
  const hasClips = useSequenceStore((state) => (state.document?.clips.length ?? 0) > 0);
  const hasClipboard = useSequenceStore((state) => state.timelineClipboard !== null);
  const inPointFrame = useSequenceStore((state) => state.inPointFrame);
  const outPointFrame = useSequenceStore((state) => state.outPointFrame);
  const isMixerOpen = useAudioMixerStore((state) => state.isOpen);
  const toggleMixer = useAudioMixerStore((state) => state.toggleIsOpen);

  if (!document) return null;

  const sliderValue = (Math.log(pixelsPerSecond) - LOG_MIN) / (LOG_MAX - LOG_MIN);

  /**
   * The command buttons act on live state via `getState()` — a toolbar click
   * is an event, and subscribing this component to clips/tracks for handlers'
   * sake would re-render the whole bar per drag frame.
   */
  const runSplit = () => {
    const state = useSequenceStore.getState();
    if (!state.document) return;
    const next = splitAtFrame(
      state.document.clips,
      state.document.tracks,
      currentPlayheadFrame(),
      state.selectedClipIds,
      () => crypto.randomUUID(),
    );
    if (next) state.commitClips(next);
  };

  const runDeleteSide = (side: 'left' | 'right') => {
    const state = useSequenceStore.getState();
    if (!state.document) return;
    const next = rippleTrimToPlayhead(
      state.document.clips,
      state.document.tracks,
      currentPlayheadFrame(),
      side === 'left' ? 'head' : 'tail',
      state.selectedClipIds,
    );
    if (next !== state.document.clips) state.commitClips(next);
  };

  const runDelete = (ripple: boolean) => {
    const state = useSequenceStore.getState();
    if (!state.document || state.selectedClipIds.length === 0) return;
    if (ripple) {
      state.commitClips(
        rippleDelete(state.document.clips, state.document.tracks, state.selectedClipIds),
      );
      state.select([]);
      return;
    }
    state.removeClips(state.selectedClipIds);
  };

  const selectedClips = useMemo(() => {
    if (!document) return [];
    const set = new Set(useSequenceStore.getState().selectedClipIds);
    return document.clips.filter((c) => set.has(c.id));
  }, [document]);

  const canSeparate = selectedClips.some((c) => c.sourceKind === 'video' && c.filePath);

  const runDuplicate = () => {
    const state = useSequenceStore.getState();
    if (!state.document || state.selectedClipIds.length === 0) return;
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
  };

  const runToggleTransition = () => {
    const state = useSequenceStore.getState();
    if (!state.document || state.selectedClipIds.length === 0) return;
    let nextClips = state.document.clips;
    for (const id of state.selectedClipIds) {
      nextClips = toggleDefaultTransition(nextClips, id);
    }
    if (nextClips !== state.document.clips) {
      state.commitClips(nextClips);
    }
  };

  const runSeparate = () => {
    const state = useSequenceStore.getState();
    if (!state.document) return;
    const targetVideo = state.document.clips.find(
      (c) => state.selectedClipIds.includes(c.id) && c.sourceKind === 'video' && c.filePath,
    );
    if (!targetVideo) return;
    const res = separateClipAudio(
      state.document.clips,
      state.document.tracks,
      targetVideo.id,
      () => crypto.randomUUID(),
    );
    if (res) {
      state.commitClips(res.clips);
      state.select([res.createdClip.id]);
    }
  };

  const runFreeze = async () => {
    const state = useSequenceStore.getState();
    if (!state.document) return;
    const targetVideo = state.document.clips.find(
      (c) => state.selectedClipIds.includes(c.id) && c.sourceKind === 'video' && c.filePath,
    );
    if (!targetVideo) return;
    const track = state.document.tracks.find((t) => t.id === targetVideo.trackId);
    if (!track) return;
    const placed = layoutTrack(state.document.clips, track).find((p) => p.clip.id === targetVideo.id);
    const frame = currentPlayheadFrame();
    if (!placed || frame <= placed.startFrames || frame >= placed.endFrames) return;

    const fps = state.document.sequence.fps;
    const offset = frame - placed.startFrames;
    const sourceIn = placed.clip.sourceInFrames ?? 0;
    const atSeconds = framesToSeconds(sourceIn + offset, fps);

    const capture = await window.api.sequence.captureFrame({
      sourcePath: targetVideo.filePath!,
      atSeconds,
      sequenceId: state.document.sequence.id,
    });

    if (!capture?.imagePath) return;

    const freezeDurationFrames = Math.round(3 * fps);
    const res = insertFreezeFrame(
      state.document.clips,
      track,
      targetVideo.id,
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
  };

  return (
    <div className="flex h-[38px] items-center gap-2 border-b border-hairline bg-bg-app px-2.5 select-none">
      <SequenceTabs />

      {/* S160 — the edit-tool cluster. Undo/redo mirror the (full-document,
          S160) history stacks; disabled is the honest empty-stack state. */}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-hairline" />
      <IconButton icon="undo" label="Undo (Ctrl+Z)" size="sm" disabled={!canUndo} onClick={undo} />
      <IconButton icon="redo" label="Redo (Ctrl+Y)" size="sm" disabled={!canRedo} onClick={redo} />

      {/* The pointer tools — a visible group rather than a dropdown, so the
          active tool is always readable at a glance. `filled` marks it. */}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-hairline" />
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.mode}
            icon={tool.icon}
            label={tool.label}
            size="sm"
            filled={toolMode === tool.mode}
            tone={toolMode === tool.mode ? 'primary' : 'default'}
            onClick={() => setToolMode(tool.mode)}
          />
        ))}
      </div>

      {/* The edit commands, CapCut's set: split, the two playhead trims,
          delete, marker. Commands, not modes — each acts once at the
          playhead and changes no gesture. */}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-hairline" />
      <IconButton icon="vertical_split" label="Split at playhead (S)" size="sm" disabled={!hasClips} onClick={runSplit} />
      <IconButton
        icon="backspace"
        label="Ripple trim start to playhead (Q)"
        size="sm"
        disabled={!hasClips}
        onClick={() => runDeleteSide('left')}
      />
      <IconButton
        icon="backspace"
        label="Ripple trim end to playhead (W)"
        size="sm"
        disabled={!hasClips}
        className="[&>span]:-scale-x-100"
        onClick={() => runDeleteSide('right')}
      />
      <IconButton
        icon="speed"
        label="Speed / Duration (Ctrl+R)"
        size="sm"
        disabled={!hasSelection}
        onClick={() => useModalStore.getState().openModal('speed')}
      />
      <IconButton
        icon="graphic_eq"
        label="Audio Gain & Fades (G)"
        size="sm"
        disabled={!hasSelection}
        onClick={() => useModalStore.getState().openModal('audio-gain')}
      />
      <IconButton
        icon="content_copy"
        label="Duplicate selection (Ctrl+D)"
        size="sm"
        disabled={!hasSelection}
        onClick={runDuplicate}
      />
      <IconButton
        icon="auto_awesome_motion"
        label="Apply default transition (Shift+D)"
        size="sm"
        disabled={!hasSelection}
        onClick={runToggleTransition}
      />
      <IconButton
        icon="call_split"
        label="Separate audio from video"
        size="sm"
        disabled={!canSeparate}
        onClick={runSeparate}
      />
      <IconButton
        icon="ac_unit"
        label="Freeze frame at playhead (Alt+F)"
        size="sm"
        disabled={!canSeparate}
        onClick={() => void runFreeze()}
      />
      <IconButton
        icon="delete"
        label="Delete selection (Del)"
        size="sm"
        disabled={!hasSelection}
        onClick={() => runDelete(false)}
      />

      {/* S27 — Clipboard Cluster: Cut / Copy / Paste / Insert Paste */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
        <IconButton
          icon="content_cut"
          label="Cut (Ctrl+X) · Ripple Cut (Ctrl+Shift+X)"
          size="sm"
          disabled={!hasSelection}
          onClick={() => useSequenceStore.getState().cutSelection(false)}
        />
        <IconButton
          icon="copy_all"
          label="Copy (Ctrl+C)"
          size="sm"
          disabled={!hasSelection}
          onClick={() => useSequenceStore.getState().copySelection()}
        />
        <IconButton
          icon="content_paste"
          label="Paste at playhead (Ctrl+V)"
          size="sm"
          disabled={!hasClipboard}
          onClick={() => useSequenceStore.getState().pasteClipboard({ ripple: false })}
        />
        <IconButton
          icon="content_paste_go"
          label="Ripple Insert Paste at playhead (Ctrl+Shift+V)"
          size="sm"
          disabled={!hasClipboard}
          onClick={() => useSequenceStore.getState().pasteClipboard({ ripple: true })}
        />
      </div>
      {/* Marker cluster: 1-click Add/Edit + Quick Color Palette */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
        <IconButton
          icon="bookmark_add"
          label="Add marker (M)"
          size="sm"
          onClick={() => {
            const state = useSequenceStore.getState();
            const frame = currentPlayheadFrame();
            const existing = state.markers.find((m) => Math.abs(m.frame - frame) <= 0.5);
            if (existing) {
              state.setEditingMarkerId(existing.id);
            } else {
              void state.addMarker(frame);
            }
          }}
        />
        <MenuButton
          icon="arrow_drop_down"
          label="Marker color palette"
          size="sm"
          items={[
            {
              label: 'Add Indigo (AI) marker',
              onSelect: () => void useSequenceStore.getState().addMarker(currentPlayheadFrame(), { color: 'ai' }),
            },
            {
              label: 'Add Green (Ready / Sync) marker',
              onSelect: () => void useSequenceStore.getState().addMarker(currentPlayheadFrame(), { color: 'success', name: 'Sync' }),
            },
            {
              label: 'Add Amber (Review) marker',
              onSelect: () => void useSequenceStore.getState().addMarker(currentPlayheadFrame(), { color: 'warning', name: 'Review' }),
            },
            {
              label: 'Add Sky (Info) marker',
              onSelect: () => void useSequenceStore.getState().addMarker(currentPlayheadFrame(), { color: 'info', name: 'Info' }),
            },
          ]}
        />
      </div>

      {/* S17 — Gap Management Cluster: Close Gap at Playhead + Close All Gaps */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
        <IconButton
          icon="space_bar"
          label="Close gap at playhead (Shift+Del)"
          size="sm"
          disabled={!hasClips}
          onClick={() => {
            const state = useSequenceStore.getState();
            if (!state.document) return;
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
          }}
        />
        <MenuButton
          icon="arrow_drop_down"
          label="Gap closure options"
          size="sm"
          disabled={!hasClips}
          items={[
            {
              label: 'Close gap at playhead (Shift+Del)',
              onSelect: () => {
                const state = useSequenceStore.getState();
                if (!state.document) return;
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
              },
            },
            {
              label: 'Close all gaps across timeline',
              onSelect: () => {
                const state = useSequenceStore.getState();
                if (!state.document) return;
                const next = closeAllGapsAcrossTracks(state.document.clips, state.document.tracks, true);
                if (next !== state.document.clips) state.commitClips(next);
              },
            },
          ]}
        />
      </div>

      {/* S20 — Work Area (In/Out) Cluster */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
        <IconButton
          icon="start"
          label={inPointFrame !== null ? `Mark In (${inPointFrame}f) (I)` : 'Mark In point (I)'}
          size="sm"
          emphasis={inPointFrame !== null}
          onClick={() => useSequenceStore.getState().setInPoint(currentPlayheadFrame())}
        />
        <IconButton
          icon="output"
          label={outPointFrame !== null ? `Mark Out (${outPointFrame}f) (O)` : 'Mark Out point (O)'}
          size="sm"
          emphasis={outPointFrame !== null}
          onClick={() => useSequenceStore.getState().setOutPoint(currentPlayheadFrame())}
        />
        <IconButton
          icon="clear_all"
          label="Clear In/Out points (Alt+X)"
          size="sm"
          disabled={inPointFrame === null && outPointFrame === null}
          onClick={() => useSequenceStore.getState().clearInOutPoints()}
        />
        <span aria-hidden="true" className="h-3 w-px mx-0.5 bg-hairline" />
        {/* S27 — 3-Point Assembly: Lift & Extract */}
        <IconButton
          icon="eject"
          label="Lift work area (leaves gap) (;)"
          size="sm"
          disabled={inPointFrame === null || outPointFrame === null}
          onClick={() => useSequenceStore.getState().liftWorkArea()}
        />
        <IconButton
          icon="compress"
          label="Extract work area (ripples timeline) (')"
          size="sm"
          disabled={inPointFrame === null || outPointFrame === null}
          onClick={() => useSequenceStore.getState().extractWorkArea()}
        />
      </div>

      {/* S62 — Adjustment Layer Creation */}
      <IconButton
        icon="tune"
        label="Add Adjustment Layer at playhead (Alt+A)"
        size="sm"
        onClick={async () => {
          const state = useSequenceStore.getState();
          if (!state.document) return;
          const fps = state.document.sequence.fps;
          const startFrames = currentPlayheadFrame();
          const durationFrames = Math.max(1, Math.round(fps * 5));
          const trackId = await ensureOverlayTrack('Adjustment Layers', startFrames, durationFrames);
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
        }}
      />

      <span className="min-w-2 flex-1" />

      {/* S29 — Compact Master Bus VU Peak Meter & Quick Audio Mixer Toggle */}
      <CompactMasterVuMeter />

      {/* Audio Console Mixer Toggle */}
      <IconButton
        icon="equalizer"
        label={isMixerOpen ? 'Close Audio Mixer' : 'Open Audio Mixer Console'}
        emphasis={isMixerOpen}
        aria-pressed={isMixerOpen}
        size="sm"
        onClick={toggleMixer}
      />

      {/* S26 — Subtitles & Captions Engine Modal */}
      <IconButton
        icon="closed_caption"
        label="Subtitles & Captions (.srt / .vtt)..."
        size="sm"
        onClick={() => useModalStore.getState().openModal(MODAL_IDS.SUBTITLES)}
      />

      {/* S82 — AI Auto-Reframe & Dynamic Aspect Ratio Engine Modal */}
      <IconButton
        icon="aspect_ratio"
        label="Auto-Reframe & Aspect Ratio (9:16 / 1:1 / 4:5)..."
        size="sm"
        onClick={() => useModalStore.getState().openModal(MODAL_IDS.AUTO_REFRAME)}
      />

      {/* S84 — CapCut AI Auto-Beats & Dynamic Music Cut Synchronizer */}
      <IconButton
        icon="graphic_eq"
        label="Auto-Beats & Music Sync (BPM & Drops)..."
        size="sm"
        onClick={() => useModalStore.getState().openModal(MODAL_IDS.BEAT_SYNC)}
      />

      {/* Magnet snapping */}
      <IconButton
        icon={<MagnetIcon />}
        label={snapEnabled ? 'Snapping on — Alt bypasses' : 'Snapping off — Alt snaps'}
        emphasis={snapEnabled}
        aria-pressed={snapEnabled}
        size="sm"
        onClick={() => setSnapEnabled(!snapEnabled)}
      />

      {/* Zoom controls */}
      <div className="flex items-center gap-1 rounded-card border border-hairline bg-bg-canvas/80 px-1.5 py-0.5">
        <IconButton
          icon="zoom_out"
          label="Zoom out"
          size="sm"
          onClick={() => setZoom(pixelsPerSecond / ZOOM_STEP)}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sliderValue}
          aria-label="Timeline zoom"
          className="h-1.5 w-24 cursor-ew-resize accent-[var(--accent-ai)]"
          onChange={(event) =>
            setZoom(Math.exp(LOG_MIN + Number(event.target.value) * (LOG_MAX - LOG_MIN)))
          }
        />
        <IconButton
          icon="zoom_in"
          label="Zoom in"
          size="sm"
          onClick={() => setZoom(pixelsPerSecond * ZOOM_STEP)}
        />
      </div>

      <IconButton icon="fit_screen" label="Fit sequence (Shift+Z)" size="sm" onClick={requestFit} />
    </div>
  );
}
