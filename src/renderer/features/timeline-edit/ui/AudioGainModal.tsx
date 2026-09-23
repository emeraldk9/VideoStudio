import { useEffect, useState } from 'react';

import {
  clampGainDb,
  formatGainDb,
  framesToSeconds,
  MAX_GAIN_DB,
  MIN_GAIN_DB,
  secondsToFrames,
  stepGainDb,
  UNITY_GAIN_DB,
  type SequenceClip,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';

export interface AudioGainModalProps {
  open: boolean;
  clip: SequenceClip | null;
  fps: number;
  onClose: () => void;
}

type GainPreset =
  | { label: string; delta: number; direct?: undefined }
  | { label: string; direct: number; delta?: undefined };

const GAIN_PRESETS: GainPreset[] = [
  { label: '-12 dB', delta: -12 },
  { label: '-6 dB', delta: -6 },
  { label: '-3 dB', delta: -3 },
  { label: '-1 dB', delta: -1 },
  { label: '0 dB (Unity)', direct: 0 },
  { label: '+1 dB', delta: 1 },
  { label: '+3 dB', delta: 3 },
  { label: '+6 dB', delta: 6 },
  { label: '+12 dB', delta: 12 },
];

const FADE_PRESETS = [0, 0.25, 0.5, 1.0, 2.0];

export function AudioGainModal({ open, clip, fps, onClose }: AudioGainModalProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);

  const [gainDb, setGainDb] = useState<number>(UNITY_GAIN_DB);
  const [fadeInFrames, setFadeInFrames] = useState<number>(0);
  const [fadeOutFrames, setFadeOutFrames] = useState<number>(0);

  // Sync state on open
  useEffect(() => {
    if (clip && open) {
      setGainDb(clip.gainDb ?? UNITY_GAIN_DB);
      setFadeInFrames(clip.fadeInFrames ?? 0);
      setFadeOutFrames(clip.fadeOutFrames ?? 0);
    }
  }, [clip, open]);

  if (!clip) return null;

  const maxFadeFrames = Math.floor(clip.durationFrames / 2);

  const linearPercent = Math.round(10 ** (gainDb / 20) * 100);

  const handleApply = () => {
    patchClip(clip.id, {
      gainDb: clampGainDb(gainDb),
      fadeInFrames: Math.max(0, Math.min(maxFadeFrames * 2, fadeInFrames)),
      fadeOutFrames: Math.max(0, Math.min(maxFadeFrames * 2, fadeOutFrames)),
    });
    onClose();
  };

  const handleReset = () => {
    setGainDb(UNITY_GAIN_DB);
    setFadeInFrames(0);
    setFadeOutFrames(0);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">graphic_eq</span>
          <span>Audio Gain & Fades</span>
        </div>
      }
      subtitle={`Adjust gain levels and fade curves for "${clip.label || 'Audio Clip'}"`}
    >
      <div className="flex flex-col gap-4 select-none">
        {/* Gain HUD Banner */}
        <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-app p-3.5">
          <div>
            <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
              Clip Audio Gain
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-mono text-2xl font-bold text-text-primary">
                {formatGainDb(gainDb)}
              </span>
              <span className="text-xs font-mono text-text-muted">
                ({linearPercent}% linear volume)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setGainDb((g) => stepGainDb(g, -1))}
              title="Decrease gain by 1 dB ([)"
            >
              -1 dB
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setGainDb((g) => stepGainDb(g, +1))}
              title="Increase gain by 1 dB (])"
            >
              +1 dB
            </Button>
          </div>
        </div>

        {/* Continuous Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-muted px-0.5">
            <span>-40 dB (Silence)</span>
            <button
              type="button"
              className="text-[11px] font-semibold text-accent-ai hover:underline"
              onClick={() => setGainDb(0)}
            >
              Snap to 0 dB
            </button>
            <span>+20 dB (Boost)</span>
          </div>
          <input
            type="range"
            min={MIN_GAIN_DB}
            max={MAX_GAIN_DB}
            step={0.5}
            value={gainDb}
            onChange={(e) => setGainDb(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none bg-bg-hover accent-accent-ai cursor-pointer"
          />
        </div>

        {/* Preset Chips */}
        <div>
          <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider mb-1.5 block">
            Gain Presets
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {GAIN_PRESETS.map((preset) => {
              const isActive = preset.direct !== undefined ? gainDb === preset.direct : false;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    if (preset.direct !== undefined) {
                      setGainDb(preset.direct);
                    } else if (preset.delta !== undefined) {
                      setGainDb((g) => stepGainDb(g, preset.delta));
                    }
                  }}
                  className={[
                    'rounded-lg border px-2.5 py-1.5 text-xs font-mono font-medium transition-all text-center',
                    isActive
                      ? 'border-accent-ai bg-accent-ai/15 text-accent-ai shadow-xs'
                      : 'border-hairline bg-bg-card text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                  ].join(' ')}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fade In and Fade Out Controls */}
        <div className="rounded-xl border border-hairline bg-bg-card p-3 space-y-3">
          <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
            Audio Fades
          </span>

          {/* Fade In */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Fade In</span>
              <span className="font-mono text-text-primary font-medium">
                {framesToSeconds(fadeInFrames, fps).toFixed(2)}s ({fadeInFrames}f)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {FADE_PRESETS.map((sec) => {
                const targetFrames = secondsToFrames(sec, fps);
                const isActive = fadeInFrames === targetFrames;
                return (
                  <button
                    key={`in-${sec}`}
                    type="button"
                    onClick={() => setFadeInFrames(targetFrames)}
                    className={[
                      'flex-1 rounded border py-1 text-[11px] font-mono transition-all',
                      isActive
                        ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-semibold'
                        : 'border-hairline bg-bg-app text-text-muted hover:text-text-primary',
                    ].join(' ')}
                  >
                    {sec === 0 ? 'None' : `${sec}s`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fade Out */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Fade Out</span>
              <span className="font-mono text-text-primary font-medium">
                {framesToSeconds(fadeOutFrames, fps).toFixed(2)}s ({fadeOutFrames}f)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {FADE_PRESETS.map((sec) => {
                const targetFrames = secondsToFrames(sec, fps);
                const isActive = fadeOutFrames === targetFrames;
                return (
                  <button
                    key={`out-${sec}`}
                    type="button"
                    onClick={() => setFadeOutFrames(targetFrames)}
                    className={[
                      'flex-1 rounded border py-1 text-[11px] font-mono transition-all',
                      isActive
                        ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-semibold'
                        : 'border-hairline bg-bg-app text-text-muted hover:text-text-primary',
                    ].join(' ')}
                  >
                    {sec === 0 ? 'None' : `${sec}s`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <Button size="sm" variant="ghost" onClick={handleReset}>
            Reset (0 dB, No Fades)
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
