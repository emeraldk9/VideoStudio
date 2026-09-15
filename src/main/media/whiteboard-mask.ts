import fs from 'node:fs';
import path from 'node:path';

import { polygonScanlineSpans, type WhiteboardZone } from '@shared';

import { encodeGrayPng } from './png-encode';

/**
 * Beta S275 — zone masks for the whiteboard zone reveal.
 *
 * One white-on-black 8-bit gray PNG per zone, rasterized even-odd by the
 * shared `polygonScanlineSpans` — the same fill rule the preview's
 * `polygon(evenodd, …)` clip-path uses, which is the whole point: a
 * self-intersecting freehand loop fills identically in both renderers.
 *
 * Masks are written **synchronously into the render work dir** at the
 * render's own geometry (a draft render hands in halved dimensions and gets
 * halved masks). They are per-render scratch, not cached artifacts: a 1080p
 * mask is a run-length-friendly ~2 KB and the twelve-zone worst case
 * rasterizes in single-digit milliseconds — the segment cache's identity
 * comes from the settings object in the descriptor, never from these files.
 */

/**
 * The deterministic mask path — exported because the descriptor builder in
 * `sequence-render-service.ts` must name the same files as volatile without
 * re-deriving the write.
 */
export function zoneMaskPath(dir: string, clipId: string, index: number): string {
  return path.join(dir, `wbzone-${clipId}-${index}.png`);
}

/** Rasterizes every zone and returns the written paths, in zone order. */
export function writeZoneMasks(
  zones: readonly WhiteboardZone[],
  width: number,
  height: number,
  dir: string,
  clipId: string,
): string[] {
  const paths: string[] = [];
  for (let index = 0; index < zones.length; index += 1) {
    const gray = new Uint8Array(width * height);
    for (const row of polygonScanlineSpans(zones[index].points, width, height)) {
      for (const [startX, endX] of row.spans) {
        gray.fill(255, row.y * width + startX, row.y * width + endX);
      }
    }
    const filePath = zoneMaskPath(dir, clipId, index);
    fs.writeFileSync(filePath, encodeGrayPng(gray, width, height));
    paths.push(filePath);
  }
  return paths;
}
