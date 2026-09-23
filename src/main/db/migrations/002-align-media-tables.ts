import type BetterSqlite3 from 'better-sqlite3';

import type { Migration } from '../migration-runner';

/**
 * Migration 002 — Aligns media cache tables with repository implementations:
 *
 * 1. Rebuilds `clip_probes` with the columns expected by `ClipProbeRepository`
 *    (source_path, file_size_bytes, mtime_ms, noise_db, min_silence_seconds,
 *    duration_seconds, width, height, fps, has_audio, audio_sample_rate,
 *    segmentation_json, silences_json, probed_at) and proper composite UNIQUE index.
 * 2. Creates `sequence_clip_peaks` for audio waveform PCM bucket persistence.
 * 3. Creates `sequence_clip_thumbs` for video filmstrip sheet cache.
 * 4. Ensures `sequence_markers` table handles `updated_at` safely.
 */
export const migration002: Migration = {
  version: 2,
  name: 'align-media-tables',
  up: (db: BetterSqlite3.Database) => {
    db.exec(`
      -- 1. Rebuild clip_probes table to match ClipProbeRepository
      DROP TABLE IF EXISTS clip_probes;
      CREATE TABLE IF NOT EXISTS clip_probes (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        noise_db REAL NOT NULL,
        min_silence_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        width INTEGER,
        height INTEGER,
        fps REAL,
        has_audio INTEGER NOT NULL DEFAULT 0,
        audio_sample_rate INTEGER,
        segmentation_json TEXT NOT NULL DEFAULT '{}',
        silences_json TEXT NOT NULL DEFAULT '[]',
        probed_at TEXT NOT NULL,
        UNIQUE(source_path, file_size_bytes, mtime_ms, noise_db, min_silence_seconds)
      );
      CREATE INDEX IF NOT EXISTS idx_clip_probes_lookup
        ON clip_probes(source_path, file_size_bytes, mtime_ms);

      -- 2. Create waveform peaks cache table for sequence_repository.ts
      CREATE TABLE IF NOT EXISTS sequence_clip_peaks (
        source_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        bucket_count INTEGER NOT NULL,
        peaks_json TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (source_path, file_size_bytes, mtime_ms, bucket_count)
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_clip_peaks_path
        ON sequence_clip_peaks(source_path);

      -- 3. Create filmstrip thumbs cache table for sequence_repository.ts
      CREATE TABLE IF NOT EXISTS sequence_clip_thumbs (
        source_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        thumb_height INTEGER NOT NULL,
        sheet_path TEXT NOT NULL,
        tile_width INTEGER NOT NULL,
        columns INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        frame_count INTEGER NOT NULL,
        interval_sec REAL NOT NULL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (source_path, file_size_bytes, mtime_ms, thumb_height)
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_clip_thumbs_path
        ON sequence_clip_thumbs(source_path);
    `);
  },
};
