import { randomUUID } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ChildLogger } from '../../logging/logger';
import { runMigrations } from '../migration-runner';
import { SequenceRepository } from '../repositories/sequence-repository';
import type { TrackFolder } from '@shared';

const dummyLogger: ChildLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  createChildLogger: () => dummyLogger,
} as unknown as ChildLogger;

describe('SequenceRepository - Track Folders (Milestone S159)', () => {
  let db: BetterSqlite3.Database;
  let repo: SequenceRepository;
  const projectId = 'proj-folders-test';

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db, dummyLogger);
    repo = new SequenceRepository(db);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, aspect_ratio, fps, width, height, created_at, updated_at)
       VALUES (?, ?, '16:9', 30, 1920, 1080, ?, ?)`
    ).run(projectId, 'Test Project', now, now);
  });

  it('creates and lists track folders for a sequence', () => {
    const doc = repo.create({ projectId, name: 'Episode 1' }, new Date().toISOString());
    expect(doc.folders).toEqual([]);

    const folder = repo.createFolder({
      sequenceId: doc.sequence.id,
      name: 'VFX & Overlays',
      kind: 'video',
      color: '#3b82f6',
    });

    expect(folder.id).toBeDefined();
    expect(folder.name).toBe('VFX & Overlays');
    expect(folder.kind).toBe('video');
    expect(folder.color).toBe('#3b82f6');
    expect(folder.collapsed).toBe(false);
    expect(folder.muted).toBe(false);
    expect(folder.locked).toBe(false);
    expect(folder.visible).toBe(true);

    const list = repo.listFolders(doc.sequence.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(folder.id);

    const fetched = repo.getFolder(folder.id);
    expect(fetched?.name).toBe('VFX & Overlays');
  });

  it('updates track folder metadata and state toggles', () => {
    const doc = repo.create({ projectId, name: 'Episode 2' }, new Date().toISOString());
    const folder = repo.createFolder({
      sequenceId: doc.sequence.id,
      name: 'Audio Stems',
      kind: 'audio',
    });

    const updated = repo.updateFolder(folder.id, {
      name: 'Dialogue & Foley',
      collapsed: true,
      muted: true,
      locked: true,
      visible: false,
      color: '#ef4444',
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Dialogue & Foley');
    expect(updated?.collapsed).toBe(true);
    expect(updated?.muted).toBe(true);
    expect(updated?.locked).toBe(true);
    expect(updated?.visible).toBe(false);
    expect(updated?.color).toBe('#ef4444');

    const fresh = repo.getFolder(folder.id);
    expect(fresh?.collapsed).toBe(true);
    expect(fresh?.muted).toBe(true);
  });

  it('assigns tracks to a folder and clears assignment when folder is deleted', () => {
    const doc = repo.create({ projectId, name: 'Episode 3' }, new Date().toISOString());
    const audioTrack = doc.tracks.find((t) => t.kind === 'audio');
    expect(audioTrack).toBeDefined();
    expect(audioTrack?.folderId).toBeNull();

    const folder = repo.createFolder({
      sequenceId: doc.sequence.id,
      name: 'Music & Ambience',
      kind: 'audio',
    });

    // Assign track to folder
    const assignedTrack = repo.setTrackFolder(audioTrack!.id, folder.id);
    expect(assignedTrack?.folderId).toBe(folder.id);

    // Verify in whole document
    const docWithFolder = repo.get(doc.sequence.id);
    const assignedInDoc = docWithFolder?.tracks.find((t) => t.id === audioTrack!.id);
    expect(assignedInDoc?.folderId).toBe(folder.id);

    // Delete folder - child track folderId should reset to NULL
    repo.deleteFolder(folder.id);
    expect(repo.getFolder(folder.id)).toBeNull();

    const docAfterDelete = repo.get(doc.sequence.id);
    const trackAfterDelete = docAfterDelete?.tracks.find((t) => t.id === audioTrack!.id);
    expect(trackAfterDelete?.folderId).toBeNull();
  });

  it('preserves and restores folders during whole-document replaceDocument snapshot', () => {
    const doc = repo.create({ projectId, name: 'Episode 4' }, new Date().toISOString());
    const folderId = randomUUID();

    const snapshotFolders: TrackFolder[] = [
      {
        id: folderId,
        sequenceId: doc.sequence.id,
        name: 'Graphics Group',
        kind: 'video',
        collapsed: true,
        muted: false,
        locked: true,
        visible: true,
        color: '#8b5cf6',
        parentFolderId: null,
        audioBusId: null,
      },
    ];

    const tracksWithFolder = doc.tracks.map((t, idx) =>
      idx === 0 ? { ...t, folderId } : t,
    );

    const replaced = repo.replaceDocument(
      doc.sequence.id,
      {
        tracks: tracksWithFolder,
        clips: doc.clips,
        spineTrackId: doc.sequence.spineTrackId ?? null,
        folders: snapshotFolders,
      },
      new Date().toISOString(),
    );

    expect(replaced).not.toBeNull();
    expect(replaced?.folders).toHaveLength(1);
    expect(replaced?.folders?.[0].id).toBe(folderId);
    expect(replaced?.folders?.[0].name).toBe('Graphics Group');
    expect(replaced?.folders?.[0].collapsed).toBe(true);
    expect(replaced?.folders?.[0].locked).toBe(true);

    const spineTrack = replaced?.tracks.find((t) => t.id === tracksWithFolder[0].id);
    expect(spineTrack?.folderId).toBe(folderId);
  });

  it('cascades folder deletion when sequence is deleted', () => {
    const doc = repo.create({ projectId, name: 'Episode 5' }, new Date().toISOString());
    const folder = repo.createFolder({
      sequenceId: doc.sequence.id,
      name: 'To Delete',
      kind: 'video',
    });

    expect(repo.getFolder(folder.id)).not.toBeNull();
    repo.delete(doc.sequence.id);

    expect(repo.get(doc.sequence.id)).toBeNull();
    expect(repo.getFolder(folder.id)).toBeNull();
  });
});
