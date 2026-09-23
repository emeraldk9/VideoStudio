/**
 * S25 — Studio clip color labels, visual tags, and batch selection operations.
 */

import type { ClipColorLabel, SequenceClip } from '../../types/sequence';

export interface ColorLabelMeta {
  id: ClipColorLabel;
  name: string;
  description: string;
  dotClass: string;
  stripeClass: string;
  washGradient: string;
  hex: string;
}

export const COLOR_LABEL_DEFINITIONS: Record<ClipColorLabel, ColorLabelMeta> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'Original track/source kind tone',
    dotClass: 'bg-neutral-500',
    stripeClass: 'bg-neutral-500/50',
    washGradient: '',
    hex: '#737373',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    description: 'A-Roll, dialogue & primary action',
    dotClass: 'bg-rose-500',
    stripeClass: 'bg-rose-500',
    washGradient: 'linear-gradient(rgba(244, 63, 94, 0.28), rgba(244, 63, 94, 0.28))',
    hex: '#f43f5e',
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    description: 'Review, temp takes & attention points',
    dotClass: 'bg-amber-500',
    stripeClass: 'bg-amber-500',
    washGradient: 'linear-gradient(rgba(245, 158, 11, 0.28), rgba(245, 158, 11, 0.28))',
    hex: '#f59e0b',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    description: 'Music tracks & audio sync cues',
    dotClass: 'bg-emerald-500',
    stripeClass: 'bg-emerald-500',
    washGradient: 'linear-gradient(rgba(16, 185, 129, 0.28), rgba(16, 185, 129, 0.28))',
    hex: '#10b981',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan',
    description: 'Graphics, lower-thirds & b-roll plates',
    dotClass: 'bg-cyan-500',
    stripeClass: 'bg-cyan-500',
    washGradient: 'linear-gradient(rgba(6, 182, 212, 0.28), rgba(6, 182, 212, 0.28))',
    hex: '#06b6d4',
  },
  violet: {
    id: 'violet',
    name: 'Violet',
    description: 'Titles, credits & typography',
    dotClass: 'bg-violet-500',
    stripeClass: 'bg-violet-500',
    washGradient: 'linear-gradient(rgba(139, 92, 246, 0.28), rgba(139, 92, 246, 0.28))',
    hex: '#8b5cf6',
  },
  fuchsia: {
    id: 'fuchsia',
    name: 'Fuchsia',
    description: 'VFX layers, glitches & atmospheric grades',
    dotClass: 'bg-fuchsia-500',
    stripeClass: 'bg-fuchsia-500',
    washGradient: 'linear-gradient(rgba(217, 70, 239, 0.28), rgba(217, 70, 239, 0.28))',
    hex: '#d946ef',
  },
  steel: {
    id: 'steel',
    name: 'Steel',
    description: 'Ambient audio, room tone & foley',
    dotClass: 'bg-slate-400',
    stripeClass: 'bg-slate-400',
    washGradient: 'linear-gradient(rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.25))',
    hex: '#94a3b8',
  },
};

/**
 * Returns metadata descriptor for a given color label.
 */
export function getColorLabelMeta(label?: ClipColorLabel): ColorLabelMeta {
  if (!label || !COLOR_LABEL_DEFINITIONS[label]) {
    return COLOR_LABEL_DEFINITIONS.default;
  }
  return COLOR_LABEL_DEFINITIONS[label];
}

/**
 * Pure state updater that sets the specified color label on targeted clip IDs.
 */
export function setClipColorLabel(
  clips: readonly SequenceClip[],
  clipIds: readonly string[],
  label: ClipColorLabel
): SequenceClip[] {
  if (clipIds.length === 0) return [...clips];
  const targetSet = new Set(clipIds);

  return clips.map((clip) => {
    if (!targetSet.has(clip.id)) return clip;
    return {
      ...clip,
      colorLabel: label === 'default' ? undefined : label,
    };
  });
}

/**
 * Returns all clip IDs sharing the given color label.
 */
export function selectClipsByColorLabel(
  clips: readonly SequenceClip[],
  label: ClipColorLabel
): string[] {
  return clips
    .filter((clip) => {
      const clipLabel = clip.colorLabel ?? 'default';
      return clipLabel === label;
    })
    .map((c) => c.id);
}
