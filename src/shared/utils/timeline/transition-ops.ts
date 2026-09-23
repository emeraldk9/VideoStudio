/**
 * S23 — Pure operational arithmetic and state transitions for
 * timeline video transitions, cut-point drag resizing, and default shortcuts.
 */

import type { ClipTransition, SequenceClip } from '../../types/sequence';

export const DEFAULT_TRANSITION_TYPE: ClipTransition = 'crossfade';
export const DEFAULT_TRANSITION_FRAMES = 12;
export const FLASH_FRAME_DURATION = 2;

/**
 * Returns a Material Symbols icon name representing the transition style.
 */
export function getTransitionIcon(transition: ClipTransition): string {
  switch (transition) {
    case 'crossfade':
      return 'blur_linear';
    case 'blur_dissolve':
      return 'lens_blur';
    case 'luma_dissolve':
      return 'gradient';
    case 'additive_dissolve':
      return 'flare';
    case 'asymmetric_dissolve':
      return 'waves';
    case 'match_dissolve':
      return 'switch_access_shortcut';
    case 'fade_black':
      return 'brightness_empty';
    case 'fade_white':
      return 'brightness_high';
    case 'dip_to_color':
      return 'palette';
    case 'flash_frame':
      return 'bolt';
    case 'wipe_left':
      return 'arrow_back';
    case 'wipe_right':
      return 'arrow_forward';
    case 'wipe_up':
      return 'arrow_upward';
    case 'wipe_down':
      return 'arrow_downward';
    case 'cut':
    default:
      return 'content_cut';
  }
}

/**
 * Bounds transition frame count between 1 frame and allowable clip duration.
 */
export function clampTransitionFrames(frames: number, maxClipFrames: number): number {
  const floor = 1;
  const ceiling = Math.max(1, Math.floor(maxClipFrames));
  return Math.max(floor, Math.min(ceiling, Math.round(frames)));
}

/**
 * Calculates new transition duration in frames based on horizontal drag offset.
 */
export function calculateTransitionDragFrames(
  initialFrames: number,
  deltaPx: number,
  pxPerFrame: number,
  maxClipFrames: number
): number {
  if (pxPerFrame <= 0) return initialFrames;
  const frameDelta = deltaPx / pxPerFrame;
  const raw = initialFrames + frameDelta;
  return clampTransitionFrames(raw, maxClipFrames);
}

/**
 * Applies a transition to a clip, configuring its transition type and duration.
 */
export function applyClipTransition(
  clips: readonly SequenceClip[],
  clipId: string,
  transition: ClipTransition,
  frames?: number
): SequenceClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    if (transition === 'cut') {
      return {
        ...clip,
        transitionIn: 'cut',
        transitionFrames: 0,
      };
    }
    const defaultFrames = transition === 'flash_frame' ? FLASH_FRAME_DURATION : DEFAULT_TRANSITION_FRAMES;
    const targetFrames = frames !== undefined ? frames : clip.transitionFrames > 0 ? clip.transitionFrames : defaultFrames;
    const clampedFrames = clampTransitionFrames(targetFrames, clip.durationFrames);
    return {
      ...clip,
      transitionIn: transition,
      transitionFrames: clampedFrames,
    };
  });
}

/**
 * Resets a clip's transition to cut (no transition).
 */
export function removeClipTransition(
  clips: readonly SequenceClip[],
  clipId: string
): SequenceClip[] {
  return applyClipTransition(clips, clipId, 'cut', 0);
}

/**
 * Toggles default Cross Dissolve transition on a clip:
 * If clip has a transition, removes it; if cut, applies default Cross Dissolve.
 */
export function toggleDefaultTransition(
  clips: readonly SequenceClip[],
  clipId: string,
  defaultDurationFrames: number = DEFAULT_TRANSITION_FRAMES
): SequenceClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return [...clips];
  if (target.transitionIn && target.transitionIn !== 'cut') {
    return removeClipTransition(clips, clipId);
  }
  return applyClipTransition(clips, clipId, DEFAULT_TRANSITION_TYPE, defaultDurationFrames);
}
