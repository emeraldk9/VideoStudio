import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import {
  CLIP_OVERRIDABLE_FIELDS,
  CLIP_TRANSITIONS,
  DEFAULT_AUDIO_TRACK_HEIGHT_PX,
  DEFAULT_CHIP_TRACK_HEIGHT_PX,
  DEFAULT_SEQUENCE_FPS,
  DEFAULT_SEQUENCE_HEIGHT,
  DEFAULT_SEQUENCE_WIDTH,
  DEFAULT_STILL_DURATION_SOURCE,
  DEFAULT_STILL_FRAME_SOURCE,
  DEFAULT_VIDEO_TRACK_HEIGHT_PX,
  KEYFRAME_INTERPOLATIONS,
  KEYFRAME_PROPERTIES,
  normalizeFps,
  parseClipEffects,
  roleAllowedOnKind,
  STILL_DURATION_SOURCES,
  STILL_FRAME_SOURCES,
  TRACK_ROLES,
  type ClipKeyframe,
  type ClipOverridableField,
  type ClipTransition,
  type ImportedMediaFile,
  type ImportedMediaUsage,
  type ImportedStillDurations,
  type MarkerColor,
  type MediaSourceKind,
  type RemoveImportedMediaResult,
  type Sequence,
  type SequenceClip,
  type SequenceDocument,
  type SequenceMarker,
  type SequenceSourceKind,
  type SequenceTrack,
  type StillDurationSource,
  type StillFrameSource,
  type StillMotionPreset,
  type TrackKind,
  type TrackRole,
} from '@shared';
import type { WatermarkCleanedStamp, WatermarkEngine } from '@shared/types/watermark';

/**
 * Beta S145 — the Timeline Editor's document store (migration 060).
 *
 * Clips are written **whole-list per sequence, inside one transaction**, never
 * patched individually. `orderIndex` has to stay contiguous within a lane and
 * a single move touches every clip after it, so a granular API would be a
 * burst of writes with a briefly inconsistent document in the middle. The
 * renderer holds the document anyway and the lists are small (a long episode
 * is a few hundred rows), which makes replace-all both simpler and safer.
 */

interface SequenceRow {
  id: string;
  project_id: string;
  story_episode_id: string | null;
  /** Beta S258 — migration 085. Null on every sequence created before it; never backfilled. */
  story_project_root: string | null;
  spine_track_id: string | null;
  still_duration_source: string | null;
  still_frame_source: string | null;
  still_durations_json: string | null;
  name: string;
  fps: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

interface TrackRow {
  id: string;
  sequence_id: string;
  kind: string;
  order_index: number;
  name: string;
  magnetic: number;
  locked: number;
  muted: number;
  video_enabled: number;
  height_px: number;
  role: string | null;
}

interface ClipRow {
  id: string;
  sequence_id: string;
  track_id: string;
  order_index: number;
  source_kind: string;
  output_id: string | null;
  story_shot_id: string | null;
  source_take_id: string | null;
  file_path: string;
  start_frames: number | null;
  duration_frames: number;
  source_in_frames: number | null;
  source_out_frames: number | null;
  transition_in: string;
  transition_frames: number;
  transition_out: string;
  transition_out_frames: number;
  audio_offset_frames: number;
  motion_preset: string;
  gain_db: number;
  fade_in_frames: number;
  fade_out_frames: number;
  source_audio_enabled: number;
  duck_exempt: number;
  label: string;
  overrides_json: string;
  effects_json: string;
}

interface KeyframeRow {
  clip_id: string;
  property: string;
  frame: number;
  value: number;
  interpolation: string;
}

/**
 * Parses the override list defensively.
 *
 * The column is JSON written by this app, but a hand-edited database or a
 * future field rename should degrade to "nothing is overridden" rather than
 * throwing while a document loads. The consequence of being wrong here is that
 * a re-sync offers to refresh a field the user had pinned — recoverable, and
 * visible in the diff before it applies.
 */
function parseOverrides(json: string): ClipOverridableField[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is ClipOverridableField =>
      CLIP_OVERRIDABLE_FIELDS.includes(value as ClipOverridableField),
    );
  } catch {
    return [];
  }
}

interface MarkerRow {
  id: string;
  sequence_id: string;
  frame: number;
  name: string;
  notes?: string | null;
  color: string;
  created_at: string;
  locked: number;
}

/** Migration 070's `sequence_media` — see the imported-media section below. */
interface MediaRow {
  id: string;
  project_id: string;
  file_path: string;
  kind: string;
  label: string;
  duration_sec: number | null;
  imported_at: string;
  /** Migration 101's four cleanliness columns. All-or-nothing: see `toCleanStamp`. */
  cleaned_at: string | null;
  cleaned_engine: string | null;
  cleaned_size: number | null;
  cleaned_mtime_ms: number | null;
}

/**
 * The four stamp columns as one value, or `undefined`.
 *
 * A stamp is only a stamp when all four are present. A partial row — cleaned
 * with no identity — cannot be validated against the file, and an unvalidatable
 * stamp reads as *unknown*, which is what `undefined` means to every consumer.
 * Returning a partial object instead would let `isCleanStampCurrent` be handed
 * a `NaN` size and answer `false` for a subtly different reason, which is
 * harder to debug than not answering at all.
 */
function toCleanStamp(row: MediaRow): WatermarkCleanedStamp | undefined {
  if (
    row.cleaned_at === null ||
    row.cleaned_engine === null ||
    row.cleaned_size === null ||
    row.cleaned_mtime_ms === null
  ) {
    return undefined;
  }
  return {
    at: row.cleaned_at,
    // The zod layer owns the range of engine names (078's rule), so the column
    // is an unconstrained TEXT and the cast narrows what was written by us.
    engine: row.cleaned_engine as WatermarkEngine,
    size: row.cleaned_size,
    mtimeMs: row.cleaned_mtime_ms,
  };
}

/**
 * `usage` is absent when nothing on any timeline references the path — the
 * common case for a file just imported, and the case "Remove unused" selects
 * on, so it is materialized as an explicit zero rather than left undefined.
 */
function toImportedMedia(row: MediaRow, usage: ImportedMediaUsage | undefined): ImportedMediaFile {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.file_path,
    // The CHECK in migration 070 guarantees membership; the cast narrows it.
    kind: row.kind as MediaSourceKind,
    label: row.label,
    durationSec: row.duration_sec,
    importedAt: row.imported_at,
    usage: usage ?? { clipCount: 0, sequenceNames: [] },
    ...(toCleanStamp(row) ? { cleaned: toCleanStamp(row) } : {}),
  };
}

function toMarker(row: MarkerRow): SequenceMarker {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    frame: row.frame,
    name: row.name,
    notes: row.notes ?? '',
    // The CHECK in migration 066 guarantees membership; the cast narrows it.
    color: row.color as MarkerColor,
    locked: row.locked === 1,
  };
}

/**
 * S222 — an unknown string reads back as the default rather than throwing.
 * A stored value outside the set means a row from a newer build (or a
 * hand-edited database), and refusing to open the timeline over it would turn
 * a cosmetic preference into an unopenable document.
 */
function toStillDurationSource(raw: string | null): StillDurationSource {
  return STILL_DURATION_SOURCES.includes(raw as StillDurationSource)
    ? (raw as StillDurationSource)
    : DEFAULT_STILL_DURATION_SOURCE;
}

/**
 * Beta S474 — the same laundering for the frame choice, and for the same
 * reason: a value outside the set means a newer build or a hand-edited
 * database, and refusing to open the timeline over a cosmetic preference
 * would be the wrong trade.
 */
function toStillFrameSource(raw: string | null): StillFrameSource {
  return STILL_FRAME_SOURCES.includes(raw as StillFrameSource)
    ? (raw as StillFrameSource)
    : DEFAULT_STILL_FRAME_SOURCE;
}

/** S222 — the imported map, or `null` for anything this cannot read as one. */
function toStillDurations(raw: string | null): ImportedStillDurations | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImportedStillDurations>;
    const source = parsed?.secondsByShotId;
    if (!source || typeof source !== 'object') return null;
    const secondsByShotId: Record<string, number> = {};
    for (const [shotId, seconds] of Object.entries(source)) {
      if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
        secondsByShotId[shotId] = seconds;
      }
    }
    return {
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
      importedAt: typeof parsed.importedAt === 'string' ? parsed.importedAt : '',
      secondsByShotId,
    };
  } catch {
    return null;
  }
}

function toSequence(row: SequenceRow): Sequence {
  return {
    id: row.id,
    projectId: row.project_id,
    storyEpisodeId: row.story_episode_id,
    storyProjectRoot: row.story_project_root,
    spineTrackId: row.spine_track_id,
    stillDurationSource: toStillDurationSource(row.still_duration_source),
    stillFrameSource: toStillFrameSource(row.still_frame_source),
    stillDurations: toStillDurations(row.still_durations_json),
    name: row.name,
    fps: row.fps,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTrack(row: TrackRow): SequenceTrack {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    kind: row.kind as TrackKind,
    orderIndex: row.order_index,
    name: row.name,
    magnetic: row.magnetic === 1,
    locked: row.locked === 1,
    muted: row.muted === 1,
    // S181 — the eye. Audio tracks have nothing to show, so the column's
    // default of 1 is the only value they ever carry.
    videoEnabled: row.video_enabled === 1,
    heightPx: row.height_px,
    // S165 — 'text' joined the value set; the mapper must not launder it to null.
    role: TRACK_ROLES.includes(row.role as TrackRole) ? (row.role as TrackRole) : null,
  };
}

function toClip(row: ClipRow): SequenceClip {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    trackId: row.track_id,
    orderIndex: row.order_index,
    sourceKind: row.source_kind as SequenceSourceKind,
    outputId: row.output_id,
    storyShotId: row.story_shot_id,
    sourceTakeId: row.source_take_id,
    filePath: row.file_path,
    startFrames: row.start_frames,
    durationFrames: row.duration_frames,
    sourceInFrames: row.source_in_frames,
    sourceOutFrames: row.source_out_frames,
    transitionIn: row.transition_in as ClipTransition,
    transitionFrames: row.transition_frames,
    // S227 — the mapper launders an unknown value to 'cut' (no CHECK on the
    // column, per 078's rule), so a downgrade-written row degrades safely.
    transitionOut: CLIP_TRANSITIONS.includes(row.transition_out as ClipTransition)
      ? (row.transition_out as ClipTransition)
      : 'cut',
    transitionOutFrames: row.transition_out_frames,
    audioOffsetFrames: row.audio_offset_frames,
    motionPreset: row.motion_preset as StillMotionPreset,
    gainDb: row.gain_db,
    fadeInFrames: row.fade_in_frames,
    fadeOutFrames: row.fade_out_frames,
    // S181 — a video clip's own audio. Defaulted to 1 by migration 071, so a
    // clip that predates the column comes back audible rather than silent.
    sourceAudioEnabled: row.source_audio_enabled === 1,
    duckExempt: row.duck_exempt === 1,
    label: row.label,
    overrides: parseOverrides(row.overrides_json),
    // Same defensive posture as `parseOverrides`: a corrupt blob degrades to
    // neutral, never throws mid-load.
    effects: parseClipEffects(row.effects_json),
  };
}

/**
 * Beta S182 — one cached filmstrip sheet, as stored. The `media://` URL the
 * renderer actually uses is built at the IPC boundary; the repository deals in
 * paths, like every other row here.
 */
export interface FilmstripCacheEntry {
  sheetPath: string;
  tileWidth: number;
  columns: number;
  rows: number;
  frameCount: number;
  intervalSec: number;
}

export interface CreateSequenceInput {
  projectId: string;
  storyEpisodeId?: string | null;
  /** Beta S258 — the story folder that episode belongs to. */
  storyProjectRoot?: string | null;
  name: string;
  fps?: number;
  width?: number;
  height?: number;
}

export class SequenceRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  list(projectId: string): Sequence[] {
    const rows = this.db
      .prepare('SELECT * FROM sequences WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId) as SequenceRow[];
    return rows.map(toSequence);
  }

  get(sequenceId: string): SequenceDocument | null {
    const row = this.db.prepare('SELECT * FROM sequences WHERE id = ?').get(sequenceId) as
      | SequenceRow
      | undefined;
    if (!row) return null;
    return {
      sequence: toSequence(row),
      tracks: this.listTracks(sequenceId),
      clips: this.listClips(sequenceId),
    };
  }

  listTracks(sequenceId: string): SequenceTrack[] {
    const rows = this.db
      .prepare('SELECT * FROM sequence_tracks WHERE sequence_id = ? ORDER BY kind DESC, order_index')
      .all(sequenceId) as TrackRow[];
    // `kind DESC` puts video before audio — the (kind, orderIndex) contract.
    return rows.map(toTrack);
  }

  listClips(sequenceId: string): SequenceClip[] {
    const rows = this.db
      .prepare('SELECT * FROM sequence_clips WHERE sequence_id = ? ORDER BY track_id, order_index')
      .all(sequenceId) as ClipRow[];

    // S154 phase 6 — keyframes ride the clip on the wire; one query for the
    // sequence, grouped here. Unknown properties/interpolations degrade to
    // dropped rows rather than a load failure (`parseOverrides`'s posture).
    const keyframeRows = this.db
      .prepare(
        'SELECT clip_id, property, frame, value, interpolation FROM sequence_clip_keyframes WHERE sequence_id = ? ORDER BY clip_id, property, frame',
      )
      .all(sequenceId) as KeyframeRow[];
    const byClipId = new Map<string, ClipKeyframe[]>();
    for (const row of keyframeRows) {
      if (
        !KEYFRAME_PROPERTIES.includes(row.property as ClipKeyframe['property']) ||
        !KEYFRAME_INTERPOLATIONS.includes(row.interpolation as ClipKeyframe['interpolation'])
      ) {
        continue;
      }
      const list = byClipId.get(row.clip_id) ?? [];
      list.push({
        property: row.property as ClipKeyframe['property'],
        frame: row.frame,
        value: row.value,
        interpolation: row.interpolation as ClipKeyframe['interpolation'],
      });
      byClipId.set(row.clip_id, list);
    }

    return rows.map((row) => {
      const clip = toClip(row);
      const keyframes = byClipId.get(row.id);
      return keyframes ? { ...clip, keyframes } : clip;
    });
  }

  /**
   * S154 — a sequence is born with its tracks: one magnetic video spine and
   * two audio tracks, the exact set migration 062 mints for existing rows.
   * The spine binding is written in the same transaction, so no document ever
   * exists with tracks and no spine.
   */
  create(input: CreateSequenceInput, now: string): SequenceDocument {
    const id = randomUUID();
    const spineId = randomUUID();
    const run = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sequences (id, project_id, story_episode_id, story_project_root, spine_track_id, name, fps, width, height, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.storyEpisodeId ?? null,
          // S258 — written in the same statement as the episode it qualifies.
          // A sequence born bound is born knowing which story it is bound to.
          input.storyProjectRoot ?? null,
          spineId,
          input.name,
          normalizeFps(input.fps ?? DEFAULT_SEQUENCE_FPS),
          input.width ?? DEFAULT_SEQUENCE_WIDTH,
          input.height ?? DEFAULT_SEQUENCE_HEIGHT,
          now,
          now,
        );
      const insertTrack = this.db.prepare(
        `INSERT INTO sequence_tracks (id, sequence_id, kind, order_index, name, magnetic, locked, muted, video_enabled, height_px, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?)`,
      );
      // S157 — names went generic ("Audio N"); the *role* carries what the
      // old Narration/Music labels only implied, and it is what the duck key
      // and the storyboard pane's placement now resolve.
      insertTrack.run(spineId, id, 'video', 0, 'Video', 1, DEFAULT_VIDEO_TRACK_HEIGHT_PX, null, now);
      insertTrack.run(randomUUID(), id, 'audio', 0, 'Audio 1', 0, DEFAULT_AUDIO_TRACK_HEIGHT_PX, 'narration', now);
      insertTrack.run(randomUUID(), id, 'audio', 1, 'Audio 2', 0, DEFAULT_AUDIO_TRACK_HEIGHT_PX, 'music', now);
    });
    run();
    const created = this.get(id);
    if (!created) throw new Error(`Sequence ${id} vanished immediately after insert`);
    return created;
  }

  // ---------------------------------------------------------------- tracks

  /**
   * Appends a track of `kind` at the end of that kind's order.
   *
   * S165 — `role` lets the track be born typed (a text or overlay lane); the
   * kind-scoping rule lives here for the same reason updateTrack's does.
   * S170 — height follows what the lane draws: a plain video lane gets the
   * filmstrip height (it carries PiP media thumbnails, same need as the
   * spine), audio the waveform height, text/overlay the slim chip height.
   */
  addTrack(
    sequenceId: string,
    kind: TrackKind,
    name: string,
    now: string,
    role: TrackRole | null = null,
  ): SequenceDocument | null {
    if (!roleAllowedOnKind(role, kind)) {
      throw new Error(`A ${kind} track cannot carry the '${role ?? 'null'}' role.`);
    }
    const exists = this.db.prepare('SELECT id FROM sequences WHERE id = ?').get(sequenceId);
    if (!exists) return null;
    const nextOrder = this.db
      .prepare('SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM sequence_tracks WHERE sequence_id = ? AND kind = ?')
      .get(sequenceId, kind) as { next: number };
    this.db
      .prepare(
        `INSERT INTO sequence_tracks (id, sequence_id, kind, order_index, name, magnetic, locked, muted, video_enabled, height_px, role, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        sequenceId,
        kind,
        nextOrder.next,
        name,
        kind === 'audio'
          ? DEFAULT_AUDIO_TRACK_HEIGHT_PX
          : role === null
            ? DEFAULT_VIDEO_TRACK_HEIGHT_PX
            : DEFAULT_CHIP_TRACK_HEIGHT_PX,
        role,
        now,
      );
    this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?').run(now, sequenceId);
    return this.get(sequenceId);
  }

  updateTrack(
    sequenceId: string,
    trackId: string,
    patch: {
      name?: string;
      locked?: boolean;
      muted?: boolean;
      /** S181 — the eye. Video tracks only; the UI does not offer it elsewhere. */
      videoEnabled?: boolean;
      heightPx?: number;
      /** `undefined` keeps, `null` clears — the storyEpisodeId lifecycle. Audio tracks only. */
      role?: TrackRole | null;
    },
    now: string,
  ): SequenceDocument | null {
    const row = this.db
      .prepare('SELECT * FROM sequence_tracks WHERE id = ? AND sequence_id = ?')
      .get(trackId, sequenceId) as TrackRow | undefined;
    if (!row) return null;
    // The kind-scoping rule lives here rather than a cross-column CHECK —
    // SQLite's ADD COLUMN cannot carry one, and a misfiled role would either
    // silently join the duck graph (audio roles on video) or type a picture
    // lane as text (S165). The spine additionally refuses 'text': the cut
    // itself can never become a text lane.
    if (patch.role !== undefined) {
      if (!roleAllowedOnKind(patch.role, row.kind === 'audio' ? 'audio' : 'video')) {
        throw new Error(`A ${row.kind} track cannot carry the '${patch.role ?? 'null'}' role.`);
      }
      if (patch.role === 'text' || patch.role === 'overlay') {
        const spine = this.db
          .prepare('SELECT spine_track_id AS spineTrackId FROM sequences WHERE id = ?')
          .get(sequenceId) as { spineTrackId: string | null } | undefined;
        if (spine?.spineTrackId === trackId) {
          throw new Error(`The spine cannot become a ${patch.role} lane.`);
        }
      }
    }
    this.db
      .prepare(
        'UPDATE sequence_tracks SET name = ?, locked = ?, muted = ?, video_enabled = ?, height_px = ?, role = ? WHERE id = ?',
      )
      .run(
        patch.name ?? row.name,
        (patch.locked ?? row.locked === 1) ? 1 : 0,
        (patch.muted ?? row.muted === 1) ? 1 : 0,
        // S181 — the eye, patchable on its own. An audio track never carries
        // anything but 1 here; the UI offers the control on video only.
        (patch.videoEnabled ?? row.video_enabled === 1) ? 1 : 0,
        patch.heightPx ?? row.height_px,
        patch.role === undefined ? row.role : patch.role,
        trackId,
      );
    this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?').run(now, sequenceId);
    return this.get(sequenceId);
  }

  /**
   * Deletes a track **and its clips** (explicit, FKs are off).
   *
   * The spine is refused outright — S170 (owner rule, 2026-08-14): it is the
   * sequence's default track and can never be deleted, superseding S154's
   * "an empty spine may go". The UI hides the item; this seam is the
   * backstop. `replaceDocument` can still reshape documents wholesale — the
   * undo path needs that door, and it restores the binding it carries.
   */
  deleteTrack(sequenceId: string, trackId: string, now: string): SequenceDocument | null {
    const document = this.get(sequenceId);
    if (!document) return null;
    if (!document.tracks.some((track) => track.id === trackId)) return document;

    const isSpine = document.sequence.spineTrackId === trackId;
    if (isSpine) {
      throw new Error('The spine is the default track and cannot be deleted.');
    }

    const run = this.db.transaction(() => {
      // Keyframes first, while the clip rows the subquery reads still exist.
      this.db
        .prepare(
          `DELETE FROM sequence_clip_keyframes
            WHERE clip_id IN (SELECT id FROM sequence_clips WHERE sequence_id = ? AND track_id = ?)`,
        )
        .run(sequenceId, trackId);
      this.db.prepare('DELETE FROM sequence_clips WHERE sequence_id = ? AND track_id = ?').run(sequenceId, trackId);
      this.db.prepare('DELETE FROM sequence_tracks WHERE id = ?').run(trackId);
      this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?').run(now, sequenceId);
    });
    run();
    return this.get(sequenceId);
  }

  /**
   * Rewrites one kind's `order_index` from an ordered id list. Ids not in the
   * list keep their relative order after the listed ones; ids of the other
   * kind are untouched. The unique index makes a duplicate a hard error.
   */
  reorderTracks(sequenceId: string, kind: TrackKind, orderedIds: string[], now: string): SequenceDocument | null {
    const tracks = this.listTracks(sequenceId).filter((track) => track.kind === kind);
    if (tracks.length === 0) return this.get(sequenceId);
    const listed = orderedIds.filter((id) => tracks.some((track) => track.id === id));
    const rest = tracks.filter((track) => !listed.includes(track.id)).map((track) => track.id);
    const finalOrder = [...listed, ...rest];

    // S166 — the spine is the composite's floor: video order is ascending
    // z (index 0 composites first), so the spine must sit at index 0 of any
    // video reorder. The panel already clamps its gestures; this is the
    // defense-in-depth seam, like the role guards.
    if (kind === 'video') {
      const spine = this.db
        .prepare('SELECT spine_track_id AS spineTrackId FROM sequences WHERE id = ?')
        .get(sequenceId) as { spineTrackId: string | null } | undefined;
      const spineId = spine?.spineTrackId ?? null;
      if (spineId && finalOrder.includes(spineId) && finalOrder[0] !== spineId) {
        throw new Error('The spine stays at the bottom of the composite.');
      }
    }

    const run = this.db.transaction(() => {
      // Two passes over a unique index: shift out of range, then renumber.
      const shift = this.db.prepare(
        'UPDATE sequence_tracks SET order_index = order_index + 10000 WHERE sequence_id = ? AND kind = ?',
      );
      shift.run(sequenceId, kind);
      const set = this.db.prepare('UPDATE sequence_tracks SET order_index = ? WHERE id = ?');
      finalOrder.forEach((id, index) => set.run(index, id));
      this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?').run(now, sequenceId);
    });
    run();
    return this.get(sequenceId);
  }

  rename(sequenceId: string, name: string, now: string): Sequence | null {
    this.db
      .prepare('UPDATE sequences SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, now, sequenceId);
    const row = this.db.prepare('SELECT * FROM sequences WHERE id = ?').get(sequenceId) as
      | SequenceRow
      | undefined;
    return row ? toSequence(row) : null;
  }

  delete(sequenceId: string): void {
    // Explicit rather than relying on `ON DELETE CASCADE`: the `foreign_keys`
    // pragma is off by default in SQLite, so the declaration in migration 060
    // documents the relationship but does not enforce it. Deleting children
    // first also keeps the order right if the pragma is ever turned on.
    const run = this.db.transaction(() => {
      this.db.prepare('DELETE FROM sequence_clip_keyframes WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequence_clips WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequence_tracks WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequence_markers WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequences WHERE id = ?').run(sequenceId);
    });
    run();
  }

  // ---------------------------------------------------------------- markers
  //
  // S160 — each mutation returns the sequence's fresh, frame-ordered marker
  // list (the track-mutation convention scaled down: take the returned state
  // wholesale, never guess it locally). Markers are annotations, deliberately
  // outside the document snapshot and its undo history — an undo of a clip
  // edit must not silently delete a note the user wrote afterwards.

  listMarkers(sequenceId: string): SequenceMarker[] {
    const rows = this.db
      .prepare('SELECT * FROM sequence_markers WHERE sequence_id = ? ORDER BY frame, id')
      .all(sequenceId) as MarkerRow[];
    return rows.map(toMarker);
  }

  addMarker(
    sequenceId: string,
    input: { frame: number; name?: string; notes?: string; color?: MarkerColor; locked?: boolean },
    now: string,
  ): SequenceMarker[] | null {
    const exists = this.db.prepare('SELECT id FROM sequences WHERE id = ?').get(sequenceId);
    if (!exists) return null;
    this.db
      .prepare(
        'INSERT INTO sequence_markers (id, sequence_id, frame, name, notes, color, created_at, locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        randomUUID(),
        sequenceId,
        Math.max(0, Math.round(input.frame)),
        input.name ?? '',
        input.notes ?? '',
        input.color ?? 'ai',
        now,
        input.locked ? 1 : 0,
        now,
      );
    return this.listMarkers(sequenceId);
  }

  updateMarker(
    sequenceId: string,
    markerId: string,
    patch: { frame?: number; name?: string; notes?: string; color?: MarkerColor; locked?: boolean },
  ): SequenceMarker[] | null {
    const row = this.db
      .prepare('SELECT * FROM sequence_markers WHERE id = ? AND sequence_id = ?')
      .get(markerId, sequenceId) as MarkerRow | undefined;
    if (!row) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE sequence_markers SET frame = ?, name = ?, notes = ?, color = ?, locked = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        patch.frame === undefined ? row.frame : Math.max(0, Math.round(patch.frame)),
        patch.name ?? row.name,
        patch.notes !== undefined ? patch.notes : row.notes ?? '',
        patch.color ?? row.color,
        patch.locked === undefined ? row.locked : patch.locked ? 1 : 0,
        now,
        markerId,
      );
    return this.listMarkers(sequenceId);
  }

  deleteMarker(sequenceId: string, markerId: string): SequenceMarker[] {
    this.db.prepare('DELETE FROM sequence_markers WHERE id = ? AND sequence_id = ?').run(markerId, sequenceId);
    return this.listMarkers(sequenceId);
  }

  /**
   * Frame rate and geometry.
   *
   * Changing `fps` **re-scales every stored frame count** so the edit keeps its
   * wall-clock shape: at 24fps a 72-frame still is 3 seconds, and at 30fps it
   * must become 90 frames or the whole cut silently shortens by a fifth. The
   * rescale rounds per value, so a long sequence can drift by at most half a
   * frame per clip — which is inaudible and, unlike the alternative, bounded.
   */
  updateSettings(
    sequenceId: string,
    settings: {
      fps?: number;
      width?: number;
      height?: number;
      storyEpisodeId?: string | null;
      /** Beta S258 — the story folder half of the binding, same keep/unbind lifecycle. */
      storyProjectRoot?: string | null;
      spineTrackId?: string | null;
      stillDurationSource?: StillDurationSource;
      stillDurations?: ImportedStillDurations | null;
      /** Beta S474 — which of a shot's stills the spine shows. */
      stillFrameSource?: StillFrameSource;
    },
    now: string,
  ): SequenceDocument | null {
    const current = this.get(sequenceId);
    if (!current) return null;

    const nextFps = settings.fps === undefined ? current.sequence.fps : normalizeFps(settings.fps);
    // S222 — same keep/clear lifecycle as the two bindings above: `undefined`
    // keeps what is stored, `null` clears the import. A source flip and a
    // fresh import arrive as separate calls, so neither can clobber the other.
    const nextStillDurations =
      settings.stillDurations === undefined
        ? (current.sequence.stillDurations ?? null)
        : settings.stillDurations;
    const run = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE sequences
              SET fps = ?, width = ?, height = ?, story_episode_id = ?, story_project_root = ?,
                  spine_track_id = ?, still_duration_source = ?, still_durations_json = ?,
                  still_frame_source = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          nextFps,
          settings.width ?? current.sequence.width,
          settings.height ?? current.sequence.height,
          // `undefined` keeps the current binding; `null` explicitly unbinds.
          settings.storyEpisodeId === undefined
            ? current.sequence.storyEpisodeId
            : settings.storyEpisodeId,
          // S258 — the folder that qualifies it, same rule. Kept independent of
          // the episode rather than cleared alongside it: a caller that sends
          // only one of the two means only one of the two, and an unrelated
          // resize must leave both exactly as they were.
          settings.storyProjectRoot === undefined
            ? (current.sequence.storyProjectRoot ?? null)
            : settings.storyProjectRoot,
          // Same lifecycle as the episode binding, S154.
          settings.spineTrackId === undefined
            ? current.sequence.spineTrackId
            : settings.spineTrackId,
          settings.stillDurationSource ??
            current.sequence.stillDurationSource ??
            DEFAULT_STILL_DURATION_SOURCE,
          nextStillDurations === null ? null : JSON.stringify(nextStillDurations),
          // S474 — same keep rule as the duration source beside it: `undefined`
          // keeps what is stored, and only an explicit value moves it.
          settings.stillFrameSource ??
            current.sequence.stillFrameSource ??
            DEFAULT_STILL_FRAME_SOURCE,
          now,
          sequenceId,
        );

      if (nextFps !== current.sequence.fps) {
        const ratio = nextFps / current.sequence.fps;
        // S154 phase 6 — the rescale reaches the keyframes too (trap 10): a
        // curve left at the old fps drifts 25% on a 24→30 switch, silently.
        // Rewritten rather than UPDATEd in place: a downscale can round two
        // neighbouring keys onto the same frame, and the UNIQUE index makes
        // that a hard error mid-transaction — so this dedupes (last wins,
        // the later-authored intent) while it rescales.
        this.db.prepare('DELETE FROM sequence_clip_keyframes WHERE sequence_id = ?').run(sequenceId);
        const insertKeyframe = this.db.prepare(
          `INSERT INTO sequence_clip_keyframes (id, sequence_id, clip_id, property, frame, value, interpolation)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const clip of current.clips) {
          const deduped = new Map<string, ClipKeyframe>();
          for (const keyframe of clip.keyframes ?? []) {
            const frame = Math.max(0, Math.round(keyframe.frame * ratio));
            deduped.set(`${keyframe.property}:${frame}`, { ...keyframe, frame });
          }
          for (const keyframe of deduped.values()) {
            insertKeyframe.run(
              randomUUID(),
              sequenceId,
              clip.id,
              keyframe.property,
              keyframe.frame,
              keyframe.value,
              keyframe.interpolation,
            );
          }
        }
        // S160 — markers are stored frame counts too; a marker left at the
        // old fps names a different moment after a 24→30 switch.
        this.db
          .prepare('UPDATE sequence_markers SET frame = MAX(0, ROUND(frame * ?)) WHERE sequence_id = ?')
          .run(ratio, sequenceId);
        const scale = (value: number | null | undefined): number | null =>
          value === null || value === undefined ? null : Math.max(0, Math.round(value * ratio));
        const update = this.db.prepare(
          `UPDATE sequence_clips
              SET start_frames = ?, duration_frames = ?, source_in_frames = ?,
                  source_out_frames = ?, transition_frames = ?,
                  fade_in_frames = ?, fade_out_frames = ?
            WHERE id = ?`,
        );
        for (const clip of current.clips) {
          update.run(
            scale(clip.startFrames),
            // A clip must not round to zero frames and disappear from the cut.
            Math.max(1, Math.round(clip.durationFrames * ratio)),
            scale(clip.sourceInFrames),
            scale(clip.sourceOutFrames),
            scale(clip.transitionFrames) ?? 0,
            scale(clip.fadeInFrames) ?? 0,
            scale(clip.fadeOutFrames) ?? 0,
            clip.id,
          );
        }
      }
    });
    run();
    return this.get(sequenceId);
  }

  /** Replaces every clip of a sequence. See the class comment for why this is not granular. */
  replaceClips(sequenceId: string, clips: SequenceClip[], now: string): SequenceDocument | null {
    const exists = this.db.prepare('SELECT id FROM sequences WHERE id = ?').get(sequenceId);
    if (!exists) return null;

    // The write normalization — one of three guards on the magnetic/absolute
    // asymmetry: a clip on a magnetic track persists `start_frames = NULL`
    // whatever the payload held, exactly as the payload's own `sequenceId` is
    // ignored. A stored position two code paths disagree about is the worst
    // failure this module can have.
    const magneticTrackIds = new Set(
      this.listTracks(sequenceId)
        .filter((track) => track.magnetic)
        .map((track) => track.id),
    );

    const run = this.db.transaction(() => {
      // The keyframes table clears by the denormalized sequence_id — flat, no
      // subquery into a clips table this transaction is about to empty.
      this.db.prepare('DELETE FROM sequence_clip_keyframes WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequence_clips WHERE sequence_id = ?').run(sequenceId);
      const insertKeyframe = this.db.prepare(
        `INSERT INTO sequence_clip_keyframes (id, sequence_id, clip_id, property, frame, value, interpolation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insert = this.db.prepare(
        `INSERT INTO sequence_clips (
           id, sequence_id, track_id, order_index, source_kind, output_id, story_shot_id,
           source_take_id, file_path, start_frames, duration_frames, source_in_frames,
           source_out_frames, transition_in, transition_frames, transition_out, transition_out_frames, audio_offset_frames,
           motion_preset, gain_db,
           fade_in_frames, fade_out_frames, source_audio_enabled, duck_exempt, label,
           overrides_json, effects_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const clip of clips) {
        insert.run(
          clip.id,
          // The payload's own `sequenceId` is ignored in favour of the channel's:
          // a clip cannot be moved between sequences by relabelling it.
          sequenceId,
          clip.trackId,
          clip.orderIndex,
          clip.sourceKind,
          clip.outputId ?? null,
          clip.storyShotId ?? null,
          clip.sourceTakeId ?? null,
          clip.filePath,
          magneticTrackIds.has(clip.trackId) ? null : (clip.startFrames ?? null),
          clip.durationFrames,
          clip.sourceInFrames ?? null,
          clip.sourceOutFrames ?? null,
          clip.transitionIn,
          clip.transitionFrames,
          // S227 — absent means 'cut'/0, the same answer the column defaults give.
          clip.transitionOut ?? 'cut',
          clip.transitionOutFrames ?? 0,
          clip.audioOffsetFrames ?? 0,
          clip.motionPreset,
          clip.gainDb,
          clip.fadeInFrames,
          clip.fadeOutFrames,
          // S181 — `?? true` rather than `?? false`: a payload built by code
          // that predates the field must land audible, which is the same
          // answer migration 071's column default gives an existing row.
          (clip.sourceAudioEnabled ?? true) ? 1 : 0,
          clip.duckExempt ? 1 : 0,
          clip.label,
          JSON.stringify(clip.overrides),
          JSON.stringify(clip.effects ?? {}),
        );
        for (const keyframe of clip.keyframes ?? []) {
          insertKeyframe.run(
            randomUUID(),
            sequenceId,
            clip.id,
            keyframe.property,
            Math.max(0, Math.round(keyframe.frame)),
            keyframe.value,
            keyframe.interpolation,
          );
        }
      }
      this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?').run(now, sequenceId);
    });
    run();
    return this.get(sequenceId);
  }

  /**
   * Beta S160 — restores a whole document snapshot in one transaction:
   * tracks (delete absent, upsert present, ids preserved), the spine
   * binding, then the clip list via the same normalization `replaceClips`
   * applies. Exists for undo/redo, whose history is full-document now —
   * undoing a track delete must bring back the track row *and* its clips
   * atomically, with `clip.trackId` references intact.
   */
  replaceDocument(
    sequenceId: string,
    snapshot: {
      /**
       * S181 — `videoEnabled` is optional *here specifically*, unlike on a
       * `SequenceTrack` read back out. This is the undo door: a snapshot
       * captured before the eye/speaker split has no opinion about
       * visibility, and restoring it must not blank a lane. Absent is read as
       * visible, matching migration 071's column default.
       */
      tracks: (Omit<SequenceTrack, 'videoEnabled'> & { videoEnabled?: boolean })[];
      clips: SequenceClip[];
      spineTrackId: string | null;
    },
    now: string,
  ): SequenceDocument | null {
    const exists = this.db.prepare('SELECT id FROM sequences WHERE id = ?').get(sequenceId);
    if (!exists) return null;

    // The same identity rules the granular channels enforce piecemeal: a
    // magnetic audio track or a misfiled role is malformed whatever path it
    // arrives by.
    //
    // S172 — **the standing constraint for this seam**, learned the hard way.
    // This is the door every undo/redo passes through, so a rule asserted
    // here that the app can legitimately produce does not reject bad data —
    // it breaks undo. Two rules follow from that, and both are load-bearing:
    //
    //   1. Only assert invariants **no public repository path can produce**.
    //      (Not "the spine is magnetic and at video order 0": this method is
    //      also the door that *repairs* a reshaped or spineless document —
    //      the undo of a delete depends on that permissiveness.)
    //   2. Assert them by calling the **same shared predicate** the granular
    //      path calls — never a restatement of it.
    //
    // Rule 2 is exactly what was violated: this loop restated S157's
    // "roles are audio-only" by hand, S165 added the video-only `text` and
    // `overlay` roles everywhere else, and the restatement was left behind —
    // so every undo in a sequence holding a text or overlay lane threw, the
    // optimistic renderer state survived, and the write was silently lost.
    for (const track of snapshot.tracks) {
      if (track.magnetic && track.kind !== 'video') {
        throw new Error('Only video tracks may be magnetic.');
      }
      if (!roleAllowedOnKind(track.role, track.kind)) {
        throw new Error(`A ${track.kind} track cannot carry the '${track.role}' role.`);
      }
      // Unproducible by any path (`create` mints the spine role-null,
      // `addTrack` never mints the spine, `updateTrack` refuses it), so it
      // passes rule 1 — and the spine binding travels in this snapshot.
      if (track.id === snapshot.spineTrackId && track.role !== null) {
        throw new Error('The spine cannot carry a role.');
      }
    }
    // A spine pointing outside the snapshot would mint a document no other
    // code path can produce.
    if (
      snapshot.spineTrackId !== null &&
      !snapshot.tracks.some((track) => track.id === snapshot.spineTrackId)
    ) {
      throw new Error('The spine binding must name a track in the snapshot.');
    }

    const magneticTrackIds = new Set(
      snapshot.tracks.filter((track) => track.magnetic).map((track) => track.id),
    );

    const run = this.db.transaction(() => {
      // Children first, then tracks: rebuild from the snapshot wholesale.
      this.db.prepare('DELETE FROM sequence_clip_keyframes WHERE sequence_id = ?').run(sequenceId);
      this.db.prepare('DELETE FROM sequence_clips WHERE sequence_id = ?').run(sequenceId);

      const trackIds = snapshot.tracks.map((track) => track.id);
      const placeholders = trackIds.map(() => '?').join(', ');
      if (trackIds.length > 0) {
        this.db
          .prepare(`DELETE FROM sequence_tracks WHERE sequence_id = ? AND id NOT IN (${placeholders})`)
          .run(sequenceId, ...trackIds);
      } else {
        this.db.prepare('DELETE FROM sequence_tracks WHERE sequence_id = ?').run(sequenceId);
      }
      // Two passes over the unique (sequence_id, kind, order_index) index,
      // the `reorderTracks` convention: shift survivors out of range first so
      // upserted positions cannot collide mid-transaction.
      this.db
        .prepare('UPDATE sequence_tracks SET order_index = order_index + 10000 WHERE sequence_id = ?')
        .run(sequenceId);
      const upsertTrack = this.db.prepare(
        `INSERT INTO sequence_tracks (id, sequence_id, kind, order_index, name, magnetic, locked, muted, video_enabled, height_px, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           order_index = excluded.order_index, name = excluded.name, magnetic = excluded.magnetic,
           locked = excluded.locked, muted = excluded.muted, video_enabled = excluded.video_enabled,
           height_px = excluded.height_px, role = excluded.role`,
      );
      for (const track of snapshot.tracks) {
        upsertTrack.run(
          track.id,
          // The channel's id wins over the payload's, the `replaceClips` rule.
          sequenceId,
          track.kind,
          track.orderIndex,
          track.name,
          track.magnetic ? 1 : 0,
          track.locked ? 1 : 0,
          track.muted ? 1 : 0,
          // Undo restores whole documents, so a snapshot taken before this
          // field existed must not blank a lane on the way back in.
          (track.videoEnabled ?? true) ? 1 : 0,
          track.heightPx,
          track.role,
          now,
        );
      }
      this.db
        .prepare('UPDATE sequences SET spine_track_id = ?, updated_at = ? WHERE id = ?')
        .run(snapshot.spineTrackId, now, sequenceId);

      const insertKeyframe = this.db.prepare(
        `INSERT INTO sequence_clip_keyframes (id, sequence_id, clip_id, property, frame, value, interpolation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insert = this.db.prepare(
        `INSERT INTO sequence_clips (
           id, sequence_id, track_id, order_index, source_kind, output_id, story_shot_id,
           source_take_id, file_path, start_frames, duration_frames, source_in_frames,
           source_out_frames, transition_in, transition_frames, transition_out, transition_out_frames, audio_offset_frames,
           motion_preset, gain_db,
           fade_in_frames, fade_out_frames, source_audio_enabled, duck_exempt, label,
           overrides_json, effects_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const clip of snapshot.clips) {
        insert.run(
          clip.id,
          sequenceId,
          clip.trackId,
          clip.orderIndex,
          clip.sourceKind,
          clip.outputId ?? null,
          clip.storyShotId ?? null,
          clip.sourceTakeId ?? null,
          clip.filePath,
          magneticTrackIds.has(clip.trackId) ? null : (clip.startFrames ?? null),
          clip.durationFrames,
          clip.sourceInFrames ?? null,
          clip.sourceOutFrames ?? null,
          clip.transitionIn,
          clip.transitionFrames,
          // S227 — absent means 'cut'/0, the same answer the column defaults give.
          clip.transitionOut ?? 'cut',
          clip.transitionOutFrames ?? 0,
          clip.audioOffsetFrames ?? 0,
          clip.motionPreset,
          clip.gainDb,
          clip.fadeInFrames,
          clip.fadeOutFrames,
          // S181 — `?? true` rather than `?? false`: a payload built by code
          // that predates the field must land audible, which is the same
          // answer migration 071's column default gives an existing row.
          (clip.sourceAudioEnabled ?? true) ? 1 : 0,
          clip.duckExempt ? 1 : 0,
          clip.label,
          JSON.stringify(clip.overrides),
          JSON.stringify(clip.effects ?? {}),
        );
        for (const keyframe of clip.keyframes ?? []) {
          insertKeyframe.run(
            randomUUID(),
            sequenceId,
            clip.id,
            keyframe.property,
            Math.max(0, Math.round(keyframe.frame)),
            keyframe.value,
            keyframe.interpolation,
          );
        }
      }
    });
    run();
    return this.get(sequenceId);
  }

  // -------------------------------------------------------- imported media
  //
  // Beta S180. Two consumers with very different stakes read this table:
  // the pool's Imported pane (a bin listing) and `bootstrap.ts`'s
  // `isKnownReference` (what `media://` will serve). Everything below is
  // written for the second one — a row here is a **capability**, so it is
  // minted only from a verified path and revoked the moment it is removed.

  /**
   * Whether any project has recorded this exact path as imported.
   *
   * Deliberately not project-scoped: the media protocol answers a request for
   * a path, with no project in hand, and two projects may legitimately
   * reference the same file. Scoping the grant would refuse the second one's
   * thumbnails for no security gain — the question "did this user attach this
   * file through this app" is the same either way.
   */
  isImported(absolutePath: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS present FROM sequence_media WHERE file_path = ? LIMIT 1')
      .get(absolutePath) as { present: number } | undefined;
    return row !== undefined;
  }

  /**
   * Clip usage for every imported path in a project, keyed by path.
   *
   * One grouped query rather than one per row: the pane needs usage on every
   * tile (to grey the removable ones and to power "Remove unused"), and a
   * per-tile round trip would be N queries for a listing that is already one.
   */
  private usageByPath(projectId: string): Map<string, ImportedMediaUsage> {
    const rows = this.db
      .prepare(
        `SELECT c.file_path AS filePath, s.name AS sequenceName, COUNT(*) AS clipCount
           FROM sequence_clips c
           JOIN sequences s ON s.id = c.sequence_id
          WHERE s.project_id = ?
          GROUP BY c.file_path, s.id
          ORDER BY s.name`,
      )
      .all(projectId) as { filePath: string; sequenceName: string; clipCount: number }[];

    const byPath = new Map<string, ImportedMediaUsage>();
    for (const row of rows) {
      if (!row.filePath) continue;
      const usage = byPath.get(row.filePath) ?? byPath.get(path.resolve(row.filePath)) ?? byPath.get(row.filePath.toLowerCase()) ?? { clipCount: 0, sequenceNames: [] };
      usage.clipCount += row.clipCount;
      // Grouped by sequence, so a name repeats only across distinct sequences
      // that happen to share a name — worth keeping both, the user named them.
      usage.sequenceNames.push(row.sequenceName);
      byPath.set(row.filePath, usage);
      byPath.set(path.resolve(row.filePath), usage);
      byPath.set(row.filePath.toLowerCase(), usage);
      byPath.set(path.resolve(row.filePath).toLowerCase(), usage);
    }
    return byPath;
  }

  /**
   * One imported row by its id — how the `sequence-media` watermark source
   * resolves to a path (Beta S353).
   *
   * Not project-scoped, for `isImported`'s reason: the caller has an id the
   * renderer handed over and no project in hand, and the row's own
   * `project_id` is the answer rather than a filter. The path still passes the
   * S213 allowlist before anything touches it.
   */
  getMediaById(
    id: string,
  ): {
    id: string;
    projectId: string;
    path: string;
    kind: MediaSourceKind;
    durationSec: number | null;
  } | null {
    const row = this.db.prepare('SELECT * FROM sequence_media WHERE id = ?').get(id) as
      | MediaRow
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      path: row.file_path,
      kind: row.kind as MediaSourceKind,
      durationSec: row.duration_sec,
    };
  }

  /**
   * Records that this row's file has been cleaned, with the identity it had at
   * that moment (migration 101).
   *
   * The identity is the point — see {@link WatermarkCleanedStamp}. Stamping
   * without it would let a file re-exported over the same path inherit a claim
   * that was true of different bytes.
   */
  markMediaCleaned(id: string, stamp: WatermarkCleanedStamp): void {
    this.db
      .prepare(
        `UPDATE sequence_media
            SET cleaned_at = ?, cleaned_engine = ?, cleaned_size = ?, cleaned_mtime_ms = ?
          WHERE id = ?`,
      )
      .run(stamp.at, stamp.engine, stamp.size, Math.round(stamp.mtimeMs), id);
  }

  /**
   * Re-points every clip in a project from one file to another, returning how
   * many moved.
   *
   * Beta S353 — the half of a `derive` clean without which nothing happens to
   * the cut. `SequenceClip.filePath` is a *resolved absolute path*, held
   * directly so a Library trash cannot orphan an edit; the consequence is that
   * writing `foo-clean.png` beside `foo.jpg` leaves the timeline pointing at
   * the marked file and looking, to the user, as though the clean did nothing.
   *
   * **Project-wide, not sequence-wide.** One file is commonly used by several
   * episodes' sequences, and relinking only the open one would leave the others
   * on the marked file — a split that shows up much later, in an export nobody
   * re-checked.
   *
   * Deliberately *not* touching `outputId` / `story_shot_id` / `source_take_id`:
   * the clip's provenance is unchanged by a clean. What it points at moved; what
   * it came from did not, and a re-sync still has to be able to recognise it.
   */
  relinkClipSources(projectId: string, fromPath: string, toPath: string): number {
    const result = this.db
      .prepare(
        `UPDATE sequence_clips
            SET file_path = ?
          WHERE file_path = ?
            AND sequence_id IN (SELECT id FROM sequences WHERE project_id = ?)`,
      )
      .run(toPath, fromPath, projectId);
    return result.changes;
  }

  listMedia(projectId: string): ImportedMediaFile[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sequence_media WHERE project_id = ? ORDER BY imported_at DESC, label',
      )
      .all(projectId) as MediaRow[];
    const usage = this.usageByPath(projectId);
    return rows.map((row) =>
      toImportedMedia(
        row,
        usage.get(row.file_path) ??
          usage.get(path.resolve(row.file_path)) ??
          usage.get(row.file_path.toLowerCase()) ??
          usage.get(path.resolve(row.file_path).toLowerCase()),
      ),
    );
  }

  /**
   * Records imports, newest wins.
   *
   * Re-importing a path updates the row in place rather than minting a second:
   * the measurement may have changed (the file was re-encoded), and the pane
   * showing one file twice would be a bug the user cannot resolve — there is
   * only one thing on disk to remove.
   */
  recordMedia(
    projectId: string,
    files: readonly { path: string; kind: MediaSourceKind; label: string; durationSec: number | null }[],
    now: string,
  ): ImportedMediaFile[] {
    const insert = this.db.prepare(
      `INSERT INTO sequence_media (id, project_id, file_path, kind, label, duration_sec, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, file_path) DO UPDATE SET
         kind = excluded.kind, label = excluded.label,
         duration_sec = excluded.duration_sec, imported_at = excluded.imported_at`,
    );
    const run = this.db.transaction(() => {
      for (const file of files) {
        insert.run(randomUUID(), projectId, file.path, file.kind, file.label, file.durationSec, now);
      }
    });
    run();
    return this.listMedia(projectId);
  }

  /**
   * Forgets imported files. **No filesystem call happens here, by design** —
   * an import is a reference, so removal withdraws the reference and the
   * `media://` grant and stops.
   *
   * A path still on a timeline is refused unless `deleteClips` says otherwise,
   * and refused *per path*: the removable ones in a multi-select still go, so
   * a bulk remove is never all-or-nothing over one blocker. Removing a row
   * while its clips survive would leave those clips with no grant — dark in
   * the monitor, exactly the bug this step exists to fix — which is why the
   * two travel together or not at all.
   *
   * The peaks and thumbs caches go with the row: they are keyed by `source_path`,
   * and a re-import of a since-edited file must re-measure rather than draw the
   * waveform of what used to be there.
   */
  removeMedia(
    projectId: string,
    paths: readonly string[],
    deleteClips: boolean,
    now: string,
  ): RemoveImportedMediaResult {
    const existing = this.listMedia(projectId);
    const byPath = new Map<string, ImportedMediaFile>();
    for (const file of existing) {
      byPath.set(file.path, file);
      byPath.set(path.resolve(file.path), file);
      byPath.set(file.path.toLowerCase(), file);
      byPath.set(path.resolve(file.path).toLowerCase(), file);
    }
    const targets = paths
      .map(
        (candidate) =>
          byPath.get(candidate)?.path ??
          byPath.get(path.resolve(candidate))?.path ??
          byPath.get(candidate.toLowerCase())?.path ??
          byPath.get(path.resolve(candidate).toLowerCase())?.path,
      )
      .filter((p): p is string => Boolean(p));
    const uniqueTargets = Array.from(new Set(targets));

    const blocked: ImportedMediaFile[] = [];
    const removable: string[] = [];
    for (const target of uniqueTargets) {
      const file = byPath.get(target) ?? byPath.get(target.toLowerCase());
      if (!file) continue;
      if (!deleteClips && file.usage.clipCount > 0) {
        blocked.push(file);
        continue;
      }
      removable.push(target);
    }
    if (removable.length === 0) {
      return { removed: [], deletedClipCount: 0, deletedClipIds: [], blocked };
    }

    const placeholders = removable.map(() => '?').join(', ');
    let deletedClipCount = 0;
    let deletedClipIds: string[] = [];
    const run = this.db.transaction(() => {
      // Read before writing: which sequences and clips sit in these paths cannot be
      // asked once the rows are gone.
      const deletedClips = deleteClips
        ? (this.db
            .prepare(
              `SELECT c.id AS clipId, c.sequence_id AS sequenceId
                 FROM sequence_clips c
                 JOIN sequences s ON s.id = c.sequence_id
                WHERE s.project_id = ? AND c.file_path IN (${placeholders})`,
            )
            .all(projectId, ...removable) as { clipId: string; sequenceId: string }[])
        : [];

      deletedClipIds = deletedClips.map((row) => row.clipId);
      const touchedSequenceIds = Array.from(new Set(deletedClips.map((row) => row.sequenceId)));

      if (deleteClips) {
        // Keyframes first, while the clip rows the subquery reads still exist
        // — `deleteTrack`'s ordering, for the same reason (FKs are off).
        this.db
          .prepare(
            `DELETE FROM sequence_clip_keyframes
              WHERE clip_id IN (
                SELECT c.id FROM sequence_clips c
                  JOIN sequences s ON s.id = c.sequence_id
                 WHERE s.project_id = ? AND c.file_path IN (${placeholders}))`,
          )
          .run(projectId, ...removable);
        const result = this.db
          .prepare(
            `DELETE FROM sequence_clips
              WHERE id IN (
                SELECT c.id FROM sequence_clips c
                  JOIN sequences s ON s.id = c.sequence_id
                 WHERE s.project_id = ? AND c.file_path IN (${placeholders}))`,
          )
          .run(projectId, ...removable);
        deletedClipCount = result.changes;

        // Deleting from the middle of a lane leaves a hole in `order_index`,
        // and contiguity is this module's central invariant.
        const renumber = this.db.prepare(
          `UPDATE sequence_clips SET order_index = (
             SELECT COUNT(*) FROM sequence_clips peer
              WHERE peer.sequence_id = sequence_clips.sequence_id
                AND peer.track_id = sequence_clips.track_id
                AND (peer.order_index < sequence_clips.order_index
                     OR (peer.order_index = sequence_clips.order_index AND peer.id < sequence_clips.id)))
           WHERE sequence_id = ?`,
        );
        const stamp = this.db.prepare('UPDATE sequences SET updated_at = ? WHERE id = ?');
        for (const sequenceId of touchedSequenceIds) {
          renumber.run(sequenceId);
          stamp.run(now, sequenceId);
        }
      }
      this.db
        .prepare(`DELETE FROM sequence_media WHERE project_id = ? AND file_path IN (${placeholders})`)
        .run(projectId, ...removable);

      try {
        this.db
          .prepare(`DELETE FROM sequence_clip_peaks WHERE source_path IN (${placeholders})`)
          .run(...removable);
      } catch {
        // Auxiliary cache deletion should never abort media removal
      }

      try {
        this.db
          .prepare(`DELETE FROM sequence_clip_thumbs WHERE source_path IN (${placeholders})`)
          .run(...removable);
      } catch {
        // Auxiliary cache deletion should never abort media removal
      }
    });
    run();

    return { removed: removable, deletedClipCount, deletedClipIds, blocked };
  }

  /**
   * Adopts clip sources that predate this table, so projects edited before
   * S180 stop being half-broken.
   *
   * A clip dropped from the old in-memory pool persisted its path in
   * `sequence_clips` and nothing else, so after a restart it was a clip
   * pointing at a file nothing would serve and nothing could remove. This
   * makes those paths first-class imports: they light up, and they become
   * removable through the same affordance as any other.
   *
   * `isManaged` is supplied by the caller rather than computed here because
   * answering it needs the userData root *and* the Story Builder's project
   * roots, which live outside SQLite — see the migration's note on the `db/`
   * leaf rule. Idempotent, so it can (and does) run on every boot: the insert
   * ignores paths already recorded, and a path the user has since removed
   * stays gone as long as its clips did too.
   */
  reconcileImportedMedia(isManaged: (absolutePath: string) => boolean, now: string): number {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT s.project_id AS projectId, c.file_path AS filePath,
                c.source_kind AS sourceKind, c.label AS label
           FROM sequence_clips c
           JOIN sequences s ON s.id = c.sequence_id
          WHERE c.source_kind IN ('still', 'video', 'audio')
            AND NOT EXISTS (
              SELECT 1 FROM sequence_media m
               WHERE m.project_id = s.project_id AND m.file_path = c.file_path)`,
      )
      .all() as { projectId: string; filePath: string; sourceKind: string; label: string }[];

    const adopted = rows.filter((row) => !isManaged(row.filePath));
    if (adopted.length === 0) return 0;

    const insert = this.db.prepare(
      `INSERT INTO sequence_media (id, project_id, file_path, kind, label, duration_sec, imported_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT (project_id, file_path) DO NOTHING`,
    );
    const run = this.db.transaction(() => {
      for (const row of adopted) {
        insert.run(
          randomUUID(),
          row.projectId,
          row.filePath,
          row.sourceKind,
          // A clip's label can legitimately be empty (the column defaults to
          // ''), and a bin tile with no name is unusable — fall back to what
          // the picker would have written.
          row.label || path.basename(row.filePath, path.extname(row.filePath)),
          now,
        );
      }
    });
    run();
    // `duration_sec` stays NULL: an adopted path was never probed by this
    // code path, and inventing a length is exactly what the module forbids.
    // The tile shows no duration until something measures it.
    return adopted.length;
  }

  // -------------------------------------------------------- filmstrip cache
  //
  // Beta S182, migration 072. Keyed exactly like `sequence_clip_peaks` below
  // — path + size + mtime, plus the tile height the sheet was rasterised at.
  // The identity columns are the whole point: a cache keyed on the path alone
  // hands back a re-encoded file's old frames, and nobody thinks to purge it.

  getFilmstrip(key: {
    sourcePath: string;
    fileSizeBytes: number;
    mtimeMs: number;
    tileHeight: number;
  }): FilmstripCacheEntry | null {
    const row = this.db
      .prepare(
        `SELECT sheet_path, tile_width, columns, rows, frame_count, interval_sec
           FROM sequence_clip_thumbs
          WHERE source_path = ? AND file_size_bytes = ? AND mtime_ms = ? AND thumb_height = ?`,
      )
      .get(key.sourcePath, key.fileSizeBytes, key.mtimeMs, key.tileHeight) as
      | {
          sheet_path: string;
          tile_width: number;
          columns: number;
          rows: number;
          frame_count: number;
          interval_sec: number;
        }
      | undefined;
    if (!row) return null;
    return {
      sheetPath: row.sheet_path,
      tileWidth: row.tile_width,
      columns: row.columns,
      rows: row.rows,
      frameCount: row.frame_count,
      intervalSec: row.interval_sec,
    };
  }

  saveFilmstrip(
    key: { sourcePath: string; fileSizeBytes: number; mtimeMs: number; tileHeight: number },
    entry: FilmstripCacheEntry,
    now: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO sequence_clip_thumbs
           (source_path, file_size_bytes, mtime_ms, thumb_height, sheet_path,
            tile_width, columns, rows, frame_count, interval_sec, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_path, file_size_bytes, mtime_ms, thumb_height)
         DO UPDATE SET
           sheet_path = excluded.sheet_path, tile_width = excluded.tile_width,
           columns = excluded.columns, rows = excluded.rows,
           frame_count = excluded.frame_count, interval_sec = excluded.interval_sec,
           computed_at = excluded.computed_at`,
      )
      .run(
        key.sourcePath,
        key.fileSizeBytes,
        key.mtimeMs,
        key.tileHeight,
        entry.sheetPath,
        entry.tileWidth,
        entry.columns,
        entry.rows,
        entry.frameCount,
        entry.intervalSec,
        now,
      );
  }

  // ------------------------------------------------------------ peaks cache

  getPeaks(key: { sourcePath: string; fileSizeBytes: number; mtimeMs: number; bucketCount: number }):
    | number[]
    | null {
    const row = this.db
      .prepare(
        `SELECT peaks_json FROM sequence_clip_peaks
          WHERE source_path = ? AND file_size_bytes = ? AND mtime_ms = ? AND bucket_count = ?`,
      )
      .get(key.sourcePath, key.fileSizeBytes, key.mtimeMs, key.bucketCount) as
      | { peaks_json: string }
      | undefined;
    if (!row) return null;
    try {
      const parsed: unknown = JSON.parse(row.peaks_json);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }

  savePeaks(
    key: { sourcePath: string; fileSizeBytes: number; mtimeMs: number; bucketCount: number },
    peaks: number[],
    now: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO sequence_clip_peaks (source_path, file_size_bytes, mtime_ms, bucket_count, peaks_json, computed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_path, file_size_bytes, mtime_ms, bucket_count)
         DO UPDATE SET peaks_json = excluded.peaks_json, computed_at = excluded.computed_at`,
      )
      .run(
        key.sourcePath,
        key.fileSizeBytes,
        key.mtimeMs,
        key.bucketCount,
        JSON.stringify(peaks),
        now,
      );
  }
}
