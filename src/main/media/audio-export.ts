import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { MP3_BITRATE } from './audio-timeline';

const execFileAsync = util.promisify(execFile);

/**
 * Beta S134 — saving a copy of a finished master in either deliverable
 * format, whatever format the master itself was rendered in.
 *
 * Before this, "Save a copy…" was a byte copy: getting the other format
 * meant a full re-render, and a default file name ending `.mp3` over a WAV
 * master silently wrote WAV bytes into an `.mp3` file — a file half the
 * players open and none should. Now the *picked* extension is the contract:
 * matching extension copies bytes untouched (a copy must not re-encode what
 * it claims to merely copy), differing extension transcodes through ffmpeg.
 *
 * Same conventions as `audio-timeline.ts`: pure `build*Args` returning exact
 * argument lists (asserted by unit tests), a thin async wrapper, and the
 * same codec choices — 16-bit PCM WAV as the interchange default,
 * `libmp3lame` at the shared `MP3_BITRATE` for the convenience format.
 */

export type AudioExportFormat = 'wav' | 'mp3';

/** The deliverable a file's extension claims, or `null` for anything else (left untouched). */
export function audioExportFormatOf(filePath: string): AudioExportFormat | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.wav') return 'wav';
  if (extension === '.mp3') return 'mp3';
  return null;
}

/** Exported for tests — the exact transcode invocation. */
export function buildAudioExportArgs(
  sourcePath: string,
  outputPath: string,
  format: AudioExportFormat,
): string[] {
  const codec =
    format === 'wav'
      ? // 16-bit PCM — the same interchange choice every renderer here makes.
        ['-c:a', 'pcm_s16le']
      : ['-c:a', 'libmp3lame', '-b:a', MP3_BITRATE];
  // `-vn` drops any video stream: this is an audio export even if a video
  // master is ever routed through it.
  return ['-y', '-i', sourcePath, '-vn', ...codec, outputPath];
}

/**
 * Copies `sourcePath` to `outputPath`, transcoding when the two extensions
 * claim different audio formats. An unrecognized extension on either side
 * falls back to a byte copy — never a guess at what the user meant.
 */
export async function exportAudioCopy(
  sourcePath: string,
  outputPath: string,
  ffmpegPath: string,
): Promise<'copied' | 'transcoded'> {
  const sourceFormat = audioExportFormatOf(sourcePath);
  const targetFormat = audioExportFormatOf(outputPath);
  if (!sourceFormat || !targetFormat || sourceFormat === targetFormat) {
    await fs.promises.copyFile(sourcePath, outputPath);
    return 'copied';
  }
  await execFileAsync(ffmpegPath, buildAudioExportArgs(sourcePath, outputPath, targetFormat));
  return 'transcoded';
}
