import { useEffect, useRef, useState } from 'react';

import { framesToSeconds, type FilmstripSheet, type PlacedClip } from '@shared';

export interface FilmstripCanvasProps {
  /** The lane's video clips, already laid out. */
  placed: PlacedClip[];
  fps: number;
  pixelsPerSecond: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Beta S182 — thumbnails on a video lane, as **one canvas per lane**.
 *
 * The sibling of `WaveformCanvas`, and deliberately built to its shape: one
 * backing store however many clips the lane holds, one redraw pass on zoom
 * instead of N, pointer-events off so every gesture lands on the clip beneath.
 * That decision is S145 §4.4's, re-learned in S151 (H3) after the inverse
 * shipped, and the reason it applies here too is the owner's own 287-item
 * media grid: N `<img>` elements per clip is the same unbounded-node failure
 * in a different costume.
 *
 * Before this the lane painted a video clip as a blank tone rectangle, while
 * `TimelineClip`'s docblock had promised "a still shows its image, **a video
 * its poster frame**, audio its waveform" since S145, and S170 had already
 * raised video lanes to 64px to carry thumbnails that did not exist.
 *
 * ## Density follows lane height
 *
 * The survey's three modes, mapped onto heights the app already has:
 *
 * - **Chip lanes** (28px, text/overlay) — nothing. A strip in a lane that
 *   short is a smear, and those lanes hold no media anyway.
 * - **Standard video lanes** (64px) — **head and tail**, which is Premiere's
 *   default: the two frames that answer "what is this clip and where does it
 *   end" without pretending to be a scrub.
 * - **Tall lanes** (>= 96px, a hand-resized lane) — the continuous strip, as
 *   Resolve and CapCut draw it.
 *
 * ## Why the sheet is not re-fetched on zoom
 *
 * A sheet describes the *file*: fixed tile size, fixed sampling interval. Zoom
 * changes only how many of its tiles are drawn and how wide each is painted,
 * which is arithmetic on data already in hand — so a zoom gesture never waits
 * on ffmpeg, and a trim invalidates nothing.
 */

/** Below this a strip is a smear; those lanes carry chips, not media. */
const MIN_STRIP_HEIGHT = 40;
/** At or above this the lane is tall enough for a continuous strip to read. */
const CONTINUOUS_STRIP_HEIGHT = 96;

export function FilmstripCanvas({
  placed,
  fps,
  pixelsPerSecond,
  widthPx,
  heightPx,
}: FilmstripCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Sheets by source path — clips sharing a file (a split shot) share one fetch. */
  const [sheets, setSheets] = useState<Record<string, FilmstripSheet | null>>({});
  /** Decoded images, kept out of state: a canvas draw needs the bitmap, not a re-render. */
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  /** Bumped when an image finishes decoding, purely to re-run the draw effect. */
  const [decodedVersion, setDecodedVersion] = useState(0);

  const paths = [
    ...new Set(
      placed
        .filter((item) => item.clip.sourceKind === 'video')
        .map((item) => item.clip.filePath)
        .filter((filePath): filePath is string => filePath !== null),
    ),
  ];
  const pathsKey = paths.join('\n');

  // The `WaveformCanvas` key, for the same reason recorded there (S173): the
  // draw effect must not re-run on `placed`'s array identity, or every
  // pointermove of a drag resets the backing store and repaints every lane.
  const layoutKey = placed
    .map((item) => `${item.clip.id}:${item.startFrames}:${item.clip.durationFrames}:${item.clip.sourceInFrames ?? 0}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    for (const sourcePath of pathsKey ? pathsKey.split('\n') : []) {
      if (sourcePath in sheets) continue;
      void window.api.sequence
        .getFilmstrip(sourcePath)
        .then((sheet) => {
          if (cancelled) return;
          setSheets((current) => ({ ...current, [sourcePath]: sheet }));
          if (!sheet) return;
          // Decoded once per sheet and held in a ref. `img.decode()` is not
          // used: it rejects on some JPEGs Chromium will still happily draw,
          // and a strip that silently vanishes is worse than one that paints a
          // frame late.
          const image = new Image();
          image.src = sheet.url;
          image.onload = () => {
            if (cancelled) return;
            imagesRef.current[sourcePath] = image;
            setDecodedVersion((version) => version + 1);
          };
        })
        .catch(() => {
          // A source ffmpeg could not read. The clip renders as a plain block,
          // which is honest — an invented thumbnail would be worse than none.
          if (!cancelled) setSheets((current) => ({ ...current, [sourcePath]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
    // `sheets` is deliberately absent: the effect *writes* it, and the `in`
    // guard is what makes each path fetch exactly once. `WaveformCanvas`'s
    // rule, for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || widthPx <= 0 || heightPx <= 0) return;

    // Backing store at device resolution, CSS box at layout resolution —
    // without this every thumbnail is soft on a HiDPI display.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(widthPx * ratio));
    canvas.height = Math.max(1, Math.round(heightPx * ratio));

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, widthPx, heightPx);
    if (heightPx < MIN_STRIP_HEIGHT) return;

    const continuous = heightPx >= CONTINUOUS_STRIP_HEIGHT;
    const pixelsPerFrame = pixelsPerSecond / fps;

    for (const item of placed) {
      if (item.clip.sourceKind !== 'video' || !item.clip.filePath) continue;
      const sheet = sheets[item.clip.filePath];
      const image = imagesRef.current[item.clip.filePath];
      if (!sheet || !image) continue;

      const left = item.startFrames * pixelsPerFrame;
      const clipWidth = item.clip.durationFrames * pixelsPerFrame;
      if (clipWidth < 2) continue;

      // Tiles are drawn at the lane's height, keeping the source's aspect —
      // a stretched thumbnail misreads the shot's framing, which is the one
      // thing a filmstrip exists to communicate.
      const drawWidth = Math.max(1, (sheet.tileWidth / sheet.tileHeight) * heightPx);
      const sourceInSeconds = framesToSeconds(item.clip.sourceInFrames ?? 0, fps);

      /** Paints the tile covering `atSeconds` of source into `x`, clipped to the clip's box. */
      const drawTileAt = (atSeconds: number, x: number, boxWidth: number): void => {
        const index = Math.max(
          0,
          Math.min(sheet.frameCount - 1, Math.floor(atSeconds / sheet.intervalSec)),
        );
        const column = index % sheet.columns;
        const row = Math.floor(index / sheet.columns);
        context.save();
        context.beginPath();
        context.rect(x, 0, boxWidth, heightPx);
        context.clip();
        context.drawImage(
          image,
          column * sheet.tileWidth,
          row * sheet.tileHeight,
          sheet.tileWidth,
          sheet.tileHeight,
          x,
          0,
          drawWidth,
          heightPx,
        );
        context.restore();
      };

      if (!continuous) {
        // Head and tail — Premiere's default. The tail is skipped when the
        // clip is too narrow to show two without them overlapping, which
        // would read as a glitch rather than as information.
        drawTileAt(sourceInSeconds, left, Math.min(drawWidth, clipWidth));
        const tailFits = clipWidth >= drawWidth * 2;
        if (tailFits) {
          const endSeconds =
            sourceInSeconds + framesToSeconds(Math.max(0, item.clip.durationFrames - 1), fps);
          drawTileAt(endSeconds, left + clipWidth - drawWidth, drawWidth);
        }
        continue;
      }

      // Continuous: tile across the clip's width, each showing the source
      // moment it actually sits over — so a trimmed clip shows its own range,
      // not the file's head.
      for (let x = 0; x < clipWidth; x += drawWidth) {
        const intoClipSeconds = (x / pixelsPerFrame) / fps;
        drawTileAt(sourceInSeconds + intoClipSeconds, left + x, Math.min(drawWidth, clipWidth - x));
      }
    }
    // `placed` is read but keyed by `layoutKey` — `WaveformCanvas`'s comment
    // applies verbatim; the suppression is the point, not an oversight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, sheets, decodedVersion, widthPx, heightPx, pixelsPerSecond, fps]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // z-0: below the waveform's z-[1] and the clips' own z-10 chrome, so a
      // label, selection rule or trim handle always wins over a thumbnail.
      className="pointer-events-none absolute inset-0 z-0"
      style={{ width: widthPx, height: heightPx }}
    />
  );
}
