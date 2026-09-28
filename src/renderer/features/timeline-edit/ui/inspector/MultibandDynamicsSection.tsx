import React, { useState, useMemo, useCallback } from 'react';
import {
  DEFAULT_MULTIBAND_DYNAMICS_SETTINGS,
  MULTIBAND_DYNAMICS_PRESETS,
  generateBandDynamicsSvgPath,
  type MultibandDynamicsSettings,
  type MultibandDynamicsPresetId,
  type MultibandDynamicsBandId,
  type MultibandDynamicsBand,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Switch } from '../../../../shared/ui/Switch';
import { Button } from '../../../../shared/ui/Button';

export interface MultibandDynamicsSectionProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

const BAND_KEYS: MultibandDynamicsBandId[] = ['low', 'lowMid', 'highMid', 'high'];

const BAND_METADATA: Record<
  MultibandDynamicsBandId,
  { label: string; range: string; color: string; bgActive: string }
> = {
  low: {
    label: 'Low',
    range: 'Sub & Bass',
    color: '#38bdf8', // sky-400
    bgActive: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  },
  lowMid: {
    label: 'Low-Mid',
    range: 'Body & Warmth',
    color: '#34d399', // emerald-400
    bgActive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  },
  highMid: {
    label: 'High-Mid',
    range: 'Presence & Vocals',
    color: '#fbbf24', // amber-400
    bgActive: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  high: {
    label: 'High',
    range: 'Air & Sparkle',
    color: '#c084fc', // purple-400
    bgActive: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  },
};

export const MultibandDynamicsSection = React.memo(function MultibandDynamicsSection({
  clip,
  patchClip,
}: MultibandDynamicsSectionProps) {
  const mbDynamics: MultibandDynamicsSettings = useMemo(() => {
    return clip.effects?.multibandDynamics ?? DEFAULT_MULTIBAND_DYNAMICS_SETTINGS;
  }, [clip.effects?.multibandDynamics]);

  const [activeBandId, setActiveBandId] = useState<MultibandDynamicsBandId>('low');

  const patchMultiband = useCallback(
    (patch: Partial<MultibandDynamicsSettings>) => {
      const updated: MultibandDynamicsSettings = {
        ...mbDynamics,
        ...patch,
      };
      patchClip(clip.id, {
        effects: {
          ...clip.effects,
          multibandDynamics: updated,
        },
      });
    },
    [clip.id, clip.effects, mbDynamics, patchClip],
  );

  const patchBand = useCallback(
    (bandId: MultibandDynamicsBandId, bandPatch: Partial<MultibandDynamicsBand>) => {
      const updatedBands = {
        ...mbDynamics.bands,
        [bandId]: {
          ...mbDynamics.bands[bandId],
          ...bandPatch,
        },
      };
      patchMultiband({ bands: updatedBands });
    },
    [mbDynamics.bands, patchMultiband],
  );

  const activeBand = mbDynamics.bands[activeBandId];
  const meta = BAND_METADATA[activeBandId];

  // SVG transfer curve for active band
  const svgCurves = useMemo(() => {
    return generateBandDynamicsSvgPath(activeBand, 280, 80, -60, 0, 60);
  }, [activeBand]);

  return (
    <Section title="Multiband Dynamics (Mastering Compressor)">
      <div className="flex flex-col gap-3">
        {/* Enable Switch & Reset */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <Switch
              checked={mbDynamics.enabled}
              label="Enable Multiband Dynamics"
              onChange={() => patchMultiband({ enabled: !mbDynamics.enabled })}
            />
            <span className="font-medium">
              {mbDynamics.enabled ? 'Multiband Dynamics Active' : 'Multiband Bypassed'}
            </span>
          </label>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-text-disabled hover:text-text-primary px-1.5"
            onClick={() => patchMultiband(DEFAULT_MULTIBAND_DYNAMICS_SETTINGS)}
          >
            Reset
          </Button>
        </div>

        {/* Studio Mastering Preset Chips */}
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {(Object.keys(MULTIBAND_DYNAMICS_PRESETS) as MultibandDynamicsPresetId[]).map((pKey) => {
            const preset = MULTIBAND_DYNAMICS_PRESETS[pKey];
            return (
              <button
                key={pKey}
                type="button"
                onClick={() => patchMultiband(preset.settings)}
                className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Global Crossover Frequencies & Master Out */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="text-[11px] font-semibold text-text-secondary">
            Crossover Splits & Master Output
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>Low / Mid: <strong className="text-text-primary">{mbDynamics.crossoverLowHz} Hz</strong></span>
              <input
                type="range"
                min={50}
                max={400}
                step={5}
                value={mbDynamics.crossoverLowHz}
                disabled={!mbDynamics.enabled}
                onChange={(e) => patchMultiband({ crossoverLowHz: Number(e.target.value) })}
                className="w-full accent-sky-400 h-1 cursor-pointer"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>Mid / HighMid: <strong className="text-text-primary">{mbDynamics.crossoverMidHz} Hz</strong></span>
              <input
                type="range"
                min={400}
                max={4000}
                step={25}
                value={mbDynamics.crossoverMidHz}
                disabled={!mbDynamics.enabled}
                onChange={(e) => patchMultiband({ crossoverMidHz: Number(e.target.value) })}
                className="w-full accent-amber-400 h-1 cursor-pointer"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>HighMid / High: <strong className="text-text-primary">{mbDynamics.crossoverHighHz} Hz</strong></span>
              <input
                type="range"
                min={2500}
                max={14000}
                step={50}
                value={mbDynamics.crossoverHighHz}
                disabled={!mbDynamics.enabled}
                onChange={(e) => patchMultiband({ crossoverHighHz: Number(e.target.value) })}
                className="w-full accent-purple-400 h-1 cursor-pointer"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-hairline/40">
            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Master Gain:</span>
              <div className="flex items-center gap-1.5 w-36">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={mbDynamics.masterGainDb}
                  disabled={!mbDynamics.enabled}
                  onChange={(e) => patchMultiband({ masterGainDb: Number(e.target.value) })}
                  className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-12 text-right">
                  {mbDynamics.masterGainDb > 0 ? `+${mbDynamics.masterGainDb}` : mbDynamics.masterGainDb} dB
                </span>
              </div>
            </label>
            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Lookahead:</span>
              <div className="flex items-center gap-1.5 w-36">
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={mbDynamics.lookaheadMs}
                  disabled={!mbDynamics.enabled}
                  onChange={(e) => patchMultiband({ lookaheadMs: Number(e.target.value) })}
                  className="flex-1 accent-sky-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-12 text-right">
                  {mbDynamics.lookaheadMs.toFixed(1)} ms
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* 4-Band Tab Selector */}
        <div className="flex items-center gap-1.5">
          {BAND_KEYS.map((bKey) => {
            const b = mbDynamics.bands[bKey];
            const m = BAND_METADATA[bKey];
            const isActive = activeBandId === bKey;

            return (
              <button
                key={bKey}
                type="button"
                onClick={() => setActiveBandId(bKey)}
                className={`flex-1 flex flex-col items-center py-1 px-1.5 rounded border text-xs transition-colors ${
                  isActive
                    ? m.bgActive
                    : 'bg-bg-app border-hairline text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="font-semibold">{m.label}</span>
                </div>
                <span className="text-[9px] text-text-disabled truncate max-w-[55px]">{m.range}</span>
              </button>
            );
          })}
        </div>

        {/* Active Band Dynamics Header: Mute / Solo / Bypass */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <span className="font-semibold text-text-primary">{activeBand.name}</span>
            <span className="text-[10px] text-text-disabled">({meta.label} Band)</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => patchBand(activeBandId, { enabled: !activeBand.enabled })}
              className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                activeBand.enabled
                  ? 'bg-surface-elevated text-text-primary border-hairline'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {activeBand.enabled ? 'On' : 'Bypass'}
            </button>
            <button
              type="button"
              onClick={() => patchBand(activeBandId, { solo: !activeBand.solo, mute: false })}
              className={`px-1.5 py-0.5 rounded text-[10px] border font-bold transition-colors ${
                activeBand.solo
                  ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                  : 'bg-surface-base text-text-disabled border-hairline hover:text-text-primary'
              }`}
            >
              S
            </button>
            <button
              type="button"
              onClick={() => patchBand(activeBandId, { mute: !activeBand.mute, solo: false })}
              className={`px-1.5 py-0.5 rounded text-[10px] border font-bold transition-colors ${
                activeBand.mute
                  ? 'bg-rose-500/30 text-rose-300 border-rose-400'
                  : 'bg-surface-base text-text-disabled border-hairline hover:text-text-primary'
              }`}
            >
              M
            </button>
          </div>
        </div>

        {/* Transfer Curve SVG Visualizer */}
        <div className="relative w-full h-[84px] bg-bg-app rounded border border-hairline overflow-hidden select-none">
          <svg viewBox="0 0 280 80" className="w-full h-full">
            <defs>
              <linearGradient id={`dynGrad_${activeBandId}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={meta.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={meta.color} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            <line x1="0" y1="20" x2="280" y2="20" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="40" x2="280" y2="40" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="60" x2="280" y2="60" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="70" y1="0" x2="70" y2="80" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="140" y1="0" x2="140" y2="80" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="210" y1="0" x2="210" y2="80" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />

            {/* Linear 1:1 diagonal guide */}
            <path d={svgCurves.linearPath} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />

            {/* Shaded Gain Delta Area */}
            <path d={svgCurves.fillPath} fill={`url(#dynGrad_${activeBandId})`} />

            {/* Transfer Curve */}
            <path d={svgCurves.transferPath} fill="none" stroke={meta.color} strokeWidth="1.75" />
          </svg>

          {/* dB Axis Labels */}
          <div className="absolute top-1 left-1.5 text-[9px] font-mono text-text-disabled">0 dB</div>
          <div className="absolute bottom-1 right-1.5 text-[9px] font-mono text-text-disabled">In: -60..0 dB</div>
        </div>

        {/* Downward Compression Parameters */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
            <span>Downward Compressor</span>
            <span className="font-mono text-[10px] text-text-primary">
              Ratio {activeBand.ratio.toFixed(1)}:1
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Threshold:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-60}
                  max={0}
                  step={0.5}
                  value={activeBand.thresholdDb}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { thresholdDb: Number(e.target.value) })}
                  className="flex-1 accent-sky-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.thresholdDb}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Ratio:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={1.0}
                  max={20.0}
                  step={0.1}
                  value={activeBand.ratio}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { ratio: Number(e.target.value) })}
                  className="flex-1 accent-sky-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.ratio.toFixed(1)}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Attack:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={0.1}
                  max={100}
                  step={0.5}
                  value={activeBand.attackMs}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { attackMs: Number(e.target.value) })}
                  className="flex-1 accent-sky-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.attackMs.toFixed(0)}m
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Release:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={5}
                  max={1000}
                  step={5}
                  value={activeBand.releaseMs}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { releaseMs: Number(e.target.value) })}
                  className="flex-1 accent-sky-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.releaseMs.toFixed(0)}m
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Upward Expander Parameters */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-text-secondary">
              <input
                type="checkbox"
                checked={activeBand.upwardExpansionEnabled}
                disabled={!mbDynamics.enabled || !activeBand.enabled}
                onChange={(e) => patchBand(activeBandId, { upwardExpansionEnabled: e.target.checked })}
                className="accent-emerald-400"
              />
              <span>Upward Expander (Ambience / Low-level Lift)</span>
            </label>
            <span className="font-mono text-[10px] text-text-disabled">
              {activeBand.upwardExpansionEnabled ? 'Active' : 'Off'}
            </span>
          </div>

          {activeBand.upwardExpansionEnabled && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-hairline/40">
              <label className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Exp Thresh:</span>
                <div className="flex items-center gap-1.5 w-24">
                  <input
                    type="range"
                    min={-60}
                    max={-10}
                    step={1}
                    value={activeBand.expansionThresholdDb}
                    disabled={!mbDynamics.enabled || !activeBand.enabled}
                    onChange={(e) => patchBand(activeBandId, { expansionThresholdDb: Number(e.target.value) })}
                    className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                  />
                  <span className="font-mono text-text-primary w-8 text-right">
                    {activeBand.expansionThresholdDb}
                  </span>
                </div>
              </label>

              <label className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Max Range:</span>
                <div className="flex items-center gap-1.5 w-24">
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={activeBand.expansionRangeDb}
                    disabled={!mbDynamics.enabled || !activeBand.enabled}
                    onChange={(e) => patchBand(activeBandId, { expansionRangeDb: Number(e.target.value) })}
                    className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                  />
                  <span className="font-mono text-text-primary w-8 text-right">
                    +{activeBand.expansionRangeDb}
                  </span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Makeup Gain & Peak Limiter */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="text-[11px] font-semibold text-text-secondary">
            Band Trim & Peak Limiter Ceiling
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Makeup Gain:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-12}
                  max={18}
                  step={0.5}
                  value={activeBand.makeupGainDb}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { makeupGainDb: Number(e.target.value) })}
                  className="flex-1 accent-amber-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.makeupGainDb > 0 ? `+${activeBand.makeupGainDb}` : activeBand.makeupGainDb}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Limiter Ceiling:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-12}
                  max={0}
                  step={0.1}
                  value={activeBand.limiterCeilingDb}
                  disabled={!mbDynamics.enabled || !activeBand.enabled}
                  onChange={(e) => patchBand(activeBandId, { limiterCeilingDb: Number(e.target.value) })}
                  className="flex-1 accent-rose-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {activeBand.limiterCeilingDb.toFixed(1)}
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </Section>
  );
});
