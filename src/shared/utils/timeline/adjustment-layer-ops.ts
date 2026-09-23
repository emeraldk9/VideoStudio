import {
  type ClipColorLabel,
  type ClipEffects,
  type SequenceClip,
  type SequenceTrack,
} from '../../types/sequence';
import { DEFAULT_COLOR_GRADING } from './color-grading-ops';
import { buildCssFilter } from './effects';
import { layoutTrack } from './layout';

export const DEFAULT_ADJUSTMENT_LAYER_SECONDS = 5;
export const DEFAULT_ADJUSTMENT_COLOR_LABEL: ClipColorLabel = 'violet';

/**
 * Checks whether a given clip acts as an adjustment layer.
 * In VideoStudio, `sourceKind === 'effect'` is the underlying representation
 * for timeline adjustment layers and effect containers.
 */
export function isAdjustmentLayerClip(clip: Pick<SequenceClip, 'sourceKind'>): boolean {
  return clip.sourceKind === 'effect';
}

export interface CreateAdjustmentLayerOptions {
  sequenceId: string;
  trackId: string;
  startFrames: number;
  durationFrames: number;
  orderIndex?: number;
  label?: string;
  effects?: ClipEffects;
  colorLabel?: ClipColorLabel;
}

/**
 * Creates a new Adjustment Layer clip positioned at the designated track and frame span.
 */
export function createAdjustmentLayerClip({
  sequenceId,
  trackId,
  startFrames,
  durationFrames,
  orderIndex = 0,
  label = 'Adjustment Layer',
  effects,
  colorLabel = DEFAULT_ADJUSTMENT_COLOR_LABEL,
}: CreateAdjustmentLayerOptions): SequenceClip {
  return {
    id: crypto.randomUUID(),
    sequenceId,
    trackId,
    orderIndex,
    sourceKind: 'effect',
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
    overrides: [],
    effects: effects ?? {
      colorGrade: { ...DEFAULT_COLOR_GRADING },
    },
  };
}

export interface ActiveAdjustmentLayer {
  clip: SequenceClip;
  track: SequenceTrack;
  startFrames: number;
  endFrames: number;
}

/**
 * Collects and returns all adjustment layers active at `playheadFrame` across all
 * enabled video/overlay tracks, sorted in ascending track `orderIndex` order
 * (lower tracks composite first, higher overlay tracks composite on top).
 */
export function collectActiveAdjustmentLayers(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  playheadFrame: number,
): ActiveAdjustmentLayer[] {
  const videoTracks = tracks.filter((t) => t.kind === 'video' && t.videoEnabled !== false);
  const active: ActiveAdjustmentLayer[] = [];

  for (const track of videoTracks) {
    const placedClips = layoutTrack(clips as SequenceClip[], track);
    for (const placed of placedClips) {
      if (
        isAdjustmentLayerClip(placed.clip) &&
        playheadFrame >= placed.startFrames &&
        playheadFrame < placed.endFrames
      ) {
        active.push({
          clip: placed.clip,
          track,
          startFrames: placed.startFrames,
          endFrames: placed.endFrames,
        });
      }
    }
  }

  // Sort by track order index ascending so lower layers apply before higher layers
  return active.sort((a, b) => (a.track.orderIndex ?? 0) - (b.track.orderIndex ?? 0));
}

import type { CSSProperties } from 'react';
import { buildCssClipPath } from './mask-ops';

export interface AdjustmentLayerCssStyles extends CSSProperties {
  filter?: string;
  backdropFilter?: string;
  mixBlendMode?: CSSProperties['mixBlendMode'];
  opacity?: number;
  clipPath?: string;
}

/**
 * Builds CSS styles for an adjustment layer, including CSS filter chains,
 * backdropFilter for browser rendering, mix-blend-mode, opacity, and shape mask clip-paths.
 */
export function buildAdjustmentLayerCssStyles(clip: SequenceClip): AdjustmentLayerCssStyles {
  const styles: AdjustmentLayerCssStyles = {};

  const filterStr = buildCssFilter(clip.effects);
  if (filterStr.trim().length > 0) {
    styles.filter = filterStr;
    styles.backdropFilter = filterStr;
  }

  const blendMode = clip.effects?.blendMode;
  if (blendMode && blendMode !== 'normal') {
    styles.mixBlendMode = blendMode as CSSProperties['mixBlendMode'];
  }

  const opacity = clip.effects?.transform?.opacity;
  if (opacity !== undefined && opacity < 1) {
    styles.opacity = Math.max(0, Math.min(1, opacity));
  }

  const mask = clip.effects?.mask;
  if (mask?.enabled && mask.shape && mask.shape !== 'none') {
    styles.clipPath = buildMaskClipPath(mask);
  }

  return styles;
}

/**
 * Converts a ClipMaskSettings object into a standard CSS clip-path rule.
 */
export function buildMaskClipPath(mask: NonNullable<ClipEffects['mask']>): string | undefined {
  const path = buildCssClipPath(mask);
  return path.length > 0 ? path : undefined;
}

/**
 * Combines all active adjustment layer CSS filters in order.
 */
export function aggregateAdjustmentFilters(
  activeLayers: readonly ActiveAdjustmentLayer[],
): string {
  const parts: string[] = [];
  for (const layer of activeLayers) {
    const filter = buildCssFilter(layer.clip.effects);
    if (filter.trim().length > 0) {
      parts.push(filter.trim());
    }
  }
  return parts.join(' ');
}
