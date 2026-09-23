import React from 'react';
import {
  PIP_PRESETS,
  PIP_GRID_LAYOUTS,
  DEFAULT_PIP_GRID_SETTINGS,
  autoAssignCollageGrid,
  type PipGridLayoutType,
  type ClipPipGridSettings,
  BLEND_MODES,
  type BlendMode,
  CHROMA_KEY_PRESETS,
  DEFAULT_CHROMA_KEY_SETTINGS,
  type ChromaKeySettings,
  type ChromaKeyPresetKey,
  MASK_SHAPES,
  MASK_PRESETS,
  DEFAULT_MASK_SETTINGS,
  type ClipMaskSettings,
  type MaskShapeType,
  type MaskPresetKey,
  DEFAULT_FILM_EMULATION_SETTINGS,
  FILM_EMULATION_PRESETS,
  type FilmEmulationSettings,
  type FilmStockPresetKey,
  DEFAULT_LENS_OPTICS_SETTINGS,
  LENS_OPTICS_PRESETS,
  type ClipLensOpticsSettings,
  type LensOpticsPresetKey,
  DEFAULT_HDR_TONE_MAPPING_SETTINGS,
  HDR_TONE_MAPPING_PRESETS,
  FALSE_COLOR_IRE_SCALE,
  type HdrToneMappingSettings,
  type HdrToneCurve,
  type HdrToneMappingPresetKey,
  DEFAULT_VIDEO_DENOISER_SETTINGS,
  VIDEO_DENOISER_PRESETS,
  calculateEffectiveNoiseReductionRatio,
  type VideoDenoiserSettings,
  type VideoDenoiserPresetKey,
  DEFAULT_PORTRAIT_MATTING_SETTINGS,
  PORTRAIT_MATTING_PRESETS,
  type PortraitMattingSettings,
  type PortraitMattingViewMode,
  type PortraitMattingPresetKey,
  DEFAULT_OPTICAL_FLOW_SETTINGS,
  OPTICAL_FLOW_PRESETS,
  type OpticalFlowSettings,
  type OpticalFlowMode,
  type OpticalFlowPresetKey,
  type MotionVectorPrecision,
  DEFAULT_VIDEO_STABILIZER_SETTINGS,
  VIDEO_STABILIZER_PRESETS,
  type VideoStabilizerSettings,
  type VideoStabilizerMode,
  type VideoStabilizerPresetKey,
  type SequenceClip,
  type SequenceDocument,
  type ClipOverridableField,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Select } from '../../../../shared/ui/Select';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';
import { Button } from '../../../../shared/ui/Button';
import { useSequenceStore } from '../../../../entities/sequence';
import { useToastStore } from '../../../../shared/model/toastStore';
import { useModalStore } from '../../../../shared/model/modalStore';
import { MotionTrackingSection } from './MotionTrackingSection';
import { SceneCutDetectionSection } from './SceneCutDetectionSection';
import { MultiCamSection } from './MultiCamSection';

export interface VideoInspectorTabProps {
  clip: SequenceClip;
  document: SequenceDocument;
  fps: number;
  overlay: boolean;
  videoClip: boolean;
  currentTab: string;
  patchClip: (
    clipId: string,
    patch: Partial<SequenceClip>,
    overridableField?: ClipOverridableField,
  ) => void;
}

export const VideoInspectorTab = React.memo(function VideoInspectorTab({
  clip,
  document,
  fps,
  overlay,
  videoClip,
  currentTab,
  patchClip,
}: VideoInspectorTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {(currentTab === 'video' || currentTab === 'basic') && overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <Section title="Placement">
          <Select
            aria-label="Picture-in-picture preset"
            value={
              Object.entries(PIP_PRESETS).find(
                ([, preset]) =>
                  (preset.scale ?? 1) === (clip.effects?.transform?.scale ?? 1) &&
                  (preset.x ?? 0.5) === (clip.effects?.transform?.x ?? 0.5) &&
                  (preset.y ?? 0.5) === (clip.effects?.transform?.y ?? 0.5),
              )?.[0] ?? 'custom'
            }
            onChange={(value) => {
              const preset = PIP_PRESETS[value];
              if (!preset) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  transform: { ...preset, opacity: clip.effects?.transform?.opacity },
                },
              });
            }}
            options={[
              { value: 'full', label: 'Full frame' },
              { value: 'right_half', label: 'Right half' },
              { value: 'corner_tl', label: 'Corner — top left' },
              { value: 'corner_tr', label: 'Corner — top right' },
              { value: 'corner_bl', label: 'Corner — bottom left' },
              { value: 'corner_br', label: 'Corner — bottom right' },
              ...(Object.entries(PIP_PRESETS).some(
                ([, preset]) =>
                  (preset.scale ?? 1) === (clip.effects?.transform?.scale ?? 1) &&
                  (preset.x ?? 0.5) === (clip.effects?.transform?.x ?? 0.5) &&
                  (preset.y ?? 0.5) === (clip.effects?.transform?.y ?? 0.5),
              )
                ? []
                : [{ value: 'custom', label: 'Animated / custom' }]),
            ]}
          />
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={clip.effects?.transform?.opacity ?? 1}
              aria-label="Overlay opacity"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    transform: {
                      ...clip.effects?.transform,
                      opacity: Number(event.target.value),
                    },
                  },
                })
              }
            />
            <span className="w-10 shrink-0 text-right font-mono">
              {(clip.effects?.transform?.opacity ?? 1).toFixed(2)}
            </span>
          </label>
        </Section>
      ) : null}

      {/* S43 / S75 — Split Screen & Video Collage Layout */}
      {(currentTab === 'video' || currentTab === 'basic') && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <Section title="Split Screen & Video Collage">
          {(() => {
            const pipGrid = clip.effects?.pipGrid ?? DEFAULT_PIP_GRID_SETTINGS;
            const patchPipGrid = (patch: Partial<ClipPipGridSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  pipGrid: {
                    ...pipGrid,
                    ...patch,
                  },
                },
              });
            };

            const selectedLayoutDef = PIP_GRID_LAYOUTS.find((l) => l.layout === pipGrid.layout);
            const maxCells = selectedLayoutDef?.maxCells ?? 1;

            const allClips = useSequenceStore.getState().document?.clips ?? [];
            const startF = clip.startFrames ?? 0;
            const endF = startF + clip.durationFrames;
            const overlappingClips = allClips.filter(
              (c) =>
                c.sourceKind !== 'audio' &&
                c.sourceKind !== 'text' &&
                c.sourceKind !== 'effect' &&
                (c.startFrames ?? 0) < endF &&
                (c.startFrames ?? 0) + c.durationFrames > startF,
            );

            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Enable Split Collage</span>
                  <Switch
                    label="Enable split collage" checked={pipGrid.enabled} onChange={() => patchPipGrid({ enabled: !pipGrid.enabled })}
                  />
                </div>

                {/* Auto-Assemble Collage Batch Button */}
                {pipGrid.enabled && overlappingClips.length > 1 ? (
                  <div className="flex items-center justify-between p-2 rounded bg-surface-base/80 border border-accent-ai/30 text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium text-text-primary">
                        {overlappingClips.length} Overlapping Clips Found
                      </span>
                      <span className="text-[10px] text-text-secondary">
                        Auto-arrange across {pipGrid.layout}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const assignments = autoAssignCollageGrid(overlappingClips, pipGrid.layout, {
                          borderWidthPx: pipGrid.borderWidthPx,
                          borderColorHex: pipGrid.borderColorHex,
                          cornerRadiusPx: pipGrid.cornerRadiusPx,
                          gapPx: pipGrid.gapPx,
                          shadow: pipGrid.shadow,
                        });
                        assignments.forEach((asgn) => {
                          patchClip(asgn.clipId, {
                            effects: {
                              ...allClips.find((c) => c.id === asgn.clipId)?.effects,
                              pipGrid: asgn.pipGrid,
                            },
                          });
                        });
                        useToastStore.getState().pushToast({ message: `Auto-arranged ${assignments.length} clips in ${selectedLayoutDef?.label ?? pipGrid.layout}`, variant: 'success' });
                      }}
                    >
                      Auto-Assemble
                    </Button>
                  </div>
                ) : null}

                {/* Layout Preset Select */}
                <Select aria-label="Grid Layout"
                  value={pipGrid.layout}
                  disabled={!pipGrid.enabled}
                  onChange={(val) =>
                    patchPipGrid({
                      layout: val as PipGridLayoutType,
                      cellIndex: 0,
                    })
                  }
                  options={PIP_GRID_LAYOUTS.map((item) => ({
                    value: item.layout,
                    label: `${item.label} (${item.maxCells} cells)`,
                  }))}
                />

                {/* Cell Slot Selection */}
                {maxCells > 1 ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary">Cell Assignment</label>
                    <SegmentedControl ariaLabel="Cell Assignment" value={String(pipGrid.cellIndex ?? 0)}
                      disabled={!pipGrid.enabled}
                      onChange={(val) => patchPipGrid({ cellIndex: Number(val) })}
                      options={Array.from({ length: maxCells }, (_, i) => ({
                        value: String(i),
                        label: `Slot ${i + 1}`,
                      }))}
                    />
                  </div>
                ) : null}

                {/* Border & Styling */}
                <div className="flex flex-col gap-2 pt-1 border-t border-hairline">
                  {/* Border Width */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-accent-ai">Border</span>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={1}
                      value={pipGrid.borderWidthPx ?? 0}
                      disabled={!pipGrid.enabled}
                      onChange={(e) => patchPipGrid({ borderWidthPx: Number(e.target.value) })}
                      className="flex-1 accent-accent-ai h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {pipGrid.borderWidthPx ?? 0}px
                    </span>
                  </label>

                  {/* Border Color */}
                  {pipGrid.borderWidthPx && pipGrid.borderWidthPx > 0 ? (
                    <label className="flex items-center gap-3 text-xs text-text-secondary">
                      <span className="w-16 shrink-0">Color</span>
                      <input
                        type="color"
                        value={pipGrid.borderColorHex ?? '#ffffff'}
                        disabled={!pipGrid.enabled}
                        onChange={(e) => patchPipGrid({ borderColorHex: e.target.value })}
                        className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="font-mono text-xs uppercase text-text-primary">
                        {pipGrid.borderColorHex ?? '#ffffff'}
                      </span>
                    </label>
                  ) : null}

                  {/* Corner Radius */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-accent-ai">Radius</span>
                    <input
                      type="range"
                      min={0}
                      max={36}
                      step={2}
                      value={pipGrid.cornerRadiusPx ?? 0}
                      disabled={!pipGrid.enabled}
                      onChange={(e) => patchPipGrid({ cornerRadiusPx: Number(e.target.value) })}
                      className="flex-1 accent-accent-ai h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {pipGrid.cornerRadiusPx ?? 0}px
                    </span>
                  </label>

                  {/* Inter-cell Gap */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-accent-ai">Gap</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={pipGrid.gapPx ?? 0}
                      disabled={!pipGrid.enabled}
                      onChange={(e) => patchPipGrid({ gapPx: Number(e.target.value) })}
                      className="flex-1 accent-accent-ai h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {pipGrid.gapPx ?? 0}px
                    </span>
                  </label>

                  {/* Drop Shadow toggle */}
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={Boolean(pipGrid.shadow)}
                      disabled={!pipGrid.enabled}
                      onChange={(e) => patchPipGrid({ shadow: e.target.checked })}
                      className="accent-[var(--accent-ai)]"
                    />
                    <span>Cast Drop Shadow</span>
                  </label>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* Primary Spine Track Media Controls (Base track properties) */}
      {(currentTab === 'video' || currentTab === 'basic') && !overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <>
          <Section title="Media Source">
            <div className="flex flex-col gap-2 text-xs text-text-secondary">
              <div className="flex items-center justify-between">
                <span className="text-text-disabled">Track</span>
                <span className="font-mono text-text-primary px-1.5 py-0.5 rounded bg-bg-app border border-hairline text-[11px]">
                  Spine (Primary Video)
                </span>
              </div>
              {clip.filePath ? (
                <div className="flex flex-col gap-1">
                  <span className="text-text-disabled">File</span>
                  <p
                    className="font-mono text-[11px] text-text-primary truncate bg-bg-app rounded p-1.5 border border-hairline select-all"
                    title={clip.filePath}
                  >
                    {clip.filePath.split(/[/\\]/).pop() || clip.filePath}
                  </p>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Transform & Canvas">
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={clip.effects?.transform?.opacity ?? 1}
                aria-label="Clip opacity"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) =>
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      transform: { ...clip.effects?.transform, opacity: Number(event.target.value) },
                    },
                  })
                }
              />
              <span className="w-10 shrink-0 text-right font-mono">
                {(clip.effects?.transform?.opacity ?? 1).toFixed(2)}
              </span>
            </label>
          </Section>
        </>
      ) : null}

      {/* S38 / S62 — Video Compositing & Blend Modes (including Adjustment Layers) */}
      {(currentTab === 'video' || currentTab === 'basic') && clip.sourceKind !== 'text' ? (
        <Section title="Compositing & Blend Mode">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
              <span className="text-text-disabled font-medium">Layer Blend Mode</span>
              <Select
                aria-label="Layer blend mode"
                value={clip.effects?.blendMode ?? 'normal'}
                onChange={(val) =>
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      blendMode: (val as BlendMode) === 'normal' ? undefined : (val as BlendMode),
                    },
                  })
                }
                options={BLEND_MODES.map((bm) => ({
                  value: bm.mode,
                  label: `${bm.label} (${bm.category})`,
                }))}
              />
            </label>
            <p className="text-[11px] text-text-disabled italic">
              {BLEND_MODES.find((m) => m.mode === (clip.effects?.blendMode ?? 'normal'))?.description}
            </p>
            {clip.sourceKind === 'effect' && (
              <label className="flex items-center gap-3 text-xs text-text-secondary pt-2 border-t border-hairline/40">
                <span className="w-20 shrink-0 font-medium text-text-disabled">Layer Opacity</span>
                <input
                  type="range"
                  min={0.0}
                  max={1.0}
                  step={0.05}
                  value={clip.effects?.transform?.opacity ?? 1}
                  aria-label="Adjustment layer opacity"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) =>
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        transform: { ...clip.effects?.transform, opacity: Number(event.target.value) },
                      },
                    })
                  }
                />
                <span className="w-10 shrink-0 text-right font-mono text-text-primary">
                  {Math.round((clip.effects?.transform?.opacity ?? 1) * 100)}%
                </span>
              </label>
            )}
          </div>
        </Section>
      ) : null}

      {/* Chroma Key (Green Screen) — media clips only */}
      {(currentTab === 'video' || currentTab === 'basic') && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <Section title="Chroma Key (Green Screen)">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[16px] ${clip.effects?.chromaKey?.enabled ? 'text-accent-ai' : 'text-text-disabled'}`}>
                    palette
                  </span>
                  <span className="text-xs font-semibold text-text-primary">Color Keying</span>
                </div>
                <Switch
                  label="Toggle color keying"
                  checked={clip.effects?.chromaKey?.enabled ?? false}
                  onChange={() => {
                    const currentVal = clip.effects?.chromaKey?.enabled ?? false;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        chromaKey: {
                          ...(clip.effects?.chromaKey ?? DEFAULT_CHROMA_KEY_SETTINGS),
                          enabled: !currentVal,
                        },
                      },
                    });
                  }}
                />
              </div>

              {clip.effects?.chromaKey?.enabled ? (
                <div className="flex flex-col gap-3 rounded-card border border-hairline/80 bg-bg-app p-2.5">
                  {/* Preset Chips */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                      Studio Presets
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(Object.keys(CHROMA_KEY_PRESETS) as ChromaKeyPresetKey[]).map((presetKey) => {
                        const preset = CHROMA_KEY_PRESETS[presetKey];
                        const isMatch =
                          clip.effects?.chromaKey?.keyColorHex?.toUpperCase() ===
                          preset.settings.keyColorHex.toUpperCase();
                        return (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() =>
                              patchClip(clip.id, {
                                effects: {
                                  ...clip.effects,
                                  chromaKey: {
                                    enabled: true,
                                    ...preset.settings,
                                  },
                                },
                              })
                            }
                            className={`rounded px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                              isMatch
                                ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                                : 'bg-bg-workspace border-hairline text-text-secondary hover:text-text-primary'
                            }`}
                            title={preset.description}
                          >
                            {preset.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Key Color Picker */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-hairline/40">
                    <span className="text-xs text-text-secondary font-medium">Key Color</span>
                    <div className="flex items-center gap-2">
                      <label
                        className="h-6 w-6 rounded-full border border-white/20 cursor-pointer shadow-sm flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: clip.effects.chromaKey.keyColorHex }}
                        title="Pick Chroma Key Color"
                      >
                        <input
                          type="color"
                          value={clip.effects.chromaKey.keyColorHex}
                          onChange={(e) =>
                            patchClip(clip.id, {
                              effects: {
                                ...clip.effects,
                                chromaKey: {
                                  ...clip.effects!.chromaKey!,
                                  keyColorHex: e.target.value.toUpperCase(),
                                },
                              },
                            })
                          }
                          className="opacity-0 w-0 h-0 pointer-events-none"
                        />
                      </label>
                      <span className="font-mono text-xs text-text-primary font-bold">
                        {clip.effects.chromaKey.keyColorHex.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Similarity Slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Similarity (Tolerance)</span>
                      <span className="font-mono text-text-primary font-medium">
                        {Math.round(clip.effects.chromaKey.similarity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.01}
                      max={1.0}
                      step={0.01}
                      value={clip.effects.chromaKey.similarity}
                      onChange={(e) =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            chromaKey: {
                              ...clip.effects!.chromaKey!,
                              similarity: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="accent-[var(--accent-ai)]"
                    />
                  </div>

                  {/* Smoothness Slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Smoothness (Edge Softness)</span>
                      <span className="font-mono text-text-primary font-medium">
                        {Math.round(clip.effects.chromaKey.smoothness * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={0.5}
                      step={0.01}
                      value={clip.effects.chromaKey.smoothness}
                      onChange={(e) =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            chromaKey: {
                              ...clip.effects!.chromaKey!,
                              smoothness: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="accent-[var(--accent-ai)]"
                    />
                  </div>

                  {/* Spill Suppression Slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Spill Suppression</span>
                      <span className="font-mono text-text-primary font-medium">
                        {Math.round(clip.effects.chromaKey.spillSuppression * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={clip.effects.chromaKey.spillSuppression}
                      onChange={(e) =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            chromaKey: {
                              ...clip.effects!.chromaKey!,
                              spillSuppression: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="accent-[var(--accent-ai)]"
                    />
                  </div>

                  {/* Reset Button */}
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            chromaKey: {
                              ...DEFAULT_CHROMA_KEY_SETTINGS,
                              enabled: true,
                            },
                          },
                        })
                      }
                    >
                      Reset Defaults
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* S39 / S62 — Shape Mask Engine (including Adjustment Layers) */}
        {(currentTab === 'video' || currentTab === 'basic') && clip.sourceKind !== 'text' ? (
          <Section title="Mask & Shape Crop">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      clip.effects?.mask?.enabled && clip.effects.mask.shape !== 'none'
                        ? 'text-accent-ai'
                        : 'text-text-disabled'
                    }`}
                  >
                    filter_frames
                  </span>
                  <span className="text-xs font-semibold text-text-primary">Shape Mask</span>
                </div>
                <Switch
                  label="Toggle shape mask"
                  checked={Boolean(clip.effects?.mask?.enabled && clip.effects.mask.shape !== 'none')}
                  onChange={() => {
                    const currentEnabled = Boolean(
                      clip.effects?.mask?.enabled && clip.effects.mask.shape !== 'none',
                    );
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        mask: {
                          ...(clip.effects?.mask ?? DEFAULT_MASK_SETTINGS),
                          enabled: !currentEnabled,
                          shape:
                            !currentEnabled &&
                            (clip.effects?.mask?.shape === 'none' || !clip.effects?.mask?.shape)
                              ? 'rectangle'
                              : clip.effects?.mask?.shape ?? 'rectangle',
                        },
                      },
                    });
                  }}
                />
              </div>

              {clip.effects?.mask?.enabled && clip.effects.mask.shape !== 'none' ? (
                <div className="flex flex-col gap-3 rounded-card border border-hairline/80 bg-bg-app p-2.5">
                  {/* Shape Selector Chips */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                      Mask Shapes
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {MASK_SHAPES.filter((s) => s.type !== 'none').map((s) => {
                        const isSelected = clip.effects?.mask?.shape === s.type;
                        return (
                          <button
                            key={s.type}
                            type="button"
                            onClick={() =>
                              patchClip(clip.id, {
                                effects: {
                                  ...clip.effects,
                                  mask: {
                                    ...(clip.effects?.mask ?? DEFAULT_MASK_SETTINGS),
                                    enabled: true,
                                    shape: s.type,
                                  },
                                },
                              })
                            }
                            className={`flex flex-col items-center justify-center gap-1 rounded-md p-2 border text-center transition-all ${
                              isSelected
                                ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                                : 'bg-bg-workspace border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                            }`}
                            title={s.description}
                          >
                            <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                            <span className="text-[10px] leading-tight">{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Studio Presets Bar */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                    <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                      Presets
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(Object.keys(MASK_PRESETS) as MaskPresetKey[]).map((presetKey) => {
                        const preset = MASK_PRESETS[presetKey];
                        return (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() =>
                              patchClip(clip.id, {
                                effects: {
                                  ...clip.effects,
                                  mask: {
                                    enabled: true,
                                    ...preset.settings,
                                  },
                                },
                              })
                            }
                            className="rounded px-2 py-0.5 text-[11px] font-medium border border-hairline bg-bg-workspace text-text-secondary hover:text-text-primary hover:border-hairline-hover transition-colors"
                            title={preset.description}
                          >
                            {preset.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Size (Width & Height) Sliders */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-hairline/40">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>Width</span>
                        <span className="font-mono text-text-primary font-medium">
                          {Math.round((clip.effects.mask.width ?? 0.6) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1.0}
                        step={0.01}
                        value={clip.effects.mask.width ?? 0.6}
                        onChange={(e) =>
                          patchClip(clip.id, {
                            effects: {
                              ...clip.effects,
                              mask: {
                                ...clip.effects!.mask!,
                                width: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="accent-[var(--accent-ai)]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>Height</span>
                        <span className="font-mono text-text-primary font-medium">
                          {Math.round((clip.effects.mask.height ?? 0.6) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1.0}
                        step={0.01}
                        value={clip.effects.mask.height ?? 0.6}
                        onChange={(e) =>
                          patchClip(clip.id, {
                            effects: {
                              ...clip.effects,
                              mask: {
                                ...clip.effects!.mask!,
                                height: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="accent-[var(--accent-ai)]"
                      />
                    </div>
                  </div>

                  {/* Center Position X & Y */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>Center X</span>
                        <span className="font-mono text-[11px] text-text-primary">
                          {Math.round((clip.effects.mask.x ?? 0.5) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        value={clip.effects.mask.x ?? 0.5}
                        onChange={(e) =>
                          patchClip(clip.id, {
                            effects: {
                              ...clip.effects,
                              mask: {
                                ...clip.effects!.mask!,
                                x: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="accent-[var(--accent-ai)]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>Center Y</span>
                        <span className="font-mono text-[11px] text-text-primary">
                          {Math.round((clip.effects.mask.y ?? 0.5) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        value={clip.effects.mask.y ?? 0.5}
                        onChange={(e) =>
                          patchClip(clip.id, {
                            effects: {
                              ...clip.effects,
                              mask: {
                                ...clip.effects!.mask!,
                                y: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="accent-[var(--accent-ai)]"
                      />
                    </div>
                  </div>

                  {/* Corner Radius (for rectangle) */}
                  {clip.effects.mask.shape === 'rectangle' ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>Corner Radius</span>
                        <span className="font-mono text-text-primary font-medium">
                          {clip.effects.mask.cornerRadius ?? 0}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={80}
                        step={1}
                        value={clip.effects.mask.cornerRadius ?? 0}
                        onChange={(e) =>
                          patchClip(clip.id, {
                            effects: {
                              ...clip.effects,
                              mask: {
                                ...clip.effects!.mask!,
                                cornerRadius: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="accent-[var(--accent-ai)]"
                      />
                    </div>
                  ) : null}

                  {/* Feathering (Edge Softness) */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Feather (Softness)</span>
                      <span className="font-mono text-text-primary font-medium">
                        {clip.effects.mask.feather ?? 0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={clip.effects.mask.feather ?? 0}
                      onChange={(e) =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            mask: {
                              ...clip.effects!.mask!,
                              feather: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="accent-[var(--accent-ai)]"
                    />
                  </div>

                  {/* Invert Mask & Reset */}
                  <div className="flex items-center justify-between pt-1 border-t border-hairline/40">
                    <button
                      type="button"
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            mask: {
                              ...clip.effects!.mask!,
                              invert: !clip.effects!.mask!.invert,
                            },
                          },
                        })
                      }
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        clip.effects.mask.invert
                          ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                          : 'bg-bg-workspace border-hairline text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">invert_colors</span>
                      <span>Invert Mask</span>
                    </button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            mask: {
                              ...DEFAULT_MASK_SETTINGS,
                              enabled: true,
                            },
                          },
                        })
                      }
                    >
                      Reset Mask
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

      {/* S46 / S62 — Cinematic Lens Distortion, Radial Chromatic Aberration & Optical Vignette */}
      {(currentTab === 'video' || currentTab === 'basic') && clip.sourceKind !== 'text' ? (
        <Section title="Lens Optics & Distortion">
          {(() => {
            const optics = clip.effects?.lensOptics ?? DEFAULT_LENS_OPTICS_SETTINGS;
            const patchOptics = (patch: Partial<ClipLensOpticsSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  lensOptics: {
                    ...optics,
                    ...patch,
                  },
                },
              });
            };

            return (
              <div className="flex flex-col gap-2.5">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={optics.enabled}
                      label="Enable Lens Optics"
                      onChange={() => patchOptics({ enabled: !optics.enabled })}
                    />
                    <span className="font-medium">
                      {optics.enabled ? 'Optics Active' : 'Optics Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchOptics(DEFAULT_LENS_OPTICS_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {(Object.keys(LENS_OPTICS_PRESETS) as LensOpticsPresetKey[]).map((pKey) => {
                    const preset = LENS_OPTICS_PRESETS[pKey];
                    return (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => patchOptics({ ...preset.settings, enabled: true })}
                        title={preset.description}
                        className="px-2 py-0.5 rounded border border-hairline bg-bg-app text-text-secondary hover:text-text-primary hover:border-cyan-400/50 transition-colors"
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Distortion (Barrel / Pincushion) */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 font-bold text-cyan-400">Distortion k1</span>
                    <input
                      type="range"
                      min={-0.6}
                      max={0.6}
                      step={0.02}
                      value={optics.distortionK1}
                      disabled={!optics.enabled}
                      onChange={(e) => patchOptics({ distortionK1: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {optics.distortionK1 > 0 ? `+${optics.distortionK1.toFixed(2)}` : optics.distortionK1.toFixed(2)}
                    </span>
                  </label>

                  {/* Anamorphic Desqueeze */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 font-bold text-cyan-400">Anamorphic</span>
                    <input
                      type="range"
                      min={1.0}
                      max={2.0}
                      step={0.05}
                      value={optics.anamorphicRatio}
                      disabled={!optics.enabled}
                      onChange={(e) => patchOptics({ anamorphicRatio: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {optics.anamorphicRatio.toFixed(2)}x
                    </span>
                  </label>

                  {/* Chromatic Aberration */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 font-bold text-cyan-400">Chromatic</span>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={1}
                      value={optics.chromaticAberrationPx}
                      disabled={!optics.enabled}
                      onChange={(e) => patchOptics({ chromaticAberrationPx: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {optics.chromaticAberrationPx}px
                    </span>
                  </label>
                </div>

                {/* Optical Vignette Sub-section */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={optics.vignetteEnabled}
                        disabled={!optics.enabled}
                        onChange={(e) => patchOptics({ vignetteEnabled: e.target.checked })}
                        className="accent-cyan-400"
                      />
                      <span>Optical Vignette</span>
                    </label>

                    {optics.vignetteEnabled && (
                      <span className="text-[10px] font-mono text-cyan-400">
                        {Math.round(optics.vignetteStrength * 100)}% Depth
                      </span>
                    )}
                  </div>

                  {optics.vignetteEnabled && (
                    <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                      {/* Vignette Strength */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-20 shrink-0 text-text-disabled">Strength</span>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={optics.vignetteStrength}
                          disabled={!optics.enabled}
                          onChange={(e) => patchOptics({ vignetteStrength: Number(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {Math.round(optics.vignetteStrength * 100)}%
                        </span>
                      </label>

                      {/* Vignette Radius */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-20 shrink-0 text-text-disabled">Radius</span>
                        <input
                          type="range"
                          min={0.2}
                          max={1.4}
                          step={0.05}
                          value={optics.vignetteRadius}
                          disabled={!optics.enabled}
                          onChange={(e) => patchOptics({ vignetteRadius: Number(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {Math.round(optics.vignetteRadius * 100)}%
                        </span>
                      </label>

                      {/* Vignette Feather */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-20 shrink-0 text-text-disabled">Feather</span>
                        <input
                          type="range"
                          min={0.1}
                          max={0.9}
                          step={0.05}
                          value={optics.vignetteFeather}
                          disabled={!optics.enabled}
                          onChange={(e) => patchOptics({ vignetteFeather: Number(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {Math.round(optics.vignetteFeather * 100)}%
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S47 — Motion Tracking & 2D Point Feature Follower */}
      {(currentTab === 'video' || (currentTab === 'basic' && (videoClip || clip.sourceKind === 'still'))) ? (
        <MotionTrackingSection clip={clip} document={document} fps={fps} />
      ) : null}

      {/* S48 — Film Grain, Analog Halation & Gate Weave Emulation */}
      {(currentTab === 'video' || currentTab === 'color' || (currentTab === 'basic' && (videoClip || clip.sourceKind === 'still'))) && (videoClip || clip.sourceKind === 'still' || clip.sourceKind === 'effect') ? (
        <Section title="Film Emulation (Grain, Halation & Weave)">
          {(() => {
            const film = clip.effects?.filmEmulation ?? DEFAULT_FILM_EMULATION_SETTINGS;
            const patchFilm = (patch: Partial<FilmEmulationSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  filmEmulation: {
                    ...film,
                    ...patch,
                  },
                },
              });
            };

            const patchGrain = (patch: Partial<typeof film.grain>) => {
              patchFilm({ grain: { ...film.grain, ...patch } });
            };

            const patchHalation = (patch: Partial<typeof film.halation>) => {
              patchFilm({ halation: { ...film.halation, ...patch } });
            };

            const patchGateWeave = (patch: Partial<typeof film.gateWeave>) => {
              patchFilm({ gateWeave: { ...film.gateWeave, ...patch } });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={film.enabled}
                      label="Enable Film Emulation"
                      onChange={() => patchFilm({ enabled: !film.enabled })}
                    />
                    <span className="font-medium">
                      {film.enabled ? 'Emulation Active' : 'Emulation Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchFilm(DEFAULT_FILM_EMULATION_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Stock Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                    Physical Stock Presets
                  </span>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {(Object.keys(FILM_EMULATION_PRESETS) as FilmStockPresetKey[]).map((pKey) => {
                      const preset = FILM_EMULATION_PRESETS[pKey];
                      const isSelected = film.preset === pKey;
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => patchFilm(preset.settings)}
                          className={`rounded px-2 py-1 border transition-colors ${
                            isSelected
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                              : 'bg-bg-app border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                          }`}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1. Photochemical Film Grain */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={film.grain.enabled}
                        disabled={!film.enabled}
                        onChange={(e) => patchGrain({ enabled: e.target.checked })}
                        className="accent-amber-400"
                      />
                      <span className="font-semibold text-text-primary">1. Silver Halide Film Grain</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-text-disabled cursor-pointer">
                      <input
                        type="checkbox"
                        checked={film.grain.chromatic}
                        disabled={!film.enabled || !film.grain.enabled}
                        onChange={(e) => patchGrain({ chromatic: e.target.checked })}
                        className="accent-amber-400"
                      />
                      <span>Chromatic Dye</span>
                    </label>
                  </div>

                  {film.grain.enabled && (
                    <div className="flex flex-col gap-1.5 pt-1 font-mono text-xs">
                      {/* Intensity */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Intensity</span>
                        <input
                          type="range"
                          min={0.05}
                          max={1.0}
                          step={0.05}
                          value={film.grain.intensity}
                          disabled={!film.enabled}
                          onChange={(e) => patchGrain({ intensity: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {Math.round(film.grain.intensity * 100)}%
                        </span>
                      </label>

                      {/* Grain Size */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Size</span>
                        <input
                          type="range"
                          min={0.5}
                          max={3.0}
                          step={0.1}
                          value={film.grain.size}
                          disabled={!film.enabled}
                          onChange={(e) => patchGrain({ size: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.grain.size.toFixed(1)}x
                        </span>
                      </label>

                      {/* Roughness */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Roughness</span>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={film.grain.roughness}
                          disabled={!film.enabled}
                          onChange={(e) => patchGrain({ roughness: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {Math.round(film.grain.roughness * 100)}%
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* 2. Analog Halation */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={film.halation.enabled}
                        disabled={!film.enabled}
                        onChange={(e) => patchHalation({ enabled: e.target.checked })}
                        className="accent-rose-500"
                      />
                      <span className="font-semibold text-text-primary">2. Photochemical Halation (Red Glow)</span>
                    </label>
                    {film.halation.enabled && (
                      <span className="text-[10px] font-mono text-rose-400">
                        {Math.round(film.halation.intensity * 100)}% Glow
                      </span>
                    )}
                  </div>

                  {film.halation.enabled && (
                    <div className="flex flex-col gap-1.5 pt-1 font-mono text-xs">
                      {/* Halation Intensity */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Intensity</span>
                        <input
                          type="range"
                          min={0.05}
                          max={1.0}
                          step={0.05}
                          value={film.halation.intensity}
                          disabled={!film.enabled}
                          onChange={(e) => patchHalation({ intensity: Number(e.target.value) })}
                          className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {Math.round(film.halation.intensity * 100)}%
                        </span>
                      </label>

                      {/* Threshold */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Threshold</span>
                        <input
                          type="range"
                          min={0.4}
                          max={0.95}
                          step={0.02}
                          value={film.halation.threshold}
                          disabled={!film.enabled}
                          onChange={(e) => patchHalation({ threshold: Number(e.target.value) })}
                          className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {Math.round(film.halation.threshold * 100)}%
                        </span>
                      </label>

                      {/* Spread Radius */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Radius</span>
                        <input
                          type="range"
                          min={2}
                          max={35}
                          step={1}
                          value={film.halation.radiusPx}
                          disabled={!film.enabled}
                          onChange={(e) => patchHalation({ radiusPx: Number(e.target.value) })}
                          className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.halation.radiusPx}px
                        </span>
                      </label>

                      {/* Hue Warmth */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Warmth</span>
                        <input
                          type="range"
                          min={-20}
                          max={35}
                          step={1}
                          value={film.halation.hueShiftDeg}
                          disabled={!film.enabled}
                          onChange={(e) => patchHalation({ hueShiftDeg: Number(e.target.value) })}
                          className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.halation.hueShiftDeg > 0 ? `+${film.halation.hueShiftDeg}°` : `${film.halation.hueShiftDeg}°`}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* 3. Mechanical Gate Weave */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={film.gateWeave.enabled}
                        disabled={!film.enabled}
                        onChange={(e) => patchGateWeave({ enabled: e.target.checked })}
                        className="accent-amber-400"
                      />
                      <span className="font-semibold text-text-primary">3. Mechanical Gate Weave & Jitter</span>
                    </label>
                    {film.gateWeave.enabled && (
                      <span className="text-[10px] font-mono text-amber-300">
                        {film.gateWeave.amplitudeX}px / {film.gateWeave.amplitudeY}px
                      </span>
                    )}
                  </div>

                  {film.gateWeave.enabled && (
                    <div className="flex flex-col gap-1.5 pt-1 font-mono text-xs">
                      {/* Amplitude X */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Drift X</span>
                        <input
                          type="range"
                          min={0}
                          max={6}
                          step={0.2}
                          value={film.gateWeave.amplitudeX}
                          disabled={!film.enabled}
                          onChange={(e) => patchGateWeave({ amplitudeX: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.gateWeave.amplitudeX.toFixed(1)}px
                        </span>
                      </label>

                      {/* Amplitude Y */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Drift Y</span>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.2}
                          value={film.gateWeave.amplitudeY}
                          disabled={!film.enabled}
                          onChange={(e) => patchGateWeave({ amplitudeY: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.gateWeave.amplitudeY.toFixed(1)}px
                        </span>
                      </label>

                      {/* Speed */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Speed</span>
                        <input
                          type="range"
                          min={0.5}
                          max={4.5}
                          step={0.2}
                          value={film.gateWeave.speedHz}
                          disabled={!film.enabled}
                          onChange={(e) => patchGateWeave({ speedHz: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {film.gateWeave.speedHz.toFixed(1)} Hz
                        </span>
                      </label>

                      {/* Jitter */}
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 text-text-disabled">Jitter</span>
                        <input
                          type="range"
                          min={0}
                          max={1.0}
                          step={0.05}
                          value={film.gateWeave.jitterPct}
                          disabled={!film.enabled}
                          onChange={(e) => patchGateWeave({ jitterPct: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-10 text-right text-text-primary">
                          {Math.round(film.gateWeave.jitterPct * 100)}%
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S55 — HDR Tone Mapping & False Color HUD */}
      {(currentTab === 'color' || currentTab === 'video' || (currentTab === 'basic' && (videoClip || clip.sourceKind === 'still'))) && (videoClip || clip.sourceKind === 'still' || clip.sourceKind === 'effect') ? (
        <Section title="HDR Tone Mapping & False Color HUD">
          {(() => {
            const hdr = clip.effects?.hdrToneMapping ?? DEFAULT_HDR_TONE_MAPPING_SETTINGS;
            const patchHdr = (patch: Partial<HdrToneMappingSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  hdrToneMapping: {
                    ...hdr,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: HdrToneMappingPresetKey) => {
              const preset = HDR_TONE_MAPPING_PRESETS[key];
              if (!preset) return;
              patchHdr({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={hdr.enabled}
                      label="Enable HDR Tone Mapping"
                      onChange={() => patchHdr({ enabled: !hdr.enabled })}
                    />
                    <span className="font-medium">
                      {hdr.enabled ? 'Tone Mapping Active' : 'Tone Mapping Bypassed'}
                    </span>
                  </label>
                  {hdr.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, hdrToneMapping: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Studio Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Color Science Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(HDR_TONE_MAPPING_PRESETS) as HdrToneMappingPresetKey[]).map((key) => {
                      const p = HDR_TONE_MAPPING_PRESETS[key];
                      const active = hdr.preset === key && hdr.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Curve Selector */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-text-secondary font-medium">Filmic S-Curve</span>
                    <span className="text-[10px] font-mono text-amber-400 uppercase">{hdr.curve.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['aces_filmic', 'hable', 'reinhard', 'mobius'] as HdrToneCurve[]).map((curve) => (
                      <button
                        key={curve}
                        type="button"
                        onClick={() => patchHdr({ curve })}
                        disabled={!hdr.enabled}
                        className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors uppercase ${
                          hdr.curve === curve
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                        } ${!hdr.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {curve === 'aces_filmic' ? 'ACES' : curve}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40 font-mono text-xs">
                  {/* Target Peak Nits */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Target Nits</span>
                    <input
                      type="range"
                      min={100}
                      max={2000}
                      step={50}
                      value={hdr.targetPeakNits}
                      disabled={!hdr.enabled}
                      onChange={(e) => patchHdr({ targetPeakNits: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {hdr.targetPeakNits} nits
                    </span>
                  </label>

                  {/* Highlight Desaturation */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Highlight Desat</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={hdr.desaturation}
                      disabled={!hdr.enabled}
                      onChange={(e) => patchHdr({ desaturation: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {Math.round(hdr.desaturation * 100)}%
                    </span>
                  </label>

                  {/* Exposure Compensation */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Exposure EV</span>
                    <input
                      type="range"
                      min={-3.0}
                      max={3.0}
                      step={0.1}
                      value={hdr.exposureCompensationEv}
                      disabled={!hdr.enabled}
                      onChange={(e) => patchHdr({ exposureCompensationEv: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {hdr.exposureCompensationEv > 0 ? `+${hdr.exposureCompensationEv.toFixed(1)}` : hdr.exposureCompensationEv.toFixed(1)} EV
                    </span>
                  </label>

                  {/* False Color Heatmap Mode Toggle & Legend */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-hairline/40">
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hdr.falseColorEnabled}
                          disabled={!hdr.enabled}
                          onChange={(e) => patchHdr({ falseColorEnabled: e.target.checked })}
                          className="accent-amber-400"
                        />
                        <span className="font-semibold text-text-primary">False Color Exposure HUD</span>
                      </label>
                      <span className="text-[10px] text-text-disabled">16-Step IRE</span>
                    </div>

                    {hdr.falseColorEnabled && (
                      <div className="flex flex-col gap-1 pt-1">
                        <div className="flex items-center h-3 w-full rounded overflow-hidden border border-hairline">
                          {FALSE_COLOR_IRE_SCALE.map((step) => (
                            <div
                              key={step.label}
                              style={{ backgroundColor: step.colorHex }}
                              className="flex-1 h-full"
                              title={step.label}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-[9px] text-text-disabled font-mono">
                          <span>0 IRE (Crush)</span>
                          <span className="text-emerald-400 font-semibold">40 IRE (Gray)</span>
                          <span className="text-pink-400 font-semibold">70 IRE (Skin)</span>
                          <span>100+ IRE (Clip)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S57 — Temporal Video Noise Reduction (TNR) & Detail Enhancer */}
      {(currentTab === 'video' || currentTab === 'color' || (currentTab === 'basic' && videoClip)) && (videoClip || clip.sourceKind === 'effect') ? (
        <Section title="Temporal Video Denoising (TNR) & Detail Enhancer">
          {(() => {
            const denoiser = clip.effects?.videoDenoiser ?? DEFAULT_VIDEO_DENOISER_SETTINGS;
            const patchDenoiser = (patch: Partial<VideoDenoiserSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  videoDenoiser: {
                    ...denoiser,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: VideoDenoiserPresetKey) => {
              const preset = VIDEO_DENOISER_PRESETS[key];
              if (!preset) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  videoDenoiser: { ...preset },
                },
              });
            };

            const reductionRatio = calculateEffectiveNoiseReductionRatio(denoiser);

            return (
              <div className="flex flex-col gap-3 text-xs">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={denoiser.enabled}
                      onChange={(e) => patchDenoiser({ enabled: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    <span className="font-semibold text-text-primary">Enable Video TNR</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-raised border border-hairline text-text-secondary">
                      NR: {Math.round(reductionRatio * 100)}%
                    </span>
                    {clip.effects?.videoDenoiser ? (
                      <button
                        type="button"
                        onClick={() => patchClip(clip.id, { effects: { ...clip.effects, videoDenoiser: undefined } })}
                        className="text-[10px] text-text-disabled hover:text-text-primary transition-colors"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Studio Presets */}
                <div className="flex flex-col gap-1">
                  <span className="text-text-disabled text-[11px] font-medium">Studio Denoise Presets</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { key: 'subtle_sensor_grain', label: 'Subtle Grain' },
                      { key: 'high_iso_digital_noise', label: 'High ISO' },
                      { key: 'chroma_blotch_cleaner', label: 'Chroma Blotch' },
                      { key: 'night_low_light_salvage', label: 'Night Salvage' },
                      { key: 'vintage_analog_restoration', label: 'Analog Clean' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyPreset(key as VideoDenoiserPresetKey)}
                        className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                          denoiser.enabled && denoiser.preset === key
                            ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                            : 'bg-surface-raised text-text-secondary border-hairline hover:bg-surface-hover hover:text-text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`flex flex-col gap-2.5 transition-opacity ${denoiser.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  {/* Temporal Smoothing Strength */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-24 shrink-0 text-text-disabled">Temporal Luma</span>
                    <input
                      type="range"
                      min={0.0}
                      max={20.0}
                      step={0.5}
                      value={denoiser.temporalLumaStrength}
                      disabled={!denoiser.enabled}
                      onChange={(e) => patchDenoiser({ temporalLumaStrength: Number(e.target.value), preset: undefined })}
                      className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary font-mono">
                      {denoiser.temporalLumaStrength.toFixed(1)}
                    </span>
                  </label>

                  {/* Temporal Chroma Strength */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-24 shrink-0 text-text-disabled">Temporal Chroma</span>
                    <input
                      type="range"
                      min={0.0}
                      max={20.0}
                      step={0.5}
                      value={denoiser.temporalChromaStrength}
                      disabled={!denoiser.enabled}
                      onChange={(e) => patchDenoiser({ temporalChromaStrength: Number(e.target.value), preset: undefined })}
                      className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary font-mono">
                      {denoiser.temporalChromaStrength.toFixed(1)}
                    </span>
                  </label>

                  {/* Spatial Luma Strength */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-24 shrink-0 text-text-disabled">Spatial Luma</span>
                    <input
                      type="range"
                      min={0.0}
                      max={15.0}
                      step={0.5}
                      value={denoiser.spatialLumaStrength}
                      disabled={!denoiser.enabled}
                      onChange={(e) => patchDenoiser({ spatialLumaStrength: Number(e.target.value), preset: undefined })}
                      className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary font-mono">
                      {denoiser.spatialLumaStrength.toFixed(1)}
                    </span>
                  </label>

                  {/* Spatial Chroma Strength */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-24 shrink-0 text-text-disabled">Spatial Chroma</span>
                    <input
                      type="range"
                      min={0.0}
                      max={15.0}
                      step={0.5}
                      value={denoiser.spatialChromaStrength}
                      disabled={!denoiser.enabled}
                      onChange={(e) => patchDenoiser({ spatialChromaStrength: Number(e.target.value), preset: undefined })}
                      className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary font-mono">
                      {denoiser.spatialChromaStrength.toFixed(1)}
                    </span>
                  </label>

                  {/* Temporal Radius Frames */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-24 shrink-0 text-text-disabled">Frame Radius</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={denoiser.temporalRadius}
                      disabled={!denoiser.enabled}
                      onChange={(e) => patchDenoiser({ temporalRadius: Number(e.target.value), preset: undefined })}
                      className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary font-mono">
                      ±{denoiser.temporalRadius} f
                    </span>
                  </label>

                  {/* Chroma Boost & Detail Sharpen */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-hairline/40">
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={denoiser.chromaDenoiseBoost}
                          disabled={!denoiser.enabled}
                          onChange={(e) => patchDenoiser({ chromaDenoiseBoost: e.target.checked, preset: undefined })}
                          className="accent-indigo-500"
                        />
                        <span className="text-text-primary">Chroma Denoise 1.5x Boost</span>
                      </label>
                      <span className="text-[10px] text-text-disabled">Color artifacts</span>
                    </div>

                    <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                      <span className="w-24 shrink-0 text-text-disabled">Detail Sharpen</span>
                      <input
                        type="range"
                        min={0.0}
                        max={2.0}
                        step={0.05}
                        value={denoiser.detailSharpenAmount}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ detailSharpenAmount: Number(e.target.value), preset: undefined })}
                        className="flex-1 accent-indigo-500 h-1.5 cursor-pointer"
                      />
                      <span className="w-12 text-right text-text-primary font-mono">
                        {denoiser.detailSharpenAmount.toFixed(2)}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S58 — AI Smart Scene Cut Detection & Auto-Split Engine */}
      {(currentTab === 'video' || (currentTab === 'basic' && videoClip)) && videoClip ? (
        <SceneCutDetectionSection clip={clip} />
      ) : null}

      {/* S59 — Multi-Camera Angle Switching, Waveform Audio Sync & MultiCam Engine */}
      {(currentTab === 'video' || (currentTab === 'basic' && videoClip)) && videoClip ? (
        <MultiCamSection clip={clip} patchClip={patchClip} />
      ) : null}

      {/* S51 — AI Video Background Matting & Smart Portrait Cutout */}
      {(currentTab === 'video' || (currentTab === 'basic' && (videoClip || clip.sourceKind === 'still'))) && (videoClip || clip.sourceKind === 'still') ? (
        <Section title="Smart Portrait Cutout & Matting">
          {(() => {
            const matting = clip.effects?.matting ?? DEFAULT_PORTRAIT_MATTING_SETTINGS;
            const patchMatting = (patch: Partial<PortraitMattingSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  matting: {
                    ...matting,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: PortraitMattingPresetKey) => {
              const preset = PORTRAIT_MATTING_PRESETS[key];
              if (!preset) return;
              patchMatting({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={matting.enabled}
                      label="Enable Smart Cutout"
                      onChange={() => patchMatting({ enabled: !matting.enabled })}
                    />
                    <span className="font-medium">
                      {matting.enabled ? 'Cutout Active' : 'Cutout Bypassed'}
                    </span>
                  </label>
                  {matting.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, matting: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Preset Chips */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Cutout Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(PORTRAIT_MATTING_PRESETS) as PortraitMattingPresetKey[]).map((key) => {
                      const p = PORTRAIT_MATTING_PRESETS[key];
                      const active = matting.preset === key && matting.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* View Mode Chips */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-text-secondary font-medium">Matte Preview Mode</span>
                    <span className="text-[10px] font-mono text-cyan-400 capitalize">{matting.viewMode.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['composite', 'alpha_matte', 'overlay_mask', 'original'] as PortraitMattingViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => patchMatting({ viewMode: mode })}
                        disabled={!matting.enabled}
                        className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors capitalize ${
                          matting.viewMode === mode
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                            : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                        } ${!matting.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40 font-mono text-xs">
                  {/* Threshold */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Sensitivity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.01}
                      value={matting.threshold}
                      disabled={!matting.enabled}
                      onChange={(e) => patchMatting({ threshold: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {Math.round(matting.threshold * 100)}%
                    </span>
                  </label>

                  {/* Edge Feather */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Feather</span>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={matting.edgeFeather}
                      disabled={!matting.enabled}
                      onChange={(e) => patchMatting({ edgeFeather: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {matting.edgeFeather}px
                    </span>
                  </label>

                  {/* Edge Choke */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Choke</span>
                    <input
                      type="range"
                      min={-20}
                      max={30}
                      step={1}
                      value={matting.edgeChoke}
                      disabled={!matting.enabled}
                      onChange={(e) => patchMatting({ edgeChoke: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {matting.edgeChoke > 0 ? `+${matting.edgeChoke}` : matting.edgeChoke}px
                    </span>
                  </label>

                  {/* Spill Suppression */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">De-Spill</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={matting.spillSuppression}
                      disabled={!matting.enabled}
                      onChange={(e) => patchMatting({ spillSuppression: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {Math.round(matting.spillSuppression * 100)}%
                    </span>
                  </label>

                  {/* Invert Matte Checkbox */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={matting.invertMatte}
                        disabled={!matting.enabled}
                        onChange={(e) => patchMatting({ invertMatte: e.target.checked })}
                        className="accent-cyan-400"
                      />
                      <span className="font-semibold text-text-primary">Invert Matte (Keep Background)</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S52 — Optical Flow Motion Estimation & AI Video Super Slow-Motion */}
      {(currentTab === 'video' || (currentTab === 'basic' && videoClip)) && videoClip ? (
        <Section title="Optical Flow & Smooth Slow-Mo">
          {(() => {
            const flow = clip.effects?.opticalFlow ?? DEFAULT_OPTICAL_FLOW_SETTINGS;
            const patchFlow = (patch: Partial<OpticalFlowSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  opticalFlow: {
                    ...flow,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: OpticalFlowPresetKey) => {
              const preset = OPTICAL_FLOW_PRESETS[key];
              if (!preset) return;
              patchFlow({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={flow.enabled}
                      label="Enable Optical Flow"
                      onChange={() => patchFlow({ enabled: !flow.enabled })}
                    />
                    <span className="font-medium">
                      {flow.enabled ? 'Optical Flow Active' : 'Optical Flow Bypassed'}
                    </span>
                  </label>
                  {flow.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, opticalFlow: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Preset Chips */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Slow-Mo Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(OPTICAL_FLOW_PRESETS) as OpticalFlowPresetKey[]).map((key) => {
                      const p = OPTICAL_FLOW_PRESETS[key];
                      const active = flow.preset === key && flow.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Interpolation Mode */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-text-secondary font-medium">Interpolation Algorithm</span>
                    <span className="text-[10px] font-mono text-emerald-400 capitalize">{flow.mode.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['nearest', 'blend', 'optical_flow', 'smooth_motion'] as OpticalFlowMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => patchFlow({ mode })}
                        disabled={!flow.enabled}
                        className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors capitalize ${
                          flow.mode === mode
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                        } ${!flow.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {mode === 'smooth_motion' ? 'Smooth' : mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40 font-mono text-xs">
                  {/* Speed Multiplier */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Speed Rate</span>
                    <input
                      type="range"
                      min={0.05}
                      max={1.0}
                      step={0.05}
                      value={flow.speedMultiplier}
                      disabled={!flow.enabled}
                      onChange={(e) => patchFlow({ speedMultiplier: Number(e.target.value) })}
                      className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary font-semibold">
                      {flow.speedMultiplier}x ({Math.round(1 / flow.speedMultiplier)}x slow)
                    </span>
                  </label>

                  {/* Target FPS */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Target FPS</span>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      step={6}
                      value={flow.targetFps}
                      disabled={!flow.enabled}
                      onChange={(e) => patchFlow({ targetFps: Number(e.target.value) })}
                      className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {flow.targetFps} fps
                    </span>
                  </label>

                  {/* Motion Vector Precision */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-disabled">Vector Precision</span>
                    <div className="flex items-center gap-1">
                      {(['pixel', 'half_pixel', 'quarter_pixel'] as MotionVectorPrecision[]).map((prec) => (
                        <button
                          key={prec}
                          type="button"
                          onClick={() => patchFlow({ motionVectorPrecision: prec })}
                          disabled={!flow.enabled}
                          className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors capitalize ${
                            flow.motionVectorPrecision === prec
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                              : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                          } ${!flow.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {prec.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scene Change Threshold */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Cut Thresh</span>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      value={flow.sceneChangeThreshold}
                      disabled={!flow.enabled}
                      onChange={(e) => patchFlow({ sceneChangeThreshold: Number(e.target.value) })}
                      className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {Math.round(flow.sceneChangeThreshold * 100)}%
                    </span>
                  </label>

                  {/* Block Overlap (OBMC) */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Overlap OBMC</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={flow.blockOverlapPct}
                      disabled={!flow.enabled}
                      onChange={(e) => patchFlow({ blockOverlapPct: Number(e.target.value) })}
                      className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {flow.blockOverlapPct}%
                    </span>
                  </label>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S54 — Video Stabilization, Rolling Shutter & Gyro Smoothing */}
      {(currentTab === 'video' || (currentTab === 'basic' && videoClip)) && videoClip ? (
        <Section title="Camera Stabilization & Wobble Correction">
          {(() => {
            const stab = clip.effects?.stabilizer ?? DEFAULT_VIDEO_STABILIZER_SETTINGS;
            const patchStab = (patch: Partial<VideoStabilizerSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  stabilizer: {
                    ...stab,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: VideoStabilizerPresetKey) => {
              const preset = VIDEO_STABILIZER_PRESETS[key];
              if (!preset) return;
              patchStab({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={stab.enabled}
                      label="Enable Stabilization"
                      onChange={() => patchStab({ enabled: !stab.enabled })}
                    />
                    <span className="font-medium">
                      {stab.enabled ? 'Stabilization Active' : 'Stabilization Bypassed'}
                    </span>
                  </label>
                  {stab.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, stabilizer: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Preset Chips */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Camera Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(VIDEO_STABILIZER_PRESETS) as VideoStabilizerPresetKey[]).map((key) => {
                      const p = VIDEO_STABILIZER_PRESETS[key];
                      const active = stab.preset === key && stab.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mode Selector */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-text-secondary font-medium">Stabilizer Mode</span>
                    <span className="text-[10px] font-mono text-sky-400 capitalize">{stab.mode.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['smooth_motion', 'tripod_lock', 'translation_only'] as VideoStabilizerMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => patchStab({ mode })}
                        disabled={!stab.enabled}
                        className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors capitalize ${
                          stab.mode === mode
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                        } ${!stab.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40 font-mono text-xs">
                  {/* Smoothness Window */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Smoothness</span>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={stab.smoothness}
                      disabled={!stab.enabled}
                      onChange={(e) => patchStab({ smoothness: Number(e.target.value) })}
                      className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {stab.smoothness} f
                    </span>
                  </label>

                  {/* Shakiness Sensitivity */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Shakiness</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={stab.shakiness}
                      disabled={!stab.enabled}
                      onChange={(e) => patchStab({ shakiness: Number(e.target.value) })}
                      className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {stab.shakiness}/10
                    </span>
                  </label>

                  {/* Auto-Crop Zoom Margin */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Auto Zoom</span>
                    <input
                      type="range"
                      min={0}
                      max={0.3}
                      step={0.01}
                      value={stab.autoCropZoom}
                      disabled={!stab.enabled}
                      onChange={(e) => patchStab({ autoCropZoom: Number(e.target.value) })}
                      className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-12 text-right text-text-primary">
                      +{Math.round(stab.autoCropZoom * 100)}%
                    </span>
                  </label>

                  {/* Rolling Shutter Wobble Correction */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-hairline/40">
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stab.rollingShutterCorrection}
                          disabled={!stab.enabled}
                          onChange={(e) => patchStab({ rollingShutterCorrection: e.target.checked })}
                          className="accent-sky-400"
                        />
                        <span className="font-semibold text-text-primary">Rolling Shutter Correction</span>
                      </label>
                      {stab.rollingShutterCorrection && (
                        <span className="text-[10px] font-mono text-sky-300">
                          {Math.round(stab.rollingShutterStrength * 100)}% Depth
                        </span>
                      )}
                    </div>
                    {stab.rollingShutterCorrection && (
                      <label className="flex items-center gap-2 text-text-secondary text-[11px] pt-0.5">
                        <span className="w-20 shrink-0 text-text-disabled">De-Wobble</span>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={stab.rollingShutterStrength}
                          disabled={!stab.enabled}
                          onChange={(e) => patchStab({ rollingShutterStrength: Number(e.target.value) })}
                          className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {Math.round(stab.rollingShutterStrength * 100)}%
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

    </div>
  );
});
