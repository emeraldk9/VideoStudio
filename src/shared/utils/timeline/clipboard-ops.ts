import type {
  SequenceClip,
  SequenceTrack,
  TrackKind,
} from '../../types/sequence';
import { layoutTrack, type PlacedClip } from './layout';
import { rippleDelete, splitClipAtFrame } from './edit-ops';

export interface TimelineClipboardItem {
  clip: SequenceClip;
  relativeStartFrames: number;
  trackKind: TrackKind;
  trackOrderIndex: number;
  sourceTrackId: string;
}

export interface TimelineClipboardPayload {
  items: TimelineClipboardItem[];
  totalDurationFrames: number;
  minStartFrames: number;
  maxEndFrames: number;
}

/**
 * Creates a structured timeline clipboard payload from selected clips.
 * Preserves relative timing between clips and their track kinds.
 */
export function createTimelineClipboard(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  selectedIds: readonly string[],
): TimelineClipboardPayload | null {
  if (!selectedIds || selectedIds.length === 0) return null;

  const selectedSet = new Set(selectedIds);
  const trackMap = new Map<string, SequenceTrack>(tracks.map((t) => [t.id, t]));

  // Find placed positions for all selected clips
  const selectedPlaced: { placed: PlacedClip; track: SequenceTrack }[] = [];

  for (const track of tracks) {
    const placedList = layoutTrack(clips as SequenceClip[], track);
    for (const placed of placedList) {
      if (selectedSet.has(placed.clip.id)) {
        selectedPlaced.push({ placed, track });
      }
    }
  }

  if (selectedPlaced.length === 0) return null;

  const minStartFrames = Math.min(...selectedPlaced.map((sp) => sp.placed.startFrames));
  const maxEndFrames = Math.max(...selectedPlaced.map((sp) => sp.placed.endFrames));
  const totalDurationFrames = Math.max(1, maxEndFrames - minStartFrames);

  const items: TimelineClipboardItem[] = selectedPlaced
    .sort((a, b) => a.placed.startFrames - b.placed.startFrames)
    .map(({ placed, track }) => ({
      clip: { ...placed.clip },
      relativeStartFrames: Math.max(0, placed.startFrames - minStartFrames),
      trackKind: track.kind,
      trackOrderIndex: track.orderIndex,
      sourceTrackId: track.id,
    }));

  return {
    items,
    totalDurationFrames,
    minStartFrames,
    maxEndFrames,
  };
}

/**
 * Cuts selected clips to clipboard.
 * If ripple is true, closes the gap by shifting downstream clips on affected tracks left.
 */
export function executeCutClips(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  selectedIds: readonly string[],
  ripple: boolean,
): { nextClips: SequenceClip[]; clipboard: TimelineClipboardPayload | null } {
  const clipboard = createTimelineClipboard(clips, tracks, selectedIds);
  if (!clipboard) {
    return { nextClips: clips as SequenceClip[], clipboard: null };
  }

  if (ripple) {
    const nextClips = rippleDelete(clips as SequenceClip[], tracks, selectedIds);
    return { nextClips, clipboard };
  }

  const selectedSet = new Set(selectedIds);
  const nextClips = clips.filter((c) => !selectedSet.has(c.id));
  return { nextClips, clipboard };
}

export interface PasteOptions {
  ripple?: boolean;
  targetTrackId?: string;
  mintId?: () => string;
}

/**
 * Pastes clipboard items at the playhead position.
 * - Standard Overwrite Paste (ripple = false): places clips at playhead on target tracks.
 * - Ripple Insert Paste (ripple = true): splits clips across playhead and shifts downstream media forward.
 */
export function executePasteClips(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  clipboard: TimelineClipboardPayload,
  playheadFrame: number,
  options: PasteOptions = {},
): { nextClips: SequenceClip[]; pastedClips: SequenceClip[] } {
  const {
    ripple = false,
    targetTrackId,
    mintId = () => crypto.randomUUID(),
  } = options;

  if (!clipboard.items || clipboard.items.length === 0) {
    return { nextClips: clips as SequenceClip[], pastedClips: [] };
  }

  const targetPlayhead = Math.max(0, Math.round(playheadFrame));
  const trackMap = new Map<string, SequenceTrack>(tracks.map((t) => [t.id, t]));

  // Resolve track routing:
  // If targetTrackId is provided, the primary clipboard track maps to it.
  const primaryItem = clipboard.items[0];
  const primarySourceTrack = trackMap.get(primaryItem.sourceTrackId);
  const userTargetTrack = targetTrackId ? trackMap.get(targetTrackId) : undefined;

  const resolveTargetTrack = (item: TimelineClipboardItem): SequenceTrack => {
    // If user explicitly picked a track and item matches its kind, route primary item there
    if (userTargetTrack && item.sourceTrackId === primaryItem.sourceTrackId) {
      if (userTargetTrack.kind === item.trackKind && !userTargetTrack.locked) {
        return userTargetTrack;
      }
    }

    // Try keeping original track if unlocked
    const orig = trackMap.get(item.sourceTrackId);
    if (orig && !orig.locked) return orig;

    // Find first unlocked track of same kind
    const fallback = tracks.find((t) => t.kind === item.trackKind && !t.locked);
    if (fallback) return fallback;

    // Default to track 0 or first track
    return tracks[0];
  };

  let workingClips = [...clips];
  const affectedTrackIds = new Set<string>();

  for (const item of clipboard.items) {
    const track = resolveTargetTrack(item);
    if (track && !track.locked) {
      affectedTrackIds.add(track.id);
    }
  }

  // --- RIPPLE INSERT: Split at playhead & ripple downstream clips forward ---
  if (ripple && affectedTrackIds.size > 0) {
    const splitMap = new Map<string, SequenceClip[]>();

    // 1. Split clips crossing playhead on affected tracks
    for (const trackId of affectedTrackIds) {
      const track = trackMap.get(trackId);
      if (!track || track.locked) continue;

      const placedList = layoutTrack(workingClips, track);
      for (const placed of placedList) {
        if (targetPlayhead > placed.startFrames && targetPlayhead < placed.endFrames) {
          const next = splitClipAtFrame(workingClips, track, targetPlayhead, mintId());
          if (next) {
            workingClips = next;
            break;
          }
        }
      }
    }

    // 2. Ripple downstream clips forward on affected tracks (or all unlocked tracks)
    const shift = clipboard.totalDurationFrames;
    workingClips = workingClips.map((clip) => {
      if (!affectedTrackIds.has(clip.trackId)) return clip;
      const track = trackMap.get(clip.trackId);
      if (!track || track.locked || track.magnetic) return clip;

      const start = clip.startFrames ?? 0;
      if (start >= targetPlayhead) {
        return {
          ...clip,
          startFrames: start + shift,
        };
      }
      return clip;
    });
  }

  // --- INSERT PASTED CLIPS ---
  const pastedClips: SequenceClip[] = [];

  for (let i = 0; i < clipboard.items.length; i++) {
    const item = clipboard.items[i];
    const track = resolveTargetTrack(item);
    const startFrames = track.magnetic
      ? null
      : targetPlayhead + item.relativeStartFrames;

    const newClip: SequenceClip = {
      ...item.clip,
      id: mintId(),
      trackId: track.id,
      orderIndex: track.magnetic
        ? workingClips.filter((c) => c.trackId === track.id).length
        : item.clip.orderIndex,
      startFrames,
      durationFrames: item.clip.durationFrames,
    };

    pastedClips.push(newClip);
  }

  workingClips.push(...pastedClips);

  return {
    nextClips: workingClips,
    pastedClips,
  };
}

/**
 * 3-Point Assembly: Lift (ripple=false) or Extract (ripple=true) work area.
 * Splits clips across in/out points on unlocked tracks, extracts them to clipboard,
 * and ripples downstream timeline if ripple is true.
 */
export function executeLiftOrExtractWorkArea(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  inFrame: number,
  outFrame: number,
  ripple: boolean,
  mintId: () => string = () => crypto.randomUUID(),
): { nextClips: SequenceClip[]; clipboard: TimelineClipboardPayload | null } {
  const start = Math.min(inFrame, outFrame);
  const end = Math.max(inFrame, outFrame);
  const rangeDuration = Math.max(1, end - start);

  let current = [...clips];
  const unlockedTracks = tracks.filter((t) => !t.locked);

  // 1. Split clips crossing start point on unlocked tracks
  for (const track of unlockedTracks) {
    const placed = layoutTrack(current, track);
    for (const p of placed) {
      if (start > p.startFrames && start < p.endFrames) {
        const next = splitClipAtFrame(current, track, start, mintId());
        if (next) current = next;
        break;
      }
    }
  }

  // 2. Split clips crossing end point on unlocked tracks
  for (const track of unlockedTracks) {
    const placed = layoutTrack(current, track);
    for (const p of placed) {
      if (end > p.startFrames && end < p.endFrames) {
        const next = splitClipAtFrame(current, track, end, mintId());
        if (next) current = next;
        break;
      }
    }
  }

  // 3. Find all clips residing inside [start, end]
  const insideClipIds: string[] = [];
  for (const track of unlockedTracks) {
    const placed = layoutTrack(current, track);
    for (const p of placed) {
      if (p.startFrames >= start && p.endFrames <= end) {
        insideClipIds.push(p.clip.id);
      }
    }
  }

  if (insideClipIds.length === 0) {
    return { nextClips: current, clipboard: null };
  }

  // 4. Create clipboard payload
  const clipboard = createTimelineClipboard(current, tracks, insideClipIds);

  // 5. Remove clips inside range
  const insideSet = new Set(insideClipIds);
  let kept = current.filter((c) => !insideSet.has(c.id));

  // 6. Ripple downstream if Extract
  if (ripple) {
    kept = kept.map((clip) => {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.locked || track.magnetic) return clip;
      const clipStart = clip.startFrames ?? 0;
      if (clipStart >= end) {
        return {
          ...clip,
          startFrames: Math.max(0, clipStart - rangeDuration),
        };
      }
      return clip;
    });
  }

  return {
    nextClips: kept,
    clipboard,
  };
}
