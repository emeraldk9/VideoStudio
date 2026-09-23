/**
 * Milestone S70 — Magnetic Timeline Auto-Ripple & Smart Collision Avoidance Engine.
 *
 * Provides pure mathematical routines for:
 * 1. Overlap collision detection on timeline tracks.
 * 2. Smart bumper snapping (snapping moving clips to abut adjacent clip boundaries cleanly).
 * 3. Auto-ripple splicing (inserting clips and shifting downstream clips rightward).
 * 4. Ripple deletion (deleting clips and auto-collapsing gaps by shifting downstream clips leftward).
 * 5. Live displacement preview calculations for interactive drag-and-drop HUD guides.
 */

import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';

export interface CollisionInfo {
  collidingClip: SequenceClip;
  overlapStart: number;
  overlapEnd: number;
  overlapDuration: number;
}

/**
 * Detects any clip collisions (overlaps) on a track for a proposed [start, start + duration] window.
 */
export function detectClipCollisions(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
  movingClipId: string | null,
  proposedStart: number,
  duration: number,
): CollisionInfo[] {
  if (track.magnetic) return [];
  const proposedEnd = proposedStart + duration;
  const collisions: CollisionInfo[] = [];

  for (const clip of clips) {
    if (clip.trackId !== track.id || clip.id === movingClipId) continue;
    const start = clip.startFrames ?? 0;
    const end = start + clip.durationFrames;

    // Check interval overlap: [proposedStart, proposedEnd) intersects [start, end)
    if (proposedStart < end && proposedEnd > start) {
      const overlapStart = Math.max(proposedStart, start);
      const overlapEnd = Math.min(proposedEnd, end);
      collisions.push({
        collidingClip: clip,
        overlapStart,
        overlapEnd,
        overlapDuration: Math.max(0, overlapEnd - overlapStart),
      });
    }
  }

  return collisions;
}

/**
 * Resolves bumper snapping: if a proposed placement collides or lands within bumper tolerance of
 * adjacent clips, snaps the clip to cleanly abut the nearest boundary without overlapping.
 */
export function resolveCollisionBumping(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
  movingClipId: string | null,
  proposedStart: number,
  duration: number,
  bumperToleranceFrames = 15,
): { snappedStart: number; bumped: boolean } {
  if (track.magnetic) {
    return { snappedStart: Math.max(0, proposedStart), bumped: false };
  }

  const placed = layoutTrack(
    clips.filter((c) => c.id !== movingClipId) as SequenceClip[],
    track,
  ).sort((a, b) => a.startFrames - b.startFrames);

  if (placed.length === 0) {
    return { snappedStart: Math.max(0, proposedStart), bumped: false };
  }

  const proposedEnd = proposedStart + duration;

  // Find candidate abutting positions
  // 1. Right edge of a preceding clip (abutting to its right)
  // 2. Left edge of a succeeding clip (abutting to its left, so end = start => start = succeeding.start - duration)
  // 3. Track head (0)
  const candidateStarts: number[] = [0];

  for (const item of placed) {
    candidateStarts.push(item.endFrames); // Abut right of this clip
    candidateStarts.push(Math.max(0, item.startFrames - duration)); // Abut left of this clip
  }

  // Filter candidate starts to only those that do NOT cause collisions
  const validCandidates = candidateStarts.filter((candidate) => {
    const candidateEnd = candidate + duration;
    for (const item of placed) {
      if (candidate < item.endFrames && candidateEnd > item.startFrames) {
        return false; // Collision!
      }
    }
    return true;
  });

  if (validCandidates.length === 0) {
    return { snappedStart: Math.max(0, proposedStart), bumped: false };
  }

  // Check if current proposedStart has any collision
  const hasCollision = placed.some(
    (item) => proposedStart < item.endFrames && proposedEnd > item.startFrames,
  );

  // Find closest valid candidate
  let bestCandidate = validCandidates[0];
  let minDiff = Math.abs(proposedStart - bestCandidate);

  for (let i = 1; i < validCandidates.length; i++) {
    const diff = Math.abs(proposedStart - validCandidates[i]);
    if (diff < minDiff) {
      minDiff = diff;
      bestCandidate = validCandidates[i];
    }
  }

  // If there is a collision OR we are within bumper tolerance of a clean candidate, snap!
  if (hasCollision || minDiff <= bumperToleranceFrames) {
    return { snappedStart: bestCandidate, bumped: true };
  }

  return { snappedStart: Math.max(0, proposedStart), bumped: false };
}

/**
 * Inserts a clip into a track with auto-ripple: all clips starting at or after `insertStart`
 * are shifted rightward by `duration`.
 */
export function applyAutoRippleInsert(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
  insertClipId: string,
  insertStart: number,
  duration: number,
): SequenceClip[] {
  if (duration <= 0) return [...clips];

  if (track.magnetic) {
    const placed = layoutTrack(clips as SequenceClip[], track);
    const existingIndex = placed.findIndex((item) => item.clip.id === insertClipId);
    let targetIndex = placed.findIndex((item) => insertStart < item.endFrames);
    if (targetIndex < 0) targetIndex = placed.length;

    // If the clip was already on the track and was before the target, decrement targetIndex
    if (existingIndex >= 0 && existingIndex < targetIndex) {
      targetIndex--;
    }

    const ordered = placed
      .filter((item) => item.clip.id !== insertClipId)
      .map((item) => item.clip);

    let moved: SequenceClip;
    if (existingIndex >= 0) {
      moved = placed[existingIndex].clip;
    } else {
      const found = clips.find((c) => c.id === insertClipId);
      if (!found) return [...clips];
      moved = { ...found, trackId: track.id, startFrames: null };
    }

    ordered.splice(targetIndex, 0, moved);

    const renumbered = ordered.map((clip, index) => ({
      ...clip,
      orderIndex: index,
      startFrames: null,
    }));

    return [
      ...clips.filter((c) => c.trackId !== track.id && c.id !== insertClipId),
      ...renumbered,
    ];
  }

  // Free track auto-ripple
  return clips.map((clip) => {
    if (clip.id === insertClipId) {
      return { ...clip, trackId: track.id, startFrames: insertStart };
    }
    if (clip.trackId !== track.id) {
      return clip;
    }
    const currentStart = clip.startFrames ?? 0;
    if (currentStart >= insertStart) {
      return { ...clip, startFrames: currentStart + duration };
    }
    return clip;
  });
}

/**
 * Deletes clips and automatically collapses resulting gaps (Ripple Delete), shifting subsequent
 * clips leftward by the deleted duration.
 */
export function applyRippleDelete(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  deletedClipIds: readonly string[],
): SequenceClip[] {
  if (deletedClipIds.length === 0) return [...clips];
  const deleteSet = new Set(deletedClipIds);
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  // Group deleted clips by track
  const deletedByTrack = new Map<string, SequenceClip[]>();
  for (const clip of clips) {
    if (deleteSet.has(clip.id)) {
      const list = deletedByTrack.get(clip.trackId) ?? [];
      list.push(clip);
      deletedByTrack.set(clip.trackId, list);
    }
  }

  let result = clips.filter((c) => !deleteSet.has(c.id));

  // For each affected track, ripple close the gaps left by the deleted clips
  for (const [trackId, deletedClips] of deletedByTrack) {
    const track = trackMap.get(trackId);
    if (!track) continue;

    if (track.magnetic) {
      // Magnetic tracks: re-index remaining clips consecutively
      const trackClips = result
        .filter((c) => c.trackId === trackId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c, idx) => ({ ...c, orderIndex: idx, startFrames: null }));

      result = [...result.filter((c) => c.trackId !== trackId), ...trackClips];
    } else {
      // Free tracks: sort deleted segments and pull subsequent clips leftward
      const placedDeleted = deletedClips
        .map((c) => ({
          startFrames: c.startFrames ?? 0,
          endFrames: (c.startFrames ?? 0) + c.durationFrames,
          duration: c.durationFrames,
        }))
        .sort((a, b) => a.startFrames - b.startFrames);

      // Merge overlapping/contiguous deleted ranges into unified ripple intervals
      const mergedIntervals: { startFrames: number; duration: number }[] = [];
      for (const seg of placedDeleted) {
        if (
          mergedIntervals.length > 0 &&
          seg.startFrames <=
            mergedIntervals[mergedIntervals.length - 1].startFrames +
              mergedIntervals[mergedIntervals.length - 1].duration
        ) {
          const last = mergedIntervals[mergedIntervals.length - 1];
          const newEnd = Math.max(last.startFrames + last.duration, seg.endFrames);
          last.duration = newEnd - last.startFrames;
        } else {
          mergedIntervals.push({ startFrames: seg.startFrames, duration: seg.duration });
        }
      }

      // Process intervals in reverse to shift downstream clips correctly
      for (let i = mergedIntervals.length - 1; i >= 0; i--) {
        const interval = mergedIntervals[i];
        result = result.map((c) => {
          if (c.trackId !== trackId) return c;
          const start = c.startFrames ?? 0;
          if (start >= interval.startFrames + interval.duration) {
            return {
              ...c,
              startFrames: Math.max(interval.startFrames, start - interval.duration),
            };
          }
          return c;
        });
      }
    }
  }

  return result;
}

/**
 * Computes a map of downstream clip displacement previews during interactive drag-and-drop
 * in auto-ripple mode.
 */
export function calculateRippleShiftPreview(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
  movingClipId: string | null,
  dropFrame: number,
  duration: number,
): Record<string, number> {
  const shifts: Record<string, number> = {};
  if (duration <= 0) return shifts;

  for (const clip of clips) {
    if (clip.trackId !== track.id || clip.id === movingClipId) continue;
    const start = clip.startFrames ?? 0;
    if (start >= dropFrame) {
      shifts[clip.id] = duration;
    }
  }

  return shifts;
}
