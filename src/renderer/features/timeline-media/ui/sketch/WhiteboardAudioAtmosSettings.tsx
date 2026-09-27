import type { WhiteboardSettings } from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardAudioAtmosSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function WhiteboardAudioAtmosSettings({
  activeSettings,
  updateSettings,
}: WhiteboardAudioAtmosSettingsProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Foley Acoustics & Spatial Audio
      </span>

      {/* Milestone S125: Stylus Tip Pressure Audio & Squeak Resonance */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">graphic_eq</span>
              Pressure Audio & Squeak Resonance
            </span>
            <span className="text-[10px] text-text-disabled">
              Tip pressure-to-pitch shift, stick-slip friction squeaks & haptic thumps
            </span>
          </div>
          <Switch
            checked={activeSettings.pressureAudio?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.pressureAudio?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                pressureAudio: {
                  ...activeSettings.pressureAudio,
                  enabled: !current,
                  baseFreqHz: activeSettings.pressureAudio?.baseFreqHz ?? 800,
                  pitchSensitivity: activeSettings.pressureAudio?.pitchSensitivity ?? 0.35,
                  squeakThresholdPressure: activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65,
                  squeakThresholdVelocity: activeSettings.pressureAudio?.squeakThresholdVelocity ?? 250,
                  squeakBaseFreqHz: activeSettings.pressureAudio?.squeakBaseFreqHz ?? 2400,
                  squeakVolume: activeSettings.pressureAudio?.squeakVolume ?? 0.50,
                  hapticThumpVolume: activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60,
                  hapticRumbleGain: activeSettings.pressureAudio?.hapticRumbleGain ?? 0.40,
                },
              });
            }}
            label="Toggle pressure audio and squeak resonance"
          />
        </div>

        {activeSettings.pressureAudio?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Pitch Drag Sensitivity</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.pressureAudio?.pitchSensitivity ?? 0.35) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.80}
              step={0.05}
              value={activeSettings.pressureAudio?.pitchSensitivity ?? 0.35}
              aria-label="Pressure pitch drag sensitivity"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pressureAudio: {
                    ...activeSettings.pressureAudio,
                    pitchSensitivity: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Stick-Slip Squeak Threshold</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.30}
              max={0.95}
              step={0.05}
              value={activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65}
              aria-label="Friction squeak pressure threshold"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pressureAudio: {
                    ...activeSettings.pressureAudio,
                    squeakThresholdPressure: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Squeak Resonance Volume</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.pressureAudio?.squeakVolume ?? 0.50) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.pressureAudio?.squeakVolume ?? 0.50}
              aria-label="Squeak resonance audio volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pressureAudio: {
                    ...activeSettings.pressureAudio,
                    squeakVolume: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Touchdown Haptic Thump</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60}
              aria-label="Touchdown haptic thump audio volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  pressureAudio: {
                    ...activeSettings.pressureAudio,
                    hapticThumpVolume: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S132: Whiteboard Marker Cap Snap & Pressure Vacuum Click Foley Acoustics with Magnetic Dock Snapping */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">volume_up</span>
              Cap Snap & Vacuum Foley Acoustics
            </span>
            <span className="text-[10px] text-text-disabled">
              Pneumatic suction pop, plastic detent snap & magnetic dock pull
            </span>
          </div>
          <Switch
            checked={activeSettings.capSnapFoley?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.capSnapFoley?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                capSnapFoley: {
                  ...activeSettings.capSnapFoley,
                  enabled: !current,
                  volume: activeSettings.capSnapFoley?.volume ?? 0.75,
                  snapSharpness: activeSettings.capSnapFoley?.snapSharpness ?? 0.80,
                  suctionDepth: activeSettings.capSnapFoley?.suctionDepth ?? 0.65,
                  magneticSnapDistancePx: activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0,
                  autoFoleyOnToolSwap: activeSettings.capSnapFoley?.autoFoleyOnToolSwap ?? true,
                },
              });
            }}
            label="Toggle marker cap snap foley acoustics"
          />
        </div>

        {activeSettings.capSnapFoley?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Foley Volume</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.capSnapFoley?.volume ?? 0.75) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={1.0}
              step={0.05}
              value={activeSettings.capSnapFoley?.volume ?? 0.75}
              aria-label="Cap snap foley volume"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capSnapFoley: {
                    ...activeSettings.capSnapFoley,
                    volume: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Cap Detent Snap Sharpness</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.capSnapFoley?.snapSharpness ?? 0.80) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.20}
              max={1.0}
              step={0.05}
              value={activeSettings.capSnapFoley?.snapSharpness ?? 0.80}
              aria-label="Mechanical detent snap sharpness"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capSnapFoley: {
                    ...activeSettings.capSnapFoley,
                    snapSharpness: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Vacuum Suction Pop Depth</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round((activeSettings.capSnapFoley?.suctionDepth ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={1.0}
              step={0.05}
              value={activeSettings.capSnapFoley?.suctionDepth ?? 0.65}
              aria-label="Vacuum suction pop cavitation depth"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capSnapFoley: {
                    ...activeSettings.capSnapFoley,
                    suctionDepth: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Magnetic Snap Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {Math.round(activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0)} px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0}
              aria-label="Magnetic dock capture radius"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  capSnapFoley: {
                    ...activeSettings.capSnapFoley,
                    magneticSnapDistancePx: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S141: Whiteboard Live Audio-Visual Reactive Ink Pulsing */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">graphic_eq</span>
              <span>Audio-Reactive Ink Pulsing</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              Vocal loudness pulsing, F0 pitch harmonic ripple & plosive shockwaves
            </span>
          </div>
          <Switch
            checked={activeSettings.audioReactiveInk?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.audioReactiveInk?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                audioReactiveInk: {
                  ...activeSettings.audioReactiveInk,
                  enabled: !current,
                  energyGain: activeSettings.audioReactiveInk?.energyGain ?? 1.2,
                  energyGamma: activeSettings.audioReactiveInk?.energyGamma ?? 1.0,
                  attackMs: activeSettings.audioReactiveInk?.attackMs ?? 10,
                  releaseMs: activeSettings.audioReactiveInk?.releaseMs ?? 80,
                  pitchRippleAmp: activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0,
                  transientBurstRadius: activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0,
                  syncOffsetMs: activeSettings.audioReactiveInk?.syncOffsetMs ?? 0,
                },
              });
            }}
            label="Toggle live speech audio-reactive ink pulsing and transient shockwaves"
          />
        </div>

        {activeSettings.audioReactiveInk?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Speech Energy Width Gain</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.audioReactiveInk?.energyGain ?? 1.2).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={3.0}
              step={0.1}
              value={activeSettings.audioReactiveInk?.energyGain ?? 1.2}
              aria-label="Stroke width expansion gain driven by speech volume envelope"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  audioReactiveInk: {
                    ...activeSettings.audioReactiveInk,
                    energyGain: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Ballistic Response (Attack / Release)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.audioReactiveInk?.attackMs ?? 10} ms / {activeSettings.audioReactiveInk?.releaseMs ?? 80} ms
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={activeSettings.audioReactiveInk?.attackMs ?? 10}
                aria-label="Envelope follower attack time in milliseconds"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    audioReactiveInk: {
                      ...activeSettings.audioReactiveInk,
                      attackMs: Number(e.target.value),
                    },
                  })
                }
              />
              <input
                type="range"
                min={20}
                max={250}
                step={5}
                value={activeSettings.audioReactiveInk?.releaseMs ?? 80}
                aria-label="Envelope follower release decay time in milliseconds"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    audioReactiveInk: {
                      ...activeSettings.audioReactiveInk,
                      releaseMs: Number(e.target.value),
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Pitch Ripple Amplitude</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0).toFixed(1)} px
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={6.0}
              step={0.2}
              value={activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0}
              aria-label="Harmonic edge ripple amplitude modulated by vocal pitch"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  audioReactiveInk: {
                    ...activeSettings.audioReactiveInk,
                    pitchRippleAmp: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Plosive Transient Burst Radius</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0).toFixed(1)} px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0}
              aria-label="Radius of pigment shockwave burst rings on vocal plosives"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  audioReactiveInk: {
                    ...activeSettings.audioReactiveInk,
                    transientBurstRadius: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Audio-Visual Sync Offset</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.audioReactiveInk?.syncOffsetMs ?? 0} ms
              </span>
            </div>
            <input
              type="range"
              min={-80}
              max={80}
              step={5}
              value={activeSettings.audioReactiveInk?.syncOffsetMs ?? 0}
              aria-label="Latency compensation offset between audio and stroke pulsing"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  audioReactiveInk: {
                    ...activeSettings.audioReactiveInk,
                    syncOffsetMs: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>

      {/* Milestone S155: Multi-Track Whiteboard Master Sequence Audio Stems & Dolby Atmos Spatial Panning */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">surround_sound</span>
              <span>Dolby Atmos & Spatial Stems</span>
            </span>
            <span className="text-[10px] text-text-disabled">
              3D binaural HRTF panning & 7.1.4 stem bus mastering
            </span>
          </div>
          <Switch
            checked={activeSettings.spatialAudio?.enabled ?? false}
            onChange={() => {
              const current = activeSettings.spatialAudio?.enabled ?? false;
              updateSettings({
                ...activeSettings,
                spatialAudio: {
                  ...activeSettings.spatialAudio,
                  enabled: !current,
                  roomWidthM: activeSettings.spatialAudio?.roomWidthM ?? 10.0,
                  roomDepthM: activeSettings.spatialAudio?.roomDepthM ?? 8.0,
                  roomHeightM: activeSettings.spatialAudio?.roomHeightM ?? 3.5,
                  listenerPos: activeSettings.spatialAudio?.listenerPos ?? [0.0, 0.0, 1.2],
                  distanceFalloffExponent: activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0,
                  referenceDistanceM: activeSettings.spatialAudio?.referenceDistanceM ?? 1.0,
                  airAbsorptionCoeff: activeSettings.spatialAudio?.airAbsorptionCoeff ?? 0.001,
                  headRadiusM: activeSettings.spatialAudio?.headRadiusM ?? 0.0875,
                  speedOfSoundMps: activeSettings.spatialAudio?.speedOfSoundMps ?? 343.0,
                  hrtfBinauralEnabled: activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true,
                  masterFormat: activeSettings.spatialAudio?.masterFormat ?? 'Atmos714',
                },
              });
            }}
            label="Toggle Dolby Atmos 3D spatial panning and stem bus mastering"
          />
        </div>

        {activeSettings.spatialAudio?.enabled && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
                Master Format Delivery
              </span>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: 'Atmos714', label: '7.1.4 Atmos Bed' },
                    { id: 'StereoBinaural', label: 'Binaural 3D' },
                    { id: 'Surround51', label: '5.1 Surround' },
                    { id: 'ADM_BWF', label: 'ADM BWF XML' },
                  ] as const
                ).map(({ id, label }) => {
                  const active = (activeSettings.spatialAudio?.masterFormat ?? 'Atmos714') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        updateSettings({
                          ...activeSettings,
                          spatialAudio: {
                            ...activeSettings.spatialAudio,
                            masterFormat: id,
                          },
                        })
                      }
                      className={`py-1 px-1.5 text-[10px] rounded border transition-colors ${
                        active
                          ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                          : 'border-hairline text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Distance Falloff Exponent (γ)</span>
              <span className="font-mono text-text-primary text-[10px]">
                {(activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0).toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0}
              aria-label="Distance acoustic geometric attenuation falloff exponent"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  spatialAudio: {
                    ...activeSettings.spatialAudio,
                    distanceFalloffExponent: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Soundstage Room Depth</span>
              <span className="font-mono text-text-primary text-[10px]">
                {activeSettings.spatialAudio?.roomDepthM ?? 8.0}m
              </span>
            </div>
            <input
              type="range"
              min={4.0}
              max={16.0}
              step={1.0}
              value={activeSettings.spatialAudio?.roomDepthM ?? 8.0}
              aria-label="Acoustic soundstage room depth in meters"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({
                  ...activeSettings,
                  spatialAudio: {
                    ...activeSettings.spatialAudio,
                    roomDepthM: Number(e.target.value),
                  },
                })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Binaural HRTF Headphone Model</span>
              <Switch
                checked={activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true}
                onChange={() => {
                  const current = activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true;
                  updateSettings({
                    ...activeSettings,
                    spatialAudio: {
                      ...activeSettings.spatialAudio,
                      hrtfBinauralEnabled: !current,
                    },
                  });
                }}
                label="Toggle Woodworth-Schlosser ITD and ILD binaural head modeling"
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
