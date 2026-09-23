import { execFile } from 'node:child_process';
import util from 'node:util';

import type {
  ClipProbe,
  ClipProbeOptions,
  ClipSegmentationDoubt,
  ClipSoundSegmentation,
  ClipTimeWindow,
} from '@shared';

const execFileAsync = util.promisify(execFile);

/**
 * Beta Step 106 — measures a rendered clip, because nothing else in the app can.
 *
 * Every duration the app currently holds is a *request* or an *estimate*:
 * `jobs.duration` is a string label ("8s") text-matched against a Flow DOM tab
 * and never checked against the produced file, and all three Veo 3.1 variants
 * declare `"durations": []` in the model registry, so for the default model no
 * duration is even sent. `outputs` has no duration column, `StoryTakeRef` has
 * no duration field, and `StoryShot.durationSeconds` is an intent snapped at
 * enqueue. The only measured duration anywhere lives in transient React state
 * behind a hidden `<video>` in `HandoffCard.tsx`, and is never persisted.
 *
 * Fitting audio to a clip whose length is a guess does not work, so this reads
 * the file.
 *
 * `ffprobe` is **not available** — `ffmpeg-static` ships a single `ffmpeg`
 * executable and `forge.config.ts` copies that one package as an
 * `extraResource`. Adding `ffprobe-static` would mean a second bundled binary
 * in a signed and notarized app for something one ffmpeg invocation already
 * answers, so this reads what ffmpeg prints. A single `-f null -` pass (decode
 * everything, write nothing) yields the container duration, the stream
 * geometry and the `silencedetect` events together, at 21-27x realtime on real
 * 8-second clips.
 *
 * Lives in `media/` rather than `tts/` because it knows nothing about speech —
 * it is a general media primitive, sibling to `video-editor.ts`, and follows
 * that file's convention exactly: a pure `build*Args`, a pure parser, and a
 * thin `async` wrapper. The parser being pure is what lets it be tested against
 * captured stderr from real clips — including the awkward ones — with no
 * ffmpeg binary and no `node:child_process` mocking.
 */

const DEFAULT_NOISE_DB = -30;
const DEFAULT_MIN_SILENCE_SEC = 0.25;

/** ffmpeg's progress lines accumulate in stderr; well above anything a clip produces, far below a runaway. */
const PROBE_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Two silence events closer together than this are treated as one.
 *
 * Not a stylistic tidy-up: a real clip reported `silence_end: 3.17167`
 * immediately followed by `silence_start: 3.17179`, a 0.12 ms "sound" that is
 * detector jitter rather than audio. Left unmerged it becomes a spurious
 * one-frame speech window a dub could be aligned against.
 */
const WINDOW_MERGE_EPSILON_SEC = 0.01;

/** A single window covering at least this much of the clip says nothing useful about where speech is. */
const WHOLE_CLIP_COVERAGE_RATIO = 0.95;

/**
 * Below this fraction of total silence, the detector found dropouts in a
 * continuous bed rather than pauses between spoken lines.
 *
 * Calibrated against real clips, not chosen for roundness. The best-behaved
 * sample (two clean ~0.3 s gaps in 8 s) sits at **7.65 %** and is a genuinely
 * legible segmentation, so anything at or above 8 % — the first value tried —
 * wrongly rejects it. The pathological shape this guards against is a bed with
 * a single sub-100 ms dropout, which lands near **0.6 %**. Two real cases an
 * order of magnitude apart, so the boundary sits between them rather than
 * hugging either.
 */
const MIN_TRUSTWORTHY_SILENCE_RATIO = 0.02;

/** More windows per second than this is fragmentation, not dialogue. */
const MAX_TRUSTWORTHY_WINDOWS_PER_SEC = 0.75;

/** A window shorter than this cannot hold a spoken line. */
const MIN_PLAUSIBLE_SPEECH_SEC = 0.4;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function buildBasicProbeArgs(inputPath: string): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-i',
    inputPath,
    '-f',
    'null',
    '-',
  ];
}

export function buildProbeArgs(inputPath: string, options: Partial<ClipProbeOptions> = {}): string[] {
  // Clamped before interpolation into the filter string — the same rule
  // `video-editor.ts` follows for every numeric filter parameter, even though
  // `execFile` (no shell) already rules out shell injection via the path.
  const noiseDb = clamp(options.noiseDb ?? DEFAULT_NOISE_DB, -90, 0);
  const minSilenceSec = clamp(options.minSilenceSec ?? DEFAULT_MIN_SILENCE_SEC, 0.01, 60);
  return [
    '-hide_banner',
    // Without this ffmpeg keeps stdin open for its interactive `q` handler,
    // which is a hang waiting to happen in a spawned process.
    '-nostdin',
    '-i',
    inputPath,
    '-af',
    `silencedetect=noise=${noiseDb.toFixed(1)}dB:d=${minSilenceSec.toFixed(3)}`,
    // Decode everything, write nothing.
    '-f',
    'null',
    '-',
  ];
}

function timestampToSeconds(hours: string, minutes: string, seconds: string): number {
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Everything ffmpeg printed about the **input**, up to where it starts
 * describing what it would write.
 *
 * Load-bearing: the `Output #0` block repeats a `Stream #0:0 ... Video:` line
 * carrying the same resolution and frame rate, so a whole-stderr regex reads
 * the null muxer's stream as readily as the real one. They agree today only by
 * coincidence — the output stream is `wrapped_avframe`, and anything that made
 * ffmpeg rescale would silently start reporting the wrong geometry.
 */
function inputSection(stderr: string): string {
  const boundaries = [stderr.indexOf('\nStream mapping:'), stderr.indexOf('\nOutput #')].filter(
    (index) => index >= 0,
  );
  return boundaries.length > 0 ? stderr.slice(0, Math.min(...boundaries)) : stderr;
}

function parseDurationSec(section: string): number {
  const match = /^\s*Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/m.exec(section);
  return match ? timestampToSeconds(match[1], match[2], match[3]) : 0;
}

/** The last `time=` ffmpeg reported — how far it actually decoded. */
function parseDecodedSec(stderr: string): number | null {
  const matches = [...stderr.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  if (matches.length === 0) {
    return null;
  }
  const last = matches[matches.length - 1];
  return timestampToSeconds(last[1], last[2], last[3]);
}

function firstStreamLine(section: string, kind: 'Video' | 'Audio'): string | null {
  const match = new RegExp(`^\\s*Stream #\\d+:\\d+.*: ${kind}: .*$`, 'm').exec(section);
  return match ? match[0] : null;
}

/** Coalesces windows that touch or overlap. Input must be sorted by `startSec`. */
function mergeWindows(sorted: ClipTimeWindow[]): ClipTimeWindow[] {
  const merged: ClipTimeWindow[] = [];
  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && window.startSec <= previous.endSec + WINDOW_MERGE_EPSILON_SEC) {
      previous.endSec = Math.max(previous.endSec, window.endSec);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

function parseSilenceWindows(stderr: string, durationSec: number): ClipTimeWindow[] {
  const windows: ClipTimeWindow[] = [];
  let openStart: number | null = null;

  // Scanned as one ordered event stream rather than as two independent lists,
  // because starts and ends interleave with progress output and a start with
  // no matching end (silence running to the end of the clip) is normal.
  for (const match of stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (match[1] === 'start') {
      openStart = value;
    } else if (openStart !== null) {
      windows.push({ startSec: openStart, endSec: value });
      openStart = null;
    }
  }
  if (openStart !== null) {
    windows.push({ startSec: openStart, endSec: durationSec });
  }

  return mergeWindows(
    windows
      .map((window) => ({
        startSec: clamp(window.startSec, 0, durationSec),
        endSec: clamp(window.endSec, 0, durationSec),
      }))
      .filter((window) => window.endSec > window.startSec)
      .sort((a, b) => a.startSec - b.startSec),
  );
}

/** The gaps between the silences — where there is sound. */
function complementWindows(silences: ClipTimeWindow[], durationSec: number): ClipTimeWindow[] {
  const windows: ClipTimeWindow[] = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.startSec > cursor) {
      windows.push({ startSec: cursor, endSec: silence.startSec });
    }
    cursor = Math.max(cursor, silence.endSec);
  }
  if (cursor < durationSec) {
    windows.push({ startSec: cursor, endSec: durationSec });
  }
  return windows.filter((window) => window.endSec - window.startSec > WINDOW_MERGE_EPSILON_SEC);
}

/** Decides how much the windows are worth. See `ClipSoundSegmentation` for why this is a union. */
function classifySegmentation(
  hasAudio: boolean,
  silences: ClipTimeWindow[],
  windows: ClipTimeWindow[],
  durationSec: number,
): ClipSoundSegmentation {
  if (!hasAudio) {
    return { kind: 'none', reason: 'no-audio-stream' };
  }
  if (windows.length === 0) {
    return { kind: 'none', reason: 'continuous-sound' };
  }

  const coversWholeClip =
    windows.length === 1 &&
    durationSec > 0 &&
    (windows[0].endSec - windows[0].startSec) / durationSec >= WHOLE_CLIP_COVERAGE_RATIO;
  if (coversWholeClip) {
    return { kind: 'none', reason: 'continuous-sound' };
  }

  const totalSilence = silences.reduce((sum, window) => sum + (window.endSec - window.startSec), 0);
  const doubt = ((): ClipSegmentationDoubt | null => {
    if (durationSec > 0 && totalSilence / durationSec < MIN_TRUSTWORTHY_SILENCE_RATIO) {
      return 'almost-no-silence';
    }
    if (durationSec > 0 && windows.length / durationSec > MAX_TRUSTWORTHY_WINDOWS_PER_SEC) {
      return 'too-fragmented';
    }
    if (windows.every((window) => window.endSec - window.startSec < MIN_PLAUSIBLE_SPEECH_SEC)) {
      return 'all-windows-short';
    }
    return null;
  })();

  return doubt ? { kind: 'uncertain', windows, reason: doubt } : { kind: 'candidate', windows };
}

export function parseProbeOutput(stderr: string, options: Partial<ClipProbeOptions> = {}): ClipProbe {
  const section = inputSection(stderr);
  const durationSec = parseDurationSec(section);

  const videoLine = firstStreamLine(section, 'Video');
  const audioLine = firstStreamLine(section, 'Audio');

  const resolution = videoLine ? /[,\s](\d{2,5})x(\d{2,5})(?=[\s,\]]|$)/.exec(videoLine) : null;
  const fps = videoLine ? /,\s*([\d.]+)\s+fps\b/.exec(videoLine) : null;
  const sampleRate = audioLine ? /,\s*(\d+)\s*Hz\b/.exec(audioLine) : null;

  // No audio stream at all is a clean, expected state rather than a failure:
  // `-af silencedetect` is silently ignored when there is nothing to filter
  // (verified — ffmpeg exits 0 and simply emits no events).
  const hasAudio = audioLine !== null;
  const silences = parseSilenceWindows(stderr, durationSec);
  const windows = complementWindows(silences, durationSec);

  return {
    durationSec,
    decodedSec: parseDecodedSec(stderr),
    width: resolution ? Number(resolution[1]) : null,
    height: resolution ? Number(resolution[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    hasAudio,
    audioSampleRate: sampleRate ? Number(sampleRate[1]) : null,
    silences,
    segmentation: classifySegmentation(hasAudio, silences, windows, durationSec),
    noiseDb: clamp(options.noiseDb ?? DEFAULT_NOISE_DB, -90, 0),
    minSilenceSec: clamp(options.minSilenceSec ?? DEFAULT_MIN_SILENCE_SEC, 0.01, 60),
  };
}

/** Pulls stderr off whatever `execFileAsync` rejected with, if it carried any. */
function stderrFromError(err: unknown): string {
  const candidate = (err as { stderr?: unknown } | null)?.stderr;
  return typeof candidate === 'string' ? candidate : '';
}

/**
 * Fast container and stream header probe.
 * Does not decode any audio or video frames.
 * Returns container duration, resolution, fps, and audio details in ~50-80ms.
 */
export async function fastProbeClip(
  inputPath: string,
  ffmpegPath: string,
): Promise<{
  durationSec: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  audioSampleRate: number | null;
}> {
  let stderr = '';
  try {
    await execFileAsync(ffmpegPath, ['-hide_banner', '-nostdin', '-i', inputPath], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 8000,
    });
  } catch (err) {
    stderr = stderrFromError(err);
  }

  const section = inputSection(stderr);
  const durationSec = parseDurationSec(section);
  const videoLine = firstStreamLine(section, 'Video');
  const audioLine = firstStreamLine(section, 'Audio');

  const resolution = videoLine ? /[,\s](\d{2,5})x(\d{2,5})(?=[\s,\]]|$)/.exec(videoLine) : null;
  const fps = videoLine ? /,\s*([\d.]+)\s+fps\b/.exec(videoLine) : null;
  const sampleRate = audioLine ? /,\s*(\d+)\s*Hz\b/.exec(audioLine) : null;

  return {
    durationSec,
    width: resolution ? Number(resolution[1]) : null,
    height: resolution ? Number(resolution[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    hasAudio: audioLine !== null,
    audioSampleRate: sampleRate ? Number(sampleRate[1]) : null,
  };
}

export async function probeClip(
  inputPath: string,
  ffmpegPath: string,
  options: Partial<ClipProbeOptions> = {},
): Promise<ClipProbe> {
  // 1. Fast header probe first — answers container duration and geometry in <80ms without decoding.
  const fast = await fastProbeClip(inputPath, ffmpegPath);

  if (fast.durationSec > 0 || (!fast.hasAudio && (fast.width ?? 0) > 0 && (fast.height ?? 0) > 0)) {
    return {
      durationSec: fast.durationSec,
      decodedSec: fast.durationSec,
      width: fast.width,
      height: fast.height,
      fps: fast.fps,
      hasAudio: fast.hasAudio,
      audioSampleRate: fast.audioSampleRate,
      silences: [],
      segmentation: { kind: 'none', reason: 'continuous-sound' },
      noiseDb: clamp(options.noiseDb ?? DEFAULT_NOISE_DB, -90, 0),
      minSilenceSec: clamp(options.minSilenceSec ?? DEFAULT_MIN_SILENCE_SEC, 0.01, 60),
    };
  }

  // 2. Fallback: only if container duration was missing (e.g. unindexed audio stream),
  // decode stream with a strict timeout so the process never hangs indefinitely.
  const basicArgs = buildBasicProbeArgs(inputPath);
  let stderr = '';
  try {
    ({ stderr } = await execFileAsync(ffmpegPath, basicArgs, {
      maxBuffer: PROBE_MAX_BUFFER,
      timeout: 15000,
    }));
  } catch (err) {
    stderr = stderrFromError(err);
  }

  let probe = stderr ? parseProbeOutput(stderr, options) : null;
  if (probe && (!Number.isFinite(probe.durationSec) || probe.durationSec <= 0)) {
    if (probe.decodedSec && Number.isFinite(probe.decodedSec) && probe.decodedSec > 0) {
      probe = { ...probe, durationSec: probe.decodedSec };
    }
  }

  if (!probe || !Number.isFinite(probe.durationSec) || probe.durationSec <= 0) {
    // Beta S245 — a still image is untimed media, not broken media.
    if (probe && !probe.hasAudio && (probe.width ?? 0) > 0 && (probe.height ?? 0) > 0) {
      return { ...probe, durationSec: 0 };
    }
    throw new Error(`Could not read a duration from "${inputPath}" — the file is not usable media.`);
  }
  return probe;
}
