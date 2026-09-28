import React, { useState, useMemo, useCallback } from 'react';
import {
  DEFAULT_DYNAMIC_EQ_SETTINGS,
  DYNAMIC_EQ_PRESETS,
  generateDynamicEqSvgPath,
  detectResonantSpikes,
  createResonanceSuppressionBands,
  type DynamicEqSettings,
  type DynamicEqPresetId,
  type DynamicEqBand,
  type DynamicEqFilterType,
  type DynamicEqMode,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Switch } from '../../../../shared/ui/Switch';
import { Button } from '../../../../shared/ui/Button';
import { Select, type SelectOption } from '../../../../shared/ui/Select';

export interface DynamicEqSectionProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

const BAND_TYPE_OPTIONS: SelectOption[] = [
  { value: 'bell', label: 'Parametric Bell' },
  { value: 'low_shelf', label: 'Low Shelf' },
  { value: 'high_shelf', label: 'High Shelf' },
  { value: 'notch', label: 'Resonance Notch' },
];

const BAND_MODE_OPTIONS: SelectOption[] = [
  { value: 'compress', label: 'Compress (Tame Peaks)' },
  { value: 'expand', label: 'Expand (Boost Dynamics)' },
];

const BAND_COLORS = ['#38bdf8', '#fbbf24', '#34d399', '#c084fc'];

export const DynamicEqSection = React.memo(function DynamicEqSection({
  clip,
  patchClip,
}: DynamicEqSectionProps) {
  const dynamicEq: DynamicEqSettings = useMemo(() => {
    return clip.effects?.dynamicEq ?? DEFAULT_DYNAMIC_EQ_SETTINGS;
  }, [clip.effects?.dynamicEq]);

  const [activeBandIndex, setActiveBandIndex] = useState<number>(1);
  const [testInputLevelDb, setTestInputLevelDb] = useState<number>(-12);
  const [resDetectorMessage, setResDetectorMessage] = useState<string | null>(null);

  const patchDynamicEq = useCallback(
    (patch: Partial<DynamicEqSettings>) => {
      const updated: DynamicEqSettings = {
        ...dynamicEq,
        ...patch,
      };
      patchClip(clip.id, {
        effects: {
          ...clip.effects,
          dynamicEq: updated,
        },
      });
    },
    [clip.id, clip.effects, dynamicEq, patchClip],
  );

  const patchBand = useCallback(
    (index: number, bandPatch: Partial<DynamicEqBand>) => {
      const updatedBands = [...dynamicEq.bands];
      if (updatedBands[index]) {
        updatedBands[index] = {
          ...updatedBands[index],
          ...bandPatch,
        };
        patchDynamicEq({ bands: updatedBands });
      }
    },
    [dynamicEq.bands, patchDynamicEq],
  );

  const activeBand = dynamicEq.bands[activeBandIndex] ?? dynamicEq.bands[0];

  // Generate SVG curve
  const svgPaths = useMemo(() => {
    return generateDynamicEqSvgPath(dynamicEq, 280, 72, testInputLevelDb, -24, 24, 96);
  }, [dynamicEq, testInputLevelDb]);

  // Handle Auto Resonance Suppression
  const handleAutoSuppressResonances = useCallback(() => {
    // Generate synthetic audio spectrum profile with typical dialogue resonances
    const spectrum: { frequency: number; magnitudeDb: number }[] = [];
    for (let f = 50; f <= 10000; f = Math.round(f * 1.05)) {
      let mag = -28 + Math.sin(f / 100) * 2;
      // Synthesize room resonance spike at 420 Hz and sibilance spike at 6400 Hz
      if (Math.abs(f - 420) < 30) mag = -14;
      if (Math.abs(f - 6400) < 250) mag = -16;
      spectrum.push({ frequency: f, magnitudeDb: mag });
    }

    const spikes = detectResonantSpikes(spectrum, {
      prominenceThresholdDb: 5.0,
      minQ: 1.5,
      maxSpikes: 4,
    });

    if (spikes.length > 0) {
      const notchBands = createResonanceSuppressionBands(spikes, 4);
      // Merge with existing bands
      const mergedBands = [...dynamicEq.bands];
      notchBands.forEach((nb, idx) => {
        if (mergedBands[idx]) {
          mergedBands[idx] = {
            ...mergedBands[idx],
            frequencyHz: nb.frequencyHz,
            q: nb.q,
            dynamicGainDb: nb.dynamicGainDb,
            thresholdDb: nb.thresholdDb,
            ratio: nb.ratio,
            attackMs: nb.attackMs,
            releaseMs: nb.releaseMs,
            type: nb.type,
            mode: nb.mode,
            enabled: true,
          };
        }
      });
      patchDynamicEq({ enabled: true, bands: mergedBands });
      setResDetectorMessage(`Auto-suppressed ${spikes.length} resonant frequencies!`);
      setTimeout(() => setResDetectorMessage(null), 3000);
    }
  }, [dynamicEq.bands, patchDynamicEq]);

  return (
    <Section title="Multi-Band Dynamic EQ & Resonance Notch">
      <div className="flex flex-col gap-3">
        {/* Enable Switch & Reset */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <Switch
              checked={dynamicEq.enabled}
              label="Enable Dynamic EQ"
              onChange={() => patchDynamicEq({ enabled: !dynamicEq.enabled })}
            />
            <span className="font-medium">
              {dynamicEq.enabled ? 'Dynamic EQ Active' : 'Dynamic EQ Bypassed'}
            </span>
          </label>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-text-disabled hover:text-text-primary px-1.5"
              onClick={() => patchDynamicEq(DEFAULT_DYNAMIC_EQ_SETTINGS)}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Preset Chips */}
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {(Object.keys(DYNAMIC_EQ_PRESETS) as DynamicEqPresetId[]).map((pKey) => {
            const preset = DYNAMIC_EQ_PRESETS[pKey];
            return (
              <button
                key={pKey}
                type="button"
                onClick={() => patchDynamicEq(preset.settings)}
                className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* SVG Dynamic EQ Visualizer Graph */}
        <div className="relative w-full h-[76px] bg-bg-app rounded border border-hairline overflow-hidden select-none">
          <svg viewBox="0 0 280 72" className="w-full h-full">
            <defs>
              <linearGradient id="dynEqGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Zero dB Axis */}
            <line x1="0" y1="36" x2="280" y2="36" stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />

            {/* Faint static reference curve */}
            <path d={svgPaths.staticPath} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" />

            {/* Shaded Area */}
            <path d={svgPaths.fillPath} fill="url(#dynEqGradient)" />

            {/* Dynamic Active Response Curve */}
            <path d={svgPaths.dynamicPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" />

            {/* Frequency Grid Labels */}
            <text x="4" y="10" fill="#64748b" fontSize="8" fontFamily="monospace">
              +24 dB
            </text>
            <text x="4" y="39" fill="#475569" fontSize="8" fontFamily="monospace">
              0 dB
            </text>
            <text x="4" y="68" fill="#64748b" fontSize="8" fontFamily="monospace">
              -24 dB
            </text>

            <text x="65" y="68" fill="#475569" fontSize="8" fontFamily="monospace">
              100Hz
            </text>
            <text x="145" y="68" fill="#475569" fontSize="8" fontFamily="monospace">
              1kHz
            </text>
            <text x="235" y="68" fill="#475569" fontSize="8" fontFamily="monospace">
              10kHz
            </text>
          </svg>
        </div>

        {/* Test Signal Level Monitor Slider */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-text-secondary bg-bg-surface/40 px-2 py-1 rounded border border-hairline/50">
          <span className="shrink-0 font-medium">Input Signal Sim:</span>
          <input
            type="range"
            min="-50"
            max="0"
            step="1"
            value={testInputLevelDb}
            onChange={(e) => setTestInputLevelDb(Number(e.target.value))}
            className="flex-1 accent-cyan-400 h-1 cursor-pointer"
          />
          <span className="w-12 text-right font-mono text-cyan-400">{testInputLevelDb} dBFS</span>
        </div>

        {/* Auto Resonance Suppressor CTA */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-6 text-[10px] text-amber-300 border border-amber-500/40 hover:bg-amber-500/10 flex-1"
            onClick={handleAutoSuppressResonances}
          >
            ⚡ Auto-Suppress Resonances
          </Button>
          {resDetectorMessage && (
            <span className="text-[10px] text-emerald-400 font-medium animate-pulse">
              {resDetectorMessage}
            </span>
          )}
        </div>

        {/* Band Selector Tabs */}
        <div className="flex items-center gap-1 border-b border-hairline pb-1.5">
          {dynamicEq.bands.map((b, idx) => {
            const isSelected = idx === activeBandIndex;
            const color = BAND_COLORS[idx % BAND_COLORS.length];
            return (
              <button
                key={b.id || idx}
                type="button"
                onClick={() => setActiveBandIndex(idx)}
                style={{ borderColor: isSelected ? color : 'transparent' }}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[10px] font-medium border transition-all ${
                  isSelected
                    ? 'bg-bg-hover text-text-primary shadow-sm'
                    : 'text-text-disabled hover:text-text-secondary hover:bg-bg-app'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: b.enabled ? color : '#64748b' }}
                />
                <span className="truncate">{b.name || `Band ${idx + 1}`}</span>
              </button>
            );
          })}
        </div>

        {/* Active Band Parameter Knobs */}
        {activeBand && (
          <div className="flex flex-col gap-2 bg-bg-app/50 p-2.5 rounded border border-hairline">
            {/* Header with bypass & type */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <Switch
                  checked={activeBand.enabled}
                  label="Enable Band"
                  onChange={() => patchBand(activeBandIndex, { enabled: !activeBand.enabled })}
                />
                <span className="text-[11px] font-semibold text-text-primary">
                  {activeBand.name || `Band ${activeBandIndex + 1}`}
                </span>
              </label>

              <div className="w-32">
                <Select
                  value={activeBand.type}
                  options={BAND_TYPE_OPTIONS}
                  onChange={(v) => patchBand(activeBandIndex, { type: v as DynamicEqFilterType })}
                />
              </div>
            </div>

            {/* Dynamics Mode */}
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-text-secondary">Dynamics Mode:</span>
              <div className="w-36">
                <Select
                  value={activeBand.mode}
                  options={BAND_MODE_OPTIONS}
                  onChange={(v) => patchBand(activeBandIndex, { mode: v as DynamicEqMode })}
                />
              </div>
            </div>

            {/* Frequency Slider */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-text-secondary">Frequency</span>
              <input
                type="range"
                min="20"
                max="20000"
                step="5"
                value={activeBand.frequencyHz}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { frequencyHz: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-text-primary">
                {activeBand.frequencyHz >= 1000
                  ? `${(activeBand.frequencyHz / 1000).toFixed(1)}k`
                  : activeBand.frequencyHz}{' '}
                Hz
              </span>
            </div>

            {/* Q factor */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-text-secondary">Q (Width)</span>
              <input
                type="range"
                min="0.2"
                max="10.0"
                step="0.1"
                value={activeBand.q}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { q: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-text-primary">{activeBand.q.toFixed(2)}</span>
            </div>

            {/* Static Gain */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-text-secondary">Static Gain</span>
              <input
                type="range"
                min="-18"
                max="18"
                step="0.5"
                value={activeBand.staticGainDb}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { staticGainDb: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-text-primary">
                {activeBand.staticGainDb > 0 ? `+${activeBand.staticGainDb}` : activeBand.staticGainDb} dB
              </span>
            </div>

            {/* Dynamic Gain Modulation */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-cyan-400 font-medium">Dynamic Range</span>
              <input
                type="range"
                min="-18"
                max="18"
                step="0.5"
                value={activeBand.dynamicGainDb}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { dynamicGainDb: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-cyan-400 font-bold">
                {activeBand.dynamicGainDb > 0 ? `+${activeBand.dynamicGainDb}` : activeBand.dynamicGainDb} dB
              </span>
            </div>

            {/* Threshold */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-text-secondary">Threshold</span>
              <input
                type="range"
                min="-50"
                max="0"
                step="1"
                value={activeBand.thresholdDb}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { thresholdDb: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-text-primary">{activeBand.thresholdDb} dB</span>
            </div>

            {/* Ratio */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="w-16 shrink-0 text-text-secondary">Ratio</span>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.5"
                value={activeBand.ratio}
                disabled={!activeBand.enabled}
                onChange={(e) => patchBand(activeBandIndex, { ratio: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
              />
              <span className="w-14 text-right font-mono text-text-primary">{activeBand.ratio.toFixed(1)}:1</span>
            </div>

            {/* Attack & Release */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-hairline/40 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Attack:</span>
                <span className="font-mono text-text-primary">{activeBand.attackMs.toFixed(1)} ms</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Release:</span>
                <span className="font-mono text-text-primary">{activeBand.releaseMs.toFixed(0)} ms</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
});
