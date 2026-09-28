import React, { useMemo, useCallback } from 'react';
import {
  DEFAULT_HSL_QUALIFIER_SETTINGS,
  HSL_QUALIFIER_PRESETS,
  generateHslQualifierWedgeSvgPaths,
  type HslQualifierSettings,
  type HslQualifierPresetId,
  type HslMattePreviewMode,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Switch } from '../../../../shared/ui/Switch';
import { Button } from '../../../../shared/ui/Button';

export interface HslQualifierSectionProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

const PREVIEW_MODES: { id: HslMattePreviewMode; label: string; icon: string }[] = [
  { id: 'composite', label: 'Composite', icon: 'visibility' },
  { id: 'black_and_white_matte', label: 'B&W Mask', icon: 'contrast' },
  { id: 'highlight_isolated', label: 'Isolated', icon: 'center_focus_strong' },
  { id: 'inverted_matte', label: 'Inverted', icon: 'invert_colors' },
];

export const HslQualifierSection = React.memo(function HslQualifierSection({
  clip,
  patchClip,
}: HslQualifierSectionProps) {
  const settings: HslQualifierSettings = useMemo(() => {
    return clip.effects?.hslQualifier ?? DEFAULT_HSL_QUALIFIER_SETTINGS;
  }, [clip.effects?.hslQualifier]);

  const patchQualifier = useCallback(
    (patch: Partial<HslQualifierSettings>) => {
      const updated: HslQualifierSettings = {
        ...settings,
        ...patch,
      };
      patchClip(clip.id, {
        effects: {
          ...clip.effects,
          hslQualifier: updated,
        },
      });
    },
    [clip.id, clip.effects, settings, patchClip],
  );

  // SVG Paths for polar HSL color wedge
  const svgWedge = useMemo(() => {
    return generateHslQualifierWedgeSvgPaths(settings.hue, 50, 50, 26, 46);
  }, [settings.hue]);

  return (
    <Section title="HSL Color Qualifier & Secondary Keyer">
      <div className="flex flex-col gap-3">
        {/* Enable Switch & Reset */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <Switch
              checked={settings.enabled}
              label="Enable HSL Qualifier"
              onChange={() => patchQualifier({ enabled: !settings.enabled })}
            />
            <span className="font-medium">
              {settings.enabled ? 'Secondary Keyer Active' : 'Keyer Bypassed'}
            </span>
          </label>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-text-disabled hover:text-text-primary px-1.5"
            onClick={() => patchQualifier(DEFAULT_HSL_QUALIFIER_SETTINGS)}
          >
            Reset
          </Button>
        </div>

        {/* Studio Presets */}
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {(Object.keys(HSL_QUALIFIER_PRESETS) as HslQualifierPresetId[]).map((pKey) => {
            const preset = HSL_QUALIFIER_PRESETS[pKey];
            return (
              <button
                key={pKey}
                type="button"
                onClick={() => patchQualifier(preset.settings)}
                className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Matte Audition Preview Modes */}
        <div className="flex items-center gap-1 p-1 bg-surface-base/80 rounded border border-hairline">
          {PREVIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => patchQualifier({ previewMode: mode.id })}
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-colors ${
                settings.previewMode === mode.id
                  ? 'bg-primary/20 text-primary border border-primary/40 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        {/* HSL Qualification Window (Hue, Saturation, Luminance) */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2.5 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
            <span>Color Qualification Window</span>
            <span className="font-mono text-[10px] text-text-primary">
              Hue {settings.hue.centerDeg}° (±{settings.hue.widthDeg}°)
            </span>
          </div>

          {/* Hue Vector Arc Display */}
          <div className="flex items-center gap-3">
            <div className="w-[100px] h-[100px] shrink-0 relative bg-bg-app rounded-full border border-hairline flex items-center justify-center select-none">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  {/* Conic rainbow gradient approximation via linear stops */}
                  <linearGradient id="hslRainbowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="25%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#22c55e" />
                    <stop offset="75%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>

                {/* Base Wheel Rim */}
                <circle cx="50" cy="50" r="36" fill="none" stroke="#334155" strokeWidth="20" opacity="0.4" />

                {/* Active Qualified Wedge */}
                <path d={svgWedge.activeWedgePath} fill="url(#hslRainbowGrad)" stroke="#38bdf8" strokeWidth="1" />

                {/* Softness boundary indicators */}
                <path d={svgWedge.softBoundaryMinPath} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="1,1" />
                <path d={svgWedge.softBoundaryMaxPath} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="1,1" />

                {/* Center marker */}
                <path d={svgWedge.centerMarkerPath} stroke="#ffffff" strokeWidth="2" />
                <circle cx="50" cy="50" r="3" fill="#ffffff" />
              </svg>
            </div>

            {/* Hue Sliders */}
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="flex items-center justify-between text-[10px] text-text-secondary">
                <span>Center Hue:</span>
                <div className="flex items-center gap-1.5 w-24">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={settings.hue.centerDeg}
                    disabled={!settings.enabled}
                    onChange={(e) =>
                      patchQualifier({
                        hue: { ...settings.hue, centerDeg: Number(e.target.value) },
                      })
                    }
                    className="flex-1 accent-sky-400 h-1 cursor-pointer"
                  />
                  <span className="font-mono text-text-primary w-8 text-right">
                    {settings.hue.centerDeg}°
                  </span>
                </div>
              </label>

              <label className="flex items-center justify-between text-[10px] text-text-secondary">
                <span>Hue Width:</span>
                <div className="flex items-center gap-1.5 w-24">
                  <input
                    type="range"
                    min={1}
                    max={90}
                    step={1}
                    value={settings.hue.widthDeg}
                    disabled={!settings.enabled}
                    onChange={(e) =>
                      patchQualifier({
                        hue: { ...settings.hue, widthDeg: Number(e.target.value) },
                      })
                    }
                    className="flex-1 accent-sky-400 h-1 cursor-pointer"
                  />
                  <span className="font-mono text-text-primary w-8 text-right">
                    ±{settings.hue.widthDeg}°
                  </span>
                </div>
              </label>

              <label className="flex items-center justify-between text-[10px] text-text-secondary">
                <span>Hue Softness:</span>
                <div className="flex items-center gap-1.5 w-24">
                  <input
                    type="range"
                    min={0}
                    max={45}
                    step={1}
                    value={settings.hue.softnessDeg}
                    disabled={!settings.enabled}
                    onChange={(e) =>
                      patchQualifier({
                        hue: { ...settings.hue, softnessDeg: Number(e.target.value) },
                      })
                    }
                    className="flex-1 accent-sky-400 h-1 cursor-pointer"
                  />
                  <span className="font-mono text-text-primary w-8 text-right">
                    {settings.hue.softnessDeg}°
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Saturation & Luminance Ranges */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-hairline/40">
            {/* Saturation Range */}
            <div className="flex flex-col gap-1 text-[10px] text-text-secondary">
              <span className="font-medium text-text-primary">
                Saturation Range ({Math.round(settings.saturation.low * 100)}% – {Math.round(settings.saturation.high * 100)}%)
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.saturation.low}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      saturation: {
                        ...settings.saturation,
                        low: Math.min(Number(e.target.value), settings.saturation.high - 0.05),
                      },
                    })
                  }
                  className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                  title="Sat Low"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.saturation.high}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      saturation: {
                        ...settings.saturation,
                        high: Math.max(Number(e.target.value), settings.saturation.low + 0.05),
                      },
                    })
                  }
                  className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                  title="Sat High"
                />
              </div>
            </div>

            {/* Luminance Range */}
            <div className="flex flex-col gap-1 text-[10px] text-text-secondary">
              <span className="font-medium text-text-primary">
                Luma Range ({Math.round(settings.luminance.low * 100)}% – {Math.round(settings.luminance.high * 100)}%)
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.luminance.low}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      luminance: {
                        ...settings.luminance,
                        low: Math.min(Number(e.target.value), settings.luminance.high - 0.05),
                      },
                    })
                  }
                  className="flex-1 accent-amber-400 h-1 cursor-pointer"
                  title="Luma Low"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.luminance.high}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      luminance: {
                        ...settings.luminance,
                        high: Math.max(Number(e.target.value), settings.luminance.low + 0.05),
                      },
                    })
                  }
                  className="flex-1 accent-amber-400 h-1 cursor-pointer"
                  title="Luma High"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Matte Refinement (Invert, Clean Black, Clean White, Blur) */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-text-secondary">Matte Refinement</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-text-primary">
              <input
                type="checkbox"
                checked={settings.refinement.invert}
                disabled={!settings.enabled}
                onChange={(e) =>
                  patchQualifier({
                    refinement: { ...settings.refinement, invert: e.target.checked },
                  })
                }
                className="accent-primary"
              />
              <span>Invert Matte</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>Clean Black: <strong className="text-text-primary">{Math.round(settings.refinement.cleanBlack * 100)}%</strong></span>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.01}
                value={settings.refinement.cleanBlack}
                disabled={!settings.enabled}
                onChange={(e) =>
                  patchQualifier({
                    refinement: { ...settings.refinement, cleanBlack: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-400 h-1 cursor-pointer"
              />
            </label>

            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>Clean White: <strong className="text-text-primary">{Math.round(settings.refinement.cleanWhite * 100)}%</strong></span>
              <input
                type="range"
                min={0.6}
                max={1.0}
                step={0.01}
                value={settings.refinement.cleanWhite}
                disabled={!settings.enabled}
                onChange={(e) =>
                  patchQualifier({
                    refinement: { ...settings.refinement, cleanWhite: Number(e.target.value) },
                  })
                }
                className="w-full accent-emerald-400 h-1 cursor-pointer"
              />
            </label>

            <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
              <span>Blur Radius: <strong className="text-text-primary">{settings.refinement.blurRadius.toFixed(1)} px</strong></span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={settings.refinement.blurRadius}
                disabled={!settings.enabled}
                onChange={(e) =>
                  patchQualifier({
                    refinement: { ...settings.refinement, blurRadius: Number(e.target.value) },
                  })
                }
                className="w-full accent-sky-400 h-1 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Secondary Color Corrections */}
        <div className="p-2 rounded bg-surface-base/60 border border-hairline flex flex-col gap-2 text-xs">
          <div className="text-[11px] font-semibold text-text-secondary">
            Secondary Color Corrections
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Hue Shift:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={settings.correction.hueShiftDeg}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, hueShiftDeg: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-purple-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.hueShiftDeg > 0 ? `+${settings.correction.hueShiftDeg}` : settings.correction.hueShiftDeg}°
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Saturation:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={0}
                  max={2.5}
                  step={0.05}
                  value={settings.correction.saturationScale}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, saturationScale: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.saturationScale.toFixed(2)}x
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Contrast:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-0.5}
                  max={0.5}
                  step={0.02}
                  value={settings.correction.contrast}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, contrast: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-amber-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.contrast > 0 ? `+${settings.correction.contrast.toFixed(2)}` : settings.correction.contrast.toFixed(2)}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Exposure:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-0.5}
                  max={0.5}
                  step={0.02}
                  value={settings.correction.brightness}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, brightness: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-amber-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.brightness > 0 ? `+${settings.correction.brightness.toFixed(2)}` : settings.correction.brightness.toFixed(2)}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Temp:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={settings.correction.temperature}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, temperature: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-orange-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.temperature > 0 ? `+${settings.correction.temperature}` : settings.correction.temperature}
                </span>
              </div>
            </label>

            <label className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Tint:</span>
              <div className="flex items-center gap-1.5 w-24">
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={settings.correction.tint}
                  disabled={!settings.enabled}
                  onChange={(e) =>
                    patchQualifier({
                      correction: { ...settings.correction, tint: Number(e.target.value) },
                    })
                  }
                  className="flex-1 accent-fuchsia-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-text-primary w-8 text-right">
                  {settings.correction.tint > 0 ? `+${settings.correction.tint}` : settings.correction.tint}
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </Section>
  );
});
