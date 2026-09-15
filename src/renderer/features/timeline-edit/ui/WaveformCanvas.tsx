import { useEffect, useRef, useState } from 'react';

import type { PlacedClip } from '@shared';

import { useThemeTokens } from '../lib/useThemeTokens';

export interface WaveformCanvasProps {
  /** The lane's audio clips, already laid out. */
  placed: PlacedClip[];
  fps: number;
  pixelsPerSecond: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Beta S145 §4.4, honoured in Beta S151 (H3) — **one canvas per lane**, every
 * clip's waveform drawn into its own rectangle.
 *
 * S145 shipped the inverse (a canvas per clip), which made backing-store count
 * grow with clip count — the exact thing the spec's one-per-lane decision
 * existed to keep flat. One canvas is one backing store however many clips the
 * lane holds, and one redraw pass on zoom or theme change instead of N.
 *
 * Canvas rather than DOM because a waveform is thousands of marks; as elements
 * it would dominate the page's node count on a sequence with any real amount
 * of narration.
 *
 * **Every colour is read from a CSS custom property at draw time — never a
 * literal.** A canvas takes no Tailwind classes and no CSS variables, so a
 * hardcoded hex here would break the light theme with all four gates green.
 * `useThemeTokens` supplies the values and its `themeVersion` triggers the
 * redraw when the theme flips; see that hook for why the signal is a DOM
 * observer rather than the shell store.
 */
export function WaveformCanvas({ placed, fps, pixelsPerSecond, widthPx, heightPx }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Peaks by source path — clips sharing a file (a split narration) share one fetch. */
  const [peaksByPath, setPeaksByPath] = useState<Record<string, number[] | null>>({});
  const { read, themeVersion } = useThemeTokens();

  const paths = [
    ...new Set(
      placed
        .map((item) => item.clip.filePath)
        .filter((filePath): filePath is string => filePath !== null),
    ),
  ];
  // A stable key so the fetch effect re-runs only when the *set* of files
  // changes, not on every relayout of the same clips.
  const pathsKey = paths.join('\n');

  // S173 — the draw effect keys on this primitive rather than on `placed`'s
  // array identity. Before this, an unmemoized `layoutTrack` in the row's
  // render body handed the effect a fresh array every render, so every panel
  // re-render (each pointermove of a drag included) reset the backing store
  // and re-ran the per-pixel-column fill loop for every audio lane — the
  // single largest per-move cost in the dock. The caller memoizes now, and
  // this key means a future caller who forgets cannot reintroduce it.
  const layoutKey = placed
    .map((item) => `${item.clip.id}:${item.startFrames}:${item.clip.durationFrames}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    for (const sourcePath of pathsKey ? pathsKey.split('\n') : []) {
      if (sourcePath in peaksByPath) continue;
      void window.api.sequence
        .getPeaks(sourcePath)
        .then((result) => {
          if (!cancelled) setPeaksByPath((current) => ({ ...current, [sourcePath]: result }));
        })
        .catch(() => {
          // A file with no audio stream, or one ffmpeg could not read. The
          // clip renders as a plain block, which is honest — a fabricated
          // waveform would be worse than none.
          if (!cancelled) setPeaksByPath((current) => ({ ...current, [sourcePath]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
    // `peaksByPath` is deliberately not a dependency: the effect *writes* it,
    // and re-running on its own writes would loop. The `in` guard above is
    // what makes each path fetch once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || widthPx <= 0 || heightPx <= 0) return;

    // Backing store at device resolution, CSS box at layout resolution —
    // without this the waveform is soft on every HiDPI display.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(widthPx * ratio));
    canvas.height = Math.max(1, Math.round(heightPx * ratio));

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, widthPx, heightPx);

    context.fillStyle = read('--text-secondary');
    context.globalAlpha = 0.55;

    const pixelsPerFrame = pixelsPerSecond / fps;
    const middle = heightPx / 2;

    for (const item of placed) {
      if (!item.clip.filePath) continue;
      const peaks = peaksByPath[item.clip.filePath];
      if (!peaks || peaks.length === 0) continue;
      const left = item.startFrames * pixelsPerFrame;
      const clipWidth = item.clip.durationFrames * pixelsPerFrame;
      const columns = Math.max(1, Math.floor(clipWidth));
      for (let column = 0; column < columns; column += 1) {
        // Peaks are a fixed-length summary of the whole file, so sample it at
        // the clip's current width rather than assuming one bucket per pixel.
        const peak = peaks[Math.floor((column / columns) * peaks.length)] ?? 0;
        const barHeight = Math.max(1, peak * (heightPx - 2));
        context.fillRect(left + column, middle - barHeight / 2, 1, barHeight);
      }
    }
    context.globalAlpha = 1;
    // `placed` is read but keyed by `layoutKey` — see the comment above; the
    // lint suppression is the point, not an oversight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, peaksByPath, widthPx, heightPx, pixelsPerSecond, fps, read, themeVersion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // z-[1]: above the clip bodies (which are z-auto), below the clips'
      // labels, selection rules and trim handles (z-10). Pointer-events off so
      // every click and drag lands on the clip beneath.
      className="pointer-events-none absolute inset-0 z-[1]"
      style={{ width: widthPx, height: heightPx }}
    />
  );
}
