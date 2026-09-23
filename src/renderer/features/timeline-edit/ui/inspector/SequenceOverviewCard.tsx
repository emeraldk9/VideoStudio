import React from 'react';
import {
  formatDurationSeconds,
  formatTimecode,
  framesToSeconds,
  isTextTrack,
  type SequenceDocument,
} from '@shared';
import { useSequenceStore } from '../../../../entities/sequence';
import { Section } from '../../../../shared/ui/Section';
import { Button } from '../../../../shared/ui/Button';
import { InlineEditableText } from '../../../../shared/ui/InlineEditableText';
import { MarkerModal } from '../MarkerModal';

export interface SequenceOverviewCardProps {
  document: SequenceDocument;
  fps: number;
  durationFrames: number;
}

export const SequenceOverviewCard = React.memo(function SequenceOverviewCard({
  document,
  fps,
  durationFrames,
}: {
  document: SequenceDocument;
  fps: number;
  durationFrames: number;
}) {
  const addTrack = useSequenceStore((state) => state.addTrack);
  const renameSequence = useSequenceStore((state) => state.renameSequence);
  const markers = useSequenceStore((state) => state.markers);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const updateMarker = useSequenceStore((state) => state.updateMarker);
  const removeMarker = useSequenceStore((state) => state.removeMarker);
  const editingMarkerId = useSequenceStore((state) => state.editingMarkerId);
  const setEditingMarkerId = useSequenceStore((state) => state.setEditingMarkerId);

  const videoTracks = document.tracks.filter((t) => t.kind === 'video' && !isTextTrack(t));
  const audioTracks = document.tracks.filter((t) => t.kind === 'audio');
  const textTracks = document.tracks.filter((t) => isTextTrack(t));

  const activeMarker = markers.find((m) => m.id === editingMarkerId) ?? null;

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Sequence Header Card */}
      <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-app p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-ai/15 text-accent-ai">
              <span className="material-symbols-outlined text-[16px]">view_timeline</span>
            </div>
            <span className="text-xs font-semibold text-text-primary tracking-tight">Sequence Overview</span>
          </div>
          <span className="rounded bg-bg-canvas px-2 py-0.5 font-mono text-[10px] text-text-secondary border border-hairline">
            {document.sequence.width}×{document.sequence.height}
          </span>
        </div>
        <div className="mt-0.5">
          <InlineEditableText
            value={document.sequence.name || 'Untitled Sequence'}
            label="Sequence name"
            className="text-sm font-semibold text-text-primary"
            inputClassName="text-sm font-semibold"
            maxLength={100}
            onCommit={(name) => {
              if (name.trim()) void renameSequence(document.sequence.id, name.trim());
            }}
          />
        </div>
      </div>

      {/* Properties Grid */}
      <Section title="Sequence Properties">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Duration</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {formatTimecode(durationFrames, fps)}
            </span>
            <span className="font-mono text-[10px] text-text-secondary mt-0.5">
              {framesToSeconds(durationFrames, fps).toFixed(2)}s · {durationFrames}f
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Framerate</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {fps} FPS
            </span>
            <span className="font-mono text-[10px] text-text-secondary mt-0.5">
              {document.sequence.width > document.sequence.height ? '16:9 Landscape' : document.sequence.width === document.sequence.height ? '1:1 Square' : '9:16 Portrait'}
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Clips</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {document.clips.length}
            </span>
            <span className="text-[10px] text-text-secondary mt-0.5">
              Placed in timeline
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Tracks</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {document.tracks.length}
            </span>
            <span className="text-[10px] text-text-secondary mt-0.5">
              {videoTracks.length}V · {audioTracks.length}A · {textTracks.length}T
            </span>
          </div>
        </div>
      </Section>

      {/* Markers & Notes Section */}
      <Section title="Sequence Markers" count={markers.length}>
        <div className="flex flex-col gap-2">
          {markers.length === 0 ? (
            <div className="rounded-md border border-hairline/60 bg-bg-app/50 p-3 text-center">
              <span className="material-symbols-outlined text-[20px] text-text-disabled mb-1 block">
                bookmark_border
              </span>
              <p className="text-[11px] text-text-secondary">No markers placed yet.</p>
              <p className="text-[10px] text-text-disabled mt-0.5">
                Press <kbd className="font-mono bg-bg-hover px-1 rounded">M</kbd> on the timeline to drop a marker with notes at the playhead.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-0.5">
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="group flex flex-col gap-1.5 rounded-md border border-hairline/70 bg-bg-app p-2.5 transition-colors hover:border-text-disabled"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          marker.color === 'success'
                            ? 'bg-accent-success'
                            : marker.color === 'warning'
                              ? 'bg-accent-warning'
                              : marker.color === 'info'
                                ? 'bg-accent-info'
                                : 'bg-accent-ai'
                        }`}
                      />
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {marker.name || 'Marker'}
                      </span>
                      {marker.locked && (
                        <span className="material-symbols-outlined text-[13px] text-text-secondary" title="Locked sync point">
                          lock
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-[10px] text-text-secondary bg-bg-canvas px-1.5 py-0.5 rounded border border-hairline/40">
                        {formatTimecode(marker.frame, fps)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPlayhead(marker.frame)}
                        title="Seek playhead to marker"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMarkerId(marker.id)}
                        title="Edit marker and notes"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                      </button>
                    </div>
                  </div>

                  {marker.notes ? (
                    <div className="rounded bg-bg-surface/80 p-2 border border-hairline/40">
                      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {marker.notes}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingMarkerId(marker.id)}
                      className="text-left text-[11px] italic text-text-disabled hover:text-text-secondary transition-colors"
                    >
                      + Add notes...
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Quick Actions */}
      <Section title="Add Track">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void addTrack('video', `Video ${videoTracks.length + 1}`)}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-cyan-400">video_call</span>
              <span>Add Video Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>

          <button
            type="button"
            onClick={() => void addTrack('audio', `Audio ${audioTracks.length + 1}`)}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-emerald-400">audiotrack</span>
              <span>Add Audio Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>

          <button
            type="button"
            onClick={() => void addTrack('video', `Text ${textTracks.length + 1}`, 'text')}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-purple-400">title</span>
              <span>Add Text Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>
        </div>
      </Section>

      <div className="rounded-md border border-hairline/40 bg-bg-app/40 p-3 text-center">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          Select any clip on the timeline to edit its transform, speed, volume, keyframes, or transitions.
        </p>
      </div>

      {/* Marker modal from Inspector */}
      <MarkerModal
        open={Boolean(activeMarker)}
        marker={activeMarker}
        fps={fps}
        onClose={() => setEditingMarkerId(null)}
        onSave={(patch) => {
          if (!activeMarker) return;
          void updateMarker(activeMarker.id, patch);
        }}
        onDelete={(markerId) => {
          void removeMarker(markerId);
        }}
      />
    </div>
  );
});
