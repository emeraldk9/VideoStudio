import { deleteToPlayhead, rippleDelete, splitAtFrame } from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { IconButton } from '../../../shared/ui/IconButton';

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
  { mode: 'select-right', icon: 'keyboard_double_arrow_right', label: 'Select rightward (A)' },
  { mode: 'select-left', icon: 'keyboard_double_arrow_left', label: 'Select leftward (Shift+A)' },
] as const;

const MIN_PPS = 4;
const MAX_PPS = 400;
const LOG_MIN = Math.log(MIN_PPS);
const LOG_MAX = Math.log(MAX_PPS);

/** One wheel-notch of the panel's Ctrl+wheel gesture — the buttons match it. */
const ZOOM_STEP = 1.15;

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
    const next = deleteToPlayhead(
      state.document.clips,
      state.document.tracks,
      currentPlayheadFrame(),
      state.selectedClipIds,
      side,
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
        label="Delete left of playhead"
        size="sm"
        disabled={!hasClips}
        onClick={() => runDeleteSide('left')}
      />
      <IconButton
        icon="backspace"
        label="Delete right of playhead"
        size="sm"
        disabled={!hasClips}
        className="[&>span]:-scale-x-100"
        onClick={() => runDeleteSide('right')}
      />
      <IconButton
        icon="delete"
        label="Delete selection (Del)"
        size="sm"
        disabled={!hasSelection}
        onClick={() => runDelete(false)}
      />
      <IconButton
        icon="bookmark_add"
        label="Add marker (M)"
        size="sm"
        onClick={() => void useSequenceStore.getState().addMarker(currentPlayheadFrame())}
      />

      <span className="min-w-2 flex-1" />

      {/* Audio Console Mixer Toggle */}
      <IconButton
        icon="equalizer"
        label={isMixerOpen ? 'Close Audio Mixer' : 'Open Audio Mixer Console'}
        emphasis={isMixerOpen}
        aria-pressed={isMixerOpen}
        size="sm"
        onClick={toggleMixer}
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

      <span className="rounded bg-bg-canvas border border-hairline px-2 py-0.5 font-mono text-[11px] text-text-secondary">
        {document.sequence.fps} fps · {document.sequence.width}×{document.sequence.height}
      </span>
    </div>
  );
}
