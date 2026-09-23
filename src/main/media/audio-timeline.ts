import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { buildAtempoChain } from '@shared';

import { MAX_DUB_SEGMENTS, type DubSegmentInput } from './audio-layout';
import { buildSpeechBusChain, measureLoudness, type SpeechBusMode } from './speech-loudness';

const execFileAsync = util.promisify(execFile);

/**
 * Beta Step 114 — renders generated speech onto a *standalone* audio timeline,
 * for post work in an external editor (CapCut et al.).
 *
 * Sibling of `audio-layout.ts` and the same convention: pure `build*` returning
 * exact argument lists, a thin async wrapper, every numeric clamped before it
 * reaches a filter-graph string. A separate file because this renders audio
 * with no video input at all — input numbering differs (segment N is input N,
 * not N+1), and conflating the two graphs is how an off-by-one lands in both.
 *
 * The file's length is pinned to **exactly the source clip's measured
 * duration** by the same silent-bed technique the mux uses. That is the whole
 * deliverable: a file that starts at the clip's 00:00 and ends at its end
 * drops onto an external editor's track with no manual alignment.
 *
 * Both of S106's measured ffmpeg traps apply unchanged and are asserted by the
 * unit tests: every mix carries `normalize=0` (default amix divides by input
 * count) and every delay is `adelay=MS:all=1` (a single value delays only the
 * first channel).
 */

/** The two deliverable codecs. WAV is the post-production interchange default. */
export type AudioTimelineFormat = 'wav' | 'mp3';

/**
 * Beta S123 — the ceiling for a *standalone* timeline (the Text to Speech
 * workspace), where a narration script routinely exceeds the dub's
 * `MAX_DUB_SEGMENTS`. Beyond 32 inputs the render switches to waves of
 * pre-mixed beds (`audio-layout.ts:44` names exactly this fix), so the cap
 * here is about honesty in the UI, not a filter-graph limit: at 512 lines the
 * bed mix still takes only 16 inputs.
 */
export const MAX_TIMELINE_SEGMENTS = 512;

/** Post interchange standard; also what real Veo clips measure. */
const DEFAULT_SAMPLE_RATE = 48_000;

/**
 * MP3 only: the LAME encoder writes priming samples that players render as
 * leading silence (~25–50ms), shifting everything late. WAV has no such
 * offset, which is why it is the default deliverable and MP3 is labelled a
 * convenience in the UI.
 */
export const MP3_BITRATE = '320k';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function offsetToMs(offsetSeconds: number): number {
  return Math.round(clamp(offsetSeconds, 0, 86_400) * 1000);
}

/**
 * Beta S151 (F3) — the optional `afade` pair for one segment.
 *
 * Returns the empty string when the caller asked for no fades, so every graph
 * built before this step is emitted byte-for-byte as it was — the dub and
 * Voice paths share this builder and neither sets a fade.
 *
 * Both fades are clamped to the segment's own length, which is what stops a
 * 5-second fade on a 2-second clip from producing an `afade` whose start time
 * is negative (ffmpeg accepts it and silences the whole segment).
 */
function buildFadeChain(segment: DubSegmentInput): string {
  const duration = segment.durationSeconds;
  const parts: string[] = [];

  const fadeIn = clamp(segment.fadeInSeconds ?? 0, 0, duration ?? 86_400);
  if (fadeIn > 0) {
    parts.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  }

  // A fade-out with no measured length has nowhere to start from. Skipped
  // rather than approximated: guessing an end time would fade the wrong part
  // of the clip, which is worse than not fading it.
  const fadeOut = clamp(segment.fadeOutSeconds ?? 0, 0, duration ?? 0);
  if (fadeOut > 0 && duration !== undefined) {
    parts.push(`afade=t=out:st=${Math.max(0, duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }

  return parts.length > 0 ? `,${parts.join(',')}` : '';
}

export interface AudioTimelineOptions {
  /** The clip's true length, from `ClipProbe.durationSec` — sizes the silent bed and pins the output. */
  durationSeconds: number;
  /** @default 48000 */
  sampleRate?: number;
  format: AudioTimelineFormat;
  /**
   * Beta S182 — how the summed speech is levelled. See `speech-loudness.ts`.
   *
   * Defaults to `off`, which is the graph that shipped before this step. The
   * default is deliberate rather than lazy: `renderAudioTimeline` owns the
   * two-pass sequencing and passes `measure`/`apply` explicitly, so a caller
   * that reaches for `buildAudioTimelineArgs` directly gets one deterministic
   * pass instead of a half-normalized file.
   */
  loudness?: SpeechBusMode;
}

/** Exported separately so tests can assert the graph without matching around the surrounding tokens. */
export function buildAudioTimelineGraph(
  segments: DubSegmentInput[],
  options: AudioTimelineOptions,
): string {
  const sampleRate = Math.round(clamp(options.sampleRate ?? DEFAULT_SAMPLE_RATE, 8000, 192_000));
  const durationSeconds = clamp(options.durationSeconds, 0.001, 86_400);

  const chains: string[] = [
    // The bed is first in the amix list and sets the output length via
    // `duration=first` — so the file never runs short of the clip even when
    // the last line ends early, and never long even when one overruns.
    `anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${durationSeconds.toFixed(3)},asetpts=N/SR/TB[bed]`,
  ];

  const labels = ['[bed]'];
  segments.forEach((segment, index) => {
    const label = `s${index}`;
    const volume = clamp(segment.volume ?? 1, 0, 2);

    // S154 phase 3 — the per-segment chain, in load-bearing order:
    // `aresample, atrim/asetpts, atempo, volume, afade…, adelay`.
    // Trim before tempo so the source window is cut in *source* seconds;
    // tempo before the fades so fade times stay in the segment's own
    // *timeline* seconds; fades before the delay for F3's measured reason
    // (after it, `st=0` fades the leading silence). Every piece is optional
    // and absent-by-default, so the dub and Voice graphs are byte-identical.
    const tempo = clamp(segment.tempo ?? 1, 0.25, 4);
    const sourceIn = clamp(segment.sourceInSeconds ?? 0, 0, 86_400);
    let trimChain = '';
    if (sourceIn > 0 || Math.abs(tempo - 1) > 0.001) {
      const sourceWindow =
        segment.durationSeconds !== undefined
          ? `:${(sourceIn + clamp(segment.durationSeconds, 0.001, 86_400) * tempo).toFixed(3)}`
          : '';
      trimChain = `,atrim=${sourceIn.toFixed(3)}${sourceWindow},asetpts=PTS-STARTPTS`;
    }
    const tempoChain = buildAtempoChain(tempo);

    // S154 phase 6 — a keyframed curve replaces the static volume term.
    // Quoted (the ladder contains commas) and frame-evaluated; `t` here is
    // clip-local, which is exactly what clip-relative keyframes want.
    const volumeTerm = segment.volumeExpression
      ? `volume=volume='${segment.volumeExpression}':eval=frame`
      : `volume=${volume.toFixed(3)}`;

    const audioFilterTerm = segment.audioFilter ? `,${segment.audioFilter}` : '';

    chains.push(
      // No video input here, so segment N is input N — not N+1 as in the mux.
      `[${index}:a]aresample=${sampleRate}` +
        trimChain +
        (tempoChain ? `,${tempoChain}` : '') +
        `,${volumeTerm}` +
        audioFilterTerm +
        buildFadeChain(segment) +
        `,adelay=${offsetToMs(segment.offsetSeconds)}:all=1[${label}]`,
    );
    labels.push(`[${label}]`);
  });

  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,` +
      // normalize=0 sums rather than averages, so overlapping lines can exceed
      // full scale; the bus always ends in a limiter, which is cheaper than
      // clipping. S182 — and now also carries the loudness stage.
      `${buildSpeechBusChain(sampleRate, options.loudness ?? { kind: 'off' })}[aout]`,
  );

  return chains.join(';');
}

export function buildAudioTimelineArgs(
  segments: DubSegmentInput[],
  outputPath: string,
  options: AudioTimelineOptions,
): string[] {
  if (segments.length === 0) {
    throw new Error('buildAudioTimelineArgs needs at least one segment.');
  }
  if (segments.length > MAX_DUB_SEGMENTS) {
    throw new Error(
      `buildAudioTimelineArgs supports at most ${MAX_DUB_SEGMENTS} segments, got ${segments.length}.`,
    );
  }

  const codec =
    options.format === 'wav'
      ? // 16-bit PCM: the interchange default every editor ingests. s24/s32
        // would double the size for speech that started life at 24 kHz mono.
        ['-c:a', 'pcm_s16le']
      : ['-c:a', 'libmp3lame', '-b:a', MP3_BITRATE];

  return [
    '-y',
    ...segments.flatMap((segment) => ['-i', segment.audioPath]),
    '-filter_complex',
    buildAudioTimelineGraph(segments, options),
    '-map',
    '[aout]',
    ...codec,
    outputPath,
  ];
}

/**
 * Beta S182 — pass 1: the identical graph, decoded and thrown away.
 *
 * The inputs and the filter graph must match pass 2 exactly up to the
 * measurement point, which is why this shares `buildAudioTimelineGraph` rather
 * than measuring the segments individually. Measuring the parts would report a
 * loudness the sum does not have.
 */
export function buildAudioTimelineMeasureArgs(
  segments: DubSegmentInput[],
  options: AudioTimelineOptions,
): string[] {
  return [
    '-y',
    ...segments.flatMap((segment) => ['-i', segment.audioPath]),
    '-filter_complex',
    buildAudioTimelineGraph(segments, { ...options, loudness: { kind: 'measure' } }),
    '-map',
    '[aout]',
    '-f',
    'null',
    '-',
  ];
}

/**
 * Beta S123 — splits an over-wide segment list into waves that each fit one
 * filter graph. Pure so the chunk boundaries are testable.
 */
export function chunkTimelineSegments(
  segments: readonly DubSegmentInput[],
  chunkSize = MAX_DUB_SEGMENTS,
): DubSegmentInput[][] {
  const chunks: DubSegmentInput[][] = [];
  for (let start = 0; start < segments.length; start += chunkSize) {
    chunks.push(segments.slice(start, start + chunkSize));
  }
  return chunks;
}

/**
 * Beta S123 — mixes N full-length wave beds into the final deliverable.
 *
 * Every bed was rendered pinned to the same duration and sample rate, so
 * `duration=first` is exact. `normalize=0` again: the beds are already
 * position-mixed, and averaging them would quiet every line by the wave
 * count. The limiter catches the (rare) case of lines overlapping across
 * wave boundaries summing past full scale.
 */
export function buildBedMixGraph(
  bedPaths: readonly string[],
  options: Pick<AudioTimelineOptions, 'sampleRate' | 'loudness'>,
): string {
  const sampleRate = Math.round(clamp(options.sampleRate ?? DEFAULT_SAMPLE_RATE, 8000, 192_000));
  const inputs = bedPaths.map((_, index) => `[${index}:a]`).join('');
  return (
    `${inputs}amix=inputs=${bedPaths.length}:duration=first:dropout_transition=0:normalize=0,` +
    // S182 — the loudness stage belongs *here*, on the finished sum, and never
    // on the beds feeding it. Each bed is one wave of ≤32 lines over the same
    // full-length silence, so a bed normalized on its own would be levelled
    // against a program that is mostly silence — and then summed with others
    // that had been levelled the same wrong way.
    `${buildSpeechBusChain(sampleRate, options.loudness ?? { kind: 'off' })}[aout]`
  );
}

export function buildBedMixArgs(
  bedPaths: readonly string[],
  outputPath: string,
  options: Pick<AudioTimelineOptions, 'format' | 'sampleRate' | 'loudness'>,
): string[] {
  if (bedPaths.length < 2) {
    throw new Error('buildBedMixArgs needs at least two beds — use the single-pass path otherwise.');
  }
  if (bedPaths.length > MAX_DUB_SEGMENTS) {
    throw new Error(`buildBedMixArgs supports at most ${MAX_DUB_SEGMENTS} beds, got ${bedPaths.length}.`);
  }

  const codec =
    options.format === 'wav'
      ? ['-c:a', 'pcm_s16le']
      : ['-c:a', 'libmp3lame', '-b:a', MP3_BITRATE];

  return [
    '-y',
    ...bedPaths.flatMap((bedPath) => ['-i', bedPath]),
    '-filter_complex',
    buildBedMixGraph(bedPaths, options),
    '-map',
    '[aout]',
    ...codec,
    outputPath,
  ];
}

/** Beta S182 — pass 1 for the bed mix. Same graph, `-f null -`. */
export function buildBedMixMeasureArgs(
  bedPaths: readonly string[],
  options: Pick<AudioTimelineOptions, 'sampleRate'>,
): string[] {
  return [
    '-y',
    ...bedPaths.flatMap((bedPath) => ['-i', bedPath]),
    '-filter_complex',
    buildBedMixGraph(bedPaths, { ...options, loudness: { kind: 'measure' } }),
    '-map',
    '[aout]',
    '-f',
    'null',
    '-',
  ];
}

export async function renderAudioTimeline(
  segments: DubSegmentInput[],
  outputPath: string,
  ffmpegPath: string,
  options: AudioTimelineOptions,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  if (segments.length <= MAX_DUB_SEGMENTS) {
    // S182 — two passes. `measureLoudness` never throws: a measurement that
    // could not be taken falls back to `off`, which is the single-pass graph
    // that shipped before this step. A loudness improvement must not be able
    // to turn a working render into a failed one.
    const measured = await measureLoudness(
      ffmpegPath,
      buildAudioTimelineMeasureArgs(segments, options),
    );
    await execFileAsync(
      ffmpegPath,
      buildAudioTimelineArgs(segments, outputPath, {
        ...options,
        loudness: measured ? { kind: 'apply', measured } : { kind: 'off' },
      }),
    );
    return;
  }

  if (segments.length > MAX_TIMELINE_SEGMENTS) {
    throw new Error(
      `renderAudioTimeline supports at most ${MAX_TIMELINE_SEGMENTS} segments, got ${segments.length}.`,
    );
  }

  // Beta S123 — too many lines for one graph: render waves of ≤32 as
  // full-length WAV beds, then mix the beds. Each bed is pinned to the same
  // duration by the same silent-bed technique, so the final mix's
  // `duration=first` cannot shorten anything. Beds are WAV regardless of the
  // requested format — an MP3 intermediate would stack encoder priming delay
  // into the middle of the pipeline.
  const bedPaths = chunkTimelineSegments(segments).map(
    (_, index) => `${outputPath}.bed-${index}.wav`,
  );
  try {
    const chunks = chunkTimelineSegments(segments);
    for (const [index, chunk] of chunks.entries()) {
      // Beds render with `loudness: off` — see `buildBedMixGraph`. They are
      // intermediates that get summed again, and the sum is what gets levelled.
      await execFileAsync(
        ffmpegPath,
        buildAudioTimelineArgs(chunk, bedPaths[index], {
          ...options,
          format: 'wav',
          loudness: { kind: 'off' },
        }),
      );
    }
    const measured = await measureLoudness(ffmpegPath, buildBedMixMeasureArgs(bedPaths, options));
    await execFileAsync(
      ffmpegPath,
      buildBedMixArgs(bedPaths, outputPath, {
        ...options,
        loudness: measured ? { kind: 'apply', measured } : { kind: 'off' },
      }),
    );
  } finally {
    // The beds are scratch either way — a failed render must not strand
    // hundreds of megabytes of intermediates in the masters directory.
    for (const bedPath of bedPaths) {
      await fs.promises.rm(bedPath, { force: true }).catch(() => undefined);
    }
  }
}
