import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * Beta S182 — filmstrip sprite sheets for the timeline's video lanes.
 *
 * Module convention, same as `still-motion.ts` and `text-segment.ts`: a pure
 * `build*Args` returning the exact argument list, every numeric clamped before
 * it reaches a filter-graph string, and the `async` work left to the caller.
 * That is what makes the graph unit-testable without ffmpeg.
 *
 * ## Why a sprite sheet rather than N files
 *
 * A minute of video at the stride below is forty-odd thumbnails. As loose
 * files that is forty writes, forty `media://` round trips and forty decodes
 * for one lane; as one tiled JPEG it is one of each. Web-based editors
 * converged on this for the same reason, and it composes with the existing
 * `media://` protocol without adding a request per frame.
 *
 * ## Why one interval rather than one-tile-per-clip-pixel
 *
 * The sheet describes the **file**, not the clip: two clips trimmed out of one
 * source share it, a trim changes which tiles are shown rather than
 * invalidating anything, and zoom changes how many of them are drawn. Only a
 * re-encode invalidates the sheet — which is exactly what the size+mtime cache
 * key detects.
 */

/** Rasterised height of one tile. Fixed so the cache key stays small and sheets are shareable. */
export const FILMSTRIP_TILE_HEIGHT = 72;

/**
 * Seconds between sampled frames.
 *
 * Two seconds is the compromise the survey pointed at: fine enough that a
 * clip's content reads at ordinary zoom, coarse enough that a ten-minute
 * source is 300 tiles rather than 3000. A clip shorter than one interval still
 * gets its first frame, which is the poster.
 */
export const FILMSTRIP_INTERVAL_SECONDS = 2;

/**
 * Ceiling on tiles per sheet.
 *
 * A JPEG has a hard 65535px dimension limit, and a single enormous sheet is
 * also a single enormous decode in the renderer. At 16 columns this caps a
 * sheet at 256 tiles — about 8.5 minutes of source at the default interval —
 * after which the interval is stretched to fit rather than the sheet growing.
 * Stretching degrades the strip's time resolution, which is invisible, instead
 * of failing the extraction, which is not.
 */
export const FILMSTRIP_MAX_TILES = 256;
export const FILMSTRIP_COLUMNS = 16;

export interface FilmstripGeometry {
  /** Frames actually sampled — `columns * rows` may exceed this on the last row. */
  frameCount: number;
  columns: number;
  rows: number;
  /** Seconds between sampled frames, after the max-tile stretch. */
  intervalSec: number;
}

/**
 * How many tiles to take from a source of this length, and how to arrange them.
 *
 * Pure, and exported for tests: the stretch branch is the one that only
 * triggers on long sources, which is precisely the case nobody exercises by
 * hand.
 */
export function planFilmstrip(durationSec: number): FilmstripGeometry {
  // A source with no measurable length still gets one frame — the poster is
  // what makes a clip identifiable, and it is the half of this feature that
  // must never depend on a successful duration probe.
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const wanted = Math.max(1, Math.ceil(safeDuration / FILMSTRIP_INTERVAL_SECONDS));
  const frameCount = Math.min(wanted, FILMSTRIP_MAX_TILES);
  // Stretched, not truncated: a capped sheet must still span the whole clip,
  // or the tail of a long source would draw the head's frames.
  const intervalSec =
    frameCount >= wanted || safeDuration === 0
      ? FILMSTRIP_INTERVAL_SECONDS
      : safeDuration / frameCount;
  const columns = Math.min(FILMSTRIP_COLUMNS, frameCount);
  const rows = Math.ceil(frameCount / columns);
  return { frameCount, columns, rows, intervalSec };
}

/**
 * Tile width for a source of this shape, at the fixed tile height.
 *
 * Even, because JPEG's 4:2:0 chroma subsampling wants even dimensions and an
 * odd request is either refused or silently rounded — after which the
 * renderer's column arithmetic drifts across the row. 16:9 falls out as 128 at
 * the 72px default, which is the common case.
 *
 * Falls back to 16:9 when the probe could not report geometry: a plausible
 * strip beats no strip, and the tiles are square-ish enough that a wrong
 * aspect reads as cropping rather than as breakage.
 */
export function tileWidthFor(
  sourceWidth: number | null,
  sourceHeight: number | null,
  tileHeight: number = FILMSTRIP_TILE_HEIGHT,
): number {
  const aspect =
    sourceWidth && sourceHeight && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
  const raw = Math.round(tileHeight * aspect);
  const clamped = Math.max(16, Math.min(640, raw));
  return clamped - (clamped % 2);
}

/**
 * Where a sheet lives.
 *
 * **Inside the managed outputs root, deliberately.** `media://` serves
 * anything under `userData/projects` with no allowlist entry; a sibling
 * directory would need its own data-derived hinge, which is the trap migration
 * 047's `flow_thumbnail_cache_path` and Beta S180's `sequence_media` both
 * exist to work around. Writing the cache where the grant already reaches
 * means this feature adds no grant at all.
 *
 * The name is a hash of the identity the cache is keyed on, so a re-encoded
 * source lands on a different file rather than overwriting one a renderer may
 * still be painting from.
 */
export function filmstripSheetPath(
  managedRoot: string,
  identity: { sourcePath: string; fileSizeBytes: number; mtimeMs: number; tileHeight: number },
): string {
  const digest = createHash('sha1')
    .update(
      `${identity.sourcePath}:${identity.fileSizeBytes}:${identity.mtimeMs}:${identity.tileHeight}`,
    )
    .digest('hex')
    .slice(0, 16);
  return path.join(managedRoot, '_filmstrips', `${digest}.jpg`);
}

/**
 * One ffmpeg pass: sample, scale, tile, write a single JPEG.
 *
 * `fps=1/interval` before `scale` on purpose — scaling every decoded frame and
 * then throwing 59 of every 60 away is the same picture for many times the
 * CPU. `-frames:v 1` is what makes `tile` emit the one packed sheet rather
 * than a sheet per full tile grid.
 *
 * The tile width is passed in and written **explicitly** rather than left to
 * `scale=-2:H`. The renderer slices the sheet by arithmetic — column times
 * tile width — without decoding it, so it has to know that width exactly
 * beforehand. Letting ffmpeg pick means either probing the finished sheet or
 * trusting a rounding rule, and a width off by one puts every tile in a row
 * progressively out of register. `tileWidthFor` supplies it from the source's
 * own geometry, already made even for JPEG's chroma subsampling.
 */
export function buildFilmstripArgs(
  inputPath: string,
  outputPath: string,
  geometry: FilmstripGeometry,
  tileWidth: number,
  tileHeight: number = FILMSTRIP_TILE_HEIGHT,
): string[] {
  const height = Math.max(16, Math.min(240, Math.round(tileHeight)));
  const width = Math.max(16, Math.min(640, tileWidth - (tileWidth % 2)));
  const interval = Math.max(0.05, geometry.intervalSec);
  return [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `fps=1/${interval.toFixed(4)},scale=${width}:${height},tile=${geometry.columns}x${geometry.rows}`,
    '-frames:v',
    '1',
    // Quality 4 is visually clean at 72px and roughly a third the bytes of 2.
    // A filmstrip is a navigation aid, not a proof.
    '-q:v',
    '4',
    outputPath,
  ];
}
