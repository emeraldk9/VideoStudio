import type { SequenceClip, SequenceTrack } from '../../types/sequence';

import {
  clipSpeed,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
} from './effects';
import { clipAtFrame, layoutTrack } from './layout';
import { trimClipEdge } from './edit-ops';

export interface ApplySpeedOptions {
  /** If true, adjusts clip durationFrames proportionally to speed so the whole segment plays, and ripples downstream clips on that track. */
  rippleSequence?: boolean;
}

/**
 * Calculates new durationFrames for a clip when changing playback speed.
 * Formula: newDuration = round(oldDuration * (oldSpeed / newSpeed))
 */
export function calculateSpeedDuration(
  currentDurationFrames: number,
  oldSpeed: number,
  newSpeed: number,
): number {
  const safeOld = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, oldSpeed));
  const safeNew = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, newSpeed));
  if (safeOld === safeNew) return currentDurationFrames;
  return Math.max(1, Math.round(currentDurationFrames * (safeOld / safeNew)));
}

/**
 * Applies a new playback speed to a clip, optionally rippling sequence duration on that track.
 */
export function applyClipSpeed(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  clipId: string,
  speed: number,
  options?: ApplySpeedOptions,
): SequenceClip[] {
  const targetClip = clips.find((c) => c.id === clipId);
  if (!targetClip) return clips;

  const clampedSpeed = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed));
  const oldSpeed = clipSpeed(targetClip.effects);
  const track = tracks.find((t) => t.id === targetClip.trackId);

  const ripple = options?.rippleSequence ?? false;
  if (!ripple) {
    return clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            effects: {
              ...c.effects,
              speed: clampedSpeed === 1 ? undefined : clampedSpeed,
            },
          }
        : c,
    );
  }

  const newDuration = calculateSpeedDuration(targetClip.durationFrames, oldSpeed, clampedSpeed);
  const delta = newDuration - targetClip.durationFrames;

  const updatedTarget: SequenceClip = {
    ...targetClip,
    durationFrames: newDuration,
    overrides: targetClip.overrides.includes('durationFrames')
      ? targetClip.overrides
      : [...targetClip.overrides, 'durationFrames'],
    effects: {
      ...targetClip.effects,
      speed: clampedSpeed === 1 ? undefined : clampedSpeed,
    },
  };

  if (!track || track.magnetic || delta === 0) {
    return clips.map((c) => (c.id === clipId ? updatedTarget : c));
  }

  // Free track: shift downstream clips on the same track by delta
  const placedTarget = layoutTrack(clips, track).find((p) => p.clip.id === clipId);
  const targetEnd = placedTarget ? placedTarget.endFrames : (targetClip.startFrames ?? 0) + targetClip.durationFrames;

  return clips.map((c) => {
    if (c.id === clipId) return updatedTarget;
    if (c.trackId === track.id) {
      const cStart = c.startFrames ?? 0;
      if (cStart >= targetEnd || c.orderIndex > targetClip.orderIndex) {
        return {
          ...c,
          startFrames: Math.max(0, cStart + delta),
        };
      }
    }
    return c;
  });
}

/**
 * Ripple trims the clip under the playhead to the playhead frame:
 * - 'head' (Q): Trims from clip start to playhead. Deletes delta frames, advances sourceIn,
 *   and shifts all downstream clips left by delta so no gap is introduced.
 * - 'tail' (W): Trims from playhead to clip end. Shortens duration, and shifts downstream
 *   clips left so no gap is introduced.
 */
export function rippleTrimToPlayhead(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  frame: number,
  side: 'head' | 'tail',
  selectedClipIds?: readonly string[],
): SequenceClip[] {
  const roundedFrame = Math.round(frame);
  const selected = new Set(selectedClipIds ?? []);

  // Find candidate placed clip
  let targetPlaced: { clip: SequenceClip; track: SequenceTrack; startFrames: number; endFrames: number } | null = null;

  for (const track of tracks) {
    if (track.locked) continue;
    const placed = clipAtFrame(layoutTrack(clips, track), roundedFrame);
    if (!placed) continue;
    if (selected.size > 0 && selected.has(placed.clip.id)) {
      targetPlaced = { ...placed, track };
      break;
    }
    if (!targetPlaced && selected.size === 0) {
      targetPlaced = { ...placed, track };
    }
  }

  if (!targetPlaced) return clips;

  const { clip, track, startFrames, endFrames } = targetPlaced;

  if (side === 'head') {
    const delta = roundedFrame - startFrames;
    if (delta <= 0 || delta >= clip.durationFrames) return clips;

    // Trimming the head:
    // 1. Clip's duration shrinks by delta, sourceInFrames increases by delta.
    const trimmed = trimClipEdge(clips, clip.id, 'start', delta);

    if (track.magnetic) {
      return trimmed;
    }

    // Free track: The trimmed clip keeps its original startFrames, and all subsequent clips shift left by delta
    return trimmed.map((c) => {
      if (c.trackId === track.id && (c.startFrames ?? 0) > startFrames) {
        return {
          ...c,
          startFrames: Math.max(0, (c.startFrames ?? 0) - delta),
        };
      }
      return c;
    });
  } else {
    const delta = roundedFrame - endFrames; // negative
    if (delta >= 0 || Math.abs(delta) >= clip.durationFrames) return clips;
    const framesRemoved = Math.abs(delta);

    // Trimming the tail:
    // 1. Clip's duration shrinks by framesRemoved.
    const trimmed = trimClipEdge(clips, clip.id, 'end', delta);

    if (track.magnetic) {
      return trimmed;
    }

    // Free track: All subsequent clips on this track shift left by framesRemoved
    return trimmed.map((c) => {
      if (c.trackId === track.id && (c.startFrames ?? 0) >= endFrames) {
        return {
          ...c,
          startFrames: Math.max(0, (c.startFrames ?? 0) - framesRemoved),
        };
      }
      return c;
    });
  }
}
