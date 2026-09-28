/**
 * Milestone S188: Timeline Magnetic Connected Clips & Clip Anchoring Engine
 *
 * Implements parent-child relational anchoring for secondary storylines (B-roll,
 * lower-third titles, audio stems, and adjustment layers) pinned to primary spine clips.
 *
 * Provides:
 * - Topological DAG dependency validation and cycle detection
 * - Frame-accurate lockstep position propagation during parent trims, moves, and ripples
 * - Multi-level transitive child cascading (grandchildren)
 * - Configurable orphan resolution policies (keep_absolute, delete, reanchor_nearest)
 * - Visual connection stem & anchor pin coordinate generation for timeline rendering
 */

import type { SequenceClip, SequenceTrack } from '../../types/sequence';

export type AnchorPoint = 'start' | 'end' | 'midpoint';
export type OrphanPolicy = 'keep_absolute' | 'delete' | 'reanchor_nearest';

export interface ClipAnchorSettings {
  enabled: boolean;
  parentClipId: string;
  /** Relative offset in frames: (child start frame) - (parent anchor frame) */
  offsetFrames: number;
  /** Which reference point of the parent the child is anchored to (default 'start') */
  anchorPoint?: AnchorPoint;
  /** How to handle this child if the parent clip is deleted (default 'keep_absolute') */
  orphanPolicy?: OrphanPolicy;
}

export interface AnchorHierarchyValidation {
  valid: boolean;
  cycles: string[][];
  orphanClipIds: string[];
  depths: Record<string, number>;
}

export interface AnchorVisualStem {
  childClipId: string;
  parentClipId: string;
  anchorFrame: number;
  childStartFrame: number;
  childTrackId: string;
  parentTrackId: string;
  offsetFrames: number;
  anchorPoint: AnchorPoint;
}

export interface ResolveAnchoredPositionsParams {
  clips: readonly SequenceClip[];
  tracks?: readonly SequenceTrack[];
  /** Optional specific parent clips that moved, or omits to evaluate all anchored clips */
  movedParentClipIds?: readonly string[];
  /** Optional per-parent delta shifts in frames */
  deltaFramesMap?: Record<string, number>;
}

export interface ResolveAnchoredPositionsResult {
  updatedClips: SequenceClip[];
  shiftedCount: number;
  shiftedClipIds: string[];
}

export interface HandleParentDeletionParams {
  clips: readonly SequenceClip[];
  deletedClipIds: readonly string[];
  fallbackPolicy?: OrphanPolicy;
}

export interface HandleParentDeletionResult {
  updatedClips: SequenceClip[];
  deletedChildIds: string[];
  detachedChildIds: string[];
  reanchoredChildIds: string[];
}

/**
 * Returns true if a clip has an active parent anchor connection.
 */
export function isClipAnchored(clip: SequenceClip): boolean {
  return Boolean(clip.effects?.anchor?.enabled && clip.effects.anchor.parentClipId);
}

/**
 * Gets the parent clip ID for an anchored clip, or null if unanchored.
 */
export function getClipAnchorParentId(clip: SequenceClip): string | null {
  if (!isClipAnchored(clip)) return null;
  return clip.effects?.anchor?.parentClipId ?? null;
}

/**
 * Resolves the effective absolute start frame for a clip, taking into account
 * magnetic spine tracks if startFrames is undefined or null.
 */
export function resolveClipAbsoluteStart(
  clip: SequenceClip,
  allClips: readonly SequenceClip[] = []
): number {
  if (typeof clip.startFrames === 'number') {
    return clip.startFrames;
  }
  // If magnetic track, compute from cumulative duration of preceding clips
  const trackClips = allClips
    .filter((c) => c.trackId === clip.trackId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  
  let currentStart = 0;
  for (const c of trackClips) {
    if (c.id === clip.id) {
      return currentStart;
    }
    currentStart += c.durationFrames;
  }
  return 0;
}

/**
 * Calculates the reference frame of a parent clip for a given anchor point.
 */
export function calculateAnchorPointFrame(
  parentClip: SequenceClip,
  anchorPoint: AnchorPoint = 'start',
  allClips: readonly SequenceClip[] = []
): number {
  const start = resolveClipAbsoluteStart(parentClip, allClips);
  switch (anchorPoint) {
    case 'end':
      return start + parentClip.durationFrames;
    case 'midpoint':
      return start + Math.floor(parentClip.durationFrames / 2);
    case 'start':
    default:
      return start;
  }
}

/**
 * Anchors a child clip to a parent clip, calculating the frame offset.
 */
export function anchorClipToParent(params: {
  childClip: SequenceClip;
  parentClip: SequenceClip;
  allClips?: readonly SequenceClip[];
  anchorPoint?: AnchorPoint;
  orphanPolicy?: OrphanPolicy;
}): SequenceClip {
  const {
    childClip,
    parentClip,
    allClips = [],
    anchorPoint = 'start',
    orphanPolicy = 'keep_absolute',
  } = params;

  if (childClip.id === parentClip.id) {
    throw new Error(`Cannot anchor clip "${childClip.id}" to itself.`);
  }

  const childStart = resolveClipAbsoluteStart(childClip, allClips);
  const parentAnchorFrame = calculateAnchorPointFrame(parentClip, anchorPoint, allClips);
  const offsetFrames = childStart - parentAnchorFrame;

  const currentAnchor = childClip.effects?.anchor;
  const newAnchorSettings: ClipAnchorSettings = {
    enabled: true,
    parentClipId: parentClip.id,
    offsetFrames,
    anchorPoint,
    orphanPolicy: currentAnchor?.orphanPolicy ?? orphanPolicy,
  };

  return {
    ...childClip,
    effects: {
      ...childClip.effects,
      anchor: newAnchorSettings,
    },
  };
}

/**
 * Detaches an anchor from a child clip, maintaining its current absolute timeline position.
 */
export function detachClipAnchor(
  childClip: SequenceClip,
  allClips: readonly SequenceClip[] = []
): SequenceClip {
  const absoluteStart = resolveClipAbsoluteStart(childClip, allClips);
  const currentEffects = childClip.effects ?? {};

  const { anchor: _removed, ...remainingEffects } = currentEffects;

  return {
    ...childClip,
    startFrames: absoluteStart,
    effects: Object.keys(remainingEffects).length > 0 ? remainingEffects : undefined,
  };
}

/**
 * Validates the anchor hierarchy across all clips:
 * - Detects missing parents (orphans)
 * - Detects circular dependency chains (cycles) using DFS
 * - Computes topological nesting depth per clip
 */
export function validateAnchorHierarchy(
  clips: readonly SequenceClip[]
): AnchorHierarchyValidation {
  const clipMap = new Map<string, SequenceClip>();
  for (const c of clips) {
    clipMap.set(c.id, c);
  }

  const orphanClipIds: string[] = [];
  const adj = new Map<string, string[]>(); // parent -> children

  for (const clip of clips) {
    if (isClipAnchored(clip)) {
      const parentId = clip.effects!.anchor!.parentClipId;
      if (!clipMap.has(parentId)) {
        orphanClipIds.push(clip.id);
      } else {
        const children = adj.get(parentId) ?? [];
        children.push(clip.id);
        adj.set(parentId, children);
      }
    }
  }

  // Cycle detection via DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];
  const currentPath: string[] = [];

  function dfs(clipId: string) {
    visited.add(clipId);
    inStack.add(clipId);
    currentPath.push(clipId);

    const children = adj.get(clipId) ?? [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        dfs(childId);
      } else if (inStack.has(childId)) {
        // Found a cycle
        const cycleStartIndex = currentPath.indexOf(childId);
        if (cycleStartIndex !== -1) {
          cycles.push([...currentPath.slice(cycleStartIndex), childId]);
        }
      }
    }

    currentPath.pop();
    inStack.delete(clipId);
  }

  for (const clip of clips) {
    if (!visited.has(clip.id)) {
      dfs(clip.id);
    }
  }

  // Calculate depths (0 = root/unanchored)
  const depths: Record<string, number> = {};
  for (const clip of clips) {
    let depth = 0;
    let curr: SequenceClip | undefined = clip;
    const seenInChain = new Set<string>();

    while (curr && isClipAnchored(curr)) {
      seenInChain.add(curr.id);
      const pId = curr.effects!.anchor!.parentClipId;
      if (seenInChain.has(pId)) {
        // Cycle encountered, avoid infinite loop
        break;
      }
      curr = clipMap.get(pId);
      if (curr) {
        depth++;
      }
    }
    depths[clip.id] = depth;
  }

  return {
    valid: cycles.length === 0 && orphanClipIds.length === 0,
    cycles,
    orphanClipIds,
    depths,
  };
}

/**
 * Returns all direct and indirect descendant clips anchored to a given parent.
 */
export function getAnchoredDescendantIds(
  parentClipId: string,
  clips: readonly SequenceClip[]
): string[] {
  const directChildren = clips.filter(
    (c) => isClipAnchored(c) && c.effects!.anchor!.parentClipId === parentClipId
  );
  const result: string[] = [];

  for (const child of directChildren) {
    result.push(child.id);
    result.push(...getAnchoredDescendantIds(child.id, clips));
  }

  return Array.from(new Set(result));
}

/**
 * Recalculates the absolute timeline positions of anchored clips
 * when parent clips move, are trimmed, or ripple.
 */
export function resolveAnchoredClipPositions(
  params: ResolveAnchoredPositionsParams
): ResolveAnchoredPositionsResult {
  const { clips, deltaFramesMap = {} } = params;

  const clipMap = new Map<string, SequenceClip>();
  for (const c of clips) {
    clipMap.set(c.id, { ...c });
  }

  // Validate hierarchy and get depths for topological processing
  const validation = validateAnchorHierarchy(clips);

  // Sort clips by depth ascending (parents processed before children)
  const sortedClips = [...clips].sort((a, b) => {
    const depthA = validation.depths[a.id] ?? 0;
    const depthB = validation.depths[b.id] ?? 0;
    return depthA - depthB;
  });

  const shiftedClipIds: string[] = [];

  for (const clip of sortedClips) {
    if (!isClipAnchored(clip)) {
      // If an unanchored clip has an explicit delta shift, apply it
      const delta = deltaFramesMap[clip.id];
      if (delta && delta !== 0 && typeof clip.startFrames === 'number') {
        const nextStart = Math.max(0, clip.startFrames + delta);
        if (nextStart !== clip.startFrames) {
          const updated = { ...clipMap.get(clip.id)!, startFrames: nextStart };
          clipMap.set(clip.id, updated);
          shiftedClipIds.push(clip.id);
        }
      }
      continue;
    }

    const anchor = clip.effects!.anchor!;
    const parent = clipMap.get(anchor.parentClipId);
    if (!parent) continue; // Orphaned clip skipped

    const parentAnchorFrame = calculateAnchorPointFrame(
      parent,
      anchor.anchorPoint ?? 'start',
      Array.from(clipMap.values())
    );

    const targetStartFrame = Math.max(0, parentAnchorFrame + anchor.offsetFrames);
    const currentStartFrame = resolveClipAbsoluteStart(clip, Array.from(clipMap.values()));

    if (targetStartFrame !== currentStartFrame) {
      const updated = {
        ...clipMap.get(clip.id)!,
        startFrames: targetStartFrame,
      };
      clipMap.set(clip.id, updated);
      shiftedClipIds.push(clip.id);
    }
  }

  const updatedClips = Array.from(clipMap.values());
  return {
    updatedClips,
    shiftedCount: shiftedClipIds.length,
    shiftedClipIds,
  };
}

/**
 * Handles resolution of anchored children when parent clips are deleted.
 */
export function handleParentClipDeletion(
  params: HandleParentDeletionParams
): HandleParentDeletionResult {
  const { clips, deletedClipIds, fallbackPolicy = 'keep_absolute' } = params;
  const deletedSet = new Set(deletedClipIds);

  const deletedChildIds: string[] = [];
  const detachedChildIds: string[] = [];
  const reanchoredChildIds: string[] = [];

  const remainingClips = clips.filter((c) => !deletedSet.has(c.id));
  const clipMap = new Map<string, SequenceClip>();
  for (const c of remainingClips) {
    clipMap.set(c.id, { ...c });
  }

  for (const clip of remainingClips) {
    if (!isClipAnchored(clip)) continue;

    const parentId = clip.effects!.anchor!.parentClipId;
    if (!deletedSet.has(parentId)) continue;

    const policy = clip.effects!.anchor!.orphanPolicy ?? fallbackPolicy;

    if (policy === 'delete') {
      deletedChildIds.push(clip.id);
      clipMap.delete(clip.id);
    } else if (policy === 'reanchor_nearest') {
      // Find candidate parent on the same track as the deleted parent
      const deletedParent = clips.find((c) => c.id === parentId);
      const childStart = resolveClipAbsoluteStart(clip, clips);

      let nearestCandidate: SequenceClip | null = null;
      let minDistance = Infinity;

      if (deletedParent) {
        const trackCandidates = remainingClips.filter(
          (c) => c.trackId === deletedParent.trackId && c.id !== clip.id
        );
        for (const candidate of trackCandidates) {
          const candStart = resolveClipAbsoluteStart(candidate, remainingClips);
          const dist = Math.abs(childStart - candStart);
          if (dist < minDistance) {
            minDistance = dist;
            nearestCandidate = candidate;
          }
        }
      }

      if (nearestCandidate) {
        const reanchored = anchorClipToParent({
          childClip: clip,
          parentClip: nearestCandidate,
          allClips: remainingClips,
          anchorPoint: clip.effects!.anchor!.anchorPoint ?? 'start',
          orphanPolicy: policy,
        });
        clipMap.set(clip.id, reanchored);
        reanchoredChildIds.push(clip.id);
      } else {
        // Fallback to detach if no candidate exists
        const detached = detachClipAnchor(clip, remainingClips);
        clipMap.set(clip.id, detached);
        detachedChildIds.push(clip.id);
      }
    } else {
      // 'keep_absolute'
      const detached = detachClipAnchor(clip, remainingClips);
      clipMap.set(clip.id, detached);
      detachedChildIds.push(clip.id);
    }
  }

  return {
    updatedClips: Array.from(clipMap.values()),
    deletedChildIds,
    detachedChildIds,
    reanchoredChildIds,
  };
}

/**
 * Generates visual stem alignment coordinates for rendering SVG connection
 * lines and anchor pins in the timeline track lanes.
 */
export function generateAnchorVisualStems(
  clips: readonly SequenceClip[],
  _tracks: readonly SequenceTrack[] = []
): AnchorVisualStem[] {
  const clipMap = new Map<string, SequenceClip>();
  for (const c of clips) {
    clipMap.set(c.id, c);
  }

  const stems: AnchorVisualStem[] = [];

  for (const clip of clips) {
    if (!isClipAnchored(clip)) continue;

    const anchor = clip.effects!.anchor!;
    const parent = clipMap.get(anchor.parentClipId);
    if (!parent) continue;

    const anchorPoint = anchor.anchorPoint ?? 'start';
    const anchorFrame = calculateAnchorPointFrame(parent, anchorPoint, clips);
    const childStartFrame = resolveClipAbsoluteStart(clip, clips);

    stems.push({
      childClipId: clip.id,
      parentClipId: parent.id,
      anchorFrame,
      childStartFrame,
      childTrackId: clip.trackId,
      parentTrackId: parent.trackId,
      offsetFrames: anchor.offsetFrames,
      anchorPoint,
    });
  }

  return stems;
}
