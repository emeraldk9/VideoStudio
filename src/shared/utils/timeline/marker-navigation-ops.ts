import type { SequenceMarker } from '../../types/sequence';
import { formatTimecode } from './frames';

/**
 * Milestone S180: Timeline Marker Category Taxonomy & Quick-Navigation Operations.
 * Supports quick-jumping across timeline cues (Shift+M next, Alt+M prev),
 * filtering ruler and navigation by editorial category (Chapters, Sync Locks, Review Notes, Beats, Scene Cuts),
 * and generating formatted HUD chips and timecodes.
 */

export type MarkerFilterCategory = 'all' | 'chapter' | 'sync' | 'review' | 'beat' | 'scene_cut';

export const MARKER_FILTER_CATEGORIES: { id: MarkerFilterCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'All Markers', icon: 'bookmarks' },
  { id: 'chapter', label: 'Chapters', icon: 'bookmark' },
  { id: 'sync', label: 'Sync Locks', icon: 'lock' },
  { id: 'review', label: 'Review Notes', icon: 'rate_review' },
  { id: 'beat', label: 'Beats', icon: 'music_note' },
  { id: 'scene_cut', label: 'Scene Cuts', icon: 'movie_filter' },
];

export const isMarkerReview = (m: SequenceMarker): boolean =>
  Boolean(m.notes && m.notes.trim().length > 0) || m.color === 'warning';

export const isMarkerSync = (m: SequenceMarker): boolean => m.locked;

export const isMarkerBeat = (m: SequenceMarker): boolean =>
  m.markerKind === 'beat' || m.markerKind === 'downbeat';

export const isMarkerSceneCut = (m: SequenceMarker): boolean =>
  m.markerKind === 'scene_cut';

export const isMarkerChapter = (m: SequenceMarker): boolean =>
  (!m.markerKind || m.markerKind === 'standard') &&
  !isMarkerSync(m) &&
  !isMarkerReview(m) &&
  !isMarkerBeat(m) &&
  !isMarkerSceneCut(m);

/**
 * Filter sequence markers according to semantic editorial category.
 */
export function filterMarkersByCategory(
  markers: SequenceMarker[],
  category: MarkerFilterCategory,
): SequenceMarker[] {
  if (category === 'all') {
    return [...markers];
  }

  switch (category) {
    case 'sync':
      return markers.filter(isMarkerSync);
    case 'review':
      return markers.filter(isMarkerReview);
    case 'beat':
      return markers.filter(isMarkerBeat);
    case 'scene_cut':
      return markers.filter(isMarkerSceneCut);
    case 'chapter':
      return markers.filter(isMarkerChapter);
    default:
      return [...markers];
  }
}

/**
 * Calculate count distribution across all marker categories for taxonomy pill badges.
 */
export function getMarkerCountsByCategory(
  markers: SequenceMarker[],
): Record<MarkerFilterCategory, number> {
  const counts: Record<MarkerFilterCategory, number> = {
    all: markers.length,
    chapter: 0,
    sync: 0,
    review: 0,
    beat: 0,
    scene_cut: 0,
  };

  for (const m of markers) {
    if (isMarkerSync(m)) counts.sync++;
    if (isMarkerReview(m)) counts.review++;
    if (isMarkerBeat(m)) counts.beat++;
    if (isMarkerSceneCut(m)) counts.scene_cut++;
    if (isMarkerChapter(m)) counts.chapter++;
  }

  return counts;
}

/**
 * Find the next marker strictly after the current playhead frame.
 * Applies hysteresis tolerance so calling repeatedly advances across successive markers.
 */
export function findNextMarker(
  markers: SequenceMarker[],
  currentFrame: number,
  tolerance = 0.5,
): SequenceMarker | null {
  if (!markers || markers.length === 0) return null;

  const threshold = currentFrame + tolerance;
  const sorted = [...markers].sort((a, b) => a.frame - b.frame);

  for (const marker of sorted) {
    if (marker.frame > threshold) {
      return marker;
    }
  }

  return null;
}

/**
 * Find the previous marker strictly before the current playhead frame.
 * Applies hysteresis tolerance so calling repeatedly walks back across successive markers.
 */
export function findPreviousMarker(
  markers: SequenceMarker[],
  currentFrame: number,
  tolerance = 0.5,
): SequenceMarker | null {
  if (!markers || markers.length === 0) return null;

  const threshold = currentFrame - tolerance;
  const sorted = [...markers].sort((a, b) => b.frame - a.frame);

  for (const marker of sorted) {
    if (marker.frame < threshold) {
      return marker;
    }
  }

  return null;
}

/**
 * Find any marker coinciding with current playhead within tolerance.
 */
export function findMarkerAtPlayhead(
  markers: SequenceMarker[],
  currentFrame: number,
  tolerance = 0.5,
): SequenceMarker | null {
  if (!markers || markers.length === 0) return null;

  return (
    markers.find((m) => Math.abs(m.frame - currentFrame) <= tolerance) ?? null
  );
}

/**
 * Format a human-readable HUD badge for an active or targeted marker.
 * e.g., "Intro Chapter (00:04)" or "Sync Anchor #2 [Lock] (01:12)"
 */
export function formatMarkerTimecodeBadge(marker: SequenceMarker, fps: number): string {
  const tc = formatTimecode(marker.frame, fps);
  const name = marker.name.trim() || (marker.locked ? 'Sync Lock' : 'Marker');
  const tag = marker.locked ? ' [Lock]' : marker.notes ? ' [Note]' : '';
  return `${name}${tag} · ${tc}`;
}

/**
 * Resolve the Material Symbol icon name for a given marker's role.
 */
export function getMarkerGlyph(marker: SequenceMarker): string {
  if (marker.locked) return 'lock';
  switch (marker.markerKind) {
    case 'downbeat':
      return 'radio_button_checked';
    case 'beat':
      return 'fiber_manual_record';
    case 'scene_cut':
      return 'movie_filter';
    default:
      return marker.notes ? 'rate_review' : 'bookmark';
  }
}
