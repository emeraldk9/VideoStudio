import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

/**
 * Beta S219 — the one poster-frame extractor.
 *
 * Lifted verbatim out of `post-processor-worker.ts`, which owned it alone
 * while the download pipeline was the only thing that ever produced a video
 * this app had to paint a tile for. Importing a clip by hand is the second
 * producer, and a strip tile is an `<img src={thumbnailPath ?? localPath}>` —
 * so a clip with no poster is a broken image, not a slightly plainer one.
 *
 * Two callers, one implementation, on purpose: the seek-then-fall-back
 * behaviour below is measured against real files (see `extractPosterFrame`),
 * and a second copy of it would be a second answer to "what does this clip
 * look like".
 *
 * Kept out of `post-processor.ts` itself: that module spawns a worker, and
 * the story import runs on the main thread with an ffmpeg path already in
 * hand. What is shared here is the ffmpeg invocation, not the threading.
 */

/**
 * Whether ffmpeg actually left a frame on disk.
 *
 * Its exit code cannot answer this. Asked to seek past the end of a clip it
 * exits **0** and writes nothing at all ("Output file is empty, nothing was
 * encoded") — measured against ffmpeg-static on a 0.5s clip. A leftover
 * zero-byte file is treated the same way and removed, so a later `stat` can't
 * mistake it for a poster.
 */
export async function wroteAFrame(outputPath: string): Promise<boolean> {
  try {
    const { size } = await fs.promises.stat(outputPath);
    if (size > 0) {
      return true;
    }
    await fs.promises.rm(outputPath, { force: true });
    return false;
  } catch {
    return false;
  }
}

/**
 * Extracts the poster frame, or explains why it could not.
 *
 * Two attempts, and the second is the point: the 1-second seek is a *preference*
 * (a frame one second in is more representative than a fade-in from black), not
 * a requirement. A clip shorter than the seek — or one whose first second is
 * unseekable — yields nothing, and the honest fallback is the first frame
 * rather than no thumbnail. Verified: the same 0.5s clip that produces nothing
 * with `-ss 00:00:01` produces a valid JPEG without it.
 *
 * Returning `null` means "no frame, and the input is decodable" is NOT what
 * happened — that case throws, because failing to read frame 0 at all says the
 * media is broken, not that the poster is awkward.
 */
export async function extractPosterFrame(request: {
  inputPath: string;
  thumbnailOutputPath: string;
  ffmpegPath: string;
  /** A still has no 1-second mark to seek to; see the attempt list below. */
  isImage: boolean;
}): Promise<string> {
  await fs.promises.mkdir(path.dirname(request.thumbnailOutputPath), { recursive: true });

  const frameArgs = ['-vframes', '1', '-q:v', '2', '-y', request.thumbnailOutputPath];
  // A still image has no 1-second mark to seek to — ffmpeg's image demuxer
  // reports a ~0.04s duration, so seeking past it yields an empty output.
  const attempts: string[][] = request.isImage
    ? [['-i', request.inputPath, ...frameArgs]]
    : [
        ['-ss', '00:00:01', '-i', request.inputPath, ...frameArgs],
        ['-i', request.inputPath, ...frameArgs],
      ];

  let lastError = 'ffmpeg produced no frame';
  for (const args of attempts) {
    try {
      await execFileAsync(request.ffmpegPath, args);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (await wroteAFrame(request.thumbnailOutputPath)) {
      return request.thumbnailOutputPath;
    }
    lastError = 'ffmpeg exited cleanly but wrote no frame';
  }
  throw new Error(lastError);
}
