import type BetterSqlite3 from 'better-sqlite3';

import type { Migration } from '../migration-runner';

/**
 * Migration 004 — Adds `sequence_track_folders` table and `folder_id` on `sequence_tracks`.
 * Milestone S159: Hierarchical Track Folders (Track Groups) with collapse, bulk mute,
 * bulk lock, visibility, and submix routing.
 */
export const migration004: Migration = {
  version: 4,
  name: 'add-track-folders',
  up: (db: BetterSqlite3.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sequence_track_folders (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('video', 'audio')),
        collapsed INTEGER NOT NULL DEFAULT 0,
        muted INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 1,
        color TEXT,
        parent_folder_id TEXT REFERENCES sequence_track_folders(id) ON DELETE SET NULL,
        audio_bus_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_track_folders_seq ON sequence_track_folders(sequence_id);
    `);

    const columns = db.pragma('table_info(sequence_tracks)') as { name: string }[];
    if (!columns.some((c) => c.name === 'folder_id')) {
      db.exec(`ALTER TABLE sequence_tracks ADD COLUMN folder_id TEXT REFERENCES sequence_track_folders(id) ON DELETE SET NULL;`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sequence_tracks_folder ON sequence_tracks(folder_id);`);
    }
  },
};
