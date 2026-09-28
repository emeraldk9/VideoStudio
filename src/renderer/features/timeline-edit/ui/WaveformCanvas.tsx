import { useEffect, useRef, useState } from 'react';

import {
  audioPeaksLRUCache,
  calculateVisibleClipSlice,
  calculateVirtualizedViewport,
  isClipInViewportWindow,
  type PlacedClip,
} from '@shared';

import { useThemeTokens } from '../lib/useThemeTokens';
import { useTimelineViewportStore } from '../model/timelineViewportStore';

export interface WaveformCanvasProps {
  /** The lane's audio clips, already laid out. */
  placed: PlacedClip[];
  fps: number;
  pixelsPerSecond: number;
  widthPx: number;
  heightPx: number;
  /** 'audio' (default, full lane height), 'video' (lower third overlay), or 'sketch' (subtle underlay). */
  laneKind?: 'audio' | 'video' | 'sketch';
}

/**
 * Beta S145 §4.4, honoured in Beta S151 (H3) — **one canvas per lane**, every
 * clip's waveform drawn into its own rectangle.
 *
 * S175 — **Timeline Viewport Virtualization & High-Capacity Waveform Memory Pooling**:
 * Clamps canvas backing-store allocation to the visible scroll window + buffer,
 * bounding GPU texture memory under 3,840px regardless of sequence duration (even
 * multi-hour edits). Culls off-screen clips in O(1) and slices visible column
 * iteration ranges to eliminate redundant peak loop calculations.
 */
export function WaveformCanvas({
  placed,
  fps,
  pixelsPerSecond,
  widthPx,
  heightPx,
  laneKind = 'audio',
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Peaks by source path — clips sharing a file (a split narration) share one fetch. */
  const [peaksByPath, setPeaksByPath] = useState<Record<string, number[] | null>>(() => {
    // Prime initial state with cached peaks if available
    const initial: Record<string, number[] | null> = {};
    for (const item of placed) {
      if (item.clip.filePath && audioPeaksLRUCache.has(item.clip.filePath)) {
        initial[item.clip.filePath] = audioPeaksLRUCache.get(item.clip.filePath)!;
      }
    }
    return initial;
  });
  const { read, themeVersion } = useThemeTokens();

  // S175 — Viewport horizontal scroll window subscription
  const scrollLeft = useTimelineViewportStore((s) => s.scrollLeft);
  const viewportWidth = useTimelineViewportStore((s) => s.viewportWidth);

  const isVideo = laneKind === 'video';
  const isSketch = laneKind === 'sketch';
  const relevantClips = isVideo
    ? placed.filter(
        (item) =>
          item.clip.sourceKind === 'video' &&
          item.clip.sourceAudioEnabled !== false &&
          item.clip.filePath !== null,
      )
    : placed.filter((item) => item.clip.filePath !== null);

  const paths = [
    ...new Set(
      relevantClips
        .map((item) => item.clip.filePath)
        .filter((filePath): filePath is string => filePath !== null),
    ),
  ];
  // A stable key so the fetch effect re-runs only when the *set* of files
  // changes, not on every relayout of the same clips.
  const pathsKey = paths.join('\n');

  const layoutKey = relevantClips
    .map((item) => `${item.clip.id}:${item.startFrames}:${item.clip.durationFrames}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    for (const sourcePath of pathsKey ? pathsKey.split('\n') : []) {
      if (sourcePath in peaksByPath) continue;

      if (audioPeaksLRUCache.has(sourcePath)) {
        const cached = audioPeaksLRUCache.get(sourcePath)!;
        setPeaksByPath((current) => ({ ...current, [sourcePath]: cached }));
        continue;
      }

      void window.api.sequence
        .getPeaks(sourcePath)
        .then((result) => {
          audioPeaksLRUCache.set(sourcePath, result);
          if (!cancelled) setPeaksByPath((current) => ({ ...current, [sourcePath]: result }));
        })
        .catch(() => {
          audioPeaksLRUCache.set(sourcePath, null);
          if (!cancelled) setPeaksByPath((current) => ({ ...current, [sourcePath]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [pathsKey, peaksByPath]);

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

    if (isSketch) {
      context.fillStyle = read('--accent-ai');
      context.globalAlpha = 0.35;
    } else if (isVideo) {
      context.fillStyle = read('--accent-ai');
      context.globalAlpha = 0.45;
    } else {
      context.fillStyle = read('--text-secondary');
      context.globalAlpha = 0.55;
    }

    const pixelsPerFrame = pixelsPerSecond / fps;
    const middle = isVideo ? heightPx - heightPx * 0.18 : heightPx / 2;
    const maxBarHeight = isVideo ? heightPx * 0.32 : isSketch ? heightPx * 0.7 : heightPx - 2;

    for (const item of relevantClips) {
      if (!item.clip.filePath) continue;
      const peaks = peaksByPath[item.clip.filePath];
      if (!peaks || peaks.length === 0) continue;

      const left = item.startFrames * pixelsPerFrame;
      const clipWidth = item.clip.durationFrames * pixelsPerFrame;

      // S175: O(1) early viewport culling
      if (!isClipInViewportWindow(left, clipWidth, viewport.windowLeft, viewport.windowRight)) {
        continue;
      }

      const columns = Math.max(1, Math.floor(clipWidth));

      // S175: Slice only visible columns across current window
      const { visibleStartCol, visibleEndCol, hasVisibleColumns } = calculateVisibleClipSlice(
        left,
        clipWidth,
        viewport.windowLeft,
        viewport.windowRight,
      );
      if (!hasVisibleColumns) continue;

      for (let column = visibleStartCol; column < visibleEndCol; column += 1) {
        // Peaks are a fixed-length summary of the whole file, sampled at current clip width
        const peak = peaks[Math.floor((column / columns) * peaks.length)] ?? 0;
        const barHeight = Math.max(1, peak * maxBarHeight);
        context.fillRect(left + column, middle - barHeight / 2, 1, barHeight);
      }
    }
    context.globalAlpha = 1;
  }, [
    layoutKey,
    peaksByPath,
    viewport.windowLeft,
    viewport.windowWidth,
    viewport.windowRight,
    heightPx,
    pixelsPerSecond,
    fps,
    read,
    themeVersion,
    isVideo,
    isSketch,
    relevantClips,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-[1]"
      style={{
        left: viewport.windowLeft,
        width: viewport.windowWidth,
        height: heightPx,
      }}
    />
  );
}
