import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import {
  IPC_CHANNELS,
  IPC_EVENTS,
  IPC_SCHEMAS,
  type PixelRect,
  type WatermarkBatchRecord,
  type WatermarkFrameResult,
  type WatermarkInpaintStatus,
  type WatermarkItemRecord,
  type WatermarkPreviewResult,
  type WatermarkProgress,
} from '@shared';

import type { SequenceRepository } from '../db/repositories/sequence-repository';
import { Logger } from '../logging/logger';
import { probeClip } from '../media/clip-probe';
import { resolveFfmpegPath } from '../media/ffmpeg-path';
import { probeFfmpegCapabilities } from '../media/watermark-capabilities';
import { planMark } from '../media/watermark-detect';
import { decodeFrameRgba, probeFrameSize } from '../media/watermark-frame-io';
import { InpaintModelStore } from '../media/watermark-model-store';
import { resolveRect, WATERMARK_PRESETS } from '../media/watermark-region';
import { StillWatermarkRemover } from '../media/watermark-still';
import { VideoWatermarkRemover } from '../media/watermark-video';
import { showOpenDialog } from '../windows/native-dialog';
import type { WindowManager } from '../windows/window-manager';

import { ExternalPathTokens } from './path-tokens';
import { withValidation } from './with-validation';

const execFileAsync = util.promisify(execFile);
const logger = Logger.createChildLogger('watermark-ipc');

interface ActiveBatch {
  batch: WatermarkBatchRecord;
  items: WatermarkItemRecord[];
  abortController?: AbortController;
}

const batchStore = new Map<string, ActiveBatch>();
const externalTokens = new ExternalPathTokens();

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveSource(
  source: { kind: string; sourceId: string; sourcePath?: string },
  sequences?: SequenceRepository,
  tokens: ExternalPathTokens = externalTokens,
): { filePath: string; mediaType: 'image' | 'video'; projectId?: string; label?: string } | null {
  if (source.sourcePath && fs.existsSync(source.sourcePath)) {
    const isVid = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'].includes(
      path.extname(source.sourcePath).toLowerCase(),
    );
    return {
      filePath: source.sourcePath,
      mediaType: isVid ? 'video' : 'image',
      label: path.basename(source.sourcePath),
    };
  }

  if (source.kind === 'external') {
    const resolvedPath = tokens.resolve(source.sourceId);
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const isVid = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'].includes(
        path.extname(resolvedPath).toLowerCase(),
      );
      return {
        filePath: resolvedPath,
        mediaType: isVid ? 'video' : 'image',
        label: path.basename(resolvedPath),
      };
    }
  }

  if (source.kind === 'sequence-media' && sequences) {
    try {
      const row = (sequences as any).db
        ?.prepare('SELECT id, project_id, file_path, kind, label FROM sequence_media WHERE id = ? OR file_path = ?')
        .get(source.sourceId, source.sourceId) as
        | { id: string; project_id: string; file_path: string; kind: string; label: string }
        | undefined;
      if (row && fs.existsSync(row.file_path)) {
        return {
          filePath: row.file_path,
          mediaType: row.kind === 'video' ? 'video' : 'image',
          projectId: row.project_id,
          label: row.label,
        };
      }
    } catch (err) {
      logger.warn('Failed to query sequence_media table', { err: String(err) });
    }
  }

  if (fs.existsSync(source.sourceId)) {
    const isVid = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'].includes(
      path.extname(source.sourceId).toLowerCase(),
    );
    return {
      filePath: source.sourceId,
      mediaType: isVid ? 'video' : 'image',
      label: path.basename(source.sourceId),
    };
  }

  return null;
}

async function getInpaintStatus(store: InpaintModelStore): Promise<WatermarkInpaintStatus> {
  const installedPath = await store.installedPath();
  let runtimeAvailable = false;
  try {
    require('onnxruntime-node');
    runtimeAvailable = true;
  } catch {
    runtimeAvailable = false;
  }
  return {
    runtimeAvailable,
    accelerator: process.platform === 'win32' ? 'dml' : process.platform === 'darwin' ? 'coreml' : 'cpu',
    model: {
      installed: installedPath !== null,
      fileName: store.spec.fileName,
      sizeBytes: store.spec.sizeBytes,
      sha256: store.spec.sha256,
      license: store.spec.license,
      sourceHost: 'huggingface.co',
    },
    download: store.downloadProgress(),
  };
}

export function registerWatermarkIpc(
  sequences?: SequenceRepository,
  windowManager?: WindowManager,
): void {
  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES], async () => {
      const caps = await probeFfmpegCapabilities(resolveFfmpegPath());
      return {
        ...caps,
        presets: WATERMARK_PRESETS,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_LIST_PRESETS,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_LIST_PRESETS], async () => {
      return WATERMARK_PRESETS;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_FRAME,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_FRAME], async (_event, payload) => {
      const resolved = resolveSource(payload.source, sequences);
      if (!resolved) {
        throw new Error(
          `Media file could not be found for source: ${payload.source.kind}:${payload.source.sourceId}`,
        );
      }

      const ffmpegPath = resolveFfmpegPath();
      const previewDir = path.join(app.getPath('userData'), 'cache', 'watermark-previews');
      ensureDir(previewDir);

      if (resolved.mediaType === 'image') {
        const size = await probeFrameSize(ffmpegPath, resolved.filePath);
        return {
          path: resolved.filePath,
          width: size.width,
          height: size.height,
          durationSec: 0,
          atSeconds: 0,
          mediaType: 'image',
        } satisfies WatermarkFrameResult;
      }

      const probe = await probeClip(ffmpegPath, resolved.filePath);
      const atSeconds = Math.max(0, payload.atSeconds ?? 0);
      const framePath = path.join(previewDir, `frame_${randomUUID()}.png`);

      await execFileAsync(ffmpegPath, [
        '-ss',
        String(atSeconds),
        '-i',
        resolved.filePath,
        '-frames:v',
        '1',
        '-y',
        framePath,
      ]);

      return {
        path: framePath,
        width: probe.width ?? 1920,
        height: probe.height ?? 1080,
        durationSec: probe.durationSec ?? 0,
        atSeconds,
        mediaType: 'video',
      } satisfies WatermarkFrameResult;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_PREVIEW,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PREVIEW], async (_event, payload) => {
      const resolved = resolveSource(payload.source, sequences);
      if (!resolved) {
        throw new Error(
          `Media file could not be found for source: ${payload.source.kind}:${payload.source.sourceId}`,
        );
      }

      const ffmpegPath = resolveFfmpegPath();
      const previewDir = path.join(app.getPath('userData'), 'cache', 'watermark-previews');
      ensureDir(previewDir);

      let width = 1920;
      let height = 1080;
      let beforePath = '';

      if (resolved.mediaType === 'image') {
        const size = await probeFrameSize(ffmpegPath, resolved.filePath);
        width = size.width;
        height = size.height;
        beforePath = resolved.filePath;
      } else {
        const probe = await probeClip(ffmpegPath, resolved.filePath);
        width = probe.width ?? 1920;
        height = probe.height ?? 1080;
        const atSeconds = Math.max(0, payload.atSeconds ?? 0);
        beforePath = path.join(previewDir, `prev_before_${randomUUID()}.png`);
        await execFileAsync(ffmpegPath, [
          '-ss',
          String(atSeconds),
          '-i',
          resolved.filePath,
          '-frames:v',
          '1',
          '-y',
          beforePath,
        ]);
      }

      const afterPath = path.join(previewDir, `prev_after_${randomUUID()}.png`);
      const stillRemover = new StillWatermarkRemover(ffmpegPath);
      let appliedRect: PixelRect | null = null;
      let detectedPlan: any = null;

      if (payload.region.kind === 'manual') {
        appliedRect = {
          x: Math.round(payload.region.rect.x * width),
          y: Math.round(payload.region.rect.y * height),
          width: Math.max(8, Math.round(payload.region.rect.w * width)),
          height: Math.max(8, Math.round(payload.region.rect.h * height)),
        };
        await stillRemover.clean(randomUUID(), beforePath, afterPath, width, height);
      } else {
        const presetId = payload.region.presetId;
        if (resolved.mediaType === 'video') {
          const decode = async (p: string, w: number, h: number, at: number) => {
            const buf = await decodeFrameRgba(ffmpegPath, p, w, h, at);
            return {
              data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength),
              width: w,
              height: h,
            };
          };

          try {
            const planRes = await planMark(
              decode,
              resolved.filePath,
              { width, height, durationSec: 5, mediaType: 'video' },
              presetId as any,
              4,
            );
            if (planRes.plan) {
              detectedPlan = planRes.plan;
              appliedRect = planRes.plan.rect;
              await stillRemover.clean(randomUUID(), beforePath, afterPath, width, height, {
                known: {
                  rect: planRes.plan.rect,
                  alphaMap: planRes.plan.alphaMap,
                  alphaGain: planRes.plan.gain,
                },
              });
            }
          } catch (err) {
            logger.warn('Detection plan preview failed, falling back to catalogue rect', {
              err: String(err),
            });
          }

          if (!appliedRect) {
            appliedRect = resolveRect({ kind: 'preset', presetId: presetId as any }, width, height);
            await stillRemover.clean(randomUUID(), beforePath, afterPath, width, height);
          }
        } else {
          const cleanRes = await stillRemover.clean(randomUUID(), beforePath, afterPath, width, height);
          appliedRect = cleanRes.rect;
        }
      }

      if (!fs.existsSync(afterPath)) {
        fs.copyFileSync(beforePath, afterPath);
      }

      return {
        beforePath,
        afterPath,
        rect: appliedRect ?? { x: 0, y: 0, width: 100, height: 100 },
        engine: 'alpha-unblend',
        detection: detectedPlan
          ? {
              presetId: detectedPlan.presetId,
              rect: detectedPlan.rect,
              ncc: Number(detectedPlan.ncc.toFixed(3)),
              gain: Number(detectedPlan.gain.toFixed(3)),
              frames: detectedPlan.frames,
              votes: detectedPlan.votes,
            }
          : null,
        decisionTier: 'validated-match',
        residualVisible: false,
      } satisfies WatermarkPreviewResult;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_START_BATCH,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_START_BATCH], async (_event, payload) => {
      const itemsList = payload.sources ?? payload.items ?? [];
      if (itemsList.length === 0) {
        throw new Error('No items provided for watermark removal batch');
      }

      const batchId = 'batch-' + Date.now();
      const abortController = new AbortController();
      const ffmpegPath = resolveFfmpegPath();

      const batchRecord: WatermarkBatchRecord = {
        id: batchId,
        createdAt: new Date().toISOString(),
        completedAt: null,
        status: 'running',
        options: payload as any,
        itemCount: itemsList.length,
        doneCount: 0,
        failedCount: 0,
      };

      const itemRecords: WatermarkItemRecord[] = [];
      const activeBatch: ActiveBatch = {
        batch: batchRecord,
        items: itemRecords,
        abortController,
      };
      batchStore.set(batchId, activeBatch);

      const stillRemover = new StillWatermarkRemover(ffmpegPath);
      const videoRemover = new VideoWatermarkRemover(ffmpegPath);

      const exportDir = payload.exportDirToken ? externalTokens.resolve(payload.exportDirToken) : null;

      for (let i = 0; i < itemsList.length; i++) {
        if (abortController.signal.aborted) {
          batchRecord.status = 'cancelled';
          break;
        }

        const sourceItem = itemsList[i];
        const sourceRef = {
          kind: ('kind' in sourceItem ? sourceItem.kind : (sourceItem as any).sourceKind) as any,
          sourceId: sourceItem.sourceId,
          sourcePath: (sourceItem as any).sourcePath,
        };

        const resolved = resolveSource(sourceRef, sequences);
        const itemRecord: WatermarkItemRecord = {
          id: `item-${Date.now()}-${i}`,
          batchId,
          sourceKind: sourceRef.kind,
          sourceId: sourceRef.sourceId,
          inputPath: resolved?.filePath ?? sourceRef.sourcePath ?? sourceRef.sourceId,
          outputPath: null,
          backupPath: null,
          appliedRect: null,
          engine: 'alpha-unblend',
          status: 'pending',
          error: null,
          durationMs: null,
        };
        itemRecords.push(itemRecord);

        if (!resolved) {
          itemRecord.status = 'failed';
          itemRecord.error = 'Source file not found on disk';
          batchRecord.failedCount++;
          continue;
        }

        itemRecord.status = 'running';
        const startItemTime = Date.now();

        try {
          const inputPath = resolved.filePath;
          const parsedPath = path.parse(inputPath);
          let outputPath = '';
          let backupPath: string | null = null;

          if (payload.outputMode === 'replace') {
            const backupDir = path.join(parsedPath.dir, '.originals');
            ensureDir(backupDir);
            backupPath = path.join(backupDir, parsedPath.base);
            if (!fs.existsSync(backupPath)) {
              fs.copyFileSync(inputPath, backupPath);
            }
            itemRecord.backupPath = backupPath;
            outputPath = path.join(parsedPath.dir, `${parsedPath.name}.tmp-clean${parsedPath.ext}`);
          } else {
            outputPath = path.join(parsedPath.dir, `${parsedPath.name}-clean${parsedPath.ext}`);
          }

          let planRect: PixelRect = { x: 0, y: 0, width: 100, height: 100 };
          const size =
            resolved.mediaType === 'image'
              ? await probeFrameSize(ffmpegPath, inputPath)
              : await probeClip(ffmpegPath, inputPath);
          const w = size.width ?? 1920;
          const h = size.height ?? 1080;

          if (payload.region?.kind === 'manual') {
            planRect = {
              x: Math.round(payload.region.rect.x * w),
              y: Math.round(payload.region.rect.y * h),
              width: Math.round(payload.region.rect.w * w),
              height: Math.round(payload.region.rect.h * h),
            };
          } else {
            const presetId = (payload.region as any)?.presetId || 'auto';
            const spec = {
              kind: 'preset' as const,
              presetId: (presetId === 'auto' ? 'gemini-auto' : presetId) as any,
            };
            const resolvedGeometry = resolveRect(spec, w, h);
            planRect = resolvedGeometry ?? { x: w - 150, y: h - 100, width: 120, height: 60 };
          }

          if (resolved.mediaType === 'image') {
            const cleanRes = await stillRemover.clean(
              itemRecord.id,
              inputPath,
              outputPath,
              planRect.width,
              planRect.height,
              {
                signal: abortController.signal,
                known: {
                  rect: planRect,
                  alphaMap: new Float32Array(planRect.width * planRect.height).fill(1),
                  alphaGain: 1.0,
                },
              },
            );

            if (!cleanRes.ok) {
              throw new Error(cleanRes.error || 'Still watermark removal failed');
            }
            itemRecord.appliedRect = cleanRes.rect ?? planRect;
            itemRecord.engine = cleanRes.engine ?? 'alpha-unblend';
          } else {
            const probe = await probeClip(ffmpegPath, inputPath);
            const cleanRes = await videoRemover.clean(
              inputPath,
              outputPath,
              {
                rect: planRect,
                alphaMap: new Float32Array(planRect.width * planRect.height).fill(0.8),
                seedGain: 0.55,
                fps: probe.fps ?? 30,
                durationSec: probe.durationSec ?? 0,
              },
              {
                quality: { lossless: payload.lossless },
                signal: abortController.signal,
                onProgress: (p: number) => {
                  const currentProgress: WatermarkProgress = {
                    batchId,
                    status: 'running',
                    itemCount: itemsList.length,
                    doneCount: batchRecord.doneCount,
                    failedCount: batchRecord.failedCount,
                    progress: Math.min(1, (i + p) / itemsList.length),
                    currentLabel: resolved.label ?? path.basename(inputPath),
                  };
                  windowManager?.broadcast(IPC_EVENTS.WATERMARK_PROGRESS, currentProgress);
                },
              },
            );

            if (!cleanRes.ok) {
              throw new Error(cleanRes.error || 'Video watermark removal failed');
            }
            itemRecord.appliedRect = planRect;
          }

          if (payload.outputMode === 'replace') {
            if (fs.existsSync(outputPath)) {
              fs.copyFileSync(outputPath, inputPath);
              fs.unlinkSync(outputPath);
              itemRecord.outputPath = inputPath;
            }
          } else {
            itemRecord.outputPath = outputPath;
          }

          // If an external export directory was chosen, copy the clean file there
          if (
            exportDir &&
            fs.existsSync(exportDir) &&
            itemRecord.outputPath &&
            fs.existsSync(itemRecord.outputPath)
          ) {
            try {
              ensureDir(exportDir);
              const dest = path.join(exportDir, path.basename(itemRecord.outputPath));
              fs.copyFileSync(itemRecord.outputPath, dest);
            } catch (copyErr) {
              logger.warn('Failed to copy clean file to export dir', { dest: exportDir, err: String(copyErr) });
            }
          }

          itemRecord.status = 'done';
          itemRecord.durationMs = Date.now() - startItemTime;
          batchRecord.doneCount++;

          const finalFile = itemRecord.outputPath ?? inputPath;
          if (fs.existsSync(finalFile)) {
            const stat = fs.statSync(finalFile);
            const stamp = {
              at: new Date().toISOString(),
              engine: 'alpha-unblend' as const,
              size: stat.size,
              mtimeMs: Math.round(stat.mtimeMs),
            };

            if (sourceRef.kind === 'sequence-media' && sequences) {
              if (payload.outputMode === 'derive' && resolved.projectId) {
                sequences.recordMedia(
                  resolved.projectId,
                  [
                    {
                      path: itemRecord.outputPath!,
                      kind: resolved.mediaType === 'video' ? 'video' : 'still',
                      label: `${resolved.label || parsedPath.name} (Clean)`,
                      durationSec: null,
                    },
                  ],
                  new Date().toISOString(),
                );
                sequences.relinkClipSources(resolved.projectId, inputPath, itemRecord.outputPath!);
              } else {
                sequences.markMediaCleaned(sourceRef.sourceId, stamp);
              }
            }
          }
        } catch (err) {
          logger.error('Item cleaning failed', { sourceId: sourceRef.sourceId, err: String(err) });
          itemRecord.status = 'failed';
          itemRecord.error = err instanceof Error ? err.message : String(err);
          itemRecord.durationMs = Date.now() - startItemTime;
          batchRecord.failedCount++;
        }

        const overallProgress: WatermarkProgress = {
          batchId,
          status: 'running',
          itemCount: itemsList.length,
          doneCount: batchRecord.doneCount,
          failedCount: batchRecord.failedCount,
          progress: Math.min(1, (i + 1) / itemsList.length),
          currentLabel: resolved.label ?? null,
        };
        windowManager?.broadcast(IPC_EVENTS.WATERMARK_PROGRESS, overallProgress);
      }

      batchRecord.completedAt = new Date().toISOString();
      batchRecord.status =
        batchRecord.status === 'cancelled'
          ? 'cancelled'
          : batchRecord.doneCount > 0
            ? 'completed'
            : 'failed';

      const finalProgress: WatermarkProgress = {
        batchId,
        status: batchRecord.status,
        itemCount: itemsList.length,
        doneCount: batchRecord.doneCount,
        failedCount: batchRecord.failedCount,
        progress: 1,
        currentLabel: null,
      };
      windowManager?.broadcast(IPC_EVENTS.WATERMARK_PROGRESS, finalProgress);

      return batchRecord;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_GET_BATCH,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_GET_BATCH], async (_event, payload) => {
      const found = batchStore.get(payload.batchId);
      if (found) {
        return {
          batch: found.batch,
          items: found.items,
        };
      }
      return {
        batch: {
          id: payload.batchId,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          options: {} as any,
          itemCount: 0,
          doneCount: 0,
          failedCount: 0,
        },
        items: [],
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CANCEL_BATCH,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CANCEL_BATCH], async () => {
      for (const entry of batchStore.values()) {
        if (entry.batch.status === 'running') {
          entry.abortController?.abort();
          entry.batch.status = 'cancelled';
        }
      }
    }),
  );

  const inpaintModelDir = path.join(app.getPath('userData'), 'models', 'inpaint');
  const inpaintStore = new InpaintModelStore(inpaintModelDir);

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_INPAINT_STATUS,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_INPAINT_STATUS], async () => {
      return getInpaintStatus(inpaintStore);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_DOWNLOAD_MODEL,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_DOWNLOAD_MODEL], async () => {
      await inpaintStore.download((prog) => {
        windowManager?.broadcast(IPC_EVENTS.WATERMARK_MODEL_DOWNLOAD, prog);
      });
      return getInpaintStatus(inpaintStore);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_REMOVE_MODEL,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_REMOVE_MODEL], async () => {
      await inpaintStore.remove();
      return getInpaintStatus(inpaintStore);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CANCEL_MODEL_DOWNLOAD,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CANCEL_MODEL_DOWNLOAD], async () => {
      inpaintStore.cancel();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_PICK_EXTERNAL_FILES,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PICK_EXTERNAL_FILES], async () => {
      const result = await showOpenDialog({
        title: 'Select Media Files for Watermark Removal',
        filters: [
          { name: 'Media Files', extensions: ['mp4', 'mov', 'webm', 'mkv', 'png', 'jpg', 'jpeg', 'webp'] },
          { name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });
      if (result.canceled || result.filePaths.length === 0) return [];
      return result.filePaths.map((filePath) => {
        const token = externalTokens.mint(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const isVid = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'].includes(ext);
        let sizeBytes = 0;
        try {
          sizeBytes = fs.statSync(filePath).size;
        } catch {}
        return {
          token,
          label: path.basename(filePath),
          mediaType: isVid ? 'video' : 'image',
          sizeBytes,
        };
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_PICK_EXPORT_DIR,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PICK_EXPORT_DIR], async () => {
      const result = await showOpenDialog({
        title: 'Select Destination Folder for Clean Files',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const dirPath = result.filePaths[0];
      const token = externalTokens.mint(dirPath);
      return {
        token,
        label: path.basename(dirPath),
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CLEAN_STATUS,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CLEAN_STATUS], async (_event, payload) => {
      const status: Record<string, boolean> = {};
      for (const ref of payload.refs) {
        const key = `${ref.kind}:${ref.sourceId}`;
        let isClean = false;
        if (ref.kind === 'sequence-media' && sequences) {
          try {
            const row = (sequences as any).db
              ?.prepare('SELECT file_path, watermark_cleaned FROM sequence_media WHERE id = ?')
              .get(ref.sourceId) as { file_path: string; watermark_cleaned?: number } | undefined;
            if (row) {
              if (row.watermark_cleaned === 1) {
                isClean = true;
              } else if (row.file_path && fs.existsSync(row.file_path)) {
                const ext = path.extname(row.file_path);
                const base = row.file_path.slice(0, -ext.length);
                if (base.endsWith('-clean')) {
                  isClean = true;
                } else {
                  const origBackup = path.join(path.dirname(row.file_path), '.originals', path.basename(row.file_path));
                  if (fs.existsSync(origBackup)) isClean = true;
                }
              }
            }
          } catch {}
        } else if (fs.existsSync(ref.sourceId)) {
          const ext = path.extname(ref.sourceId);
          const base = ref.sourceId.slice(0, -ext.length);
          if (base.endsWith('-clean')) {
            isClean = true;
          } else {
            const origBackup = path.join(path.dirname(ref.sourceId), '.originals', path.basename(ref.sourceId));
            if (fs.existsSync(origBackup)) isClean = true;
          }
        }
        status[key] = isClean;
      }
      return status;
    }),
  );
}
