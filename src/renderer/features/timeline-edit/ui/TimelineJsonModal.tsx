import { useState } from 'react';

import {
  describeTimelineSetupPlan,
  materializeTimelineSetupPatch,
  planTimelineSetup,
  secondsToFrames,
  type SequenceClip,
  type SequenceDocument,
  type SequenceTrack,
  type TimelineSetupParse,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';

export interface TimelineJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TimelineJsonModal({ isOpen, onClose }: TimelineJsonModalProps) {
  const document = useSequenceStore((state) => state.document);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const pushToast = useToastStore((state) => state.pushToast);

  const [busy, setBusy] = useState(false);
  const [fileData, setFileData] = useState<{
    fileName: string;
    filePath: string;
    rawJson: string;
    parse: TimelineSetupParse;
  } | null>(null);

  const [importMode, setImportMode] = useState<'patch' | 'reconstruct'>('patch');

  const handlePickFile = async () => {
    if (!document) {
      pushToast({ variant: 'error', message: 'No active sequence open.' });
      return;
    }
    setBusy(true);
    try {
      const res = await window.api.sequence.importFullJson(document.sequence.id);
      if (res) {
        setFileData(res);
      }
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Failed to open JSON file: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportFile = async () => {
    if (!document) return;
    setBusy(true);
    try {
      const savedPath = await window.api.sequence.exportFullJson(document.sequence.id);
      if (savedPath) {
        pushToast({
          variant: 'success',
          message: `Exported timeline JSON to ${savedPath}`,
        });
      }
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!document || !fileData) return;
    const { parse } = fileData;
    const fps = document.sequence.fps || 24;

    setBusy(true);
    try {
      if (importMode === 'reconstruct' && parse.tracks && parse.tracks.length > 0) {
        // Full Reconstruction mode
        const newTracks: SequenceTrack[] = parse.tracks.map((t) => ({
          ...t,
          sequenceId: document.sequence.id,
        }));

        const newClips: SequenceClip[] = parse.rows.map((row, index) => {
          const matchedTrack =
            newTracks.find((t) => t.id === row.trackId || t.name === row.trackName) ??
            newTracks[0];

          const durationFrames = row.seconds
            ? Math.max(1, secondsToFrames(row.seconds, fps))
            : 72;

          const startFrames =
            row.startFrames !== undefined
              ? row.startFrames
              : row.startSeconds !== undefined
                ? secondsToFrames(row.startSeconds, fps)
                : null;

          const { patch } = materializeTimelineSetupPatch(row, { effects: undefined }, fps);

          return {
            id: `clip-json-${row.key}-${index}-${Date.now()}`,
            sequenceId: document.sequence.id,
            trackId: matchedTrack.id,
            orderIndex: index,
            sourceKind: (row.whiteboard ? 'still' : row.text ? 'text' : 'still') as any,
            filePath: row.file ?? null,
            label: row.heading ?? row.key,
            startFrames,
            durationFrames,
            transitionIn: patch.transitionIn ?? 'cut',
            transitionFrames: patch.transitionFrames ?? 0,
            transitionOut: patch.transitionOut ?? 'cut',
            transitionOutFrames: patch.transitionOutFrames ?? 0,
            motionPreset: patch.motionPreset ?? 'none',
            effects: patch.effects,
            gainDb: patch.gainDb ?? 0,
            fadeInFrames: patch.fadeInFrames ?? 0,
            fadeOutFrames: patch.fadeOutFrames ?? 0,
            overrides: ['durationFrames'],
          };
        });

        const updated = await window.api.sequence.replaceDocument({
          sequenceId: document.sequence.id,
          tracks: newTracks,
          clips: newClips,
          spineTrackId: parse.sequence?.spineTrackId ?? document.sequence.spineTrackId ?? null,
        });

        if (updated) {
          useSequenceStore.setState({ document: updated });
        } else {
          await useSequenceStore.getState().openSequence(document.sequence.id);
        }

        pushToast({
          variant: 'success',
          message: `Reconstructed timeline with ${newClips.length} clips across ${newTracks.length} tracks!`,
        });
      } else {
        // Sync & Patch mode (matching against active clips)
        const matchables = document.clips.map((clip, index) => ({
          id: clip.id,
          storyShotId: clip.storyShotId ?? null,
          filePath: clip.filePath,
          label: clip.label,
          order: index + 1,
          sourceKind: clip.sourceKind,
        }));

        const plan = planTimelineSetup(parse.rows, matchables);
        const updatedClips = document.clips.map((clip) => {
          const matchedRow = plan.rowByClipId[clip.id];
          if (!matchedRow) return clip;

          const { patch, overrides } = materializeTimelineSetupPatch(matchedRow, clip, fps);
          return {
            ...clip,
            ...patch,
            overrides: Array.from(new Set([...clip.overrides, ...overrides])),
          };
        });

        commitClips(updatedClips);
        const description = describeTimelineSetupPlan(plan, parse);
        pushToast({
          variant: 'success',
          message: `Applied timeline setup: ${description}`,
        });
      }

      onClose();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Failed to apply timeline JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="Timeline JSON Control (Export / Import)"
    >
      <div className="flex flex-col gap-4 py-1 select-none">
        <p className="text-xs text-text-secondary leading-relaxed">
          Control all clip durations, timestamps, transitions, motion presets, whiteboard sketches,
          effects, and cue markers via structured JSON.
        </p>

        {/* Action Choice Strip */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="flex-1 flex items-center justify-center gap-1.5"
            onClick={handleExportFile}
            disabled={busy || !document}
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            <span>Export Current Timeline JSON</span>
          </Button>

          <Button
            variant="primary"
            className="flex-1 flex items-center justify-center gap-1.5"
            onClick={handlePickFile}
            disabled={busy}
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            <span>Choose JSON File to Import</span>
          </Button>
        </div>

        {/* Selected File Inspection Card */}
        {fileData && (
          <div className="flex flex-col gap-3 rounded-card border border-hairline bg-bg-surface/40 p-3 mt-1">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent-ai text-xl">data_object</span>
                <div>
                  <div className="text-xs font-semibold text-text-primary">
                    {fileData.fileName}
                  </div>
                  <div className="text-[10px] text-text-secondary truncate max-w-xs">
                    {fileData.filePath}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-accent-ai/10 px-2 py-0.5 text-[10px] font-semibold text-accent-ai">
                {fileData.parse.rows.length} rows / clips
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs py-1">
              <div className="rounded-md bg-bg-canvas p-2 border border-hairline/50">
                <span className="block font-bold text-text-primary">
                  {fileData.parse.rows.length}
                </span>
                <span className="text-[10px] text-text-secondary">Clips / Rows</span>
              </div>
              <div className="rounded-md bg-bg-canvas p-2 border border-hairline/50">
                <span className="block font-bold text-text-primary">
                  {fileData.parse.markers.length}
                </span>
                <span className="text-[10px] text-text-secondary">Markers</span>
              </div>
              <div className="rounded-md bg-bg-canvas p-2 border border-hairline/50">
                <span className="block font-bold text-text-primary">
                  {fileData.parse.tracks?.length ?? 1}
                </span>
                <span className="text-[10px] text-text-secondary">Tracks</span>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-[11px] font-semibold text-text-primary">
                Application Mode
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('patch')}
                  className={`flex-1 rounded-card border p-2 text-left transition-all ${
                    importMode === 'patch'
                      ? 'border-accent-ai bg-accent-ai/10'
                      : 'border-hairline bg-bg-canvas hover:bg-bg-hover'
                  }`}
                >
                  <div className="text-xs font-semibold text-text-primary">
                    Sync & Patch
                  </div>
                  <div className="text-[10px] text-text-secondary mt-0.5">
                    Match by shot ID/file and update durations, transitions, and sketches.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('reconstruct')}
                  className={`flex-1 rounded-card border p-2 text-left transition-all ${
                    importMode === 'reconstruct'
                      ? 'border-accent-ai bg-accent-ai/10'
                      : 'border-hairline bg-bg-canvas hover:bg-bg-hover'
                  }`}
                >
                  <div className="text-xs font-semibold text-text-primary">
                    Reconstruct Timeline
                  </div>
                  <div className="text-[10px] text-text-secondary mt-0.5">
                    Rebuild all tracks and clips exactly as specified in the JSON file.
                  </div>
                </button>
              </div>
            </div>

            {/* Notes / Warnings */}
            {fileData.parse.notes.length > 0 && (
              <div className="text-[11px] text-text-secondary bg-bg-canvas/60 rounded p-2 border border-hairline/40">
                {fileData.parse.notes.map((note, idx) => (
                  <div key={idx}>• {note}</div>
                ))}
              </div>
            )}

            {fileData.parse.errors.length > 0 && (
              <div className="text-[11px] text-accent-warning bg-accent-warning/10 rounded p-2 border border-accent-warning/30">
                <div className="font-semibold mb-0.5">Warnings:</div>
                {fileData.parse.errors.slice(0, 3).map((err, idx) => (
                  <div key={idx}>• {err}</div>
                ))}
                {fileData.parse.errors.length > 3 && (
                  <div>+ {fileData.parse.errors.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {fileData && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={handleApply}
              className="flex items-center gap-1.5 font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>Apply to Timeline</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
