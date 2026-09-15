import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

/**
 * Beta Step 13 (gap 7) — thin wrappers over ffmpeg args, sibling to
 * `post-processor.ts`/`post-processor-worker.ts`. Deliberately NOT wrapped in
 * a `worker_threads` worker like thumbnail extraction is: `execFile` already
 * spawns ffmpeg as a genuine OS subprocess, so it never blocks the main
 * thread's event loop regardless — the worker in `post-processor-worker.ts`
 * exists for isolation of that pipeline's specific failure modes, not
 * because subprocess `execFile` calls are otherwise blocking.
 *
 * Each operation splits into a pure `build*Args` function (the actual
 * ffmpeg argument list, fully unit-testable without a real ffmpeg binary or
 * mocking `node:child_process`) and a thin `async` wrapper that runs it.
 * Numeric filter parameters (volume/duration/seconds) are clamped before
 * being interpolated into `-filter_complex` strings — mirrors a documented
 * good practice in the reference project this gap's scope came from
 * (`Docs/research-notes.md`'s FlowKit audit): never trust a numeric option
 * into a filter-graph string unclamped, even though `execFile` (no shell)
 * already rules out shell-injection via file paths.
 */

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// trimVideo — cut [startSeconds, endSeconds) out of a single video.
// ---------------------------------------------------------------------------

export interface TrimOptions {
  /** @default 0 */
  startSeconds?: number;
  /** Omit to trim to the end of the source. */
  endSeconds?: number;
}

export function buildTrimArgs(inputPath: string, outputPath: string, options: TrimOptions = {}): string[] {
  const start = clamp(options.startSeconds ?? 0, 0, Number.MAX_SAFE_INTEGER);
  const args = ['-y', '-ss', start.toFixed(3), '-i', inputPath];
  if (options.endSeconds !== undefined) {
    const duration = clamp(options.endSeconds - start, 0, Number.MAX_SAFE_INTEGER);
    args.push('-t', duration.toFixed(3));
  }
  // Stream copy — trimming doesn't need re-encoding, keeps this fast and lossless.
  args.push('-c', 'copy', outputPath);
  return args;
}

export async function trimVideo(
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
  options: TrimOptions = {},
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, buildTrimArgs(inputPath, outputPath, options));
}

// ---------------------------------------------------------------------------
// concatVideos — stitch multiple videos (assumed same codec/resolution,
// i.e. all sourced from the same Flow generation pipeline) into one, via
// ffmpeg's concat demuxer + stream copy (matches the reference project's
// "merge_videos (concat demuxer)" pattern per Docs/research-notes.md).
// ---------------------------------------------------------------------------

/** Builds the concat-demuxer list-file content — one `file '...'` line per input, single-quoted per ffmpeg's own escaping rule (`'` inside a path becomes `'\''`). */
export function buildConcatFileList(inputPaths: string[]): string {
  return inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
}

export function buildConcatArgs(listFilePath: string, outputPath: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy', outputPath];
}

export async function concatVideos(inputPaths: string[], outputPath: string, ffmpegPath: string): Promise<void> {
  if (inputPaths.length === 0) {
    throw new Error('concatVideos requires at least one input path');
  }
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const listFilePath = path.join(os.tmpdir(), `veo3flow-concat-${crypto.randomUUID()}.txt`);
  await fs.promises.writeFile(listFilePath, buildConcatFileList(inputPaths), 'utf8');
  try {
    await execFileAsync(ffmpegPath, buildConcatArgs(listFilePath, outputPath));
  } finally {
    await fs.promises.rm(listFilePath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// muxNarrationWithDucking — mixes a narration track onto a video, lowering
// (ducking) the video's own audio under the narration rather than fully
// replacing it. A straightforward static-volume duck via `amix`, not a true
// sidechain compressor — matches this gap's "thin wrapper" scope; a real
// dynamic sidechain (`sidechaincompress`) is a possible future refinement,
// not assumed needed until a real narration track surfaces a case where
// static ducking sounds wrong.
// ---------------------------------------------------------------------------

export interface NarrationDuckingOptions {
  /** Original video-audio volume while narration plays, 0–1. @default 0.25 */
  duckedVolume?: number;
  /** Narration track volume, 0–2 (allows boosting a quiet recording). @default 1 */
  narrationVolume?: number;
}

export function buildNarrationDuckingArgs(
  videoPath: string,
  narrationPath: string,
  outputPath: string,
  options: NarrationDuckingOptions = {},
): string[] {
  const duckedVolume = clamp(options.duckedVolume ?? 0.25, 0, 1);
  const narrationVolume = clamp(options.narrationVolume ?? 1, 0, 2);
  const filterComplex =
    `[0:a]volume=${duckedVolume.toFixed(3)}[ducked];` +
    `[1:a]volume=${narrationVolume.toFixed(3)}[narration];` +
    // S154 — `normalize=0`, the measured house rule this pre-S106 line
    // predated: the default divides by input count, so the volumes chosen
    // above were actually emitted at half. Caught by the effects suite's
    // grep guard; the builder has no consumers, so nothing shipped changed.
    `[ducked][narration]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;
  return [
    '-y',
    '-i',
    videoPath,
    '-i',
    narrationPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    outputPath,
  ];
}

export async function muxNarrationWithDucking(
  videoPath: string,
  narrationPath: string,
  outputPath: string,
  ffmpegPath: string,
  options: NarrationDuckingOptions = {},
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, buildNarrationDuckingArgs(videoPath, narrationPath, outputPath, options));
}

// ---------------------------------------------------------------------------
// mixBackgroundMusic — overlays looping background music under a video's
// existing audio, trimmed to the video's own length (`-shortest`).
// ---------------------------------------------------------------------------

export interface MusicMixOptions {
  /** Background music volume, 0–1 (kept well below the main audio by default). @default 0.15 */
  musicVolume?: number;
}

export function buildMusicMixArgs(videoPath: string, musicPath: string, outputPath: string, options: MusicMixOptions = {}): string[] {
  const musicVolume = clamp(options.musicVolume ?? 0.15, 0, 1);
  // S154 — `normalize=0` for the same measured reason as the duck above.
  const filterComplex = `[1:a]volume=${musicVolume.toFixed(3)}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;
  return [
    '-y',
    '-i',
    videoPath,
    '-stream_loop',
    '-1',
    '-i',
    musicPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-shortest',
    outputPath,
  ];
}

export async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  ffmpegPath: string,
  options: MusicMixOptions = {},
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, buildMusicMixArgs(videoPath, musicPath, outputPath, options));
}
