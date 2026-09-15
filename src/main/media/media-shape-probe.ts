import { execFile } from 'node:child_process';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

/**
 * Beta S349 — the geometry and length of a media file, from one ffmpeg call.
 *
 * `probeFrameSize` (S243, `watermark-frame-io.ts`) already reads the stream
 * table out of `ffmpeg -i`'s stderr and returns the picture size. The same
 * stderr carries `Duration: HH:MM:SS.ss` two lines above it, so the length
 * costs nothing extra — and it is the half that identifies a *clip*, where the
 * size alone cannot: two different 8-second renders of the same project share a
 * resolution and share almost nothing else.
 *
 * A separate module rather than a second return field on `probeFrameSize`,
 * because that function has three callers in the watermark pipeline that want a
 * size and would now have to ignore a duration, and because this one is allowed
 * to answer `undefined` for a still (no `Duration:` line, or `N/A`) where that
 * one throws.
 *
 * `ffprobe` is deliberately not used, and cannot be: `ffmpeg-static` ships a
 * single `ffmpeg` binary and `forge.config.ts` copies that one package as an
 * `extraResource`. Same constraint `clip-probe.ts` documents at length.
 *
 * No decode. `ffmpeg -i` with no output target prints the container's header
 * and exits non-zero — which is the whole call. `clip-probe.ts`'s `-f null -`
 * pass decodes every frame because it also wants `silencedetect`; this wants
 * neither, and an upgrade run measured in hours cannot afford a decode per item
 * it is only using to answer "is this the same clip".
 */
export interface MediaShape {
  width: number;
  height: number;
  /** Absent for a still, and for a container ffmpeg reports as `N/A`. */
  durationSec?: number;
}

/** ffmpeg's header dump; well above anything a header produces, far below a runaway. */
const PROBE_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Pure, so the parsing is testable against captured stderr with no binary —
 * the convention `clip-probe.ts` and `video-editor.ts` both follow.
 */
export function parseMediaShape(stderr: string): MediaShape | null {
  // The first video stream's resolution. `\b` on both sides so a bitrate or a
  // SAR/DAR pair cannot be mistaken for one — `probeFrameSize`'s pattern,
  // verbatim, because it is the same table.
  const size = /Stream #\d+:\d+[^\n]*: Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  if (!size) return null;

  // `N/A` is a real answer ffmpeg gives for some containers, and it must read
  // as "no duration" rather than as zero — a zero would make every clip
  // comparison fail closed against a file that is probably fine.
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationSec = duration
    ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
    : undefined;

  return {
    width: Number(size[1]),
    height: Number(size[2]),
    durationSec: durationSec !== undefined && durationSec > 0 ? durationSec : undefined,
  };
}

/** Throws only when ffmpeg printed nothing recognisable — a caller that cannot measure must decide what that means. */
export async function probeMediaShape(ffmpegPath: string, inputPath: string): Promise<MediaShape> {
  let stderr = '';
  try {
    // Exits non-zero with no output target; the stream table it prints on the
    // way out is what we came for.
    await execFileAsync(ffmpegPath, ['-hide_banner', '-nostdin', '-i', inputPath], {
      maxBuffer: PROBE_MAX_BUFFER,
    });
  } catch (error) {
    const captured = (error as { stderr?: string | Buffer } | null)?.stderr;
    stderr = typeof captured === 'string' ? captured : (captured?.toString('utf8') ?? '');
  }
  const shape = parseMediaShape(stderr);
  if (!shape) {
    throw new Error(`Could not read the media shape from "${inputPath}".`);
  }
  return shape;
}

/**
 * Beta S349 — how far two clip lengths may differ and still be the same clip.
 *
 * An upscale is a re-encode of the same timeline, so in principle the durations
 * are equal — but container rounding and a re-encode's frame-boundary snapping
 * move the reported number by a frame or two, and Flow's 8-second clips have
 * been observed reporting 8.0 and 8.03 for the same generation. A quarter of a
 * second is comfortably above that and far below the gap between any two
 * different takes the app can produce (its shortest configured clip is 4s).
 */
export const DURATION_MATCH_TOLERANCE_SEC = 0.25;

/**
 * How far two aspect ratios may differ and still be the same framing.
 *
 * Ratios are compared, not dimensions, because that is the invariant an upscale
 * actually preserves: 1280×720 → 3840×2160 changes both numbers and neither
 * ratio. The tolerance absorbs an odd-pixel rounding at small sizes (a 1-pixel
 * error on a 720p height is 0.0014) without admitting 16:9 against 4:3.
 */
export const RATIO_MATCH_TOLERANCE = 0.02;

/** Why a received upgrade is not the file that was asked for. `null` when it is. */
export function describeShapeMismatch(original: MediaShape, received: MediaShape): string | null {
  const originalRatio = original.width / original.height;
  const receivedRatio = received.width / received.height;
  if (Math.abs(originalRatio - receivedRatio) > RATIO_MATCH_TOLERANCE) {
    return `the file that arrived is ${received.width}×${received.height}, a different shape from this take's ${original.width}×${original.height}`;
  }
  // An upscale never returns fewer pixels. A *smaller* file under an upgrade
  // request is the clearest possible statement that it is a different asset —
  // and it is the one direction a legitimate tier fallback cannot produce,
  // since `resolveQualityForTier` falls back to the tier already on disk, not
  // below it.
  if (received.width < original.width || received.height < original.height) {
    return `the file that arrived is ${received.width}×${received.height}, smaller than this take's own ${original.width}×${original.height}`;
  }
  // Both sides must have a length for the comparison to mean anything: a still
  // has none, and a container ffmpeg would not commit on reports none either.
  if (
    original.durationSec !== undefined &&
    received.durationSec !== undefined &&
    Math.abs(original.durationSec - received.durationSec) > DURATION_MATCH_TOLERANCE_SEC
  ) {
    return `the clip that arrived is ${received.durationSec.toFixed(2)}s where this take is ${original.durationSec.toFixed(2)}s`;
  }
  return null;
}
