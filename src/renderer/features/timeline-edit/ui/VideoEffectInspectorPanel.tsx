import { useMemo } from 'react';

import {
  videoEffectPresetById,
  type SequenceClip,
  type VideoEffectSettings,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useMediaPanelStore } from '../../timeline-media';
import { Section } from '../../../shared/ui/Section';

export interface VideoEffectInspectorPanelProps {
  clip: SequenceClip;
}

export function VideoEffectInspectorPanel({ clip }: VideoEffectInspectorPanelProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const setMediaCategory = useMediaPanelStore((state) => state.setCategory);

  const activeEffect = clip.effects?.videoEffect;
  const preset = useMemo(() => {
    return activeEffect ? videoEffectPresetById(activeEffect.presetId) : undefined;
  }, [activeEffect]);

  const handleUpdate = (patch: Partial<VideoEffectSettings>) => {
    if (!activeEffect) return;
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        videoEffect: {
          ...activeEffect,
          ...patch,
        },
      },
    });
  };

  const handleRemove = () => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        videoEffect: undefined,
      },
    });
  };

  if (!activeEffect) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-hairline/60 bg-bg-canvas p-6 text-center select-none">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-hover text-text-disabled">
          <span className="material-symbols-outlined text-[22px]">auto_fix_high</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-primary">No Video Effect Applied</span>
          <p className="text-[11px] text-text-secondary max-w-[240px]">
            Add dynamic camera shakes, glitches, blurs, retro filters, or atmosphere effects from the Effects library.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMediaCategory('effects')}
          className="flex items-center gap-1.5 rounded-button bg-accent-ai px-3 py-1.5 text-xs font-medium text-text-on-accent hover:brightness-110 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
          <span>Browse Effects</span>
        </button>
      </div>
    );
  }

  return (
    <Section
      title={activeEffect.label}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={activeEffect.disabled ? 'Enable effect' : 'Mute effect'}
            onClick={() => handleUpdate({ disabled: !activeEffect.disabled })}
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
              activeEffect.disabled
                ? 'text-text-disabled hover:text-text-primary bg-bg-hover'
                : 'text-accent-ai bg-accent-ai/20'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {activeEffect.disabled ? 'visibility_off' : 'visibility'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="text-[11px] font-medium text-rose-400 hover:text-rose-300 transition-colors"
          >
            Remove
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Preset Info Banner */}
        <div className="flex items-center justify-between rounded-card border border-hairline/60 bg-bg-canvas px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-accent-ai text-[20px]">
              {preset?.icon ?? 'auto_fix_high'}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-primary">{activeEffect.label}</span>
              <span className="text-[10px] text-text-disabled capitalize">
                {activeEffect.category.replace('_', ' ')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMediaCategory('effects')}
            className="text-[10px] font-medium text-accent-ai hover:underline"
          >
            Change
          </button>
        </div>

        {/* Sliders Container */}
        <div className="flex flex-col gap-3 rounded-card border border-hairline/60 bg-bg-canvas p-3">
          {/* Intensity Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Intensity</span>
              <span className="font-mono text-[11px] text-text-primary font-medium">
                {activeEffect.intensity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={activeEffect.intensity}
              onChange={(e) => handleUpdate({ intensity: Number(e.target.value) })}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
            />
          </div>

          {/* Speed Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Speed / Tempo</span>
              <span className="font-mono text-[11px] text-text-primary font-medium">
                {activeEffect.speed}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={activeEffect.speed}
              onChange={(e) => handleUpdate({ speed: Number(e.target.value) })}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
            />
          </div>

          {/* Scale / Radius Slider (if supported) */}
          {preset?.defaultScale !== undefined && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Scale / Size</span>
                <span className="font-mono text-[11px] text-text-primary font-medium">
                  {activeEffect.scale ?? preset.defaultScale}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={activeEffect.scale ?? preset.defaultScale}
                onChange={(e) => handleUpdate({ scale: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
              />
            </div>
          )}

          {/* Custom Param Slider (e.g., Flake density, Shutter angle, Blur radius) */}
          {preset?.paramLabel && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{preset.paramLabel}</span>
                <span className="font-mono text-[11px] text-text-primary font-medium">
                  {activeEffect.param ?? preset.defaultParam ?? 50}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={activeEffect.param ?? preset.defaultParam ?? 50}
                onChange={(e) => handleUpdate({ param: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
              />
            </div>
          )}

          {/* Color Tint (if applicable) */}
          {preset?.colorHex && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-secondary">Color Tint</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={activeEffect.colorHex ?? preset.colorHex}
                  onChange={(e) => handleUpdate({ colorHex: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-hairline bg-transparent p-0"
                />
                <span className="font-mono text-[11px] text-text-secondary uppercase">
                  {activeEffect.colorHex ?? preset.colorHex}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
