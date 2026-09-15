import { app } from 'electron';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { Logger } from '../logging/logger';

import { runMigrations } from './migration-runner';

const logger = Logger.createChildLogger('database-service');

export class DatabaseCorruptError extends Error {
  constructor(
    readonly dbPath: string,
    readonly backupPath: string | null,
    readonly integrity: string,
    readonly repairError?: string,
  ) {
    super(
      `Database at ${dbPath} is corrupt and could not be repaired` +
        (repairError ? ` (${repairError})` : '') +
        (backupPath ? `. A copy of the damaged file is at ${backupPath}` : ''),
    );
    this.name = 'DatabaseCorruptError';
  }
}

function backupCorruptDatabase(dbPath: string): string | null {
  if (dbPath === ':memory:') {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const target = `${dbPath}.corrupted-${stamp}`;
  try {
    copyFileSync(dbPath, target);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(`${dbPath}${suffix}`)) {
        copyFileSync(`${dbPath}${suffix}`, `${target}${suffix}`);
      }
    }
    logger.warn('Copied the damaged database aside before repairing', { target });
    return target;
  } catch (err) {
    logger.error('Could not back up the damaged database', { target, err: String(err) });
    return null;
  }
}

export class DatabaseService {
  private readonly db: BetterSqlite3.Database;

  constructor(dbPath?: string) {
    let resolvedPath = dbPath;
    if (!resolvedPath) {
      try {
        resolvedPath = path.join(app.getPath('userData'), 'videostudio.db');
      } catch {
        resolvedPath = path.join(process.cwd(), 'videostudio.db');
      }
    }

    this.db = new BetterSqlite3(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    const integrity = this.db.pragma('integrity_check', { simple: true }) as string;
    if (integrity !== 'ok') {
      logger.warn('Integrity check failed on launch; running REINDEX to recover', { integrity });
      const backupPath = backupCorruptDatabase(resolvedPath);
      try {
        this.db.exec('REINDEX');
        const recheck = this.db.pragma('integrity_check', { simple: true }) as string;
        if (recheck !== 'ok') {
          throw new DatabaseCorruptError(resolvedPath, backupPath, recheck);
        }
        logger.info('Database repaired successfully via REINDEX');
      } catch (err) {
        if (err instanceof DatabaseCorruptError) throw err;
        throw new DatabaseCorruptError(resolvedPath, backupPath, integrity, String(err));
      }
    }

    runMigrations(this.db, logger);
  }

  getConnection(): BetterSqlite3.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
