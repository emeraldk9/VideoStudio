import type { WhiteboardSettings } from '@shared';
import { Button } from '../../../../shared/ui/Button';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardPhysicsSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function WhiteboardPhysicsSettings({
  activeSettings,
  updateSettings,
}: WhiteboardPhysicsSettingsProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Ink & Substrate Physics
      </span>

      {/* Milestone S101: Ink Physics, Wet-Edge Pooling & Chalk Dust */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
              Ink Bleed & Wet Pooling
            </span>
            <span className="text-[10px] text-text-disabled">
              Velocity-sensitive pooling & subtractive glazes
            </span>
          </div>
          <Switch
            checked={(activeSettings.inkPhysics?.poolingFactor ?? 0.35) > 0}
            onChange={() => {
              const currentPooling = activeSettings.inkPhysics?.poolingFactor ?? 0.35;
              updateSettings({
                ...activeSettings,
                inkPhysics: {
                  ...activeSettings.inkPhysics,
                  poolingFactor: currentPooling > 0 ? 0 : 0.35,
                  subtractiveBlend: activeSettings.inkPhysics?.subtractiveBlend ?? true,
                  dustParticles: activeSettings.inkPhysics?.dustParticles ?? (activeSettings.hand === 'chalk'),
                },
              });
            }}
            label="Toggle ink bleed and wet pooling"
          />
        </div>

        {(activeSettings.inkPhysics?.poolingFactor ?? 0.35) > 0 && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Pooling Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.inkPhysics?.poolingFactor ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.8}
              step={0.05}
              value={activeSettings.inkPhysics?.poolingFactor ?? 0.35}
              aria-label="Ink Pooling Intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  inkPhysics: {
                    ...activeSettings.inkPhysics,
                    poolingFactor: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Subtractive Glaze</span>
              <Switch
                checked={activeSettings.inkPhysics?.subtractiveBlend ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    inkPhysics: {
                      ...activeSettings.inkPhysics,
                      subtractiveBlend: !(activeSettings.inkPhysics?.subtractiveBlend ?? true),
                    },
                  })
                }
                label="Toggle subtractive glaze blending"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S107: Stylus Pressure Dynamics & Variable Ribbons */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">gesture</span>
              Stylus Pressure Dynamics
            </span>
            <span className="text-[10px] text-text-disabled">
              Non-linear pressure response curves & tilt ribbon mesh
            </span>
          </div>
          <Switch
            checked={activeSettings.stylusPressure?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.stylusPressure?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                stylusPressure: {
                  ...activeSettings.stylusPressure,
                  enabled: !current,
                  curve: activeSettings.stylusPressure?.curve ?? 'sigmoid',
                  sensitivity: activeSettings.stylusPressure?.sensitivity ?? 1.0,
                  minWidthPct: activeSettings.stylusPressure?.minWidthPct ?? 0.25,
                  tiltDeformation: activeSettings.stylusPressure?.tiltDeformation ?? true,
                },
              });
            }}
            label="Toggle stylus pressure dynamics"
          />
        </div>

        {activeSettings.stylusPressure?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Pressure Curve</span>
              <SegmentedControl
                value={activeSettings.stylusPressure?.curve ?? 'sigmoid'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    stylusPressure: {
                      ...activeSettings.stylusPressure,
                      curve: val as 'linear' | 'exponential' | 'sigmoid' | 'calligraphic',
                    },
                  })
                }
                options={[
                  { value: 'sigmoid', label: 'S-Curve' },
                  { value: 'calligraphic', label: 'Callig' },
                  { value: 'exponential', label: 'Firm' },
                  { value: 'linear', label: 'Linear' },
                ]}
                ariaLabel="Pressure response curve"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Sensitivity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.stylusPressure?.sensitivity ?? 1.0).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.1}
              value={activeSettings.stylusPressure?.sensitivity ?? 1.0}
              aria-label="Stylus Pressure Sensitivity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  stylusPressure: {
                    ...activeSettings.stylusPressure,
                    sensitivity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Tilt Contact Footprint</span>
              <Switch
                checked={activeSettings.stylusPressure?.tiltDeformation ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    stylusPressure: {
                      ...activeSettings.stylusPressure,
                      tiltDeformation: !(activeSettings.stylusPressure?.tiltDeformation ?? true),
                    },
                  })
                }
                label="Toggle tilt contact footprint"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S108: Granular Surface Friction & Nib Wear */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">texture</span>
              Surface Friction & Nib Wear
            </span>
            <span className="text-[10px] text-text-disabled">
              Substrate tooth drag & asymptotic tip flattening
            </span>
          </div>
          <Switch
            checked={activeSettings.surfaceFriction?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.surfaceFriction?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                surfaceFriction: {
                  ...activeSettings.surfaceFriction,
                  enabled: !current,
                  surfaceType: activeSettings.surfaceFriction?.surfaceType ?? 'whiteboard',
                  grainScale: activeSettings.surfaceFriction?.grainScale ?? 1.0,
                  nibWearRate: activeSettings.surfaceFriction?.nibWearRate ?? 0.25,
                  toothRoughness: activeSettings.surfaceFriction?.toothRoughness ?? 0.3,
                },
              });
            }}
            label="Toggle surface friction and nib wear"
          />
        </div>

        {activeSettings.surfaceFriction?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Substrate Texture</span>
              <SegmentedControl
                value={activeSettings.surfaceFriction?.surfaceType ?? 'whiteboard'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    surfaceFriction: {
                      ...activeSettings.surfaceFriction,
                      surfaceType: val as 'whiteboard' | 'paper' | 'slate' | 'canvas',
                    },
                  })
                }
                options={[
                  { value: 'whiteboard', label: 'Board' },
                  { value: 'paper', label: 'Paper' },
                  { value: 'slate', label: 'Slate' },
                  { value: 'canvas', label: 'Canvas' },
                ]}
                ariaLabel="Surface substrate texture"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Tooth Drag</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.surfaceFriction?.toothRoughness ?? 0.3) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={activeSettings.surfaceFriction?.toothRoughness ?? 0.3}
              aria-label="Surface Tooth Roughness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  surfaceFriction: {
                    ...activeSettings.surfaceFriction,
                    toothRoughness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Nib Wear Rate</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.surfaceFriction?.nibWearRate ?? 0.25) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={activeSettings.surfaceFriction?.nibWearRate ?? 0.25}
              aria-label="Nib Wear Rate"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  surfaceFriction: {
                    ...activeSettings.surfaceFriction,
                    nibWearRate: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S122: Whiteboard Marker Ink Depletion & Chalk Micro-Chatter */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">format_paint</span>
              Ink Depletion & Chalk Chatter
            </span>
            <span className="text-[10px] text-text-disabled">
              Felt dry-out striations & stick-slip friction micro-skips
            </span>
          </div>
          <Switch
            checked={activeSettings.inkDepletion?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.inkDepletion?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                inkDepletion: {
                  ...activeSettings.inkDepletion,
                  enabled: !current,
                  depletionRate: activeSettings.inkDepletion?.depletionRate ?? 0.002,
                  minSaturation: activeSettings.inkDepletion?.minSaturation ?? 0.35,
                  streakCount: activeSettings.inkDepletion?.streakCount ?? 5,
                  rechargeRate: activeSettings.inkDepletion?.rechargeRate ?? 0.25,
                  chatterFrequency: activeSettings.inkDepletion?.chatterFrequency ?? 0.15,
                  enableChalkChatter: activeSettings.inkDepletion?.enableChalkChatter ?? false,
                },
              });
            }}
            label="Toggle ink depletion and chalk micro-chatter"
          />
        </div>

        {activeSettings.inkDepletion?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Depletion Rate (Drain / Px)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {((activeSettings.inkDepletion?.depletionRate ?? 0.002) * 1000).toFixed(1)}‰
              </span>
            </div>
            <input
              type="range"
              min={0.0005}
              max={0.006}
              step={0.0005}
              value={activeSettings.inkDepletion?.depletionRate ?? 0.002}
              aria-label="Ink depletion rate"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  inkDepletion: {
                    ...activeSettings.inkDepletion,
                    depletionRate: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Minimum Dry Saturation</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.inkDepletion?.minSaturation ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.15}
              max={0.70}
              step={0.05}
              value={activeSettings.inkDepletion?.minSaturation ?? 0.35}
              aria-label="Minimum dry pigment saturation"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  inkDepletion: {
                    ...activeSettings.inkDepletion,
                    minSaturation: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Felt Fiber Striations</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.inkDepletion?.streakCount ?? 5} lines
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={8}
              step={1}
              value={activeSettings.inkDepletion?.streakCount ?? 5}
              aria-label="Felt fiber striation streak count"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  inkDepletion: {
                    ...activeSettings.inkDepletion,
                    streakCount: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Chalk Micro-Chatter (Friction Skips)</span>
              <Switch
                checked={activeSettings.inkDepletion?.enableChalkChatter ?? false}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    inkDepletion: {
                      ...activeSettings.inkDepletion,
                      enableChalkChatter: !(activeSettings.inkDepletion?.enableChalkChatter ?? false),
                    },
                  })
                }
                label="Toggle chalk stick-slip micro chatter"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S134: Whiteboard Felt-Tip Marker Nib Splay & Directional Fiber Compression Dynamics */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
              Felt Nib Splay & Fiber Compression
            </span>
            <span className="text-[10px] text-text-disabled">
              Hookean spring elasticity, directional drag deflection & mushrooming
            </span>
          </div>
          <Switch
            checked={activeSettings.nibSplay?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.nibSplay?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                nibSplay: {
                  ...activeSettings.nibSplay,
                  enabled: !current,
                  splayGain: activeSettings.nibSplay?.splayGain ?? 1.2,
                  fiberStiffness: activeSettings.nibSplay?.fiberStiffness ?? 0.65,
                  dragDeflection: activeSettings.nibSplay?.dragDeflection ?? 0.40,
                },
              });
            }}
            label="Toggle felt nib splay and fiber compression"
          />
        </div>

        {activeSettings.nibSplay?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Splay Expansion Gain</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.nibSplay?.splayGain ?? 1.2).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.1}
              value={activeSettings.nibSplay?.splayGain ?? 1.2}
              aria-label="Fiber lateral splay expansion gain"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  nibSplay: {
                    ...activeSettings.nibSplay,
                    splayGain: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fiber Spring Stiffness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.nibSplay?.fiberStiffness ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.95}
              step={0.05}
              value={activeSettings.nibSplay?.fiberStiffness ?? 0.65}
              aria-label="Fiber compression resistance stiffness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  nibSplay: {
                    ...activeSettings.nibSplay,
                    fiberStiffness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Friction Drag Deflection</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.nibSplay?.dragDeflection ?? 0.40) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.nibSplay?.dragDeflection ?? 0.40}
              aria-label="Directional friction drag deflection"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  nibSplay: {
                    ...activeSettings.nibSplay,
                    dragDeflection: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S135: Whiteboard Wet-on-Wet Capillary Bleed & Pigment Diffusion at Stroke Intersections */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
              Wet Capillary Bleed & Diffusion
            </span>
            <span className="text-[10px] text-text-disabled">
              Solvent pooling, core dilution & dendritic feathering at line intersections
            </span>
          </div>
          <Switch
            checked={activeSettings.capillaryBleed?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.capillaryBleed?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                capillaryBleed: {
                  ...activeSettings.capillaryBleed,
                  enabled: !current,
                  dryingTimeSec: activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0,
                  bleedBloomRadiusPx: activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0,
                  solventDilution: activeSettings.capillaryBleed?.solventDilution ?? 0.35,
                  featherSpikes: activeSettings.capillaryBleed?.featherSpikes ?? 6,
                },
              });
            }}
            label="Toggle wet-on-wet capillary bleed"
          />
        </div>

        {activeSettings.capillaryBleed?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wet Drying Window</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0).toFixed(1)} s
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={5.0}
              step={0.5}
              value={activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0}
              aria-label="Liquid solvent drying duration window"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capillaryBleed: {
                    ...activeSettings.capillaryBleed,
                    dryingTimeSec: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Capillary Bloom Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0)} px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={15}
              step={1}
              value={activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0}
              aria-label="Capillary bloom feathering radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capillaryBleed: {
                    ...activeSettings.capillaryBleed,
                    bleedBloomRadiusPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Solvent Core Dilution</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.capillaryBleed?.solventDilution ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.70}
              step={0.05}
              value={activeSettings.capillaryBleed?.solventDilution ?? 0.35}
              aria-label="Solvent pooling core dilution percentage"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capillaryBleed: {
                    ...activeSettings.capillaryBleed,
                    solventDilution: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Dendritic Tendril Spikes</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.capillaryBleed?.featherSpikes ?? 6)}
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={12}
              step={1}
              value={activeSettings.capillaryBleed?.featherSpikes ?? 6}
              aria-label="Dendritic micro-tendril spike count"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capillaryBleed: {
                    ...activeSettings.capillaryBleed,
                    featherSpikes: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S144: Whiteboard Chalk Breakage & Variable Angle Edge Chatters */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">draw</span>
              <span>Chalk Breakage & Edge Chatters</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Stick-slip friction resonance & downforce shear breakage
            </span>
          </div>
          <Switch
            checked={activeSettings.chalkBreakage?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.chalkBreakage?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                chalkBreakage: {
                  ...activeSettings.chalkBreakage,
                  enabled: !current,
                  slantAngleDeg: activeSettings.chalkBreakage?.slantAngleDeg ?? 40.0,
                  chatterFrequencyHz: activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140.0,
                  skipThreshold: activeSettings.chalkBreakage?.skipThreshold ?? 0.35,
                  breakagePressureThreshold: activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88,
                  facetWidthMultiplier: activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2,
                  dustBurstCount: activeSettings.chalkBreakage?.dustBurstCount ?? 12,
                },
              });
            }}
            label="Toggle chalk stick-slip chatter skipping and structural breakage dynamics"
          />
        </div>

        {activeSettings.chalkBreakage?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Chalk Stick Slant Angle</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.chalkBreakage?.slantAngleDeg ?? 40}°
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={75}
              step={1}
              value={activeSettings.chalkBreakage?.slantAngleDeg ?? 40}
              aria-label="Grazing angle between chalk stick and board surface"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    slantAngleDeg: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Stick-Slip Chatter Frequency</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140} Hz
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={240}
              step={10}
              value={activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140}
              aria-label="Stick-slip mechanical resonance frequency"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    chatterFrequencyHz: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Skip Void Duty Threshold</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.chalkBreakage?.skipThreshold ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.7}
              step={0.05}
              value={activeSettings.chalkBreakage?.skipThreshold ?? 0.35}
              aria-label="Proportion of chatter wave cycle rendered as hollow void gaps"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    skipThreshold: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Breakage Pressure Threshold</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.6}
              max={0.98}
              step={0.02}
              value={activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88}
              aria-label="Critical stylus pressure threshold causing chalk stick to snap"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    breakagePressureThreshold: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Broken Wedge Facet Multiplier</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2}x
              </span>
            </div>
            <input
              type="range"
              min={1.5}
              max={3.5}
              step={0.1}
              value={activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2}
              aria-label="Stroke width multiplier after chalk breakage"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    facetWidthMultiplier: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Snap Debris Shard Count</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.chalkBreakage?.dustBurstCount ?? 12} Shards
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={2}
              value={activeSettings.chalkBreakage?.dustBurstCount ?? 12}
              aria-label="Number of radial chalk dust debris particles emitted upon snap"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkBreakage: {
                    ...activeSettings.chalkBreakage,
                    dustBurstCount: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S149: Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">history_edu</span>
              <span>Flexible Dip Nib & Railroading</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Tine splay swell & capillary meniscus railroading
            </span>
          </div>
          <Switch
            checked={activeSettings.flexNib?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.flexNib?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                flexNib: {
                  ...activeSettings.flexNib,
                  enabled: !current,
                  hairlineWidth: activeSettings.flexNib?.hairlineWidth ?? 1.2,
                  maxSwellWidth: activeSettings.flexNib?.maxSwellWidth ?? 14.0,
                  flexSensitivity: activeSettings.flexNib?.flexSensitivity ?? 1.4,
                  meniscusRuptureWidth: activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5,
                  meniscusReconnectWidth: activeSettings.flexNib?.meniscusReconnectWidth ?? 6.0,
                  reservoirCapacityPx: activeSettings.flexNib?.reservoirCapacityPx ?? 1200.0,
                  paperScratchResonance: activeSettings.flexNib?.paperScratchResonance ?? 0.8,
                },
              });
            }}
            label="Toggle calligraphic dip pen flexible nib tine splitting and meniscus railroading"
          />
        </div>

        {activeSettings.flexNib?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Max Swell Width</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.flexNib?.maxSwellWidth ?? 14)}px
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={activeSettings.flexNib?.maxSwellWidth ?? 14}
              aria-label="Maximum expanded calligraphy stroke swell width"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  flexNib: {
                    ...activeSettings.flexNib,
                    maxSwellWidth: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Meniscus Rupture Threshold</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={4.0}
              max={20.0}
              step={0.5}
              value={activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5}
              aria-label="Stroke width where ink meniscus ruptures into twin railroad tracks"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  flexNib: {
                    ...activeSettings.flexNib,
                    meniscusRuptureWidth: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Spring Steel Elasticity (Gamma)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.flexNib?.flexSensitivity ?? 1.4).toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0.8}
              max={2.5}
              step={0.1}
              value={activeSettings.flexNib?.flexSensitivity ?? 1.4}
              aria-label="Nonlinear spring cantilever bending exponent"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  flexNib: {
                    ...activeSettings.flexNib,
                    flexSensitivity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Dip Reservoir Capacity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.flexNib?.reservoirCapacityPx ?? 1200)}px
              </span>
            </div>
            <input
              type="range"
              min={300}
              max={3000}
              step={100}
              value={activeSettings.flexNib?.reservoirCapacityPx ?? 1200}
              aria-label="Dip ink droplet continuous drawing arc length capacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  flexNib: {
                    ...activeSettings.flexNib,
                    reservoirCapacityPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Metallic Scratch Foley Resonance</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.flexNib?.paperScratchResonance ?? 0.8) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.5}
              step={0.05}
              value={activeSettings.flexNib?.paperScratchResonance ?? 0.8}
              aria-label="Acoustic high-frequency metallic scratch intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  flexNib: {
                    ...activeSettings.flexNib,
                    paperScratchResonance: Number(e.target.value),
                  },
                })
              }
            />

            <div className="pt-1">
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs font-medium flex items-center justify-center gap-1.5"
                onClick={() => {
                  updateSettings({
                    ...activeSettings,
                    flexNib: {
                      ...activeSettings.flexNib,
                      reservoirCapacityPx: activeSettings.flexNib?.reservoirCapacityPx ?? 1200.0,
                    },
                  });
                }}
              >
                <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
                <span>Re-Dip in Inkwell</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Milestone S130: Whiteboard Chalk Dust Settling & Gravitational Blackboard Particle Physics */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">grain</span>
              Chalk Dust Settling & Tray
            </span>
            <span className="text-[10px] text-text-disabled">
              Gravitational downward drift, air flutter & bottom ledge sedimentation
            </span>
          </div>
          <Switch
            checked={activeSettings.chalkDustSettling?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.chalkDustSettling?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                chalkDustSettling: {
                  ...activeSettings.chalkDustSettling,
                  enabled: !current,
                  gravitySpeed: activeSettings.chalkDustSettling?.gravitySpeed ?? 80,
                  terminalVelocity: activeSettings.chalkDustSettling?.terminalVelocity ?? 50,
                  turbulenceAmplitude: activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5,
                  trayYPercent: activeSettings.chalkDustSettling?.trayYPercent ?? 0.93,
                  trayDepthPx: activeSettings.chalkDustSettling?.trayDepthPx ?? 18,
                  reposeSigma: activeSettings.chalkDustSettling?.reposeSigma ?? 5.0,
                  accumulationGain: activeSettings.chalkDustSettling?.accumulationGain ?? 25.0,
                  chalkColorHex: activeSettings.chalkDustSettling?.chalkColorHex ?? '#f0f0f0',
                },
              });
            }}
            label="Toggle chalk dust settling and tray physics"
          />
        </div>

        {activeSettings.chalkDustSettling?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Gravity Drift Speed</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.chalkDustSettling?.gravitySpeed ?? 80)} px/s
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={150}
              step={5}
              value={activeSettings.chalkDustSettling?.gravitySpeed ?? 80}
              aria-label="Chalk dust gravitational drift speed"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkDustSettling: {
                    ...activeSettings.chalkDustSettling,
                    gravitySpeed: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Terminal Fall Speed</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.chalkDustSettling?.terminalVelocity ?? 50)} px/s
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={120}
              step={5}
              value={activeSettings.chalkDustSettling?.terminalVelocity ?? 50}
              aria-label="Terminal falling velocity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkDustSettling: {
                    ...activeSettings.chalkDustSettling,
                    terminalVelocity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Air Flutter / Turbulence</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5).toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={6.0}
              step={0.5}
              value={activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5}
              aria-label="Air turbulence and horizontal flutter"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkDustSettling: {
                    ...activeSettings.chalkDustSettling,
                    turbulenceAmplitude: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Bottom Tray Elevation</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.chalkDustSettling?.trayYPercent ?? 0.93) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.75}
              max={0.98}
              step={0.01}
              value={activeSettings.chalkDustSettling?.trayYPercent ?? 0.93}
              aria-label="Bottom shelf position percentage"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkDustSettling: {
                    ...activeSettings.chalkDustSettling,
                    trayYPercent: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Sediment Berm Height</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.chalkDustSettling?.trayDepthPx ?? 18)} px
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={36}
              step={2}
              value={activeSettings.chalkDustSettling?.trayDepthPx ?? 18}
              aria-label="Accumulated sediment berm depth"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chalkDustSettling: {
                    ...activeSettings.chalkDustSettling,
                    trayDepthPx: Number(e.target.value),
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
