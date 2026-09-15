import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { WatermarkModelDownloadProgress } from '../../shared/types/watermark';
import { Logger } from '../logging/logger';

const logger = Logger.createChildLogger('watermark-model');

/**
 * Beta S235 Phase 4 — the inpainting model, fetched on demand and never shipped.
 *
 * ## Why a download at all
 *
 * The model is 208 MB — larger than the rest of the app — and most batches
 * never need it: the templated marks are removed *exactly* by the alpha
 * unblend, and `delogo` covers the rest adequately. Bundling it would tax
 * every install for a fill engine a minority use. So it is **gated**: the
 * dialog states the size, the source host, the license and the hash, and the
 * bytes only move after the user asks for them.
 *
 * ## What "verified" means here
 *
 * The file is hashed as it streams and compared against a SHA-256 pinned in
 * this source. A mismatch — a truncated transfer, a changed upstream, a
 * tampered mirror — leaves *nothing* installed: the staging file is removed
 * and the state says why. The app never loads a model it has not verified,
 * which is the property that makes "download from a third-party host" an
 * acceptable thing for a desktop app to do.
 */

export interface InpaintModelSpec {
  id: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  /** The model was exported at a fixed square input; the engine works in windows of this size. */
  inputSize: number;
}

/**
 * Carve's `torch.onnx.export` of advimman's big-lama (Apache-2.0, opset 17,
 * fixed 512x512). Hash and size are what the Hugging Face LFS record states
 * for this exact blob; verified again on every download.
 */
export const LAMA_FP32: InpaintModelSpec = {
  id: 'lama-fp32',
  fileName: 'lama_fp32.onnx',
  url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
  sizeBytes: 208_044_816,
  sha256: '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6',
  license: 'Apache-2.0',
  inputSize: 512,
};

const STAGING_SUFFIX = '.part';
/** Progress is pushed at most this often, so a fast link does not flood IPC. */
const PROGRESS_INTERVAL_MS = 200;

export interface InpaintModelStoreDeps {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class InpaintModelStore {
  private progress: WatermarkModelDownloadProgress = idle();
  private controller: AbortController | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly dir: string,
    readonly spec: InpaintModelSpec = LAMA_FP32,
    private readonly deps: InpaintModelStoreDeps = {},
  ) {}

  get modelPath(): string {
    return path.join(this.dir, this.spec.fileName);
  }

  /** Installed means present *at the expected size*; a short file is treated as absent. */
  async installedPath(): Promise<string | null> {
    try {
      const stat = await fsp.stat(this.modelPath);
      return stat.size === this.spec.sizeBytes ? this.modelPath : null;
    } catch {
      return null;
    }
  }

  downloadProgress(): WatermarkModelDownloadProgress {
    return this.progress;
  }

  isDownloading(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Fetches, verifies and installs the model. Resolves when it is installed,
   * rejects with the reason otherwise; a second call while one runs joins it.
   */
  download(onProgress?: (progress: WatermarkModelDownloadProgress) => void): Promise<void> {
    this.inFlight ??= this.run(onProgress).finally(() => {
      this.inFlight = null;
      this.controller = null;
    });
    return this.inFlight;
  }

  cancel(): void {
    this.controller?.abort();
  }

  /** Deletes the installed file. The next status read reports it absent. */
  async remove(): Promise<void> {
    await fsp.rm(this.modelPath, { force: true });
    await fsp.rm(this.modelPath + STAGING_SUFFIX, { force: true });
    this.progress = idle();
  }

  private async run(onProgress?: (progress: WatermarkModelDownloadProgress) => void): Promise<void> {
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const now = this.deps.now ?? Date.now;
    const staging = this.modelPath + STAGING_SUFFIX;
    const controller = new AbortController();
    this.controller = controller;

    const emit = (next: WatermarkModelDownloadProgress) => {
      this.progress = next;
      onProgress?.(next);
    };
    emit({ state: 'downloading', receivedBytes: 0, totalBytes: this.spec.sizeBytes, error: null });

    try {
      await fsp.mkdir(this.dir, { recursive: true });
      const response = await fetchImpl(this.spec.url, {
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!response.ok || !response.body) {
        throw new Error(`download failed: HTTP ${response.status}`);
      }

      const hash = createHash('sha256');
      const file = fs.createWriteStream(staging);
      let received = 0;
      let lastEmit = now();
      // A reader loop rather than `for await`: Node's `fetch` body is
      // async-iterable at runtime but the DOM lib types do not declare it,
      // and casting around that would hide a real contract.
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > this.spec.sizeBytes) {
            // Refuse to keep writing past the expected size: whatever this
            // is, it is not the blob the hash was pinned for.
            throw new Error(`download exceeded the expected ${this.spec.sizeBytes} bytes`);
          }
          hash.update(value);
          if (!file.write(value)) await once(file, 'drain');
          if (now() - lastEmit >= PROGRESS_INTERVAL_MS) {
            lastEmit = now();
            emit({ state: 'downloading', receivedBytes: received, totalBytes: this.spec.sizeBytes, error: null });
          }
        }
      } finally {
        reader.cancel().catch(() => undefined);
        file.end();
        await once(file, 'close');
      }

      emit({ state: 'verifying', receivedBytes: received, totalBytes: this.spec.sizeBytes, error: null });
      if (received !== this.spec.sizeBytes) {
        throw new Error(`download ended at ${received} of ${this.spec.sizeBytes} bytes`);
      }
      const digest = hash.digest('hex');
      if (digest !== this.spec.sha256) {
        throw new Error('downloaded file failed verification (SHA-256 mismatch)');
      }

      await fsp.rename(staging, this.modelPath);
      logger.info('inpainting model installed', { model: this.spec.id, bytes: received });
      emit(idle());
    } catch (error) {
      await fsp.rm(staging, { force: true }).catch(() => undefined);
      const cancelled = controller.signal.aborted;
      const message = cancelled ? 'cancelled' : messageOf(error);
      logger.warn('inpainting model download did not complete', { model: this.spec.id, error: message });
      emit(
        cancelled
          ? idle()
          : { state: 'failed', receivedBytes: 0, totalBytes: this.spec.sizeBytes, error: message },
      );
      throw new Error(message);
    }
  }
}

function idle(): WatermarkModelDownloadProgress {
  return { state: 'idle', receivedBytes: 0, totalBytes: 0, error: null };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
