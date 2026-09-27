/**
 * Milestone S160 — Stylus Recording Floating Toolbar / HUD.
 *
 * Provides quick nib selection (Pen, Marker, Pencil, Chalk, Eraser), color palette,
 * stroke width presets, audio foley toggling, record/stop session controls,
 * and automated "Commit to Timeline" whiteboard clip insertion.
 */

import { useState } from 'react';
import {
  DEFAULT_TOOL_COLORS,
  DEFAULT_TOOL_SIZES,
  packageRecordingToWhiteboardClip,
  type LiveRecordingSession,
  type StylusNibTool,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { ensureOverlayTrack } from '../../timeline-media/lib/ensure-free-track';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { useStylusCaptureStore } from '../model/stylusCaptureStore';

const COLOR_PALETTE = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'White', hex: '#f8fafc' },
  { name: 'Slate', hex: '#1e293b' },
];

const SIZE_PRESETS = [2, 4, 8, 14, 24];

export function StylusRecordingHUD() {
  const isStylusModeActive = useStylusCaptureStore((state) => state.isStylusModeActive);
  const closeStylusMode = useStylusCaptureStore((state) => state.closeStylusMode);
  const isRecording = useStylusCaptureStore((state) => state.isRecording);
  const activeTool = useStylusCaptureStore((state) => state.activeTool);
  const setTool = useStylusCaptureStore((state) => state.setTool);
  const activeColor = useStylusCaptureStore((state) => state.activeColor);
  const setColor = useStylusCaptureStore((state) => state.setColor);
  const activeSize = useStylusCaptureStore((state) => state.activeSize);
  const setSize = useStylusCaptureStore((state) => state.setSize);
  const foleyEnabled = useStylusCaptureStore((state) => state.foleyEnabled);
  const setFoleyEnabled = useStylusCaptureStore((state) => state.setFoleyEnabled);
  const syncWithPlayback = useStylusCaptureStore((state) => state.syncWithPlayback);
  const setSyncWithPlayback = useStylusCaptureStore((state) => state.setSyncWithPlayback);
  const recordedStrokes = useStylusCaptureStore((state) => state.recordedStrokes);
  const undoStroke = useStylusCaptureStore((state) => state.undoStroke);
  const clearStrokes = useStylusCaptureStore((state) => state.clearStrokes);
  const startRecording = useStylusCaptureStore((state) => state.startRecording);
  const stopRecording = useStylusCaptureStore((state) => state.stopRecording);
  const sessionStartFrame = useStylusCaptureStore((state) => state.sessionStartFrame);
  const smoothing = useStylusCaptureStore((state) => state.smoothing);
  const foleyVolume = useStylusCaptureStore((state) => state.foleyVolume);

  const document = useSequenceStore((state) => state.document);
  const setPlaying = useSequenceStore((state) => state.setPlaying);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const select = useSequenceStore((state) => state.select);

  const [isCommitting, setIsCommitting] = useState(false);

  if (!isStylusModeActive) return null;

  const fps = document?.sequence.fps ?? 30;
  const currentFrame = currentPlayheadFrame();

  const handleToggleRecord = () => {
    if (!isRecording) {
      startRecording(currentFrame, fps);
      if (syncWithPlayback) {
        setPlaying(true);
      }
    } else {
      stopRecording(currentFrame);
      if (syncWithPlayback) {
        setPlaying(false);
      }
    }
  };

  const handleCommitToTimeline = async () => {
    if (!document || recordedStrokes.length === 0) return;
    setIsCommitting(true);

    try {
      const endFrame = Math.max(sessionStartFrame + 30, currentPlayheadFrame());
      const durationFrames = Math.max(1, endFrame - sessionStartFrame);

      const session: LiveRecordingSession = {
        id: crypto.randomUUID(),
        sequenceId: document.sequence.id,
        startPlayheadFrame: sessionStartFrame,
        endPlayheadFrame: endFrame,
        durationFrames,
        fps,
        canvasWidth: document.sequence.width,
        canvasHeight: document.sequence.height,
        strokes: recordedStrokes,
        activeTool,
        activeColor,
        activeSize,
        foleyEnabled,
        foleyVolume,
        smoothing,
      };

      // Ensure a dedicated overlay track exists for annotations
      const trackId = await ensureOverlayTrack('Stylus Annotations', sessionStartFrame, durationFrames);
      const fresh = useSequenceStore.getState();
      if (!trackId || !fresh.document) return;

      const newClip = packageRecordingToWhiteboardClip(session, trackId);
      fresh.commitClips([...fresh.document.clips, newClip]);
      fresh.select([newClip.id]);

      // Stop recording and exit stylus capture mode
      closeStylusMode();
    } catch (err) {
      console.error('Failed to commit stylus recording to timeline:', err);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 rounded-xl border border-hairline/80 bg-bg-surface/95 px-3 py-1.5 shadow-2xl backdrop-blur-md transition-all select-none">
      {/* Recording Pill & Indicator */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-hairline">
        <button
          type="button"
          onClick={handleToggleRecord}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all shadow-xs ${
            isRecording
              ? 'bg-accent-danger text-text-on-accent animate-pulse'
              : 'bg-bg-app border border-hairline text-text-primary hover:bg-bg-hover'
          }`}
          title={isRecording ? 'Stop Recording' : 'Start Recording Strokes'}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isRecording ? 'bg-white' : 'bg-accent-danger'
            }`}
          />
          {isRecording ? 'Stop Recording' : 'Record'}
        </button>

        <label
          className="flex items-center gap-1 text-[11px] text-text-secondary cursor-pointer hover:text-text-primary"
          title="Auto-play timeline while recording strokes"
        >
          <input
            type="checkbox"
            checked={syncWithPlayback}
            onChange={(e) => setSyncWithPlayback(e.target.checked)}
            className="rounded border-hairline bg-bg-app text-accent-ai h-3 w-3"
          />
          <span>Play Sync</span>
        </label>
      </div>

      {/* Tool Selector */}
      <div className="flex items-center gap-1 pr-2 border-r border-hairline">
        <IconButton
          icon="edit"
          label="Pen Nib"
          size="sm"
          emphasis={activeTool === 'pen'}
          onClick={() => setTool('pen')}
        />
        <IconButton
          icon="border_color"
          label="Marker Nib"
          size="sm"
          emphasis={activeTool === 'marker'}
          onClick={() => setTool('marker')}
        />
        <IconButton
          icon="draw"
          label="Pencil Nib"
          size="sm"
          emphasis={activeTool === 'pencil'}
          onClick={() => setTool('pencil')}
        />
        <IconButton
          icon="brush"
          label="Chalk Stick"
          size="sm"
          emphasis={activeTool === 'chalk'}
          onClick={() => setTool('chalk')}
        />
        <IconButton
          icon="cleaning_services"
          label="Eraser"
          size="sm"
          emphasis={activeTool === 'eraser'}
          onClick={() => setTool('eraser')}
        />
      </div>

      {/* Color Palette (hidden when eraser is active) */}
      {activeTool !== 'eraser' && (
        <div className="flex items-center gap-1.5 pr-2 border-r border-hairline">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setColor(c.hex)}
              className={`h-5 w-5 rounded-full border transition-transform shadow-xs ${
                activeColor === c.hex
                  ? 'border-white scale-110 ring-2 ring-accent-ai ring-offset-1 ring-offset-bg-surface'
                  : 'border-hairline hover:scale-105'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>
      )}

      {/* Stroke Width Selector */}
      <div className="flex items-center gap-1 pr-2 border-r border-hairline">
        {SIZE_PRESETS.map((sz) => (
          <button
            key={sz}
            type="button"
            onClick={() => setSize(sz)}
            className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-mono font-medium transition-colors ${
              activeSize === sz
                ? 'bg-accent-ai text-text-on-accent shadow-xs'
                : 'bg-bg-app border border-hairline text-text-secondary hover:text-text-primary'
            }`}
            title={`Stroke Size: ${sz}px`}
          >
            {sz}
          </button>
        ))}
      </div>

      {/* Audio Foley Feedback Toggle */}
      <div className="flex items-center pr-2 border-r border-hairline">
        <IconButton
          icon={foleyEnabled ? 'volume_up' : 'volume_off'}
          label={foleyEnabled ? 'Mute Stylus Audio Foley' : 'Enable Stylus Audio Foley'}
          size="sm"
          emphasis={foleyEnabled}
          onClick={() => setFoleyEnabled(!foleyEnabled)}
        />
      </div>

      {/* Undo & Clear */}
      <div className="flex items-center gap-1 pr-2 border-r border-hairline">
        <IconButton
          icon="undo"
          label="Undo Last Stroke"
          size="sm"
          disabled={recordedStrokes.length === 0}
          onClick={undoStroke}
        />
        <IconButton
          icon="delete_sweep"
          label="Clear All Strokes"
          size="sm"
          disabled={recordedStrokes.length === 0}
          onClick={clearStrokes}
        />
      </div>

      {/* Commit to Timeline & Exit */}
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="primary"
          disabled={recordedStrokes.length === 0 || isCommitting}
          loading={isCommitting}
          onClick={() => void handleCommitToTimeline()}
        >
          Add to Timeline ({recordedStrokes.length})
        </Button>
        <IconButton
          icon="close"
          label="Exit Drawing Mode"
          size="sm"
          onClick={closeStylusMode}
        />
      </div>
    </div>
  );
}
