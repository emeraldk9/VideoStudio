import fs from 'node:fs';

import type BetterSqlite3 from 'better-sqlite3';

import type { ClipProbe, ClipSoundSegmentation, ClipTimeWindow } from '@shared';

interface ClipProbeRow {
  duration_seconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_audio: number;
  audio_sample_rate: number | null;
  segmentation_json: string;
  silences_json: string;
  noise_db: number;
  min_silence_seconds: number;
}

export interface ClipProbeKey {
  sourcePath: string;
  fileSizeBytes: number;
  mtimeMs: number;
  noiseDb: number;
  minSilenceSec: number;
}

export function clipProbeKey(
  sourcePath: string,
  options: { noiseDb: number; minSilenceSec: number },
): ClipProbeKey | null {
  try {
    const stat = fs.statSync(sourcePath);
    return {
      sourcePath,
      fileSizeBytes: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      noiseDb: options.noiseDb,
      minSilenceSec: options.minSilenceSec,
    };
  } catch {
    return null;
  }
}

export class ClipProbeRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  get(key: ClipProbeKey): ClipProbe | null {
    const row = this.db
      .prepare(
        `SELECT duration_seconds, width, height, fps, has_audio, audio_sample_rate,
                segmentation_json, silences_json, noise_db, min_silence_seconds
           FROM clip_probes
          WHERE source_path = ? AND file_size_bytes = ? AND mtime_ms = ?
            AND noise_db = ? AND min_silence_seconds = ?`,
      )
      .get(
        key.sourcePath,
        key.fileSizeBytes,
        key.mtimeMs,
        key.noiseDb,
        key.minSilenceSec,
      ) as ClipProbeRow | undefined;

    return row ? this.toProbe(row) : null;
  }

  upsert(key: ClipProbeKey, probe: ClipProbe, id: string, probedAt: string): void {
    this.db
      .prepare(
        `INSERT INTO clip_probes (
           id, source_path, file_size_bytes, mtime_ms, noise_db, min_silence_seconds,
           duration_seconds, width, height, fps, has_audio, audio_sample_rate,
           segmentation_json, silences_json, probed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_path, file_size_bytes, mtime_ms, noise_db, min_silence_seconds)
         DO UPDATE SET
           duration_seconds = excluded.duration_seconds,
           width = excluded.width,
           height = excluded.height,
           fps = excluded.fps,
           has_audio = excluded.has_audio,
           audio_sample_rate = excluded.audio_sample_rate,
           segmentation_json = excluded.segmentation_json,
           silences_json = excluded.silences_json,
           probed_at = excluded.probed_at`,
      )
      .run(
        id,
        key.sourcePath,
        key.fileSizeBytes,
        key.mtimeMs,
        key.noiseDb,
        key.minSilenceSec,
        probe.durationSec,
        probe.width,
        probe.height,
        probe.fps,
        probe.hasAudio ? 1 : 0,
        probe.audioSampleRate,
        JSON.stringify(probe.segmentation),
        JSON.stringify(probe.silences),
        probedAt,
      );
  }

  deleteForPath(sourcePath: string): void {
    this.db.prepare('DELETE FROM clip_probes WHERE source_path = ?').run(sourcePath);
  }

  private toProbe(row: ClipProbeRow): ClipProbe {
    return {
      durationSec: row.duration_seconds,
      decodedSec: null,
      width: row.width,
      height: row.height,
      fps: row.fps,
      hasAudio: row.has_audio === 1,
      audioSampleRate: row.audio_sample_rate,
      silences: parseJson<ClipTimeWindow[]>(row.silences_json, []),
      segmentation: parseJson<ClipSoundSegmentation>(row.segmentation_json, {
        kind: 'none',
        reason: 'continuous-sound',
      }),
      noiseDb: row.noise_db,
      minSilenceSec: row.min_silence_seconds,
    };
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
