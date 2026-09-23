import type { ClipColorFilters } from './effects';

/**
 * Filter Categories matching CapCut Desktop industry standard
 */
export type FilterCategory =
  | 'trending'
  | 'cinematic'
  | 'portrait'
  | 'retro'
  | 'film'
  | 'atmosphere'
  | 'mono'
  | 'lens';

export interface FilterCategoryItem {
  id: FilterCategory;
  label: string;
  icon: string;
}

export const FILTER_CATEGORIES: readonly FilterCategoryItem[] = [
  { id: 'trending', label: 'Trending', icon: 'local_fire_department' },
  { id: 'cinematic', label: 'Cinematic', icon: 'movie_filter' },
  { id: 'portrait', label: 'Portrait', icon: 'face' },
  { id: 'retro', label: 'Retro & VHS', icon: 'videocam' },
  { id: 'film', label: 'Film Stock', icon: 'camera_roll' },
  { id: 'atmosphere', label: 'Atmosphere', icon: 'nights_stay' },
  { id: 'mono', label: 'B&W & Noir', icon: 'monochrome_photos' },
  { id: 'lens', label: 'Lens & Glow', icon: 'filter_tilt_shift' },
];

export interface FilterPreset {
  id: string;
  label: string;
  category: FilterCategory;
  description?: string;
  filters: ClipColorFilters;
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  // Trending
  {
    id: 'cinema_teal_orange',
    label: 'Teal & Orange',
    category: 'trending',
    description: 'Blockbuster cinema standard with complementary cyan shadows and amber skin tones',
    filters: { hue: -14, saturation: 1.25, contrast: 1.22, brightness: 0.02, vignette: 0.2 },
  },
  {
    id: 'golden_hour',
    label: 'Golden Hour',
    category: 'trending',
    description: 'Warm, soft sunset lighting with heightened amber saturation',
    filters: { hue: -22, saturation: 1.32, brightness: 0.05, contrast: 1.12, vignette: 0.15 },
  },
  {
    id: 'cyberpunk_glow',
    label: 'Cyberpunk',
    category: 'trending',
    description: 'Vibrant neon palette with boosted cyans and magenta highlights',
    filters: { hue: 135, saturation: 1.38, contrast: 1.28, vignette: 0.35 },
  },
  {
    id: 'faded_film',
    label: 'Faded Film',
    category: 'trending',
    description: 'Low-contrast matte shadow lift reminiscent of vintage film magazines',
    filters: { contrast: 0.88, saturation: 0.8, brightness: 0.06, gamma: 1.12 },
  },
  {
    id: 'crisp_pop',
    label: 'Crisp Pop',
    category: 'trending',
    description: 'Modern crisp commercial clarity with sharp edge definition',
    filters: { sharpen: 0.55, contrast: 1.15, saturation: 1.12, brightness: 0.02 },
  },
  {
    id: 'pastel_soft',
    label: 'Pastel Pop',
    category: 'trending',
    description: 'Delicate light tones with pastel warmth and lifted blacks',
    filters: { saturation: 1.18, brightness: 0.07, contrast: 0.95 },
  },

  // Cinematic
  {
    id: 'cinematic_teal_orange',
    label: 'Hollywood Teal',
    category: 'cinematic',
    description: 'High contrast Hollywood grading with deep teal shadows',
    filters: { hue: -16, saturation: 1.28, contrast: 1.26, vignette: 0.28 },
  },
  {
    id: 'bleach_bypass',
    label: 'Bleach Bypass',
    category: 'cinematic',
    description: 'Silver retention look: desaturated colors with dramatic contrast and grain depth',
    filters: { saturation: 0.35, contrast: 1.42, brightness: -0.02, sharpen: 0.3 },
  },
  {
    id: 'high_contrast_film',
    label: 'High Contrast',
    category: 'cinematic',
    description: 'Punchy blacks and vibrant mids for dramatic storytelling',
    filters: { contrast: 1.36, saturation: 1.15, brightness: -0.02 },
  },
  {
    id: 'commercial_clean',
    label: 'Commercial Clean',
    category: 'cinematic',
    description: 'Flawless studio look with balanced contrast and crisp primaries',
    filters: { brightness: 0.03, contrast: 1.12, saturation: 1.14, sharpen: 0.4 },
  },
  {
    id: 'moody_noir_film',
    label: 'Moody Drama',
    category: 'cinematic',
    description: 'Crushed blacks, muted colors and atmospheric shadow tension',
    filters: { brightness: -0.06, contrast: 1.3, saturation: 0.72, vignette: 0.45 },
  },

  // Portrait
  {
    id: 'portrait_soft_skin',
    label: 'Soft Skin',
    category: 'portrait',
    description: 'Gentle flattering highlight roll-off and warm rosy tones',
    filters: { brightness: 0.05, contrast: 0.94, saturation: 1.08, hue: -5 },
  },
  {
    id: 'portrait_warm_glow',
    label: 'Warm Glow',
    category: 'portrait',
    description: 'Subtle sun-kissed warmth enhancing facial features',
    filters: { hue: -12, saturation: 1.2, brightness: 0.04, contrast: 1.05 },
  },
  {
    id: 'portrait_radiant',
    label: 'Radiant',
    category: 'portrait',
    description: 'High key radiant glow with creamy soft contrast',
    filters: { brightness: 0.09, contrast: 0.96, saturation: 1.14, gamma: 1.08 },
  },
  {
    id: 'portrait_vintage_look',
    label: 'Vintage Portrait',
    category: 'portrait',
    description: 'Nostalgic 1980s studio portrait texture and warm sepia undertones',
    filters: { hue: -18, saturation: 0.85, contrast: 1.02, brightness: 0.04, vignette: 0.22 },
  },

  // Retro & VHS
  {
    id: 'polaroid_70s',
    label: 'Polaroid 70s',
    category: 'retro',
    description: 'Authentic instant-print palette with shifted green-yellow hues and faded corners',
    filters: { hue: -15, contrast: 0.92, saturation: 0.82, brightness: 0.07, vignette: 0.3 },
  },
  {
    id: 'lomography',
    label: 'Lomography',
    category: 'retro',
    description: 'Toy camera style with supersaturated colors and heavy corner vignette',
    filters: { contrast: 1.28, saturation: 1.34, vignette: 0.65 },
  },
  {
    id: 'vintage_35mm',
    label: 'Vintage 35mm',
    category: 'retro',
    description: 'Classic 1970s chemical film negative warm amber cast',
    filters: { hue: -26, saturation: 0.78, brightness: 0.03, contrast: 1.08, vignette: 0.32 },
  },
  {
    id: 'vhs_80s',
    label: 'VHS 80s Cassette',
    category: 'retro',
    description: 'Magnetic tape aesthetic with slightly lifted blacks and color bleed',
    filters: { hue: 8, saturation: 0.88, brightness: 0.04, contrast: 0.96 },
  },

  // Film Stock
  {
    id: 'kodachrome_64',
    label: 'Kodachrome',
    category: 'film',
    description: 'Iconic National Geographic rich reds, warm yellows and intense blues',
    filters: { hue: -8, saturation: 1.3, contrast: 1.24, vignette: 0.18 },
  },
  {
    id: 'technicolor_look',
    label: 'Technicolor',
    category: 'film',
    description: '3-strip Technicolor look with lush, saturated primary colors',
    filters: { saturation: 1.42, contrast: 1.2, brightness: 0.02 },
  },
  {
    id: 'cinema_stock_500t',
    label: 'Tungsten 500T',
    category: 'film',
    description: 'Cool tungsten-balanced motion picture negative for night and interior scenes',
    filters: { hue: 14, saturation: 1.1, contrast: 1.18, brightness: -0.02 },
  },

  // Atmosphere
  {
    id: 'matrix_green',
    label: 'Matrix Code',
    category: 'atmosphere',
    description: 'Stylized greenish cyberpunk wash from dystopian cinema',
    filters: { hue: 75, saturation: 1.22, contrast: 1.18 },
  },
  {
    id: 'dreamy_mist',
    label: 'Dreamy Mist',
    category: 'atmosphere',
    description: 'Ethereal glowing highlights and dreamy softened contrast',
    filters: { brightness: 0.08, contrast: 0.88, saturation: 1.12, gamma: 1.18 },
  },
  {
    id: 'cool_nordic',
    label: 'Nordic Frost',
    category: 'atmosphere',
    description: 'Crisp scandinavian cold atmosphere with cyan tint and crisp whites',
    filters: { hue: 18, saturation: 0.95, contrast: 1.15, brightness: 0.02 },
  },
  {
    id: 'night_vision',
    label: 'Night Mood',
    category: 'atmosphere',
    description: 'Deep nocturnal blue grading with subdued highlights',
    filters: { brightness: -0.14, hue: 20, saturation: 0.82, contrast: 1.12 },
  },
  {
    id: 'sunset_horizon',
    label: 'Sunset Horizon',
    category: 'atmosphere',
    description: 'Vivid twilight with deep violet shadows and fiery orange skies',
    filters: { hue: -28, saturation: 1.35, contrast: 1.16, vignette: 0.22 },
  },

  // B&W & Noir
  {
    id: 'bw_clean',
    label: 'Pure B&W',
    category: 'mono',
    description: 'Clean monochrome conversion preserving natural tonal gradations',
    filters: { saturation: 0, contrast: 1.08 },
  },
  {
    id: 'noir_classic',
    label: 'Film Noir Silver',
    category: 'mono',
    description: 'Deep dramatic silver gelatin monochrome with heavy edge vignetting',
    filters: { saturation: 0, contrast: 1.38, brightness: -0.02, vignette: 0.52 },
  },
  {
    id: 'selenium_tone',
    label: 'Selenium Tone',
    category: 'mono',
    description: 'Fine art darkroom archival print with deep eggplant blacks',
    filters: { saturation: 0.15, hue: 160, contrast: 1.25, vignette: 0.35 },
  },
  {
    id: 'matte_black',
    label: 'Matte B&W',
    category: 'mono',
    description: 'Contemporary low-contrast editorial monochrome with lifted blacks',
    filters: { saturation: 0, contrast: 0.9, brightness: 0.06 },
  },

  // Lens & Glow
  {
    id: 'vignette_lens',
    label: 'Vignette Focus',
    category: 'lens',
    description: 'Subject-framing optical fall-off focusing gaze on center frame',
    filters: { vignette: 0.72, contrast: 1.08 },
  },
  {
    id: 'sharp_clarity',
    label: 'Crisp Detail',
    category: 'lens',
    description: 'Edge enhancement and micro-contrast punch for landscape footage',
    filters: { sharpen: 0.75, contrast: 1.14 },
  },
  {
    id: 'soft_focus_lens',
    label: 'Soft Focus',
    category: 'lens',
    description: 'Vintage diffuser lens effect with luminous highlights and gentle contrast',
    filters: { brightness: 0.06, contrast: 0.88, gamma: 1.12 },
  },
] as const;

export function filterPresetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((preset) => preset.id === id);
}

/**
 * Resolves filter values smoothly scaled by an intensity percentage (0..100).
 * At 0% intensity, all parameters are exact neutrals (no change).
 * At 100% intensity, full preset parameters apply.
 */
export function resolveFilterWithIntensity(
  filters: ClipColorFilters,
  intensityPct: number = 100,
): ClipColorFilters {
  const factor = Math.max(0, Math.min(100, intensityPct)) / 100;
  return {
    brightness:
      filters.brightness !== undefined ? Number((filters.brightness * factor).toFixed(3)) : undefined,
    contrast:
      filters.contrast !== undefined
        ? Number((1 + (filters.contrast - 1) * factor).toFixed(3))
        : undefined,
    saturation:
      filters.saturation !== undefined
        ? Number((1 + (filters.saturation - 1) * factor).toFixed(3))
        : undefined,
    gamma:
      filters.gamma !== undefined
        ? Number((1 + (filters.gamma - 1) * factor).toFixed(3))
        : undefined,
    hue: filters.hue !== undefined ? Number((filters.hue * factor).toFixed(1)) : undefined,
    sharpen:
      filters.sharpen !== undefined ? Number((filters.sharpen * factor).toFixed(3)) : undefined,
    vignette:
      filters.vignette !== undefined ? Number((filters.vignette * factor).toFixed(3)) : undefined,
  };
}
