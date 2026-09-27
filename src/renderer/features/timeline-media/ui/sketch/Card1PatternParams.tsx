import type React from 'react';
import {
  WHITEBOARD_TRACE_DEFAULTS,
  type WhiteboardSettings,
  type WhiteboardZone,
  type WhiteboardZoneType,
  type SequenceClip,
} from '@shared';
import { Button } from '../../../../shared/ui/Button';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';
import { REVEAL_PATTERN_CATEGORIES, type RevealPatternCategory } from './types';

export interface Card1PatternParamsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
  targetClip: SequenceClip | null;
  frameWidth: number;
  frameHeight: number;
  setZoneEditorOpen: (open: boolean) => void;
  paneFileInputRef: React.RefObject<HTMLInputElement | null>;
  handlePaneImportAnnotation: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePaneExportAnnotation: () => void;
}

export function Card1PatternParams({
  activeSettings,
  updateSettings,
  targetClip,
  setZoneEditorOpen,
  paneFileInputRef,
  handlePaneImportAnnotation,
  handlePaneExportAnnotation,
}: Card1PatternParamsProps) {
  const selectedPattern = activeSettings.pattern as RevealPatternCategory;

  const handleUpdateZone = (zoneIndex: number, patch: Partial<WhiteboardZone>) => {
    if (!activeSettings.zones) return;
    const updated = activeSettings.zones.map((z, idx) =>
      idx === zoneIndex ? { ...z, ...patch } : z,
    );
    updateSettings({ ...activeSettings, zones: updated });
  };

  const handleDeleteZone = (zoneIndex: number) => {
    if (!activeSettings.zones) return;
    const filtered = activeSettings.zones.filter((_, idx) => idx !== zoneIndex);
    const next: WhiteboardSettings =
      filtered.length > 0
        ? { ...activeSettings, zones: filtered }
        : (() => {
            const rest = { ...activeSettings };
            delete rest.zones;
            return rest;
          })();
    updateSettings(next);
  };

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
          Pattern Settings: {REVEAL_PATTERN_CATEGORIES.find((c) => c.id === selectedPattern)?.label}
        </span>
        <span className="text-[10px] font-mono text-text-disabled uppercase">
          {selectedPattern}
        </span>
      </div>

      {/* Writing (Serpentine) Settings */}
      {selectedPattern === 'serpentine' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary">Writing Rows</span>
            <span className="font-mono text-text-primary font-medium">
              {activeSettings.rows ?? 8} lines
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={activeSettings.rows ?? 8}
            aria-label="Writing Rows"
            className="w-full accent-[var(--accent-ai)] cursor-pointer"
            onChange={(e) =>
              updateSettings({ ...activeSettings, rows: Number(e.target.value) })
            }
          />
          <p className="text-[10px] text-text-disabled leading-relaxed">
            The stylus sweeps left-to-right across {activeSettings.rows ?? 8} horizontal
            reading lines with natural carriage returns.
          </p>

          {/* Milestone S105: Kinetic Typography & Handwriting Cadence */}
          <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">text_fields</span>
                  Kinetic Handwriting Flow
                </span>
                <span className="text-[10px] text-text-disabled">
                  Letter-by-letter organic handwriting cadence
                </span>
              </div>
              <input
                type="checkbox"
                checked={activeSettings.kineticTypography?.enabled ?? false}
                aria-label="Kinetic Handwriting Flow"
                className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    kineticTypography: {
                      ...(activeSettings.kineticTypography ?? {}),
                      enabled: e.target.checked,
                    },
                  })
                }
              />
            </div>

            {activeSettings.kineticTypography?.enabled && (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Letter Cadence</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {activeSettings.kineticTypography?.letterCadenceMs ?? 150} ms/char
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={400}
                  step={10}
                  value={activeSettings.kineticTypography?.letterCadenceMs ?? 150}
                  aria-label="Letter Cadence"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      kineticTypography: {
                        ...(activeSettings.kineticTypography ?? {}),
                        letterCadenceMs: Number(e.target.value),
                      },
                    })
                  }
                />

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Punctuation Pause</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {activeSettings.kineticTypography?.punctuationPauseMs ?? 320} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={800}
                  step={20}
                  value={activeSettings.kineticTypography?.punctuationPauseMs ?? 320}
                  aria-label="Punctuation Pause"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      kineticTypography: {
                        ...(activeSettings.kineticTypography ?? {}),
                        punctuationPauseMs: Number(e.target.value),
                      },
                    })
                  }
                />

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Cursive Ligatures</span>
                  <input
                    type="checkbox"
                    checked={activeSettings.kineticTypography?.cursiveLigatures ?? false}
                    aria-label="Cursive Ligatures"
                    className="accent-[var(--accent-ai)] cursor-pointer h-3.5 w-3.5"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        kineticTypography: {
                          ...(activeSettings.kineticTypography ?? {}),
                          cursiveLigatures: e.target.checked,
                        },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Motor Tremor (Jitter)</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {((activeSettings.kineticTypography?.handwritingJitter ?? 0.15) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.02}
                  value={activeSettings.kineticTypography?.handwritingJitter ?? 0.15}
                  aria-label="Handwriting Jitter"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      kineticTypography: {
                        ...(activeSettings.kineticTypography ?? {}),
                        handwritingJitter: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Milestone S106: Script Direction & Bidirectional Writing */}
          <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">format_textdirection_r_to_l</span>
                  Script Direction
                </span>
                <span className="text-[10px] text-text-disabled">
                  LTR / RTL (Arabic, Hebrew) & carriage returns
                </span>
              </div>
              <SegmentedControl
                value={activeSettings.bidiWriting?.direction ?? 'auto'}
                onChange={(dir) =>
                  updateSettings({
                    ...activeSettings,
                    bidiWriting: {
                      ...(activeSettings.bidiWriting ?? {}),
                      direction: dir as 'auto' | 'ltr' | 'rtl' | 'vertical',
                    },
                  })
                }
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'ltr', label: 'LTR' },
                  { value: 'rtl', label: 'RTL' },
                ]}
                ariaLabel="Script direction"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <div className="flex flex-col">
                <span className="text-text-secondary">Two-Pass Cursive Diacritics</span>
                <span className="text-[10px] text-text-disabled">Write word skeleton first, then dots/vowels</span>
              </div>
              <input
                type="checkbox"
                checked={activeSettings.bidiWriting?.deferDiacritics ?? true}
                aria-label="Two-Pass Cursive Diacritics"
                className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    bidiWriting: {
                      ...(activeSettings.bidiWriting ?? {}),
                      deferDiacritics: e.target.checked,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Wipe Settings */}
      {selectedPattern === 'wipe' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary">Wipe Direction</span>
            <span className="font-mono text-text-primary text-[10px]">
              {activeSettings.rows === 1 ? 'Straight Edge' : 'Directional'}
            </span>
          </div>
          <SegmentedControl
            value={activeSettings.rows === 1 ? 'lr' : 'lr'}
            onChange={() => {
              updateSettings({ ...activeSettings, rows: 1 });
            }}
            options={[
              { value: 'lr', label: 'Left to Right' },
            ]}
            ariaLabel="Wipe direction"
          />
          <p className="text-[10px] text-text-disabled leading-relaxed">
            Clean continuous edge sweep revealing the full image without row breaks.
          </p>
        </div>
      )}

      {/* Custom Zones Settings */}
      {selectedPattern === 'zones' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-secondary">Region-by-Region Masks</span>
            <span className="rounded bg-accent-ai/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent-ai">
              {activeSettings.zones?.length ?? 0} zone(s)
            </span>
          </div>

          <p className="text-[11px] text-text-secondary leading-relaxed">
            Partition the image into sequenced regions so each section is fully drawn before
            moving to the next. The timeline lane shows visual thumbnails for each zone.
          </p>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!targetClip?.filePath}
              className="flex-1 flex items-center justify-center gap-1.5 font-medium shadow-sm"
              onClick={() => setZoneEditorOpen(true)}
              title={!targetClip?.filePath ? 'Select a clip on the timeline to edit zones' : undefined}
            >
              <span className="material-symbols-outlined text-[16px] text-accent-ai">crop_free</span>
              <span>Zone Editor…</span>
            </Button>
            <input
              ref={paneFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handlePaneImportAnnotation}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => paneFileInputRef.current?.click()}
              title="Import annotation JSON"
              className="px-2.5 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">file_upload</span>
              <span className="text-[11px]">Import</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!activeSettings.zones || activeSettings.zones.length === 0}
              onClick={handlePaneExportAnnotation}
              title="Export annotation JSON"
              className="px-2.5 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">file_download</span>
              <span className="text-[11px]">Export</span>
            </Button>
          </div>

          {/* Zone Cards List */}
          {activeSettings.zones && activeSettings.zones.length > 0 ? (
            <div className="flex flex-col gap-2 pt-1 border-t border-hairline/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                Configured Zones
              </span>
              {activeSettings.zones.map((zone, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1.5 rounded-md border border-hairline bg-bg-app/60 p-2 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-black/60 px-1 py-0.2 font-mono font-bold text-[9px] text-accent-ai border border-accent-ai/30">
                        Z{idx + 1}
                      </span>
                      <span className="font-semibold text-text-primary">
                        Zone {idx + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      title="Delete Zone"
                      onClick={() => handleDeleteZone(idx)}
                      className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-accent-warning/20 hover:text-accent-warning transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">delete</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-text-secondary">Type</span>
                    <SegmentedControl
                      value={zone.type ?? 'sketch'}
                      onChange={(val) =>
                        handleUpdateZone(idx, { type: val as WhiteboardZoneType })
                      }
                      options={[
                        { value: 'sketch', label: 'Contour' },
                        { value: 'writing', label: 'Lines' },
                        { value: 'scribble', label: 'Zigzag' },
                        { value: 'wipe', label: 'Sweep' },
                      ]}
                      ariaLabel={`Zone ${idx + 1} Type`}
                    />
                  </div>

                  {zone.type === 'scribble' && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-hairline/50">
                      <span className="text-[10px] text-text-secondary">Angle & Cross</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-text-disabled">{zone.hatchAngle ?? 45}°</span>
                        <input
                          type="range"
                          min={0}
                          max={180}
                          step={15}
                          value={zone.hatchAngle ?? 45}
                          aria-label="Hatch Angle"
                          className="w-16 accent-[var(--accent-ai)] cursor-pointer"
                          onChange={(e) => handleUpdateZone(idx, { hatchAngle: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                            zone.crossHatch ? 'bg-accent-ai text-white' : 'bg-bg-hover text-text-secondary'
                          }`}
                          onClick={() => handleUpdateZone(idx, { crossHatch: !zone.crossHatch })}
                          title="Toggle two-pass orthogonal cross-hatching"
                        >
                          ✕ Cross
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-text-secondary">Duration Weight</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.5}
                        value={zone.weight ?? 1}
                        aria-label={`Zone ${idx + 1} Weight`}
                        className="w-20 accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          handleUpdateZone(idx, { weight: Number(e.target.value) })
                        }
                      />
                      <span className="font-mono text-[10px] text-text-primary w-6 text-right">
                        {(zone.weight ?? 1).toFixed(1)}x
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline p-3 text-center text-text-disabled">
              <span className="material-symbols-outlined text-[20px] opacity-60">
                draw_abstract
              </span>
              <span className="text-[10px]">
                No custom zones drawn yet. Click above to open the mask editor.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Line-Art Sketch (Trace) Settings */}
      {selectedPattern === 'trace' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-secondary">Line Detail</span>
            <SegmentedControl
              value={activeSettings.trace?.detail ?? WHITEBOARD_TRACE_DEFAULTS.detail}
              onChange={(detail) => {
                if (detail !== 'low' && detail !== 'medium' && detail !== 'high') return;
                updateSettings({
                  ...activeSettings,
                  trace: {
                    ...(activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS),
                    detail,
                  },
                });
              }}
              options={[
                { value: 'low', label: 'Bold' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'Fine' },
              ]}
              ariaLabel="Sketch detail"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-secondary">Stroke Order</span>
            <SegmentedControl
              value={activeSettings.trace?.order ?? WHITEBOARD_TRACE_DEFAULTS.order}
              onChange={(order) => {
                if (order !== 'reading' && order !== 'nearest') return;
                updateSettings({
                  ...activeSettings,
                  trace: {
                    ...(activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS),
                    order,
                  },
                });
              }}
              options={[
                { value: 'nearest', label: 'Flowing' },
                { value: 'reading', label: 'Reading' },
              ]}
              ariaLabel="Stroke order"
            />
          </div>

          {/* Milestone S98: Stroke Saliency Clustering & Contour Prioritization */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-text-secondary">Contour Clustering</span>
              <span className="text-[10px] text-text-disabled">Silhouette-first component grouping</span>
            </div>
            <SegmentedControl
              value={activeSettings.clusteringMode ?? 'hierarchical'}
              onChange={(mode) =>
                updateSettings({
                  ...activeSettings,
                  clusteringMode: mode as 'none' | 'proximity' | 'saliency' | 'hierarchical',
                })
              }
              options={[
                { value: 'hierarchical', label: 'Smart' },
                { value: 'saliency', label: 'Outlines' },
                { value: 'proximity', label: 'Clusters' },
                { value: 'none', label: 'Raw' },
              ]}
              ariaLabel="Contour clustering mode"
            />
          </div>

          {/* Milestone S94: Stroke Smoothing & RDP Decimation */}
          <div className="flex items-center justify-between pt-2 border-t border-hairline">
            <div className="flex flex-col">
              <span className="text-[11px] text-text-secondary">Stroke Smoothing</span>
              <span className="text-[10px] text-text-disabled">Catmull-Rom Bézier spline</span>
            </div>
            <SegmentedControl
              value={activeSettings.strokeSmoothing ?? 'smooth'}
              onChange={(val) =>
                updateSettings({
                  ...activeSettings,
                  strokeSmoothing: val as 'none' | 'subtle' | 'smooth' | 'high',
                })
              }
              options={[
                { value: 'none', label: 'Raw' },
                { value: 'subtle', label: 'Subtle' },
                { value: 'smooth', label: 'Smooth' },
                { value: 'high', label: 'Ultra' },
              ]}
              ariaLabel="Stroke smoothing profile"
            />
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Corner Precision</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.simplifyTolerance ?? 1.2).toFixed(1)} px
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.1}
              value={activeSettings.simplifyTolerance ?? 1.2}
              aria-label="Stroke Decimation Tolerance"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  simplifyTolerance: Number(e.target.value),
                })
              }
            />
          </div>

          {/* Milestone S95: Vector Path Dynamic Morphing */}
          <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">transform</span>
                  Continuous Vector Morphing
                </span>
                <span className="text-[10px] text-text-disabled">
                  Smooth shape tweening into next scene outline
                </span>
              </div>
              <Switch
                checked={activeSettings.morphTransition?.enabled === true}
                onChange={() => {
                  const current = activeSettings.morphTransition?.enabled ?? false;
                  updateSettings({
                    ...activeSettings,
                    morphTransition: {
                      ...activeSettings.morphTransition,
                      enabled: !current,
                      easing: activeSettings.morphTransition?.easing ?? 'ease-in-out',
                      durationSeconds: activeSettings.morphTransition?.durationSeconds ?? 1.0,
                    },
                  });
                }}
                label="Toggle vector morphing"
              />
            </div>

            {activeSettings.morphTransition?.enabled && (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Morph Easing</span>
                  <SegmentedControl
                    value={activeSettings.morphTransition?.easing ?? 'ease-in-out'}
                    onChange={(val) =>
                      updateSettings({
                        ...activeSettings,
                        morphTransition: {
                          ...activeSettings.morphTransition,
                          easing: val as 'linear' | 'ease-in-out' | 'elastic',
                        },
                      })
                    }
                    options={[
                      { value: 'ease-in-out', label: 'Smooth' },
                      { value: 'linear', label: 'Linear' },
                      { value: 'elastic', label: 'Elastic' },
                    ]}
                    ariaLabel="Morph easing"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Morph Duration</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {(activeSettings.morphTransition?.durationSeconds ?? 1.0).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={3.0}
                  step={0.1}
                  value={activeSettings.morphTransition?.durationSeconds ?? 1.0}
                  aria-label="Morph Duration"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      morphTransition: {
                        ...activeSettings.morphTransition,
                        durationSeconds: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Milestone S96: Shading Texture & Cross-Hatching */}
          <div className="flex items-center justify-between pt-2 border-t border-hairline">
            <div className="flex flex-col">
              <span className="text-[11px] text-text-secondary">Shading Style</span>
              <span className="text-[10px] text-text-disabled">Interior region fill texture</span>
            </div>
            <SegmentedControl
              value={activeSettings.shadingStyle ?? 'bloom'}
              onChange={(val) =>
                updateSettings({
                  ...activeSettings,
                  shadingStyle: val as 'bloom' | 'hatch' | 'crosshatch',
                })
              }
              options={[
                { value: 'bloom', label: 'Bloom' },
                { value: 'hatch', label: 'Hatch' },
                { value: 'crosshatch', label: 'Cross' },
              ]}
              ariaLabel="Shading Style"
            />
          </div>

          {/* Milestone S104: AI Bitmap Vectorization & Contour Auto-Trace */}
          <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">auto_fix_high</span>
                  Contour Auto-Trace
                </span>
                <span className="text-[10px] text-text-disabled">
                  Resolution-independent vector outline extraction
                </span>
              </div>
              <input
                type="checkbox"
                checked={activeSettings.autoTrace?.enabled ?? false}
                aria-label="Contour Auto-Trace"
                className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    autoTrace: {
                      ...(activeSettings.autoTrace ?? {}),
                      enabled: e.target.checked,
                    },
                  })
                }
              />
            </div>

            {activeSettings.autoTrace?.enabled && (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Trace Binarization</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {(activeSettings.autoTrace?.threshold ?? 0) === 0
                      ? 'Auto-Otsu'
                      : `${activeSettings.autoTrace?.threshold}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={activeSettings.autoTrace?.threshold ?? 0}
                  aria-label="Trace Binarization Threshold"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      autoTrace: {
                        ...(activeSettings.autoTrace ?? {}),
                        threshold: Number(e.target.value),
                      },
                    })
                  }
                />

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Corner Tolerance</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {(activeSettings.autoTrace?.cornerTolerance ?? 1.2).toFixed(1)} px
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={5.0}
                  step={0.1}
                  value={activeSettings.autoTrace?.cornerTolerance ?? 1.2}
                  aria-label="Trace Corner Tolerance"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      autoTrace: {
                        ...(activeSettings.autoTrace ?? {}),
                        cornerTolerance: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            )}
          </div>

          <p className="text-[10px] text-text-disabled leading-relaxed">
            Vector edge detector traces structural contours first, then smoothly transitions
            into the final picture.
          </p>
        </div>
      )}
    </Card>
  );
}
