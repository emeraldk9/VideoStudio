/**
 * Milestone S190: Timeline Smart Magnetic Alignment Guides & Multi-Point Snap Matrix
 *
 * Implements advanced professional NLE snapping physics:
 * - Multi-target priority weighting matrix (Playhead > In/Out > Clip Edges > Beats > Markers)
 * - Multi-point bounding alignment (snaps lead edge, center midpoint, and tail edge)
 * - Velocity-adaptive dynamic hysteresis (prevents sticky jitter during fast scrubs)
 * - Multi-clip selection bounding box cluster snapping
 * - Visual magnetic alignment guide lines with semantic color codes and HUD badges
 */

import type { SequenceClip, SequenceMarker, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';
import type { SnapTargetEntry, SnapTargetType } from './trim-tools-ops';

export type ClipAlignmentEdge = 'head' | 'midpoint' | 'tail';

export const SNAP_PRIORITY_WEIGHTS: Record<SnapTargetType, number> = {
  playhead: 1.0,
  in_point: 0.95,
  out_point: 0.95,
  clip_head: 0.9,
  clip_tail: 0.9,
  downbeat: 0.85,
  scene_cut: 0.8,
  beat: 0.75,
  marker: 0.7,
  sequence_end: 0.65,
};

export const SNAP_TARGET_COLORS: Record<SnapTargetType, { hex: string; bgClass: string; textClass: string }> = {
  playhead: { hex: '#06b6d4', bgClass: 'bg-cyan-500/20 border-cyan-500/50', textClass: 'text-cyan-400' },
  in_point: { hex: '#f59e0b', bgClass: 'bg-amber-500/20 border-amber-500/50', textClass: 'text-amber-400' },
  out_point: { hex: '#f59e0b', bgClass: 'bg-amber-500/20 border-amber-500/50', textClass: 'text-amber-400' },
  clip_head: { hex: '#ffffff', bgClass: 'bg-white/20 border-white/50', textClass: 'text-white' },
  clip_tail: { hex: '#ffffff', bgClass: 'bg-white/20 border-white/50', textClass: 'text-white' },
  downbeat: { hex: '#ec4899', bgClass: 'bg-pink-500/20 border-pink-500/50', textClass: 'text-pink-400' },
  scene_cut: { hex: '#3b82f6', bgClass: 'bg-blue-500/20 border-blue-500/50', textClass: 'text-blue-400' },
  beat: { hex: '#84cc16', bgClass: 'bg-lime-500/20 border-lime-500/50', textClass: 'text-lime-400' },
  marker: { hex: '#a855f7', bgClass: 'bg-purple-500/20 border-purple-500/50', textClass: 'text-purple-400' },
  sequence_end: { hex: '#94a3b8', bgClass: 'bg-slate-500/20 border-slate-500/50', textClass: 'text-slate-400' },
};

export interface TimelineSnapGuide {
  frame: number;
  type: SnapTargetType;
  label: string;
  alignmentEdge: ClipAlignmentEdge;
  hexColor: string;
  bgClass: string;
  textClass: string;
  sourceTrackId?: string;
}

export interface MultiPointSnapParams {
  /** Proposed head start frame of the dragging clip / selection */
  candidateStartFrame: number;
  /** Duration in frames of the dragging clip / bounding box */
  durationFrames: number;
  /** All available snap targets */
  targets: readonly SnapTargetEntry[];
  /** Maximum allowable snap tolerance in frames */
  toleranceFrames: number;
  /** If false, bypasses snapping completely */
  snapEnabled?: boolean;
  /** If true, tests center midpoint in addition to head and tail */
  enableMidpointSnap?: boolean;
  /** Optional custom priority weight overrides */
  priorityWeights?: Partial<Record<SnapTargetType, number>>;
  /** IDs of clips being dragged (to exclude self-edges from targets) */
  ignoreClipIds?: readonly string[];
}

export interface MultiPointSnapResult {
  /** Resulting snapped start frame (equal to candidateStartFrame if no snap) */
  snappedStartFrame: number;
  /** Frame delta to apply: (snappedStartFrame - candidateStartFrame) */
  deltaFrames: number;
  /** True if magnetic lock was engaged */
  didSnap: boolean;
  /** Which edge of the clip aligned to the target ('head', 'midpoint', 'tail') */
  alignmentEdge?: ClipAlignmentEdge;
  /** The specific environmental target that was snapped to */
  matchedTarget?: SnapTargetEntry;
  /** Visual guide information for rendering vertical HUD alignment line */
  activeGuide?: TimelineSnapGuide;
}

export interface BoundingBoxCluster {
  startFrames: number;
  durationFrames: number;
  endFrames: number;
}

/**
 * Calculates velocity-adaptive frame tolerance.
 * High-velocity drags reduce tolerance to eliminate sticky jitter across dense cuts.
 * Precision slow drags expand tolerance for effortless magnetic latching.
 */
export function calculateDynamicSnapTolerance(params: {
  velocityPxPerSec: number;
  baseTolerancePx?: number; // default 6px
  pixelsPerSecond: number;
  fps: number;
  minTolerancePx?: number; // default 2px
  maxTolerancePx?: number; // default 12px
}): { tolerancePx: number; toleranceFrames: number } {
  const {
    velocityPxPerSec,
    baseTolerancePx = 6,
    pixelsPerSecond,
    fps,
    minTolerancePx = 2,
    maxTolerancePx = 12,
  } = params;

  const speed = Math.abs(velocityPxPerSec);

  // Normalization: 0 px/s -> maxTolerance, 300 px/s -> baseTolerance, >600 px/s -> minTolerance
  let tolerancePx = baseTolerancePx;
  if (speed < 100) {
    const factor = 1 - speed / 100;
    tolerancePx = baseTolerancePx + factor * (maxTolerancePx - baseTolerancePx);
  } else if (speed > 250) {
    const factor = Math.min(1, (speed - 250) / 400);
    tolerancePx = baseTolerancePx - factor * (baseTolerancePx - minTolerancePx);
  }

  tolerancePx = Math.max(minTolerancePx, Math.min(maxTolerancePx, tolerancePx));

  const pxPerFrame = Math.max(0.0001, pixelsPerSecond / fps);
  const toleranceFrames = Math.max(1, Math.round(tolerancePx / pxPerFrame));

  return {
    tolerancePx: Number(tolerancePx.toFixed(1)),
    toleranceFrames,
  };
}

/**
 * Calculates the bounding box cluster for multiple selected clips.
 */
export function calculateSelectionBoundingBox(
  clips: readonly SequenceClip[]
): BoundingBoxCluster | null {
  if (clips.length === 0) return null;

  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const clip of clips) {
    const start = typeof clip.startFrames === 'number' ? clip.startFrames : 0;
    const end = start + clip.durationFrames;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }

  if (minStart === Infinity || maxEnd === -Infinity) return null;

  return {
    startFrames: minStart,
    durationFrames: maxEnd - minStart,
    endFrames: maxEnd,
  };
}

/**
 * Evaluates candidate clip bounds (head, midpoint, tail) against all snap targets,
 * returning the highest-weighted magnetic lock.
 */
export function calculateMultiPointSnap(params: MultiPointSnapParams): MultiPointSnapResult {
  const {
    candidateStartFrame,
    durationFrames,
    targets,
    toleranceFrames,
    snapEnabled = true,
    enableMidpointSnap = true,
    priorityWeights = {},
  } = params;

  if (!snapEnabled || targets.length === 0 || toleranceFrames <= 0) {
    return {
      snappedStartFrame: candidateStartFrame,
      deltaFrames: 0,
      didSnap: false,
    };
  }

  const effectiveWeights: Record<SnapTargetType, number> = {
    ...SNAP_PRIORITY_WEIGHTS,
    ...priorityWeights,
  };

  const candidateHead = candidateStartFrame;
  const candidateMidpoint = candidateStartFrame + Math.floor(durationFrames / 2);
  const candidateTail = candidateStartFrame + durationFrames;

  let bestScore = -Infinity;
  let bestDelta = 0;
  let bestTarget: SnapTargetEntry | undefined = undefined;
  let bestEdge: ClipAlignmentEdge | undefined = undefined;

  for (const target of targets) {
    const weight = effectiveWeights[target.type] ?? 0.5;

    // 1. Test Head edge alignment
    const headDistance = Math.abs(candidateHead - target.frame);
    if (headDistance <= toleranceFrames) {
      // Score balances proximity (inverse distance) and target priority
      const proximityScore = (1 - headDistance / (toleranceFrames + 1));
      const score = proximityScore * weight * 1.0; // Head gets slight preference
      if (score > bestScore) {
        bestScore = score;
        bestDelta = target.frame - candidateHead;
        bestTarget = target;
        bestEdge = 'head';
      }
    }

    // 2. Test Tail edge alignment
    const tailDistance = Math.abs(candidateTail - target.frame);
    if (tailDistance <= toleranceFrames) {
      const proximityScore = (1 - tailDistance / (toleranceFrames + 1));
      const score = proximityScore * weight * 0.95;
      if (score > bestScore) {
        bestScore = score;
        bestDelta = target.frame - candidateTail;
        bestTarget = target;
        bestEdge = 'tail';
      }
    }

    // 3. Test Midpoint alignment (optional, lower preference)
    if (enableMidpointSnap) {
      const midDistance = Math.abs(candidateMidpoint - target.frame);
      if (midDistance <= toleranceFrames) {
        const proximityScore = (1 - midDistance / (toleranceFrames + 1));
        const score = proximityScore * weight * 0.75; // Midpoint lower priority than edges
        if (score > bestScore) {
          bestScore = score;
          bestDelta = target.frame - candidateMidpoint;
          bestTarget = target;
          bestEdge = 'midpoint';
        }
      }
    }
  }

  if (bestTarget && bestEdge) {
    const snappedStartFrame = Math.max(0, candidateStartFrame + bestDelta);
    const colorMeta = SNAP_TARGET_COLORS[bestTarget.type] ?? SNAP_TARGET_COLORS.marker;

    const activeGuide: TimelineSnapGuide = {
      frame: bestTarget.frame,
      type: bestTarget.type,
      label: `${bestTarget.label} (${bestEdge})`,
      alignmentEdge: bestEdge,
      hexColor: colorMeta.hex,
      bgClass: colorMeta.bgClass,
      textClass: colorMeta.textClass,
    };

    return {
      snappedStartFrame,
      deltaFrames: snappedStartFrame - candidateStartFrame,
      didSnap: true,
      alignmentEdge: bestEdge,
      matchedTarget: bestTarget,
      activeGuide,
    };
  }

  return {
    snappedStartFrame: candidateStartFrame,
    deltaFrames: 0,
    didSnap: false,
  };
}

/**
 * Builds an aggregated list of snap targets including track boundaries, markers,
 * playhead, and in/out points, while excluding self clips.
 */
export function buildTimelineSnapMatrix(input: {
  tracks: readonly SequenceTrack[];
  clips: readonly SequenceClip[];
  markers?: readonly SequenceMarker[];
  playheadFrame?: number | null;
  inPointFrame?: number | null;
  outPointFrame?: number | null;
  sequenceEndFrame?: number;
  ignoreClipIds?: readonly string[];
}): SnapTargetEntry[] {
  const {
    tracks,
    clips,
    markers = [],
    playheadFrame = null,
    inPointFrame = null,
    outPointFrame = null,
    sequenceEndFrame = 0,
    ignoreClipIds = [],
  } = input;

  const ignoreSet = new Set(ignoreClipIds);
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

  // 1. Playhead (Highest Priority)
  if (playheadFrame !== null && playheadFrame >= 0) {
    addEntry(playheadFrame, 'playhead', 'Playhead');
  }

  // 2. In / Out points
  if (inPointFrame !== null && inPointFrame >= 0) {
    addEntry(inPointFrame, 'in_point', 'In Point');
  }
  if (outPointFrame !== null && outPointFrame >= 0) {
    addEntry(outPointFrame, 'out_point', 'Out Point');
  }

  // 3. Clip boundaries (excluding ignored/dragged clips)
  for (const track of tracks) {
    const placedList = layoutTrack(clips as SequenceClip[], track);
    for (const placed of placedList) {
      if (ignoreSet.has(placed.clip.id)) continue;
      const name = placed.clip.label || 'Clip';
      addEntry(placed.startFrames, 'clip_head', `${name} In`);
      addEntry(placed.endFrames, 'clip_tail', `${name} Out`);
    }
  }

  // 4. Markers & Beat Transients
  for (const marker of markers) {
    let type: SnapTargetType = 'marker';
    let label = marker.name ? `Marker: ${marker.name}` : 'Marker';

    if (marker.markerKind === 'downbeat' || marker.name.toLowerCase().includes('downbeat')) {
      type = 'downbeat';
      label = `Downbeat: ${marker.name}`;
    } else if (marker.markerKind === 'beat' || marker.name.toLowerCase().includes('beat')) {
      type = 'beat';
      label = `Beat: ${marker.name}`;
    } else if (marker.markerKind === 'scene_cut' || marker.name.toLowerCase().includes('cut')) {
      type = 'scene_cut';
      label = `Cut: ${marker.name}`;
    }

    addEntry(marker.frame, type, label);
  }

  // 5. Sequence End / Zero point
  addEntry(0, 'sequence_end', 'Start (0f)');
  if (sequenceEndFrame > 0) {
    addEntry(sequenceEndFrame, 'sequence_end', 'Sequence End');
  }

  return entries;
}
