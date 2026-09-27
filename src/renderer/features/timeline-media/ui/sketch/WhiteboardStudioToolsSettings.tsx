import {
  type WhiteboardSettings,
  type ToolSwapTransitionType,
  type DraftingGuideMode,
  type GuideMaterialType,
  type LaserColorPreset,
  type PerspectiveGridMode,
  type PaletteDockStyle,
  type PaletteColorPreset,
  type StickyNoteColorPreset,
  type StickyPinStyle,
  type StencilShape,
  type CalloutBadgeStyle,
  type HighlighterColorPreset,
} from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardStudioToolsSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function WhiteboardStudioToolsSettings({
  activeSettings,
  updateSettings,
}: WhiteboardStudioToolsSettingsProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Studio Drafting & Stationery Tools
      </span>

      {/* Milestone S110: Multi-Tool Hot-Swapping & Eraser Cap Flip */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">sync_alt</span>
              Multi-Tool Swap & Stylus Flip
            </span>
            <span className="text-[10px] text-text-disabled">
              180° eraser cap flip & holster dock carousel
            </span>
          </div>
          <Switch
            checked={activeSettings.toolSwap?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.toolSwap?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                toolSwap: {
                  ...activeSettings.toolSwap,
                  enabled: !current,
                  defaultTransition: activeSettings.toolSwap?.defaultTransition ?? 'flip',
                  durationSec: activeSettings.toolSwap?.durationSec ?? 0.5,
                  foleyAudioCues: activeSettings.toolSwap?.foleyAudioCues ?? true,
                },
              });
            }}
            label="Toggle multi-tool swapping and stylus flip"
          />
        </div>

        {activeSettings.toolSwap?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Swap Kinematics</span>
              <SegmentedControl
                value={activeSettings.toolSwap?.defaultTransition ?? 'flip'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    toolSwap: {
                      ...activeSettings.toolSwap,
                      defaultTransition: val as ToolSwapTransitionType,
                    },
                  })
                }
                options={[
                  { value: 'flip', label: '180° Flip' },
                  { value: 'dock', label: 'Dock Swap' },
                  { value: 'instant', label: 'Instant' },
                ]}
                ariaLabel="Tool swap kinematics"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Transition Duration</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.toolSwap?.durationSec ?? 0.5).toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1.5}
              step={0.05}
              value={activeSettings.toolSwap?.durationSec ?? 0.5}
              aria-label="Tool transition duration"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  toolSwap: {
                    ...activeSettings.toolSwap,
                    durationSec: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Foley Audio Snap Cues</span>
              <Switch
                checked={activeSettings.toolSwap?.foleyAudioCues ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    toolSwap: {
                      ...activeSettings.toolSwap,
                      foleyAudioCues: !(activeSettings.toolSwap?.foleyAudioCues ?? true),
                    },
                  })
                }
                label="Toggle foley audio snap cues"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S112: Vector Ruler, Compass & Geometric Drafting Guides */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">straighten</span>
              Geometric Drafting Guides
            </span>
            <span className="text-[10px] text-text-disabled">
              Straightedge ruler slide & compass circle sweep
            </span>
          </div>
          <Switch
            checked={activeSettings.draftingGuide?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.draftingGuide?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                draftingGuide: {
                  ...activeSettings.draftingGuide,
                  enabled: !current,
                  mode: activeSettings.draftingGuide?.mode ?? 'auto',
                  material: activeSettings.draftingGuide?.material ?? 'acrylic',
                  minLineLengthPx: activeSettings.draftingGuide?.minLineLengthPx ?? 100,
                  slideAudioCue: activeSettings.draftingGuide?.slideAudioCue ?? true,
                  showGraduations: activeSettings.draftingGuide?.showGraduations ?? true,
                },
              });
            }}
            label="Toggle geometric drafting guides"
          />
        </div>

        {activeSettings.draftingGuide?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Guide Mode</span>
              <SegmentedControl
                value={activeSettings.draftingGuide?.mode ?? 'auto'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    draftingGuide: {
                      ...activeSettings.draftingGuide,
                      mode: val as DraftingGuideMode,
                    },
                  })
                }
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'ruler', label: 'Ruler' },
                  { value: 'compass', label: 'Compass' },
                ]}
                ariaLabel="Drafting guide mode"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Instrument Material</span>
              <SegmentedControl
                value={activeSettings.draftingGuide?.material ?? 'acrylic'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    draftingGuide: {
                      ...activeSettings.draftingGuide,
                      material: val as GuideMaterialType,
                    },
                  })
                }
                options={[
                  { value: 'acrylic', label: 'Acrylic' },
                  { value: 'wood', label: 'Wood' },
                  { value: 'metal', label: 'Metal' },
                ]}
                ariaLabel="Guide material type"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Min Ruler Stroke</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.draftingGuide?.minLineLengthPx ?? 100)}px
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={250}
              step={10}
              value={activeSettings.draftingGuide?.minLineLengthPx ?? 100}
              aria-label="Minimum line length for ruler alignment"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  draftingGuide: {
                    ...activeSettings.draftingGuide,
                    minLineLengthPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Slide & Pivot Foley</span>
              <Switch
                checked={activeSettings.draftingGuide?.slideAudioCue ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    draftingGuide: {
                      ...activeSettings.draftingGuide,
                      slideAudioCue: !(activeSettings.draftingGuide?.slideAudioCue ?? true),
                    },
                  })
                }
                label="Toggle drafting slide and pivot foley"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S118: Smart Geometric Shape Recognition & Regularization */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">category</span>
              Smart Shape Regularization
            </span>
            <span className="text-[10px] text-text-disabled">
              Auto-snap wobbly circles, rectangles, triangles & lines
            </span>
          </div>
          <Switch
            checked={activeSettings.shapeRecognition?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.shapeRecognition?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                shapeRecognition: {
                  ...activeSettings.shapeRecognition,
                  enabled: !current,
                  snapTolerance: activeSettings.shapeRecognition?.snapTolerance ?? 0.20,
                  angleSnap: activeSettings.shapeRecognition?.angleSnap ?? true,
                  morphDurationSec: activeSettings.shapeRecognition?.morphDurationSec ?? 0.30,
                },
              });
            }}
            label="Toggle smart geometric shape recognition"
          />
        </div>

        {activeSettings.shapeRecognition?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Recognition Tolerance</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.shapeRecognition?.snapTolerance ?? 0.20) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.40}
              step={0.05}
              value={activeSettings.shapeRecognition?.snapTolerance ?? 0.20}
              aria-label="Shape recognition tolerance"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  shapeRecognition: {
                    ...activeSettings.shapeRecognition,
                    snapTolerance: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Straight Line Angle Snapping (15° / 45° / 90°)</span>
              <Switch
                checked={activeSettings.shapeRecognition?.angleSnap ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    shapeRecognition: {
                      ...activeSettings.shapeRecognition,
                      angleSnap: !(activeSettings.shapeRecognition?.angleSnap ?? true),
                    },
                  })
                }
                label="Toggle straight line angle snapping"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Morph Transition Duration</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.shapeRecognition?.morphDurationSec ?? 0.30).toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.80}
              step={0.05}
              value={activeSettings.shapeRecognition?.morphDurationSec ?? 0.30}
              aria-label="Morph transition duration"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  shapeRecognition: {
                    ...activeSettings.shapeRecognition,
                    morphDurationSec: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S119: Whiteboard Laser Pointer & Phosphor Afterglow */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">flare</span>
              Laser Pointer & Phosphor Afterglow
            </span>
            <span className="text-[10px] text-text-disabled">
              Monochromatic spot bloom & decaying trail persistence
            </span>
          </div>
          <Switch
            checked={activeSettings.laserPointer?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.laserPointer?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                laserPointer: {
                  ...activeSettings.laserPointer,
                  enabled: !current,
                  colorPreset: activeSettings.laserPointer?.colorPreset ?? 'emerald',
                  coreRadiusPx: activeSettings.laserPointer?.coreRadiusPx ?? 3.5,
                  haloRadiusPx: activeSettings.laserPointer?.haloRadiusPx ?? 16.0,
                  persistenceSec: activeSettings.laserPointer?.persistenceSec ?? 0.80,
                  trailIntensity: activeSettings.laserPointer?.trailIntensity ?? 0.90,
                },
              });
            }}
            label="Toggle laser pointer and phosphor afterglow"
          />
        </div>

        {activeSettings.laserPointer?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wavelength Color</span>
              <SegmentedControl
                value={activeSettings.laserPointer?.colorPreset ?? 'emerald'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    laserPointer: {
                      ...activeSettings.laserPointer,
                      colorPreset: val as LaserColorPreset,
                    },
                  })
                }
                options={[
                  { value: 'emerald', label: 'Emerald' },
                  { value: 'ruby', label: 'Ruby' },
                  { value: 'violet', label: 'Violet' },
                ]}
                ariaLabel="Laser beam color"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Pointer Core Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.laserPointer?.coreRadiusPx ?? 3.5).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={1.5}
              max={8.0}
              step={0.5}
              value={activeSettings.laserPointer?.coreRadiusPx ?? 3.5}
              aria-label="Laser core radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  laserPointer: {
                    ...activeSettings.laserPointer,
                    coreRadiusPx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S120: Whiteboard Magnetic Grid, Isometric Guidelines & Perspective Drafting */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">grid_4x4</span>
              Magnetic Grid & Perspective
            </span>
            <span className="text-[10px] text-text-disabled">
              Isometric, Cartesian & 3D vanishing perspective snapping
            </span>
          </div>
          <Switch
            checked={activeSettings.gridSubstrate?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.gridSubstrate?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                gridSubstrate: {
                  ...activeSettings.gridSubstrate,
                  enabled: !current,
                  mode: activeSettings.gridSubstrate?.mode ?? 'isometric',
                  spacingPx: activeSettings.gridSubstrate?.spacingPx ?? 40,
                  snapRadiusPx: activeSettings.gridSubstrate?.snapRadiusPx ?? 12,
                  horizonYPct: activeSettings.gridSubstrate?.horizonYPct ?? 0.40,
                  opacity: activeSettings.gridSubstrate?.opacity ?? 0.20,
                },
              });
            }}
            label="Toggle magnetic grid and perspective drafting substrate"
          />
        </div>

        {activeSettings.gridSubstrate?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Grid Substrate Mode</span>
              <SegmentedControl
                value={activeSettings.gridSubstrate?.mode ?? 'isometric'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    gridSubstrate: {
                      ...activeSettings.gridSubstrate,
                      mode: val as PerspectiveGridMode,
                    },
                  })
                }
                options={[
                  { value: 'isometric', label: 'Iso 3D' },
                  { value: 'cartesian', label: 'Cartesian' },
                  { value: 'perspective', label: 'Horizon' },
                  { value: 'dots', label: 'Dots' },
                ]}
                ariaLabel="Grid substrate mode"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Lattice Spacing</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.gridSubstrate?.spacingPx ?? 40)}px
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={100}
              step={5}
              value={activeSettings.gridSubstrate?.spacingPx ?? 40}
              aria-label="Grid lattice node spacing"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  gridSubstrate: {
                    ...activeSettings.gridSubstrate,
                    spacingPx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S123: Whiteboard Dynamic Tool Auto-Invocation & Staging Carousel */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">handyman</span>
              Dynamic Tool Auto-Invocation
            </span>
            <span className="text-[10px] text-text-disabled">
              Gesture-driven auto ruler, laser hover & tray staging
            </span>
          </div>
          <Switch
            checked={activeSettings.toolOrchestrator?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.toolOrchestrator?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                toolOrchestrator: {
                  ...activeSettings.toolOrchestrator,
                  enabled: !current,
                  autoRulerThresholdPx: activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80.0,
                  autoLaserHoldSec: activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40,
                  toolEnterDurationSec: activeSettings.toolOrchestrator?.toolEnterDurationSec ?? 0.25,
                  toolDismissTimeoutSec: activeSettings.toolOrchestrator?.toolDismissTimeoutSec ?? 0.60,
                  trayPosition: activeSettings.toolOrchestrator?.trayPosition ?? 'bottom-right',
                },
              });
            }}
            label="Toggle dynamic tool auto-invocation and staging carousel"
          />
        </div>

        {activeSettings.toolOrchestrator?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Auto-Ruler Straight Line Trigger</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80)}px
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={160}
              step={10}
              value={activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80}
              aria-label="Auto-ruler gesture line length threshold"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  toolOrchestrator: {
                    ...activeSettings.toolOrchestrator,
                    autoRulerThresholdPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Laser Hover Hesitation Threshold</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40).toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min={0.15}
              max={0.80}
              step={0.05}
              value={activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40}
              aria-label="Laser hover hesitation threshold duration"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  toolOrchestrator: {
                    ...activeSettings.toolOrchestrator,
                    autoLaserHoldSec: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S124: Whiteboard Multi-Color Palette Carousel & Pen Dock */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">palette</span>
              Multi-Color Palette Dock
            </span>
            <span className="text-[10px] text-text-disabled">
              Rotating ring dock, desk caddy & 4-in-1 click-pen
            </span>
          </div>
          <Switch
            checked={activeSettings.paletteDock?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.paletteDock?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                paletteDock: {
                  ...activeSettings.paletteDock,
                  enabled: !current,
                  dockStyle: activeSettings.paletteDock?.dockStyle ?? 'caddy',
                  activeColorIdx: activeSettings.paletteDock?.activeColorIdx ?? 0,
                  palettePreset: activeSettings.paletteDock?.palettePreset ?? 'standard',
                  rotationDurationSec: activeSettings.paletteDock?.rotationDurationSec ?? 0.20,
                  clickFoleyVolume: activeSettings.paletteDock?.clickFoleyVolume ?? 0.70,
                },
              });
            }}
            label="Toggle multi-color palette dock"
          />
        </div>

        {activeSettings.paletteDock?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Dock Mechanism</span>
              <SegmentedControl
                value={activeSettings.paletteDock?.dockStyle ?? 'caddy'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    paletteDock: {
                      ...activeSettings.paletteDock,
                      dockStyle: val as PaletteDockStyle,
                    },
                  })
                }
                options={[
                  { value: 'caddy', label: 'Caddy' },
                  { value: 'ring_dock', label: 'Ring Dock' },
                  { value: 'multipen_click', label: '4-in-1 Pen' },
                ]}
                ariaLabel="Palette dock mechanism"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Palette Preset</span>
              <SegmentedControl
                value={activeSettings.paletteDock?.palettePreset ?? 'standard'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    paletteDock: {
                      ...activeSettings.paletteDock,
                      palettePreset: val as PaletteColorPreset,
                    },
                  })
                }
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'neon', label: 'Neon' },
                  { value: 'earth', label: 'Earth' },
                ]}
                ariaLabel="Color palette preset"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Active Pen Slot</span>
              <SegmentedControl
                value={String(activeSettings.paletteDock?.activeColorIdx ?? 0)}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    paletteDock: {
                      ...activeSettings.paletteDock,
                      activeColorIdx: Number(val),
                    },
                  })
                }
                options={[
                  { value: '0', label: 'Black' },
                  { value: '1', label: 'Red' },
                  { value: '2', label: 'Blue' },
                  { value: '3', label: 'Green' },
                ]}
                ariaLabel="Active pen color slot"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Click Foley Sound Level</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.paletteDock?.clickFoleyVolume ?? 0.70) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.paletteDock?.clickFoleyVolume ?? 0.70}
              aria-label="Mechanical click foley sound volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  paletteDock: {
                    ...activeSettings.paletteDock,
                    clickFoleyVolume: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S126: Whiteboard Sticky Notes & Stencil Masking */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">sticky_note_2</span>
              Sticky Notes & Stencil Masking
            </span>
            <span className="text-[10px] text-text-disabled">
              Stationery paper notes, corner peel drop shadow & aperture stencil clipping
            </span>
          </div>
          <Switch
            checked={activeSettings.stickyNote?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.stickyNote?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                stickyNote: {
                  ...activeSettings.stickyNote,
                  enabled: !current,
                  colorPreset: activeSettings.stickyNote?.colorPreset ?? 'canary',
                  posX: activeSettings.stickyNote?.posX ?? 250,
                  posY: activeSettings.stickyNote?.posY ?? 250,
                  width: activeSettings.stickyNote?.width ?? 220,
                  height: activeSettings.stickyNote?.height ?? 220,
                  rotationDeg: activeSettings.stickyNote?.rotationDeg ?? -3.5,
                  peelElevationPx: activeSettings.stickyNote?.peelElevationPx ?? 12,
                  pinStyle: activeSettings.stickyNote?.pinStyle ?? 'magnet',
                },
              });
            }}
            label="Toggle whiteboard sticky note"
          />
        </div>

        {activeSettings.stickyNote?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Stationery Color</span>
              <SegmentedControl
                value={activeSettings.stickyNote?.colorPreset ?? 'canary'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    stickyNote: {
                      ...activeSettings.stickyNote,
                      colorPreset: val as StickyNoteColorPreset,
                    },
                  })
                }
                options={[
                  { value: 'canary', label: 'Canary' },
                  { value: 'pink', label: 'Pink' },
                  { value: 'cyan', label: 'Cyan' },
                  { value: 'mint', label: 'Mint' },
                  { value: 'orange', label: 'Orange' },
                ]}
                ariaLabel="Sticky note color preset"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Anchor Fastener</span>
              <SegmentedControl
                value={activeSettings.stickyNote?.pinStyle ?? 'magnet'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    stickyNote: {
                      ...activeSettings.stickyNote,
                      pinStyle: val as StickyPinStyle,
                    },
                  })
                }
                options={[
                  { value: 'magnet', label: 'Magnet' },
                  { value: 'pushpin', label: 'Pushpin' },
                  { value: 'tape', label: 'Tape' },
                  { value: 'none', label: 'None' },
                ]}
                ariaLabel="Sticky note anchor pin style"
              />
            </div>

            {/* Stencil Sub-section */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
              <span className="text-[11px] text-text-secondary">Aperture Stencil Clipping</span>
              <Switch
                checked={activeSettings.stencilMask?.enabled ?? false}
                onChange={() => {
                  const cur = activeSettings.stencilMask?.enabled ?? false;
                  updateSettings({
                    ...activeSettings,
                    stencilMask: {
                      ...activeSettings.stencilMask,
                      enabled: !cur,
                      shape: activeSettings.stencilMask?.shape ?? 'rectangle',
                      invertMask: activeSettings.stencilMask?.invertMask ?? false,
                    },
                  });
                }}
                label="Toggle stencil clipping"
              />
            </div>

            {activeSettings.stencilMask?.enabled && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Stencil Shape</span>
                <SegmentedControl
                  value={activeSettings.stencilMask?.shape ?? 'rectangle'}
                  onChange={(val) =>
                    updateSettings({
                      ...activeSettings,
                      stencilMask: {
                        ...activeSettings.stencilMask,
                        shape: val as StencilShape,
                      },
                    })
                  }
                  options={[
                    { value: 'rectangle', label: 'Card' },
                    { value: 'circle', label: 'Circle' },
                    { value: 'speech_bubble', label: 'Bubble' },
                  ]}
                  ariaLabel="Stencil mask shape"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Milestone S127: Lasso Encirclement & Auto-Callout Badge */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">adjust</span>
              Lasso Callout Badges & Pulsing
            </span>
            <span className="text-[10px] text-text-disabled">
              Encircle diagrams or text to invoke focus beacons & numbered badges
            </span>
          </div>
          <Switch
            checked={activeSettings.lassoCallout?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.lassoCallout?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                lassoCallout: {
                  ...activeSettings.lassoCallout,
                  enabled: !current,
                  calloutStyle: activeSettings.lassoCallout?.calloutStyle ?? 'pulse_beacon',
                  badgeLabel: activeSettings.lassoCallout?.badgeLabel ?? '1',
                  pulseFrequencyHz: activeSettings.lassoCallout?.pulseFrequencyHz ?? 1.2,
                  closureThresholdRatio: activeSettings.lassoCallout?.closureThresholdRatio ?? 0.25,
                  minEnclosedArea: activeSettings.lassoCallout?.minEnclosedArea ?? 500,
                  glowColorHex: activeSettings.lassoCallout?.glowColorHex ?? '#ffdc33',
                },
              });
            }}
            label="Toggle lasso callout badge"
          />
        </div>

        {activeSettings.lassoCallout?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Callout Style</span>
              <SegmentedControl
                value={activeSettings.lassoCallout?.calloutStyle ?? 'pulse_beacon'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    lassoCallout: {
                      ...activeSettings.lassoCallout,
                      calloutStyle: val as CalloutBadgeStyle,
                    },
                  })
                }
                options={[
                  { value: 'pulse_beacon', label: 'Pulse' },
                  { value: 'badge_pin', label: 'Pin Badge' },
                  { value: 'magnifier_loupe', label: 'Magnifier' },
                ]}
                ariaLabel="Lasso callout visual style"
              />
            </div>

            {activeSettings.lassoCallout?.calloutStyle === 'badge_pin' && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Badge Label</span>
                <input
                  type="text"
                  maxLength={4}
                  value={activeSettings.lassoCallout?.badgeLabel ?? '1'}
                  aria-label="Badge pin label"
                  className="w-16 px-1.5 py-0.5 text-center text-[10px] bg-bg-surface border border-hairline rounded text-text-primary focus:border-accent-ai outline-none font-mono"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      lassoCallout: {
                        ...activeSettings.lassoCallout,
                        badgeLabel: e.target.value,
                      },
                    })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Milestone S128: Fluorescent Highlighter Sub-Layer */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">border_color</span>
              Fluorescent Highlighter
            </span>
            <span className="text-[10px] text-text-disabled">
              Broad chisel-tip dye stroke with optical subtractive text preservation
            </span>
          </div>
          <Switch
            checked={activeSettings.highlighter?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.highlighter?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                highlighter: {
                  ...activeSettings.highlighter,
                  enabled: !current,
                  colorPreset: activeSettings.highlighter?.colorPreset ?? 'yellow',
                  nibWidthPx: activeSettings.highlighter?.nibWidthPx ?? 24,
                  nibAngleDeg: activeSettings.highlighter?.nibAngleDeg ?? 15,
                  opacity: activeSettings.highlighter?.opacity ?? 0.45,
                  compositeMode: activeSettings.highlighter?.compositeMode ?? 'subtractive_multiply',
                },
              });
            }}
            label="Toggle fluorescent highlighter"
          />
        </div>

        {activeSettings.highlighter?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fluorescent Tone</span>
              <SegmentedControl
                value={activeSettings.highlighter?.colorPreset ?? 'yellow'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    highlighter: {
                      ...activeSettings.highlighter,
                      colorPreset: val as HighlighterColorPreset,
                    },
                  })
                }
                options={[
                  { value: 'yellow', label: 'Yellow' },
                  { value: 'green', label: 'Green' },
                  { value: 'pink', label: 'Pink' },
                  { value: 'cyan', label: 'Cyan' },
                  { value: 'orange', label: 'Orange' },
                ]}
                ariaLabel="Highlighter color preset"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Chisel Nib Width</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.highlighter?.nibWidthPx ?? 24)}px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={45}
              step={1}
              value={activeSettings.highlighter?.nibWidthPx ?? 24}
              aria-label="Highlighter chisel nib width"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  highlighter: {
                    ...activeSettings.highlighter,
                    nibWidthPx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S148: Whiteboard Drafting Pantograph Mechanical Linkage & Magnetic Arc Pivot */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">architecture</span>
              <span>Pantograph Mechanical Linkage</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Articulated 4-bar scissor scaling & magnetic arc pivot
            </span>
          </div>
          <Switch
            checked={activeSettings.pantographPivot?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.pantographPivot?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                pantographPivot: {
                  ...activeSettings.pantographPivot,
                  enabled: !current,
                  scaleRatio: activeSettings.pantographPivot?.scaleRatio ?? 2.0,
                  magneticSnapEnabled: activeSettings.pantographPivot?.magneticSnapEnabled ?? true,
                  magneticSnapRadius: activeSettings.pantographPivot?.magneticSnapRadius ?? 20,
                  arcSnapStep: activeSettings.pantographPivot?.arcSnapStep ?? 50,
                  elasticFlexDamping: activeSettings.pantographPivot?.elasticFlexDamping ?? 0.05,
                  renderOverlayEnabled: activeSettings.pantographPivot?.renderOverlayEnabled ?? true,
                },
              });
            }}
            label="Toggle whiteboard drafting pantograph mechanical linkage and magnetic arc pivot"
          />
        </div>

        {activeSettings.pantographPivot?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Kinematic Scale Ratio (R)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.pantographPivot?.scaleRatio ?? 2.0).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={4.0}
              step={0.1}
              value={activeSettings.pantographPivot?.scaleRatio ?? 2.0}
              aria-label="Pantograph scissor arm drawing scale ratio"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pantographPivot: {
                    ...activeSettings.pantographPivot,
                    scaleRatio: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Magnetic Snap Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.pantographPivot?.magneticSnapRadius ?? 20)}px
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={activeSettings.pantographPivot?.magneticSnapRadius ?? 20}
              aria-label="Magnetic polar arc elastic attraction radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pantographPivot: {
                    ...activeSettings.pantographPivot,
                    magneticSnapRadius: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S153: Whiteboard Drafting Compass & Mechanical Divider Caliper Geometry */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">change_history</span>
              <span>Drafting Compass & Divider Caliper</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Kinematic articulated legs, chord stepping & thumbscrew ratchet
            </span>
          </div>
          <Switch
            checked={activeSettings.draftingCompass?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.draftingCompass?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                draftingCompass: {
                  ...activeSettings.draftingCompass,
                  enabled: !current,
                  armLengthPx: activeSettings.draftingCompass?.armLengthPx ?? 160.0,
                  needleFriction: activeSettings.draftingCompass?.needleFriction ?? 0.30,
                  thumbscrewPitchPx: activeSettings.draftingCompass?.thumbscrewPitchPx ?? 2.0,
                  showCompassOverlay: activeSettings.draftingCompass?.showCompassOverlay ?? true,
                  foleyRatchetVolume: activeSettings.draftingCompass?.foleyRatchetVolume ?? 0.70,
                },
              });
            }}
            label="Toggle whiteboard drafting compass and mechanical divider caliper"
          />
        </div>

        {activeSettings.draftingCompass?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Compass Leg Length</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.draftingCompass?.armLengthPx ?? 160)}px
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={300}
              step={10}
              value={activeSettings.draftingCompass?.armLengthPx ?? 160}
              aria-label="Mechanical compass leg length in pixels"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  draftingCompass: {
                    ...activeSettings.draftingCompass,
                    armLengthPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Needle Pivot Friction</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.draftingCompass?.needleFriction ?? 0.30) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.draftingCompass?.needleFriction ?? 0.30}
              aria-label="Center needle rotational friction drag torque"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  draftingCompass: {
                    ...activeSettings.draftingCompass,
                    needleFriction: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>
    </Card>
  );
}
