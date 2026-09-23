import {
  calculateRampAverageSpeed,
  clipSpeed,
  sampleSpeedRampSvgPoints,
  type SequenceClip,
} from '@shared';
import { useModalStore } from '../../../../shared/model/modalStore';
import { Button } from '../../../../shared/ui/Button';
import { Section } from '../../../../shared/ui/Section';

export interface SpeedInspectorTabProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

export function SpeedInspectorTab({ clip, patchClip }: SpeedInspectorTabProps) {
  if (
    clip.sourceKind === 'still' ||
    clip.sourceKind === 'text' ||
    clip.sourceKind === 'effect'
  ) {
    return null;
  }

  return (
    <Section title="Speed & Retiming">
      <div className="flex flex-col gap-3">
        {clip.effects?.speedRamp?.enabled ? (
          /* Variable Speed Ramp Active View */
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">
                  Variable Speed Ramp
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-mono text-2xl font-bold text-amber-400">
                    {calculateRampAverageSpeed(clip.effects.speedRamp).toFixed(2)}×
                  </span>
                  <span className="text-xs text-text-secondary">(Avg Velocity)</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => useModalStore.getState().openModal('speed')}
                className="flex items-center gap-1.5 text-amber-300 border-amber-500/30"
              >
                <span className="material-symbols-outlined text-[15px]">tune</span>
                <span>Edit Ramp</span>
              </Button>
            </div>

            {/* Mini SVG Velocity Graph */}
            {(() => {
              const curve = sampleSpeedRampSvgPoints(
                clip.effects.speedRamp,
                260,
                50,
                40,
                0.1,
                5.0,
              );
              return (
                <div className="relative rounded-lg border border-hairline bg-black/80 overflow-hidden p-1.5">
                  <svg width="260" height="50" viewBox="0 0 260 50" className="w-full overflow-hidden">
                    <line
                      x1="0"
                      y1="40.8"
                      x2="260"
                      y2="40.8"
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="2 2"
                    />
                    <path
                      d={`${curve.pathData} L 260 50 L 0 50 Z`}
                      fill="rgba(251,191,36,0.2)"
                    />
                    <path
                      d={curve.pathData}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <text x="4" y="10" fill="#64748b" fontSize="7" fontFamily="monospace">
                      5.0×
                    </text>
                    <text x="4" y="48" fill="#64748b" fontSize="7" fontFamily="monospace">
                      0.1×
                    </text>
                    <text
                      x="256"
                      y="38"
                      fill="#f8fafc"
                      fontSize="7"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      1.0×
                    </text>
                  </svg>
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">
                {clip.effects.speedRamp.points.length} Bézier velocity nodes
              </span>
              <button
                type="button"
                onClick={() =>
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      speedRamp: undefined,
                      speed: 1.0,
                    },
                  })
                }
                className="text-[11px] font-mono text-text-disabled hover:text-text-primary underline"
              >
                Reset to 1.0× Constant
              </button>
            </div>
          </div>
        ) : (
          /* Constant Speed View */
          <>
            <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-workspace p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                  Playback Rate
                </span>
                <span className="font-mono text-2xl font-bold text-accent-ai mt-0.5 block">
                  {clipSpeed(clip.effects).toFixed(2)}×
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => useModalStore.getState().openModal('speed')}
                className="flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">tune</span>
                <span>Retime (Ctrl+R)</span>
              </Button>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block mb-1.5">
                Speed Presets
              </span>
              <div className="grid grid-cols-4 gap-1">
                {[0.5, 0.75, 1.0, 1.5, 2.0, 4.0].map((preset) => {
                  const active = Math.abs(clipSpeed(clip.effects) - preset) < 0.01;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: {
                            ...clip.effects,
                            speed: preset === 1 ? undefined : preset,
                          },
                        })
                      }
                      className={`rounded-lg border py-1 text-xs font-medium transition-all ${
                        active
                          ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-bold'
                          : 'border-hairline bg-bg-app text-text-secondary hover:border-text-disabled hover:text-text-primary'
                      }`}
                    >
                      {preset}×
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-text-secondary font-medium">
                <span>0.25×</span>
                <span>1.0×</span>
                <span>4.0×</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={4.0}
                step={0.05}
                value={clipSpeed(clip.effects)}
                aria-label="Playback speed slider"
                className="w-full accent-accent-ai cursor-ew-resize"
                onChange={(e) =>
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      speed:
                        parseFloat(e.target.value) === 1 ? undefined : parseFloat(e.target.value),
                    },
                  })
                }
              />
            </div>

            <p className="text-[11px] text-text-disabled leading-relaxed">
              Adjusting slider changes constant speed. To configure dynamic Bézier speed ramping or
              ripple downstream media, open the{' '}
              <button
                type="button"
                onClick={() => useModalStore.getState().openModal('speed')}
                className="text-accent-ai underline hover:text-accent-ai-hover font-medium"
              >
                Retime Dialog (Ctrl+R)
              </button>
              .
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
