import type {
  ClipColorLabel,
  ClipEffects,
  CompoundClipSettings,
  Sequence,
  SequenceClip,
  SequenceDocument,
  SequenceTrack,
} from '../../types/sequence';
import { layoutTrack } from './layout';

export const DEFAULT_COMPOUND_COLOR_LABEL: ClipColorLabel = 'cyan';

/**
 * Checks whether a given clip acts as a compound clip container.
 */
export function isCompoundClip(clip: Pick<SequenceClip, 'sourceKind' | 'effects'>): boolean {
  return clip.sourceKind === 'compound' || Boolean(clip.effects?.compound);
}

/**
 * Retrieves the compound metadata from a clip, if present.
 */
export function getCompoundClipMetadata(clip: SequenceClip): CompoundClipSettings | null {
  return clip.effects?.compound ?? null;
}

export interface CreateCompoundClipOptions {
  id?: string;
  sequenceId: string;
  trackId: string;
  orderIndex?: number;
  startFrames: number | null;
  durationFrames: number;
  label?: string;
  compoundSettings: CompoundClipSettings;
  effects?: ClipEffects;
  colorLabel?: ClipColorLabel;
  mintId?: () => string;
}

/**
 * Creates a standalone Compound Clip container on a timeline track.
 */
export function createCompoundClip({
  id,
  sequenceId,
  trackId,
  orderIndex = 0,
  startFrames,
  durationFrames,
  label = 'Compound Clip',
  compoundSettings,
  effects,
  colorLabel = DEFAULT_COMPOUND_COLOR_LABEL,
  mintId = () => crypto.randomUUID(),
}: CreateCompoundClipOptions): SequenceClip {
  return {
    id: id ?? mintId(),
    sequenceId,
    trackId,
    orderIndex,
    sourceKind: 'compound',
    label,
    filePath: null,
    startFrames,
    durationFrames: Math.max(1, durationFrames),
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    colorLabel,
    overrides: ['label', 'durationFrames'],
    effects: {
      ...effects,
      compound: compoundSettings,
    },
  };
}

export interface PackCompoundClipParams {
  clips: SequenceClip[];
  tracks: readonly SequenceTrack[];
  targetClipIds: readonly string[];
  compoundName?: string;
  targetTrackId?: string;
  sequenceId: string;
  parentFps?: number;
  parentWidth?: number;
  parentHeight?: number;
  mintId?: () => string;
}

/**
 * Packages multiple selected clips across single or multiple tracks into a single
 * Compound Clip container and generates an independent nested SequenceDocument.
 */
export function packCompoundClip(params: PackCompoundClipParams): {
  updatedClips: SequenceClip[];
  compoundClip: SequenceClip;
  nestedDocument: SequenceDocument;
} {
  const {
    clips,
    tracks,
    targetClipIds,
    compoundName = 'Compound Clip',
    sequenceId,
    parentFps = 24,
    parentWidth = 1920,
    parentHeight = 1080,
    mintId = () => crypto.randomUUID(),
  } = params;

  if (targetClipIds.length === 0) {
    throw new Error('packCompoundClip requires at least one target clip ID');
  }

  const targetSet = new Set(targetClipIds);
  const targetedClips = clips.filter((c) => targetSet.has(c.id));
  if (targetedClips.length === 0) {
    throw new Error('None of the targeted clip IDs were found in sequence clips');
  }

  // Resolve absolute layout positions of all clips on their respective tracks
  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const clipPlacedBounds: Array<{ clip: SequenceClip; track: SequenceTrack; startFrames: number; endFrames: number }> = [];

  for (const clip of targetedClips) {
    const track = trackMap.get(clip.trackId);
    if (!track) continue;

    const placed = layoutTrack(clips, track).find((p) => p.clip.id === clip.id);
    const startFrames = placed ? placed.startFrames : (clip.startFrames ?? 0);
    const endFrames = startFrames + clip.durationFrames;
    clipPlacedBounds.push({ clip, track, startFrames, endFrames });
  }

  if (clipPlacedBounds.length === 0) {
    throw new Error('Failed to resolve placement bounds for targeted clips');
  }

  const earliestStartFrames = Math.min(...clipPlacedBounds.map((b) => b.startFrames));
  const latestEndFrames = Math.max(...clipPlacedBounds.map((b) => b.endFrames));
  const compoundDuration = Math.max(1, latestEndFrames - earliestStartFrames);

  // Determine container placement track:
  // Preference: explicitly passed targetTrackId > lowest orderIndex video track among targets > first target track
  let containerTrackId = params.targetTrackId;
  if (!containerTrackId) {
    const sortedTargets = [...clipPlacedBounds].sort((a, b) => {
      // Prioritize video tracks
      if (a.track.kind === 'video' && b.track.kind !== 'video') return -1;
      if (a.track.kind !== 'video' && b.track.kind === 'video') return 1;
      return a.track.orderIndex - b.track.orderIndex;
    });
    containerTrackId = sortedTargets[0].track.id;
  }
  const containerTrack = trackMap.get(containerTrackId) ?? clipPlacedBounds[0].track;

  const nestedSequenceId = mintId();

  // Clone unique tracks referenced by targeted clips for the nested sequence
  const referencedTrackIds = new Set(clipPlacedBounds.map((b) => b.track.id));
  const nestedTracks: SequenceTrack[] = tracks
    .filter((t) => referencedTrackIds.has(t.id))
    .map((t) => ({
      ...t,
      sequenceId: nestedSequenceId,
    }));

  // Re-anchor child clips relative to earliestStartFrames (frame 0 in nested sequence)
  const nestedClips: SequenceClip[] = clipPlacedBounds.map(({ clip, startFrames }) => ({
    ...clip,
    sequenceId: nestedSequenceId,
    startFrames: startFrames - earliestStartFrames,
  }));

  const nowIso = new Date().toISOString();
  const nestedSequence: Sequence = {
    id: nestedSequenceId,
    projectId: 'nested-project',
    name: compoundName,
    fps: parentFps,
    width: parentWidth,
    height: parentHeight,
    spineTrackId: containerTrack.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nestedDocument: SequenceDocument = {
    sequence: nestedSequence,
    tracks: nestedTracks,
    clips: nestedClips,
  };

  const compoundSettings: CompoundClipSettings = {
    nestedSequenceId,
    nestedSequenceName: compoundName,
    childClipCount: nestedClips.length,
    childTrackCount: nestedTracks.length,
    durationFrames: compoundDuration,
    nestedTracks,
    nestedClips,
  };

  const compoundClip = createCompoundClip({
    sequenceId,
    trackId: containerTrack.id,
    startFrames: containerTrack.magnetic ? null : earliestStartFrames,
    durationFrames: compoundDuration,
    label: compoundName,
    compoundSettings,
    mintId,
  });

  // Remove packaged clips from the parent timeline and insert the compound container
  const remainingClips = clips.filter((c) => !targetSet.has(c.id));
  const updatedClips = [...remainingClips, compoundClip];

  return {
    updatedClips,
    compoundClip,
    nestedDocument,
  };
}

export interface UnpackCompoundClipParams {
  clips: SequenceClip[];
  tracks: readonly SequenceTrack[];
  compoundClipId: string;
  mintId?: () => string;
}

/**
 * Decomposes a Compound Clip container in place, restoring its constituent child clips
 * and their exact relative timings back onto the parent timeline.
 */
export function unpackCompoundClip(params: UnpackCompoundClipParams): {
  updatedClips: SequenceClip[];
  unpackedClips: SequenceClip[];
} {
  const { clips, tracks, compoundClipId, mintId = () => crypto.randomUUID() } = params;

  const compoundClip = clips.find((c) => c.id === compoundClipId);
  if (!compoundClip || !isCompoundClip(compoundClip)) {
    throw new Error(`Clip ${compoundClipId} is not a valid compound clip`);
  }

  const meta = getCompoundClipMetadata(compoundClip);
  if (!meta || !meta.nestedClips || meta.nestedClips.length === 0) {
    throw new Error(`Compound clip ${compoundClipId} contains no nested clips to unpack`);
  }

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const containerTrack = trackMap.get(compoundClip.trackId);
  if (!containerTrack) {
    throw new Error(`Track ${compoundClip.trackId} for compound clip was not found`);
  }

  const placedContainer = layoutTrack(clips, containerTrack).find((p) => p.clip.id === compoundClip.id);
  const containerStartFrames = placedContainer ? placedContainer.startFrames : (compoundClip.startFrames ?? 0);

  // Re-anchor unpacked clips back to the parent timeline
  const unpackedClips: SequenceClip[] = (meta.nestedClips as SequenceClip[]).map((child) => ({
    ...child,
    id: mintId(), // Generate fresh unique IDs to avoid collisions
    sequenceId: compoundClip.sequenceId,
    startFrames: (child.startFrames ?? 0) + containerStartFrames,
  }));

  // Remove the compound container and add the unpacked constituent clips
  const remainingClips = clips.filter((c) => c.id !== compoundClipId);
  const updatedClips = [...remainingClips, ...unpackedClips];

  return {
    updatedClips,
    unpackedClips,
  };
}

/**
 * Resolves active child clips within a compound clip for a given timeline playhead frame.
 */
export function resolveActiveCompoundFrame(params: {
  compoundClip: SequenceClip;
  playheadFrame: number;
  clipStartFrames: number;
}): {
  nestedFrame: number;
  activeChildClips: SequenceClip[];
} {
  const { compoundClip, playheadFrame, clipStartFrames } = params;
  const meta = getCompoundClipMetadata(compoundClip);

  const nestedFrame = playheadFrame - clipStartFrames;
  if (!meta || !meta.nestedClips || nestedFrame < 0 || nestedFrame >= compoundClip.durationFrames) {
    return { nestedFrame, activeChildClips: [] };
  }

  const activeChildClips = (meta.nestedClips as SequenceClip[]).filter((child) => {
    const start = child.startFrames ?? 0;
    const end = start + child.durationFrames;
    return nestedFrame >= start && nestedFrame < end;
  });

  return { nestedFrame, activeChildClips };
}
