import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ChildLogger } from '../logging/logger';

/**
 * Beta S154 phase 7 — the stage-1 render cache, deferred since S145 §7 as
 * "pure optimisation" and worth its keep now that compositing multiplied the
 * per-render encode count.
 *
 * **Content-addressed, stage 1 only.** A normalized segment is a pure
 * function of (the ffmpeg args that produce it) × (the source file's
 * content), so the key is a hash of the args — volatile paths replaced by
 * placeholders — plus the source's `size + mtime` identity, the same
 * structural convention `tts_clip_probes` and the peaks cache already use. A
 * re-render of an unchanged clip reuses the segment; touching the file, the
 * geometry, the fps, an effect or the draft flag misses by construction.
 * Cross-clip stages (join, layers, composite, audio) are never cached — their
 * inputs change whenever any clip does.
 *
 * Eviction is size-capped LRU by file mtime (a hit re-touches), run after
 * each render rather than on a timer — the only writer is the render, so
 * that is the only moment the cap can be newly exceeded.
 *
 * The cache is **optional by construction**: the service treats a `null`
 * cache as "always miss, never store", so tests and any environment without
 * a userData dir render exactly as before.
 */

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export class SegmentCache {
  constructor(
    private readonly directory: string,
    private readonly logger: ChildLogger,
    private readonly maxBytes = DEFAULT_MAX_BYTES,
  ) {}

  /** Stable key for a descriptor. Callers strip volatile paths before hashing. */
  static keyFor(descriptor: unknown): string {
    return createHash('sha1').update(JSON.stringify(descriptor)).digest('hex');
  }

  private pathFor(key: string, extension: string): string {
    return path.join(this.directory, `${key}${extension}`);
  }

  /** The cached segment's path, or `null`. A hit re-touches mtime for the LRU. */
  async get(key: string, extension: string): Promise<string | null> {
    const cachedPath = this.pathFor(key, extension);
    try {
      const now = new Date();
      await fs.promises.utimes(cachedPath, now, now);
      return cachedPath;
    } catch {
      return null;
    }
  }

  /**
   * Stores a produced segment and returns the cached path. Copy-then-rename
   * so a crash mid-copy leaves a `.tmp` orphan (swept by eviction), never a
   * truncated file a later render would trust.
   */
  async put(key: string, extension: string, producedPath: string): Promise<string> {
    const cachedPath = this.pathFor(key, extension);
    const temporaryPath = `${cachedPath}.tmp`;
    try {
      await fs.promises.mkdir(this.directory, { recursive: true });
      await fs.promises.copyFile(producedPath, temporaryPath);
      await fs.promises.rename(temporaryPath, cachedPath);
      return cachedPath;
    } catch (error) {
      // A failed store is a missed optimisation, never a failed render.
      this.logger.warn('segment cache store failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
      return producedPath;
    }
  }

  /** LRU sweep down to the cap; also clears crash-orphaned `.tmp` files. */
  async evict(): Promise<void> {
    let entries: { path: string; size: number; mtimeMs: number }[] = [];
    try {
      const names = await fs.promises.readdir(this.directory);
      entries = (
        await Promise.all(
          names.map(async (name) => {
            const filePath = path.join(this.directory, name);
            try {
              const stat = await fs.promises.stat(filePath);
              if (name.endsWith('.tmp')) {
                await fs.promises.rm(filePath, { force: true });
                return null;
              }
              return { path: filePath, size: stat.size, mtimeMs: stat.mtimeMs };
            } catch {
              return null;
            }
          }),
        )
      ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    } catch {
      return; // No directory yet — nothing to evict.
    }

    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= this.maxBytes) return;
    const oldestFirst = entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of oldestFirst) {
      if (total <= this.maxBytes) break;
      await fs.promises.rm(entry.path, { force: true }).catch(() => undefined);
      total -= entry.size;
    }
    this.logger.info('segment cache evicted to cap', { totalBytes: total });
  }
}

/** The source half of a media segment's identity — size + mtime, never content reads. */
export async function sourceIdentity(filePath: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    return { size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  } catch {
    return null;
  }
}
