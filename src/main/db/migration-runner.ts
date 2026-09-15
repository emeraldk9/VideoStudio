import type BetterSqlite3 from 'better-sqlite3';

import type { ChildLogger } from '../logging/logger';

import { migration001 } from './migrations/001-init-videostudio';

export interface Migration {
  version: number;
  name: string;
  up: (db: BetterSqlite3.Database) => void;
}

const MIGRATIONS: Migration[] = [migration001];

export const LATEST_MIGRATION_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export class MigrationFailedError extends Error {
  constructor(
    readonly version: number,
    readonly migrationName: string,
    readonly fromVersion: number,
    readonly cause: unknown,
  ) {
    super(
      `Migration ${migrationName} failed on a database at schema version ${fromVersion}: ${String(cause)}`,
    );
    this.name = 'MigrationFailedError';
  }
}

export function runMigrations(db: BetterSqlite3.Database, logger: ChildLogger): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (pending.length === 0) {
    return;
  }

  db.pragma('foreign_keys = OFF');
  try {
    for (const migration of pending) {
      try {
        db.transaction(() => {
          migration.up(db);
          db.pragma(`user_version = ${migration.version}`);
        })();
      } catch (err) {
        logger.error('Migration failed', {
          version: migration.version,
          name: migration.name,
          fromVersion: current,
          err: String(err),
        });
        throw new MigrationFailedError(migration.version, migration.name, current, err);
      }
      logger.info('Applied migration', { version: migration.version, name: migration.name });
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
