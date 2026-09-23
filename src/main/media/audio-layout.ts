import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { buildSpeechBusChain, type SpeechBusMode } from './speech-loudness';

const execFileAsync = util.promisify(execFile);

/**
 * Beta Step 106 — lays generated speech onto a finished clip.
 *
 * Sibling to `video-editor.ts`, same convention: a pure `build*Args` returning
 * the exact argument list, a thin `async` wrapper, and every numeric clamped
 * before it reaches a filter-graph string. A separate file rather than more
 * exports on `video-editor.ts` because that module is generic video editing and
 * this one only makes sense for speech-over-video; its single-track
 * `muxNarrationWithDucking` is still the right call for plain narration and is
 * reused unchanged.
 *
 * **Two properties of ffmpeg here were measured, not assumed, because both
 * fail silently in a way that looks like an engine bug rather than a mux bug:**
 *
 * 1. **`amix` divides by the number of inputs.** Mixing a tone against a silent
 *    bed measured -24.1 dB by default versus -18.1 dB with `normalize=0` —
 *    exactly 6 dB, a factor of two. A dub laid over a silent bed with two
 *    spoken lines is three inputs, so it arrives at a third of its level and
 *    the report is "the TTS output is too quiet". Every mix below therefore
 *    carries `normalize=0`, and the unit tests assert its presence.
 * 2. **`adelay` with a single value delays only the first channel.** On a
 *    stereo source that desynchronises the speech against itself. `:all=1`
 *    applies one delay to every channel regardless of the channel count, which
 *    also means the builder never has to know how many channels it is dealing
 *    with. Both forms were confirmed accepted by the bundled static build.
 *
 * The source video is never re-encoded (`-c:v copy`) and never overwritten —
 * callers pass a new `outputPath`.
 */

/** The engine emits 24 kHz; real clips measured 48 kHz. Everything is resampled to the video's rate. */
const DEFAULT_SAMPLE_RATE = 48_000;

/**
 * Beyond this many simultaneous `-i` inputs the graph gets unwieldy and
 * ffmpeg's own input limit comes into view. A shot with more spoken lines than
 * this wants a pre-mixed bed, not a wider graph.
 */
export const MAX_DUB_SEGMENTS = 32;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** `adelay` takes whole milliseconds; a fractional offset would be silently truncated. */
function offsetToMs(offsetSeconds: number): number {
  return Math.round(clamp(offsetSeconds, 0, 86_400) * 1000);
}

export interface DubSegmentInput {
  /** A generated speech file. */
  audioPath: string;
  /** Where in the clip this line starts, in seconds from the clip's start. */
  offsetSeconds: number;
  /** Per-line level, 0-2 so a quiet clone can be lifted. @default 1 */
  volume?: number;
  /**
   * Beta S151 (F3) — per-segment fades, in seconds.
   *
   * Optional and absent by default, so the dub and Voice paths that predate
   * this are byte-identical: no `afade` is emitted unless a caller asks for
   * one. The timeline is the only consumer today, where fades are a per-clip
   * property that had a column, a schema and a repository round-trip since
   * S145 but never reached ffmpeg.
   *
   * `fadeOutSeconds` needs `durationSeconds` to know where the segment ends —
   * `afade=t=out` takes a start time, not a distance from the end. A fade-out
   * with no duration to anchor it is dropped rather than guessed at.
   */
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  /** This segment's own length. Consulted to place a fade-out, and by `sourceInSeconds`/`tempo` to bound the trim. */
  durationSeconds?: number;
  /**
   * Beta S154 phase 3 — trim into the source file, in seconds.
   *
   * Optional and absent by default like the fades, and for the same
   * compatibility reason: the dub and Voice paths never trim, so no `atrim`
   * is emitted unless a caller asks. The timeline is the consumer — its clips
   * carry `sourceInFrames`, which never reached the audio graph before this
   * (a head-trimmed audio clip played its untrimmed head).
   */
  sourceInSeconds?: number;
  /**
   * Beta S154 phase 3 — playback rate, `atempo`-chained (0.25–4). The
   * segment still occupies `durationSeconds` on the timeline; tempo widens
   * how much source is consumed to fill it. Absent = 1 = nothing emitted.
   */
  tempo?: number;
  /**
   * Beta S154 phase 6 — a keyframed volume curve as an ffmpeg expression over
   * `t` in **linear gain**, replacing the static `volume` when present. `t`
   * is clip-local because the volume filter runs before `adelay` — the same
   * ordering fact the fades rely on. Absent = the static `volume` term,
   * byte-identical to every graph before this phase.
   */
  volumeExpression?: string;
  /**
   * Beta S66 — Synthesized FFmpeg audio filter chain (EQ, compressor, gate,
   * reverb, pitch, pan, isolation, denoiser). Runs clip-local before adelay.
   */
  audioFilter?: string;
}

export interface AudioLayoutOptions {
  /**
   * What happens to the clip's own audio.
   *
   * `replace` drops it entirely — the honest default for a dub, where the
   * original dialogue is the thing being replaced. `duck` keeps it far down so
   * music and effects survive, at the cost of the original dialogue still
   * being faintly present underneath.
   */
  originalMode: 'replace' | 'duck';
  /** Level for the original audio under `duck`, 0-1. @default 0.08 */
  duckedVolume?: number;
  /** The clip's true length, from `ClipProbe.durationSec` — sizes the silent bed under `replace`. */
  durationSeconds: number;
  /** The clip's audio sample rate, from `ClipProbe.audioSampleRate`. @default 48000 */
  sampleRate?: number;
  /**
   * Whether the source has an audio stream at all (`ClipProbe.hasAudio`).
   *
   * Not a convenience: with `duck` on a source that has none, `[0:a]` refers to
   * a stream that does not exist and ffmpeg fails outright. When this is
   * `false` the builder silently uses the `replace` graph, which synthesises
   * its own bed. @default true
   */
  hasOriginalAudio?: boolean;
  /**
   * Beta S182 — how the finished mix is levelled. See `speech-loudness.ts`.
   *
   * Applied to the whole mix rather than to the speech alone, which is right
   * for both modes: under `replace` the program *is* the speech, and under
   * `duck` the deliverable is speech over a faint original and it is that sum
   * the target describes.
   *
   * Defaults to `off` — the graph that shipped before this step. `assembleDub`
   * owns the two-pass sequencing and passes `measure`/`apply` explicitly.
   */
  loudness?: SpeechBusMode;
}

/**
 * Builds the filter graph and the input list for laying N speech tracks onto
 * one video.
 *
 * Exported separately from the argument list so the graph can be asserted in a
 * test without matching around twenty surrounding tokens.
 */
export function buildDubFilterGraph(
  segments: DubSegmentInput[],
  options: AudioLayoutOptions,
): string {
  const sampleRate = Math.round(clamp(options.sampleRate ?? DEFAULT_SAMPLE_RATE, 8000, 192_000));
  const durationSeconds = clamp(options.durationSeconds, 0.001, 86_400);
  const hasOriginalAudio = options.hasOriginalAudio ?? true;
  const duckOriginal = options.originalMode === 'duck' && hasOriginalAudio;

  const chains: string[] = [];

  // The bed sets the mix's length via `duration=first`, so it must come first
  // in the amix input list.
  if (duckOriginal) {
    const duckedVolume = clamp(options.duckedVolume ?? 0.08, 0, 1);
    chains.push(`[0:a]aresample=${sampleRate},volume=${duckedVolume.toFixed(3)}[bed]`);
  } else {
    // A synthesised silent bed rather than mixing straight into the speech:
    // it pins the output to exactly the clip's length even when the last line
    // ends early, so the muxed audio never runs short of the video.
    chains.push(
      `anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${durationSeconds.toFixed(3)},asetpts=N/SR/TB[bed]`,
    );
  }

  const labels = ['[bed]'];
  segments.forEach((segment, index) => {
    const label = `s${index}`;
    const volume = clamp(segment.volume ?? 1, 0, 2);
    chains.push(
      // Input 0 is the video, so segment N is input N+1.
      `[${index + 1}:a]aresample=${sampleRate},volume=${volume.toFixed(3)},` +
        `adelay=${offsetToMs(segment.offsetSeconds)}:all=1[${label}]`,
    );
    labels.push(`[${label}]`);
  });

  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,` +
      // amix with normalize=0 sums rather than averages, so overlapping lines
      // can exceed full scale. The bus always ends in a limiter, which is
      // cheaper than clipping. S182 — and now carries the loudness stage too.
      `${buildSpeechBusChain(sampleRate, options.loudness ?? { kind: 'off' })}[aout]`,
  );

  return chains.join(';');
}

export function buildDubMuxArgs(
  videoPath: string,
  segments: DubSegmentInput[],
  outputPath: string,
  options: AudioLayoutOptions,
): string[] {
  if (segments.length === 0) {
    throw new Error('buildDubMuxArgs needs at least one segment.');
  }
  if (segments.length > MAX_DUB_SEGMENTS) {
    throw new Error(
      `buildDubMuxArgs supports at most ${MAX_DUB_SEGMENTS} segments, got ${segments.length}.`,
    );
  }

  return [
    '-y',
    '-i',
    videoPath,
    ...segments.flatMap((segment) => ['-i', segment.audioPath]),
    '-filter_complex',
    buildDubFilterGraph(segments, options),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    outputPath,
  ];
}

/**
 * Beta S182 — pass 1 for the dub mux.
 *
 * `-map [aout]` only, so the video is demuxed but never decoded and never
 * copied — the pass costs an audio decode of the segments plus the clip's own
 * track, not a second trip through the file.
 */
export function buildDubMuxMeasureArgs(
  videoPath: string,
  segments: DubSegmentInput[],
  options: AudioLayoutOptions,
): string[] {
  return [
    '-y',
    '-i',
    videoPath,
    ...segments.flatMap((segment) => ['-i', segment.audioPath]),
    '-filter_complex',
    buildDubFilterGraph(segments, { ...options, loudness: { kind: 'measure' } }),
    '-map',
    '[aout]',
    '-f',
    'null',
    '-',
  ];
}

export async function muxDub(
  videoPath: string,
  segments: DubSegmentInput[],
  outputPath: string,
  ffmpegPath: string,
  options: AudioLayoutOptions,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, buildDubMuxArgs(videoPath, segments, outputPath, options));
}
