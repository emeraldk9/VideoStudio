import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { validateContainerHeader, validateImageHeader } from './container-validator';
import { extractPosterFrame } from './poster-frame';
import type { PostProcessRequest, PostProcessResponse } from './worker-protocol';

/**
 * Beta S219 — the poster extraction moved to `./poster-frame`, unchanged.
 *
 * It gained a second caller (the Story Builder’s hand-imported clip), and a
 * strip tile paints `thumbnailPath ?? localPath` into an `<img>` — so both
 * producers of a video take have to answer "what does this look like" the
 * same way, or one of them paints a broken image.
 */

async function handleMessage(req: PostProcessRequest): Promise<void> {
  let stat: fs.Stats;
  const isImage = req.mediaType === 'image';
  try {
    stat = await fs.promises.stat(req.inputPath);
    if (stat.size === 0) {
      throw new Error('Downloaded file is empty (0 bytes)');
    }

    const handle = await fs.promises.open(req.inputPath, 'r');
    const buffer = Buffer.alloc(32);
    await handle.read(buffer, 0, 32, 0);
    await handle.close();

    if (isImage) {
      if (!validateImageHeader(buffer)) {
        throw new Error('Invalid media header: file is not a valid JPEG, PNG, or WebP image');
      }
    } else if (!validateContainerHeader(buffer)) {
      throw new Error('Invalid media header: file is not a valid MP4 or WebM container');
    }
  } catch (err) {
    // The media itself is unusable — there is nothing worth keeping.
    const response: PostProcessResponse = {
      jobId: req.jobId,
      success: false,
      fileSizeBytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort?.postMessage(response);
    return;
  }

  // Past this point the file exists, is non-empty, and carries a container
  // header this app recognises — but the header is only the first 32 bytes, so
  // it says nothing about the rest. Failing to decode even frame 0 is how a
  // truncated download announces itself, and that is a media failure, not a
  // thumbnail one: persisting it would put an item in the Library whose video
  // cannot play, which is worse than reporting the job failed.
  try {
    const thumbnailPath = await extractPosterFrame({
      inputPath: req.inputPath,
      thumbnailOutputPath: req.thumbnailOutputPath,
      ffmpegPath: req.ffmpegPath,
      isImage,
    });
    const response: PostProcessResponse = {
      jobId: req.jobId,
      success: true,
      fileSizeBytes: stat.size,
      thumbnailPath,
    };
    parentPort?.postMessage(response);
  } catch (err) {
    const response: PostProcessResponse = {
      jobId: req.jobId,
      success: false,
      fileSizeBytes: stat.size,
      // Named for what it means rather than for the step that noticed. The
      // previous message ("Post-processing failed") sent people looking at
      // ffmpeg when the answer was on disk, in a file the size line names.
      error: `Could not decode the downloaded ${isImage ? 'image' : 'video'} (${stat.size} bytes on disk) — it is most likely incomplete. ffmpeg: ${
        err instanceof Error ? err.message : String(err)
      }`,
      mediaUnusable: true,
    };
    parentPort?.postMessage(response);
  }
}

parentPort?.on('message', (req: PostProcessRequest) => {
  void handleMessage(req);
});
