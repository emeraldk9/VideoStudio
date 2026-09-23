import type {
  SequenceClip,
  SequenceMarker,
  SequenceTrack,
} from '../../types/sequence';
import { layoutTrack } from './layout';
import { trimClipEdge } from './edit-ops';

export type SnapTargetType =
  | 'clip_head'
  | 'clip_tail'
  | 'playhead'
  | 'marker'
  | 'in_point'
  | 'out_point'
  | 'sequence_end';

export interface SnapTargetEntry {
  frame: number;
  type: SnapTargetType;
  label: string;
}

export interface SnapMetaResult {
  snappedFrame: number;
  didSnap: boolean;
  target?: SnapTargetEntry;
}

/**
 * Builds an enriched list of snap targets with semantic metadata and labels for HUD feedback.
 */
export function buildSnapTargetsWithMeta(input: {
  tracks: readonly SequenceTrack[];
  clips: readonly SequenceClip[];
  markers?: readonly SequenceMarker[];
  playheadFrame?: number | null;
  inPointFrame?: number | null;
  outPointFrame?: number | null;
  sequenceEndFrame?: number;
}): SnapTargetEntry[] {
  const {
    tracks,
    clips,
    markers = [],
    playheadFrame = null,
    inPointFrame = null,
    outPointFrame = null,
    sequenceEndFrame = 0,
  } = input;

  const entries: SnapTargetEntry[] = [];
  const seen = new Set<string>();

  const addEntry = (frame: number, type: SnapTargetType, label: string) => {
    const rounded = Math.max(0, Math.round(frame));
    const key = `${rounded}:${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ frame: rounded, type, label });
    }
  };

  // 1. Clip boundaries across all tracks
  for (const track of tracks) {
    const placedList = layoutTrack(clips as SequenceClip[], track);
    for (const placed of placedList) {
      const clipName = placed.clip.label || 'Clip';
      addEntry(placed.startFrames, 'clip_head', `${clipName} In`);
      addEntry(placed.endFrames, 'clip_tail', `${clipName} Out`);
    }
  }

  // 2. Timeline Markers
  for (const marker of markers) {
    const name = marker.name ? `Marker: ${marker.name}` : 'Marker';
    addEntry(marker.frame, 'marker', name);
  }

  // 3. Work Area In and Out points
  if (inPointFrame !== null) {
    addEntry(inPointFrame, 'in_point', 'In Point');
  }
  if (outPointFrame !== null) {
    addEntry(outPointFrame, 'out_point', 'Out Point');
  }

  // 4. Playhead Position
  if (playheadFrame !== null) {
    addEntry(playheadFrame, 'playhead', 'Playhead');
  }

  // 5. Sequence End
  if (sequenceEndFrame > 0) {
    addEntry(sequenceEndFrame, 'sequence_end', 'Sequence End');
  }

  return entries.sort((a, b) => a.frame - b.frame);
}

/**
 * Snaps a target frame to the nearest snap target entry within tolerance, returning metadata.
 */
export function snapFrameWithMeta(
  frame: number,
  targets: readonly SnapTargetEntry[],
  toleranceFrames: number,
): SnapMetaResult {
  let bestTarget: SnapTargetEntry | undefined = undefined;
  let bestDistance = toleranceFrames;

  for (const target of targets) {
    const distance = Math.abs(target.frame - frame);
    if (distance <= bestDistance) {
      bestTarget = target;
      bestDistance = distance;
    }
  }

  if (bestTarget) {
    return {
      snappedFrame: bestTarget.frame,
      didSnap: true,
      target: bestTarget,
    };
  }

  return {
    snappedFrame: frame,
    didSnap: false,
  };
}

/**
 * Finds abutting outgoing and incoming clips sharing an edit junction at `junctionFrame`.
 */
export function findJunctionAtFrame(
  clips: readonly SequenceClip[],
  track: SequenceTrack,
  frame: number,
  toleranceFrames = 1,
): { outgoing: SequenceClip; incoming: SequenceClip } | null {
  const placedList = layoutTrack(clips as SequenceClip[], track);

  let outgoing: SequenceClip | null = null;
  let incoming: SequenceClip | null = null;

  for (const placed of placedList) {
    if (Math.abs(placed.endFrames - frame) <= toleranceFrames) {
      outgoing = placed.clip;
    }
    if (Math.abs(placed.startFrames - frame) <= toleranceFrames) {
      incoming = placed.clip;
    }
  }

  if (outgoing && incoming && outgoing.id !== incoming.id) {
    return { outgoing, incoming };
  }

  return null;
}

/**
 * Rolling Edit (N): Trims the junction between two adjacent clips simultaneously.
 * The outgoing clip's tail and incoming clip's head adjust by inverse deltas.
 * Total timeline duration is strictly preserved.
 */
export function executeRollingEdit(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  junctionFrame: number,
  deltaFrames: number,
  trackId?: string,
): SequenceClip[] {
  const delta = Math.round(deltaFrames);
  if (delta === 0) return clips as SequenceClip[];

  // Find candidate tracks
  const targetTracks = trackId
    ? tracks.filter((t) => t.id === trackId && !t.locked)
    : tracks.filter((t) => !t.locked);

  let current = [...clips];
  let appliedAny = false;

  for (const track of targetTracks) {
    const junction = findJunctionAtFrame(current, track, junctionFrame);
    if (!junction) continue;

    const { outgoing, incoming } = junction;

    // Outgoing clip min duration 1
    const maxOutgoingDelta = outgoing.durationFrames - 1;
    // Incoming clip min duration 1
    const maxIncomingDelta = incoming.durationFrames - 1;

    // Positive delta extends outgoing, shrinks incoming
    // Negative delta shrinks outgoing, extends incoming
    const clampedDelta = Math.max(-maxOutgoingDelta, Math.min(delta, maxIncomingDelta));
    if (clampedDelta === 0) continue;

    // Adjust outgoing clip duration
    const newOutgoingDuration = outgoing.durationFrames + clampedDelta;

    // Adjust incoming clip
    const isVideoOrAudio = incoming.sourceKind === 'video' || incoming.sourceKind === 'audio';
    const hasSourceIn = incoming.sourceInFrames !== null && incoming.sourceInFrames !== undefined;
    const newIncomingSourceIn = hasSourceIn && isVideoOrAudio
      ? Math.max(0, (incoming.sourceInFrames ?? 0) + clampedDelta)
      : incoming.sourceInFrames;

    const newIncomingDuration = Math.max(1, incoming.durationFrames - clampedDelta);
    const newIncomingStart = track.magnetic
      ? null
      : (incoming.startFrames ?? 0) + clampedDelta;

    current = current.map((clip) => {
      if (clip.id === outgoing.id) {
        return {
          ...clip,
          durationFrames: newOutgoingDuration,
        };
      }
      if (clip.id === incoming.id) {
        return {
          ...clip,
          sourceInFrames: newIncomingSourceIn,
          startFrames: newIncomingStart,
          durationFrames: newIncomingDuration,
        };
      }
      return clip;
    });

    appliedAny = true;
  }

  return appliedAny ? current : (clips as SequenceClip[]);
}

/**
 * Ripple Trim (B): Trims a clip's head or tail and ripples downstream clips by the change.
 */
export function executeRippleTrim(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  clipId: string,
  edge: 'start' | 'end',
  deltaFrames: number,
): SequenceClip[] {
  const targetClip = clips.find((c) => c.id === clipId);
  if (!targetClip) return clips as SequenceClip[];

  const track = tracks.find((t) => t.id === targetClip.trackId);
  if (!track || track.locked) return clips as SequenceClip[];

  const oldDuration = targetClip.durationFrames;
  const oldStart = targetClip.startFrames ?? 0;
  const oldEnd = oldStart + oldDuration;

  // Perform base clip edge trim
  const trimmedClips = trimClipEdge(clips as SequenceClip[], clipId, edge, deltaFrames);
  const updatedClip = trimmedClips.find((c) => c.id === clipId);
  if (!updatedClip) return clips as SequenceClip[];

  const durationDelta = updatedClip.durationFrames - oldDuration;
  if (durationDelta === 0) return trimmedClips;

  // On magnetic tracks, layoutTrack derives starts automatically
  if (track.magnetic) return trimmedClips;

  // Downstream clips on this track slide by durationDelta
  return trimmedClips.map((clip) => {
    if (clip.trackId !== track.id || clip.id === clipId) return clip;
    const start = clip.startFrames ?? 0;
    if (start >= oldEnd) {
      return {
        ...clip,
        startFrames: Math.max(0, start + durationDelta),
      };
    }
    return clip;
  });
}
