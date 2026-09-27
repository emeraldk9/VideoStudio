import {
  type WhiteboardSettings,
  type LensApertureFStop,
} from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardLightingOpticsSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function WhiteboardLightingOpticsSettings({
  activeSettings,
  updateSettings,
}: WhiteboardLightingOpticsSettingsProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Lighting, Shadows & Optics
      </span>

      {/* Milestone S100: Dynamic Viewport Camera & Hand Shadow */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">videocam</span>
              Inertial Camera Follower
            </span>
            <span className="text-[10px] text-text-disabled">
              Dynamic zoom & smooth tracking of drawing action
            </span>
          </div>
          <Switch
            checked={activeSettings.cameraFollower?.enabled === true}
            onChange={() => {
              const current = activeSettings.cameraFollower?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                cameraFollower: {
                  ...activeSettings.cameraFollower,
                  enabled: !current,
                  zoom: activeSettings.cameraFollower?.zoom ?? 1.35,
                  smoothness: activeSettings.cameraFollower?.smoothness ?? 0.85,
                  showHandShadow: activeSettings.cameraFollower?.showHandShadow ?? true,
                  shadowAngleDeg: activeSettings.cameraFollower?.shadowAngleDeg ?? 315,
                },
              });
            }}
            label="Toggle inertial camera follower"
          />
        </div>

        {activeSettings.cameraFollower?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Follower Zoom</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.cameraFollower?.zoom ?? 1.35).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={1.1}
              max={2.5}
              step={0.05}
              value={activeSettings.cameraFollower?.zoom ?? 1.35}
              aria-label="Camera Follower Zoom"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  cameraFollower: {
                    ...activeSettings.cameraFollower,
                    zoom: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Hand Drop Shadow</span>
              <Switch
                checked={activeSettings.cameraFollower?.showHandShadow ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    cameraFollower: {
                      ...activeSettings.cameraFollower,
                      showHandShadow: !(activeSettings.cameraFollower?.showHandShadow ?? true),
                    },
                  })
                }
                label="Toggle hand drop shadow"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S103: Custom Hand Asset Calibration & Dynamic Tilt */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">front_hand</span>
              Dynamic Stylus Pose & Tilt
            </span>
            <span className="text-[10px] text-text-disabled">
              Velocity-responsive forearm lean & contact pivot
            </span>
          </div>
          <Switch
            checked={activeSettings.customHand?.dynamicTilt ?? true}
            onChange={() => {
              const currentTilt = activeSettings.customHand?.dynamicTilt ?? true;
              updateSettings({
                ...activeSettings,
                customHand: {
                  ...activeSettings.customHand,
                  dynamicTilt: !currentTilt,
                  tiltIntensity: activeSettings.customHand?.tiltIntensity ?? 0.35,
                },
              });
            }}
            label="Toggle dynamic stylus tilt"
          />
        </div>

        {(activeSettings.customHand?.dynamicTilt ?? true) && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Tilt Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.customHand?.tiltIntensity ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={activeSettings.customHand?.tiltIntensity ?? 0.35}
              aria-label="Hand Tilt Intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  customHand: {
                    ...activeSettings.customHand,
                    tiltIntensity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S111: Attention Lighting & Dynamic Vignetting */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">highlight</span>
              Attention Lighting & Vignette
            </span>
            <span className="text-[10px] text-text-disabled">
              Pen tip spotlight & perimeter focus vignetting
            </span>
          </div>
          <Switch
            checked={activeSettings.attentionLighting?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.attentionLighting?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                attentionLighting: {
                  ...activeSettings.attentionLighting,
                  enabled: !current,
                  spotlightRadiusPx: activeSettings.attentionLighting?.spotlightRadiusPx ?? 350,
                  spotlightIntensity: activeSettings.attentionLighting?.spotlightIntensity ?? 0.15,
                  vignetteStrength: activeSettings.attentionLighting?.vignetteStrength ?? 0.20,
                  inertia: activeSettings.attentionLighting?.inertia ?? 0.85,
                },
              });
            }}
            label="Toggle attention lighting and vignetting"
          />
        </div>

        {activeSettings.attentionLighting?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Spotlight Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.attentionLighting?.spotlightRadiusPx ?? 350)}px
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={700}
              step={25}
              value={activeSettings.attentionLighting?.spotlightRadiusPx ?? 350}
              aria-label="Spotlight radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  attentionLighting: {
                    ...activeSettings.attentionLighting,
                    spotlightRadiusPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Spotlight Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.attentionLighting?.spotlightIntensity ?? 0.15) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.35}
              step={0.05}
              value={activeSettings.attentionLighting?.spotlightIntensity ?? 0.15}
              aria-label="Spotlight intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  attentionLighting: {
                    ...activeSettings.attentionLighting,
                    spotlightIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Perimeter Vignette</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.attentionLighting?.vignetteStrength ?? 0.20) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.45}
              step={0.05}
              value={activeSettings.attentionLighting?.vignetteStrength ?? 0.20}
              aria-label="Perimeter vignette strength"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  attentionLighting: {
                    ...activeSettings.attentionLighting,
                    vignetteStrength: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S113: Optical Depth-of-Field & Bokeh Hand Blur */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">lens_blur</span>
              Depth of Field & Bokeh
            </span>
            <span className="text-[10px] text-text-disabled">
              Pen tip focal plane & forearm defocus blur
            </span>
          </div>
          <Switch
            checked={activeSettings.depthOfField?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.depthOfField?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                depthOfField: {
                  ...activeSettings.depthOfField,
                  enabled: !current,
                  aperture: activeSettings.depthOfField?.aperture ?? 'f2.8',
                  maxBlurPx: activeSettings.depthOfField?.maxBlurPx ?? 18,
                  tipLiftDefocus: activeSettings.depthOfField?.tipLiftDefocus ?? true,
                  wristElevationMm: activeSettings.depthOfField?.wristElevationMm ?? 140,
                },
              });
            }}
            label="Toggle depth of field and bokeh"
          />
        </div>

        {activeSettings.depthOfField?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Lens Aperture</span>
              <SegmentedControl
                value={activeSettings.depthOfField?.aperture ?? 'f2.8'}
                onChange={(val) =>
                  updateSettings({
                    ...activeSettings,
                    depthOfField: {
                      ...activeSettings.depthOfField,
                      aperture: val as LensApertureFStop,
                    },
                  })
                }
                options={[
                  { value: 'f1.8', label: 'f/1.8' },
                  { value: 'f2.8', label: 'f/2.8' },
                  { value: 'f5.6', label: 'f/5.6' },
                ]}
                ariaLabel="Lens aperture f-stop"
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Max Forearm Defocus</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.depthOfField?.maxBlurPx ?? 18)}px
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={2}
              value={activeSettings.depthOfField?.maxBlurPx ?? 18}
              aria-label="Maximum forearm defocus blur"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  depthOfField: {
                    ...activeSettings.depthOfField,
                    maxBlurPx: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Z-Lift Defocus Dynamics</span>
              <Switch
                checked={activeSettings.depthOfField?.tipLiftDefocus ?? true}
                onChange={() =>
                  updateSettings({
                    ...activeSettings,
                    depthOfField: {
                      ...activeSettings.depthOfField,
                      tipLiftDefocus: !(activeSettings.depthOfField?.tipLiftDefocus ?? true),
                    },
                  })
                }
                label="Toggle pen tip lift defocus"
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestone S121: Whiteboard Hand Contact Shadows & Ambient Occlusion */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_shade</span>
              Hand Contact Shadows (AO)
            </span>
            <span className="text-[10px] text-text-disabled">
              Dynamic umbra, diffuse penumbra & pen-lift dissipation
            </span>
          </div>
          <Switch
            checked={activeSettings.contactShadow?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.contactShadow?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                contactShadow: {
                  ...activeSettings.contactShadow,
                  enabled: !current,
                  lightAngleDeg: activeSettings.contactShadow?.lightAngleDeg ?? 315,
                  shadowOpacity: activeSettings.contactShadow?.shadowOpacity ?? 0.35,
                  blurRadiusPx: activeSettings.contactShadow?.blurRadiusPx ?? 14,
                  offsetDistancePx: activeSettings.contactShadow?.offsetDistancePx ?? 12,
                  liftDissipation: activeSettings.contactShadow?.liftDissipation ?? 0.60,
                },
              });
            }}
            label="Toggle hand contact shadows and ambient occlusion"
          />
        </div>

        {activeSettings.contactShadow?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Key Light Angle</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.contactShadow?.lightAngleDeg ?? 315)}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={activeSettings.contactShadow?.lightAngleDeg ?? 315}
              aria-label="Directional key light angle"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  contactShadow: {
                    ...activeSettings.contactShadow,
                    lightAngleDeg: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Shadow Umbra Opacity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.contactShadow?.shadowOpacity ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.80}
              step={0.05}
              value={activeSettings.contactShadow?.shadowOpacity ?? 0.35}
              aria-label="Shadow umbra darkness opacity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  contactShadow: {
                    ...activeSettings.contactShadow,
                    shadowOpacity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S129: Whiteboard Multi-Source Hand Lighting & Dual-Penumbra Contact Shadows */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_twilight</span>
              Multi-Source Hand Lighting
            </span>
            <span className="text-[10px] text-text-disabled">
              Key + Fill studio dual penumbra, inverse-square falloff & contact AO
            </span>
          </div>
          <Switch
            checked={activeSettings.multiSourceLighting?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.multiSourceLighting?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                multiSourceLighting: {
                  ...activeSettings.multiSourceLighting,
                  enabled: !current,
                  keyLight: {
                    angleDeg: activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315,
                    intensity: activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75,
                    distancePx: activeSettings.multiSourceLighting?.keyLight?.distancePx ?? 14,
                    blurRadiusPx: activeSettings.multiSourceLighting?.keyLight?.blurRadiusPx ?? 10,
                  },
                  fillLight: {
                    angleDeg: activeSettings.multiSourceLighting?.fillLight?.angleDeg ?? 45,
                    intensity: activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35,
                    distancePx: activeSettings.multiSourceLighting?.fillLight?.distancePx ?? 22,
                    blurRadiusPx: activeSettings.multiSourceLighting?.fillLight?.blurRadiusPx ?? 20,
                  },
                  ambientOcclusionIntensity: activeSettings.multiSourceLighting?.ambientOcclusionIntensity ?? 0.35,
                  inverseSquareFalloff: activeSettings.multiSourceLighting?.inverseSquareFalloff ?? true,
                },
              });
            }}
            label="Toggle multi-source hand lighting"
          />
        </div>

        {activeSettings.multiSourceLighting?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Key Light Angle (Primary)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315)}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315}
              aria-label="Key light compass angle"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  multiSourceLighting: {
                    ...activeSettings.multiSourceLighting,
                    keyLight: {
                      ...activeSettings.multiSourceLighting?.keyLight,
                      angleDeg: Number(e.target.value),
                    },
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Key Light Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={1.0}
              step={0.05}
              value={activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75}
              aria-label="Key light radiant intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  multiSourceLighting: {
                    ...activeSettings.multiSourceLighting,
                    keyLight: {
                      ...activeSettings.multiSourceLighting?.keyLight,
                      intensity: Number(e.target.value),
                    },
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fill Light Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.80}
              step={0.05}
              value={activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35}
              aria-label="Fill light soft ambience intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  multiSourceLighting: {
                    ...activeSettings.multiSourceLighting,
                    fillLight: {
                      ...activeSettings.multiSourceLighting?.fillLight,
                      intensity: Number(e.target.value),
                    },
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S131: Whiteboard Hand Shadow Soft-Penumbra Contact AO with Hand Geometry Silhouette Tracing */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">front_hand</span>
              Perspective Hand Silhouette Shadow
            </span>
            <span className="text-[10px] text-text-disabled">
              Contour ray projection, wrist elongation & graduated penumbra AO
            </span>
          </div>
          <Switch
            checked={activeSettings.handSilhouettePenumbra?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.handSilhouettePenumbra?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                handSilhouettePenumbra: {
                  ...activeSettings.handSilhouettePenumbra,
                  enabled: !current,
                  lightElevationMm: activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700,
                  wristElevationMm: activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65,
                  umbraOpacity: activeSettings.handSilhouettePenumbra?.umbraOpacity ?? 0.52,
                  maxPenumbraBlurPx: activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24,
                  minUmbraBlurPx: activeSettings.handSilhouettePenumbra?.minUmbraBlurPx ?? 3.0,
                  aoIntensity: activeSettings.handSilhouettePenumbra?.aoIntensity ?? 0.40,
                },
              });
            }}
            label="Toggle perspective hand silhouette shadow"
          />
        </div>

        {activeSettings.handSilhouettePenumbra?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Key Light 3D Elevation</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700)} mm
              </span>
            </div>
            <input
              type="range"
              min={300}
              max={1500}
              step={50}
              value={activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700}
              aria-label="Light source 3D elevation height"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  handSilhouettePenumbra: {
                    ...activeSettings.handSilhouettePenumbra,
                    lightElevationMm: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Forearm Wrist Elevation</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65)} mm
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={120}
              step={5}
              value={activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65}
              aria-label="Forearm wrist elevation above whiteboard"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  handSilhouettePenumbra: {
                    ...activeSettings.handSilhouettePenumbra,
                    wristElevationMm: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Forearm Penumbra Diffusion</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24)} px
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={48}
              step={2}
              value={activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24}
              aria-label="Forearm graduated penumbra blur diffusion"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  handSilhouettePenumbra: {
                    ...activeSettings.handSilhouettePenumbra,
                    maxPenumbraBlurPx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S137: Whiteboard Dual-Layer Tempered Glass Specular Glare & Parallax Reflection */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">flare</span>
              Tempered Glass Glare & Parallax
            </span>
            <span className="text-[10px] text-text-disabled">
              Dual Fresnel reflections, refractive parallax shadow & overhead luminaire streak
            </span>
          </div>
          <Switch
            checked={activeSettings.glassParallax?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.glassParallax?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                glassParallax: {
                  ...activeSettings.glassParallax,
                  enabled: !current,
                  glassThickness: activeSettings.glassParallax?.glassThickness ?? 8.0,
                  fresnelGlareIntensity: activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20,
                  parallaxGhostOpacity: activeSettings.glassParallax?.parallaxGhostOpacity ?? 0.10,
                  glarePosX: activeSettings.glassParallax?.glarePosX ?? 0.50,
                  glarePosY: activeSettings.glassParallax?.glarePosY ?? 0.15,
                },
              });
            }}
            label="Toggle tempered glass specular glare and parallax reflection"
          />
        </div>

        {activeSettings.glassParallax?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Glass Plate Thickness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.glassParallax?.glassThickness ?? 8} px
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={25}
              step={1}
              value={activeSettings.glassParallax?.glassThickness ?? 8}
              aria-label="Tempered glass plate thickness in pixels"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  glassParallax: {
                    ...activeSettings.glassParallax,
                    glassThickness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Fresnel Glare Sheen</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.60}
              step={0.05}
              value={activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20}
              aria-label="Fresnel specular glare sheen intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  glassParallax: {
                    ...activeSettings.glassParallax,
                    fresnelGlareIntensity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S138: Whiteboard Graphite Sheen Reflection & Textured Paper Grain Bump Mapping */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">texture</span>
              Graphite Sheen & Paper Grain
            </span>
            <span className="text-[10px] text-text-disabled">
              Paper tooth micro-texture, pressure pore penetration & metallic sheen
            </span>
          </div>
          <Switch
            checked={activeSettings.graphiteGrain?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.graphiteGrain?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                graphiteGrain: {
                  ...activeSettings.graphiteGrain,
                  enabled: !current,
                  grainRoughness: activeSettings.graphiteGrain?.grainRoughness ?? 0.35,
                  graphiteSheenIntensity: activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25,
                  sheenShininess: activeSettings.graphiteGrain?.sheenShininess ?? 32,
                  lightAzimuthDeg: activeSettings.graphiteGrain?.lightAzimuthDeg ?? 45,
                },
              });
            }}
            label="Toggle graphite metallic sheen and textured paper grain"
          />
        </div>

        {activeSettings.graphiteGrain?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Paper Grain Roughness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.graphiteGrain?.grainRoughness ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.80}
              step={0.05}
              value={activeSettings.graphiteGrain?.grainRoughness ?? 0.35}
              aria-label="Paper tooth micro-relief roughness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  graphiteGrain: {
                    ...activeSettings.graphiteGrain,
                    grainRoughness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Graphite Metallic Sheen</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.80}
              step={0.05}
              value={activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25}
              aria-label="Graphite crystalline metallic specular sheen intensity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  graphiteGrain: {
                    ...activeSettings.graphiteGrain,
                    graphiteSheenIntensity: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S139: Whiteboard Solvent Vapor Shimmer & Ambient Thermal Convection */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">air</span>
              Solvent Vapor Shimmer & Convection
            </span>
            <span className="text-[10px] text-text-disabled">
              Volatile solvent evaporation, buoyant convection & heat mirage shimmer
            </span>
          </div>
          <Switch
            checked={activeSettings.vaporShimmer?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.vaporShimmer?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                vaporShimmer: {
                  ...activeSettings.vaporShimmer,
                  enabled: !current,
                  shimmerAmplitudePx: activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5,
                  solventEvapHalfLife: activeSettings.vaporShimmer?.solventEvapHalfLife ?? 1.0,
                  convectionSpeed: activeSettings.vaporShimmer?.convectionSpeed ?? 40,
                  buoyancyPlumeHeightPx: activeSettings.vaporShimmer?.buoyancyPlumeHeightPx ?? 35,
                },
              });
            }}
            label="Toggle volatile solvent evaporative shimmer and convective plume"
          />
        </div>

        {activeSettings.vaporShimmer?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Shimmer Ripple Amplitude</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5).toFixed(1)} px
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={6.0}
              step={0.5}
              value={activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5}
              aria-label="Vapor shimmer optical refraction displacement amplitude"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  vaporShimmer: {
                    ...activeSettings.vaporShimmer,
                    shimmerAmplitudePx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S142: Hand Palm Occlusion & Natural Smudging Physics */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">pan_tool</span>
              <span>Palm Occlusion & Natural Smudging</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Resting palm heel touchdown, wet ink pickup & directional smear drag
            </span>
          </div>
          <Switch
            checked={activeSettings.palmSmudge?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.palmSmudge?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                palmSmudge: {
                  ...activeSettings.palmSmudge,
                  enabled: !current,
                  touchdownElevationMm: activeSettings.palmSmudge?.touchdownElevationMm ?? 8.0,
                  palmRadiusPx: activeSettings.palmSmudge?.palmRadiusPx ?? 35.0,
                  smudgeIntensity: activeSettings.palmSmudge?.smudgeIntensity ?? 0.40,
                  smudgeDecayPx: activeSettings.palmSmudge?.smudgeDecayPx ?? 60.0,
                  wetTimeWindowSec: activeSettings.palmSmudge?.wetTimeWindowSec ?? 2.0,
                  shadowOpacity: activeSettings.palmSmudge?.shadowOpacity ?? 0.35,
                },
              });
            }}
            label="Toggle hand palm occlusion and directional wet ink smudging physics"
          />
        </div>

        {activeSettings.palmSmudge?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Smudge Pickup Intensity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.palmSmudge?.smudgeIntensity ?? 0.40) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={1.0}
              step={0.05}
              value={activeSettings.palmSmudge?.smudgeIntensity ?? 0.40}
              aria-label="Fraction of wet ink transferred and dragged by palm heel"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  palmSmudge: {
                    ...activeSettings.palmSmudge,
                    smudgeIntensity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Smudge Drag Decay Length</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.palmSmudge?.smudgeDecayPx ?? 60} px
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={150}
              step={5}
              value={activeSettings.palmSmudge?.smudgeDecayPx ?? 60}
              aria-label="Directional smear stroke drag tail decay distance"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  palmSmudge: {
                    ...activeSettings.palmSmudge,
                    smudgeDecayPx: Number(e.target.value),
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
