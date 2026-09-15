import { execFile } from 'node:child_process';
import util from 'node:util';

import { buildDecodeFrameArgs, buildEncodeFrameArgs } from './watermark-args';

const execFileAsync = util.promisify(execFile);

/** Enough for a 4K RGBA frame with headroom; a still beyond this is refused rather than truncated. */
export const RAW_FRAME_MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Beta S235 Phase 4 — one frame in and out of ffmpeg as raw RGBA.
 *
 * Both still engines (the alpha-unblend worker and the LaMa inpainter) need
 * exactly this pair and nothing else from ffmpeg, so it lives in one place
 * rather than being copied into each. The decode refuses a short read: a
 * truncated frame indexed as if it were full would produce a garbled repair
 * rather than an error.
 */
export async function decodeFrameRgba(
  ffmpegPath: string,
  inputPath: string,
  width: number,
  height: number,
  /** Beta S495 — seek into a clip first. Ignored (and harmless) for a still. */
  atSeconds?: number,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(ffmpegPath, buildDecodeFrameArgs(inputPath, atSeconds), {
    maxBuffer: RAW_FRAME_MAX_BUFFER,
    encoding: 'buffer',
  });
  const expected = width * height * 4;
  if (stdout.length < expected) {
    throw new Error(`decode produced ${stdout.length} bytes, expected ${expected}`);
  }
  return stdout.subarray(0, expected);
}

/** Writes one raw RGBA frame to `outputPath` through ffmpeg's stdin. */
export function encodeFrameRgba(
  ffmpegPath: string,
  outputPath: string,
  pixels: Buffer,
  width: number,
  height: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      ffmpegPath,
      buildEncodeFrameArgs(outputPath, width, height),
      { maxBuffer: RAW_FRAME_MAX_BUFFER },
      (error: Error | null) => (error ? reject(error) : resolve()),
    );
    child.stdin?.on('error', (err: unknown) =>
      reject(err instanceof Error ? err : new Error(String(err))),
    );
    child.stdin?.end(pixels);
  });
}

/**
 * Beta S243 — the pixel dimensions of a still, and nothing else.
 *
 * **Why not `probeClip`.** That is a *clip* prober: it ends by refusing
 * anything it cannot read a duration from. A PNG has no duration — ffmpeg
 * reports `Duration: N/A` — so every PNG still was rejected with *"the file is
 * not usable media"*, which is both wrong and alarming about a file that is
 * perfectly good. It survived review because a JPEG happens to report a
 * 0.04 s duration through the `image2` demuxer, so the common case passed.
 *
 * The bug reached a user through a file named `.jpg` that was **PNG bytes** —
 * Flow's own output, saved under the extension its URL implied. So the
 * extension could not be trusted to predict it either.
 *
 * Cleaning a still needs the frame size and nothing more: the decode is
 * `-frames:v 1` regardless, and duration, fps and audio are all questions
 * about a clip.
 */
export async function probeFrameSize(
  ffmpegPath: string,
  inputPath: string,
): Promise<{ width: number; height: number }> {
  let stderr = '';
  try {
    // ffmpeg exits non-zero when given no output target; the stream table it
    // prints on the way out is the whole point of the call.
    await execFileAsync(ffmpegPath, ['-hide_banner', '-nostdin', '-i', inputPath]);
  } catch (error) {
    // execFile rejects with the captured streams attached; the stream table
    // ffmpeg printed before exiting is on stderr and is what we came for.
    const captured = (error as { stderr?: string | Buffer } | null)?.stderr;
    stderr = typeof captured === 'string' ? captured : (captured?.toString('utf8') ?? '');
  }

  // The first video stream's resolution. `\b` on both sides so a bitrate or a
  // SAR/DAR pair cannot be mistaken for one.
  const match = /Stream #\d+:\d+[^\n]*: Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  if (!match) {
    throw new Error(`Could not read the picture size from "${inputPath}".`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}
