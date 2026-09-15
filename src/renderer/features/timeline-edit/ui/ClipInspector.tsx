import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  CLIP_TRANSITIONS,
  CLIP_TRANSITION_LABELS,
  TRANSITION_GROUPS,
  DEFAULT_TEXT_BOX,
  DIP_DEFAULT_COLOR_HEX,
  FLASH_DEFAULT_COLOR_HEX,
  FLASH_FRAMES_MAX,
  MAX_MOTION_TRAVEL_PCT,
  MOTION_DIRECTIONS,
  MOTION_DIRECTION_LABELS,
  MOTION_PRESETS,
  MOTION_PRESET_LABELS,
  MOTION_REGISTER_LABELS,
  MOTION_REGISTER_NAMES,
  PIP_PRESETS,
  TRANSITION_FRAMES_DEFAULT,
  TRANSITION_FRAMES_MAX,
  TRANSITION_FRAMES_MIN,
  TRANSITION_FRAMES_STEP,
  clipSpeed,
  formatDurationSeconds,
  formatTimecode,
  framesToSeconds,
  keyframesFor,
  layoutTrack,
  motionRatePctPerSec,
  motionTravelPct,
  isTextTrack,
  quantizeTransitionFrames,
  secondsToFrames,
  valueAtFrame,
  type ClipColorFilters,
  type ClipEffects,
  type ClipKeyframe,
  type ClipMotion,
  type ClipTransition,
  type KeyframeProperty,
  type MotionDirection,
  type MotionPresetName,
  type MotionRegister,
  type SequenceClip,
  type SequenceDocument,
} from '@shared';

import {
  currentPlayheadFrame,
  useSequenceStore,
  selectDurationFrames,
  selectSelectedClip,
  selectSelectedClips,
} from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { InlineEditableText } from '../../../shared/ui/InlineEditableText';
import { Section } from '../../../shared/ui/Section';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import { ColorGradingPanel } from './ColorGradingPanel';

/**
 * Beta S145 — properties of the selected clip.
 *
 * Assembled from existing primitives rather than invented: `Section` for the
 * groups (the same 11px uppercase label the Voice workspaces use),
 * `InlineEditableText` for the duration, `Select` for the closed sets. The
 * inspector deliberately keeps the app's normal 8px rhythm — the timeline
 * panel's denser metrics stop at the panel.
 *
 * The duration control is `InlineEditableText` because that interaction is
 * already solved and shipped (Beta S49): double-click or F2, value
 * pre-selected so typing replaces, Enter or blur commits, Escape reverts, an
 * unchanged value writes nothing. "Click it, type 3.5, done" is exactly that
 * contract, and a hand-rolled input here would be a second, worse copy.
 */
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
function MultiClipInspector({ clips, fps }: { clips: SequenceClip[]; fps: number }) {
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
}

function SequenceOverviewCard({
  document,
  fps,
  durationFrames,
}: {
  document: SequenceDocument;
  fps: number;
  durationFrames: number;
}) {
  const addTrack = useSequenceStore((state) => state.addTrack);
  const renameSequence = useSequenceStore((state) => state.renameSequence);
  const videoTracks = document.tracks.filter((t) => t.kind === 'video' && !isTextTrack(t));
  const audioTracks = document.tracks.filter((t) => t.kind === 'audio');
  const textTracks = document.tracks.filter((t) => isTextTrack(t));

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Sequence Header Card */}
      <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-app p-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-ai/15 text-accent-ai">
              <span className="material-symbols-outlined text-[16px]">view_timeline</span>
            </div>
            <span className="text-xs font-semibold text-text-primary tracking-tight">Sequence Overview</span>
          </div>
          <span className="rounded bg-bg-canvas px-2 py-0.5 font-mono text-[10px] text-text-secondary border border-hairline">
            {document.sequence.width}×{document.sequence.height}
          </span>
        </div>
        <div className="mt-0.5">
          <InlineEditableText
            value={document.sequence.name || 'Untitled Sequence'}
            label="Sequence name"
            className="text-sm font-semibold text-text-primary"
            inputClassName="text-sm font-semibold"
            maxLength={100}
            onCommit={(name) => {
              if (name.trim()) void renameSequence(document.sequence.id, name.trim());
            }}
          />
        </div>
      </div>

      {/* Properties Grid */}
      <Section title="Sequence Properties">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Duration</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {formatTimecode(durationFrames, fps)}
            </span>
            <span className="font-mono text-[10px] text-text-secondary mt-0.5">
              {framesToSeconds(durationFrames, fps).toFixed(2)}s · {durationFrames}f
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Framerate</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {fps} FPS
            </span>
            <span className="font-mono text-[10px] text-text-secondary mt-0.5">
              {document.sequence.width > document.sequence.height ? '16:9 Landscape' : document.sequence.width === document.sequence.height ? '1:1 Square' : '9:16 Portrait'}
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Clips</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {document.clips.length}
            </span>
            <span className="text-[10px] text-text-secondary mt-0.5">
              Placed in timeline
            </span>
          </div>

          <div className="flex flex-col rounded-md border border-hairline/60 bg-bg-app p-2.5">
            <span className="text-[10px] font-medium text-text-disabled uppercase tracking-wide">Tracks</span>
            <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">
              {document.tracks.length}
            </span>
            <span className="text-[10px] text-text-secondary mt-0.5">
              {videoTracks.length}V · {audioTracks.length}A · {textTracks.length}T
            </span>
          </div>
        </div>
      </Section>

      {/* Quick Actions */}
      <Section title="Add Track">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void addTrack('video', `Video ${videoTracks.length + 1}`)}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-cyan-400">video_call</span>
              <span>Add Video Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>

          <button
            type="button"
            onClick={() => void addTrack('audio', `Audio ${audioTracks.length + 1}`)}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-emerald-400">audiotrack</span>
              <span>Add Audio Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>

          <button
            type="button"
            onClick={() => void addTrack('video', `Text ${textTracks.length + 1}`, 'text')}
            className="flex items-center justify-between rounded-md border border-hairline bg-bg-app px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-purple-400">title</span>
              <span>Add Text Track</span>
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">add</span>
          </button>
        </div>
      </Section>

      <div className="rounded-md border border-hairline/40 bg-bg-app/40 p-3 text-center">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          Select any clip on the timeline to edit its transform, speed, volume, keyframes, or transitions.
        </p>
      </div>
    </div>
  );
}

export function ClipInspector() {
  const clip = useSequenceStore(selectSelectedClip);
  // `useShallow` is load-bearing (S162): the selector returns a fresh array
  // whenever anything is selected, and without shallow comparison zustand v5's
  // unmemoised `getSnapshot` render-loops until React throws "Maximum update
  // depth exceeded" — which, with no error boundary above, blanked the app.
  const selectedClips = useSequenceStore(useShallow(selectSelectedClips));
  const document = useSequenceStore((state) => state.document);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const patchClip = useSequenceStore((state) => state.patchClip);

  /**
   * S181 — does the selected video clip's file actually carry sound?
   *
   * `null` while unknown, so the controls render optimistically rather than
   * flashing "no audio track" at every selection. Probed through the cached
   * `probeSources` channel, which is the same measurement the timeline uses
   * everywhere else — one stat for a file anything has already measured.
   *
   * Declared above the early returns because it is a hook: a selection of
   * nothing still has to run it, and moving it down beside the Level section
   * where it is used would break the rules-of-hooks ordering.
   */
  const [probed, setProbed] = useState<{ path: string; hasAudio: boolean } | null>(null);
  const probePath = clip?.sourceKind === 'video' ? clip.filePath : null;
  /**
   * The answer is *keyed by the path it is about*, rather than cleared on
   * every selection change. Clearing would mean a `setState` in the effect
   * body — a cascading render on every click, and the thing
   * `react-hooks/set-state-in-effect` exists to catch. Comparing instead makes
   * a stale answer simply not match, which needs no render at all.
   */
  const sourceHasAudio = probed?.path === probePath ? (probed?.hasAudio ?? null) : null;
  useEffect(() => {
    if (!probePath) return;
    let cancelled = false;
    void window.api.sequence.probeSources([probePath]).then((probes) => {
      // A selection change during the round trip wins — this answer is about
      // a clip the user has already moved on from.
      if (cancelled) return;
      setProbed({ path: probePath, hasAudio: probes[probePath]?.hasAudio ?? true });
    });
    return () => {
      cancelled = true;
    };
  }, [probePath]);

  if (!document) return null;
  const fps = document.sequence.fps;

  // S160 — a multi-selection gets the batch inspector instead of the blank
  // "select a clip" apology it used to earn.
  if (!clip && selectedClips.length > 1) {
    return <MultiClipInspector clips={selectedClips} fps={fps} />;
  }

  if (!clip) {
    return <SequenceOverviewCard document={document} fps={fps} durationFrames={durationFrames} />;
  }

  const clipTrack = document.tracks.find((track) => track.id === clip.trackId);
  const audio = clipTrack?.kind === 'audio';
  /**
   * S181 — a video clip carries its own audio, so the Level and Volume
   * animation sections are no longer audio-clip-only. Before this, selecting a
   * video clip offered no audio control at all, which was consistent with the
   * app throwing that audio away — and wrong the moment it stopped.
   */
  const videoClip = clip.sourceKind === 'video';
  const carriesSound = audio || videoClip;
  /** A video clip above the spine — the one place transform and position curves mean anything. */
  const overlay =
    clipTrack?.kind === 'video' && clip.trackId !== document.sequence.spineTrackId;

  /** The playhead in the clip's own frames — where "Add keyframe" lands. */
  const clipRelativePlayhead = (): number => {
    if (!clipTrack) return 0;
    const placed = layoutTrack(document.clips, clipTrack).find((item) => item.clip.id === clip.id);
    if (!placed) return 0;
    return Math.max(0, Math.min(clip.durationFrames - 1, currentPlayheadFrame() - placed.startFrames));
  };

  /** Upsert at the frame (the UNIQUE the table holds, mirrored in memory). */
  const addKeyframe = (property: KeyframeProperty, value: number) => {
    const frame = clipRelativePlayhead();
    const next: ClipKeyframe[] = [
      ...(clip.keyframes ?? []).filter(
        (keyframe) => !(keyframe.property === property && keyframe.frame === frame),
      ),
      { property, frame, value, interpolation: 'linear' },
    ];
    patchClip(clip.id, { keyframes: next });
  };

  const removeKeyframe = (property: KeyframeProperty, frame: number) => {
    const next = (clip.keyframes ?? []).filter(
      (keyframe) => !(keyframe.property === property && keyframe.frame === frame),
    );
    patchClip(clip.id, { keyframes: next.length > 0 ? next : undefined });
  };

  /** One property's key list, rendered as rows the user can delete. */
  const keyframeRows = (property: KeyframeProperty, format: (value: number) => string) =>
    keyframesFor(clip.keyframes, property).map((keyframe) => (
      <li
        key={`${property}-${keyframe.frame}`}
        className="flex items-center gap-2 font-mono text-xs text-text-secondary"
      >
        <span className="w-14">{framesToSeconds(keyframe.frame, fps).toFixed(2)}s</span>
        <span className="flex-1">{format(keyframe.value)}</span>
        <button
          type="button"
          aria-label={`Delete keyframe at ${framesToSeconds(keyframe.frame, fps).toFixed(2)}s`}
          className="text-text-disabled hover:text-text-primary"
          onClick={() => removeKeyframe(property, keyframe.frame)}
        >
          ×
        </button>
      </li>
    ));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Clip">
        <InlineEditableText
          value={clip.label || 'Untitled'}
          label="Clip name"
          className="text-sm text-text-primary"
          inputClassName="text-sm"
          maxLength={200}
          onCommit={(label) => patchClip(clip.id, { label }, 'label')}
        />
      </Section>

      <Section title="Duration">
        <div className="flex items-center gap-2">
          <InlineEditableText
            value={framesToSeconds(clip.durationFrames, fps).toFixed(1)}
            label="Duration in seconds"
            className="font-mono text-sm text-text-primary"
            inputClassName="font-mono text-sm w-20"
            maxLength={6}
            onCommit={(next) => {
              const seconds = Number.parseFloat(next);
              if (!Number.isFinite(seconds) || seconds <= 0) return;
              patchClip(
                clip.id,
                { durationFrames: Math.max(1, secondsToFrames(seconds, fps)) },
                'durationFrames',
              );
            }}
          />
          <span className="font-mono text-xs text-text-disabled">
            {formatDurationSeconds(clip.durationFrames, fps)} · {clip.durationFrames}f
          </span>
        </div>
        {clip.overrides.includes('durationFrames') ? (
          <p className="text-xs text-text-disabled">
            Changed by hand — a storyboard re-sync will leave this alone.
          </p>
        ) : null}
      </Section>

      {/* S154 phase 5 — a text clip's content. The textarea commits on blur
          like every draft field; per-keystroke commits would push one undo
          entry per letter. */}
      {clip.sourceKind === 'text' && clip.effects?.text ? (
        <Section title="Text">
          <textarea
            aria-label="Text content"
            defaultValue={clip.effects.text.text}
            key={clip.id}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-[var(--radius-button)] bg-bg-workspace p-2 text-sm text-text-primary outline-none"
            onBlur={(event) => {
              const text = event.target.value;
              if (text === clip.effects?.text?.text || !clip.effects?.text) return;
              patchClip(clip.id, { effects: { ...clip.effects, text: { ...clip.effects.text, text } } });
            }}
          />
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Size</span>
            <input
              type="range"
              min={16}
              max={200}
              step={4}
              value={clip.effects.text.fontSizePx}
              aria-label="Font size"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, {
                  effects: { ...clip.effects, text: { ...content, fontSizePx: Number(event.target.value) } },
                });
              }}
            />
            <span className="w-10 shrink-0 text-right font-mono">{clip.effects.text.fontSizePx}</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Vertical</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={clip.effects.text.positionPct.y}
              aria-label="Vertical position"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...content,
                      positionPct: { ...content.positionPct, y: Number(event.target.value) },
                    },
                  },
                });
              }}
            />
          </label>
          {/* S160 (owner item 9) — the x axis, finally symmetric with y; the
              preview drag writes the same field. */}
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Horizontal</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={clip.effects.text.positionPct.x}
              aria-label="Horizontal position"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...content,
                      positionPct: { ...content.positionPct, x: Number(event.target.value) },
                    },
                  },
                });
              }}
            />
          </label>
          {/* Align + anchor — both fields existed in the model and both
              renderers honoured them; only the controls were missing. */}
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Align</span>
            <SegmentedControl
              value={clip.effects.text.align}
              onChange={(align) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, { effects: { ...clip.effects, text: { ...content, align } } });
              }}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
              ]}
              ariaLabel="Text alignment"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Anchor</span>
            <SegmentedControl
              value={clip.effects.text.anchor ?? 'middle'}
              onChange={(anchor) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, { effects: { ...clip.effects, text: { ...content, anchor } } });
              }}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'middle', label: 'Middle' },
                { value: 'bottom', label: 'Bottom' },
              ]}
              ariaLabel="Vertical anchor"
            />
          </div>
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Colour</span>
            <input
              type="color"
              value={clip.effects.text.colorHex}
              aria-label="Text colour"
              className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                patchClip(clip.id, {
                  effects: { ...clip.effects, text: { ...content, colorHex: event.target.value } },
                });
              }}
            />
          </label>
          {/* S160 — the backing box, editable at last: the model carried it,
              presets set it, nothing could change it. */}
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Box</span>
            <input
              type="checkbox"
              checked={Boolean(clip.effects.text.box)}
              aria-label="Backing box"
              className="accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                const box = event.target.checked ? { ...DEFAULT_TEXT_BOX } : undefined;
                patchClip(clip.id, { effects: { ...clip.effects, text: { ...content, box } } });
              }}
            />
            {clip.effects.text.box ? (
              <>
                <input
                  type="color"
                  value={clip.effects.text.box.colorHex}
                  aria-label="Box colour"
                  className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.box) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: { ...content, box: { ...content.box, colorHex: event.target.value } },
                      },
                    });
                  }}
                />
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={clip.effects.text.box.opacity}
                  aria-label="Box opacity"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.box) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: {
                          ...content,
                          box: { ...content.box, opacity: Number(event.target.value) },
                        },
                      },
                    });
                  }}
                />
              </>
            ) : null}
          </label>
          <p className="text-xs text-text-disabled">
            Drag the text on the preview to place it — Shift locks the axis, Alt disables
            snapping. The export burns text in with a system font; the preview approximates it.
          </p>
        </Section>
      ) : null}

      {/* S154 phase 3 — speed, video and audio only: a still has no source
          rate to consume, its length is the duration chip; text and effect
          clips are holds. */}
      {clip.sourceKind !== 'still' && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <Section title="Speed">
          <Select
            aria-label="Playback speed"
            value={String(clipSpeed(clip.effects))}
            onChange={(value) =>
              patchClip(clip.id, {
                effects: { ...clip.effects, speed: Number(value) },
              })
            }
            options={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((speed) => ({
              value: String(speed),
              label: speed === 1 ? 'Normal' : `${speed}×`,
            }))}
          />
          <p className="text-xs text-text-disabled">
            The clip keeps its place and length — speed changes how much source fills it.
          </p>
        </Section>
      ) : null}

      {/* S154 phase 6 — placement (PiP) and position animation, overlay video
          tracks only: the spine is the base and has nowhere to move. */}
      {overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
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
      ) : null}

      {/* S154 phase 6 — animation. Keys land at the playhead, in the clip's
          own frames; deleting the last key removes the curve entirely. */}
      {overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
        <Section title="Animation">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const frame = clipRelativePlayhead();
              addKeyframe('x', valueAtFrame(clip.keyframes, 'x', frame, clip.effects?.transform?.x ?? 0.5));
              addKeyframe('y', valueAtFrame(clip.keyframes, 'y', frame, clip.effects?.transform?.y ?? 0.5));
            }}
          >
            Add position keyframe at playhead
          </Button>
          {keyframesFor(clip.keyframes, 'x').length > 0 ? (
            <ul className="flex flex-col gap-1">
              {keyframeRows('x', (value) => `x ${(value * 100).toFixed(0)}%`)}
              {keyframeRows('y', (value) => `y ${(value * 100).toFixed(0)}%`)}
            </ul>
          ) : (
            <p className="text-xs text-text-disabled">
              Two keyframes make a move: park the PiP, add one, move the playhead, drag Placement
              off a preset by adding another.
            </p>
          )}
        </Section>
      ) : null}

      {carriesSound ? (
        <Section title="Volume animation">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              addKeyframe(
                'volume',
                valueAtFrame(clip.keyframes, 'volume', clipRelativePlayhead(), clip.gainDb),
              )
            }
          >
            Add volume keyframe at playhead
          </Button>
          {keyframesFor(clip.keyframes, 'volume').length > 0 ? (
            <ul className="flex flex-col gap-1">
              {keyframeRows('volume', (value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} dB`)}
            </ul>
          ) : (
            <p className="text-xs text-text-disabled">
              Keys record the Level slider’s value at the playhead — a hand-drawn duck.
            </p>
          )}
        </Section>
      ) : null}

      {/* S154 phase 3 — per-clip correction & cinematic color grading */}
      {audio || clip.sourceKind === 'text' ? null : (
        <ColorGradingPanel clip={clip} />
      )}

      {/* S161 — Motion and Whiteboard are mutually exclusive: Ken Burns pans
          a finished picture while the reveal insists it isn't finished.
          Whiteboard-on hides Motion; enabling Whiteboard forces the preset
          to none, and disabling it hands Motion back. The whiteboard itself
          is edited in the media pool's Sketch tab (S279) — the inspector
          only reads the flag. */}
      {clip.sourceKind === 'still' && !clip.effects?.whiteboard ? (
        <Section title="Motion">
          {/* S229 — the vocabulary writes `effects.motion` (parametric: the
              rate is stored, travel derives from the hold). A legacy
              `motionPreset` still renders untouched, displays as its nearest
              new name, and converts the moment anything here changes. */}
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
      ) : null}


      {carriesSound ? (
        <Section title={videoClip ? 'Clip audio' : 'Level'}>
          {/*
            S181 — a video clip's own audio, on by default.

            Two states that look alike and must not read alike: the user
            silenced this clip, and the file has no audio stream to begin
            with. The probe already answers the second (`hasAudio` has been on
            `ClipProbe` since the TTS module), so a silent source says so
            plainly instead of offering a control that would do nothing.
          */}
          {videoClip ? (
            sourceHasAudio === false ? (
              <p className="text-xs text-text-disabled">
                This file has no audio track — nothing to mix.
              </p>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                  <span>Use the clip&rsquo;s audio</span>
                  <Switch
                    checked={clip.sourceAudioEnabled !== false}
                    label="Use the clip's own audio"
                    onChange={() =>
                      patchClip(clip.id, {
                        sourceAudioEnabled: clip.sourceAudioEnabled === false,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                  <span title="Source dialogue should hold its level under narration, and push the music bed down the way narration does.">
                    Treat as dialogue
                  </span>
                  <Switch
                    checked={clip.duckExempt === true}
                    label="Treat this clip's audio as dialogue rather than a bed"
                    disabled={clip.sourceAudioEnabled === false}
                    onChange={() => patchClip(clip.id, { duckExempt: clip.duckExempt !== true })}
                  />
                </label>
                {/* S230 — the split edit: this clip's audio leads (J) or
                    lags (L) its picture cut. Export-only; the preview's
                    video element plays its own sound in place (ⓘ). */}
                <label className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="w-12 shrink-0" title="Negative: the audio starts before the picture cut (J cut). Positive: it runs past it (L cut).">
                    J / L
                  </span>
                  <input
                    type="range"
                    min={-48}
                    max={48}
                    step={1}
                    value={clip.audioOffsetFrames ?? 0}
                    aria-label="Split edit audio offset"
                    disabled={clip.sourceAudioEnabled === false}
                    className="flex-1 accent-[var(--accent-ai)] disabled:opacity-50"
                    onChange={(event) =>
                      patchClip(clip.id, { audioOffsetFrames: Number(event.target.value) })
                    }
                  />
                  <span className="w-14 shrink-0 text-right font-mono">
                    {(clip.audioOffsetFrames ?? 0) === 0
                      ? 'off'
                      : `${(clip.audioOffsetFrames ?? 0) > 0 ? '+' : ''}${clip.audioOffsetFrames}f`}
                  </span>
                </label>
              </>
            )
          ) : null}
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <input
              type="range"
              min={-24}
              max={12}
              step={1}
              value={clip.gainDb}
              aria-label="Gain in decibels"
              disabled={videoClip && (clip.sourceAudioEnabled === false || sourceHasAudio === false)}
              className="flex-1 accent-[var(--accent-ai)] disabled:opacity-50"
              onChange={(event) => patchClip(clip.id, { gainDb: Number(event.target.value) })}
            />
            <span className="w-14 shrink-0 text-right font-mono">
              {clip.gainDb > 0 ? '+' : ''}
              {clip.gainDb} dB
            </span>
          </label>

          {/*
            Beta S151 (F3). The fade columns have existed since migration 060
            and round-tripped through the repository without a control that
            could set them or a render pass that read them; both ends are
            connected now. Capped at the clip's own length so a fade cannot be
            longer than the sound it shapes.
          */}
          {(['fadeInFrames', 'fadeOutFrames'] as const).map((field) => (
            <label key={field} className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-12 shrink-0">{field === 'fadeInFrames' ? 'Fade in' : 'Fade out'}</span>
              <input
                type="range"
                min={0}
                max={Math.min(clip.durationFrames, secondsToFrames(5, fps))}
                step={1}
                value={clip[field]}
                aria-label={field === 'fadeInFrames' ? 'Fade in seconds' : 'Fade out seconds'}
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) => patchClip(clip.id, { [field]: Number(event.target.value) })}
              />
              <span className="w-14 shrink-0 text-right font-mono">
                {framesToSeconds(clip[field], fps).toFixed(1)}s
              </span>
            </label>
          ))}
        </Section>
      ) : clip.sourceKind === 'effect' ? null : (
        <>
          <Section title="Transition in">
            {/* S154 phase 4 — the library. Type and length are two controls;
                picking a type keeps the length (defaulting 12f from a cut) and
                `cut` zeroes it. S227 — length is a quantised frame slider
                (4–48f, step 2) instead of a fixed seconds list. S157 — effect
                clips get no transition control: they live on free tracks where
                a transition never renders, and the grade's own window *is* its
                in/out. */}
            <Select
              aria-label="Transition"
              value={clip.transitionIn}
              onChange={(value) => {
                const transition = value as ClipTransition;
                if (transition === 'cut') {
                  patchClip(clip.id, { transitionIn: 'cut', transitionFrames: 0 });
                  return;
                }
                // S230 — a flash is its own length scale: 1–3 frames, not
                // the 4–48f dissolve range.
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
                {/* S237 — the registration points: where the shared subject
                    sits on the outgoing frame (Out) and on this clip (In).
                    The dissolve aligns In onto Out and eases to rest. */}
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
                    (clip.transitionIn === 'flash_frame' ? FLASH_DEFAULT_COLOR_HEX : DIP_DEFAULT_COLOR_HEX)
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
            {/* S227 — how the clip leaves. On the last spine clip this is the
                sequence's closing fade; at an interior junction the next
                clip's own transition wins and the preflight names the
                conflict. */}
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
              {/* S227 — the video fade primitive. Distinct from the clip's
                  audio fades: these fade the picture through black inside the
                  clip's own length, and the hold keeps the tail fully black —
                  an act break that spends no timeline length. */}
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
      )}
    </div>
  );
}

/**
 * S227 — the quantised transition length: a 4–48f slider stepping by 2, with
 * the frame count and its seconds reading side by side. Frames are the value
 * the document holds; seconds are what an editor thinks in.
 */
function TransitionLengthField({
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

function VideoFadeField({
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

/** Writes one videoFade field, dropping the object entirely when every field clears. */
function patchVideoFade(
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

/**
 * S234 — the taxonomy (audit C4): twenty-two transitions in three groups,
 * Essential first and the slideshow language last, rendered as disabled
 * heading rows in the flat Select. `excludeFlash` serves the out-select,
 * where a flash has no meaning.
 */
function groupedTransitionOptions(excludeFlash: boolean): { value: string; label: string; disabled?: boolean }[] {
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

/**
 * S229 — what the preset select shows for a clip that has no authored
 * motion yet: the legacy column's nearest new name. Display-only — the
 * legacy clip keeps rendering its exact S154 move until something here is
 * touched, at which point the parametric form is written.
 */
function displayMotionPreset(clip: SequenceClip): MotionPresetName {
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
function motionPatch(
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
function newSwaySeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/** S229 — the per-preset knobs under the preset select. */
function MotionControls({
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
  const seconds = framesToSeconds(durationFrames, fps);
  const rate = motionRatePctPerSec(motion);
  const travel = motionTravelPct(motion, durationFrames, fps);
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
        ).map(([label, key, viewpoint]) => (
          <label key={key} className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">{label}</span>
            <input
              type="range"
              min={1}
              max={2}
              step={0.01}
              value={viewpoint.scale}
              aria-label={label}
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) =>
                onChange({ ...motion, [key]: { ...viewpoint, scale: Number(event.target.value) } })
              }
            />
            <span className="w-14 shrink-0 text-right font-mono">{viewpoint.scale.toFixed(2)}×</span>
          </label>
        ))}
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
