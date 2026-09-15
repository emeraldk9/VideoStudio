import { useState } from 'react';

import type { ClipColorFilters, SequenceClip } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { Section } from '../../../shared/ui/Section';

export interface ColorGradingPanelProps {
  clip: SequenceClip;
}

export interface ColorLutPreset {
  id: string;
  name: string;
  tag: string;
  gradient: string;
  filters: ClipColorFilters;
}

export const COLOR_LUT_PRESETS: ColorLutPreset[] = [
  {
    id: 'teal_orange',
    name: 'Teal & Orange',
    tag: 'Blockbuster',
    gradient: 'from-[#0d9488] via-[#f59e0b] to-[#ea580c]',
    filters: { brightness: 0.04, contrast: 1.25, saturation: 1.2, hue: -8, vignette: 0.25 },
  },
  {
    id: 'vintage_film',
    name: 'Vintage 35mm',
    tag: 'Classic Film',
    gradient: 'from-[#78350f] via-[#d97706] to-[#451a03]',
    filters: { brightness: 0.08, contrast: 1.1, saturation: 0.82, hue: 12, vignette: 0.35 },
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk',
    tag: 'Sci-Fi Neon',
    gradient: 'from-[#06b6d4] via-[#8b5cf6] to-[#ec4899]',
    filters: { brightness: 0.0, contrast: 1.35, saturation: 1.4, hue: -25, vignette: 0.4 },
  },
  {
    id: 'moody_noir',
    name: 'Noir Silver',
    tag: 'B&W Cinema',
    gradient: 'from-[#18181b] via-[#71717a] to-[#f4f4f5]',
    filters: { brightness: 0.0, contrast: 1.3, saturation: 0.0, hue: 0, vignette: 0.45 },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    tag: 'Warm Sun',
    gradient: 'from-[#ea580c] via-[#facc15] to-[#fde047]',
    filters: { brightness: 0.06, contrast: 1.15, saturation: 1.25, hue: 16, vignette: 0.2 },
  },
  {
    id: 'clean_commercial',
    name: 'Commercial',
    tag: 'Clean Pop',
    gradient: 'from-[#3b82f6] via-[#10b981] to-[#6366f1]',
    filters: { brightness: 0.03, contrast: 1.12, saturation: 1.15, hue: 0, vignette: 0.0 },
  },
];

export function ColorGradingPanel({ clip }: ColorGradingPanelProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const [activeTab, setActiveTab] = useState<'luts' | 'controls'>('luts');

  const currentFilters = clip.effects?.filters ?? {};

  const handleApplyPreset = (preset: ColorLutPreset) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        filters: {
          ...currentFilters,
          ...preset.filters,
        },
      },
    });
  };

  const handleUpdateFilter = (key: keyof ClipColorFilters, value: number) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        filters: {
          ...currentFilters,
          [key]: value,
        },
      },
    });
  };

  const handleResetFilters = () => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        filters: undefined,
      },
    });
  };

  return (
    <Section
      title="Color Grading & LUTs"
      action={
        clip.effects?.filters ? (
          <button
            type="button"
            className="text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            onClick={handleResetFilters}
          >
            Reset Grade
          </button>
        ) : undefined
      }
    >
      {/* Sub-tab Switcher: LUT Looks vs Precision Sliders */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5 mb-3">
        <button
          type="button"
          onClick={() => setActiveTab('luts')}
          className={`flex-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeTab === 'luts'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Cinematic LUTs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('controls')}
          className={`flex-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeTab === 'controls'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Color Adjustments
        </button>
      </div>

      {activeTab === 'luts' ? (
        <div className="grid grid-cols-2 gap-2">
          {COLOR_LUT_PRESETS.map((preset) => {
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-bg-app p-2 text-left hover:border-accent-ai hover:shadow-xs transition-all"
              >
                <div
                  className={`h-9 w-full rounded-md bg-gradient-to-r ${preset.gradient} opacity-85 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-inner`}
                >
                  <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white tracking-wide">
                    {preset.tag}
                  </span>
                </div>
                <div className="mt-1.5">
                  <span className="block text-xs font-semibold text-text-primary leading-tight">
                    {preset.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(
            [
              { key: 'brightness', label: 'Exposure', min: -0.5, max: 0.5, step: 0.02, neutral: 0, unit: '' },
              { key: 'contrast', label: 'Contrast', min: 0.5, max: 2.0, step: 0.05, neutral: 1, unit: '×' },
              { key: 'saturation', label: 'Saturation', min: 0.0, max: 2.0, step: 0.05, neutral: 1, unit: '×' },
              { key: 'hue', label: 'Hue Rotate', min: -180, max: 180, step: 5, neutral: 0, unit: '°' },
              { key: 'vignette', label: 'Vignette', min: 0.0, max: 1.0, step: 0.05, neutral: 0, unit: '' },
            ] as const
          ).map((control) => {
            const val = currentFilters[control.key] ?? control.neutral;
            return (
              <label key={control.key} className="flex flex-col gap-1 text-xs text-text-secondary">
                <div className="flex items-center justify-between">
                  <span className="text-text-primary font-medium">{control.label}</span>
                  <span className="font-mono text-[11px] text-text-disabled">
                    {val.toFixed(2)}
                    {control.unit}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={val}
                    aria-label={control.label}
                    className="flex-1 accent-[var(--accent-ai)] h-1.5"
                    onChange={(e) => handleUpdateFilter(control.key, Number(e.target.value))}
                  />
                  {val !== control.neutral && (
                    <button
                      type="button"
                      title="Reset parameter"
                      className="text-text-disabled hover:text-text-primary text-xs px-1"
                      onClick={() => handleUpdateFilter(control.key, control.neutral)}
                    >
                      ↺
                    </button>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Section>
  );
}
