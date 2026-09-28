import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { formatTimecode, framesToSeconds } from './frames';
import { layoutTrack } from './layout';

/**
 * Milestone S182: Timeline Marquee Multi-Select Engine & Spatial Bounding Box Operations.
 * Supports rubberband selection rectangle calculations, additive / subtractive selection modifiers,
 * AABB 2D intersection testing across dynamic timeline tracks, and multi-clip selection metrics HUD.
 */

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type MarqueeModifierMode = 'replace' | 'add' | 'subtract';

/**
 * Determine selection modifier behavior from pointer event keyboard modifiers:
 * - Alt / Option: subtractive selection (remove intersected clips from selection)
 * - Shift: additive selection (union of base selection and intersected clips)
 * - Default: replacement selection (select only intersected clips)
 */
export function resolveMarqueeModifier(event: {
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): MarqueeModifierMode {
  if (event.altKey) return 'subtract';
  if (event.shiftKey) return 'add';
  return 'replace';
}

/**
 * Normalizes two client points into a top-left width/height bounding rectangle.
 */
export function calculateMarqueeRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): MarqueeRect {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  return { left, top, width, height };
}

export interface MarqueeIntersectionOptions {
  clips: SequenceClip[];
  tracks: SequenceTrack[];
  rect: MarqueeRect;
  pixelsPerFrame: number;
  laneLabelWidthPx?: number;
  laneGapPx?: number;
  minTrackHeightPx?: number;
}

/**
 * Perform 2D AABB intersection testing between a marquee bounding rectangle and clips
 * laid out on sequence tracks. Locked tracks are safely bypassed.
 */
export function intersectClipsWithMarquee(options: MarqueeIntersectionOptions): string[] {
  const {
    clips,
    tracks,
    rect,
    pixelsPerFrame,
    laneLabelWidthPx = 152,
    laneGapPx = 8,
    minTrackHeightPx = 24,
  } = options;

  if (rect.width <= 0 || rect.height <= 0 || tracks.length === 0 || clips.length === 0) {
    return [];
  }

  const rectRight = rect.left + rect.width;
  const rectBottom = rect.top + rect.height;
  const intersectedIds: string[] = [];

  let rowTop = 0;
  for (const track of tracks) {
    const height = Math.max(minTrackHeightPx, track.heightPx ?? 40);
    const rowBottom = rowTop + height;

    // Check vertical overlap with track row (and skip locked tracks)
    if (!track.locked && rowBottom > rect.top && rowTop < rectBottom) {
      const placedClips = layoutTrack(clips, track);
      for (const placed of placedClips) {
        const clipLeft = laneLabelWidthPx + placed.startFrames * pixelsPerFrame;
        const clipRight = laneLabelWidthPx + placed.endFrames * pixelsPerFrame;

        // Check horizontal overlap with clip
        if (clipRight > rect.left && clipLeft < rectRight) {
          intersectedIds.push(placed.clip.id);
        }
      }
    }

    rowTop = rowBottom + laneGapPx;
  }

  return intersectedIds;
}

/**
 * Compute the resulting selection id set by combining the base selection and intersected clips
 * according to modifier mode (replace, add, subtract).
 */
export function applyMarqueeSelection(
  baseSelection: string[],
  intersectedIds: string[],
  mode: MarqueeModifierMode,
): string[] {
  switch (mode) {
    case 'add':
      return [...new Set([...baseSelection, ...intersectedIds])];
    case 'subtract': {
      const subtractSet = new Set(intersectedIds);
      return baseSelection.filter((id) => !subtractSet.has(id));
    }
    case 'replace':
    default:
      return [...new Set(intersectedIds)];
  }
}

export interface SelectionSummary {
  clipCount: number;
  totalDurationFrames: number;
  totalDurationSeconds: number;
  formattedDuration: string;
  trackCount: number;
  earliestFrame: number;
  latestFrame: number;
  badgeText: string;
}

/**
 * Computes human-readable metrics for a multi-clip selection: count, combined duration,
 * and track span for display in the timeline selection HUD.
 */
export function calculateSelectionSummary(
  selectedClipIds: string[],
  clips: SequenceClip[],
  fps: number,
): SelectionSummary | null {
  if (!selectedClipIds || selectedClipIds.length === 0) return null;

  const idSet = new Set(selectedClipIds);
  const matched = clips.filter((c) => idSet.has(c.id));
  if (matched.length === 0) return null;

  let totalDurationFrames = 0;
  let earliestFrame = Infinity;
  let latestFrame = -Infinity;
  const trackIds = new Set<string>();

  for (const clip of matched) {
    totalDurationFrames += clip.durationFrames;
    trackIds.add(clip.trackId);
    if (typeof clip.startFrames === 'number') {
      if (clip.startFrames < earliestFrame) earliestFrame = clip.startFrames;
      const end = clip.startFrames + clip.durationFrames;
      if (end > latestFrame) latestFrame = end;
    }
  }

  if (earliestFrame === Infinity) earliestFrame = 0;
  if (latestFrame === -Infinity) latestFrame = totalDurationFrames;

  const totalDurationSeconds = framesToSeconds(totalDurationFrames, fps);
  const formattedDuration = formatTimecode(totalDurationFrames, fps);
  const clipCount = matched.length;
  const trackCount = trackIds.size;

  const badgeText = `${clipCount} clip${clipCount === 1 ? '' : 's'} · ${formattedDuration} (${trackCount} track${trackCount === 1 ? '' : 's'})`;

  return {
    clipCount,
    totalDurationFrames,
    totalDurationSeconds,
    formattedDuration,
    trackCount,
    earliestFrame,
    latestFrame,
    badgeText,
  };
}
