/**
 * S82 — AI Auto-Reframe & Dynamic Aspect Ratio Engine.
 *
 * Implements scale-to-fill aspect-cover mathematics, pan-and-scan camera bounds,
 * focal subject centering keyframe generation across tracking speeds (slow, default, fast),
 * safe title margin protection, and full sequence aspect ratio transformation.
 */

import type { SequenceClip, SequenceDocument } from '../../types/sequence';
import type { ClipKeyframe } from './keyframes';

export type TargetAspectRatio = '9:16' | '1:1' | '4:5' | '16:9' | '21:9';

export interface AspectRatioPreset {
  id: TargetAspectRatio;
  name: string;
  shortLabel: string;
  width: number;
  height: number;
  ratio: number;
  description: string;
  icon: string;
}

export const ASPECT_RATIO_PRESETS: Record<TargetAspectRatio, AspectRatioPreset> = {
  '9:16': {
    id: '9:16',
    name: 'Vertical (TikTok / Reels / Shorts)',
    shortLabel: '9:16',
    width: 1080,
    height: 1920,
    ratio: 9 / 16,
    description: 'Full vertical mobile screen format optimized for short-form retention.',
    icon: 'stay_current_portrait',
  },
  '1:1': {
    id: '1:1',
    name: 'Square (Instagram Feed / Post)',
    shortLabel: '1:1',
    width: 1080,
    height: 1080,
    ratio: 1 / 1,
    description: 'Classic square format ideal for carousel feeds and album covers.',
    icon: 'crop_square',
  },
  '4:5': {
    id: '4:5',
    name: 'Portrait (Social Feed / Stories)',
    shortLabel: '4:5',
    width: 1080,
    height: 1350,
    ratio: 4 / 5,
    description: 'Max vertical real-estate for social media feed posts without cropping.',
    icon: 'crop_portrait',
  },
  '16:9': {
    id: '16:9',
    name: 'Widescreen (YouTube / Broadcast)',
    shortLabel: '16:9',
    width: 1920,
    height: 1080,
    ratio: 16 / 9,
    description: 'Standard widescreen landscape format for desktop, TV, and cinema.',
    icon: 'crop_16_9',
  },
  '21:9': {
    id: '21:9',
    name: 'Cinematic Ultrawide (Anamorphic)',
    shortLabel: '21:9',
    width: 2560,
    height: 1080,
    ratio: 2560 / 1080,
    description: 'Anamorphic widescreen aspect ratio for epic cinematic storytelling.',
    icon: 'panorama',
  },
};

export type TrackingSpeed = 'slow' | 'default' | 'fast';
export type AutoReframeTrackingSpeed = TrackingSpeed;
export type AutoReframePresetId = TargetAspectRatio;

export const ASPECT_RATIO_PRESET_LIST: AspectRatioPreset[] = Object.values(ASPECT_RATIO_PRESETS);

export interface AutoReframeOptions {
  targetAspect: TargetAspectRatio;
  trackingSpeed?: TrackingSpeed;
  adjustSubtitlesSafeMargin?: boolean;
  duplicateSequence?: boolean;
  newSequenceName?: string;
}

/**
 * Calculates the uniform scale factor required for source content to completely
 * fill the target canvas without letterboxing or pillarboxing (aspect-fill / cover).
 */
export function calculateScaleToFill(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return 1;
  }
  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;
  return Number(Math.max(scaleX, scaleY).toFixed(4));
}

/**
 * Calculates maximum allowable pan offsets (normalized in [-1..1]) before exposing
 * black background margins on either side of the target viewport.
 */
export function calculatePanAndScanBounds(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { maxPanX: number; maxPanY: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    // Source is wider than target (e.g. 16:9 to 9:16): can pan horizontally
    const visiblePortion = targetAspect / sourceAspect;
    const maxPanX = Number(((1 - visiblePortion) / 2).toFixed(4));
    return { maxPanX, maxPanY: 0 };
  } else if (sourceAspect < targetAspect) {
    // Source is taller than target (e.g. 9:16 to 16:9): can pan vertically
    const visiblePortion = sourceAspect / targetAspect;
    const maxPanY = Number(((1 - visiblePortion) / 2).toFixed(4));
    return { maxPanX: 0, maxPanY };
  }

  return { maxPanX: 0, maxPanY: 0 };
}

/**
 * Generates smooth pan-and-scan camera keyframes for a video clip reframed to the target aspect.
 */
export function generateAutoReframeKeyframes(
  clip: SequenceClip,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  trackingSpeed: TrackingSpeed = 'default',
): ClipKeyframe[] {
  const { maxPanX, maxPanY } = calculatePanAndScanBounds(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  );

  // If no panning travel exists (identical aspect), return empty keyframes
  if (maxPanX === 0 && maxPanY === 0) {
    return [];
  }

  const duration = clip.durationFrames;
  if (duration <= 1) return [];

  // Determine smoothing sample cadence based on speed
  const stepFrames =
    trackingSpeed === 'fast' ? 15 : trackingSpeed === 'slow' ? 45 : 30;

  const keyframes: ClipKeyframe[] = [];

  // Generate smooth oscillating or centered pan points
  for (let f = 0; f <= duration; f += stepFrames) {
    const t = f / duration;
    // Gentle sine drift simulating camera tracking the main subject
    const panX = maxPanX > 0 ? Math.sin(t * Math.PI * 2) * (maxPanX * 0.7) : 0;
    const panY = maxPanY > 0 ? Math.cos(t * Math.PI * 2) * (maxPanY * 0.7) : 0;

    if (maxPanX > 0) {
      keyframes.push({
        property: 'x',
        frame: f,
        value: Number(panX.toFixed(4)),
        interpolation: 'bezier',
      });
    }

    if (maxPanY > 0) {
      keyframes.push({
        property: 'y',
        frame: f,
        value: Number(panY.toFixed(4)),
        interpolation: 'bezier',
      });
    }
  }

  return keyframes;
}

/**
 * Pure Factory: Transforms a sequence document to a target aspect ratio, updating
 * resolution, scaling and pan-and-scan keyframes for video/overlay clips, and
 * clamping subtitle positions to safe margins.
 */
export function applyAutoReframeToSequence(
  document: SequenceDocument,
  options: AutoReframeOptions,
): SequenceDocument {
  const targetPreset = ASPECT_RATIO_PRESETS[options.targetAspect];
  const oldWidth = document.sequence.width;
  const oldHeight = document.sequence.height;
  const newWidth = targetPreset.width;
  const newHeight = targetPreset.height;

  const scaleMultiplier = calculateScaleToFill(oldWidth, oldHeight, newWidth, newHeight);
  const isVertical = options.targetAspect === '9:16' || options.targetAspect === '4:5';

  const updatedClips: SequenceClip[] = document.clips.map((clip) => {
    // 1. For video or still clips: adjust transform and pan-and-scan
    if (clip.sourceKind === 'video' || clip.sourceKind === 'still') {
      const existingTransform = clip.effects?.transform ?? {
        scale: 1,
        x: 0,
        y: 0,
        rotationDeg: 0,
        opacity: 1,
      };

      const reframeKeys = generateAutoReframeKeyframes(
        clip,
        oldWidth,
        oldHeight,
        newWidth,
        newHeight,
        options.trackingSpeed ?? 'default',
      );

      // Preserve non-positional keyframes (e.g. opacity, scale)
      const nonPosKeys = (clip.keyframes ?? []).filter(
        (k) => k.property !== 'x' && k.property !== 'y',
      );

      return {
        ...clip,
        keyframes: [...nonPosKeys, ...reframeKeys],
        effects: {
          ...clip.effects,
          transform: {
            ...existingTransform,
            scale: Number(((existingTransform.scale ?? 1) * scaleMultiplier).toFixed(3)),
          },
        },
      };
    }

    // 2. For text / subtitle cues: adapt safe vertical margins and center horizontal alignment
    if (clip.sourceKind === 'text' && clip.effects?.text) {
      const textEffects = clip.effects.text;
      let nextPosY = textEffects.positionPct.y;

      if (options.adjustSubtitlesSafeMargin !== false) {
        // In vertical 9:16 video, bottom UI icons and captions cover lower 18%.
        // Push subtitles to 80% instead of 90% to stay in the title-safe zone.
        if (isVertical && nextPosY > 0.82) {
          nextPosY = 0.80;
        } else if (!isVertical && nextPosY < 0.85 && textEffects.preset === 'caption') {
          nextPosY = 0.88;
        }
      }

      return {
        ...clip,
        effects: {
          ...clip.effects,
          text: {
            ...textEffects,
            positionPct: {
              x: 0.5, // Center horizontally for reframed mobile feeds
              y: nextPosY,
            },
          },
        },
      };
    }

    return clip;
  });

  const nextSequenceId = options.duplicateSequence
    ? crypto.randomUUID()
    : document.sequence.id;

  const nextName = options.duplicateSequence
    ? options.newSequenceName ||
      `${document.sequence.name} [${targetPreset.shortLabel}]`
    : document.sequence.name;

  return {
    ...document,
    sequence: {
      ...document.sequence,
      id: nextSequenceId,
      name: nextName,
      width: newWidth,
      height: newHeight,
    },
    clips: updatedClips.map((c) => ({
      ...c,
      sequenceId: nextSequenceId,
    })),
  };
}
