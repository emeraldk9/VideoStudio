import React, { useMemo } from 'react';
import {
  CLIP_COLOR_LABELS,
  COLOR_LABEL_DEFINITIONS,
  TRANSITION_FRAMES_DEFAULT,
  CLIP_TRANSITIONS,
  TRANSITION_GROUPS,
  MOTION_PRESETS,
  MOTION_PRESET_LABELS,
  clipSpeed,
  formatDurationSeconds,
  framesToSeconds,
  secondsToFrames,
  type ClipColorLabel,
  type ClipTransition,
  type MotionPresetName,
  type SequenceClip,
} from '@shared';
import { useSequenceStore } from '../../../../entities/sequence';
import { Section } from '../../../../shared/ui/Section';
import { Button } from '../../../../shared/ui/Button';
import { Select } from '../../../../shared/ui/Select';
import { InlineEditableText } from '../../../../shared/ui/InlineEditableText';
import { displayMotionPreset, motionPatch } from './MotionInspectorTab';
import { groupedTransitionOptions } from './TransitionInspectorTab';

export interface MultiClipInspectorProps {
  clips: SequenceClip[];
  fps: number;
}

/** All equal → the value; any spread → `null`, rendered as "Mixed". */
function commonValue<T>(values: readonly T[]): T | null {
  return values.every((value) => value === values[0]) ? values[0] : null;
}

/**
 * S160 (owner item 3) — the inspector's multi-select mode.
 *
 * Shows the fields whose batch application is well-defined and writes each
 * through **one** `patchClips`/`patchClipsWith` call — one undo entry for
 * "set six clips to 3s". Fields with no meaningful union (label, keyframes,
 * text content) stay single-select on purpose. A differing value reads
 * "Mixed" until an edit overwrites it everywhere — the convention every
 * inspector-shaped tool shares.
 */
export const MultiClipInspector = React.memo(function MultiClipInspector({ clips, fps }: MultiClipInspectorProps) {
  const patchClips = useSequenceStore((state) => state.patchClips);
  const patchClipsWith = useSequenceStore((state) => state.patchClipsWith);
  const removeClips = useSequenceStore((state) => state.removeClips);

  const ids = clips.map((clip) => clip.id);
  // Duration batches for the hold kinds only: a video/audio clip's length is
  // a measurement, and the single-clip path guards it the same way.
  const holdClips = clips.filter((clip) => clip.sourceKind === 'still' || clip.sourceKind === 'text');
  const speedClips = clips.filter(
    (clip) => clip.sourceKind === 'video' || clip.sourceKind === 'audio',
  );
  // S181 — "carries sound" is no longer "is an audio clip": a video clip's own
  // audio is real now, and it uses the very `gainDb` column that has sat on
  // every clip since migration 060 without a control that could reach it.
  const audioClips = clips.filter(
    (clip) => clip.sourceKind === 'audio' || clip.sourceKind === 'video',
  );

  const sharedDuration = commonValue(holdClips.map((clip) => clip.durationFrames));
  const sharedTransition = commonValue(clips.map((clip) => clip.transitionIn));
  const sharedMotion = commonValue(
    clips.filter((clip) => clip.sourceKind === 'still').map((clip) => displayMotionPreset(clip)),
  );
  const sharedSpeed = commonValue(speedClips.map((clip) => clipSpeed(clip.effects)));
  const sharedGain = commonValue(audioClips.map((clip) => clip.gainDb));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Selection">
        <p className="text-sm text-text-primary">{clips.length} clips selected</p>
        <p className="text-xs text-text-disabled">
          Edits here apply to every selected clip — one undo step.
        </p>
      </Section>

      <Section title="Label Color">
        <div className="flex items-center gap-1.5 flex-wrap">
          {CLIP_COLOR_LABELS.map((colorKey) => {
            const meta = COLOR_LABEL_DEFINITIONS[colorKey];
            const allMatch = clips.every((c) => (c.colorLabel ?? 'default') === colorKey);
            return (
              <button
                key={colorKey}
                type="button"
                title={meta.name}
                onClick={() =>
                  patchClips(ids, {
                    colorLabel: colorKey === 'default' ? undefined : colorKey,
                  })
                }
                className={`h-5 w-5 rounded-full flex items-center justify-center transition-transform ${
                  meta.dotClass
                } ${
                  allMatch
                    ? 'ring-2 ring-accent-ai ring-offset-2 ring-offset-bg-workspace scale-110 shadow-sm'
                    : 'hover:scale-110 opacity-75 hover:opacity-100'
                }`}
              >
                {allMatch ? (
                  <span className="material-symbols-outlined text-white text-[12px] font-bold">
                    check
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Section>

      {holdClips.length > 0 ? (
        <Section title={`Duration · ${holdClips.length} stills/text`}>
          <InlineEditableText
            value={sharedDuration !== null ? framesToSeconds(sharedDuration, fps).toFixed(1) : 'Mixed'}
            label="Duration in seconds for all selected"
            className="font-mono text-sm text-text-primary"
            inputClassName="font-mono text-sm w-20"
            maxLength={6}
            onCommit={(next) => {
              const seconds = Number.parseFloat(next);
              if (!Number.isFinite(seconds) || seconds <= 0) return;
              patchClips(
                holdClips.map((clip) => clip.id),
                { durationFrames: Math.max(1, secondsToFrames(seconds, fps)) },
                'durationFrames',
              );
            }}
          />
        </Section>
      ) : null}

      <Section title="Transition in">
        <Select
          aria-label="Transition for all selected"
          value={sharedTransition ?? ''}
          onChange={(value) => {
            if (!CLIP_TRANSITIONS.includes(value as ClipTransition)) return;
            const transition = value as ClipTransition;
            patchClips(ids, {
              transitionIn: transition,
              transitionFrames:
                transition === 'cut' ? 0 : transition === 'flash_frame' ? 2 : TRANSITION_FRAMES_DEFAULT,
            });
          }}
          options={[
            // The "Mixed" sentinel — present only while values differ, gone
            // the moment an edit unifies them. Selecting it is a no-op.
            ...(sharedTransition === null ? [{ value: '', label: 'Mixed' }] : []),
            ...groupedTransitionOptions(false),
          ]}
        />
      </Section>

      {sharedMotion !== undefined && clips.some((clip) => clip.sourceKind === 'still') ? (
        <Section title="Animation (stills)">
          {/* S229 — the new vocabulary, applied with the ambient register;
              per-clip knobs (direction, point, seed) live in the single-clip
              inspector. */}
          <Select
            aria-label="Motion preset for all selected stills"
            value={sharedMotion ?? ''}
            onChange={(value) => {
              if (!MOTION_PRESETS.includes(value as MotionPresetName)) return;
              const preset = value as MotionPresetName;
              patchClipsWith(
                clips.filter((clip) => clip.sourceKind === 'still').map((clip) => clip.id),
                (clip) => motionPatch(clip, preset, clip.effects?.motion),
                'motionPreset',
              );
            }}
            options={[
              ...(sharedMotion === null ? [{ value: '', label: 'Mixed' }] : []),
              ...MOTION_PRESETS.map((preset) => ({
                value: preset,
                label: MOTION_PRESET_LABELS[preset],
              })),
            ]}
          />
        </Section>
      ) : null}

      {speedClips.length > 0 ? (
        <Section title={`Speed · ${speedClips.length} media clips`}>
          <Select
            aria-label="Playback speed for all selected"
            value={sharedSpeed !== null ? String(sharedSpeed) : ''}
            onChange={(value) => {
              if (value === '') return;
              // Per-clip merge — a flat patch would clobber text/filters on
              // clips that carry them (the reason `patchClipsWith` exists).
              patchClipsWith(
                speedClips.map((clip) => clip.id),
                (clip) => ({ effects: { ...clip.effects, speed: Number(value) } }),
              );
            }}
            options={[
              ...(sharedSpeed === null ? [{ value: '', label: 'Mixed' }] : []),
              ...[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((speed) => ({
                value: String(speed),
                label: speed === 1 ? 'Normal' : `${speed}×`,
              })),
            ]}
          />
        </Section>
      ) : null}

      {audioClips.length > 0 ? (
        <Section title={`Gain · ${audioClips.length} clips`}>
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <input
              type="range"
              min={-24}
              max={12}
              step={1}
              value={sharedGain ?? 0}
              aria-label="Gain for all selected clips"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                patchClips(
                  audioClips.map((clip) => clip.id),
                  { gainDb: Number(event.target.value) },
                )
              }
            />
            <span className="w-14 shrink-0 text-right font-mono">
              {sharedGain !== null ? `${sharedGain} dB` : 'Mixed'}
            </span>
          </label>
        </Section>
      ) : null}

      <Section title="Remove">
        <Button variant="secondary" onClick={() => removeClips(ids)}>
          Delete {clips.length} clips
        </Button>
      </Section>
    </div>
  );
});
