import { execFile } from 'node:child_process';
import path from 'node:path';
import util from 'node:util';
import { Worker } from 'node:worker_threads';

import type { PixelRect, WatermarkEngine } from '../../shared/types/watermark';
import { Logger } from '../logging/logger';

import { buildDecodeFrameArgs, buildEncodeFrameArgs } from './watermark-args';
import type { WatermarkStillRequest, WatermarkStillResponse } from './watermark-worker-protocol';

const execFileAsync = util.promisify(execFile);
const logger = Logger.createChildLogger('watermark-still');

/**
 * Beta S235 — one still, decoded, cleaned off-thread, and written back.
 *
 * ## Why the budget is a `terminate()` and not a timer inside the worker
 *
 * `removeWatermarkFromImageDataSync` is synchronous. Once it starts, the
 * worker's event loop is blocked: no timer fires, no message is read, no
 * cooperative cancellation is possible. Phase 0 measured it at 2.7-7.9 s on
 * real Flow stills and **~17 s on flat content**, where it cannot discriminate
 * between candidates and exhausts its whole search. A flat bottom-right corner
 * — night sky, solid background — is ordinary in generated media, so that case
 * is not exotic; on a 500-item batch it is the difference between twenty
 * minutes and several hours.
 *
 * The only lever that actually works against a blocked thread is killing it.
 * That is why the worker is one-shot: spawned per item, terminated when it
 * answers or when the budget runs out, exactly like `post-processor.ts`.
 *
 * ## Why ffmpeg does the codec work
 *
 * `sharp` is not a dependency and adding it would mean a second native addon in
 * a bundle whose signing path has never been exercised. ffmpeg is already here,
 * already handles every format the app produces, and gives images and video one
 * codec layer instead of two. It costs a subprocess per still, which is noise
 * against a multi-second search.
 */

/** Generous enough for a legitimately hard image, short enough to keep a batch moving. */
/**
 * Beta S243 — raised from 12s.
 *
 * Phase 0 measured 2.7-7.9 s on the stills it sampled and 12 s looked like
 * generous headroom. A real 88-shot episode disagreed: **42 of 66 failures in
 * one day's logs were this budget**, on a run whose *successful* cleans
 * included 13.0 s and 16.4 s items. The budget was not catching the
 * pathological flat-content case it was written for — it was cutting off
 * ordinary work, and every item it cut fell through to a fill engine that
 * invents pixels where an exact removal was seconds away.
 */
export const DEFAULT_STILL_BUDGET_MS = 45_000;

/** ffmpeg writes raw RGBA to stdout; a 4K frame is ~33 MB, so the default 1 MB cap is far too small. */
const RAW_MAX_BUFFER = 256 * 1024 * 1024;

export interface StillCleanOptions {
  /**
   * Skips the search and applies this rect directly — the ~300us path.
   *
   * Beta S495 — carries the template too. The rect alone was never enough
   * (the worker had been inverting a flat mask, which paints the rect black),
   * and the caller that knows the rect is the detector, which has the map.
   */
  known?: { rect: PixelRect; alphaMap: Float32Array; alphaGain?: number };
  budgetMs?: number;
  signal?: AbortSignal;
}

export interface StillCleanResult {
  ok: boolean;
  rect: PixelRect | null;
  engine: WatermarkEngine | null;
  decisionTier: string | null;
  residualVisible: boolean;
  /** Zero means the search ran but found nothing to remove — not a failure. */
  touched: number;
  error?: string;
  /** True when the budget killed the worker, which the caller turns into a fill-engine retry. */
  timedOut?: boolean;
}

export class StillWatermarkRemover {
  /** Tests override the script path, since `worker_threads` cannot load `.ts` directly. */
  constructor(
    private readonly ffmpegPath: string,
    private readonly workerScriptPath = path.join(__dirname, 'watermark-worker.js'),
  ) {}

  /**
   * Decodes `inputPath`, cleans it, and writes `outputPath`.
   *
   * The output file is only written on success. A failed or timed-out item
   * leaves nothing behind, so the caller can fall back to a fill engine without
   * first having to clean up a half-written file.
   */
  async clean(
    itemId: string,
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    options: StillCleanOptions = {},
  ): Promise<StillCleanResult> {
    const started = Date.now();
    let pixels: Buffer;
    try {
      const { stdout } = await execFileAsync(
        this.ffmpegPath,
        buildDecodeFrameArgs(inputPath),
        { maxBuffer: RAW_MAX_BUFFER, encoding: 'buffer' },
      );
      pixels = stdout;
    } catch (error) {
      return this.fail(itemId, `decode failed: ${messageOf(error)}`);
    }

    const expected = width * height * 4;
    if (pixels.length < expected) {
      // Short read means the decode was truncated, not that the picture is
      // small — indexing it as if it were `width`x`height` would read past the
      // buffer and produce a garbled repair.
      return this.fail(itemId, `decode produced ${pixels.length} bytes, expected ${expected}`);
    }

    const known = options.known
      ? {
          rect: options.known.rect,
          // Copied out rather than sharing the caller's buffer: the worker's
          // view is transferred and would detach a map the batch reuses.
          alphaMap: new Float32Array(options.known.alphaMap).buffer,
          alphaGain: options.known.alphaGain,
        }
      : undefined;
    const response = await this.runWorker(
      {
        itemId,
        pixels: toArrayBuffer(pixels.subarray(0, expected)),
        width,
        height,
        known,
      },
      options.budgetMs ?? DEFAULT_STILL_BUDGET_MS,
      options.signal,
    );

    if (!response.ok || !response.pixels) {
      logger.warn('still clean failed', {
        itemId,
        error: response.error,
        timedOut: response.timedOut ?? false,
        elapsedMs: Date.now() - started,
      });
      return {
        ok: false,
        rect: response.rect,
        engine: null,
        decisionTier: response.decisionTier,
        residualVisible: false,
        touched: 0,
        error: response.error,
        timedOut: response.timedOut,
      };
    }

    // Nothing changed: the search ran and found no watermark. Writing an
    // identical copy would add a Library row that misrepresents itself as a
    // cleaned derivative, so the caller is told and decides.
    if (response.touched === 0) {
      logger.info('still had no watermark to remove', { itemId, elapsedMs: Date.now() - started });
      return {
        ok: true,
        rect: response.rect,
        engine: response.engine,
        decisionTier: response.decisionTier,
        residualVisible: response.residualVisible,
        touched: 0,
      };
    }

    try {
      await this.encode(outputPath, Buffer.from(response.pixels), width, height);
    } catch (error) {
      return this.fail(itemId, `encode failed: ${messageOf(error)}`);
    }

    logger.info('still cleaned', {
      itemId,
      rect: response.rect,
      alphaGain: response.alphaGain,
      decisionTier: response.decisionTier,
      residualVisible: response.residualVisible,
      touched: response.touched,
      elapsedMs: Date.now() - started,
    });

    return {
      ok: true,
      rect: response.rect,
      engine: response.engine,
      decisionTier: response.decisionTier,
      residualVisible: response.residualVisible,
      touched: response.touched,
    };
  }

  private encode(outputPath: string, pixels: Buffer, width: number, height: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.ffmpegPath,
        buildEncodeFrameArgs(outputPath, width, height),
        { maxBuffer: RAW_MAX_BUFFER },
        (error: Error | null) => (error ? reject(error) : resolve(undefined)),
      );
      child.stdin?.on('error', (err: unknown) =>
        reject(err instanceof Error ? err : new Error(String(err))),
      );
      child.stdin?.end(pixels);
    });
  }

  /**
   * Runs one item in a disposable worker, under a hard wall-clock budget.
   *
   * Every exit path terminates the worker — success, failure, timeout and
   * abort alike. A worker left alive holds a thread and, if it is mid-search,
   * a core; across a batch that leaks the machine.
   */
  private runWorker(
    request: WatermarkStillRequest,
    budgetMs: number,
    signal?: AbortSignal,
  ): Promise<WatermarkStillResponse & { timedOut?: boolean }> {
    return new Promise((resolve) => {
      const worker = new Worker(this.workerScriptPath);
      let settled = false;

      const finish = (result: WatermarkStillResponse & { timedOut?: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        void worker.terminate();
        resolve(result);
      };

      const timer = setTimeout(
        () =>
          finish({
            ...emptyResponse(request.itemId),
            error: `exceeded the ${budgetMs} ms budget`,
            timedOut: true,
          }),
        Math.max(1_000, budgetMs),
      );
      const onAbort = () =>
        finish({ ...emptyResponse(request.itemId), error: 'cancelled' });

      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }

      worker.once('message', (response: WatermarkStillResponse) => finish(response));
      worker.once('error', (error: Error) =>
        finish({ ...emptyResponse(request.itemId), error: String(error) }),
      );

      worker.postMessage(
        request,
        request.known ? [request.pixels, request.known.alphaMap] : [request.pixels],
      );
    });
  }

  private fail(itemId: string, error: string): StillCleanResult {
    logger.warn('still clean failed', { itemId, error });
    return {
      ok: false,
      rect: null,
      engine: null,
      decisionTier: null,
      residualVisible: false,
      touched: 0,
      error,
    };
  }
}

function emptyResponse(itemId: string): WatermarkStillResponse {
  return {
    itemId,
    ok: false,
    rect: null,
    alphaGain: null,
    engine: null,
    decisionTier: null,
    residualVisible: false,
    touched: 0,
  };
}

/**
 * A `Buffer` is a view onto a pooled allocation, so its `.buffer` is usually far
 * larger than the data and is shared with unrelated buffers. Transferring it to
 * a worker would move the whole pool. This copies out just this frame.
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
