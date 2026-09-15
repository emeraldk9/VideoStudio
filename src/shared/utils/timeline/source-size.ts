/**
 * Beta S242 — the cut's own native size, derived from what its stills measure.
 *
 * S239 taught preflight to say the true thing about an undersized cut ("110
 * stills are smaller than the 1920×1080 canvas and will be enlarged"). This is
 * the remedy half: the size the canvas would have to be for that finding to go
 * away, offered to the user as an aspect option rather than applied for them.
 *
 * Pure and renderer-free on purpose — the panel that consumes it already has
 * the measurements, and the choosing rule is the part worth testing.
 */

export interface SourceSize {
  width: number;
  height: number;
}

/**
 * `yuv420p` chroma subsampling needs both axes even. A source measured at an
 * odd height would otherwise encode fine all the way to the final mux and fail
 * there — the most expensive place in the pipeline to discover it.
 */
function floorToEven(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * The size most of the cut's stills actually are.
 *
 * **Most common, not smallest.** The smallest would guarantee no upscale
 * anywhere, but one 640×360 plate dropped into a cut of 1376×768 storyboard
 * stills would drag the whole delivery down to the plate. The common size is
 * what the cut *is*; a single odd source out is exactly the case
 * `source_below_canvas` exists to name, and it should stay named rather than
 * silently redefining the delivery.
 *
 * Ties break toward the larger area, so a cut evenly split between two sizes
 * keeps the detail it has rather than throwing half of it away.
 *
 * Returns `null` when nothing was measured — an unprobed cut is silence, not a
 * recommendation, the same posture the motion guards take.
 */
export function dominantSourceSize(sizes: SourceSize[]): SourceSize | null {
  const counts = new Map<string, { size: SourceSize; count: number }>();
  for (const size of sizes) {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) continue;
    if (size.width <= 0 || size.height <= 0) continue;
    const even = { width: floorToEven(size.width), height: floorToEven(size.height) };
    const key = `${even.width}x${even.height}`;
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { size: even, count: 1 });
  }
  if (counts.size === 0) return null;

  let best: { size: SourceSize; count: number } | null = null;
  for (const entry of counts.values()) {
    if (best === null) {
      best = entry;
      continue;
    }
    if (entry.count > best.count) {
      best = entry;
      continue;
    }
    if (entry.count === best.count) {
      const area = entry.size.width * entry.size.height;
      const bestArea = best.size.width * best.size.height;
      if (area > bestArea) best = entry;
    }
  }
  return best?.size ?? null;
}

/**
 * The size to offer as "Match sources", or `null` when there is nothing worth
 * offering — no measurements, or a canvas that already matches.
 */
export function matchableCanvasSize(
  sizes: SourceSize[],
  canvas: SourceSize,
): SourceSize | null {
  const dominant = dominantSourceSize(sizes);
  if (!dominant) return null;
  if (dominant.width === canvas.width && dominant.height === canvas.height) return null;
  return dominant;
}
