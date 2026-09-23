import { useMemo, useState } from 'react';

import {
  ASPECT_RATIO_PRESETS,
  ASPECT_RATIO_PRESET_LIST,
  applyAutoReframeToSequence,
  calculatePanAndScanBounds,
  calculateScaleToFill,
  type TargetAspectRatio,
  type TrackingSpeed,
  type SequenceDocument,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';

export interface AutoReframeModalProps {
  open: boolean;
  document: SequenceDocument;
  fps: number;
  onClose: () => void;
}

export function AutoReframeModal({
  open,
  document,
  fps: _fps,
  onClose,
}: AutoReframeModalProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<TargetAspectRatio>('9:16');
  const [trackingSpeed, setTrackingSpeed] = useState<TrackingSpeed>('default');
  const [motionInterval, setMotionInterval] = useState<number>(1.0);
  const [repositionSubtitles, setRepositionSubtitles] = useState<boolean>(true);
  const [creationMode, setCreationMode] = useState<'duplicate' | 'inplace'>('duplicate');
  const [isProcessing, setIsProcessing] = useState(false);

  const pushToast = useToastStore((state) => state.pushToast);

  const currentWidth = document.sequence.width;
  const currentHeight = document.sequence.height;
  const targetPreset = ASPECT_RATIO_PRESETS[selectedPresetId];

  // Compute scale and pan bounds for visual preview
  const scale = useMemo(
    () => calculateScaleToFill(currentWidth, currentHeight, targetPreset.width, targetPreset.height),
    [currentWidth, currentHeight, targetPreset.width, targetPreset.height],
  );

  const panBounds = useMemo(
    () => calculatePanAndScanBounds(currentWidth, currentHeight, targetPreset.width, targetPreset.height),
    [currentWidth, currentHeight, targetPreset.width, targetPreset.height],
  );

  const videoClipCount = useMemo(
    () => document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && track.kind === 'video' && track.role !== 'text';
    }).length,
    [document.clips, document.tracks],
  );

  const textClipCount = useMemo(
    () => document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && (track.role === 'text' || Boolean(c.effects?.text));
    }).length,
    [document.clips, document.tracks],
  );

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const reframedDoc = applyAutoReframeToSequence(document, {
        targetAspect: selectedPresetId,
        trackingSpeed,
        adjustSubtitlesSafeMargin: repositionSubtitles,
      });

      if (creationMode === 'duplicate') {
        const newName = `${document.sequence.name} [${targetPreset.shortLabel}]`;
        if (!window.api?.sequence?.create) {
          throw new Error('Sequence creation API unavailable.');
        }

        const backendDoc = await window.api.sequence.create({
          projectId: document.sequence.projectId,
          name: newName,
        });

        if (backendDoc) {
          if (window.api?.sequence?.updateSettings) {
            await window.api.sequence.updateSettings({
              sequenceId: backendDoc.sequence.id,
              width: targetPreset.width,
              height: targetPreset.height,
            });
          }

          const remappedTracks = document.tracks.map((t) => ({
            ...t,
            sequenceId: backendDoc.sequence.id,
          }));

          const remappedClips = reframedDoc.clips.map((c) => ({
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
            message: `Created reframed sequence "${newName}" (${videoClipCount} video clips scaled, ${textClipCount} subtitles protected)!`,
          });
        }
      } else {
        // In-place
        await useSequenceStore.getState().updateSettings({
          width: targetPreset.width,
          height: targetPreset.height,
        });
        useSequenceStore.getState().commitClips(reframedDoc.clips);

        pushToast({
          variant: 'success',
          message: `Reframed sequence to ${targetPreset.name} (${videoClipCount} video clips reframed, ${textClipCount} subtitles protected)!`,
        });
      }

      onClose();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Auto-Reframe failed: ${err instanceof Error ? err.message : String(err)}`,
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
          <span className="material-symbols-outlined text-accent-primary text-xl">aspect_ratio</span>
          <span className="font-semibold text-text-primary text-base">AI Auto-Reframe & Dynamic Aspect Ratio</span>
        </div>
      }
      subtitle={`Source: ${currentWidth}×${currentHeight} • ${videoClipCount} video clips • ${textClipCount} subtitles`}
      size="xl"
    >
      <div className="flex flex-col gap-6 py-2">
        {/* Aspect Ratio Selector Cards */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-2.5">
            Target Aspect Ratio
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {ASPECT_RATIO_PRESET_LIST.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`flex flex-col items-center justify-between p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-accent-primary bg-accent-primary/10 shadow-sm'
                      : 'border-hairline bg-bg-surface hover:border-hairline-bright hover:bg-bg-subtle'
                  }`}
                >
                  <div className="flex items-center justify-center h-12 w-full mb-2">
                    <div
                      className={`border-2 rounded transition-all ${
                        isSelected ? 'border-accent-primary bg-accent-primary/20' : 'border-text-secondary/40'
                      }`}
                      style={{
                        width: preset.ratio >= 1 ? '40px' : `${Math.round(40 * preset.ratio)}px`,
                        height: preset.ratio <= 1 ? '40px' : `${Math.round(40 / preset.ratio)}px`,
                      }}
                    />
                  </div>
                  <span className={`text-xs font-semibold ${isSelected ? 'text-accent-primary' : 'text-text-primary'}`}>
                    {preset.shortLabel}
                  </span>
                  <span className="text-[10px] text-text-muted mt-0.5 font-mono">
                    {preset.width}×{preset.height}
                  </span>
                  <span className="text-[9px] text-text-secondary text-center mt-1 leading-tight line-clamp-1">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Reframing Preview & Diagnostic Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-hairline bg-bg-surface/50">
          {/* Visual Canvas Diagram */}
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-bg-canvas border border-hairline min-h-[160px]">
            <div className="text-[10px] text-text-muted mb-2 uppercase font-medium">Reframing Geometry Preview</div>
            <div className="relative w-44 h-28 border border-blue-500/40 bg-blue-500/5 rounded flex items-center justify-center overflow-hidden">
              <span className="absolute top-1 left-1.5 text-[8px] font-mono text-blue-400">
                Source {currentWidth}×{currentHeight}
              </span>
              {/* Target Crop Box */}
              <div
                className="border-2 border-dashed border-accent-primary bg-accent-primary/15 rounded flex items-center justify-center transition-all"
                style={{
                  width: targetPreset.ratio >= 1 ? '85%' : `${Math.round(85 * (targetPreset.ratio / (currentWidth / currentHeight)))}%`,
                  height: targetPreset.ratio <= 1 ? '85%' : `${Math.round(85 * ((currentWidth / currentHeight) / targetPreset.ratio))}%`,
                  maxWidth: '92%',
                  maxHeight: '92%',
                }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold text-accent-primary font-mono">{targetPreset.shortLabel}</span>
                  <span className="text-[7px] text-text-secondary">Crop View</span>
                </div>
              </div>
              {/* Safe margin indicator for vertical formats */}
              {(targetPreset.id === '9:16' || targetPreset.id === '4:5') && repositionSubtitles && (
                <div className="absolute bottom-2 inset-x-4 border-t border-emerald-400/60 flex items-center justify-center">
                  <span className="text-[7px] font-medium text-emerald-400 -mt-2.5 bg-bg-canvas px-1">
                    Subtitle Safe Zone
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Transformation Stats */}
          <div className="flex flex-col justify-center gap-2.5 col-span-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-hairline">
              <span className="text-text-muted">Aspect Fill Zoom Scale:</span>
              <span className="font-semibold text-text-primary font-mono">
                {Math.round(scale * 100)}% ({scale.toFixed(2)}x)
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-hairline">
              <span className="text-text-muted">Tracking Motion Axis:</span>
              <span className="font-semibold text-text-primary">
                {panBounds.maxPanX > 0 ? (
                  <span className="text-amber-400">Horizontal Pan-and-Scan (±{(panBounds.maxPanX * 100).toFixed(0)}%)</span>
                ) : panBounds.maxPanY > 0 ? (
                  <span className="text-amber-400">Vertical Tilt-and-Scan (±{(panBounds.maxPanY * 100).toFixed(0)}%)</span>
                ) : (
                  <span className="text-emerald-400">Centered (No Pan Shift Required)</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-hairline">
              <span className="text-text-muted">Target Resolution:</span>
              <span className="font-semibold text-text-primary font-mono">
                {targetPreset.width} × {targetPreset.height} ({targetPreset.name})
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-text-muted">Target Platform:</span>
              <span className="text-text-secondary font-medium">{targetPreset.description}</span>
            </div>
          </div>
        </div>

        {/* Tracking Options & Subtitle Protection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tracking Tuning */}
          <div className="flex flex-col gap-3 p-3.5 rounded-lg border border-hairline bg-bg-surface/30">
            <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent-primary">motion_photos_on</span>
              Subject Tracking Speed
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'slow', label: 'Slow', desc: 'Talking Head / Interviews' },
                  { id: 'default', label: 'Default', desc: 'Vlog / Balanced' },
                  { id: 'fast', label: 'Fast', desc: 'Action / Sports' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTrackingSpeed(mode.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded border text-center transition-all ${
                    trackingSpeed === mode.id
                      ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-medium'
                      : 'border-hairline bg-bg-surface text-text-secondary hover:bg-bg-subtle'
                  }`}
                >
                  <span className="text-xs">{mode.label}</span>
                  <span className="text-[9px] text-text-muted mt-0.5 leading-tight">{mode.desc}</span>
                </button>
              ))}
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-text-muted">Motion Keyframe Interval:</span>
              <select
                value={motionInterval}
                onChange={(e) => setMotionInterval(parseFloat(e.target.value))}
                className="bg-bg-canvas border border-hairline rounded px-2 py-1 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              >
                <option value={0.5}>0.5s (High Frequency)</option>
                <option value={1.0}>1.0s (Recommended)</option>
                <option value={2.0}>2.0s (Subtle Drifts)</option>
              </select>
            </div>
          </div>

          {/* Subtitle Protection & Destination Mode */}
          <div className="flex flex-col gap-3 p-3.5 rounded-lg border border-hairline bg-bg-surface/30">
            <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent-primary">subtitles</span>
              Safe Zones & Target Output
            </div>

            {/* Subtitle Safe-Margin Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={repositionSubtitles}
                onChange={(e) => setRepositionSubtitles(e.target.checked)}
                className="mt-0.5 rounded border-hairline text-accent-primary focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-medium text-text-primary block">
                  Reposition Subtitles to Safe Margins
                </span>
                <span className="text-[11px] text-text-muted block mt-0.5">
                  Clamps subtitles above vertical TikTok/Reels UI action buttons to prevent obscured captions.
                </span>
              </div>
            </label>

            {/* Sequence Mode Selection */}
            <div className="mt-1 border-t border-hairline pt-2.5">
              <span className="text-[11px] font-medium text-text-muted block mb-1.5 uppercase tracking-wider">
                Reframing Output Mode
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="creationMode"
                    value="duplicate"
                    checked={creationMode === 'duplicate'}
                    onChange={() => setCreationMode('duplicate')}
                    className="text-accent-primary focus:ring-0"
                  />
                  <span className="text-text-primary font-medium">Duplicate Sequence</span>
                  <span className="text-[10px] text-emerald-400 font-mono">(Safe)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="creationMode"
                    value="inplace"
                    checked={creationMode === 'inplace'}
                    onChange={() => setCreationMode('inplace')}
                    className="text-accent-primary focus:ring-0"
                  />
                  <span className="text-text-primary font-medium">In-Place Reframe</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline mt-1">
          <div className="text-[11px] text-text-muted">
            {videoClipCount === 0 ? (
              <span className="text-amber-400">⚠️ No video clips found on active timeline.</span>
            ) : (
              <span>Ready to generate pan-and-scan keyframes for {videoClipCount} video clips.</span>
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
              disabled={isProcessing || videoClipCount === 0}
              className="flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              <span>{isProcessing ? 'Reframing...' : `Apply Auto-Reframe (${targetPreset.shortLabel})`}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
