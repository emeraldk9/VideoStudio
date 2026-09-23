import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import {
  buildOtioDocument,
  buildTimelineFullJson,
  buildTimelineSetupJson,
  parseTimelineSetupFile,
  IPC_CHANNELS,
  IPC_SCHEMAS,
  MEDIA_IMPORT_EXTENSIONS,
  mediaKindForPath,
  PEAK_BUCKET_COUNT,
  toMediaUrl,
  type ClipProbe,
  type FilmstripSheet,
  type ImportedMediaFile,
  type MediaSourceKind,
  type PickedMediaFile,
  type RemoveImportedMediaResult,
  type RenderEncoderInfo,
  type Sequence,
  type SequenceDocument,
  type SequenceMarker,
  type SequenceRenderResult,
  type WhiteboardTraceMapPayload,
} from '@shared';

import type { ClipProbeRepository } from '../db/repositories/clip-probe-repository';
import { clipProbeKey } from '../db/repositories/clip-probe-repository';
import type {
  FilmstripCacheEntry,
  SequenceRepository,
} from '../db/repositories/sequence-repository';
import type { ChildLogger } from '../logging/logger';
import { probeClip } from '../media/clip-probe';
import {
  buildFilmstripArgs,
  filmstripSheetPath,
  FILMSTRIP_TILE_HEIGHT,
  planFilmstrip,
  tileWidthFor,
} from '../media/filmstrip';
import { decodeGrayPng } from '../media/png-encode';
import { resolveRenderEncoder } from '../media/render-encoder';
import { buildPeaksArgs } from '../media/sequence-normalize';
import type { SequenceRenderService } from '../media/sequence-render-service';
import { probeFfmpegCapabilities } from '../media/watermark-capabilities';
import { ensureTraceArtifact } from '../media/whiteboard-trace';
import { showOpenDialog, showSaveDialog } from '../windows/native-dialog';

import { withValidation } from './with-validation';


const execFileAsync = util.promisify(execFile);

/**
 * Beta S145 — the Timeline Editor's IPC surface.
 *
 * Every handler goes through `withValidation`, so nothing here trusts a
 * renderer payload (CLAUDE.md's rule). Two things are worth naming because
 * they are the security-relevant decisions rather than the obvious ones:
 *
 * - **The export path comes from a native save dialog, never from the
 *   renderer.** `SEQUENCE_CHOOSE_EXPORT_PATH` returns a path the *user* picked
 *   and `SEQUENCE_RENDER` writes to it. A renderer-supplied path would let the
 *   renderer name any file on disk as a write target.
 * - **`sequenceId` from the channel wins over any id inside the payload.** The
 *   repository ignores each clip's own `sequenceId` on write, so a clip cannot
 *   be relocated into another sequence by relabelling it.
 */

/** The probe settings the timeline reads with. Silence detection is irrelevant here — this wants duration, geometry and fps. */
const TIMELINE_PROBE_OPTIONS = { noiseDb: -30, minSilenceSec: 0.25 } as const;

/**
 * S222 — the ceiling on a picked durations file. A real one is a few hundred
 * rows; 4 MB is a mispick, and finding that out by reading it into a string
 * and pushing it across IPC is the expensive way.
 */
const MAX_DURATIONS_FILE_BYTES = 4 * 1024 * 1024;

export interface SequenceIpcDependencies {
  sequences: SequenceRepository;
  probes: ClipProbeRepository;
  renderer: SequenceRenderService;
  /**
   * S253 — called when a render settles, however it settles.
   *
   * The taskbar/dock progress the notifier sets has to be cleared, and the
   * progress stream cannot do it: a render that throws emits no final event,
   * so a failed export would leave the taskbar frozen at whatever fraction it
   * died on — outliving the app's own error toast, and on Windows outliving
   * the window itself if the user closes it. `finally` around the one call
   * that owns a render's lifetime is the only place that sees every ending.
   */
  onRenderSettled: () => void;
  ffmpegPath: string;
  /**
   * S182 — the directory `media://` serves without an allowlist entry
   * (`userData/projects`). Filmstrip sheets are written inside it precisely so
   * this feature needs no new grant; passed in rather than recomputed here so
   * one definition of "the managed root" reaches both the protocol and the
   * cache.
   */
  managedOutputsRoot: string;
  /**
   * Beta S213 — whether this app may read a file the renderer named.
   *
   * **The same predicate `media://` is registered with**, passed in rather than
   * rebuilt, because the two questions are one question: a file the protocol
   * will serve to page content is a file this process will decode for it, and
   * two answers would drift the first time either was widened.
   *
   * It is an allowlist derived from **data, not a directory** — the managed
   * outputs root, plus rows the user themselves created by attaching a
   * reference, opening a Story project, or importing media into the pool.
   * Page content cannot add to it, enumerate it, or walk between entries, and
   * a path whose row is deleted stops being readable in the same instant.
   *
   * Three handlers here spawn ffmpeg against a renderer-supplied path
   * (`SEQUENCE_PROBE_SOURCES`, `SEQUENCE_GET_PEAKS`, `SEQUENCE_GET_FILMSTRIP`)
   * and none of them checked anything before this step, while every
   * ffmpeg-spawning channel in `tts-ipc.ts` had guarded since S106.
   */
  isServableMedia: (absolutePath: string) => boolean;
  logger: ChildLogger;
}

/**
 * Buckets raw mono PCM into `PEAK_BUCKET_COUNT` normalized magnitudes.
 *
 * Pure and exported so a test can feed it a known buffer. Peaks are a *shape*,
 * not a signal: the lane draws them as a filled polyline, so one magnitude per
 * bucket is enough and a min/max pair per bucket would double the payload for
 * a symmetry the eye supplies anyway.
 */
export function bucketPeaks(pcm: Buffer, bucketCount: number): number[] {
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount === 0) return [];
  const buckets = Math.max(1, bucketCount);
  const perBucket = Math.max(1, Math.floor(sampleCount / buckets));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * perBucket;
    if (start >= sampleCount) break;
    const end = Math.min(start + perBucket, sampleCount);
    let peak = 0;
    for (let sample = start; sample < end; sample += 1) {
      const value = Math.abs(pcm.readInt16LE(sample * 2));
      if (value > peak) peak = value;
    }
    // 32767 rather than 32768: `readInt16LE` returns -32768..32767, and
    // dividing by the larger bound would make a full-scale positive peak read
    // as 0.99997 instead of 1.
    peaks.push(Math.min(1, peak / 32767));
  }
  return peaks;
}

export function registerSequenceIpcHandlers(deps: SequenceIpcDependencies): void {
  const { sequences, probes, renderer, onRenderSettled, ffmpegPath, managedOutputsRoot, isServableMedia, logger } =
    deps;

  /**
   * Refuses a path this app has no record of, before ffmpeg is spawned on it.
   *
   * Returns a boolean rather than throwing: all three call sites already treat
   * an unreadable file as `null` — a take can be deleted between listing it and
   * measuring it — so a refusal travels the path the callers already handle.
   * The refusal is logged with the path, because it is always either a bug in
   * the allowlist or an attempt worth seeing.
   */
  const mayRead = (sourcePath: string, channel: string): boolean => {
    if (isServableMedia(path.resolve(sourcePath))) {
      return true;
    }
    logger.warn('refused ffmpeg on a path this app has no record of', { sourcePath, channel });
    return false;
  };
  const now = () => new Date().toISOString();

  /**
   * A file's duration, through the same cache every other timeline
   * measurement uses — so re-adding a file someone probed before is one stat,
   * not one decode.
   *
   * `null` on an unreadable file rather than a throw: that is a fact worth
   * carrying, not an exception worth raising. The pool still shows the file
   * and the preflight is what names it. Shared by the pick and drop routes
   * (S180) so an import measures identically however it arrived.
   */
  const measure = async (filePath: string): Promise<number | null> => {
    const key = clipProbeKey(filePath, TIMELINE_PROBE_OPTIONS);
    if (!key) return null;
    // S245 — a still now probes successfully with `durationSec: 0` instead of
    // throwing. `null` is what this helper has always returned for a file with
    // no length, and the import paths are built on that, so map it back rather
    // than letting a 0 travel where a `?? default` would stop treating it as
    // "unknown".
    const lengthOf = (probe: ClipProbe): number | null =>
      probe.durationSec > 0 ? probe.durationSec : null;
    let cached: ClipProbe | null = null;
    try {
      cached = probes.get(key);
    } catch (cacheErr) {
      logger.warn('probes.get failed', { filePath, error: String(cacheErr) });
    }
    if (cached) return lengthOf(cached);
    try {
      const probe = await probeClip(filePath, ffmpegPath, TIMELINE_PROBE_OPTIONS);
      try {
        probes.upsert(key, probe, randomUUID(), now());
      } catch (cacheErr) {
        logger.warn('probes.upsert failed', { filePath, error: String(cacheErr) });
      }
      return lengthOf(probe);
    } catch (error) {
      logger.warn('import probe failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_LIST,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_LIST], (_event, payload): Sequence[] =>
      sequences.list(payload.projectId),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_GET,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_GET],
      (_event, payload): SequenceDocument | null => sequences.get(payload.sequenceId),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_CREATE,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_CREATE], (_event, payload): SequenceDocument =>
      sequences.create(payload, now()),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_RENAME,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_RENAME], (_event, payload): Sequence | null =>
      sequences.rename(payload.sequenceId, payload.name, now()),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_DELETE,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_DELETE], (_event, payload): void => {
      sequences.delete(payload.sequenceId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_UPDATE_SETTINGS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_UPDATE_SETTINGS],
      (_event, payload): SequenceDocument | null =>
        sequences.updateSettings(
          payload.sequenceId,
          {
            fps: payload.fps,
            width: payload.width,
            height: payload.height,
            // Beta S154 — this was missing, and its absence made Beta S151's
            // H1 a no-op: the schema, the preload bridge, `window-api` and
            // `SequenceRepository.updateSettings` all carried
            // `storyEpisodeId`, and only this handler dropped it on the floor.
            // So "an unbound sequence adopts the episode it was first filled
            // from" never persisted, and re-sync kept reading whichever
            // episode the Story Builder happened to have open — the exact
            // failure H1 was written to fix. `undefined` still means "keep"
            // and `null` still means "unbind"; the repository owns that rule.
            storyEpisodeId: payload.storyEpisodeId,
            // S258 — the story folder that qualifies the episode id. Forwarded
            // beside it for the reason the comment above exists: a binding half
            // that the schema, the bridge and the repository all carry, and one
            // handler quietly drops, is a binding that never persists.
            storyProjectRoot: payload.storyProjectRoot,
            // S154 — the spine binding, same lifecycle.
            spineTrackId: payload.spineTrackId,
            // S222 — the still duration source, and the imported map behind
            // its `'file'` mode. Same keep/clear lifecycle again: `undefined`
            // keeps, `null` clears the import.
            stillDurationSource: payload.stillDurationSource,
            stillDurations: payload.stillDurations,
            // S474 — the frame the spine's stills come from, same keep rule.
            stillFrameSource: payload.stillFrameSource,
          },
          now(),
        ),
    ),
  );

  // ---------------------------------------------- Beta S154 — dynamic tracks

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_ADD_TRACK,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_ADD_TRACK],
      (_event, payload): SequenceDocument | null =>
        sequences.addTrack(
          payload.sequenceId,
          payload.kind,
          payload.name,
          now(),
          payload.role ?? null,
        ),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_UPDATE_TRACK,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_UPDATE_TRACK],
      (_event, payload): SequenceDocument | null =>
        sequences.updateTrack(
          payload.sequenceId,
          payload.trackId,
          {
            name: payload.name,
            locked: payload.locked,
            muted: payload.muted,
            // Beta S476 — the eye. Absent from this list since S181 split it
            // out of `muted`, which made the Hide button a perfect no-op: the
            // repository reads `undefined` as "keep", returns the unchanged
            // document, and the store takes it — so the icon did not even
            // flip. Every other layer carried the field.
            videoEnabled: payload.videoEnabled,
            heightPx: payload.heightPx,
            role: payload.role,
          },
          now(),
        ),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_DELETE_TRACK,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_DELETE_TRACK],
      (_event, payload): SequenceDocument | null =>
        sequences.deleteTrack(payload.sequenceId, payload.trackId, now()),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_REORDER_TRACKS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REORDER_TRACKS],
      (_event, payload): SequenceDocument | null =>
        sequences.reorderTracks(payload.sequenceId, payload.kind, payload.orderedIds, now()),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS],
      (_event, payload): SequenceDocument | null =>
        sequences.replaceClips(payload.sequenceId, payload.clips, now()),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_LIST_MARKERS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_LIST_MARKERS],
      (_event, payload): SequenceMarker[] => sequences.listMarkers(payload.sequenceId),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_ADD_MARKER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_ADD_MARKER],
      (_event, payload): SequenceMarker[] | null =>
        sequences.addMarker(
          payload.sequenceId,
          { frame: payload.frame, name: payload.name, notes: payload.notes, color: payload.color, locked: payload.locked },
          now(),
        ),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_UPDATE_MARKER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_UPDATE_MARKER],
      (_event, payload): SequenceMarker[] | null =>
        sequences.updateMarker(payload.sequenceId, payload.markerId, {
          frame: payload.frame,
          name: payload.name,
          notes: payload.notes,
          color: payload.color,
          locked: payload.locked,
        }),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_DELETE_MARKER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_DELETE_MARKER],
      (_event, payload): SequenceMarker[] =>
        sequences.deleteMarker(payload.sequenceId, payload.markerId),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_REPLACE_DOCUMENT,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REPLACE_DOCUMENT],
      (_event, payload): SequenceDocument | null =>
        sequences.replaceDocument(
          payload.sequenceId,
          { tracks: payload.tracks, clips: payload.clips, spineTrackId: payload.spineTrackId },
          now(),
        ),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_PROBE_SOURCES,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_PROBE_SOURCES],
      async (_event, payload): Promise<Record<string, ClipProbe | null>> => {
        const results: Record<string, ClipProbe | null> = {};
        for (const sourcePath of payload.paths) {
          if (!mayRead(sourcePath, 'probeSources')) {
            results[sourcePath] = null;
            continue;
          }
          const key = clipProbeKey(sourcePath, TIMELINE_PROBE_OPTIONS);
          if (!key) {
            // The file is gone. `null` rather than an error: a take can be
            // deleted between listing it and measuring it, and the preflight
            // is the surface that reports it.
            results[sourcePath] = null;
            continue;
          }
          let cached: ClipProbe | null = null;
          try {
            cached = probes.get(key);
          } catch (cacheErr) {
            logger.warn('probes.get failed in probeSources', { sourcePath, error: String(cacheErr) });
          }
          if (cached) {
            results[sourcePath] = cached;
            continue;
          }
          try {
            const probe = await probeClip(sourcePath, ffmpegPath, TIMELINE_PROBE_OPTIONS);
            try {
              probes.upsert(key, probe, randomUUID(), now());
            } catch (cacheErr) {
              logger.warn('probes.upsert failed in probeSources', { sourcePath, error: String(cacheErr) });
            }
            results[sourcePath] = probe;
          } catch (error) {
            logger.warn('timeline probe failed', {
              sourcePath,
              error: error instanceof Error ? error.message : String(error),
            });
            results[sourcePath] = null;
          }
        }
        return results;
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_TRACE_WHITEBOARD,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_TRACE_WHITEBOARD],
      async (_event, payload): Promise<WhiteboardTraceMapPayload | null> => {
        // S278 — the S213 guard, like every ffmpeg-spawning channel here.
        // `null` travels the path the preview already handles: it keeps the
        // wipe approximation.
        if (!mayRead(payload.filePath, 'traceWhiteboard')) {
          return null;
        }
        try {
          const artifact = await ensureTraceArtifact({
            ffmpegPath,
            filePath: payload.filePath,
            trace: payload.trace,
            frameWidth: payload.frameWidth,
            frameHeight: payload.frameHeight,
            cacheDir: path.join(app.getPath('userData'), 'whiteboard-trace'),
          });
          // The raw gray plane, not the path: `media://` does not serve the
          // trace cache, and the canvas loop wants bytes anyway.
          const decoded = decodeGrayPng(await fs.promises.readFile(artifact.mapPath));
          return {
            width: decoded.width,
            height: decoded.height,
            mapBase64: Buffer.from(decoded.gray).toString('base64'),
            penPath: artifact.penPath,
          };
        } catch (error) {
          logger.warn('whiteboard trace for preview failed', {
            filePath: payload.filePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_GET_PEAKS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_GET_PEAKS],
      async (_event, payload): Promise<number[] | null> => {
        if (!mayRead(payload.sourcePath, 'getPeaks')) {
          return null;
        }
        let stat: fs.Stats;
        try {
          stat = fs.statSync(payload.sourcePath);
        } catch {
          return null;
        }
        const key = {
          sourcePath: payload.sourcePath,
          fileSizeBytes: stat.size,
          mtimeMs: Math.round(stat.mtimeMs),
          bucketCount: PEAK_BUCKET_COUNT,
        };
        const cached = sequences.getPeaks(key);
        if (cached) return cached;

        try {
          // `encoding: 'buffer'` — the default is utf8, which would mangle
          // every byte of PCM into replacement characters and yield a waveform
          // of noise. Silent corruption, so it is worth naming.
          const { stdout } = await execFileAsync(ffmpegPath, buildPeaksArgs(payload.sourcePath), {
            encoding: 'buffer',
            maxBuffer: 256 * 1024 * 1024,
          });
          const peaks = bucketPeaks(stdout, PEAK_BUCKET_COUNT);
          if (peaks.length === 0) return null;
          sequences.savePeaks(key, peaks, now());
          return peaks;
        } catch (error) {
          logger.warn('waveform extraction failed', {
            sourcePath: payload.sourcePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_GET_FILMSTRIP,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_GET_FILMSTRIP],
      async (_event, payload): Promise<FilmstripSheet | null> => {
        if (!mayRead(payload.sourcePath, 'getFilmstrip')) {
          return null;
        }
        // The `getPeaks` shape, deliberately: stat for identity, consult the
        // cache, extract once, record. The two caches answer different
        // questions about the same file and are keyed the same way, so a
        // re-encode misses both together rather than one of them.
        let stat: fs.Stats;
        try {
          stat = fs.statSync(payload.sourcePath);
        } catch {
          return null;
        }
        const key = {
          sourcePath: payload.sourcePath,
          fileSizeBytes: stat.size,
          mtimeMs: Math.round(stat.mtimeMs),
          tileHeight: FILMSTRIP_TILE_HEIGHT,
        };

        const toSheet = (entry: FilmstripCacheEntry): FilmstripSheet | null => {
          const url = toMediaUrl(entry.sheetPath);
          return url
            ? {
                url,
                tileWidth: entry.tileWidth,
                tileHeight: FILMSTRIP_TILE_HEIGHT,
                columns: entry.columns,
                rows: entry.rows,
                frameCount: entry.frameCount,
                intervalSec: entry.intervalSec,
              }
            : null;
        };

        const cached = sequences.getFilmstrip(key);
        // The row can outlive its sheet — the user emptied the cache directory,
        // or a partial write was cleaned up. Re-extract rather than hand back a
        // URL that 404s, which the lane would render as a silently empty strip.
        if (cached && fs.existsSync(cached.sheetPath)) return toSheet(cached);

        try {
          const probe = await probeClip(payload.sourcePath, ffmpegPath, TIMELINE_PROBE_OPTIONS);
          // No picture, nothing to strip. An audio-only container reaching this
          // channel is not an error, just a question with an empty answer.
          if (!probe.width || !probe.height) return null;

          const geometry = planFilmstrip(probe.durationSec);
          const tileWidth = tileWidthFor(probe.width, probe.height);
          const sheetPath = filmstripSheetPath(managedOutputsRoot, key);
          await fs.promises.mkdir(path.dirname(sheetPath), { recursive: true });
          await execFileAsync(
            ffmpegPath,
            buildFilmstripArgs(payload.sourcePath, sheetPath, geometry, tileWidth),
            { maxBuffer: 32 * 1024 * 1024 },
          );

          const entry: FilmstripCacheEntry = { sheetPath, tileWidth, ...geometry };
          sequences.saveFilmstrip(key, entry, now());
          return toSheet(entry);
        } catch (error) {
          logger.warn('filmstrip extraction failed', {
            sourcePath: payload.sourcePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_CAPTURE_FRAME,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_CAPTURE_FRAME],
      async (_event, payload): Promise<{ imagePath: string; url: string } | null> => {
        if (!mayRead(payload.sourcePath, 'captureFrame')) {
          return null;
        }
        try {
          const stat = fs.statSync(payload.sourcePath);
          const hash = createHash('sha1')
            .update(`${payload.sourcePath}:${stat.size}:${Math.round(stat.mtimeMs)}:${payload.atSeconds.toFixed(3)}`)
            .digest('hex')
            .slice(0, 16);

          const freezeDir = path.join(managedOutputsRoot, 'freeze-frames');
          await fs.promises.mkdir(freezeDir, { recursive: true });
          const imagePath = path.join(freezeDir, `freeze_${hash}.jpg`);

          if (!fs.existsSync(imagePath)) {
            await execFileAsync(
              ffmpegPath,
              [
                '-y',
                '-ss',
                payload.atSeconds.toFixed(3),
                '-i',
                payload.sourcePath,
                '-vframes',
                '1',
                '-q:v',
                '2',
                imagePath,
              ],
              { maxBuffer: 16 * 1024 * 1024 },
            );
          }

          const url = toMediaUrl(imagePath);
          if (!url) return null;
          return { imagePath, url };
        } catch (error) {
          logger.warn('capture frame failed', {
            sourcePath: payload.sourcePath,
            atSeconds: payload.atSeconds,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_GET_ENCODER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_GET_ENCODER],
      async (): Promise<RenderEncoderInfo> =>
        // The same call the render itself makes, and every step of it is
        // process-cached — so asking here warms exactly what the export will
        // use, and the panel cannot claim a hardware encoder the render then
        // declines to open.
        resolveRenderEncoder(ffmpegPath, await probeFfmpegCapabilities(ffmpegPath), 'auto'),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_RENDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_RENDER],
      async (_event, payload): Promise<SequenceRenderResult> => {
        const document = sequences.get(payload.sequenceId);
        if (!document) {
          throw new Error(`Sequence ${payload.sequenceId} no longer exists.`);
        }
        try {
          return await renderer.render(document, payload);
        } finally {
          onRenderSettled();
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_ACTIVE_RENDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_ACTIVE_RENDER],
      (): { sequenceId: string } | null => renderer.activeRender(),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_CANCEL_RENDER,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_CANCEL_RENDER], (): void => {
      renderer.cancel();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_EXPORT_OTIO,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_EXPORT_OTIO],
      async (_event, payload): Promise<string | null> => {
        const document = sequences.get(payload.sequenceId);
        if (!document) {
          throw new Error(`Sequence ${payload.sequenceId} no longer exists.`);
        }
        const result = await showSaveDialog({
          title: 'Export OpenTimelineIO',
          defaultPath: `${document.sequence.name}.otio`,
          filters: [{ name: 'OpenTimelineIO', extensions: ['otio'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await fs.promises.writeFile(
          result.filePath,
          JSON.stringify(buildOtioDocument(document), null, 2),
          'utf8',
        );
        return result.filePath;
      },
    ),
  );

  // S231 — "Export setup…", the OTIO export's shape: dialog + write here
  // because the path originates from the user's dialog, never the renderer.
  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_EXPORT_TIMELINE_SETUP,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_EXPORT_TIMELINE_SETUP],
      async (_event, payload): Promise<string | null> => {
        const document = sequences.get(payload.sequenceId);
        if (!document) {
          throw new Error(`Sequence ${payload.sequenceId} no longer exists.`);
        }
        const result = await showSaveDialog({
          title: 'Export timeline setup',
          defaultPath: `${document.sequence.name}.setup.json`,
          filters: [{ name: 'Timeline setup (JSON)', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await fs.promises.writeFile(
          result.filePath,
          buildTimelineSetupJson(document, sequences.listMarkers(payload.sequenceId)),
          'utf8',
        );
        return result.filePath;
      },
    ),
  );

  // Full Studio Timeline JSON Export (v2): All tracks, timestamps, durations, transitions, motions, sketches, and effects
  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_EXPORT_FULL_JSON,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_EXPORT_FULL_JSON],
      async (_event, payload): Promise<string | null> => {
        const document = sequences.get(payload.sequenceId);
        if (!document) {
          throw new Error(`Sequence ${payload.sequenceId} no longer exists.`);
        }
        const result = await showSaveDialog({
          title: 'Export Full Timeline JSON',
          defaultPath: `${document.sequence.name}.timeline.json`,
          filters: [{ name: 'VideoStudio Timeline JSON (*.json)', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await fs.promises.writeFile(
          result.filePath,
          buildTimelineFullJson(document, sequences.listMarkers(payload.sequenceId)),
          'utf8',
        );
        logger.info('Exported full timeline JSON', { filePath: result.filePath });
        return result.filePath;
      },
    ),
  );

  // Full Studio Timeline JSON Import (v2 / v1): Read file, parse, and return for preview & application
  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_IMPORT_FULL_JSON,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_IMPORT_FULL_JSON],
      async (_event, payload) => {
        const picked = await showOpenDialog({
          title: 'Import Timeline JSON',
          properties: ['openFile'],
          filters: [
            { name: 'Timeline JSON (*.json)', extensions: ['json'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (picked.canceled || picked.filePaths.length === 0) return null;

        const filePath = picked.filePaths[0];
        const text = await fs.promises.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const parse = parseTimelineSetupFile(text, fileName);
        logger.info('Parsed timeline JSON for import', {
          fileName,
          rowsCount: parse.rows.length,
          markersCount: parse.markers.length,
          tracksCount: parse.tracks?.length,
        });
        return {
          filePath,
          fileName,
          rawJson: text,
          parse,
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_IMPORT_TIMELINE_SETUP,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_IMPORT_TIMELINE_SETUP],
      async (_event, payload) => {
        const picked = await showOpenDialog({
          title: 'Import Timeline Setup (JSON or CSV)',
          properties: ['openFile'],
          filters: [
            { name: 'Timeline setup (JSON, CSV)', extensions: ['json', 'csv', 'tsv', 'txt'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (picked.canceled || picked.filePaths.length === 0) return null;

        const filePath = picked.filePaths[0];
        const text = await fs.promises.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const parse = parseTimelineSetupFile(text, fileName);
        return {
          filePath,
          fileName,
          rawJson: text,
          parse,
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_PICK_MEDIA,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_PICK_MEDIA],
      async (_event, payload): Promise<ImportedMediaFile[]> => {
        logger.info('SEQUENCE_PICK_MEDIA requested', { kind: payload.kind, projectId: payload.projectId });
        // `'text'` is not pickable — a text clip has no file. The schema's own
        // enum already excludes it; this Record mirrors that.
        const filters: Record<MediaSourceKind, Electron.FileFilter> = {
          still: { name: 'Images', extensions: [...MEDIA_IMPORT_EXTENSIONS.still] },
          video: { name: 'Video', extensions: [...MEDIA_IMPORT_EXTENSIONS.video] },
          audio: { name: 'Audio', extensions: [...MEDIA_IMPORT_EXTENSIONS.audio] },
        };
        const picked = await showOpenDialog({
          title: 'Add files to the bin',
          properties: ['openFile', 'multiSelections'],
          filters: [filters[payload.kind], { name: 'All files', extensions: ['*'] }],
        });
        logger.info('SEQUENCE_PICK_MEDIA dialog closed', {
          canceled: picked.canceled,
          count: picked.filePaths.length,
          files: picked.filePaths,
        });
        if (picked.canceled || picked.filePaths.length === 0) {
          // A cancel is not an empty pool — return what is already there, so
          // the caller can take the listing wholesale either way.
          return sequences.listMedia(payload.projectId);
        }

        const results: PickedMediaFile[] = [];
        for (const filePath of picked.filePaths) {
          const label = path.basename(filePath, path.extname(filePath));
          const kind = mediaKindForPath(filePath) ?? payload.kind;
          if (kind === 'still') {
            // A picture has no inherent length — probing it would only invent
            // one. Its timeline duration is decided at drop time.
            results.push({ path: filePath, kind: 'still', label, durationSec: null });
            continue;
          }
          const duration = await measure(filePath);
          logger.info('SEQUENCE_PICK_MEDIA measured file', { filePath, kind, duration });
          results.push({
            path: filePath,
            kind,
            label,
            durationSec: duration,
          });
        }
        // S180 — the pick is *recorded*, not merely returned. The row is what
        // makes `media://` serve the file at all (see the channel comment), so
        // a pick that returned without writing one produced a bin entry that
        // could never display.
        const recorded = sequences.recordMedia(
          payload.projectId,
          results.map((file) => ({ ...file, kind: file.kind as MediaSourceKind })),
          now(),
        );
        logger.info('SEQUENCE_PICK_MEDIA recorded successfully', {
          projectId: payload.projectId,
          recordedCount: recorded.length,
        });
        return recorded;
      },
    ),
  );

  /**
   * Beta S222 — picks a JSON/CSV of exact still durations and returns its text.
   *
   * Returns the *text*, not a parse. Parsing and matching are pure functions in
   * `@shared` that need the episode's shot list to say which rows matched, and
   * that list lives in the renderer — so doing the work here would mean either
   * shipping the shots down or deciding matches nobody can see. The main
   * process keeps the one job it has for every picker in this file: the path
   * originates from the user's own dialog.
   *
   * The size cap is the guard that matters. A durations file is a few hundred
   * rows; anything past 4 MB is a mispick (an .mp4 renamed, a database dump),
   * and reading it into a string to hand across IPC would be the expensive way
   * to find that out.
   */
  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_PICK_STILL_DURATIONS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_PICK_STILL_DURATIONS],
      async (): Promise<{ fileName: string; text: string } | null> => {
        const picked = await showOpenDialog({
          title: 'Choose a timeline setup file (JSON or CSV)',
          properties: ['openFile'],
          filters: [
            { name: 'Timeline setup (JSON or CSV)', extensions: ['json', 'csv', 'tsv', 'txt'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        // A cancelled dialog is a choice, not a failure — the renderer drops it.
        if (picked.canceled || picked.filePaths.length === 0) return null;

        const filePath = picked.filePaths[0];
        const stat = await fs.promises.stat(filePath);
        if (stat.size > MAX_DURATIONS_FILE_BYTES) {
          throw new Error('That file is too large to be a list of durations.');
        }
        const text = await fs.promises.readFile(filePath, 'utf8');
        logger.info('Picked a still-durations file', { fileName: path.basename(filePath), bytes: stat.size });
        return { fileName: path.basename(filePath), text };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_LIST_MEDIA,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_LIST_MEDIA],
      (_event, payload): ImportedMediaFile[] => sequences.listMedia(payload.projectId),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_IMPORT_DROPPED_MEDIA,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_IMPORT_DROPPED_MEDIA],
      async (_event, payload): Promise<ImportedMediaFile[]> => {
        // The one import route whose paths did not come from a dialog this
        // process opened, so it verifies instead of trusting. Three checks,
        // and each rules out a different thing: `mediaKindForPath` refuses a
        // file the pool does not browse (a key, a config, an executable),
        // `path.resolve` collapses any `..` before anything is recorded, and
        // `stat` refuses a directory or a path that is not there. What
        // survives is a grant to one real media file — never to its folder.
        const accepted: {
          path: string;
          kind: MediaSourceKind;
          label: string;
          durationSec: number | null;
        }[] = [];

        // Recursive folder scanner: expands directories into media files
        const collectFiles = async (candidatePath: string): Promise<string[]> => {
          try {
            const stats = await fs.promises.stat(candidatePath);
            if (stats.isFile()) return [candidatePath];
            if (stats.isDirectory()) {
              const entries = await fs.promises.readdir(candidatePath, { withFileTypes: true });
              const found: string[] = [];
              for (const entry of entries) {
                if (entry.name.startsWith('.')) continue; // ignore hidden
                const childPath = path.join(candidatePath, entry.name);
                if (entry.isFile()) {
                  found.push(childPath);
                } else if (entry.isDirectory()) {
                  found.push(...(await collectFiles(childPath)));
                }
              }
              return found;
            }
          } catch {
            return [];
          }
          return [];
        };

        const resolvedPaths: string[] = [];
        for (const candidate of payload.paths) {
          const absolutePath = path.resolve(candidate);
          const expanded = await collectFiles(absolutePath);
          resolvedPaths.push(...expanded);
        }

        for (const absolutePath of resolvedPaths) {
          const kind = mediaKindForPath(absolutePath);
          if (!kind) {
            logger.warn('dropped file refused — not a media extension the pool browses', {
              candidate: absolutePath,
            });
            continue;
          }
          try {
            const stats = await fs.promises.stat(absolutePath);
            if (!stats.isFile()) continue;
          } catch {
            logger.warn('dropped file refused — not a readable file', { candidate: absolutePath });
            continue;
          }
          accepted.push({
            path: absolutePath,
            kind,
            label: path.basename(absolutePath, path.extname(absolutePath)),
            durationSec: kind === 'still' ? null : await measure(absolutePath),
          });
        }
        if (accepted.length === 0) return sequences.listMedia(payload.projectId);
        return sequences.recordMedia(payload.projectId, accepted, now());
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_REMOVE_MEDIA,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REMOVE_MEDIA],
      (_event, payload): { result: RemoveImportedMediaResult; media: ImportedMediaFile[] } => {
        const result = sequences.removeMedia(
          payload.projectId,
          payload.paths,
          payload.deleteClips ?? false,
          now(),
        );
        // Logged because this is the one place the app stops serving a file it
        // was serving a moment ago — a later "why is this clip dark" is
        // answered here, or nowhere.
        logger.info('imported media removed', {
          projectId: payload.projectId,
          removed: result.removed.length,
          deletedClips: result.deletedClipCount,
          blocked: result.blocked.length,
        });
        return { result, media: sequences.listMedia(payload.projectId) };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SEQUENCE_CHOOSE_EXPORT_PATH,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_CHOOSE_EXPORT_PATH],
      async (_event, payload): Promise<string | null> => {
        // S157 — `.m4a` for the audio-only export; the video default otherwise.
        // S286 — plus the delivery containers. The extension is decided here,
        // never by the renderer (the path-security invariant above); a `png`
        // choice names the base file — the render writes `name_%05d.png`
        // beside it, which the filter's plural label discloses.
        const format = payload.format ?? 'mp4';
        const audio = format === 'm4a';
        const filter: Electron.FileFilter =
          format === 'm4a'
            ? { name: 'AAC audio', extensions: ['m4a'] }
            : format === 'gif'
              ? { name: 'GIF animation', extensions: ['gif'] }
              : format === 'webm'
                ? { name: 'WebM video', extensions: ['webm'] }
                : format === 'apng'
                  ? { name: 'Animated PNG', extensions: ['apng'] }
                  : format === 'png'
                    ? { name: 'PNG frame sequence', extensions: ['png'] }
                    : { name: 'MP4 video', extensions: ['mp4'] };
        const result = await showSaveDialog({
          title: audio ? 'Export sequence audio' : 'Export sequence',
          defaultPath: `${payload.suggestedName}.${filter.extensions[0]}`,
          filters: [filter],
        });
        return result.canceled || !result.filePath ? null : result.filePath;
      },
    ),
  );
}
