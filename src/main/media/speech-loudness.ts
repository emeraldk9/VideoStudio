import { execFile } from 'node:child_process';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

/**
 * Beta S182 — the one definition of how finished speech is levelled.
 *
 * Both graph builders sum their speech into an `amix` and then hand the result
 * here: `audio-layout.ts` (speech over video) and `audio-timeline.ts` (speech
 * with no clip underneath, plus its bed-mix second pass). One module rather
 * than a chain restated in each, because the two graphs already share the
 * `normalize=0` / `adelay=…:all=1` traps and this is a third of the same kind —
 * a fact about ffmpeg that fails silently and identically in both places.
 *
 * ## Why this exists at all
 *
 * The module had no gain staging anywhere between the model and the file.
 * Measured across every take the app had produced (nine files, three job types,
 * two projects):
 *
 * - Engine take: **−23.2 LUFS**, true peak −5.5 dBFS.
 * - Rendered master: −18.5 LUFS, true peak −8.6 dBFS.
 *
 * That is ~7 dB below the spoken-word delivery standard — roughly half the
 * perceived loudness — with 5.5 dB of headroom left unused. Reported as "very
 * low volume", and it was exactly that.
 *
 * **Every take peaked at exactly −6.0 dBFS.** OmniVoice peak-normalizes its own
 * output to 0.5, so a take's level carries no information about how it was
 * meant to sound; re-gaining destroys nothing. That is what makes normalizing
 * here a correction rather than a creative decision.
 */

/**
 * The delivery target.
 *
 * −16 LUFS / −1.5 dBTP is the spoken-word streaming standard (AES streaming
 * recommendation; the podcast norm). −23 LUFS is EBU R128 *broadcast* and would
 * be quieter than what the app already ships; −14 is Spotify/YouTube and leaves
 * less peak room than speech with a 16–20 dB crest factor wants.
 *
 * `LRA` is a ceiling, not a goal: `loudnorm` only compresses range when the
 * measured range exceeds it, and 11 LU is wide enough that ordinary narration
 * passes through untouched.
 */
export const SPEECH_LOUDNESS = Object.freeze({
  integratedLufs: -16,
  truePeakDb: -1.5,
  loudnessRangeLu: 11,
});

/**
 * The limiter's ceiling as linear gain — the same −1.5 dBTP, enforced again
 * *after* the resample back down from `loudnorm`'s internal 192 kHz.
 *
 * A safety net rather than the mechanism: `loudnorm` already lands the true
 * peak on target. It is here because `amix` runs with `normalize=0` (it sums
 * rather than averages, which is what stops three lines over a bed arriving at
 * a third of their level), so overlapping lines can still exceed full scale
 * before anything measures them.
 */
const LIMITER_CEILING = 10 ** (SPEECH_LOUDNESS.truePeakDb / 20);

/**
 * What pass 1 measured, verbatim from `loudnorm`'s own JSON.
 *
 * Carried as strings rather than numbers on purpose: these values are echoed
 * straight back into pass 2's `measured_*` arguments, and re-formatting a
 * float through `Number` risks handing the filter a value that differs in the
 * last place from the one it produced.
 */
export interface LoudnessMeasurement {
  inputI: string;
  inputTp: string;
  inputLra: string;
  inputThresh: string;
  targetOffset: string;
}

/**
 * How the bus is configured for one ffmpeg invocation.
 *
 * - `measure` — pass 1. Ends at `loudnorm … print_format=json`; the caller
 *   throws the audio away (`-f null -`) and keeps the report.
 * - `apply` — pass 2. The same prefix, then `loudnorm` in linear mode against
 *   what pass 1 measured, back down to the target rate, then the limiter.
 * - `off` — no loudness stage. Used for the bed-mix intermediates, which are
 *   summed again afterwards: normalizing a bed and then adding it to another
 *   bed would target a loudness the final file does not have.
 */
export type SpeechBusMode =
  | { kind: 'measure' }
  | { kind: 'apply'; measured: LoudnessMeasurement }
  | { kind: 'off' };

/**
 * The post-`amix` chain, as a filter string with no leading comma.
 *
 * Order is load-bearing throughout:
 *
 * 1. `highpass=f=80` — rumble and DC out before anything measures or
 *    compresses. Speech has nothing below 80 Hz; what is down there is offset
 *    and room, and both eat headroom that the limiter would otherwise spend.
 * 2. `acompressor` — a gentle 3:1 over the 16–20 dB crest factor unprocessed
 *    speech carries. Without it, reaching −16 LUFS means peaks at full scale;
 *    with it, the same integrated loudness sits 1.5 dB below the ceiling.
 * 3. `loudnorm` — the loudness stage. See {@link SpeechBusMode}.
 * 4. `aresample` — **not optional.** `loudnorm` upsamples internally and emits
 *    at 192 kHz regardless of its input rate. Measured, because nothing at the
 *    call site says so: without this every master is a 192 kHz file at four
 *    times the size, and the dub mux carries 192 kHz audio into an mp4.
 * 5. `alimiter` — the ceiling, at the final rate so it is enforced on the
 *    samples that are actually written.
 *
 * `latency=true` on the limiter is the other measured one. The default is
 * `false`, which does *not* compensate its 5 ms lookahead: with a click track,
 * the whole speech bus came out **4.98 ms late**. That is under
 * `MASTER_DRIFT_TOLERANCE_SEC` (150 ms), which is precisely why it survived —
 * every dub the app has ever produced sits ~5 ms behind its own offsets.
 *
 * `level=false` for a related reason: alimiter's auto-level defaults to *true*
 * and rescales the output by `1/limit`, which would silently undo the target
 * `loudnorm` had just hit.
 */
export function buildSpeechBusChain(sampleRate: number, mode: SpeechBusMode): string {
  const limiter = `alimiter=limit=${LIMITER_CEILING.toFixed(3)}:level=false:latency=true`;

  if (mode.kind === 'off') {
    return limiter;
  }

  const conditioning =
    'highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120:makeup=2';
  const target =
    `loudnorm=I=${SPEECH_LOUDNESS.integratedLufs}:TP=${SPEECH_LOUDNESS.truePeakDb}` +
    `:LRA=${SPEECH_LOUDNESS.loudnessRangeLu}`;

  if (mode.kind === 'measure') {
    // No limiter and no resample: this pass exists only to be read, and adding
    // stages after the measurement point would report a level the second pass
    // is not going to start from.
    return `${conditioning},${target}:print_format=json`;
  }

  const { measured } = mode;
  return (
    `${conditioning},${target}:linear=true` +
    `:measured_I=${measured.inputI}` +
    `:measured_TP=${measured.inputTp}` +
    `:measured_LRA=${measured.inputLra}` +
    `:measured_thresh=${measured.inputThresh}` +
    `:offset=${measured.targetOffset}` +
    `,aresample=${sampleRate},${limiter}`
  );
}

/**
 * Pulls `loudnorm`'s report out of an ffmpeg run's stderr.
 *
 * The filter prints a JSON object after everything else it logs, so the parse
 * starts at the **last** `{` — an earlier brace from a filter-graph error
 * message would otherwise win. Returns `null` rather than throwing: a missing
 * report means the caller renders un-normalized, which is today's behaviour and
 * a far better failure than refusing to produce a file at all.
 */
export function parseLoudnessMeasurement(stderr: string): LoudnessMeasurement | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stderr.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const read = (key: string): string | null => {
      const value = record[key];
      // `loudnorm` reports every field as a string, and reports `-inf` for
      // silence. A non-finite measurement cannot drive a linear correction, so
      // it is treated as no measurement at all.
      if (typeof value !== 'string' || !Number.isFinite(Number(value))) {
        return null;
      }
      return value;
    };

    const inputI = read('input_i');
    const inputTp = read('input_tp');
    const inputLra = read('input_lra');
    const inputThresh = read('input_thresh');
    const targetOffset = read('target_offset');
    if (!inputI || !inputTp || !inputLra || !inputThresh || !targetOffset) {
      return null;
    }
    return { inputI, inputTp, inputLra, inputThresh, targetOffset };
  } catch {
    return null;
  }
}

/**
 * Runs pass 1 and returns what it measured, or `null` if it could not.
 *
 * Never throws. A failed measurement pass is not a failed render — the caller
 * falls back to `off`, which is exactly the graph that shipped before this
 * step. Making a loudness *improvement* able to fail a render would trade a
 * real deliverable for a cosmetic one.
 */
export async function measureLoudness(
  ffmpegPath: string,
  measureArgs: readonly string[],
): Promise<LoudnessMeasurement | null> {
  try {
    // ffmpeg writes filter reports to stderr, including this one. The output
    // is a few KB; the default `maxBuffer` is not a concern here.
    const { stderr } = await execFileAsync(ffmpegPath, [...measureArgs]);
    return parseLoudnessMeasurement(stderr);
  } catch {
    return null;
  }
}
