import { randomUUID } from 'node:crypto';

import type BetterSqlite3 from 'better-sqlite3';

import type { AspectRatioOption, ProjectRecord } from '@shared';

interface ProjectRow {
  id: string;
  name: string;
  aspect_ratio: string;
  fps: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export class ProjectRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  list(): ProjectRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as ProjectRow[];
    return rows.map((r) => this.toRecord(r));
  }

  get(id: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
    return row ? this.toRecord(row) : null;
  }

  create(input: { name: string; aspectRatio?: AspectRatioOption; fps?: number }): ProjectRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const aspect = input.aspectRatio ?? '16:9';
    const fps = input.fps ?? 30;
    const { width, height } = this.dimensionsForAspect(aspect);

    this.db
      .prepare(
        `INSERT INTO projects (id, name, aspect_ratio, fps, width, height, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name.trim(), aspect, fps, width, height, now, now);

    return {
      id,
      name: input.name.trim(),
      aspectRatio: aspect,
      fps,
      width,
      height,
      createdAt: now,
      updatedAt: now,
    };
  }

  rename(id: string, name: string): ProjectRecord | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), now, id);
    return this.get(id);
  }

  updateSettings(
    id: string,
    settings: { aspectRatio?: AspectRatioOption; fps?: number },
  ): ProjectRecord | null {
    const current = this.get(id);
    if (!current) return null;

    const aspect = settings.aspectRatio ?? current.aspectRatio;
    const fps = settings.fps ?? current.fps;
    const { width, height } = this.dimensionsForAspect(aspect);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE projects SET aspect_ratio = ?, fps = ?, width = ?, height = ?, updated_at = ? WHERE id = ?`,
      )
      .run(aspect, fps, width, height, now, id);

    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  private dimensionsForAspect(aspect: AspectRatioOption): { width: number; height: number } {
    switch (aspect) {
      case '9:16':
        return { width: 1080, height: 1920 };
      case '1:1':
        return { width: 1080, height: 1080 };
      case '4:5':
        return { width: 1080, height: 1350 };
      case '21:9':
        return { width: 2560, height: 1080 };
      case '16:9':
      default:
        return { width: 1920, height: 1080 };
    }
  }

  private toRecord(row: ProjectRow): ProjectRecord {
    return {
      id: row.id,
      name: row.name,
      aspectRatio: row.aspect_ratio as AspectRatioOption,
      fps: row.fps,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
