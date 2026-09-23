/**
 * CapCut-Style Video Effects Engine & Preset System
 */

export type VideoEffectCategory =
  | 'trending'
  | 'opening_closing'
  | 'lens_blur'
  | 'light_glitch'
  | 'retro_film'
  | 'distortion'
  | 'atmosphere'
  | 'split_dsk';

export interface VideoEffectCategoryItem {
  id: VideoEffectCategory;
  label: string;
  icon: string;
}

export const VIDEO_EFFECT_CATEGORIES: readonly VideoEffectCategoryItem[] = [
  { id: 'trending', label: 'Trending', icon: 'local_fire_department' },
  { id: 'opening_closing', label: 'Open & Close', icon: 'animation' },
  { id: 'lens_blur', label: 'Lens & Blur', icon: 'lens_blur' },
  { id: 'light_glitch', label: 'Light & Glitch', icon: 'bolt' },
  { id: 'retro_film', label: 'Retro & Film', icon: 'movie_filter' },
  { id: 'distortion', label: 'Distortion', icon: 'waves' },
  { id: 'atmosphere', label: 'Atmosphere', icon: 'grain' },
  { id: 'split_dsk', label: 'Split & DSK', icon: 'splitscreen' },
];

export interface VideoEffectPreset {
  id: string;
  label: string;
  category: VideoEffectCategory;
  description: string;
  icon: string;
  badge?: 'PRO' | 'HOT' | 'NEW';
  defaultIntensity: number; // 0..100
  defaultSpeed: number;     // 0..100
  defaultScale?: number;    // 0..100
  paramLabel?: string;
  defaultParam?: number;    // 0..100
  colorHex?: string;
  cssClass: string;
  svgFilterId?: string;
}

export interface VideoEffectSettings {
  id: string;
  presetId: string;
  label: string;
  category: VideoEffectCategory;
  intensity: number; // 0..100
  speed: number;     // 0..100
  scale?: number;    // 0..100
  param?: number;    // 0..100
  colorHex?: string;
  disabled?: boolean;
}

export const VIDEO_EFFECT_PRESETS: readonly VideoEffectPreset[] = [
  // 1. Trending
  {
    id: 'camera_shake',
    label: 'Camera Shake',
    category: 'trending',
    description: 'High-energy organic handheld camera impact shake',
    icon: 'vibration',
    badge: 'HOT',
    defaultIntensity: 75,
    defaultSpeed: 80,
    defaultScale: 60,
    paramLabel: 'Jitter Angle',
    defaultParam: 45,
    cssClass: 'vfx-camera-shake',
  },
  {
    id: 'rgb_split',
    label: 'RGB Split',
    category: 'trending',
    description: 'Chromatic aberration color channel separation glitch',
    icon: 'fluorescent',
    badge: 'HOT',
    defaultIntensity: 70,
    defaultSpeed: 60,
    defaultScale: 50,
    paramLabel: 'Spread Width',
    defaultParam: 60,
    cssClass: 'vfx-rgb-split',
    svgFilterId: 'vfx-svg-rgb-split',
  },
  {
    id: 'flash_white',
    label: 'Flash White',
    category: 'trending',
    description: 'Rhythmic high-exposure strobe flash for downbeats',
    icon: 'flash_on',
    badge: 'HOT',
    defaultIntensity: 85,
    defaultSpeed: 75,
    paramLabel: 'Bloom Spread',
    defaultParam: 50,
    colorHex: '#ffffff',
    cssClass: 'vfx-flash-white',
  },
  {
    id: 'edge_glow',
    label: 'Edge Glow',
    category: 'trending',
    description: 'Vibrant neon luminous glow tracking high-contrast boundaries',
    icon: 'flare',
    badge: 'PRO',
    defaultIntensity: 75,
    defaultSpeed: 40,
    paramLabel: 'Glow Radius',
    defaultParam: 50,
    colorHex: '#38bdf8',
    cssClass: 'vfx-edge-glow',
  },
  {
    id: 'zoom_pulse',
    label: 'Zoom Pulse',
    category: 'trending',
    description: 'Punchy bass-synchronized dynamic zoom in/out pulse',
    icon: 'zoom_in',
    defaultIntensity: 65,
    defaultSpeed: 70,
    defaultScale: 80,
    paramLabel: 'Beat Tempo',
    defaultParam: 50,
    cssClass: 'vfx-zoom-pulse',
  },
  {
    id: 'strobe_light',
    label: 'Strobe Beat',
    category: 'trending',
    description: 'Rapid intermittent illumination for club and trap edits',
    icon: 'electric_bolt',
    defaultIntensity: 80,
    defaultSpeed: 90,
    paramLabel: 'Frequency',
    defaultParam: 85,
    cssClass: 'vfx-strobe',
  },

  // 2. Opening & Closing
  {
    id: 'blur_open',
    label: 'Blur Open',
    category: 'opening_closing',
    description: 'Dreamy optical defocus smoothly resolving into razor sharpness',
    icon: 'lens_blur',
    badge: 'HOT',
    defaultIntensity: 80,
    defaultSpeed: 50,
    paramLabel: 'Initial Blur',
    defaultParam: 85,
    cssClass: 'vfx-blur-open',
  },
  {
    id: 'focus_zoom_in',
    label: 'Focus Zoom In',
    category: 'opening_closing',
    description: 'Cinematic wide-to-tight camera push with peripheral bloom',
    icon: 'center_focus_strong',
    defaultIntensity: 70,
    defaultSpeed: 55,
    defaultScale: 75,
    paramLabel: 'Target Zoom',
    defaultParam: 70,
    cssClass: 'vfx-focus-zoom',
  },
  {
    id: 'halo_blur',
    label: 'Halo Blur',
    category: 'opening_closing',
    description: 'Circular luminous halo opening up into clarity',
    icon: 'blur_circular',
    defaultIntensity: 75,
    defaultSpeed: 50,
    paramLabel: 'Halo Diameter',
    defaultParam: 60,
    cssClass: 'vfx-halo-blur',
  },
  {
    id: 'tv_turn_on',
    label: 'Old TV Power On',
    category: 'opening_closing',
    description: 'Retro cathode-ray tube horizontal phosphor flare wake-up',
    icon: 'tv',
    badge: 'PRO',
    defaultIntensity: 90,
    defaultSpeed: 65,
    paramLabel: 'Phosphor Glow',
    defaultParam: 70,
    cssClass: 'vfx-tv-turn-on',
  },
  {
    id: 'diamond_zoom_open',
    label: 'Diamond Reveal',
    category: 'opening_closing',
    description: 'Geometric diamond iris expanding outward with chromatic ring',
    icon: 'diamond',
    defaultIntensity: 75,
    defaultSpeed: 55,
    paramLabel: 'Iris Softness',
    defaultParam: 40,
    cssClass: 'vfx-diamond-open',
  },

  // 3. Lens & Blur
  {
    id: 'radial_blur',
    label: 'Radial Zoom Blur',
    category: 'lens_blur',
    description: 'High-speed center-weighted zoom streak simulating supersonic rush',
    icon: 'flare',
    badge: 'HOT',
    defaultIntensity: 75,
    defaultSpeed: 60,
    paramLabel: 'Streak Length',
    defaultParam: 65,
    cssClass: 'vfx-radial-blur',
  },
  {
    id: 'motion_blur_speed',
    label: 'Motion Blur',
    category: 'lens_blur',
    description: 'Directional 180-degree cinema shutter drag blur',
    icon: 'speed',
    defaultIntensity: 70,
    defaultSpeed: 70,
    paramLabel: 'Shutter Angle',
    defaultParam: 75,
    cssClass: 'vfx-motion-blur',
  },
  {
    id: 'tilt_shift_mini',
    label: 'Tilt-Shift',
    category: 'lens_blur',
    description: 'Selective horizontal plane of sharp focus with miniaturized depth',
    icon: 'filter_tilt_shift',
    badge: 'PRO',
    defaultIntensity: 80,
    defaultSpeed: 30,
    defaultScale: 40,
    paramLabel: 'Focus Band',
    defaultParam: 45,
    cssClass: 'vfx-tilt-shift',
  },
  {
    id: 'fisheye_lens',
    label: 'Fisheye 8mm',
    category: 'lens_blur',
    description: 'Extreme ultra-wide hemispherical barrel distortion',
    icon: 'panorama_fish_eye',
    defaultIntensity: 75,
    defaultSpeed: 20,
    paramLabel: 'Curvature',
    defaultParam: 70,
    cssClass: 'vfx-fisheye',
  },
  {
    id: 'promist_soft_glow',
    label: 'Black Pro-Mist',
    category: 'lens_blur',
    description: 'Hollywood cinema diffusion halation blossoming specular highlights',
    icon: 'auto_awesome',
    defaultIntensity: 65,
    defaultSpeed: 30,
    paramLabel: 'Highlight Bloom',
    defaultParam: 55,
    cssClass: 'vfx-promist',
  },

  // 4. Light & Glitch
  {
    id: 'cyberpunk_glitch',
    label: 'Cyber Glitch',
    category: 'light_glitch',
    description: 'Digital block artifact corruption, horizontal slice tearing and noise',
    icon: 'memory',
    badge: 'HOT',
    defaultIntensity: 80,
    defaultSpeed: 75,
    paramLabel: 'Slice Density',
    defaultParam: 70,
    cssClass: 'vfx-cyber-glitch',
  },
  {
    id: 'crt_scanlines',
    label: 'CRT Scanlines',
    category: 'light_glitch',
    description: 'Interlaced arcade raster phosphor lines and scanline flicker',
    icon: 'line_style',
    defaultIntensity: 65,
    defaultSpeed: 60,
    paramLabel: 'Line Spacing',
    defaultParam: 50,
    cssClass: 'vfx-crt-scanlines',
  },
  {
    id: 'light_leak_vintage',
    label: '70s Light Leak',
    category: 'light_glitch',
    description: 'Organic warm amber and scarlet sunburst edge flaring',
    icon: 'wb_sunny',
    badge: 'PRO',
    defaultIntensity: 70,
    defaultSpeed: 45,
    paramLabel: 'Warmth Tint',
    defaultParam: 65,
    colorHex: '#f97316',
    cssClass: 'vfx-light-leak',
  },
  {
    id: 'film_burn_edge',
    label: 'Film Burn',
    category: 'light_glitch',
    description: 'Celluloid projector gate burn melting across the frame border',
    icon: 'local_fire_department',
    defaultIntensity: 75,
    defaultSpeed: 50,
    paramLabel: 'Burn Intensity',
    defaultParam: 70,
    colorHex: '#ea580c',
    cssClass: 'vfx-film-burn',
  },

  // 5. Retro & Film
  {
    id: 'film_8mm_nostalgia',
    label: '8mm Home Video',
    category: 'retro_film',
    description: 'Wobbly sprocket jitter, 18fps cadence and warm grain',
    icon: 'videocam',
    badge: 'HOT',
    defaultIntensity: 75,
    defaultSpeed: 60,
    paramLabel: 'Gate Jitter',
    defaultParam: 55,
    cssClass: 'vfx-film-8mm',
  },
  {
    id: 'vhs_static_noise',
    label: 'VHS Tape Static',
    category: 'retro_film',
    description: 'Tape head tracking error distortion band and magnetic luma noise',
    icon: 'tape',
    badge: 'PRO',
    defaultIntensity: 75,
    defaultSpeed: 70,
    paramLabel: 'Noise Level',
    defaultParam: 65,
    cssClass: 'vfx-vhs-static',
  },
  {
    id: 'film_scratches_dust',
    label: 'Film Dust & Hair',
    category: 'retro_film',
    description: 'Authentic 35mm optical emulsion scratches, dust motes and hair fibers',
    icon: 'grain',
    defaultIntensity: 65,
    defaultSpeed: 65,
    paramLabel: 'Scratch Count',
    defaultParam: 60,
    cssClass: 'vfx-film-scratches',
  },
  {
    id: 'halftone_dots_retro',
    label: 'Halftone Print',
    category: 'retro_film',
    description: 'Newspaper CMYK Ben-Day dot matrix print rasterization',
    icon: 'scatter_plot',
    defaultIntensity: 70,
    defaultSpeed: 20,
    paramLabel: 'Dot Pitch',
    defaultParam: 45,
    cssClass: 'vfx-halftone',
  },

  // 6. Distortion & Warp
  {
    id: 'wave_warp_fluid',
    label: 'Wave Warp',
    category: 'distortion',
    description: 'Liquid sine-wave oscillation undulating the video plane',
    icon: 'water',
    badge: 'HOT',
    defaultIntensity: 65,
    defaultSpeed: 55,
    paramLabel: 'Wavelength',
    defaultParam: 60,
    cssClass: 'vfx-wave-warp',
  },
  {
    id: 'water_ripple_drop',
    label: 'Water Ripple',
    category: 'distortion',
    description: 'Concentric circular hydrodynamic shockwave ripples',
    icon: 'waves',
    defaultIntensity: 70,
    defaultSpeed: 60,
    paramLabel: 'Ring Density',
    defaultParam: 55,
    cssClass: 'vfx-water-ripple',
  },
  {
    id: 'vortex_swirl_twist',
    label: 'Vortex Swirl',
    category: 'distortion',
    description: 'Centripetal whirlpool gravitational spiral warp',
    icon: 'cyclone',
    defaultIntensity: 70,
    defaultSpeed: 45,
    paramLabel: 'Twist Angle',
    defaultParam: 65,
    cssClass: 'vfx-vortex',
  },
  {
    id: 'mirror_horizontal_split',
    label: 'Mirror Symmetry',
    category: 'distortion',
    description: 'Flawless kaleidoscopic bilateral horizontal reflection',
    icon: 'flip',
    defaultIntensity: 100,
    defaultSpeed: 0,
    paramLabel: 'Seam Blend',
    defaultParam: 50,
    cssClass: 'vfx-mirror',
  },

  // 7. Atmosphere & Nature
  {
    id: 'falling_snowflakes',
    label: 'Winter Snow',
    category: 'atmosphere',
    description: 'Gentle multi-depth falling crystalline snow particles',
    icon: 'ac_unit',
    badge: 'HOT',
    defaultIntensity: 75,
    defaultSpeed: 50,
    paramLabel: 'Flake Density',
    defaultParam: 60,
    cssClass: 'vfx-snowfall',
  },
  {
    id: 'rain_storm_drops',
    label: 'Cinematic Rain',
    category: 'atmosphere',
    description: 'Vertical heavy rain streaks with subtle atmospheric mist',
    icon: 'rainy',
    defaultIntensity: 70,
    defaultSpeed: 80,
    paramLabel: 'Rain Intensity',
    defaultParam: 70,
    cssClass: 'vfx-rain',
  },
  {
    id: 'fire_embers_sparks',
    label: 'Fire Embers',
    category: 'atmosphere',
    description: 'Golden glowing sparks drifting upwards with heat shimmer turbulence',
    icon: 'local_fire_department',
    badge: 'PRO',
    defaultIntensity: 75,
    defaultSpeed: 55,
    paramLabel: 'Spark Count',
    defaultParam: 65,
    colorHex: '#f59e0b',
    cssClass: 'vfx-fire-embers',
  },
  {
    id: 'dust_bokeh_motes',
    label: 'Floating Dust Bokeh',
    category: 'atmosphere',
    description: 'Luminous out-of-focus golden light spheres drifting in air',
    icon: 'blur_on',
    defaultIntensity: 65,
    defaultSpeed: 35,
    paramLabel: 'Bokeh Size',
    defaultParam: 55,
    colorHex: '#fde047',
    cssClass: 'vfx-dust-bokeh',
  },

  // 8. Split & DSK
  {
    id: 'split_screen_2_v',
    label: '2-Screen Vertical',
    category: 'split_dsk',
    description: 'Dual side-by-side vertical split frame with border hairline',
    icon: 'view_column',
    defaultIntensity: 100,
    defaultSpeed: 0,
    paramLabel: 'Border Width',
    defaultParam: 30,
    colorHex: '#ffffff',
    cssClass: 'vfx-split-2',
  },
  {
    id: 'split_screen_4_quad',
    label: '4-Screen Matrix',
    category: 'split_dsk',
    description: 'Quadrant grid security monitor matrix composition',
    icon: 'grid_view',
    badge: 'PRO',
    defaultIntensity: 100,
    defaultSpeed: 0,
    paramLabel: 'Gutter Width',
    defaultParam: 30,
    colorHex: '#ffffff',
    cssClass: 'vfx-split-4',
  },
  {
    id: 'comic_ink_outline',
    label: 'Comic Line Art',
    category: 'split_dsk',
    description: 'Graphic novel black contour ink outlines with pop halftone shading',
    icon: 'draw',
    defaultIntensity: 80,
    defaultSpeed: 20,
    paramLabel: 'Ink Threshold',
    defaultParam: 65,
    cssClass: 'vfx-comic-ink',
  },
  {
    id: 'thermal_vision_infrared',
    label: 'Thermal Vision',
    category: 'split_dsk',
    description: 'Predator military infrared false-color thermal heat spectrum',
    icon: 'device_thermostat',
    defaultIntensity: 85,
    defaultSpeed: 30,
    paramLabel: 'Heat Range',
    defaultParam: 60,
    cssClass: 'vfx-thermal-vision',
  },
] as const;

export function videoEffectPresetById(id: string): VideoEffectPreset | undefined {
  return VIDEO_EFFECT_PRESETS.find((preset) => preset.id === id);
}

/**
 * Builds CSS inline style attributes corresponding to a VideoEffectSettings object.
 */
export function buildVideoEffectStyle(
  effect: VideoEffectSettings | undefined,
): React.CSSProperties {
  if (!effect || effect.disabled) return {};
  const speedSec = Math.max(0.2, (100 - effect.speed) / 50 + 0.2);
  const intensity = effect.intensity / 100;

  return {
    ['--vfx-speed' as string]: `${speedSec.toFixed(2)}s`,
    ['--vfx-intensity' as string]: intensity.toFixed(2),
    ['--vfx-scale' as string]: ((effect.scale ?? 50) / 50).toFixed(2),
    ['--vfx-param' as string]: ((effect.param ?? 50) / 100).toFixed(2),
    ['--vfx-color' as string]: effect.colorHex || '#ffffff',
  };
}
