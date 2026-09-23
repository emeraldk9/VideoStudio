import { useState, useMemo } from 'react';

import {
  COLOR_GRADING_PRESETS,
  DEFAULT_COLOR_GRADING,
  DEFAULT_COLOR_WHEEL_VALUE,
  isNeutralColorGrading,
  type ColorGradingPreset,
  type ColorGradingSettings,
  type ColorWheelValue,
  type SequenceClip,
  LUT_PRESETS,
  DEFAULT_LUT_SETTINGS,
  type ClipLutSettings,
  type LutPresetKey,
  calculateColorMatchGrade,
  generateSyntheticStatsFromGrade,
  type ColorMatchMode,
  type ColorStatistics,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Section';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import { ColorWheel } from './ColorWheel';

export interface ColorGradingPanelProps {
  clip: SequenceClip;
}

export function ColorGradingPanel({ clip }: ColorGradingPanelProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const document = useSequenceStore((state) => state.document);
  const pushToast = useToastStore((state) => state.pushToast);

  const [activeSubTab, setActiveSubTab] = useState<'wheels' | 'tone' | 'presets' | 'lut' | 'match'>('wheels');

  // S74 Shot Match State
  const [selectedRefClipId, setSelectedRefClipId] = useState<string>('');
  const [selectedRefPreset, setSelectedRefPreset] = useState<string>('warm_golden');
  const [matchMode, setMatchMode] = useState<ColorMatchMode>('full');
  const [matchStrength, setMatchStrength] = useState<number>(1.0);
  const [preserveSkinTones, setPreserveSkinTones] = useState<boolean>(true);

  const otherClips = useMemo(() => {
    return (document?.clips ?? []).filter(
      (c) => c.id !== clip.id && (c.sourceKind === 'video' || c.sourceKind === 'still' || c.sourceKind === 'compound' || c.sourceKind === 'effect'),
    );
  }, [document?.clips, clip.id]);

  const grade: ColorGradingSettings = clip.effects?.colorGrade ?? { ...DEFAULT_COLOR_GRADING };
  const isGraded = !isNeutralColorGrading(clip.effects?.colorGrade) || Boolean(clip.effects?.lut?.enabled);
  const lut: ClipLutSettings = clip.effects?.lut ?? { ...DEFAULT_LUT_SETTINGS };

  const updateLut = (patch: Partial<ClipLutSettings>) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        lut: {
          ...lut,
          ...patch,
        },
      },
    });
  };

  const updateGrade = (nextGrade: ColorGradingSettings) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        colorGrade: isNeutralColorGrading(nextGrade) ? undefined : nextGrade,
      },
    });
  };

  const updateWheel = (wheelKey: 'lift' | 'gamma' | 'gain', wheelValue: ColorWheelValue) => {
    updateGrade({
      ...grade,
      [wheelKey]: wheelValue,
    });
  };

  const updateParam = <K extends keyof ColorGradingSettings>(
    param: K,
    val: ColorGradingSettings[K],
  ) => {
    updateGrade({
      ...grade,
      [param]: val,
    });
  };

  const handleApplyPreset = (preset: ColorGradingPreset) => {
    updateGrade({ ...preset.settings });
  };

  const targetStats = useMemo(() => {
    return generateSyntheticStatsFromGrade(grade, 'neutral');
  }, [grade]);

  const referenceStats = useMemo(() => {
    if (selectedRefClipId) {
      const refClip = otherClips.find((c) => c.id === selectedRefClipId);
      if (refClip) {
        return generateSyntheticStatsFromGrade(refClip.effects?.colorGrade, 'neutral');
      }
    }
    const profileMap: Record<string, 'warm' | 'cool' | 'bright' | 'dark' | 'neutral'> = {
      warm_golden: 'warm',
      cool_scandi: 'cool',
      clean_studio: 'bright',
      dark_shadows: 'dark',
      neutral_rec709: 'neutral',
    };
    return generateSyntheticStatsFromGrade(undefined, profileMap[selectedRefPreset] ?? 'warm');
  }, [selectedRefClipId, otherClips, selectedRefPreset]);

  const handleApplyColorMatch = () => {
    const matchedGrade = calculateColorMatchGrade(targetStats, referenceStats, {
      matchMode,
      strength: matchStrength,
      preserveSkinTones,
    });
    updateGrade(matchedGrade);
    const refName = selectedRefClipId
      ? otherClips.find((c) => c.id === selectedRefClipId)?.label ?? 'reference clip'
      : 'selected profile';
    pushToast({
      variant: 'success',
      message: `Shot color matched to ${refName}!`,
    });
  };

  const handleResetAll = () => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        colorGrade: undefined,
      },
    });
  };

  return (
    <Section
      title="3-Way Color Wheels & Grading"
      action={
        isGraded ? (
          <button
            type="button"
            className="text-[11px] font-medium text-accent-ai hover:underline transition-all flex items-center gap-1"
            onClick={handleResetAll}
            title="Reset color grade to neutral"
          >
            <span className="material-symbols-outlined text-[13px]">restart_alt</span>
            <span>Reset Grade</span>
          </button>
        ) : undefined
      }
    >
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5 mb-3 select-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('wheels')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeSubTab === 'wheels'
              ? 'bg-bg-selected text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">palette</span>
          <span>3-Way Wheels</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('tone')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeSubTab === 'tone'
              ? 'bg-bg-selected text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">tune</span>
          <span>Balance & Tone</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('presets')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeSubTab === 'presets'
              ? 'bg-bg-selected text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
          <span>Cinema Looks</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('lut')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeSubTab === 'lut'
              ? 'bg-bg-selected text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">filter</span>
          <span>3D LUTs</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('match')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-button py-1 text-center text-[11px] font-medium transition-all ${
            activeSubTab === 'match'
              ? 'bg-bg-selected text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">compare</span>
          <span>Shot Match</span>
        </button>
      </div>

      {/* Tab 1: 3-Way Chromatic Wheels (Lift, Gamma, Gain) */}
      {activeSubTab === 'wheels' && (
        <div className="flex flex-col gap-3">
          {/* Wheels Row / Stack */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <ColorWheel
              label="Lift"
              subLabel="Shadows"
              colorTone="shadows"
              value={grade.lift}
              onChange={(val) => updateWheel('lift', val)}
            />
            <ColorWheel
              label="Gamma"
              subLabel="Midtones"
              colorTone="midtones"
              value={grade.gamma}
              onChange={(val) => updateWheel('gamma', val)}
            />
            <ColorWheel
              label="Gain"
              subLabel="Highlights"
              colorTone="highlights"
              value={grade.gain}
              onChange={(val) => updateWheel('gain', val)}
            />
          </div>

          {/* Quick White Balance Sliders Under Wheels */}
          <div className="flex flex-col gap-2.5 p-2.5 rounded-lg border border-hairline bg-bg-surface/30 mt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
              White Balance
            </span>

            {/* Temperature Slider: Cool/Blue ↔ Warm/Amber */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-amber-400">thermostat</span>
                  Temperature
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {grade.temperature > 0 ? '+' : ''}{grade.temperature}
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={grade.temperature}
                  onChange={(e) => updateParam('temperature', Number(e.target.value))}
                  onDoubleClick={() => updateParam('temperature', 0)}
                  title="Color Temperature (Double click to reset)"
                  className="w-full h-2 rounded appearance-none cursor-pointer accent-amber-400"
                  style={{
                    background:
                      'linear-gradient(to right, #38bdf8 0%, #64748b 50%, #f59e0b 100%)',
                  }}
                />
              </div>
            </div>

            {/* Tint Slider: Green ↔ Magenta */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-fuchsia-400">palette</span>
                  Tint
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {grade.tint > 0 ? '+' : ''}{grade.tint}
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={grade.tint}
                  onChange={(e) => updateParam('tint', Number(e.target.value))}
                  onDoubleClick={() => updateParam('tint', 0)}
                  title="Color Tint (Double click to reset)"
                  className="w-full h-2 rounded appearance-none cursor-pointer accent-fuchsia-400"
                  style={{
                    background:
                      'linear-gradient(to right, #22c55e 0%, #64748b 50%, #d946ef 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Primary Tone & Dynamic Range */}
      {activeSubTab === 'tone' && (
        <div className="flex flex-col gap-3">
          {/* Exposure Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Exposure (EV)</span>
              <span className="font-mono text-[11px] text-text-muted">
                {grade.exposure > 0 ? '+' : ''}{grade.exposure.toFixed(2)} EV
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-3.0}
                max={3.0}
                step={0.05}
                value={grade.exposure}
                onChange={(e) => updateParam('exposure', Number(e.target.value))}
                onDoubleClick={() => updateParam('exposure', 0)}
                className="flex-1 h-1.5 accent-accent-ai cursor-pointer"
              />
              {grade.exposure !== 0 && (
                <button
                  type="button"
                  onClick={() => updateParam('exposure', 0)}
                  title="Reset Exposure"
                  className="text-text-disabled hover:text-text-primary text-xs"
                >
                  ↺
                </button>
              )}
            </div>
          </div>

          {/* Contrast Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Contrast</span>
              <span className="font-mono text-[11px] text-text-muted">
                {grade.contrast.toFixed(2)}×
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.02}
                value={grade.contrast}
                onChange={(e) => updateParam('contrast', Number(e.target.value))}
                onDoubleClick={() => updateParam('contrast', 1.0)}
                className="flex-1 h-1.5 accent-accent-ai cursor-pointer"
              />
              {grade.contrast !== 1.0 && (
                <button
                  type="button"
                  onClick={() => updateParam('contrast', 1.0)}
                  title="Reset Contrast"
                  className="text-text-disabled hover:text-text-primary text-xs"
                >
                  ↺
                </button>
              )}
            </div>
          </div>

          {/* Saturation Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Saturation</span>
              <span className="font-mono text-[11px] text-text-muted">
                {grade.saturation.toFixed(2)}×
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.0}
                max={2.0}
                step={0.02}
                value={grade.saturation}
                onChange={(e) => updateParam('saturation', Number(e.target.value))}
                onDoubleClick={() => updateParam('saturation', 1.0)}
                className="flex-1 h-1.5 accent-accent-ai cursor-pointer"
              />
              {grade.saturation !== 1.0 && (
                <button
                  type="button"
                  onClick={() => updateParam('saturation', 1.0)}
                  title="Reset Saturation"
                  className="text-text-disabled hover:text-text-primary text-xs"
                >
                  ↺
                </button>
              )}
            </div>
          </div>

          {/* Vibrance (Skin-Safe Smart Saturation) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Vibrance (Skin-Tone Safe)</span>
              <span className="font-mono text-[11px] text-text-muted">
                {grade.vibrance > 0 ? '+' : ''}{grade.vibrance}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={grade.vibrance}
                onChange={(e) => updateParam('vibrance', Number(e.target.value))}
                onDoubleClick={() => updateParam('vibrance', 0)}
                className="flex-1 h-1.5 accent-accent-ai cursor-pointer"
              />
              {grade.vibrance !== 0 && (
                <button
                  type="button"
                  onClick={() => updateParam('vibrance', 0)}
                  title="Reset Vibrance"
                  className="text-text-disabled hover:text-text-primary text-xs"
                >
                  ↺
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cinematic Preset Looks */}
      {activeSubTab === 'presets' && (
        <div className="grid grid-cols-1 gap-2">
          {COLOR_GRADING_PRESETS.map((preset) => {
            const isActive =
              preset.id !== 'neutral' &&
              grade.contrast === preset.settings.contrast &&
              grade.saturation === preset.settings.saturation &&
              grade.temperature === preset.settings.temperature;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`group flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                  isActive
                    ? 'border-accent-ai bg-accent-ai/10 shadow-sm'
                    : 'border-hairline bg-bg-app hover:border-accent-ai/50'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-text-primary group-hover:text-accent-ai transition-colors">
                    {preset.name}
                  </span>
                  <span className="text-[10px] text-text-disabled line-clamp-1">
                    {preset.description}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isActive && (
                    <span className="material-symbols-outlined text-[16px] text-accent-ai">
                      check_circle
                    </span>
                  )}
                  <span className="material-symbols-outlined text-[14px] text-text-disabled group-hover:text-text-primary transition-colors">
                    chevron_right
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Tab 4: 3D LUT (Look-Up Tables) & Film Emulation */}
      {activeSubTab === 'lut' && (
        <div className="flex flex-col gap-3">
          {/* Enable Switch & Intensity */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <Switch
                checked={lut.enabled}
                label="Enable 3D LUT"
                onChange={() => updateLut({ enabled: !lut.enabled })}
              />
              <span className="font-medium">
                {lut.enabled ? '3D LUT Active' : '3D LUT Bypassed'}
              </span>
            </label>

            {lut.enabled && (
              <button
                type="button"
                onClick={() => updateLut({ enabled: false })}
                className="text-[11px] text-text-disabled hover:text-text-primary transition-colors"
              >
                Disable
              </button>
            )}
          </div>

          {/* Intensity Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">LUT Intensity</span>
              <span className="font-mono text-[11px] text-text-muted">
                {Math.round(lut.intensity * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={lut.intensity}
                disabled={!lut.enabled}
                onChange={(e) => updateLut({ intensity: Number(e.target.value) })}
                className="flex-1 h-1.5 accent-accent-ai cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {/* Preset Cards */}
          <div className="grid grid-cols-1 gap-2">
            {LUT_PRESETS.map((preset) => {
              const isSelected = lut.enabled && lut.preset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => updateLut({ enabled: true, preset: preset.key })}
                  className={`group flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-accent-ai bg-accent-ai/10 shadow-sm'
                      : 'border-hairline bg-bg-app hover:border-accent-ai/50'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-text-primary group-hover:text-accent-ai transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[9px] uppercase font-mono px-1 rounded bg-bg-canvas text-text-disabled border border-hairline/60">
                        {preset.category}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-disabled line-clamp-1">
                      {preset.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isSelected && (
                      <span className="material-symbols-outlined text-[16px] text-accent-ai">
                        check_circle
                      </span>
                    )}
                    <span className="material-symbols-outlined text-[14px] text-text-disabled group-hover:text-text-primary transition-colors">
                      chevron_right
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 5: Shot-to-Shot Color Match & Auto-Grading (Milestone S74) */}
      {activeSubTab === 'match' && (
        <div className="flex flex-col gap-3.5">
          {/* Hero Explainer Banner */}
          <div className="flex items-start gap-2.5 rounded-xl border border-hairline/70 bg-bg-app p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-ai/15 text-accent-ai">
              <span className="material-symbols-outlined text-[18px]">compare</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text-primary">Shot-to-Shot Color Match</span>
              <p className="text-[11px] text-text-disabled mt-0.5 leading-snug">
                Harmonize exposure, contrast, white balance, and 3-way color wheels to match a Hero Reference shot across scenes.
              </p>
            </div>
          </div>

          {/* Reference Source Selection */}
          <div className="flex flex-col gap-2 rounded-xl border border-hairline/60 bg-bg-app p-3">
            <label className="text-xs font-semibold text-text-primary flex items-center justify-between">
              <span>Hero Reference Source</span>
              <span className="text-[10px] text-accent-ai font-mono uppercase">
                {selectedRefClipId ? 'Timeline Clip' : 'Aesthetic Profile'}
              </span>
            </label>

            {otherClips.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div>
                  <span className="text-[11px] text-text-secondary block mb-1">Match Against Timeline Clip:</span>
                  <Select
                    value={selectedRefClipId}
                    options={[
                      { value: '', label: '— Use Preset Profile Below —' },
                      ...otherClips.map((c) => ({
                        value: c.id,
                        label: `${c.label || 'Unnamed Clip'} (${c.sourceKind})`,
                      })),
                    ]}
                    onChange={(val) => setSelectedRefClipId(val)}
                  />
                </div>

                {!selectedRefClipId && (
                  <div>
                    <span className="text-[11px] text-text-secondary block mb-1">Or Cinematic Preset Profile:</span>
                    <Select
                      value={selectedRefPreset}
                      options={[
                        { value: 'warm_golden', label: 'Golden Hour (Warm Cinematic)' },
                        { value: 'cool_scandi', label: 'Nordic Noir (Cool Moody)' },
                        { value: 'clean_studio', label: 'Commercial Studio (Bright Clean)' },
                        { value: 'dark_shadows', label: 'Moody Thriller (Deep Shadows)' },
                        { value: 'neutral_rec709', label: 'Neutral Rec.709 (Flat Balance)' },
                      ]}
                      onChange={(val) => setSelectedRefPreset(val)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span className="text-[11px] text-text-secondary block mb-1">Cinematic Reference Profile:</span>
                <Select
                  value={selectedRefPreset}
                  options={[
                    { value: 'warm_golden', label: 'Golden Hour (Warm Cinematic)' },
                    { value: 'cool_scandi', label: 'Nordic Noir (Cool Moody)' },
                    { value: 'clean_studio', label: 'Commercial Studio (Bright Clean)' },
                    { value: 'dark_shadows', label: 'Moody Thriller (Deep Shadows)' },
                    { value: 'neutral_rec709', label: 'Neutral Rec.709 (Flat Balance)' },
                  ]}
                  onChange={(val) => setSelectedRefPreset(val)}
                />
              </div>
            )}
          </div>

          {/* Side-by-Side Profile Comparison Cards */}
          <div className="grid grid-cols-2 gap-2">
            {/* Target Profile */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-hairline/60 bg-bg-canvas p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">Target (Current)</span>
              <div className="flex flex-col gap-1 text-[10px] font-mono text-text-secondary">
                <div className="flex justify-between items-center">
                  <span>Luma</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-white/70" style={{ width: `${Math.round(targetStats.meanLuma * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-accent-danger">Red</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-accent-danger" style={{ width: `${Math.round(targetStats.meanR * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-accent-success">Green</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-accent-success" style={{ width: `${Math.round(targetStats.meanG * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400">Blue</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${Math.round(targetStats.meanB * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Reference Profile */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-accent-ai/30 bg-accent-ai/5 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-ai">Hero Reference</span>
              <div className="flex flex-col gap-1 text-[10px] font-mono text-text-secondary">
                <div className="flex justify-between items-center">
                  <span>Luma</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-white/70" style={{ width: `${Math.round(referenceStats.meanLuma * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-accent-danger">Red</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-accent-danger" style={{ width: `${Math.round(referenceStats.meanR * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-accent-success">Green</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-accent-success" style={{ width: `${Math.round(referenceStats.meanG * 100)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400">Blue</span>
                  <div className="w-16 h-1.5 bg-bg-app rounded overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${Math.round(referenceStats.meanB * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Match Configuration Options */}
          <div className="flex flex-col gap-3 rounded-xl border border-hairline/60 bg-bg-app p-3">
            <div>
              <label className="text-xs font-medium text-text-secondary">Match Mode</label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {[
                  { id: 'full', label: 'Full Grade', desc: 'Luma + Chroma' },
                  { id: 'luma_only', label: 'Luma Only', desc: 'Exposure only' },
                  { id: 'chroma_only', label: 'Chroma Only', desc: 'Colors only' },
                ].map((m) => {
                  const active = matchMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMatchMode(m.id as ColorMatchMode)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                        active
                          ? 'border-accent-ai bg-accent-ai/15 text-text-primary font-semibold'
                          : 'border-hairline bg-bg-canvas text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <span className="text-xs">{m.label}</span>
                      <span className="text-[9px] text-text-disabled font-normal mt-0.5">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Match Strength */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Match Strength</span>
                <span className="font-mono text-[11px] text-accent-ai font-semibold">
                  {Math.round(matchStrength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={matchStrength}
                onChange={(e) => setMatchStrength(Number(e.target.value))}
                className="w-full h-1.5 accent-accent-ai cursor-pointer"
              />
            </div>

            {/* Skin Tone Preservation */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
              <div>
                <label className="text-xs font-medium text-text-primary">Preserve Skin Tones</label>
                <p className="text-[10px] text-text-disabled">Protect facial tones from unnatural tint shifts</p>
              </div>
              <Switch
                checked={preserveSkinTones}
                label="Preserve Skin Tones"
                onChange={() => setPreserveSkinTones(!preserveSkinTones)}
              />
            </div>
          </div>

          {/* Action Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleApplyColorMatch}
            className="flex items-center justify-center gap-2 font-semibold shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
            <span>Analyze & Apply Color Match</span>
          </Button>
        </div>
      )}
    </Section>
  );
}
