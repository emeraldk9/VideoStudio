import type React from 'react';
import type {
  WhiteboardSettings,
  WhiteboardZone,
  WhiteboardPreset,
  SequenceClip,
} from '@shared';

export type RevealPatternCategory = 'serpentine' | 'wipe' | 'zones' | 'trace';

export interface PatternCategoryItem {
  id: RevealPatternCategory;
  label: string;
  icon: string;
  description: string;
}

export const REVEAL_PATTERN_CATEGORIES: readonly PatternCategoryItem[] = [
  { id: 'serpentine', label: 'Writing', icon: 'edit_note', description: 'Multi-line handwriting or reading sweep' },
  { id: 'wipe', label: 'Wipe', icon: 'swipe', description: 'Directional edge wipe reveal' },
  { id: 'zones', label: 'Custom Zones', icon: 'crop_free', description: 'Region-by-region sequenced reveal' },
  { id: 'trace', label: 'Line-Art Sketch', icon: 'draw', description: 'Content-aware vector linework' },
];

export interface BaseSketchCardProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
  targetClip: SequenceClip | null;
  durationFrames: number;
  fps: number;
  frameWidth: number;
  frameHeight: number;
}
