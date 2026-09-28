/**
 * Milestone S192: Timeline Multi-Track Ripple Delete & Cross-Track Sync-Lock Engine
 *
 * Implements professional NLE In/Out Range Ripple Deletion, Sync-Lock Matrix evaluation,
 * Gap Analysis, and Gap Collapsing across multi-track storylines.
 *
 * Provides:
 * 1. Universal Range Ripple Delete (`executeRangeRippleDelete`):
 *    - Excises designated time intervals [inFrame, outFrame) across selected or all sync-locked tracks.
 *    - Automatically handles boundary straddling: split-and-splice, head truncation, and tail truncation.
 *    - Ripples all downstream clips on sync-locked tracks left by the exact duration removed.
 *    - Protects locked tracks (`track.locked === true`) from modifications or movement.
 *    - Preserves non-sync-locked tracks without accidental downstream drift.
 * 2. Connected Clip Storyline Preservation:
 *    - Coordinates with S188 Clip Anchoring Engine (`connected-clip-anchor-ops.ts`) to maintain
 *      frame-accurate parent-child sync during ripple shifts.
 *    - Resolves orphan policies if a parent clip is excised.
 * 3. Timeline Gap Analysis & Magnetism Collapsing:
 *    - Detects empty gaps on individual tracks (`findSyncLockTrackGaps`) or across all tracks (`findAllSyncLockGaps`).
 *    - Global visual blackout detector (`findGlobalVideoBlackoutGaps`).
 *    - Multi-track gap ripple collapse (`collapseTrackGaps`).
 *    - Automatic gap slug / filler generator (`fillTrackGaps`).
 * 4. Audit & Diagnostic Telemetry (`validateRippleRange`, `auditSyncLockIntegrity`).
 */

import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';
import { isTrackSyncLocked } from './magnetic-ripple-ops';
import {
  handleParentClipDeletion,
  resolveAnchoredClipPositions,
  isClipAnchored,
} from './connected-clip-anchor-ops';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

export interface SyncLockTimelineGap {
  trackId: string;
  trackKind: 'video' | 'audio';
  startFrames: number;
  endFrames: number;
  durationFrames: number;
  precedingClipId?: string;
  followingClipId?: string;
}

export type RippleOverlapPolicy = 'split_and_splice' | 'truncate' | 'lift';

export interface RangeRippleDeleteOptions {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  /** In point of the excision range (inclusive) in sequence frames */
  inFrame: number;
  /** Out point of the excision range (exclusive) in sequence frames */
  outFrame: number;
  /** Target track IDs where clips inside range are excised. If omitted, all sync-locked tracks are excised */
  targetTrackIds?: readonly string[];
  /** When true, tracks with syncLocked === false are immune to downstream rippling (default true) */
  respectSyncLock?: boolean;
  /** When true, tracks with locked === true are immune to edits or movement (default true) */
  respectTrackLock?: boolean;
  /** Overlap policy for clips crossing the in/out boundary (default 'split_and_splice') */
  overlapPolicy?: RippleOverlapPolicy;
  /** Propagate ripple shifts to connected anchored clips (default true) */
  propagateAnchoredClips?: boolean;
  /** Custom ID generator */
  mintId?: () => string;
}

export interface RangeRippleDeleteResult {
  updatedClips: SequenceClip[];
  deletedClipIds: string[];
  splitClipIds: string[];
  shiftedClipIds: string[];
  trimmedClipIds: string[];
  gapClosedFrames: number;
  affectedTrackCount: number;
  syncWarnings: string[];
}

export interface CollapseGapsOptions {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  /** Specific track to collapse, or undefined to collapse gaps across all sync-locked tracks */
  trackId?: string;
  /** Optional range filter */
  range?: { startFrames: number; endFrames: number };
  respectSyncLock?: boolean;
  respectTrackLock?: boolean;
  mintId?: () => string;
}

export interface CollapseGapsResult {
  updatedClips: SequenceClip[];
  collapsedGaps: SyncLockTimelineGap[];
  totalFramesRemoved: number;
  shiftedClipCount: number;
}

export interface FillGapsOptions {
  clips: readonly SequenceClip[];
  tracks: readonly SequenceTrack[];
  targetTrackId: string;
  fillerLabel?: string;
  fillerSourceMediaId?: string;
  mintId?: () => string;
}

export interface FillGapsResult {
  updatedClips: SequenceClip[];
  createdFillerClips: SequenceClip[];
  filledGapCount: number;
  totalFramesFilled: number;
}

export interface SyncLockIntegrityReport {
  isAligned: boolean;
  unalignedTracks: string[];
  driftWarnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks whether a track is locked against any modifications.
 */
export function isTrackLocked(track: Pick<SequenceTrack, 'locked'>): boolean {
  return Boolean(track.locked);
}

/**
 * Validates in/out ripple deletion frame range.
 */
export function validateRippleRange(
  inFrame: number,
  outFrame: number,
  maxAllowedFrames: number = 3600 * 60, // 1 hour max default
): { valid: boolean; error?: string } {
  if (!Number.isFinite(inFrame) || !Number.isFinite(outFrame)) {
    return { valid: false, error: 'In and Out points must be finite numbers' };
  }
  const inF = Math.round(inFrame);
  const outF = Math.round(outFrame);

  if (inF < 0) {
    return { valid: false, error: 'In point cannot be negative' };
  }
  if (outF <= inF) {
    return { valid: false, error: 'Out point must be strictly greater than In point' };
  }
  if (outF - inF > maxAllowedFrames) {
    return { valid: false, error: `Excision duration exceeds maximum allowed (${maxAllowedFrames} frames)` };
  }
  return { valid: true };
}

// ─── Gap Analysis ────────────────────────────────────────────────────────────

/**
 * Detects all empty gaps between placed clips on a specific track.
 * Note: Magnetic tracks are continuous by definition and return no gaps.
 *
 * @param clips Full list of sequence clips.
 * @param track Target track to scan.
 * @returns Array of SyncLockTimelineGap descriptors sorted chronologically.
 */
export function findSyncLockTrackGaps(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
): SyncLockTimelineGap[] {
  if (track.magnetic) {
    return [];
  }

  const placed = layoutTrack(clips as SequenceClip[], track);
  if (placed.length === 0) {
    return [];
  }

  const gaps: SyncLockTimelineGap[] = [];

  // Gap before first clip (from 0 to first clip's start)
  if (placed[0].startFrames > 0) {
    gaps.push({
      trackId: track.id,
      trackKind: track.kind,
      startFrames: 0,
      endFrames: placed[0].startFrames,
      durationFrames: placed[0].startFrames,
      followingClipId: placed[0].clip.id,
    });
  }

  // Gaps between consecutive clips
  for (let i = 0; i < placed.length - 1; i++) {
    const curEnd = placed[i].endFrames;
    const nextStart = placed[i + 1].startFrames;

    if (nextStart > curEnd) {
      gaps.push({
        trackId: track.id,
        trackKind: track.kind,
        startFrames: curEnd,
        endFrames: nextStart,
        durationFrames: nextStart - curEnd,
        precedingClipId: placed[i].clip.id,
        followingClipId: placed[i + 1].clip.id,
      });
    }
  }

  return gaps;
}

/**
 * Detects all empty gaps across all non-magnetic tracks in the sequence.
 */
export function findAllSyncLockGaps(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
): SyncLockTimelineGap[] {
  const allGaps: SyncLockTimelineGap[] = [];

  for (const track of tracks) {
    if (!track.magnetic) {
      const trackGaps = findSyncLockTrackGaps(clips, track);
      allGaps.push(...trackGaps);
    }
  }

  // Sort chronologically by startFrames, then trackId
  allGaps.sort((a, b) => a.startFrames - b.startFrames || a.trackId.localeCompare(b.trackId));
  return allGaps;
}

/**
 * Finds global video blackouts (spans where NO clip is present on ANY unlocked video track).
 */
export function findGlobalVideoBlackoutGaps(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
): { startFrames: number; endFrames: number; durationFrames: number }[] {
  const videoTracks = tracks.filter((t) => t.kind === 'video' && !t.locked);
  if (videoTracks.length === 0) return [];

  // Collect all occupied video intervals
  const intervals: { start: number; end: number }[] = [];
  for (const track of videoTracks) {
    const placed = layoutTrack(clips as SequenceClip[], track);
    for (const p of placed) {
      intervals.push({ start: p.startFrames, end: p.endFrames });
    }
  }

  if (intervals.length === 0) return [];

  // Sort and merge intervals
  intervals.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = intervals[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }

  // Gaps exist between merged intervals
  const globalGaps: { startFrames: number; endFrames: number; durationFrames: number }[] = [];
  if (merged[0].start > 0) {
    globalGaps.push({
      startFrames: 0,
      endFrames: merged[0].start,
      durationFrames: merged[0].start,
    });
  }

  for (let i = 0; i < merged.length - 1; i++) {
    const curEnd = merged[i].end;
    const nextStart = merged[i + 1].start;
    if (nextStart > curEnd) {
      globalGaps.push({
        startFrames: curEnd,
        endFrames: nextStart,
        durationFrames: nextStart - curEnd,
      });
    }
  }

  return globalGaps;
}

// ─── Range Ripple Deletion Engine ───────────────────────────────────────────

/**
 * Executes a sample-accurate In/Out range ripple delete across multi-track storylines.
 *
 * @param options Range ripple deletion parameters.
 * @returns Comprehensive result containing updated clips, split clips, deleted IDs, and sync warnings.
 */
export function executeRangeRippleDelete(
  options: RangeRippleDeleteOptions,
): RangeRippleDeleteResult {
  const {
    clips,
    tracks,
    inFrame,
    outFrame,
    targetTrackIds,
    respectSyncLock = true,
    respectTrackLock = true,
    overlapPolicy = 'split_and_splice',
    propagateAnchoredClips = true,
    mintId = () => crypto.randomUUID(),
  } = options;

  const validation = validateRippleRange(inFrame, outFrame);
  if (!validation.valid) {
    return {
      updatedClips: [...clips],
      deletedClipIds: [],
      splitClipIds: [],
      shiftedClipIds: [],
      trimmedClipIds: [],
      gapClosedFrames: 0,
      affectedTrackCount: 0,
      syncWarnings: [validation.error || 'Invalid ripple range'],
    };
  }

  const inF = Math.round(inFrame);
  const outF = Math.round(outFrame);
  const delta = outF - inF;

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const targetTrackSet = targetTrackIds && targetTrackIds.length > 0 ? new Set(targetTrackIds) : null;

  const deletedClipIds: string[] = [];
  const splitClipIds: string[] = [];
  const shiftedClipIds: string[] = [];
  const trimmedClipIds: string[] = [];
  const affectedTrackIds = new Set<string>();
  const syncWarnings: string[] = [];

  const intermediateClips: SequenceClip[] = [];

  // Process tracks individually
  for (const track of tracks) {
    const isLocked = respectTrackLock && isTrackLocked(track);
    const isSyncLocked = !respectSyncLock || isTrackSyncLocked(track);
    const isExcisionTarget = targetTrackSet ? targetTrackSet.has(track.id) : isSyncLocked;

    // Track locked: completely untouched
    if (isLocked) {
      const trackClips = clips.filter((c) => c.trackId === track.id);
      intermediateClips.push(...trackClips);
      continue;
    }

    const placed = layoutTrack(clips as SequenceClip[], track);

    // If magnetic track
    if (track.magnetic) {
      if (isExcisionTarget) {
        affectedTrackIds.add(track.id);
        for (const p of placed) {
          const c = p.clip;
          const s = p.startFrames;
          const e = p.endFrames;

          if (e <= inF) {
            // Before excision range: keep as is
            intermediateClips.push(c);
          } else if (s >= outF) {
            // After excision range: keep as is (magnetic track shifts automatically by duration reduction)
            intermediateClips.push(c);
            shiftedClipIds.push(c.id);
          } else if (s >= inF && e <= outF) {
            // Fully inside: delete
            deletedClipIds.push(c.id);
          } else if (s < inF && e <= outF) {
            // Straddles in-point: truncate tail
            const newDuration = inF - s;
            trimmedClipIds.push(c.id);
            intermediateClips.push({
              ...c,
              durationFrames: newDuration,
            });
          } else if (s >= inF && e > outF) {
            // Straddles out-point: truncate head
            const newDuration = e - outF;
            const cutFromHead = outF - s;
            trimmedClipIds.push(c.id);
            intermediateClips.push({
              ...c,
              durationFrames: newDuration,
              sourceInFrames: c.sourceInFrames != null ? c.sourceInFrames + cutFromHead : null,
            });
          } else if (s < inF && e > outF) {
            // Straddles entire range
            if (overlapPolicy === 'split_and_splice') {
              const headDuration = inF - s;
              const tailDuration = e - outF;
              const cutFromHead = outF - s;

              splitClipIds.push(c.id);
              // Head part
              intermediateClips.push({
                ...c,
                durationFrames: headDuration,
              });
              // Tail part
              const tailPartId = mintId();
              intermediateClips.push({
                ...c,
                id: tailPartId,
                durationFrames: tailDuration,
                sourceInFrames: c.sourceInFrames != null ? c.sourceInFrames + cutFromHead : null,
                orderIndex: c.orderIndex + 1,
              });
            } else {
              // Truncate to head
              trimmedClipIds.push(c.id);
              intermediateClips.push({
                ...c,
                durationFrames: inF - s,
              });
            }
          }
        }
      } else {
        // Not excision target on magnetic track
        intermediateClips.push(...clips.filter((c) => c.trackId === track.id));
      }
      continue;
    }

    // Free (non-magnetic) track
    for (const p of placed) {
      const c = p.clip;
      const s = p.startFrames;
      const e = p.endFrames;

      if (e <= inF) {
        // Fully upstream: completely untouched
        intermediateClips.push(c);
      } else if (s >= outF) {
        // Fully downstream:
        if (isSyncLocked) {
          // Sync-locked: shift left by delta
          affectedTrackIds.add(track.id);
          shiftedClipIds.push(c.id);
          intermediateClips.push({
            ...c,
            startFrames: Math.max(0, s - delta),
          });
        } else {
          // Free, non-sync-locked: stays put
          intermediateClips.push(c);
          syncWarnings.push(
            `Track "${track.name || track.id}" is not sync-locked; clip "${c.id}" was not shifted.`,
          );
        }
      } else if (isExcisionTarget) {
        // Overlaps with excision range on an excision target track
        affectedTrackIds.add(track.id);

        if (s >= inF && e <= outF) {
          // Fully inside range: delete
          deletedClipIds.push(c.id);
        } else if (s < inF && e <= outF) {
          // Straddles in-point: truncate tail
          trimmedClipIds.push(c.id);
          const newDuration = inF - s;
          intermediateClips.push({
            ...c,
            durationFrames: newDuration,
          });
        } else if (s >= inF && e > outF) {
          // Straddles out-point: truncate head and shift left to inF
          trimmedClipIds.push(c.id);
          const newDuration = e - outF;
          const trimmedFrames = outF - s;
          intermediateClips.push({
            ...c,
            startFrames: inF,
            durationFrames: newDuration,
            sourceInFrames: c.sourceInFrames != null ? c.sourceInFrames + trimmedFrames : null,
          });
          shiftedClipIds.push(c.id);
        } else if (s < inF && e > outF) {
          // Straddles both in and out boundaries
          if (overlapPolicy === 'split_and_splice') {
            splitClipIds.push(c.id);
            const headDuration = inF - s;
            const tailDuration = e - outF;

            // Head part stays at original startFrames
            intermediateClips.push({
              ...c,
              durationFrames: headDuration,
            });

            // Tail part starts at inF (seamlessly butted to head!)
            const tailPartId = mintId();
            intermediateClips.push({
              ...c,
              id: tailPartId,
              startFrames: inF,
              durationFrames: tailDuration,
              sourceInFrames: c.sourceInFrames != null ? c.sourceInFrames + (outF - s) : null,
            });
            shiftedClipIds.push(tailPartId);
          } else {
            // Truncate to head only
            trimmedClipIds.push(c.id);
            intermediateClips.push({
              ...c,
              durationFrames: inF - s,
            });
          }
        }
      } else {
        // Overlaps with range, but track is NOT an excision target
        if (isSyncLocked) {
          // Sync-locked track that wasn't target:
          affectedTrackIds.add(track.id);
          if (s >= outF) {
            shiftedClipIds.push(c.id);
            intermediateClips.push({
              ...c,
              startFrames: Math.max(0, s - delta),
            });
          } else if (s < inF && e > outF) {
            // Straddles excision range: split and splice
            splitClipIds.push(c.id);
            const headDuration = inF - s;
            const tailDuration = e - outF;

            intermediateClips.push({
              ...c,
              durationFrames: headDuration,
            });

            const tailId = mintId();
            intermediateClips.push({
              ...c,
              id: tailId,
              startFrames: inF,
              durationFrames: tailDuration,
              sourceInFrames: c.sourceInFrames != null ? c.sourceInFrames + (outF - s) : null,
            });
            shiftedClipIds.push(tailId);
          } else if (s < inF && e > inF) {
            // Truncate tail
            trimmedClipIds.push(c.id);
            intermediateClips.push({
              ...c,
              durationFrames: inF - s,
            });
          } else if (s >= inF && s < outF) {
            // Clip started inside excision range: shift left
            intermediateClips.push({
              ...c,
              startFrames: inF,
            });
            shiftedClipIds.push(c.id);
          } else {
            intermediateClips.push(c);
          }
        } else {
          // Non-sync-locked track: left completely as is
          intermediateClips.push(c);
        }
      }
    }
  }

  // Handle Connected / Anchored Clips
  let finalClips = intermediateClips;
  if (propagateAnchoredClips) {
    // 1. Resolve deleted parent clips
    if (deletedClipIds.length > 0) {
      const orphanResult = handleParentClipDeletion({
        clips: finalClips,
        deletedClipIds,
        fallbackPolicy: 'keep_absolute',
      });
      finalClips = orphanResult.updatedClips;
    }

    // 2. Resolve anchored positions for shifted parents
    if (shiftedClipIds.length > 0) {
      const anchoredResult = resolveAnchoredClipPositions({
        clips: finalClips,
        tracks,
        movedParentClipIds: shiftedClipIds,
      });
      finalClips = anchoredResult.updatedClips;
    }
  }

  // Ensure unique orderIndex per track
  const byTrack = new Map<string, SequenceClip[]>();
  for (const c of finalClips) {
    if (!byTrack.has(c.trackId)) byTrack.set(c.trackId, []);
    byTrack.get(c.trackId)!.push(c);
  }

  const normalizedClips: SequenceClip[] = [];
  for (const [trackId, trClips] of byTrack.entries()) {
    const track = trackMap.get(trackId);
    if (track?.magnetic) {
      trClips.sort((a, b) => a.orderIndex - b.orderIndex);
    } else {
      trClips.sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));
    }
    trClips.forEach((c, idx) => {
      normalizedClips.push({
        ...c,
        orderIndex: idx,
      });
    });
  }

  return {
    updatedClips: normalizedClips,
    deletedClipIds,
    splitClipIds,
    shiftedClipIds,
    trimmedClipIds,
    gapClosedFrames: delta,
    affectedTrackCount: affectedTrackIds.size,
    syncWarnings,
  };
}

// ─── Multi-Track Gap Collapse ────────────────────────────────────────────────

/**
 * Collapses empty gaps on designated or all tracks by executing sequential ripple deletions.
 */
export function collapseTrackGaps(options: CollapseGapsOptions): CollapseGapsResult {
  const {
    clips,
    tracks,
    trackId,
    range,
    respectSyncLock = true,
    respectTrackLock = true,
    mintId = () => crypto.randomUUID(),
  } = options;

  let currentClips = [...clips];
  const targetTracks = trackId
    ? tracks.filter((t) => t.id === trackId)
    : tracks.filter((t) => !t.magnetic && (!respectTrackLock || !t.locked));

  const allDetectedGaps: SyncLockTimelineGap[] = [];
  for (const t of targetTracks) {
    const gaps = findSyncLockTrackGaps(currentClips, t);
    allDetectedGaps.push(...gaps);
  }

  // Filter by range if specified
  const filteredGaps = range
    ? allDetectedGaps.filter((g) => g.startFrames >= range.startFrames && g.endFrames <= range.endFrames)
    : allDetectedGaps;

  if (filteredGaps.length === 0) {
    return {
      updatedClips: currentClips,
      collapsedGaps: [],
      totalFramesRemoved: 0,
      shiftedClipCount: 0,
    };
  }

  // Sort gaps descending from timeline end to head so shifts do not invalidate earlier gap coordinates
  filteredGaps.sort((a, b) => b.startFrames - a.startFrames);

  let totalFramesRemoved = 0;
  const shiftedIds = new Set<string>();

  for (const gap of filteredGaps) {
    const rippleRes = executeRangeRippleDelete({
      clips: currentClips,
      tracks,
      inFrame: gap.startFrames,
      outFrame: gap.endFrames,
      targetTrackIds: trackId ? [trackId] : undefined,
      respectSyncLock,
      respectTrackLock,
      mintId,
    });

    currentClips = rippleRes.updatedClips;
    totalFramesRemoved += rippleRes.gapClosedFrames;
    rippleRes.shiftedClipIds.forEach((id) => shiftedIds.add(id));
  }

  return {
    updatedClips: currentClips,
    collapsedGaps: filteredGaps,
    totalFramesRemoved,
    shiftedClipCount: shiftedIds.size,
  };
}

// ─── Gap Filler Generator ────────────────────────────────────────────────────

/**
 * Automatically creates filler / slug clips inside empty gaps on a target track.
 */
export function fillTrackGaps(options: FillGapsOptions): FillGapsResult {
  const {
    clips,
    tracks,
    targetTrackId,
    fillerLabel = 'Gap Filler',
    fillerSourceMediaId = 'gap-filler-slug',
    mintId = () => crypto.randomUUID(),
  } = options;

  const track = tracks.find((t) => t.id === targetTrackId);
  if (!track || track.magnetic) {
    return {
      updatedClips: [...clips],
      createdFillerClips: [],
      filledGapCount: 0,
      totalFramesFilled: 0,
    };
  }

  const gaps = findSyncLockTrackGaps(clips, track);
  if (gaps.length === 0) {
    return {
      updatedClips: [...clips],
      createdFillerClips: [],
      filledGapCount: 0,
      totalFramesFilled: 0,
    };
  }

  const createdFillerClips: SequenceClip[] = [];
  let totalFramesFilled = 0;

  for (const gap of gaps) {
    const fillerClip: SequenceClip = {
      id: mintId(),
      sequenceId: track.sequenceId,
      trackId: targetTrackId,
      label: fillerLabel,
      overrides: [],
      sourceKind: track.kind === 'video' ? 'still' : 'audio',
      filePath: null,
      startFrames: gap.startFrames,
      durationFrames: gap.durationFrames,
      sourceInFrames: null,
      sourceOutFrames: null,
      orderIndex: 0, // normalized later
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    };

    createdFillerClips.push(fillerClip);
    totalFramesFilled += gap.durationFrames;
  }

  const updatedClips = [...clips, ...createdFillerClips];

  // Re-sort and normalize orderIndex
  const trackClips = updatedClips
    .filter((c) => c.trackId === targetTrackId)
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  trackClips.forEach((c, idx) => {
    c.orderIndex = idx;
  });

  return {
    updatedClips,
    createdFillerClips,
    filledGapCount: gaps.length,
    totalFramesFilled,
  };
}

// ─── Sync Lock Audit & Diagnostics ──────────────────────────────────────────

/**
 * Audits timeline sync lock integrity, detecting any unintended drift or alignment issues.
 */
export function auditSyncLockIntegrity(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
): SyncLockIntegrityReport {
  const unalignedTracks: string[] = [];
  const driftWarnings: string[] = [];

  const videoTracks = tracks.filter((t) => t.kind === 'video');
  const audioTracks = tracks.filter((t) => t.kind === 'audio');

  // Check sync-lock status parity
  const nonSyncVideo = videoTracks.filter((t) => !isTrackSyncLocked(t) && !t.locked);
  const syncAudio = audioTracks.filter((t) => isTrackSyncLocked(t) && !t.locked);
  const nonSyncAudio = audioTracks.filter((t) => !isTrackSyncLocked(t) && !t.locked);
  const syncVideo = videoTracks.filter((t) => isTrackSyncLocked(t) && !t.locked);

  if (nonSyncVideo.length > 0 && syncAudio.length > 0) {
    driftWarnings.push(
      `Disparate Sync Lock state: ${nonSyncVideo.length} video tracks have sync lock disabled while ${syncAudio.length} audio tracks are sync locked. Ripple edits may cause audio/video drift.`,
    );
  }
  if (nonSyncAudio.length > 0 && syncVideo.length > 0) {
    driftWarnings.push(
      `Disparate Sync Lock state: ${nonSyncAudio.length} audio tracks have sync lock disabled while ${syncVideo.length} video tracks are sync locked. Ripple edits may cause audio/video drift.`,
    );
  }

  // Check for orphan anchored clips
  const clipIdSet = new Set(clips.map((c) => c.id));
  for (const clip of clips) {
    if (isClipAnchored(clip)) {
      const parentId = clip.effects?.anchor?.parentClipId;
      if (parentId && !clipIdSet.has(parentId)) {
        unalignedTracks.push(clip.trackId);
        driftWarnings.push(`Clip "${clip.id}" is anchored to missing parent "${parentId}".`);
      }
    }
  }

  return {
    isAligned: unalignedTracks.length === 0 && driftWarnings.length === 0,
    unalignedTracks: Array.from(new Set(unalignedTracks)),
    driftWarnings,
  };
}
