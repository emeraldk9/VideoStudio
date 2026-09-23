import React from 'react';
import {
  MAX_MOTION_TRAVEL_PCT,
  MOTION_DIRECTIONS,
  MOTION_DIRECTION_LABELS,
  MOTION_PRESETS,
  MOTION_PRESET_LABELS,
  MOTION_REGISTER_LABELS,
  MOTION_REGISTER_NAMES,
  framesToSeconds,
  motionRatePctPerSec,
  motionTravelPct,
  type ClipMotion,
  type ClipOverridableField,
  type MotionDirection,
  type MotionPresetName,
  type MotionRegister,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Select } from '../../../../shared/ui/Select';
import { Button } from '../../../../shared/ui/Button';

/**
 * S229 — what the preset select shows for a clip that has no authored
 * motion yet: the legacy column's nearest new name. Display-only — the
 * legacy clip keeps rendering its exact S154 move until something here is
 * touched, at which point the parametric form is written.
 */
export function displayMotionPreset(clip: SequenceClip): MotionPresetName {
  if (clip.effects?.motion) return clip.effects.motion.preset;
  switch (clip.motionPreset) {
    case 'zoom_in':
      return 'push_in';
    case 'zoom_out':
      return 'pull_out';
    case 'pan_lr':
    case 'pan_rl':
      return 'drift';
    default:
      return 'hold';
  }
}

/** A preset change as a clip patch: hold clears the motion, everything else writes it with its knobs defaulted. */
export function motionPatch(
  clip: SequenceClip,
  preset: MotionPresetName,
  prior: ClipMotion | undefined,
): Partial<SequenceClip> {
  const effects = { ...clip.effects };
  if (preset === 'hold') {
    delete effects.motion;
    return { motionPreset: 'none', effects };
  }
  const next: ClipMotion = { preset, register: prior?.register ?? 'ambient' };
  if (prior?.ratePctPerSec !== undefined) next.ratePctPerSec = prior.ratePctPerSec;
  if (preset === 'drift') {
    next.direction =
      prior?.direction ?? (clip.motionPreset === 'pan_rl' ? 'left' : 'right');
  }
  if (preset === 'push_to_point') next.point = prior?.point ?? { x: 0.5, y: 0.5 };
  if (preset === 'float') next.seed = prior?.seed ?? newSwaySeed();
  if (preset === 'reframe') {
    next.from = prior?.from ?? { x: 0.5, y: 0.5, scale: 1 };
    next.to = prior?.to ?? { x: 0.5, y: 0.5, scale: 1.2 };
  }
  return { motionPreset: 'none', effects: { ...effects, motion: next } };
}

/** A fresh sway identity. Math.random is fine here: the *stored* seed is what determinism hangs on. */
export function newSwaySeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/** S229 — the per-preset knobs under the preset select. */
export function MotionControls({
  motion,
  durationFrames,
  fps,
  onChange,
}: {
  motion: ClipMotion;
  durationFrames: number;
  fps: number;
  onChange: (next: ClipMotion) => void;
}) {
  const seconds = framesToSeconds(durationFrames, fps) || 0;
  const rate = motionRatePctPerSec(motion) || 0;
  const travel = motionTravelPct(motion, durationFrames, fps) || 0;
  const capped = rate * seconds > MAX_MOTION_TRAVEL_PCT;
  const registerValue = motion.ratePctPerSec !== undefined ? 'custom' : (motion.register ?? 'ambient');
  if (motion.preset === 'reframe') {
    // S237 — a reframe is authored geometry, not a rate: two viewports and
    // their zooms. Position is dragged on the preview (the A and B rects
    // appear while this clip is selected under the playhead).
    const from = motion.from ?? { x: 0.5, y: 0.5, scale: 1 };
    const to = motion.to ?? { x: 0.5, y: 0.5, scale: 1.2 };
    return (
      <>
        {(
          [
            ['A zoom', 'from', from],
            ['B zoom', 'to', to],
          ] as const
        ).map(([label, key, viewpoint]) => {
          const scale = viewpoint.scale ?? 1;
          return (
            <label key={key} className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">{label}</span>
              <input
                type="range"
                min={1}
                max={2}
                step={0.01}
                value={scale}
                aria-label={label}
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) =>
                  onChange({ ...motion, [key]: { ...viewpoint, scale: Number(event.target.value) } })
                }
              />
              <span className="w-14 shrink-0 text-right font-mono">{scale.toFixed(2)}×</span>
            </label>
          );
        })}
        <p className="text-xs text-text-disabled">
          Park the playhead on this clip and drag the A and B frames in the preview to place them.
          Faster than 2 %/s trips the comfort-cap warning.
        </p>
      </>
    );
  }
  return (
    <>
      <Select
        aria-label="Motion register"
        size="sm"
        value={registerValue}
        onChange={(value) => {
          if (value === 'custom') {
            onChange({ ...motion, ratePctPerSec: rate });
            return;
          }
          if (!MOTION_REGISTER_NAMES.includes(value as MotionRegister)) return;
          const next = { ...motion, register: value as MotionRegister };
          delete next.ratePctPerSec;
          onChange(next);
        }}
        options={[
          ...MOTION_REGISTER_NAMES.map((register) => ({
            value: register,
            label: MOTION_REGISTER_LABELS[register],
          })),
          { value: 'custom', label: 'Custom rate…' },
        ]}
      />
      {motion.ratePctPerSec !== undefined ? (
        <label className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Rate</span>
          <input
            type="range"
            min={0.05}
            max={2}
            step={0.05}
            value={rate}
            aria-label="Motion rate"
            className="flex-1 accent-[var(--accent-ai)]"
            onChange={(event) => onChange({ ...motion, ratePctPerSec: Number(event.target.value) })}
          />
          <span className="w-16 shrink-0 text-right font-mono">{rate.toFixed(2)} %/s</span>
        </label>
      ) : null}
      {motion.preset === 'drift' ? (
        <Select
          aria-label="Drift direction"
          size="sm"
          value={motion.direction ?? 'right'}
          onChange={(value) => {
            if (!MOTION_DIRECTIONS.includes(value as MotionDirection)) return;
            onChange({ ...motion, direction: value as MotionDirection });
          }}
          options={MOTION_DIRECTIONS.map((direction) => ({
            value: direction,
            label: MOTION_DIRECTION_LABELS[direction],
          }))}
        />
      ) : null}
      {motion.preset === 'push_to_point' ? (
        <>
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Point X</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={motion.point?.x ?? 0.5}
              aria-label="Point X"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                onChange({
                  ...motion,
                  point: { x: Number(event.target.value), y: motion.point?.y ?? 0.5 },
                })
              }
            />
          </label>
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Point Y</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={motion.point?.y ?? 0.5}
              aria-label="Point Y"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                onChange({
                  ...motion,
                  point: { x: motion.point?.x ?? 0.5, y: Number(event.target.value) },
                })
              }
            />
          </label>
        </>
      ) : null}
      {motion.preset === 'float' ? (
        <Button variant="secondary" size="sm" onClick={() => onChange({ ...motion, seed: newSwaySeed() })}>
          Reroll sway
        </Button>
      ) : null}
      <p className="text-xs text-text-disabled">
        {capped
          ? `Capped at ${MAX_MOTION_TRAVEL_PCT}% over ${seconds.toFixed(1)}s — the rate would over-travel.`
          : `Travels ${travel.toFixed(1)}% over ${seconds.toFixed(1)}s.`}
      </p>
    </>
  );
}

export interface MotionInspectorTabProps {
  clip: SequenceClip;
  fps: number;
  patchClip: (
    clipId: string,
    patch: Partial<SequenceClip>,
    overridableField?: ClipOverridableField,
  ) => void;
}

export const MotionInspectorTab = React.memo(function MotionInspectorTab({
  clip,
  fps,
  patchClip,
}: MotionInspectorTabProps) {
  if (clip.sourceKind !== 'still' || clip.effects?.whiteboard) return null;

  return (
    <Section title="Motion">
      <Select
        aria-label="Motion preset"
        value={displayMotionPreset(clip)}
        onChange={(value) => {
          if (!MOTION_PRESETS.includes(value as MotionPresetName)) return;
          patchClip(
            clip.id,
            motionPatch(clip, value as MotionPresetName, clip.effects?.motion),
            'motionPreset',
          );
        }}
        options={MOTION_PRESETS.map((preset) => ({
          value: preset,
          label: MOTION_PRESET_LABELS[preset],
        }))}
      />
      {clip.effects?.motion && clip.effects.motion.preset !== 'hold' ? (
        <MotionControls
          motion={clip.effects.motion}
          durationFrames={clip.durationFrames}
          fps={fps}
          onChange={(next) =>
            patchClip(
              clip.id,
              { motionPreset: 'none', effects: { ...clip.effects, motion: next } },
              'motionPreset',
            )
          }
        />
      ) : null}
    </Section>
  );
});
