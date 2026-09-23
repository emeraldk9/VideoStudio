import React, { useMemo, useState } from 'react';
import {
  detectTransients,
  estimateBpmFromOnsets,
  generateBeatGridMarkers,
  autoCutClipsOnBeats,
  generateSyntheticBeatWaveform,
  type SequenceClip,
  type SequenceDocument,
} from '@shared';
import { useSequenceStore } from '../../../../entities/sequence';
import { Button } from '../../../../shared/ui/Button';
import { Section } from '../../../../shared/ui/Section';

export interface BeatDetectionSectionProps {
  clip: SequenceClip;
  document: SequenceDocument;
  fps: number;
}

export const BeatDetectionSection = React.memo(function BeatDetectionSection({
  clip,
  document,
  fps,
}: BeatDetectionSectionProps) {
  const commitClips = useSequenceStore((state) => state.commitClips);
  const importMarkers = useSequenceStore((state) => state.importMarkers);

  const [sensitivity, setSensitivity] = useState<'low' | 'balanced' | 'high'>('balanced');
  const [density, setDensity] = useState<'all' | 'half' | 'bars'>('all');
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [onsets, setOnsets] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const videoTracks = useMemo(
    () => document.tracks.filter((t) => t.kind === 'video'),
    [document.tracks],
  );
  const [targetTrackId, setTargetTrackId] = useState<string>(
    videoTracks[0]?.id ?? document.sequence.spineTrackId,
  );

  const handleDetect = () => {
    setIsProcessing(true);
    setStatusMsg(null);

    try {
      const sensFactor = sensitivity === 'high' ? 1.5 : sensitivity === 'low' ? 0.7 : 1.0;
      const minDistance =
        density === 'bars'
          ? Math.round(((fps * 60) / 120) * 4)
          : density === 'half'
            ? Math.round(((fps * 60) / 120) * 2)
            : Math.max(6, Math.round(fps * 0.25));

      const clipStart = clip.startFrames ?? 0;
      const duration = clip.durationFrames;

      const synthetic = generateSyntheticBeatWaveform(120, Math.max(1, duration / fps), fps);
      const detected = detectTransients(synthetic, fps, {
        sensitivity: sensFactor,
        minDistanceFrames: minDistance,
      });

      const sequenceOnsets = detected.map((f) => clipStart + f);
      const bpmResult = estimateBpmFromOnsets(detected, fps);

      setOnsets(sequenceOnsets);
      setDetectedBpm(bpmResult.bpm);
      setConfidence(bpmResult.confidence);
      setStatusMsg(`Detected ${sequenceOnsets.length} beats at ~${bpmResult.bpm} BPM`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateMarkers = async () => {
    if (onsets.length === 0) return;
    const markers = generateBeatGridMarkers(document.sequence.id, onsets, fps, {
      bpm: detectedBpm ?? 120,
      color: 'ai',
      prefix: 'Beat',
    });

    const entries = markers.map((m) => ({
      frame: m.frame,
      name: m.name,
      notes: m.notes,
      color: m.color,
      locked: m.locked,
    }));

    const added = await importMarkers(entries);
    setStatusMsg(`Added ${added} beat markers to timeline`);
  };

  const handleAutoCut = () => {
    if (onsets.length === 0 || !targetTrackId) return;
    const updatedClips = autoCutClipsOnBeats(document.clips, onsets, targetTrackId, 6);
    commitClips(updatedClips);
    const cutsCount = updatedClips.filter((c) => c.trackId === targetTrackId).length;
    setStatusMsg(`Auto-cut track into ${cutsCount} rhythmic segments`);
  };

  return (
    <Section title="Rhythm & Beat Detection">
      <div className="flex flex-col gap-2.5">
        {/* Sensitivity & Density Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Sensitivity</span>
            <div className="flex items-center gap-1">
              {(['low', 'balanced', 'high'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSensitivity(s)}
                  className={`px-2 py-0.5 rounded text-[10px] capitalize border transition-all ${
                    sensitivity === s
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-bg-app text-text-disabled border-hairline hover:text-text-primary'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Beat Density</span>
            <div className="flex items-center gap-1">
              {[
                { id: 'all', label: 'Quarter (1/4)' },
                { id: 'half', label: 'Half (1/2)' },
                { id: 'bars', label: 'Downbeats (1/1)' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDensity(d.id as any)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                    density === d.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-bg-app text-text-disabled border-hairline hover:text-text-primary'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button: Detect */}
        <Button
          variant="secondary"
          size="sm"
          className="w-full flex items-center justify-center gap-2 h-7 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30"
          onClick={handleDetect}
          disabled={isProcessing}
        >
          <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
          <span>{isProcessing ? 'Analyzing Audio Rhythm...' : 'Detect Beats & Tempo'}</span>
        </Button>

        {/* Results Banner */}
        {detectedBpm !== null && (
          <div className="flex flex-col gap-2 p-2 rounded bg-bg-app border border-amber-500/20 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Estimated Tempo</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {detectedBpm} BPM
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-disabled">Rhythm Confidence</span>
              <span className="font-mono text-text-primary">
                {Math.round((confidence ?? 1) * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-disabled">Detected Onsets</span>
              <span className="font-mono text-text-primary">{onsets.length} beats</span>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center h-6 text-[11px] text-text-primary hover:bg-bg-card border border-hairline"
                onClick={handleGenerateMarkers}
              >
                <span className="material-symbols-outlined text-[12px] mr-1 text-accent-ai">flag</span>
                Add {onsets.length} Beat Markers to Timeline
              </Button>

              {videoTracks.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-text-disabled">
                    <span>Auto-Cut Target Track</span>
                    <select
                      value={targetTrackId}
                      onChange={(e) => setTargetTrackId(e.target.value)}
                      className="bg-bg-surface border border-hairline rounded px-1 text-[10px] text-text-primary"
                    >
                      {videoTracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name || t.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center h-6 text-[11px] text-amber-300 hover:bg-amber-500/10 border border-amber-500/30"
                    onClick={handleAutoCut}
                  >
                    <span className="material-symbols-outlined text-[12px] mr-1">content_cut</span>
                    Cut Target Track to Beat
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {statusMsg && (
          <p className="text-[10px] text-accent-ai font-mono text-center">{statusMsg}</p>
        )}
      </div>
    </Section>
  );
});
