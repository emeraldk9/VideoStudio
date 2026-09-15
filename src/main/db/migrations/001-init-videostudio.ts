import type BetterSqlite3 from 'better-sqlite3';

import type { Migration } from '../migration-runner';

export const migration001: Migration = {
  version: 1,
  name: 'init-videostudio',
  up: (db: BetterSqlite3.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aspect_ratio TEXT NOT NULL DEFAULT '16:9',
        fps INTEGER NOT NULL DEFAULT 30,
        width INTEGER NOT NULL DEFAULT 1920,
        height INTEGER NOT NULL DEFAULT 1080,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sequences (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        fps REAL NOT NULL DEFAULT 30,
        width INTEGER NOT NULL DEFAULT 1920,
        height INTEGER NOT NULL DEFAULT 1080,
        spine_track_id TEXT,
        still_duration_source TEXT NOT NULL DEFAULT 'shot',
        still_durations_json TEXT,
        still_frame_source TEXT NOT NULL DEFAULT 'start',
        story_episode_id TEXT,
        story_project_root TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sequences_project_id ON sequences(project_id);

      CREATE TABLE IF NOT EXISTS sequence_tracks (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('video', 'audio')),
        role TEXT CHECK(role IN ('narration', 'music', 'text', 'overlay') OR role IS NULL),
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        height_px INTEGER NOT NULL DEFAULT 64,
        magnetic INTEGER NOT NULL DEFAULT 0,
        muted INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        volume REAL NOT NULL DEFAULT 1.0,
        solo INTEGER NOT NULL DEFAULT 0,
        video_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_tracks_seq ON sequence_tracks(sequence_id, order_index);

      CREATE TABLE IF NOT EXISTS sequence_clips (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL REFERENCES sequence_tracks(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        source_kind TEXT NOT NULL,
        output_id TEXT,
        story_shot_id TEXT,
        source_take_id TEXT,
        file_path TEXT,
        label TEXT NOT NULL DEFAULT '',
        start_frames INTEGER,
        duration_frames INTEGER NOT NULL,
        source_in_frames INTEGER,
        source_out_frames INTEGER,
        transition_in TEXT NOT NULL DEFAULT 'cut',
        transition_frames INTEGER NOT NULL DEFAULT 0,
        transition_out TEXT NOT NULL DEFAULT 'cut',
        transition_out_frames INTEGER NOT NULL DEFAULT 0,
        audio_offset_frames INTEGER NOT NULL DEFAULT 0,
        motion_preset TEXT NOT NULL DEFAULT 'static',
        gain_db REAL NOT NULL DEFAULT 0,
        fade_in_frames INTEGER NOT NULL DEFAULT 0,
        fade_out_frames INTEGER NOT NULL DEFAULT 0,
        source_audio_enabled INTEGER NOT NULL DEFAULT 1,
        duck_exempt INTEGER NOT NULL DEFAULT 0,
        overrides_json TEXT NOT NULL DEFAULT '[]',
        effects_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_clips_seq ON sequence_clips(sequence_id, track_id, order_index);

      CREATE TABLE IF NOT EXISTS sequence_clip_keyframes (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        clip_id TEXT NOT NULL REFERENCES sequence_clips(id) ON DELETE CASCADE,
        property TEXT NOT NULL,
        frame INTEGER NOT NULL,
        value REAL NOT NULL,
        interpolation TEXT NOT NULL DEFAULT 'linear'
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_clip_keyframes_seq ON sequence_clip_keyframes(sequence_id);
      CREATE INDEX IF NOT EXISTS idx_sequence_clip_keyframes_clip ON sequence_clip_keyframes(clip_id, property, frame);

      CREATE TABLE IF NOT EXISTS sequence_markers (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        frame INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'ai',
        locked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_markers_seq ON sequence_markers(sequence_id, frame);

      CREATE TABLE IF NOT EXISTS sequence_media (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('video', 'audio', 'still')),
        label TEXT NOT NULL,
        duration_sec REAL,
        imported_at TEXT NOT NULL,
        cleaned_at TEXT,
        cleaned_engine TEXT,
        cleaned_size INTEGER,
        cleaned_mtime_ms INTEGER,
        UNIQUE(project_id, file_path)
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_media_project ON sequence_media(project_id);

      CREATE TABLE IF NOT EXISTS clip_probes (
        source_key TEXT PRIMARY KEY,
        duration_sec REAL NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        fps REAL NOT NULL,
        has_audio INTEGER NOT NULL,
        has_video INTEGER NOT NULL,
        audio_sample_rate INTEGER,
        audio_channels INTEGER,
        video_codec TEXT,
        audio_codec TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS filmstrip_cache (
        source_path TEXT PRIMARY KEY,
        mtime_ms INTEGER NOT NULL,
        tile_count INTEGER NOT NULL,
        sheet_paths_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Default project seed
      INSERT OR IGNORE INTO projects (id, name, aspect_ratio, fps, width, height, created_at, updated_at)
      VALUES ('default', 'Default Project', '16:9', 30, 1920, 1080, datetime('now'), datetime('now'));
    `);
  },
};
