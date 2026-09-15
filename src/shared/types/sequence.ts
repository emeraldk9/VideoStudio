import type { ClipEffects } from '../utils/timeline/effects';
import type { ClipKeyframe } from '../utils/timeline/keyframes';

import type { WatermarkCleanedStamp } from './watermark';

/**
 * Beta S145 — the Timeline Editor Studio's document model.
 *
 * Shaped after OpenTimelineIO (`Timeline` → `Track` → `Clip`, a clip carrying a
 * media reference and a source range) without taking its dependency — OTIO is
 * Python/C++. Adopting its *shape* costs nothing now and buys an `.otio`/EDL
 * export later without redesigning the tables.
 *
 * **Every time value here is an integer frame count at {@link Sequence.fps}.**
 * Not float seconds: 60 stills at 3.333s accumulate 0.02s of drift, which
 * lands in the render's concat list as a visible A/V slip. Seconds exist at
 * exactly two boundaries — what the UI displays, and what ffmpeg is handed —
 * and `framesToSeconds`/`secondsToFrames` are the only sanctioned crossings.
 */

/**
 * Beta S154 — dynamic tracks, replacing S145's fixed `V1`/`A1`/`A2` enum.
 *
 * `kind` is deliberately binary: the two kinds are the two halves of the
 * render graph — a video track *composites* (`overlay`), an audio track
 * *mixes* (`amix`). "Overlay" is the default *name* of a video track above
 * the spine, and text-ness is a property of the clip, never of the track.
 */
export const TRACK_KINDS = ['video', 'audio'] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

/**
 * Beta S157 — what a track is *for*, as a stored fact rather than a
 * position. `'narration'` is the render's duck key and the storyboard pane's
 * placement target; `'music'` is the duckable bed; `null` is a plain track.
 * Migration 065 stamped these onto exactly the tracks every consumer had been
 * resolving by lowest-`orderIndex` — the merge of the owner's "narrator" and
 * "music" lane types into one audio kind, without losing ducking.
 *
 * Beta S165 — `'text'` and `'overlay'` extend the same mechanism to video: a
 * text lane is `kind: 'video', role: 'text'`, an effects-overlay lane is
 * `kind: 'video', role: 'overlay'`, and a plain (role-null, non-spine) video
 * lane is a picture lane for PiP media. All three still *composite* (kind
 * stays the render graph's fact, and the renderers never read role), but
 * placement, glyph, height and colour treat them as dedicated lanes the way
 * CapCut types its lanes. (`'overlay'` was minted one fix after `'text'` —
 * S165's first cut left overlay-ness implicit as "role-null non-spine", which
 * made a freshly-added *video* lane indistinguishable from an overlay.)
 * Roles are kind-scoped: `narration`/`music` are audio-only, `text`/`overlay`
 * are video-only and never the spine — enforced at the repository and zod
 * layers (migrations 067/068 widened the value CHECK; the cross-column rule
 * has never lived in SQL).
 */
export const TRACK_ROLES = ['narration', 'music', 'text', 'overlay'] as const;
export type TrackRole = (typeof TRACK_ROLES)[number];

/** The S165 kind-scoping rule, as one shared predicate for every enforcement layer. */
export function roleAllowedOnKind(role: TrackRole | null, kind: TrackKind): boolean {
  if (role === null) return true;
  return role === 'text' || role === 'overlay' ? kind === 'video' : kind === 'audio';
}

/** A dedicated text lane (S165) — video-kind, so the render graph is untouched. */
export function isTextTrack(track: Pick<SequenceTrack, 'kind' | 'role'>): boolean {
  return track.kind === 'video' && track.role === 'text';
}

/** A dedicated effects-overlay lane (S165 fix 2) — where effect clips live. */
export function isOverlayTrack(track: Pick<SequenceTrack, 'kind' | 'role'>): boolean {
  return track.kind === 'video' && track.role === 'overlay';
}

/** The narration-role track, falling back to the pre-role rule (lowest-order audio). */
export function narrationTrackOf(tracks: readonly SequenceTrack[]): SequenceTrack | null {
  const audio = tracks
    .filter((track) => track.kind === 'audio')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  return audio.find((track) => track.role === 'narration') ?? audio[0] ?? null;
}

/**
 * S170 — height follows what the lane draws (the CapCut model): filmstrip
 * lanes tall (spine and plain video lanes, 64), waveform lanes medium
 * (audio, 36), chip lanes slim (text and overlay, 28 — a T- or wand-chip
 * needs no more). The repository picks by kind/role at mint time; migration
 * 069 restamped lanes that still sat at a *default* height, leaving
 * hand-resized ones alone. The renderer clamp floor stays 24.
 */
export const DEFAULT_VIDEO_TRACK_HEIGHT_PX = 64;
export const DEFAULT_AUDIO_TRACK_HEIGHT_PX = 36;
export const DEFAULT_CHIP_TRACK_HEIGHT_PX = 28;

/**
 * Beta S160 — marker palette, as accent-token *names* (migration 066's CHECK
 * mirrors this list). Never hexes: the ruler resolves them through the theme,
 * the `WaveformCanvas` rule.
 */
export const MARKER_COLORS = ['ai', 'success', 'warning', 'info'] as const;
export type MarkerColor = (typeof MARKER_COLORS)[number];

/**
 * Beta S160 — a named moment in the cut (`M` in every NLE). Sequence-scoped,
 * deliberately not clip-scoped: a note about *time* must not move when a clip
 * is trimmed or vanish when a re-sync replaces one.
 */
export interface SequenceMarker {
  id: string;
  sequenceId: string;
  /** Sequence frames — rescaled by the fps-change rule like every stored frame count. */
  frame: number;
  name: string;
  color: MarkerColor;
  /**
   * Beta S233 — a sync point the cut must serve (R5): the preflight warns
   * about any non-cut boundary within ±{@link SYNC_LOCK_GUARD_FRAMES} frames.
   */
  locked: boolean;
}

/** S233 — half-width of a locked marker's guarded window, in frames. The cue sheet's ±8f rule. */
export const SYNC_LOCK_GUARD_FRAMES = 8;

export interface SequenceTrack {
  id: string;
  sequenceId: string;
  kind: TrackKind;
  /** Stacking order within the kind. Video: 0 is the bottom of the composite. */
  orderIndex: number;
  name: string;
  /**
   * Gap-free: starts derived from cumulative duration, `startFrames` unread.
   * Exactly migration 060's V1 rule, now an opt-in property rather than an
   * identity. Video only (`CHECK` in migration 062) — a magnetic audio track
   * would silently re-anchor every narration line whenever a preceding clip's
   * length changed.
   */
  magnetic: boolean;
  /** Refuses selection and every gesture. Not a render property. */
  locked: boolean;
  /**
   * **The speaker.** No audio from this track reaches the output.
   *
   * Beta S181 narrowed this. It used to mean "excluded from the output" on
   * both kinds — which on a video track meant *hidden*, because a video track
   * had no audio to silence. Once a video clip carries its own sound, one flag
   * cannot mean both, so visibility moved to {@link videoEnabled} and this
   * became the speaker on every kind. Premiere and Resolve draw exactly this
   * pair for the same reason.
   */
  muted: boolean;
  /**
   * **The eye.** Video tracks only; always `true` on an audio track, which has
   * nothing to show.
   *
   * Migration 071 seeds it from the old `muted` so a track the user had hidden
   * stays hidden — and deliberately leaves `muted` set as well, so a hidden
   * track keeps contributing nothing at all rather than suddenly becoming
   * audible on upgrade.
   */
  videoEnabled: boolean;
  heightPx: number;
  /**
   * Kind-scoped — see {@link TrackRole}: `narration`/`music` on audio,
   * `text` on video (never the spine), `null` is a plain track of its kind.
   */
  role: TrackRole | null;
}

/**
 * Tracks in display order: video tracks top-of-composite first, then audio
 * tracks in their own order — the vertical arrangement every NLE draws.
 */
export function tracksInDisplayOrder(tracks: readonly SequenceTrack[]): SequenceTrack[] {
  const video = tracks.filter((track) => track.kind === 'video').sort((a, b) => b.orderIndex - a.orderIndex);
  const audio = tracks.filter((track) => track.kind === 'audio').sort((a, b) => a.orderIndex - b.orderIndex);
  return [...video, ...audio];
}

/** The storyboard's track, by the sequence's explicit binding — never inferred. */
export function spineTrackOf(document: SequenceDocument): SequenceTrack | null {
  return document.tracks.find((track) => track.id === document.sequence.spineTrackId) ?? null;
}

/**
 * Beta S253 — the free video tracks the composite stacks over the spine.
 *
 * Extracted from `buildCompositeStage`, which still calls it, so that the
 * render **plan** and the stage itself cannot disagree about whether
 * `layers`/`composite` will run. A plan derived from a second copy of this
 * predicate would drift the first time either was edited, and the symptom — a
 * progress bar that stops at 60% or finishes at 140% — would point nowhere
 * near the cause.
 */
export function overlayTracksOf(document: SequenceDocument): SequenceTrack[] {
  return document.tracks
    .filter(
      (track) =>
        track.kind === 'video' &&
        track.id !== document.sequence.spineTrackId &&
        track.videoEnabled &&
        document.clips.some((clip) => clip.trackId === track.id),
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * Whether any effect clip will contribute to the adjustment-layer pass.
 *
 * The same single-source-of-truth argument as `overlayTracksOf`: this is the
 * `effects` stage's own guard, so the plan asks the guard rather than
 * re-deriving it. Deliberately a boolean and not the clip list — the plan
 * needs only "does this stage run", and the stage builds its own chains from
 * a `layoutTrack` pass the plan has no reason to repeat.
 */
export function hasEffectClips(document: SequenceDocument): boolean {
  return document.tracks.some(
    (track) =>
      track.kind === 'video' &&
      track.videoEnabled &&
      document.clips.some(
        (clip) => clip.trackId === track.id && clip.sourceKind === 'effect',
      ),
  );
}

/**
 * S154 phase 5 — `'text'` joined: a clip with no source file at all, whose
 * content lives in `effects.text` and whose pixels exist only at render
 * (`drawtext`) and in the preview's DOM. Still a clip — track, order,
 * duration, transition, everything — which is why it is a kind and not a
 * parallel table.
 *
 * S157 (owner item 7) — `'effect'` joined the same way: file-less, its
 * content in `effects.filters`, applied to **everything composited below it**
 * for its time window (an adjustment layer, CapCut's effect lane). It lives
 * on a free video-kind track, is excluded from the overlay stack, and renders
 * as one time-windowed filter pass after the composite.
 */
export const SEQUENCE_SOURCE_KINDS = ['still', 'video', 'audio', 'text', 'effect'] as const;
export type SequenceSourceKind = (typeof SEQUENCE_SOURCE_KINDS)[number];

/** The file-backed kinds — what the media pool browses and a probe can measure. */
export type MediaSourceKind = Exclude<SequenceSourceKind, 'text' | 'effect'>;

/**
 * Ken Burns, as a closed set of presets rather than a keyframe curve.
 *
 * A keyframe editor is a second timeline inside the timeline. These five cover
 * what a storyteller sequence actually needs, and each maps to one
 * `perspective` window in `still-motion.ts`.
 */
export const STILL_MOTION_PRESETS = ['none', 'zoom_in', 'zoom_out', 'pan_lr', 'pan_rl'] as const;
export type StillMotionPreset = (typeof STILL_MOTION_PRESETS)[number];

export const STILL_MOTION_LABELS: Record<StillMotionPreset, string> = {
  none: 'Hold',
  zoom_in: 'Zoom in',
  zoom_out: 'Zoom out',
  pan_lr: 'Pan left to right',
  pan_rl: 'Pan right to left',
};

/**
 * S154 phase 4 — the transitions library, every entry an `xfade` token away.
 *
 * `'crossfade'` keeps its stored name (mapping to xfade's `fade`), so **no
 * data migration** and the existing test pinning `transition=fade` passes
 * unchanged. A transition names how a clip arrives; it renders only where two
 * clips actually join — the magnetic spine — and the preflight names it as
 * ignored anywhere else.
 */
export const CLIP_TRANSITIONS = [
  'cut',
  'crossfade',
  'fade_black',
  'fade_white',
  // S230 — the editorial dissolve family. All of these blend, so all of
  // them run inside the linear-light wrap (`xfadePlanFor`); parameters ride
  // in `effects.transition` on the incoming clip.
  'blur_dissolve',
  'asymmetric_dissolve',
  'luma_dissolve',
  'additive_dissolve',
  'dip_to_color',
  /**
   * S237 — the match dissolve: registration points on the outgoing and
   * incoming stills, aligned by a decaying viewport nudge on the incoming
   * segment under a gamma-correct crossfade. How the young maple becomes
   * the old maple without reading as a slideshow.
   */
  'match_dissolve',
  /**
   * S230 — one to three frames of solid colour at the cut. Not an overlap
   * transition at all: the boundary stays a hard cut and the incoming
   * segment's first frames are painted (`drawbox`), so it spends no overlap
   * and holds nothing. Honoured from `transitionIn` only — the inspector
   * does not offer it as an out.
   */
  'flash_frame',
  'wipe_left',
  'wipe_right',
  'wipe_up',
  'wipe_down',
  'slide_left',
  'slide_right',
  'slide_up',
  'slide_down',
  'circle_open',
  'circle_close',
  'pixelize',
  'radial',
] as const;
export type ClipTransition = (typeof CLIP_TRANSITIONS)[number];

/** Our name → the ffmpeg `xfade` transition token. `cut` never reaches xfade. */
export const XFADE_NAME: Record<Exclude<ClipTransition, 'cut'>, string> = {
  crossfade: 'fade',
  fade_black: 'fadeblack',
  fade_white: 'fadewhite',
  // S230 — `custom` entries carry their expression via `xfadePlanFor`
  // (sequence-normalize.ts); the token here is what lands in the graph.
  blur_dissolve: 'hblur',
  asymmetric_dissolve: 'custom',
  luma_dissolve: 'custom',
  additive_dissolve: 'custom',
  dip_to_color: 'custom',
  // The blend is a plain gamma-correct fade; the *alignment* rides the
  // incoming segment's motion (composeMatchNudge), not the xfade.
  match_dissolve: 'fade',
  // Never reaches xfade — the join maps a flash boundary to a hard cut and
  // the incoming segment paints its own first frames. Placeholder only.
  flash_frame: 'fade',
  wipe_left: 'wipeleft',
  wipe_right: 'wiperight',
  wipe_up: 'wipeup',
  wipe_down: 'wipedown',
  slide_left: 'slideleft',
  slide_right: 'slideright',
  slide_up: 'slideup',
  slide_down: 'slidedown',
  circle_open: 'circleopen',
  circle_close: 'circleclose',
  pixelize: 'pixelize',
  radial: 'radial',
};

/**
 * Beta S234 — the menu taxonomy (audit C4). Twenty-two flat entries stopped
 * being a menu around twelve; the groups put the narrated-work vocabulary
 * first and the slideshow language last, without hiding anything. Order
 * within a group is presentation order.
 */
export const TRANSITION_GROUPS: { label: string; transitions: ClipTransition[] }[] = [
  {
    label: 'Essential',
    transitions: ['cut', 'crossfade', 'fade_black', 'fade_white', 'blur_dissolve'],
  },
  {
    label: 'Editorial',
    transitions: [
      'asymmetric_dissolve',
      'luma_dissolve',
      'additive_dissolve',
      'dip_to_color',
      'match_dissolve',
      'flash_frame',
    ],
  },
  {
    label: 'Advanced',
    transitions: [
      'wipe_left',
      'wipe_right',
      'wipe_up',
      'wipe_down',
      'slide_left',
      'slide_right',
      'slide_up',
      'slide_down',
      'circle_open',
      'circle_close',
      'pixelize',
      'radial',
    ],
  },
];

export const CLIP_TRANSITION_LABELS: Record<ClipTransition, string> = {
  cut: 'Cut',
  crossfade: 'Crossfade',
  fade_black: 'Dip to black',
  fade_white: 'Dip to white',
  blur_dissolve: 'Blur dissolve',
  asymmetric_dissolve: 'Asymmetric dissolve',
  luma_dissolve: 'Luma dissolve',
  additive_dissolve: 'Additive dissolve',
  dip_to_color: 'Dip to colour',
  match_dissolve: 'Match dissolve',
  flash_frame: 'Flash frame',
  wipe_left: 'Wipe left',
  wipe_right: 'Wipe right',
  wipe_up: 'Wipe up',
  wipe_down: 'Wipe down',
  slide_left: 'Slide left',
  slide_right: 'Slide right',
  slide_up: 'Slide up',
  slide_down: 'Slide down',
  circle_open: 'Circle open',
  circle_close: 'Circle close',
  pixelize: 'Pixelize',
  radial: 'Radial',
};

/**
 * Fields a user can override by hand, tracked per clip so storyboard re-sync
 * can refresh what they have not touched and leave the rest alone.
 *
 * Without this, re-sync is all-or-nothing: either it discards hand-tuned
 * durations or it stops refreshing re-approved stills. Per-field is what makes
 * both work, and the duration chip's provenance dot is this list made visible.
 */
export const CLIP_OVERRIDABLE_FIELDS = ['durationFrames', 'filePath', 'motionPreset', 'label'] as const;
export type ClipOverridableField = (typeof CLIP_OVERRIDABLE_FIELDS)[number];

export interface SequenceClip {
  id: string;
  sequenceId: string;
  /** Which {@link SequenceTrack} this clip sits on. */
  trackId: string;
  /** Position within the track. Contiguous from 0 after every mutation. */
  orderIndex: number;
  sourceKind: SequenceSourceKind;
  /** The `outputs` row this came from, when it came from the Library. */
  outputId?: string | null;
  /**
   * Which storyboard shot prefilled this clip.
   *
   * The key re-sync matches on. Matching by *position* is the failure Beta S43
   * wrote down: a writer inserting one shot at the top would shift every
   * subsequent clip onto the wrong media.
   */
  storyShotId?: string | null;
  /** Which take was approved when the prefill ran — lets re-sync spot a re-approval. */
  sourceTakeId?: string | null;
  /**
   * Resolved absolute path. Held directly so a Library trash does not orphan
   * the edit. **`null` for a text clip** (S154 phase 5) — the honest model,
   * chosen over a `''` sentinel so the type checker forces every consumer to
   * answer "what does this mean for a clip with no file".
   */
  filePath: string | null;
  /**
   * Absolute offset in frames — **free (non-magnetic) tracks only**.
   *
   * `null` on a magnetic track: there the clip's start is the cumulative
   * duration of everything before it, derived by `layoutTrack` so gaps cannot
   * exist and an accidental black frame is impossible.
   */
  startFrames?: number | null;
  durationFrames: number;
  /** Trim into the source. `null` for a still, which has no inherent length to trim. */
  sourceInFrames?: number | null;
  sourceOutFrames?: number | null;
  transitionIn: ClipTransition;
  transitionFrames: number;
  /**
   * Beta S227 — how this clip *leaves*. At an interior junction the incoming
   * clip's `transitionIn` wins when both sides speak
   * (`effectiveBoundaryTransition` is the one arbiter); on the last spine
   * clip this is the sequence's closing treatment, rendered as a fade inside
   * the clip's own tail. **Optional, and absent means `'cut'`** — the S181
   * posture: required would force every clip-minting site to restate a
   * default it has no opinion about. Read via `?? 'cut'`, never bare.
   */
  transitionOut?: ClipTransition;
  /** Frames the out-transition occupies. Absent means 0. */
  transitionOutFrames?: number;
  /**
   * Beta S230 — the split edit (J/L cut), for a **video clip's own audio**.
   * Negative extends the audio's head: it starts `|n|` frames before the
   * picture cut, playing source material from before the in-point (J).
   * Positive extends the tail past the picture cut into the next clip (L).
   * The picture never moves; only the audio window does. **Optional, absent
   * means 0** — the S181 posture. Meaningless on stills and audio clips
   * (drag the clip instead).
   */
  audioOffsetFrames?: number;
  motionPreset: StillMotionPreset;
  /**
   * Level, in dB. Applies to **any clip that carries sound** — which since
   * Beta S181 includes a video clip's own audio, not just an audio clip's.
   */
  gainDb: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  /**
   * Beta S181 — whether a video clip's own audio reaches the mix.
   *
   * `true` on every new clip, and on every clip that predates the column,
   * because **audible at unity is what every NLE does on import** (Premiere,
   * Resolve, FCP, CapCut all agree) and because the alternative is what this
   * step exists to fix: video audio was hardcoded away in both the preview
   * (`<video muted>`) and the export (which collected audio *tracks* only),
   * so the app silently discarded content the user had imported — and the
   * monitor and the exported file disagreed about it.
   *
   * Distinct from `gainDb` at its floor on purpose: "the user muted this" and
   * "the level happens to be low" are different states, and only the first
   * should survive a gain adjustment. Meaningless on an audio clip, whose
   * track's own `muted` already answers this — see {@link SequenceTrack.muted}.
   *
   * **Optional, and absent means enabled.** Read it as `!== false`, never as a
   * bare truthiness test. Required would have forced every clip-construction
   * site in the app — most of them minting text, effect or audio clips, where
   * this means nothing — to restate a default they have no opinion about, and
   * a site that forgot would have silenced a clip rather than failed loudly.
   * The repository writes `?? true` for the same reason.
   */
  sourceAudioEnabled?: boolean;
  /**
   * Beta S181 — keeps this clip's audio out of the sidechain duck.
   *
   * Video audio joins the **bed** side by default (it ducks under narration
   * like music), because the common case here is a generated clip with
   * ambience under a TTS voiceover. That default is wrong for source
   * dialogue, which should sit at its own level rather than dip under the
   * narration — hence the per-clip escape hatch rather than a global rule.
   */
  duckExempt?: boolean;
  label: string;
  /** @see CLIP_OVERRIDABLE_FIELDS */
  overrides: ClipOverridableField[];
  /**
   * S154 phase 3 — colour correction and speed (`ClipEffects` in
   * `utils/timeline/effects.ts`, persisted as `effects_json`). Absent means
   * neutral, and neutral emits byte-identical render args to pre-phase-3.
   */
  effects?: ClipEffects;
  /**
   * S154 phase 6 — animation curves, **clip-relative** frames (see
   * `utils/timeline/keyframes.ts` for why). Persisted in their own table
   * (`sequence_clip_keyframes`, migration 064) because `frame` is a frame
   * column the fps rescale must reach with one `UPDATE` — but they ride the
   * clip on the wire, whole-document like everything else.
   */
  keyframes?: ClipKeyframe[];
}

export interface Sequence {
  id: string;
  projectId: string;
  /** Normally set — a sequence is created from an episode's storyboard. */
  storyEpisodeId?: string | null;
  /**
   * Beta S258 — **which story folder** that episode belongs to.
   *
   * The missing half of S151 H1's binding. An episode id is unique only inside
   * one story project, so on its own it can be resolved against whichever story
   * the peek happened to pick — and when it resolves to nothing, the Timeline
   * could not even name what it was looking for ("a storyboard that is not
   * available"). With the folder recorded, an unresolvable binding becomes a
   * named story with a Relink action instead of a dead end.
   *
   * Nullable and optional: sequences created before this carry none, and a
   * folder is never guessed for them — binding a timeline to the wrong story
   * silently is worse than binding it to none. Same keep/unbind lifecycle as
   * {@link storyEpisodeId}: `undefined` keeps, `null` unbinds.
   */
  storyProjectRoot?: string | null;
  /**
   * Beta S154 — which track the storyboard owns. `magnetic` is layout
   * behaviour; this is a different fact and both are stored: deriving one
   * from the other breaks the moment a user marks a second track magnetic or
   * un-magnetizes the spine for hand work. Same keep/unbind lifecycle as
   * {@link storyEpisodeId} (S151 H1): `undefined` keeps, `null` unbinds.
   */
  spineTrackId?: string | null;
  /**
   * Beta S222 — which number a **still** takes its length from. See
   * {@link STILL_DURATION_SOURCES}. Absent means {@link DEFAULT_STILL_DURATION_SOURCE},
   * which is the pre-S222 behaviour exactly.
   */
  stillDurationSource?: StillDurationSource;
  /** Beta S222 — the numbers a JSON/CSV import supplied. `null` clears them. */
  stillDurations?: ImportedStillDurations | null;
  /**
   * Beta S474 — which of a shot's stills the spine shows. See
   * {@link STILL_FRAME_SOURCES}. Absent means {@link DEFAULT_STILL_FRAME_SOURCE},
   * which is the pre-S474 behaviour exactly.
   */
  stillFrameSource?: StillFrameSource;
  name: string;
  fps: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceDocument {
  sequence: Sequence;
  /** Ordered by `(kind, orderIndex)` — see {@link tracksInDisplayOrder} for the visual order. */
  tracks: SequenceTrack[];
  clips: SequenceClip[];
}

/**
 * Frame rates offered in sequence settings.
 *
 * Seeded from the first clip's measured `ClipProbe.fps` and overridable.
 * 24 is the default because it is what the storyboard's stills have no opinion
 * about and what a narrative cut conventionally runs at.
 */
export const SEQUENCE_FPS_OPTIONS = [24, 25, 30] as const;
export const DEFAULT_SEQUENCE_FPS = 24;
export const DEFAULT_SEQUENCE_WIDTH = 1920;
export const DEFAULT_SEQUENCE_HEIGHT = 1080;

/**
 * Beta S227 — transition length is a real control, quantised in frames.
 *
 * The S154 control was a fixed three-option seconds list; a 0.5s dissolve
 * between two details and a 2s dissolve into a memory are different
 * punctuation marks, and the fixed list made them the same one. Frames, not
 * seconds, because frames are what the document holds everywhere else; the
 * step keeps a wheel/arrow adjustment from landing on half-frame values.
 * 4f is the floor a dissolve reads at all; 48f (2s at 24fps) is the ceiling
 * past which a dissolve is a scene in itself.
 */
export const TRANSITION_FRAMES_MIN = 4;
export const TRANSITION_FRAMES_MAX = 48;
export const TRANSITION_FRAMES_STEP = 2;
/** The default a fresh transition gets: 12f = 0.5s at 24fps, the old list's middle option. */
export const TRANSITION_FRAMES_DEFAULT = 12;

export function quantizeTransitionFrames(frames: number): number {
  const clamped = Math.min(
    TRANSITION_FRAMES_MAX,
    Math.max(TRANSITION_FRAMES_MIN, Math.round(frames)),
  );
  return Math.round(clamped / TRANSITION_FRAMES_STEP) * TRANSITION_FRAMES_STEP;
}

/** Beyond this a still with no narration under it is dead air; the preflight says so rather than clamping. */
export const LONG_STILL_WARNING_SECONDS = 15;

/**
 * Beta S222 — where a still's timeline length comes from.
 *
 * The owner's report: every storyboard still lands on the spine at 4, 6, 8 or
 * 10 seconds, and the script's own timings are gone. That is real and it has a
 * single cause. A shot minted by the script canvas gets
 * `durationSeconds = estimateClipSeconds(scriptText)`, and `estimateClipSeconds`
 * caps the reading at 8s and then **snaps it onto `CLIP_SECONDS_GRID`** —
 * `[4, 6, 8, 10]`, the duration pill Omni Flash exposes. That is right for a
 * *render*: those are the only lengths Flow will produce. It is wrong for a
 * *still*, which has no buckets at all and can legally hold for 6.44s.
 *
 * So the fix is not to un-snap `durationSeconds` — the render needs it — but to
 * let the timeline read a different number. Three, named by what they read
 * rather than by an adjective, because a heuristic that guessed "this 6 looks
 * snapped" would be wrong for every episode whose JSON genuinely said 6:
 *
 * - `'shot'` — `StoryShot.durationSeconds`, the shot's stated intent. The
 *   default and the pre-S222 behaviour. Exact when the shot came from an
 *   episode import that stated `durationSeconds: 6.44`; on the 4/6/8/10 grid
 *   when the script canvas estimated it.
 * - `'script'` — `StoryShot.estimatedDurationSeconds`, the reading of the
 *   prose that `estimateClipSeconds` snapped. Uncapped and ungridded: this is
 *   the "original extracted duration" before rounding.
 * - `'file'` — {@link ImportedStillDurations}, from a JSON or CSV the user
 *   picked. Wins for the shots it names; the rest fall back to `'shot'`.
 *
 * Never `Sequence`-wide arithmetic and never a clamp — `LONG_STILL_WARNING_SECONDS`
 * already names a still that holds too long, and the user decides.
 */
export const STILL_DURATION_SOURCES = ['shot', 'script', 'file'] as const;
export type StillDurationSource = (typeof STILL_DURATION_SOURCES)[number];

/** Pre-S222 behaviour, which is what a sequence with no stored preference must keep. */
export const DEFAULT_STILL_DURATION_SOURCE: StillDurationSource = 'shot';

/**
 * Beta S474 — which of a shot's stills the spine takes its **picture** from.
 *
 * The other axis from {@link STILL_DURATION_SOURCES}: that one chooses a
 * shot's *length*, this one chooses which of its approved pictures the clip
 * shows. Both are sequence facts for the same reason — the ambient re-sync
 * re-derives every spine still from them, so a renderer-local toggle would be
 * undone by the next diff it triggered.
 *
 * - `'start'` — the shot's approved first frame (`storyboardTakes`). The
 *   default and the pre-S474 behaviour.
 * - `'hero'` — the shot's hero panel, the composition the prompt was written
 *   from (S386). On a shot whose hero **reads through** (`keyStillSource`
 *   absent or `'in'`) this resolves back to the first frame, because there is
 *   no separate picture to resolve to — see `renderFrameForShot`. That is what
 *   makes flipping this control a no-op on every episode that predates S386
 *   rather than an empty pool.
 *
 * The end frame is deliberately absent. `ShotFrame` has three values and the
 * strip exists, but an end frame can be *borrowed* from the next shot, so
 * offering it means walking neighbour links that neither value here needs.
 */
export const STILL_FRAME_SOURCES = ['start', 'hero'] as const;
export type StillFrameSource = (typeof STILL_FRAME_SOURCES)[number];

/** Pre-S474 behaviour, which is what a sequence with no stored preference must keep. */
export const DEFAULT_STILL_FRAME_SOURCE: StillFrameSource = 'start';

/**
 * Beta S222 — durations a user imported, resolved to shot ids at import time.
 *
 * Keyed by `StoryShot.id` rather than by whatever the file said, so the
 * matching question ("is this row's `id` a shot id, a heading, or an ordinal?")
 * is answered once, in front of the user, instead of being re-guessed on every
 * layout. `fileName` is for the panel to name the source; the file itself is
 * never re-read — a timeline must not depend on a path outside the project.
 */
export interface ImportedStillDurations {
  fileName: string;
  importedAt: string;
  /** Shot id → seconds. Always finite and > 0; the parser drops anything else. */
  secondsByShotId: Record<string, number>;
}

/** Waveform resolution. One canvas per lane redraws from these, so it is a cache size, not a display width. */
export const PEAK_BUCKET_COUNT = 2048;

// ---------------------------------------------------------------- rendering

/**
 * S154 phase 2 — `layers` (one alpha layer per populated free video track)
 * and `composite` (spine + layers, one z-ordered graph) joined the pipeline.
 * Both are skipped entirely when a sequence has one video track, which is
 * every sequence that existed before this phase — the fast path is untouched.
 */
export type SequenceRenderStage =
  | 'normalize'
  | 'join'
  | 'layers'
  | 'composite'
  /** S157 — the adjustment-layer pass; runs only when effect clips exist. */
  | 'effects'
  | 'audio'
  | 'mux'
  /** S286 — the delivery conversion; runs only when `format` is not mp4. */
  | 'transcode';

export interface SequenceRenderProgress {
  sequenceId: string;
  stage: SequenceRenderStage;
  /** Completed units in this stage. `total` is 0 for stages that are one pass. */
  completed: number;
  total: number;
  /** What is being worked on right now — a clip label, for the UI to name. */
  detail?: string;
  /**
   * Beta S253 — the stages this render will actually run, in order.
   *
   * Repeated on **every** event rather than announced once at the start, and
   * that is the whole design: a separate "plan" event would be a second
   * channel to wire, a schema to validate, and an ordering race where a UI
   * that subscribed late gets progress it cannot place. Carrying it costs a
   * seven-element array of short strings per event.
   *
   * Needed because half the stages are conditional — `layers`/`composite`
   * only when a free video track holds a clip, `effects` only when an effect
   * clip exists — so without it a global bar cannot know whether `join` is
   * two stages from the end or four, and jumps when it guesses wrong.
   */
  plan?: readonly SequenceRenderStage[];
}

/**
 * How far through the whole export this event is, in `0..1`.
 *
 * Lives in `@shared` because two very different consumers need the **same**
 * number: the export panel's bar, and the main process's taskbar/dock
 * progress. Two implementations of this would drift, and a taskbar that
 * disagrees with the window it belongs to reads as a bug in both.
 *
 * Each planned stage is one equal slice. Deliberately not weighted by
 * measured stage cost: those weights differ by encoder (a hardware encode
 * shrinks the encode-bound stages and not the filter-bound ones), by source
 * resolution, and by how many clips carry transitions — so a weighted bar is
 * wrong in a way that varies per machine, where an even one is wrong in a way
 * that is at least the same everywhere. The elapsed-vs-fraction estimator
 * downstream self-corrects for the difference; a bar that jumps backwards
 * does not.
 *
 * Returns 0 when there is no plan, which is the pre-S253 shape and reads as
 * "indeterminate" to every caller.
 */
export function renderProgressFraction(progress: SequenceRenderProgress): number {
  const plan = progress.plan;
  if (!plan || plan.length === 0) return 0;
  const index = plan.indexOf(progress.stage);
  if (index < 0) return 0;
  const within =
    progress.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
  return Math.min(1, Math.max(0, (index + within) / plan.length));
}

/** S157 — export quality tiers. `good` is the pre-S157 ladder verbatim; `draft` stays its own flag. */
export const RENDER_QUALITIES = ['good', 'high'] as const;
export type RenderQuality = (typeof RENDER_QUALITIES)[number];

/**
 * Beta S248 — whether an export may use the machine's video hardware.
 *
 * Two states, not a menu of encoder names: which hardware encoder is best is
 * a fact about the machine that a probe already answers better than a person
 * can, and offering `h264_qsv` on a box that has no Intel GPU is a control
 * that cannot work. `'auto'` (the default, and what an absent field means)
 * takes the best encoder the bundled ffmpeg reports **and can actually open**;
 * `'off'` pins the render to libx264, which is the pre-S248 behaviour exactly.
 */
export const RENDER_ACCELERATIONS = ['auto', 'off'] as const;
export type RenderAcceleration = (typeof RENDER_ACCELERATIONS)[number];

/**
 * Beta S248 — the encoder a render resolved to, named so the UI can say it.
 *
 * A plain `string` id rather than the main process's `VideoEncoder` union on
 * purpose: `@shared` must not learn about `src/main/media/watermark-args.ts`,
 * and the renderer's only need is a truthful label. `hardware: false` with a
 * `label` of `'x264'` is the ordinary answer on a machine with no GPU — not
 * an error state.
 */
export interface RenderEncoderInfo {
  /** The ffmpeg encoder name: `'h264_nvenc'`, `'h264_videotoolbox'`, `'libx264'`, … */
  encoderId: string;
  /** Short human name for a control or a toast: `'NVENC'`, `'VideoToolbox'`, `'x264'`. */
  label: string;
  hardware: boolean;
  /**
   * The `-hwaccel` value decode passes carry, or `null` for software decode.
   * Always `'auto'` when set — see `hwaccelArgs` for why the explicit method
   * names are deliberately not used.
   */
  hwaccelId: string | null;
}

/** S157 — AAC bitrates offered at the mux. 192 is the pre-S157 hardcoded value. */
export const RENDER_AUDIO_BITRATES = [128, 192, 256] as const;
export type RenderAudioBitrate = (typeof RENDER_AUDIO_BITRATES)[number];

/**
 * S286 — delivery containers the export can write. `'mp4'` (and an absent
 * field) is the pre-S286 pipeline exactly; everything else renders the same
 * mp4 master first and converts it in a final `transcode` stage, so every
 * export option (resolution, quality, ducking) applies identically to all of
 * them. `'png'` is a numbered frame sequence (`name_00001.png…`) beside the
 * chosen path; `'gif'`/`'apng'`/`'png'` carry no audio by nature.
 */
export const RENDER_DELIVERY_FORMATS = ['mp4', 'gif', 'webm', 'apng', 'png'] as const;
export type RenderDeliveryFormat = (typeof RENDER_DELIVERY_FORMATS)[number];

export interface SequenceRenderRequest {
  sequenceId: string;
  /** Absolute path of the file to write. */
  outputPath: string;
  /** Half-height draft for a truthful-but-fast look at transitions and ducking. */
  draft?: boolean;
  /** Duck A2 under A1 with the sidechain values `video-editor.ts` already carries. */
  duckMusicUnderNarration?: boolean;
  /**
   * S157 — scale the finished picture to this height at the mux (width keeps
   * the sequence's aspect). Absent = the sequence's own geometry, `-c:v copy`.
   */
  outputHeight?: number;
  /** S157 — encode tier for every x264 pass. Absent = `'good'`, the pre-S157 args. */
  quality?: RenderQuality;
  /** S157 — the mux's AAC bitrate. Absent = 192, the pre-S157 value. */
  audioBitrateKbps?: RenderAudioBitrate;
  /** S248 — hardware encode/decode. Absent = `'auto'`. */
  acceleration?: RenderAcceleration;
  /**
   * S157 — write the mixed audio bed alone (`.m4a`), no picture. Duck and
   * bitrate apply; the video stages never run.
   */
  audioOnly?: boolean;
  /** S286 — delivery container. Absent = `'mp4'`, the pre-S286 output exactly. */
  format?: RenderDeliveryFormat;
}

export interface SequenceRenderResult {
  outputPath: string;
  durationSeconds: number;
  /** Clips skipped because their source vanished between preflight and render. */
  skipped: string[];
  /**
   * S248 — the encoder that actually ran, including after a hardware encoder
   * was found unusable and the render fell back. Absent for an audio-only
   * export, which encodes no picture and would otherwise have to name a video
   * encoder it never opened.
   */
  encoder?: RenderEncoderInfo;
}

/**
 * Beta S151 (G) — one file the Bin's "Add files…" picker returned, already
 * measured. The probe happens in the same IPC call as the dialog so the file
 * reaches the timeline with a real duration — the module's standing rule that
 * an audio or video length is a measurement, never a guess.
 */
export interface PickedMediaFile {
  path: string;
  kind: SequenceSourceKind;
  /** Basename without extension — the clip label the drop will carry. */
  label: string;
  /** Measured. `null` for a still (a picture has no inherent length) and for a file the probe could not read. */
  durationSec: number | null;
}

/**
 * Beta S180 — the extensions the media pool browses, by kind.
 *
 * One definition, because three places have to agree on it and disagreeing is
 * silent: the pick dialog's filters, the OS-drop guard in the renderer, and
 * the main-process verification that guard cannot be trusted to have done.
 * It previously lived only in `FilesPane`, where the main process could not
 * see it.
 */
export const MEDIA_IMPORT_EXTENSIONS: Record<MediaSourceKind, readonly string[]> = {
  still: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'tif', 'avif', 'svg', 'ico'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'ts', 'm4v', '3gp', 'mpeg', 'mpg'],
  audio: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'wma', 'opus', 'aiff', 'aif', 'ac3', 'mka'],
};

/**
 * Which pool kind a path belongs to, or `null` for a file the pool does not
 * browse. Extension-only — a drop carries no other signal, and this is the
 * check that decides both what a drop becomes and what the main process will
 * agree to record.
 */
export function mediaKindForPath(filePath: string): MediaSourceKind | null {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  for (const kind of ['still', 'video', 'audio'] as const) {
    if (MEDIA_IMPORT_EXTENSIONS[kind].includes(extension)) return kind;
  }
  return null;
}

/**
 * Beta S180 — one imported file, as the app has **recorded** it (migration
 * 070's `sequence_media`), not merely as a picker once returned it.
 *
 * The record is what makes an import work at all, which is worth stating
 * plainly because the type looks like bookkeeping: `media://` serves a file
 * only when it is inside the managed directory or named by the data-derived
 * allowlist in `bootstrap.ts`, and an imported file is by definition neither
 * until a row here says so. Before S180 the picked list lived in React state,
 * so every imported still, video and audio 403'd — the tile poster, the
 * program monitor and the `<audio>` elements all went dark while the ffmpeg
 * export, which reads the path straight off disk, still contained them.
 *
 * Still a *reference*: nothing is copied, and `filePath` remains the
 * document's source of truth. The row is a grant plus a bin entry, not a
 * managed asset — which is why removing one never touches the file.
 */
export interface ImportedMediaFile {
  id: string;
  projectId: string;
  path: string;
  /** Only the file-backed kinds are importable — a text or effect clip has no file. */
  kind: MediaSourceKind;
  /** Basename without extension — the clip label a drop from this tile carries. */
  label: string;
  /** Measured at import. `null` for a still, and for a file the probe could not read. */
  durationSec: number | null;
  importedAt: string;
  /**
   * How many `sequence_clips` rows across the project reference this path, and
   * the sequences they sit in. Carried on the list so the pane can offer
   * "Remove unused" and name the cost of a removal without a second round trip.
   */
  usage: ImportedMediaUsage;
  /**
   * Beta S353 — migration 101's stamp, **raw**: what was recorded, not a
   * verdict about the file as it stands now.
   *
   * An imported file is a reference to a path on the user's own disk, so it can
   * change without the app hearing about it. `isCleanStampCurrent` is what
   * turns this into an answer, and it needs the file's current size and mtime —
   * which only the main process has. Handing the renderer a bare boolean here
   * would be handing it a claim that was true at import time and may not be
   * now; handing it the stamp keeps the staleness visible to whoever checks.
   */
  cleaned?: WatermarkCleanedStamp;
}

/** Where one imported file is currently used. See {@link ImportedMediaFile.usage}. */
export interface ImportedMediaUsage {
  clipCount: number;
  /** Distinct sequence names, ordered, for the confirm copy. */
  sequenceNames: string[];
}

/**
 * The outcome of a removal — reported rather than assumed, because the
 * interesting case is the one the caller did not ask about: a path that was
 * still on a timeline.
 */
export interface RemoveImportedMediaResult {
  /** Paths whose `sequence_media` row is gone. */
  removed: string[];
  /** Clips deleted alongside them. Zero unless `deleteClips` was set. */
  deletedClipCount: number;
  /** Clip IDs deleted alongside them. Empty unless `deleteClips` was set. */
  deletedClipIds?: string[];
  /**
   * Paths left alone because they were still in use and `deleteClips` was not
   * set. The caller re-asks with the flag, or does not.
   */
  blocked: ImportedMediaFile[];
}

/**
 * Beta S182 — one video source's filmstrip, as a sprite sheet the lane slices
 * by arithmetic.
 *
 * Describes the **file**, not the clip: two clips trimmed out of one source
 * share a sheet, a trim changes which tiles are drawn rather than
 * invalidating anything, and zoom changes how many. Only a re-encode
 * invalidates it, which the cache key (path + size + mtime) detects.
 *
 * Every geometry number is carried rather than derived, because the renderer
 * maps a clip pixel column to a tile *without decoding the image* — it needs
 * the layout before it has the pixels.
 */
export interface FilmstripSheet {
  /** `media://` URL of the sheet, already inside the managed root. */
  url: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  /** Tiles actually present. The last row may be short of `columns`. */
  frameCount: number;
  /** Seconds of source between consecutive tiles. */
  intervalSec: number;
}

// ---------------------------------------------------------------- preflight

export type PreflightSeverity = 'blocking' | 'warning';

export const PREFLIGHT_CODES = [
  'shot_not_approved',
  'source_missing',
  'long_still_no_narration',
  'narration_overruns_still',
  'geometry_mismatch',
  'stale_approval',
  'empty_sequence',
  /**
   * Beta S154 phase 2 — a free video track ends after the spine does, so the
   * composite extends the spine with black (`tpad`) to keep the overlay.
   * A warning, not a block: a title that outlives the last shot may be the
   * intent, and the black tail is named rather than silently produced.
   */
  'overlay_past_spine',
  /**
   * Beta S154 phase 4 — a transition set on a clip whose track has no joins.
   * `xfade` needs an overlapping junction, which only the magnetic spine
   * produces; on a free track the transition is ignored and this names it.
   * Report, never silently fix.
   */
  'transition_without_overlap',
  /**
   * Beta S227 — a boundary where the outgoing clip's `transitionOut` and the
   * incoming clip's `transitionIn` are both non-cut. The incoming side wins
   * (`effectiveBoundaryTransition`), and this names the loser rather than
   * letting two authored intentions silently become one.
   */
  'conflicting_boundary_transition',
  /**
   * Beta S229 — a moving still whose source cannot afford the move: at the
   * deepest zoom the cover-fit window would sample fewer source pixels than
   * the canvas shows, i.e. a visible upscale on faces and text (§3.5's
   * guard). Reported with the achievable travel; never silently softened.
   *
   * Beta S239 narrowed it to sources that are **at least** canvas-sized. A
   * source smaller than the canvas upscales at rest, which is a property of
   * the source and not of the move — that is `source_below_canvas` below,
   * and separating them is what makes the achievable-travel readout here
   * reachable at all.
   */
  'motion_source_too_small',
  /**
   * Beta S239 — one or more stills are smaller than the sequence canvas, so
   * they are enlarged whether they move or not.
   *
   * **Sequence-level and aggregated**: one finding for the whole document,
   * carrying no `clipId`. The condition is a property of the project (a cut
   * of 1376×768 Flow stills on a 1920×1080 canvas is every clip at once),
   * and restating it per clip buried the two blocking findings that were the
   * only things actually stopping the owner's export — 110 of 113 findings,
   * 2026-08-22.
   *
   * Counts held stills too, deliberately. `motion_source_too_small` cannot:
   * `hold` resolves to no curve. And `geometry_mismatch` cannot either — it
   * is computed for `sourceKind === 'video'` only — so before this code an
   * undersized still that held was silent while the identical still drifting
   * warned.
   */
  'source_below_canvas',
  /**
   * Beta S230 — a J-cut lead that pokes before the sequence's own start:
   * the audio graph clamps it at zero, so the lead is silently shorter than
   * authored. Named rather than fixed.
   */
  'audio_lead_clipped',
  /**
   * Beta S233 — a transition whose window touches the ±8f guard around a
   * locked marker — the frame the sound design was built to hit would smear.
   */
  'transition_near_locked_marker',
  /**
   * Beta S234 — three or more consecutive spine clips moving the same way
   * (§5.4): consecutive identical pushes read as a stutter, and the fix is
   * one clip's direction, not a re-edit.
   */
  'repeated_motion_run',
  /**
   * Beta S234 — a dissolve longer than 24f spanning a scene-run boundary
   * (part 8): in this grammar a scene change is a cut, and a long dissolve
   * belongs inside a run, not across one.
   */
  'dissolve_crosses_scene_run',
  /**
   * Beta S237 — a resolved move faster than the un-overridable comfort cap
   * (2 %/s). Only an authored reframe can get here — every rate-driven
   * preset is capped at resolve time — and the answer is a warning, never a
   * clamp: a reframe is a deliberate composition.
   */
  'motion_rate_exceeded',
  /**
   * Beta S353 — sources in this cut are **not known** to have had the Flow
   * watermark removed.
   *
   * **Sequence-level and aggregated**, for `source_below_canvas`'s reason: it
   * is a property of the project's media, and restating it per clip would bury
   * every finding that actually stops an export.
   *
   * Read the name precisely. The app cannot tell a marked file from an unmarked
   * one without running the detector, which Phase 0 measured at 2.7-7.9 s per
   * still — minutes to render one label. So this counts what the app has no
   * *record* of cleaning, and the message says so. It is a warning, never
   * blocking, and never a fix: cleaning rewrites or duplicates the user's files
   * and is its own press, which is the S235 posture and the reason
   * `ClipExportMenu` states the same thing at the same moment rather than
   * acting on it.
   */
  'source_watermarked',
] as const;
export type PreflightCode = (typeof PREFLIGHT_CODES)[number];

export interface PreflightFinding {
  code: PreflightCode;
  severity: PreflightSeverity;
  /** Human-readable, already resolved to names — the UI renders it verbatim. */
  message: string;
  clipId?: string;
  storyShotId?: string;
}
