import type { ClipColorFilters } from './effects';

/**
 * Beta S157 (owner items 7 & 9) — the effects library: named colour looks
 * over the existing `ClipColorFilters` engine.
 *
 * Pure data, deliberately. Every preset is a combination of the eq/hue/
 * unsharp/vignette filters phase 3 already renders and previews — so the
 * library adds zero new ffmpeg surface, and `buildColorFilterChain` /
 * `buildCssFilter` stay the single source of truth for what a value means.
 * (S154's grading posture holds: these are *looks applied to a cut*, not a
 * competing grade engine. No LUTs.)
 *
 * Values live inside the documented ranges in `effects.ts`. `gamma`,
 * `sharpen` and `vignette` are export-only (CSS has no equivalent) — presets
 * using them preview approximately, which the preview's honesty line
 * discloses.
 */

export interface EffectPreset {
  /** Stable id — stored on the clip (`effects.presetId` is not a field; the label names it). */
  id: string;
  label: string;
  filters: ClipColorFilters;
}

export const EFFECT_PRESETS: readonly EffectPreset[] = [
  { id: 'bw', label: 'Black & white', filters: { saturation: 0, contrast: 1.05 } },
  { id: 'noir', label: 'Noir', filters: { saturation: 0, contrast: 1.3, vignette: 0.5 } },
  { id: 'warm', label: 'Warm', filters: { hue: -10, saturation: 1.15, brightness: 0.03 } },
  { id: 'cool', label: 'Cool', filters: { hue: 12, saturation: 1.05 } },
  { id: 'faded_film', label: 'Faded film', filters: { contrast: 0.85, saturation: 0.75, brightness: 0.05, gamma: 1.1 } },
  { id: 'high_contrast', label: 'High contrast', filters: { contrast: 1.35, saturation: 1.1 } },
  { id: 'dreamy', label: 'Dreamy', filters: { brightness: 0.08, contrast: 0.9, saturation: 1.1, gamma: 1.15 } },
  { id: 'crisp', label: 'Crisp', filters: { sharpen: 0.5, contrast: 1.1 } },
  { id: 'vintage', label: 'Vintage', filters: { hue: -30, saturation: 0.35, brightness: 0.03, vignette: 0.3 } },
  { id: 'sunset', label: 'Sunset', filters: { hue: -20, saturation: 1.3 } },
  { id: 'night', label: 'Night', filters: { brightness: -0.15, hue: 15, saturation: 0.8, contrast: 1.1 } },
  { id: 'vignette', label: 'Vignette', filters: { vignette: 0.6 } },
] as const;

export function effectPresetById(id: string): EffectPreset | undefined {
  return EFFECT_PRESETS.find((preset) => preset.id === id);
}
