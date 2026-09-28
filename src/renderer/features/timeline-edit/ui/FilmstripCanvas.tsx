import { useEffect, useRef, useState } from 'react';

import {
  calculateVirtualizedViewport,
  filmstripSheetLRUCache,
  framesToSeconds,
  isClipInViewportWindow,
  type FilmstripSheet,
  type PlacedClip,
} from '@shared';

import { useTimelineViewportStore } from '../model/timelineViewportStore';

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
 * S175 — **Timeline Viewport Virtualization & Tile Culling**:
 * Clamps canvas backing-store memory under 3,840px across long sequences.
 * Culls off-screen video clips in O(1) and breaks continuous tile rendering loops
 * once past the visible scroll window, eliminating redundant drawImage calls.
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
  const [sheets, setSheets] = useState<Record<string, FilmstripSheet | null>>(() => {
    const initial: Record<string, FilmstripSheet | null> = {};
    for (const item of placed) {
      if (item.clip.filePath && filmstripSheetLRUCache.has(item.clip.filePath)) {
        initial[item.clip.filePath] = filmstripSheetLRUCache.get(item.clip.filePath)!;
      }
    }
    return initial;
  });
  /** Decoded images, kept out of state: a canvas draw needs the bitmap, not a re-render. */
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  /** Bumped when an image finishes decoding, purely to re-run the draw effect. */
  const [decodedVersion, setDecodedVersion] = useState(0);

  // S175 — Viewport horizontal scroll window subscription
  const scrollLeft = useTimelineViewportStore((s) => s.scrollLeft);
  const viewportWidth = useTimelineViewportStore((s) => s.viewportWidth);

  const paths = [
    ...new Set(
      placed
        .filter((item) => item.clip.sourceKind === 'video')
        .map((item) => item.clip.filePath)
        .filter((filePath): filePath is string => filePath !== null),
    ),
  ];
  const pathsKey = paths.join('\n');

  const layoutKey = placed
    .map((item) => `${item.clip.id}:${item.startFrames}:${item.clip.durationFrames}:${item.clip.sourceInFrames ?? 0}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    for (const sourcePath of pathsKey ? pathsKey.split('\n') : []) {
      if (sourcePath in sheets) continue;

      if (filmstripSheetLRUCache.has(sourcePath)) {
        const cached = filmstripSheetLRUCache.get(sourcePath)!;
        setSheets((current) => ({ ...current, [sourcePath]: cached }));
        if (cached && !imagesRef.current[sourcePath]) {
          const image = new Image();
          image.src = cached.url;
          image.onload = () => {
            if (cancelled) return;
            imagesRef.current[sourcePath] = image;
            setDecodedVersion((version) => version + 1);
          };
        }
        continue;
      }

      void window.api.sequence
        .getFilmstrip(sourcePath)
        .then((sheet) => {
          if (cancelled) return;
          filmstripSheetLRUCache.set(sourcePath, sheet);
          setSheets((current) => ({ ...current, [sourcePath]: sheet }));
          if (!sheet) return;

          const image = new Image();
          image.src = sheet.url;
          image.onload = () => {
            if (cancelled) return;
            imagesRef.current[sourcePath] = image;
            setDecodedVersion((version) => version + 1);
          };
        })
        .catch(() => {
          filmstripSheetLRUCache.set(sourcePath, null);
          if (!cancelled) setSheets((current) => ({ ...current, [sourcePath]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [pathsKey, sheets]);

  // S175 — Calculate bounded horizontal viewport window
  const viewport = calculateVirtualizedViewport({
    scrollLeft,
    viewportWidth,
    totalWidthPx: widthPx,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.windowWidth <= 0 || heightPx <= 0) return;

    // Backing store at device resolution, bounded to virtualized window width
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(viewport.windowWidth * ratio));
    canvas.height = Math.max(1, Math.round(heightPx * ratio));

    const context = canvas.getContext('2d');
    if (!context) return;

    // Shift transform origin by -windowLeft so drawing remains in absolute sequence coordinates
    context.setTransform(ratio, 0, 0, ratio, -viewport.windowLeft * ratio, 0);
    context.clearRect(viewport.windowLeft, 0, viewport.windowWidth, heightPx);
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

      // S175: O(1) early viewport culling
      if (!isClipInViewportWindow(left, clipWidth, viewport.windowLeft, viewport.windowRight)) {
        continue;
      }

      // Tiles are drawn at the lane's height, keeping the source's aspect
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
        // Head and tail mode: cull tiles outside viewport window
        const headW = Math.min(drawWidth, clipWidth);
        if (left + headW >= viewport.windowLeft && left <= viewport.windowRight) {
          drawTileAt(sourceInSeconds, left, headW);
        }
        const tailFits = clipWidth >= drawWidth * 2;
        if (tailFits) {
          const tailX = left + clipWidth - drawWidth;
          if (tailX + drawWidth >= viewport.windowLeft && tailX <= viewport.windowRight) {
            const endSeconds =
              sourceInSeconds + framesToSeconds(Math.max(0, item.clip.durationFrames - 1), fps);
            drawTileAt(endSeconds, tailX, drawWidth);
          }
        }
        continue;
      }

      // Continuous mode: tile across the clip's width, breaking early once past viewport window
      for (let x = 0; x < clipWidth; x += drawWidth) {
        const tileX = left + x;
        // Tile is entirely to the left of visible window
        if (tileX + drawWidth < viewport.windowLeft) continue;
        // Tile is entirely to the right of visible window: break early
        if (tileX > viewport.windowRight) break;

        const intoClipSeconds = (x / pixelsPerFrame) / fps;
        drawTileAt(sourceInSeconds + intoClipSeconds, tileX, Math.min(drawWidth, clipWidth - x));
      }
    }
  }, [
    layoutKey,
    sheets,
    decodedVersion,
    viewport.windowLeft,
    viewport.windowWidth,
    viewport.windowRight,
    heightPx,
    pixelsPerSecond,
    fps,
    placed,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-0"
      style={{
        left: viewport.windowLeft,
        width: viewport.windowWidth,
        height: heightPx,
      }}
    />
  );
}
