import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { Logger } from '../logging/logger';

import type { PostProcessRequest, PostProcessResponse } from './worker-protocol';

const logger = Logger.createChildLogger('post-processor');

/**
 * Spawns a fresh `worker_threads` worker per job (one-shot, not a persistent
 * pool) — matches this app's fully-serialized single-job-at-a-time queue, so
 * there's never more than one post-process running concurrently anyway.
 *
 * Logging lives here, not in the worker script itself (Phase 6 Step 6 audit
 * — the worker had zero log calls at all): `post-processor-worker.ts` runs
 * in a plain `node:worker_threads` context with no Electron `app` module
 * available, so it can't safely use the real file-backed `Logger` (which
 * resolves its log directory via `app.getPath('userData')`). This wrapper
 * runs on the main thread and already has `req.jobId`/`response.jobId` in
 * hand at exactly the two points that matter — start and settle — so it's
 * the correct place for job-scoped log context, not a worse substitute.
 */
export class PostProcessor {
  /** `workerScriptPath` defaults to the compiled sibling of this file (production); tests override it with a pre-compiled path since `.ts` can't be loaded directly by `node:worker_threads`. */
  constructor(private readonly workerScriptPath = path.join(__dirname, 'post-processor-worker.js')) {}

  run(req: PostProcessRequest): Promise<PostProcessResponse> {
    logger.debug('post-process start', { jobId: req.jobId, inputPath: req.inputPath });
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerScriptPath);

      worker.once('message', (response: PostProcessResponse) => {
        void worker.terminate();
        if (response.success) {
          logger.info('post-process completed', {
            jobId: response.jobId,
            fileSizeBytes: response.fileSizeBytes,
            thumbnailPath: response.thumbnailPath,
          });
        } else {
          logger.warn('post-process failed', {
            jobId: response.jobId,
            error: response.error,
            // Distinguishes "the transfer was incomplete, worth retrying" from
            // "the pipeline is broken" at a glance in the log, which is the
            // question anyone reading a dead-lettered job asks first.
            mediaUnusable: response.mediaUnusable ?? false,
          });
        }
        resolve(response);
      });
      worker.once('error', (err: Error) => {
        void worker.terminate();
        logger.error('post-process worker threw', { jobId: req.jobId, err: String(err) });
        reject(err);
      });

      worker.postMessage(req);
    });
  }
}
