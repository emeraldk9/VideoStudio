import type {
  WhiteboardSettings,
  SmudgeToolMode,
  NeonPalettePreset,
  LightboardLedPreset,
} from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardArtisticShadersSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function WhiteboardArtisticShadersSettings({
  activeSettings,
  updateSettings,
}: WhiteboardArtisticShadersSettingsProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Artistic Shaders & Substrate FX
      </span>

      {/* Milestone S109: Smudge, Finger-Blending & Graphite Eraser Highlights */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
              Smudge & Finger Blending
            </span>
            <span className="text-[10px] text-text-disabled">
              Pigment advection & kneaded eraser highlights
            </span>
          </div>
          <Switch
            checked={activeSettings.smudgeBlend?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.smudgeBlend?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                smudgeBlend: {
                  ...activeSettings.smudgeBlend,
                  enabled: !current,
                  mode: activeSettings.smudgeBlend?.mode ?? 'finger',
                  radiusPx: activeSettings.smudgeBlend?.radiusPx ?? 25,
                  strength: activeSettings.smudgeBlend?.strength ?? 0.6,
                  liftHighlights: activeSettings.smudgeBlend?.liftHighlights ?? true,
                },
              });
            }}
            label="Toggle smudge blending and eraser highlights"
          />
        </div>

        {activeSettings.smudgeBlend?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Smudge Tool</span>
              <SegmentedControl
                value={activeSettings.smudgeBlend?.mode ?? 'finger'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    smudgeBlend: {
                      ...activeSettings.smudgeBlend,
                      mode: val as SmudgeToolMode,
                    },
                  })
                }
                options={[
                  { value: 'finger', label: 'Finger' },
                  { value: 'stump', label: 'Stump' },
                  { value: 'towel', label: 'Towel' },
                  { value: 'kneaded_eraser', label: 'Eraser' },
                ]}
                ariaLabel="Smudge tool mode"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.smudgeBlend?.radiusPx ?? 25)}px
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={activeSettings.smudgeBlend?.radiusPx ?? 25}
              aria-label="Smudge radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  smudgeBlend: {
                    ...activeSettings.smudgeBlend,
                    radiusPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Strength</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.smudgeBlend?.strength ?? 0.6) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={activeSettings.smudgeBlend?.strength ?? 0.6}
              aria-label="Smudge strength"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  smudgeBlend: {
                    ...activeSettings.smudgeBlend,
                    strength: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S115: Whiteboard Chroma Chalk & Neon UV Blacklight Luminescence */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_iridescent</span>
              Neon UV Chalk & Luminescence
            </span>
            <span className="text-[10px] text-text-disabled">
              Fluorescent blacklight bloom & chromatic fringe
            </span>
          </div>
          <Switch
            checked={activeSettings.chromaChalk?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.chromaChalk?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                chromaChalk: {
                  ...activeSettings.chromaChalk,
                  enabled: !current,
                  palette: activeSettings.chromaChalk?.palette ?? 'cyber',
                  bloomRadiusPx: activeSettings.chromaChalk?.bloomRadiusPx ?? 14,
                  bloomIntensity: activeSettings.chromaChalk?.bloomIntensity ?? 0.7,
                  chromaticAberrationPx: activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0,
                  darkSlateBackground: activeSettings.chromaChalk?.darkSlateBackground ?? true,
                },
              });
            }}
            label="Toggle neon UV chalk and luminescence"
          />
        </div>

        {activeSettings.chromaChalk?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fluorescent Palette</span>
              <SegmentedControl
                value={activeSettings.chromaChalk?.palette ?? 'cyber'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    chromaChalk: {
                      ...activeSettings.chromaChalk,
                      palette: val as NeonPalettePreset,
                    },
                  })
                }
                options={[
                  { value: 'cyber', label: 'Cyber' },
                  { value: 'pastels', label: 'Pastel' },
                  { value: 'arcade', label: 'Arcade' },
                ]}
                ariaLabel="Fluorescent neon palette"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Bloom Halo Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.chromaChalk?.bloomRadiusPx ?? 14)}px
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={1}
              value={activeSettings.chromaChalk?.bloomRadiusPx ?? 14}
              aria-label="Neon bloom radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chromaChalk: {
                    ...activeSettings.chromaChalk,
                    bloomRadiusPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Bloom Emission Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.chromaChalk?.bloomIntensity ?? 0.7) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.5}
              step={0.05}
              value={activeSettings.chromaChalk?.bloomIntensity ?? 0.7}
              aria-label="Neon bloom intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chromaChalk: {
                    ...activeSettings.chromaChalk,
                    bloomIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Chromatic Aberration</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0}
              aria-label="Chromatic aberration fringe"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  chromaChalk: {
                    ...activeSettings.chromaChalk,
                    chromaticAberrationPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Dark Slate Blackboard</span>
              <Switch
                checked={activeSettings.chromaChalk?.darkSlateBackground ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    chromaChalk: {
                      ...activeSettings.chromaChalk,
                      darkSlateBackground: !(activeSettings.chromaChalk?.darkSlateBackground ?? true),
                    },
                  })
                }
                label="Toggle dark slate blackboard background"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S116: Wet Sponge Evaporation & Moisture Condensation */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
              Wet Sponge & Evaporation
            </span>
            <span className="text-[10px] text-text-disabled">
              Damp board sheen drying & capillary ink dilution
            </span>
          </div>
          <Switch
            checked={activeSettings.wetSponge?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.wetSponge?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                wetSponge: {
                  ...activeSettings.wetSponge,
                  enabled: !current,
                  initialWetness: activeSettings.wetSponge?.initialWetness ?? 0.8,
                  dryingTimeSec: activeSettings.wetSponge?.dryingTimeSec ?? 4.0,
                  dilutionFactor: activeSettings.wetSponge?.dilutionFactor ?? 0.6,
                  gravityDrip: activeSettings.wetSponge?.gravityDrip ?? false,
                },
              });
            }}
            label="Toggle wet sponge evaporation physics"
          />
        </div>

        {activeSettings.wetSponge?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Initial Moisture Wetness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.wetSponge?.initialWetness ?? 0.8) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={activeSettings.wetSponge?.initialWetness ?? 0.8}
              aria-label="Initial moisture wetness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  wetSponge: {
                    ...activeSettings.wetSponge,
                    initialWetness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Evaporation Drying Time</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.wetSponge?.dryingTimeSec ?? 4.0).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={1.0}
              max={15.0}
              step={0.5}
              value={activeSettings.wetSponge?.dryingTimeSec ?? 4.0}
              aria-label="Evaporation drying duration"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  wetSponge: {
                    ...activeSettings.wetSponge,
                    dryingTimeSec: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Capillary Ink Dilution</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.wetSponge?.dilutionFactor ?? 0.6) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={activeSettings.wetSponge?.dilutionFactor ?? 0.6}
              aria-label="Capillary ink dilution factor"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  wetSponge: {
                    ...activeSettings.wetSponge,
                    dilutionFactor: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Gravity Droplet Drip</span>
              <Switch
                checked={activeSettings.wetSponge?.gravityDrip ?? false}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    wetSponge: {
                      ...activeSettings.wetSponge,
                      gravityDrip: !(activeSettings.wetSponge?.gravityDrip ?? false),
                    },
                  })
                }
                label="Toggle gravity droplet drip"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S117: Optical Glass Lightboard & Edge-Lit Luminescence */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">flip</span>
              Optical Glass Lightboard
            </span>
            <span className="text-[10px] text-text-disabled">
              Internal TIR edge-lit LEDs & audience mirror flip
            </span>
          </div>
          <Switch
            checked={activeSettings.lightboard?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.lightboard?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                lightboard: {
                  ...activeSettings.lightboard,
                  enabled: !current,
                  mirrorHorizontal: activeSettings.lightboard?.mirrorHorizontal ?? true,
                  ledPreset: activeSettings.lightboard?.ledPreset ?? 'cyan',
                  ledIntensity: activeSettings.lightboard?.ledIntensity ?? 1.2,
                  glassThicknessPx: activeSettings.lightboard?.glassThicknessPx ?? 6.0,
                  ghostReflectionOpacity: activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08,
                },
              });
            }}
            label="Toggle optical glass lightboard mode"
          />
        </div>

        {activeSettings.lightboard?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Audience Mirror Flip (X' = W - X)</span>
              <Switch
                checked={activeSettings.lightboard?.mirrorHorizontal ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    lightboard: {
                      ...activeSettings.lightboard,
                      mirrorHorizontal: !(activeSettings.lightboard?.mirrorHorizontal ?? true),
                    },
                  })
                }
                label="Toggle audience horizontal mirror flip"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Edge-Lit LED Color</span>
              <SegmentedControl
                value={activeSettings.lightboard?.ledPreset ?? 'cyan'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    lightboard: {
                      ...activeSettings.lightboard,
                      ledPreset: val as LightboardLedPreset,
                    },
                  })
                }
                options={[
                  { value: 'cyan', label: 'Cyan' },
                  { value: 'emerald', label: 'Emerald' },
                  { value: 'amber', label: 'Amber' },
                  { value: 'white', label: 'White' },
                ]}
                ariaLabel="Edge-lit LED color preset"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">LED Illumination Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.lightboard?.ledIntensity ?? 1.2) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={activeSettings.lightboard?.ledIntensity ?? 1.2}
              aria-label="LED illumination intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  lightboard: {
                    ...activeSettings.lightboard,
                    ledIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Glass Pane Thickness (Ghosting)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.lightboard?.glassThicknessPx ?? 6.0)}px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={14}
              step={1}
              value={activeSettings.lightboard?.glassThicknessPx ?? 6.0}
              aria-label="Glass thickness ghost offset"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  lightboard: {
                    ...activeSettings.lightboard,
                    glassThicknessPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Internal Ghost Reflection Opacity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.20}
              step={0.02}
              value={activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08}
              aria-label="Internal ghost reflection opacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  lightboard: {
                    ...activeSettings.lightboard,
                    ghostReflectionOpacity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S133: Whiteboard Multi-Color Pen Ribbon Blending & Gradient Transition Wash */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">gradient</span>
              Ribbon Blending & Gradient Wash
            </span>
            <span className="text-[10px] text-text-disabled">
              Porous nib pigment wash, OKLab perceptual blending & chromatic transition
            </span>
          </div>
          <Switch
            checked={activeSettings.gradientWash?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.gradientWash?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                gradientWash: {
                  ...activeSettings.gradientWash,
                  enabled: !current,
                  washLengthPx: activeSettings.gradientWash?.washLengthPx ?? 45.0,
                  useOklab: activeSettings.gradientWash?.useOklab ?? true,
                  secondaryColorHex: activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48',
                  ditherNoise: activeSettings.gradientWash?.ditherNoise ?? 0.05,
                },
              });
            }}
            label="Toggle ribbon blending and gradient wash"
          />
        </div>

        {activeSettings.gradientWash?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wash Transition Length</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.gradientWash?.washLengthPx ?? 45.0)} px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={activeSettings.gradientWash?.washLengthPx ?? 45.0}
              aria-label="Pigment wash transition distance"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  gradientWash: {
                    ...activeSettings.gradientWash,
                    washLengthPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Secondary Accent Pigment</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48'}
                  aria-label="Secondary transition pigment color"
                  className="w-5 h-5 rounded cursor-pointer border border-hairline bg-transparent"
                  onChange={(e) =>
                    updateSettings({
                      ...activeSettings,
                      gradientWash: {
                        ...activeSettings.gradientWash,
                        secondaryColorHex: e.target.value,
                      },
                    })
                  }
                />
                <span className="font-mono text-[10px] text-text-primary">
                  {(activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Perceptual OKLab Blending</span>
              <Switch
                checked={activeSettings.gradientWash?.useOklab ?? true}
                onChange={() => {
                  const current = activeSettings.gradientWash?.useOklab ?? true;
                  updateSettings({
                    ...activeSettings,
                    gradientWash: {
                      ...activeSettings.gradientWash,
                      useOklab: !current,
                    },
                  });
                }}
                label="Toggle OKLab perceptual color blending"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fiber Grain Micro-Dither</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.gradientWash?.ditherNoise ?? 0.05) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.20}
              step={0.01}
              value={activeSettings.gradientWash?.ditherNoise ?? 0.05}
              aria-label="Micro-dither fiber grain noise amplitude"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  gradientWash: {
                    ...activeSettings.gradientWash,
                    ditherNoise: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S136: Whiteboard Dry-Erase Felt Eraser Swipe Smear & Ghosting Residuals */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">cleaning_services</span>
              Felt Eraser Smear & Ghosting Residuals
            </span>
            <span className="text-[10px] text-text-disabled">
              Pad saturation, wiper smear streaks & multi-pass residual memory
            </span>
          </div>
          <Switch
            checked={activeSettings.eraserGhosting?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.eraserGhosting?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                eraserGhosting: {
                  ...activeSettings.eraserGhosting,
                  enabled: !current,
                  feltSaturationRate: activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08,
                  smearOpacity: activeSettings.eraserGhosting?.smearOpacity ?? 0.06,
                  ghostPersistence: activeSettings.eraserGhosting?.ghostPersistence ?? 0.05,
                  cleaningDecayRate: activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40,
                },
              });
            }}
            label="Toggle dry-erase felt smear and ghosting residuals"
          />
        </div>

        {activeSettings.eraserGhosting?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Felt Saturation Rate</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={0.25}
              step={0.01}
              value={activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08}
              aria-label="Felt eraser pad saturation accumulation rate"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  eraserGhosting: {
                    ...activeSettings.eraserGhosting,
                    feltSaturationRate: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wiper Smear Opacity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.eraserGhosting?.smearOpacity ?? 0.06) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={0.20}
              step={0.01}
              value={activeSettings.eraserGhosting?.smearOpacity ?? 0.06}
              aria-label="Eraser swipe trail smear opacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  eraserGhosting: {
                    ...activeSettings.eraserGhosting,
                    smearOpacity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Ghost Persistence</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.eraserGhosting?.ghostPersistence ?? 0.05) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={0.15}
              step={0.01}
              value={activeSettings.eraserGhosting?.ghostPersistence ?? 0.05}
              aria-label="Chemical ghosting residual initial persistence opacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  eraserGhosting: {
                    ...activeSettings.eraserGhosting,
                    ghostPersistence: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wiping Decay Rate</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.80}
              step={0.05}
              value={activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40}
              aria-label="Ghost residual cleaning decay rate per pass"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  eraserGhosting: {
                    ...activeSettings.eraserGhosting,
                    cleaningDecayRate: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S145: Real-Time WebGL/WebGPU Stroke Fragment Shader Pipeline */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">bolt</span>
              <span>WebGL / GPU Stroke Fragment Shader</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Analytic SDF rasterization & Blinn-Phong specular glint
            </span>
          </div>
          <Switch
            checked={activeSettings.strokeShader?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.strokeShader?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                strokeShader: {
                  ...activeSettings.strokeShader,
                  enabled: !current,
                  substrateRoughness: activeSettings.strokeShader?.substrateRoughness ?? 0.35,
                  edgeFeathering: activeSettings.strokeShader?.edgeFeathering ?? 1.2,
                  specularIntensity: activeSettings.strokeShader?.specularIntensity ?? 0.4,
                  specularRoughness: activeSettings.strokeShader?.specularRoughness ?? 0.25,
                  fresnelStrength: activeSettings.strokeShader?.fresnelStrength ?? 0.5,
                  shadowOpacity: activeSettings.strokeShader?.shadowOpacity ?? 0.25,
                },
              });
            }}
            label="Toggle WebGL GPU stroke fragment shader pipeline"
          />
        </div>

        {activeSettings.strokeShader?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Substrate Tooth Roughness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.strokeShader?.substrateRoughness ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.strokeShader?.substrateRoughness ?? 0.35}
              aria-label="Procedural micro-tooth noise modulating ink absorption"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    substrateRoughness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Edge Smoothstep Feathering</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.strokeShader?.edgeFeathering ?? 1.2).toFixed(1)} px
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={4.0}
              step={0.1}
              value={activeSettings.strokeShader?.edgeFeathering ?? 1.2}
              aria-label="Sub-pixel Hermite smoothstep antialiasing radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    edgeFeathering: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Wet Ink Specular Glint</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.strokeShader?.specularIntensity ?? 0.4) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.strokeShader?.specularIntensity ?? 0.4}
              aria-label="Blinn-Phong specular glint intensity on wet stroke core"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    specularIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Specular Roughness Exponent</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.strokeShader?.specularRoughness ?? 0.25).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.8}
              step={0.05}
              value={activeSettings.strokeShader?.specularRoughness ?? 0.25}
              aria-label="Specular highlight sharpness and surface smoothness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    specularRoughness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Schlick-Fresnel Grazing Sheen</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.strokeShader?.fresnelStrength ?? 0.5) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.strokeShader?.fresnelStrength ?? 0.5}
              aria-label="Fresnel reflectance enhancement at steep grazing angles"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    fresnelStrength: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Contact Ambient Shadow</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.strokeShader?.shadowOpacity ?? 0.25) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.strokeShader?.shadowOpacity ?? 0.25}
              aria-label="Underlying stroke contact shadow opacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  strokeShader: {
                    ...activeSettings.strokeShader,
                    shadowOpacity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S146: Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">texture</span>
              <span>Charcoal & Tortillon Stump Blending</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Friable powder deposition & paper stump burnishing
            </span>
          </div>
          <Switch
            checked={activeSettings.charcoalTortillon?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.charcoalTortillon?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                charcoalTortillon: {
                  ...activeSettings.charcoalTortillon,
                  enabled: !current,
                  mediaType: activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal',
                  powderFriability: activeSettings.charcoalTortillon?.powderFriability ?? 0.75,
                  stumpHardness: activeSettings.charcoalTortillon?.stumpHardness ?? 0.5,
                  blendRadiusPx: activeSettings.charcoalTortillon?.blendRadiusPx ?? 12.0,
                  burnishDepth: activeSettings.charcoalTortillon?.burnishDepth ?? 0.65,
                },
              });
            }}
            label="Toggle charcoal powder mechanics and tortillon stump blending"
          />
        </div>

        {activeSettings.charcoalTortillon?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Dry Carbon Media Type</span>
              <span className="font-mono text-text-primary text-[10px] capitalize">
                {(activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal').replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'vine_charcoal', label: 'Vine' },
                { id: 'compressed_charcoal', label: 'Compressed' },
                { id: 'conte_crayon', label: 'Conte' },
              ].map((m) => {
                const isSel = (activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal') === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`text-[10px] py-1 rounded border transition-colors ${
                      isSel
                        ? 'bg-accent-ai text-bg-app border-accent-ai font-medium'
                        : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() =>
                      updateSettings({
                        ...activeSettings,
                        charcoalTortillon: {
                          ...activeSettings.charcoalTortillon,
                          mediaType: m.id as any,
                        },
                      })
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Media Powder Friability</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.charcoalTortillon?.powderFriability ?? 0.75) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={activeSettings.charcoalTortillon?.powderFriability ?? 0.75}
              aria-label="Looseness and flake rate of dry carbon particles"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  charcoalTortillon: {
                    ...activeSettings.charcoalTortillon,
                    powderFriability: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Tortillon Stump Hardness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.charcoalTortillon?.stumpHardness ?? 0.5) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={activeSettings.charcoalTortillon?.stumpHardness ?? 0.5}
              aria-label="Rigidity of rolled paper blending stump"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  charcoalTortillon: {
                    ...activeSettings.charcoalTortillon,
                    stumpHardness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Stump Blending Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.charcoalTortillon?.blendRadiusPx ?? 12)} px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={25}
              step={1}
              value={activeSettings.charcoalTortillon?.blendRadiusPx ?? 12}
              aria-label="Contact footprint radius of the blending stump"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  charcoalTortillon: {
                    ...activeSettings.charcoalTortillon,
                    blendRadiusPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Tooth Valley Burnish Depth</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.charcoalTortillon?.burnishDepth ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={activeSettings.charcoalTortillon?.burnishDepth ?? 0.65}
              aria-label="Degree of powder penetration and burnishing into tooth valleys"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  charcoalTortillon: {
                    ...activeSettings.charcoalTortillon,
                    burnishDepth: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S147: Multi-Layer Animation Onion Skinning & Light Table Backlighting */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">layers</span>
              <span>Onion Skinning & Light Table</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Translucent frame ghosting & frosted glass backlighting
            </span>
          </div>
          <Switch
            checked={activeSettings.onionSkinLightTable?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.onionSkinLightTable?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                onionSkinLightTable: {
                  ...activeSettings.onionSkinLightTable,
                  enabled: !current,
                  pastFramesCount: activeSettings.onionSkinLightTable?.pastFramesCount ?? 3,
                  futureFramesCount: activeSettings.onionSkinLightTable?.futureFramesCount ?? 3,
                  baseOpacity: activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45,
                  opacityFalloffGamma: activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65,
                  lightTableIntensity: activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65,
                  pegBarEnabled: activeSettings.onionSkinLightTable?.pegBarEnabled ?? true,
                },
              });
            }}
            label="Toggle multi-layer animation onion skinning and light table backlighting"
          />
        </div>

        {activeSettings.onionSkinLightTable?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Past Frames Window (Cool Cyan)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.onionSkinLightTable?.pastFramesCount ?? 3} Frames
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={activeSettings.onionSkinLightTable?.pastFramesCount ?? 3}
              aria-label="Number of preceding keyframes visible with cyan tint"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  onionSkinLightTable: {
                    ...activeSettings.onionSkinLightTable,
                    pastFramesCount: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Future Frames Window (Warm Amber)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.onionSkinLightTable?.futureFramesCount ?? 3} Frames
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={activeSettings.onionSkinLightTable?.futureFramesCount ?? 3}
              aria-label="Number of subsequent keyframes visible with amber tint"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  onionSkinLightTable: {
                    ...activeSettings.onionSkinLightTable,
                    futureFramesCount: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Base Ghost Opacity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.8}
              step={0.05}
              value={activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45}
              aria-label="Initial opacity of direct adjacent onion skin frames"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  onionSkinLightTable: {
                    ...activeSettings.onionSkinLightTable,
                    baseOpacity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Distance Falloff Gamma</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65}
              aria-label="Exponential attenuation rate per frame step"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  onionSkinLightTable: {
                    ...activeSettings.onionSkinLightTable,
                    opacityFalloffGamma: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Light Table Backlight Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65}
              aria-label="Luminance of backlit frosted glass light table substrate"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  onionSkinLightTable: {
                    ...activeSettings.onionSkinLightTable,
                    lightTableIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Acme Peg Bar Registration Pins</span>
              <Switch
                checked={activeSettings.onionSkinLightTable?.pegBarEnabled ?? true}
                onChange={() => {
                  const current = activeSettings.onionSkinLightTable?.pegBarEnabled ?? true;
                  updateSettings({
                    ...activeSettings,
                    onionSkinLightTable: {
                      ...activeSettings.onionSkinLightTable,
                      pegBarEnabled: !current,
                    },
                  });
                }}
                label="Toggle Acme standard animation peg bar registration pins"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S151: Procedural Stippling & Pointillism Ink Shading Engine */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">grain</span>
              <span>Procedural Stippling & Pointillism</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Poisson-disk ink dots & spatial repulsion relaxation
            </span>
          </div>
          <Switch
            checked={activeSettings.proceduralStippling?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.proceduralStippling?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                proceduralStippling: {
                  ...activeSettings.proceduralStippling,
                  enabled: !current,
                  minDotRadius: activeSettings.proceduralStippling?.minDotRadius ?? 0.8,
                  maxDotRadius: activeSettings.proceduralStippling?.maxDotRadius ?? 2.4,
                  densityScale: activeSettings.proceduralStippling?.densityScale ?? 1.0,
                  relaxationIterations: activeSettings.proceduralStippling?.relaxationIterations ?? 3,
                  dotGainFactor: activeSettings.proceduralStippling?.dotGainFactor ?? 0.25,
                  paperBleedPx: activeSettings.proceduralStippling?.paperBleedPx ?? 0.35,
                  stippleColorHex: activeSettings.proceduralStippling?.stippleColorHex ?? '#161414',
                  foleyTapVolume: activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75,
                },
              });
            }}
            label="Toggle procedural stippling and pointillism ink shading engine"
          />
        </div>

        {activeSettings.proceduralStippling?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Density Multiplier</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.proceduralStippling?.densityScale ?? 1.0).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={3.0}
              step={0.1}
              value={activeSettings.proceduralStippling?.densityScale ?? 1.0}
              aria-label="Stippling dot density budget scale"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    densityScale: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Min Dot Radius (Highlights)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.proceduralStippling?.minDotRadius ?? 0.8).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.1}
              value={activeSettings.proceduralStippling?.minDotRadius ?? 0.8}
              aria-label="Minimum dot radius in highlights"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    minDotRadius: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Max Dot Radius (Shadows)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.proceduralStippling?.maxDotRadius ?? 2.4).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={1.0}
              max={6.0}
              step={0.2}
              value={activeSettings.proceduralStippling?.maxDotRadius ?? 2.4}
              aria-label="Maximum dot radius in shadows"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    maxDotRadius: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Repulsion Relaxation Passes</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.proceduralStippling?.relaxationIterations ?? 3} passes
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={activeSettings.proceduralStippling?.relaxationIterations ?? 3}
              aria-label="Spatial repulsion relaxation iterations"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    relaxationIterations: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Nib Dot Gain & Paper Bleed</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.proceduralStippling?.dotGainFactor ?? 0.25) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.8}
              step={0.05}
              value={activeSettings.proceduralStippling?.dotGainFactor ?? 0.25}
              aria-label="Capillary paper bleed dot gain factor"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    dotGainFactor: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Stylus Tap Foley Volume</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75}
              aria-label="Fineliner nib tap-tap acoustic transient volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  proceduralStippling: {
                    ...activeSettings.proceduralStippling,
                    foleyTapVolume: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S152: Metallic Foil Embossing & Hot Stamp Shimmer Shader Pipeline */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">flare</span>
              <span>Metallic Foil & Hot Stamp Emboss</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Raised 3D bevel & specular holographic shimmer
            </span>
          </div>
          <Switch
            checked={activeSettings.metallicFoil?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.metallicFoil?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                metallicFoil: {
                  ...activeSettings.metallicFoil,
                  enabled: !current,
                  preset: activeSettings.metallicFoil?.preset ?? 'gold',
                  embossHeightPx: activeSettings.metallicFoil?.embossHeightPx ?? 2.5,
                  bevelWidthPx: activeSettings.metallicFoil?.bevelWidthPx ?? 3.0,
                  specularShininess: activeSettings.metallicFoil?.specularShininess ?? 32.0,
                  lightAngleDeg: activeSettings.metallicFoil?.lightAngleDeg ?? 45.0,
                  lightElevationDeg: activeSettings.metallicFoil?.lightElevationDeg ?? 60.0,
                  shimmerSpeed: activeSettings.metallicFoil?.shimmerSpeed ?? 1.0,
                  sparkleIntensity: activeSettings.metallicFoil?.sparkleIntensity ?? 0.35,
                  foleyPressVolume: activeSettings.metallicFoil?.foleyPressVolume ?? 0.70,
                },
              });
            }}
            label="Toggle metallic foil embossing and hot stamp shimmer shader"
          />
        </div>

        {activeSettings.metallicFoil?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-secondary">Foil Material Preset</span>
              <div className="grid grid-cols-3 gap-1">
                {(['gold', 'silver', 'rose_gold', 'copper', 'holographic'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
                      (activeSettings.metallicFoil?.preset ?? 'gold') === preset
                        ? 'bg-accent-ai text-text-inverse font-semibold'
                        : 'bg-bg-app border border-hairline text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          preset,
                        },
                      })
                    }
                  >
                    {preset === 'rose_gold' ? 'Rose Gold' : preset.charAt(0).toUpperCase() + preset.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Emboss Relief Height</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.metallicFoil?.embossHeightPx ?? 2.5).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={8.0}
              step={0.5}
              value={activeSettings.metallicFoil?.embossHeightPx ?? 2.5}
              aria-label="Emboss 3D bevel relief height"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    embossHeightPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Bevel Transition Width</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.metallicFoil?.bevelWidthPx ?? 3.0).toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min={1.0}
              max={8.0}
              step={0.5}
              value={activeSettings.metallicFoil?.bevelWidthPx ?? 3.0}
              aria-label="Edge bevel transition slope width"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    bevelWidthPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Specular Shininess</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.metallicFoil?.specularShininess ?? 32)}
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={128}
              step={4}
              value={activeSettings.metallicFoil?.specularShininess ?? 32}
              aria-label="Specular reflection highlight exponent"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    specularShininess: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Light Azimuth Angle</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.metallicFoil?.lightAngleDeg ?? 45)}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={activeSettings.metallicFoil?.lightAngleDeg ?? 45}
              aria-label="Key light directional azimuth angle"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    lightAngleDeg: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Shimmer Sweep Rate</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.metallicFoil?.shimmerSpeed ?? 1.0).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={3.0}
              step={0.2}
              value={activeSettings.metallicFoil?.shimmerSpeed ?? 1.0}
              aria-label="Light sweep and holographic shimmer speed"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    shimmerSpeed: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Flake Sparkle Glint</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.metallicFoil?.sparkleIntensity ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.metallicFoil?.sparkleIntensity ?? 0.35}
              aria-label="Micro-glint cellular noise sparkle intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    sparkleIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Hot Stamp Foley Volume</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.metallicFoil?.foleyPressVolume ?? 0.70) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.metallicFoil?.foleyPressVolume ?? 0.70}
              aria-label="Heat press compression and foil peel audio volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  metallicFoil: {
                    ...activeSettings.metallicFoil,
                    foleyPressVolume: Number(e.target.value),
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
