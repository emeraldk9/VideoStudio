import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';

/**
 * Checks whether a track has sync-lock active.
 * In industry-standard NLEs (Premiere, Resolve, Avid), sync lock is enabled by default
 * on all tracks unless explicitly toggled off by the user.
 */
export function isTrackSyncLocked(track: Pick<SequenceTrack, 'syncLocked'>): boolean {
  return track.syncLocked !== false;
}

export interface MultiTrackRippleParams {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  /** Cut or ripple origin point on the timeline (in sequence frames) */
  rippleFrame: number;
  /**
   * Delta in frames:
   * Negative (e.g. -24): Ripple deletion / gap closure -> downstream clips shift left.
   * Positive (e.g. +48): Insertion / gap opening / clip extension -> downstream clips shift right.
   */
  deltaFrames: number;
  /** Track ID where the primary edit was initiated */
  primaryTrackId?: string;
  /** If true, tracks with syncLocked === false are protected from downstream shifting (defaults to true) */
  respectSyncLock?: boolean;
  /** If true, clips on other sync-locked tracks that straddle the ripple window will be split */
  splitStraddling?: boolean;
  mintId?: () => string;
}

export interface MultiTrackRippleResult {
  updatedClips: SequenceClip[];
  affectedClipCount: number;
  affectedTrackCount: number;
  splitClips: SequenceClip[];
}

/**
 * Milestone S169 — Multi-Track Magnetic Ripple Engine.
 *
 * Propagates timeline duration changes (insertions, ripple trims, gap closures) across
 * all unlocked and sync-locked timeline tracks, guaranteeing that synced audio, B-roll,
 * adjustment layers, and subtitles remain in sample-accurate sync.
 */
export function applyMultiTrackMagneticRipple(params: MultiTrackRippleParams): MultiTrackRippleResult {
  const {
    clips,
    tracks,
    rippleFrame,
    deltaFrames,
    primaryTrackId,
    respectSyncLock = true,
    splitStraddling = false,
    mintId = () => crypto.randomUUID(),
  } = params;

  if (deltaFrames === 0) {
    return {
      updatedClips: [...clips],
      affectedClipCount: 0,
      affectedTrackCount: 0,
      splitClips: [],
    };
  }

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const affectedTrackIds = new Set<string>();
  const splitClips: SequenceClip[] = [];
  let affectedClipCount = 0;

  // Compute placed bounds for all clips
  const placedByTrack = new Map<string, Array<{ clip: SequenceClip; startFrames: number; endFrames: number }>>();
  for (const track of tracks) {
    const placed = layoutTrack(clips as SequenceClip[], track);
    placedByTrack.set(
      track.id,
      placed.map((p) => ({
        clip: p.clip,
        startFrames: p.startFrames,
        endFrames: p.endFrames,
      })),
    );
  }

  const updatedClips: SequenceClip[] = [];

  for (const clip of clips) {
    const track = trackMap.get(clip.trackId);
    if (!track) {
      updatedClips.push(clip);
      continue;
    }

    // Locked tracks are completely immune to edits and ripples
    if (track.locked) {
      updatedClips.push(clip);
      continue;
    }

    // If sync lock is respected and track is not sync-locked and not the primary track, leave untouched
    const isPrimary = primaryTrackId ? clip.trackId === primaryTrackId : false;
    if (respectSyncLock && !isTrackSyncLocked(track) && !isPrimary) {
      updatedClips.push(clip);
      continue;
    }

    // Magnetic tracks naturally pack sequentially; freeform tracks use explicit startFrames
    if (track.magnetic) {
      updatedClips.push(clip);
      continue;
    }

    const clipStart = clip.startFrames ?? 0;
    const clipEnd = clipStart + clip.durationFrames;

    // Case 1: Ripple deletion (deltaFrames < 0)
    if (deltaFrames < 0) {
      const deleteWindowStart = rippleFrame;
      const deleteWindowEnd = rippleFrame + Math.abs(deltaFrames);

      // Clip is entirely before the ripple deletion
      if (clipEnd <= deleteWindowStart) {
        updatedClips.push(clip);
        continue;
      }

      // Clip is strictly after the deleted window: shift left by |deltaFrames|
      if (clipStart >= deleteWindowEnd) {
        const newStart = Math.max(0, clipStart + deltaFrames);
        updatedClips.push({
          ...clip,
          startFrames: newStart,
        });
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // Clip is inside or straddles the deletion window
      if (splitStraddling && clipStart < deleteWindowStart && clipEnd > deleteWindowEnd) {
        // Straddles both ends: split into head and tail
        const headDuration = Math.max(1, deleteWindowStart - clipStart);
        const headClip: SequenceClip = {
          ...clip,
          durationFrames: headDuration,
        };

        const tailDuration = Math.max(1, clipEnd - deleteWindowEnd);
        const tailClip: SequenceClip = {
          ...clip,
          id: mintId(),
          startFrames: deleteWindowStart,
          durationFrames: tailDuration,
        };

        updatedClips.push(headClip, tailClip);
        splitClips.push(tailClip);
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // If clip begins before window and ends inside it: trim tail to window start
      if (clipStart < deleteWindowStart && clipEnd <= deleteWindowEnd) {
        const newDuration = Math.max(1, deleteWindowStart - clipStart);
        updatedClips.push({
          ...clip,
          durationFrames: newDuration,
        });
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // If clip begins inside window and extends past it: trim head and anchor at window start
      if (clipStart >= deleteWindowStart && clipStart < deleteWindowEnd && clipEnd > deleteWindowEnd) {
        const trimmedFromHead = deleteWindowEnd - clipStart;
        const newDuration = Math.max(1, clip.durationFrames - trimmedFromHead);
        updatedClips.push({
          ...clip,
          startFrames: deleteWindowStart,
          durationFrames: newDuration,
        });
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // If clip is completely contained within the deleted window, drop it (or leave it if not primary)
      if (isPrimary) {
        // Primary track deletes it completely
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      } else {
        // On synced tracks, collapse duration or drop if duration <= 0
        continue;
      }
    }

    // Case 2: Insertion / Gap Opening (deltaFrames > 0)
    if (deltaFrames > 0) {
      // Clip is strictly before the insertion point
      if (clipEnd <= rippleFrame) {
        updatedClips.push(clip);
        continue;
      }

      // Clip starts at or after the insertion point: shift right by deltaFrames
      if (clipStart >= rippleFrame) {
        updatedClips.push({
          ...clip,
          startFrames: clipStart + deltaFrames,
        });
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // Clip straddles the insertion point
      if (splitStraddling && clipStart < rippleFrame && clipEnd > rippleFrame) {
        const headDuration = Math.max(1, rippleFrame - clipStart);
        const headClip: SequenceClip = {
          ...clip,
          durationFrames: headDuration,
        };

        const tailDuration = Math.max(1, clipEnd - rippleFrame);
        const tailClip: SequenceClip = {
          ...clip,
          id: mintId(),
          startFrames: rippleFrame + deltaFrames,
          durationFrames: tailDuration,
        };

        updatedClips.push(headClip, tailClip);
        splitClips.push(tailClip);
        affectedClipCount++;
        affectedTrackIds.add(track.id);
        continue;
      }

      // If not splitting straddling clip, shift its end (extend duration) or keep as-is
      updatedClips.push(clip);
    }
  }

  return {
    updatedClips,
    affectedClipCount,
    affectedTrackCount: affectedTrackIds.size,
    splitClips,
  };
}

/**
 * Performs a synchronized ripple trim of a clip edge across the timeline.
 */
export function rippleTrimClipMultiTrack(params: {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  clipId: string;
  edge: 'head' | 'tail';
  deltaFrames: number;
  respectSyncLock?: boolean;
}): { updatedClips: SequenceClip[] } {
  const { clips, tracks, clipId, edge, deltaFrames, respectSyncLock = true } = params;
  if (deltaFrames === 0) return { updatedClips: [...clips] };

  const targetClip = clips.find((c) => c.id === clipId);
  if (!targetClip) return { updatedClips: [...clips] };

  const track = tracks.find((t) => t.id === targetClip.trackId);
  if (!track || track.locked) return { updatedClips: [...clips] };

  const start = targetClip.startFrames ?? 0;
  const currentDuration = targetClip.durationFrames;

  if (edge === 'tail') {
    // Trimming tail: newDuration = currentDuration + deltaFrames
    const newDuration = Math.max(1, currentDuration + deltaFrames);
    const actualDelta = newDuration - currentDuration;
    if (actualDelta === 0) return { updatedClips: [...clips] };

    const cutPoint = actualDelta < 0 ? start + newDuration : start + currentDuration;

    // First update the trimmed clip
    const patchedClips = clips.map((c) => (c.id === clipId ? { ...c, durationFrames: newDuration } : c));

    // Then apply multi-track ripple downstream of cutPoint
    const rippled = applyMultiTrackMagneticRipple({
      clips: patchedClips,
      tracks,
      rippleFrame: cutPoint,
      deltaFrames: actualDelta,
      primaryTrackId: targetClip.trackId,
      respectSyncLock,
    });

    return { updatedClips: rippled.updatedClips };
  } else {
    // Trimming head:
    // If deltaFrames > 0: shrinking clip by trimming its head.
    // The portion [start, start + deltaFrames) is excised from the timeline,
    // and the remainder of the clip plus downstream clips ripple left.
    if (deltaFrames > 0) {
      const trimAmount = Math.min(deltaFrames, currentDuration - 1);
      if (trimAmount <= 0) return { updatedClips: [...clips] };

      const rippled = applyMultiTrackMagneticRipple({
        clips,
        tracks,
        rippleFrame: start,
        deltaFrames: -trimAmount,
        primaryTrackId: targetClip.trackId,
        respectSyncLock,
      });

      return { updatedClips: rippled.updatedClips };
    } else {
      // deltaFrames < 0: extending clip head leftward
      const extendAmount = -deltaFrames;
      const rippled = applyMultiTrackMagneticRipple({
        clips,
        tracks,
        rippleFrame: start,
        deltaFrames: extendAmount,
        primaryTrackId: targetClip.trackId,
        respectSyncLock,
      });
      const updatedClips = rippled.updatedClips.map((c) => {
        if (c.id === clipId) {
          return {
            ...c,
            startFrames: Math.max(0, start - extendAmount),
            durationFrames: currentDuration + extendAmount,
          };
        }
        return c;
      });
      return { updatedClips };
    }
  }
}

/**
 * Closes all gaps on a timeline synchronously, ensuring sync-locked tracks
 * are shifted without introducing out-of-sync drift.
 */
export function closeGapsSynchronized(params: {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  primaryTrackId?: string;
  respectSyncLock?: boolean;
}): { updatedClips: SequenceClip[]; closedGapCount: number } {
  const { clips, tracks, primaryTrackId, respectSyncLock = true } = params;
  let currentClips = [...clips];
  let closedGapCount = 0;

  // Identify primary track or lowest order video track
  const primaryTrack =
    (primaryTrackId ? tracks.find((t) => t.id === primaryTrackId) : null) ??
    tracks.find((t) => t.kind === 'video' && !t.locked) ??
    tracks[0];

  if (!primaryTrack) return { updatedClips: currentClips, closedGapCount: 0 };

  const placed = layoutTrack(currentClips, primaryTrack);
  if (placed.length <= 1) return { updatedClips: currentClips, closedGapCount: 0 };

  // Traverse sorted clips from right to left to close gaps without disturbing earlier timings
  const sorted = [...placed].sort((a, b) => b.startFrames - a.startFrames);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const prev = sorted[i + 1];
    const gapSize = current.startFrames - prev.endFrames;

    if (gapSize > 0) {
      const ripple = applyMultiTrackMagneticRipple({
        clips: currentClips,
        tracks,
        rippleFrame: prev.endFrames,
        deltaFrames: -gapSize,
        primaryTrackId: primaryTrack.id,
        respectSyncLock,
      });

      currentClips = ripple.updatedClips;
      closedGapCount++;
    }
  }

  return { updatedClips: currentClips, closedGapCount };
}

/**
 * Milestone S66 — Bumper Collision Protection: Automatically snaps dragged clips to candidate
 * abutting start frames on non-magnetic tracks if they would otherwise cause a visual collision.
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
  const candidateStarts: number[] = [0];

  for (const item of placed) {
    candidateStarts.push(item.endFrames);
    candidateStarts.push(Math.max(0, item.startFrames - duration));
  }

  const validCandidates = candidateStarts.filter((candidate) => {
    const candidateEnd = candidate + duration;
    for (const item of placed) {
      if (candidate < item.endFrames && candidateEnd > item.startFrames) {
        return false;
      }
    }
    return true;
  });

  if (validCandidates.length === 0) {
    return { snappedStart: Math.max(0, proposedStart), bumped: false };
  }

  const hasCollision = placed.some(
    (item) => proposedStart < item.endFrames && proposedEnd > item.startFrames,
  );

  let bestCandidate = validCandidates[0];
  let minDiff = Math.abs(proposedStart - bestCandidate);

  for (let i = 1; i < validCandidates.length; i++) {
    const diff = Math.abs(proposedStart - validCandidates[i]);
    if (diff < minDiff) {
      minDiff = diff;
      bestCandidate = validCandidates[i];
    }
  }

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

  const deletedByTrack = new Map<string, SequenceClip[]>();
  for (const clip of clips) {
    if (deleteSet.has(clip.id)) {
      const list = deletedByTrack.get(clip.trackId) ?? [];
      list.push(clip);
      deletedByTrack.set(clip.trackId, list);
    }
  }

  let result = clips.filter((c) => !deleteSet.has(c.id));

  for (const [trackId, deletedClips] of deletedByTrack) {
    const track = trackMap.get(trackId);
    if (!track) continue;

    if (track.magnetic) {
      const trackClips = result
        .filter((c) => c.trackId !== trackId ? false : true)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c, idx) => ({ ...c, orderIndex: idx, startFrames: null }));

      result = [...result.filter((c) => c.trackId !== trackId), ...trackClips];
    } else {
      const placedDeleted = deletedClips
        .map((c) => ({
          startFrames: c.startFrames ?? 0,
          endFrames: (c.startFrames ?? 0) + c.durationFrames,
          duration: c.durationFrames,
        }))
        .sort((a, b) => a.startFrames - b.startFrames);

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

