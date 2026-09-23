import {
  CLIP_TRANSITIONS,
  CLIP_TRANSITION_LABELS,
  TRANSITION_GROUPS,
  DIP_DEFAULT_COLOR_HEX,
  FLASH_DEFAULT_COLOR_HEX,
  FLASH_FRAMES_MAX,
  TRANSITION_FRAMES_DEFAULT,
  TRANSITION_FRAMES_MAX,
  TRANSITION_FRAMES_MIN,
  TRANSITION_FRAMES_STEP,
  framesToSeconds,
  quantizeTransitionFrames,
  type ClipEffects,
  type ClipTransition,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Select } from '../../../../shared/ui/Select';

export function TransitionLengthField({
  frames,
  fps,
  onChange,
}: {
  frames: number;
  fps: number;
  onChange: (frames: number) => void;
}) {
  const quantized = quantizeTransitionFrames(frames);
  return (
    <label className="flex items-center gap-3 text-xs text-text-secondary">
      <span className="w-16 shrink-0">Length</span>
      <input
        type="range"
        min={TRANSITION_FRAMES_MIN}
        max={TRANSITION_FRAMES_MAX}
        step={TRANSITION_FRAMES_STEP}
        value={quantized}
        aria-label="Transition length"
        className="flex-1 accent-[var(--accent-ai)]"
        onChange={(event) => onChange(quantizeTransitionFrames(Number(event.target.value)))}
      />
      <span className="w-20 shrink-0 text-right font-mono">
        {quantized}f · {framesToSeconds(quantized, fps).toFixed(2)}s
      </span>
    </label>
  );
}

export function VideoFadeField({
  label,
  frames,
  max,
  fps,
  onChange,
}: {
  label: string;
  frames: number;
  max: number;
  fps: number;
  onChange: (frames: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-text-secondary">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(frames, max)}
        aria-label={label}
        className="flex-1 accent-[var(--accent-ai)]"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="w-20 shrink-0 text-right font-mono">
        {frames > 0 ? `${frames}f · ${framesToSeconds(frames, fps).toFixed(2)}s` : 'off'}
      </span>
    </label>
  );
}

export function patchVideoFade(
  clip: SequenceClip,
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void,
  change: Partial<NonNullable<ClipEffects['videoFade']>>,
): void {
  const next = { ...clip.effects?.videoFade, ...change };
  const empty = !next.inFrames && !next.outFrames && !next.holdBlackFrames;
  const effects = { ...clip.effects };
  if (empty) delete effects.videoFade;
  else effects.videoFade = next;
  patchClip(clip.id, { effects });
}

export function groupedTransitionOptions(excludeFlash: boolean): {
  value: string;
  label: string;
  disabled?: boolean;
}[] {
  return TRANSITION_GROUPS.flatMap((group) => {
    const entries = group.transitions.filter(
      (transition) => !excludeFlash || transition !== 'flash_frame',
    );
    return [
      { value: `__group_${group.label}`, label: `— ${group.label} —`, disabled: true },
      ...entries.map((transition) => ({
        value: transition,
        label: CLIP_TRANSITION_LABELS[transition],
      })),
    ];
  });
}

export interface TransitionInspectorTabProps {
  clip: SequenceClip;
  fps: number;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

export function TransitionInspectorTab({ clip, fps, patchClip }: TransitionInspectorTabProps) {
  if (clip.sourceKind === 'effect') return null;

  return (
    <>
      <Section title="Transition in">
        <Select
          aria-label="Transition"
          value={clip.transitionIn}
          onChange={(value) => {
            const transition = value as ClipTransition;
            if (transition === 'cut') {
              patchClip(clip.id, { transitionIn: 'cut', transitionFrames: 0 });
              return;
            }
            if (transition === 'flash_frame') {
              patchClip(clip.id, {
                transitionIn: 'flash_frame',
                transitionFrames: clip.effects?.transition?.flashFrames ?? 2,
              });
              return;
            }
            patchClip(clip.id, {
              transitionIn: transition,
              transitionFrames:
                clip.transitionFrames > 0
                  ? quantizeTransitionFrames(clip.transitionFrames)
                  : TRANSITION_FRAMES_DEFAULT,
            });
          }}
          options={groupedTransitionOptions(false)}
        />
        {clip.transitionIn === 'flash_frame' ? (
          <SegmentedControl
            ariaLabel="Flash length"
            value={String(clip.effects?.transition?.flashFrames ?? 2)}
            onChange={(next) => {
              const frames = Math.min(FLASH_FRAMES_MAX, Math.max(1, Number(next)));
              patchClip(clip.id, {
                transitionFrames: frames,
                effects: {
                  ...clip.effects,
                  transition: { ...clip.effects?.transition, flashFrames: frames },
                },
              });
            }}
            options={[1, 2, 3].map((frames) => ({
              value: String(frames),
              label: `${frames}f`,
            }))}
          />
        ) : clip.transitionIn !== 'cut' ? (
          <TransitionLengthField
            frames={clip.transitionFrames}
            fps={fps}
            onChange={(frames) => patchClip(clip.id, { transitionFrames: frames })}
          />
        ) : null}
        {clip.transitionIn === 'asymmetric_dissolve' ? (
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Out / in</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={clip.effects?.transition?.outInRatio ?? 0.3}
              aria-label="Out to in ratio"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    transition: {
                      ...clip.effects?.transition,
                      outInRatio: Number(event.target.value),
                    },
                  },
                })
              }
            />
            <span className="w-14 shrink-0 text-right font-mono">
              {Math.round((clip.effects?.transition?.outInRatio ?? 0.3) * 100)}/
              {Math.round((1 - (clip.effects?.transition?.outInRatio ?? 0.3)) * 100)}
            </span>
          </label>
        ) : null}
        {clip.transitionIn === 'match_dissolve' ? (
          <>
            {(
              [
                ['Out X', 'out', 'x'],
                ['Out Y', 'out', 'y'],
                ['In X', 'in', 'x'],
                ['In Y', 'in', 'y'],
              ] as const
            ).map(([label, side, axis]) => {
              const match = clip.effects?.transition?.match ?? {
                out: { x: 0.5, y: 0.5 },
                in: { x: 0.5, y: 0.5 },
              };
              return (
                <label key={label} className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="w-16 shrink-0">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={match[side][axis]}
                    aria-label={`Match ${label}`}
                    className="flex-1 accent-[var(--accent-ai)]"
                    onChange={(event) =>
                      patchClip(clip.id, {
                        effects: {
                          ...clip.effects,
                          transition: {
                            ...clip.effects?.transition,
                            match: {
                              ...match,
                              [side]: { ...match[side], [axis]: Number(event.target.value) },
                            },
                          },
                        },
                      })
                    }
                  />
                  <span className="w-10 shrink-0 text-right font-mono">
                    {Math.round(match[side][axis] * 100)}%
                  </span>
                </label>
              );
            })}
          </>
        ) : null}
        {clip.transitionIn === 'dip_to_color' || clip.transitionIn === 'flash_frame' ? (
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Colour</span>
            <input
              type="color"
              value={
                clip.effects?.transition?.colorHex ??
                (clip.transitionIn === 'flash_frame'
                  ? FLASH_DEFAULT_COLOR_HEX
                  : DIP_DEFAULT_COLOR_HEX)
              }
              aria-label="Transition colour"
              className="h-6 w-10 cursor-pointer rounded border-none bg-transparent"
              onChange={(event) =>
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    transition: {
                      ...clip.effects?.transition,
                      colorHex: event.target.value,
                    },
                  },
                })
              }
            />
          </label>
        ) : null}
      </Section>
      <Section title="Transition out">
        <Select
          aria-label="Transition out"
          value={clip.transitionOut ?? 'cut'}
          onChange={(value) => {
            const transition = value as ClipTransition;
            if (transition === 'cut') {
              patchClip(clip.id, { transitionOut: 'cut', transitionOutFrames: 0 });
              return;
            }
            patchClip(clip.id, {
              transitionOut: transition,
              transitionOutFrames:
                (clip.transitionOutFrames ?? 0) > 0
                  ? quantizeTransitionFrames(clip.transitionOutFrames ?? 0)
                  : TRANSITION_FRAMES_DEFAULT,
            });
          }}
          options={groupedTransitionOptions(true)}
        />
        {(clip.transitionOut ?? 'cut') !== 'cut' ? (
          <TransitionLengthField
            frames={clip.transitionOutFrames ?? TRANSITION_FRAMES_DEFAULT}
            fps={fps}
            onChange={(frames) => patchClip(clip.id, { transitionOutFrames: frames })}
          />
        ) : null}
      </Section>
      {clip.sourceKind === 'still' || clip.sourceKind === 'video' ? (
        <Section title="Picture fade">
          <VideoFadeField
            label="Fade in"
            frames={clip.effects?.videoFade?.inFrames ?? 0}
            max={Math.min(clip.durationFrames, 96)}
            fps={fps}
            onChange={(frames) =>
              patchVideoFade(clip, patchClip, { inFrames: frames || undefined })
            }
          />
          <VideoFadeField
            label="Fade out"
            frames={clip.effects?.videoFade?.outFrames ?? 0}
            max={Math.min(clip.durationFrames, 96)}
            fps={fps}
            onChange={(frames) =>
              patchVideoFade(clip, patchClip, { outFrames: frames || undefined })
            }
          />
          <VideoFadeField
            label="Hold black"
            frames={clip.effects?.videoFade?.holdBlackFrames ?? 0}
            max={Math.min(Math.max(clip.durationFrames - 1, 0), 96)}
            fps={fps}
            onChange={(frames) =>
              patchVideoFade(clip, patchClip, { holdBlackFrames: frames || undefined })
            }
          />
        </Section>
      ) : null}
    </>
  );
}
