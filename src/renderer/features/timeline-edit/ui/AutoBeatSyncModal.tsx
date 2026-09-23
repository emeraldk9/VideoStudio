import { useMemo, useState } from 'react';

import {
  applyAutoBeatSyncToSequence,
  generateBeatSyncMarkers,
  type AutoBeatSyncOptions,
  type BeatDetectionMode,
  type BeatSubdivision,
  type SequenceDocument,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';

export interface AutoBeatSyncModalProps {
  open: boolean;
  document: SequenceDocument;
  fps: number;
  onClose: () => void;
}

export function AutoBeatSyncModal({
  open,
  document,
  fps,
  onClose,
}: AutoBeatSyncModalProps) {
  const [selectedTrackId, setSelectedTrackId] = useState<string>('all');
  const [mode, setMode] = useState<BeatDetectionMode>('drops_and_snares');
  const [subdivision, setSubdivision] = useState<BeatSubdivision>('beat_1');
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [customBpm, setCustomBpm] = useState<number>(0);
  const [generateMarkers, setGenerateMarkers] = useState<boolean>(true);
  const [autoCutVideo, setAutoCutVideo] = useState<boolean>(true);
  const [minSegmentSec, setMinSegmentSec] = useState<number>(0.5);
  const [snapSubtitles, setSnapSubtitles] = useState<boolean>(true);
  const [duplicateSequenceFirst, setDuplicateSequenceFirst] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const pushToast = useToastStore((state) => state.pushToast);

  // Audio tracks in sequence
  const audioTracks = useMemo(() => {
    return document.tracks.filter((t) => t.kind === 'audio');
  }, [document.tracks]);

  // Audio clips filtered by track
  const audioClips = useMemo(() => {
    return document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      if (!track) return false;
      if (selectedTrackId !== 'all' && track.id !== selectedTrackId) return false;
      return track.kind === 'audio' || (track.kind === 'video' && c.sourceKind === 'video');
    });
  }, [document.clips, document.tracks, selectedTrackId]);

  const totalFrames = useMemo(() => {
    return document.clips.reduce(
      (max, c) => Math.max(max, (c.startFrames ?? 0) + c.durationFrames),
      180,
    );
  }, [document.clips]);

  // Real-time live beat analysis preview
  const liveBeatData = useMemo(() => {
    return generateBeatSyncMarkers(audioClips, totalFrames, {
      mode,
      sensitivity,
      subdivision,
      customBpm: customBpm > 0 ? customBpm : undefined,
      fps,
    });
  }, [audioClips, totalFrames, mode, sensitivity, subdivision, customBpm, fps]);

  const dropCount = useMemo(
    () => liveBeatData.markers.filter((m) => m.isDrop).length,
    [liveBeatData.markers],
  );

  const videoClipCount = useMemo(
    () => document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && track.kind === 'video' && track.role !== 'text';
    }).length,
    [document.clips, document.tracks],
  );

  const subtitleClipCount = useMemo(
    () => document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && (track.role === 'text' || Boolean(c.effects?.text));
    }).length,
    [document.clips, document.tracks],
  );

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const minSegmentFrames = Math.max(6, Math.round(minSegmentSec * fps));

      const options: AutoBeatSyncOptions = {
        audioTrackId: selectedTrackId,
        mode,
        sensitivity,
        subdivision,
        customBpm: customBpm > 0 ? customBpm : undefined,
        fps,
        generateMarkers,
        autoCutVideo,
        minSegmentFrames,
        snapSubtitles,
        duplicateSequence: duplicateSequenceFirst,
      };

      const result = applyAutoBeatSyncToSequence(document, options);

      // If generating timeline markers, write to store
      if (generateMarkers && result.markers.length > 0) {
        const markerEntries = result.markers.map((m) => ({
          frame: m.frame,
          name: m.name,
          color: m.color,
          locked: m.isDrop,
        }));
        await useSequenceStore.getState().importMarkers(markerEntries);
      }

      if (duplicateSequenceFirst) {
        const newName = `${document.sequence.name} [Beat Sync]`;
        if (!window.api?.sequence?.create) {
          throw new Error('Sequence creation API unavailable.');
        }

        const backendDoc = await window.api.sequence.create({
          projectId: document.sequence.projectId,
          name: newName,
        });

        if (backendDoc) {
          const remappedTracks = document.tracks.map((t) => ({
            ...t,
            sequenceId: backendDoc.sequence.id,
          }));

          const remappedClips = result.document.clips.map((c) => ({
            ...c,
            sequenceId: backendDoc.sequence.id,
          }));

          if (window.api?.sequence?.replaceDocument) {
            await window.api.sequence.replaceDocument({
              sequenceId: backendDoc.sequence.id,
              tracks: remappedTracks,
              clips: remappedClips,
              spineTrackId: document.sequence.spineTrackId ?? null,
            });
          }

          await useSequenceStore.getState().openSequence(backendDoc.sequence.id);
          await useSequenceStore.getState().loadSequences(document.sequence.projectId);

          pushToast({
            variant: 'success',
            message: `Created music-synced sequence "${newName}" (${result.cutsCount} montage cuts, ${result.subtitlesSnappedCount} subtitles aligned to ${result.estimatedBpm} BPM)!`,
          });
        }
      } else {
        // In-place
        useSequenceStore.getState().commitClips(result.document.clips);
        pushToast({
          variant: 'success',
          message: `Synchronized timeline to ${result.estimatedBpm} BPM (${result.cutsCount} video cuts, ${result.subtitlesSnappedCount} subtitles aligned)!`,
        });
      }

      onClose();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Beat Sync failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-primary text-xl">graphic_eq</span>
          <span className="font-semibold text-text-primary text-base">CapCut AI Auto-Beats & Dynamic Music Cut</span>
        </div>
      }
      subtitle={`Music Rhythm Sync • Estimated Tempo: ${liveBeatData.bpm} BPM • ${liveBeatData.markers.length} Beats (${dropCount} Drops)`}
      size="xl"
    >
      <div className="flex flex-col gap-6 py-2">
        {/* Detection Mode & Track Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source Audio Lane */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Music / Rhythm Track
            </label>
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              className="h-8 w-full rounded border border-hairline bg-bg-surface px-2.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
            >
              <option value="all">All Audio Tracks ({audioClips.length} clips)</option>
              {audioTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name} ({document.clips.filter((c) => c.trackId === track.id).length} clips)
                </option>
              ))}
            </select>
          </div>

          {/* Sync Mode Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Detection Algorithm
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('drops_and_snares')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-xs font-medium transition-all ${
                  mode === 'drops_and_snares'
                    ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                    : 'border-hairline bg-bg-surface text-text-secondary hover:bg-bg-subtle'
                }`}
              >
                <span className="material-symbols-outlined text-sm">bolt</span>
                <span>Beats & Drops</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('metronomic_bpm')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-xs font-medium transition-all ${
                  mode === 'metronomic_bpm'
                    ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                    : 'border-hairline bg-bg-surface text-text-secondary hover:bg-bg-subtle'
                }`}
              >
                <span className="material-symbols-outlined text-sm">metronome</span>
                <span>Tempo Grid (BPM)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Rhythm & Waveform Preview Diagram */}
        <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-bg-surface/50 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent-primary">multiline_chart</span>
              Rhythmic Cadence & Marker Map
            </span>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-accent-ai flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-accent-ai" /> {dropCount} Major Drops
              </span>
              <span className="text-amber-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> {liveBeatData.markers.length - dropCount} Regular Beats
              </span>
              <span className="text-text-primary font-semibold">
                {liveBeatData.bpm} BPM
              </span>
            </div>
          </div>

          {/* Interactive Rhythm Ruler Bar */}
          <div className="relative h-14 w-full rounded-lg bg-bg-canvas border border-hairline overflow-hidden p-1 flex items-end">
            {/* Visual Beat Marker Lines */}
            {liveBeatData.markers.map((m, idx) => {
              const leftPct = (m.frame / Math.max(1, totalFrames)) * 100;
              if (leftPct > 100) return null;
              return (
                <div
                  key={idx}
                  className="absolute bottom-0 flex flex-col items-center pointer-events-none"
                  style={{ left: `${leftPct}%` }}
                >
                  <span
                    className={`h-8 w-0.5 rounded-full ${
                      m.isDrop ? 'bg-accent-ai w-1 shadow-sm shadow-accent-ai/50' : 'bg-amber-400/80'
                    }`}
                  />
                  {m.isDrop && (
                    <span className="text-[8px] font-mono text-accent-ai -mt-3.5 bg-bg-canvas px-0.5 rounded">
                      ▼
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-[10px] text-text-muted">
            Beats generate magnetic snap guidelines in the timeline ruler, allowing video cuts and playhead scrubbing to snap directly onto musical drops.
          </span>
        </div>

        {/* Pacing & Subdivision Tuning */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sensitivity & Cadence */}
          <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-bg-surface/30 p-3.5">
            <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent-primary">tune</span>
              Rhythm Sensitivity & Cadence
            </div>

            {mode === 'drops_and_snares' ? (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>Onset Sensitivity:</span>
                  <span className="font-mono text-text-primary">{sensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-bg-hover rounded appearance-none cursor-pointer accent-accent-primary"
                />
                <span className="text-[10px] text-text-muted mt-0.5">
                  Higher sensitivity captures subtle hi-hats and quiet percussive hits.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] text-text-secondary">Montage Grid Subdivision:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'bar_1', label: '1 Bar (Downbeats)', desc: 'Relaxed pacing' },
                      { id: 'bar_half', label: '1/2 Bar (2 Beats)', desc: 'Standard music video' },
                      { id: 'beat_1', label: '1 Beat (Kicks/Snares)', desc: 'Energetic montage' },
                      { id: 'beat_half', label: '1/2 Beat (Rapid)', desc: 'Hyper-fast viral' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSubdivision(item.id)}
                      className={`flex flex-col items-center justify-center p-1.5 rounded border text-center transition-all ${
                        subdivision === item.id
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-medium'
                          : 'border-hairline bg-bg-surface text-text-secondary hover:bg-bg-subtle'
                      }`}
                    >
                      <span className="text-[11px]">{item.label}</span>
                      <span className="text-[8px] text-text-muted mt-0.5">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs border-t border-hairline pt-2 mt-1">
              <span className="text-text-secondary">Tempo Override (BPM):</span>
              <input
                type="number"
                min={40}
                max={240}
                placeholder={`Auto (${liveBeatData.bpm})`}
                value={customBpm > 0 ? customBpm : ''}
                onChange={(e) => setCustomBpm(parseInt(e.target.value, 10) || 0)}
                className="w-24 bg-bg-canvas border border-hairline rounded px-2 py-1 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Sync Actions & Target Destination */}
          <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-bg-surface/30 p-3.5">
            <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent-primary">checklist</span>
              Automated Synchronization Actions
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={generateMarkers}
                onChange={(e) => setGenerateMarkers(e.target.checked)}
                className="mt-0.5 rounded border-hairline text-accent-primary focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-medium text-text-primary block">
                  Generate Beat Markers on Timeline
                </span>
                <span className="text-[11px] text-text-muted block mt-0.5">
                  Adds magnetic snap targets on the ruler so all manual edits lock to the beat.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCutVideo}
                onChange={(e) => setAutoCutVideo(e.target.checked)}
                className="mt-0.5 rounded border-hairline text-accent-primary focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-medium text-text-primary block">
                  Auto-Cut / Slice Video Footage to Beats
                </span>
                <span className="text-[11px] text-text-muted block mt-0.5">
                  Slices primary video clips on downbeats for dynamic montage pacing ({videoClipCount} clips).
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={snapSubtitles}
                onChange={(e) => setSnapSubtitles(e.target.checked)}
                className="mt-0.5 rounded border-hairline text-accent-primary focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-medium text-text-primary block">
                  Align Subtitle Cues to Musical Cadence
                </span>
                <span className="text-[11px] text-text-muted block mt-0.5">
                  Snaps subtitle start times to nearest musical beats ({subtitleClipCount} cues).
                </span>
              </div>
            </label>

            {/* Non-destructive toggle */}
            <div className="border-t border-hairline pt-2 mt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={duplicateSequenceFirst}
                  onChange={(e) => setDuplicateSequenceFirst(e.target.checked)}
                  className="rounded border-hairline text-accent-primary focus:ring-0"
                />
                <span className="text-text-primary font-medium">Duplicate Sequence (Safe)</span>
                <span className="text-[10px] text-emerald-400 font-mono">(Recommended)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline mt-1">
          <div className="text-[11px] text-text-muted">
            {liveBeatData.markers.length === 0 ? (
              <span className="text-amber-400">⚠️ No audio found for rhythm analysis.</span>
            ) : (
              <span>Ready to synchronize timeline across {liveBeatData.markers.length} musical beats.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApply}
              disabled={isProcessing || liveBeatData.markers.length === 0}
              className="flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">graphic_eq</span>
              <span>{isProcessing ? 'Synchronizing...' : `Apply Beat Sync (${liveBeatData.bpm} BPM)`}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
