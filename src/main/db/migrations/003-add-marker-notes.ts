import type BetterSqlite3 from 'better-sqlite3';

import type { Migration } from '../migration-runner';

/**
 * Migration 003 — Adds `notes` column to `sequence_markers` table.
 * Allows timeline markers to store multi-line commentary, review feedback,
 * and editorial cues alongside their name, frame, color, and locked status.
 */
export const migration003: Migration = {
  version: 3,
  name: 'add-marker-notes',
  up: (db: BetterSqlite3.Database) => {
    // Check if notes column already exists before altering
    const columns = db.pragma('table_info(sequence_markers)') as { name: string }[];
    if (!columns.some((c) => c.name === 'notes')) {
      db.exec(`ALTER TABLE sequence_markers ADD COLUMN notes TEXT NOT NULL DEFAULT '';`);
    }
  },
};
