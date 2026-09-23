/**
 * Pure arithmetic, color calculus, and filter generators for Video Compositing,
 * Blend Modes, and Chroma Key (Green/Blue Screen Removal).
 *
 * Implements:
 * - 12 Standard NLE layer blend modes (Screen, Multiply, Overlay, Lighten, etc.)
 * - Broadcast-accurate Euclidean YUV Chroma Key color distance calculations
 * - Dual-threshold smoothstep edge antialiasing
 * - Green and Blue color spill suppression
 * - Pre-calibrated studio presets (Green Screen, Blue Screen, Magenta, Dark Key)
 * - FFmpeg chromakey + despill + blend filter expressions
 * - SVG feColorMatrix / feComponentTransfer generators for live DOM preview
 */

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export interface BlendModeDefinition {
  mode: BlendMode;
  label: string;
  category: 'normal' | 'darken' | 'lighten' | 'contrast' | 'inversion';
  description: string;
  ffmpegMode: string;
}

export const BLEND_MODES: readonly BlendModeDefinition[] = [
  {
    mode: 'normal',
    label: 'Normal',
    category: 'normal',
    description: 'Standard alpha compositing with no blending',
    ffmpegMode: 'normal',
  },
  {
    mode: 'screen',
    label: 'Screen',
    category: 'lighten',
    description: 'Lightens by multiplying inverse colors; ideal for fire, explosions, dust, light leaks',
    ffmpegMode: 'screen',
  },
  {
    mode: 'multiply',
    label: 'Multiply',
    category: 'darken',
    description: 'Multiplies colors to darken; ideal for shadows, ink sketches, vignettes',
    ffmpegMode: 'multiply',
  },
  {
    mode: 'overlay',
    label: 'Overlay',
    category: 'contrast',
    description: 'Combines multiply and screen; boosts midtone contrast and saturation',
    ffmpegMode: 'overlay',
  },
  {
    mode: 'darken',
    label: 'Darken',
    category: 'darken',
    description: 'Retains the darkest pixels between foreground and background',
    ffmpegMode: 'darken',
  },
  {
    mode: 'lighten',
    label: 'Lighten',
    category: 'lighten',
    description: 'Retains the brightest pixels between foreground and background',
    ffmpegMode: 'lighten',
  },
  {
    mode: 'color-dodge',
    label: 'Color Dodge',
    category: 'lighten',
    description: 'Brightens base color to reflect blend color; creates vibrant glow highlights',
    ffmpegMode: 'dodge',
  },
  {
    mode: 'color-burn',
    label: 'Color Burn',
    category: 'darken',
    description: 'Darkens base color to increase contrast; creates rich deep shadows',
    ffmpegMode: 'burn',
  },
  {
    mode: 'hard-light',
    label: 'Hard Light',
    category: 'contrast',
    description: 'Multiplies or screens based on overlay luminance; sharp dramatic lighting',
    ffmpegMode: 'hardlight',
  },
  {
    mode: 'soft-light',
    label: 'Soft Light',
    category: 'contrast',
    description: 'Subtle contrast boost simulating a diffused spotlight',
    ffmpegMode: 'softlight',
  },
  {
    mode: 'difference',
    label: 'Difference',
    category: 'inversion',
    description: 'Subtracts darker color from brighter; useful for alignment and psychedelic VFX',
    ffmpegMode: 'difference',
  },
  {
    mode: 'exclusion',
    label: 'Exclusion',
    category: 'inversion',
    description: 'Lower contrast version of difference mode with softer inversion',
    ffmpegMode: 'exclusion',
  },
];

export interface ChromaKeySettings {
  enabled: boolean;
  keyColorHex: string;       // e.g. '#00FF00'
  similarity: number;        // 0.01 to 1.0 (Color distance tolerance threshold)
  smoothness: number;        // 0.0 to 0.5 (Edge antialiasing softness band)
  spillSuppression: number;   // 0.0 to 1.0 (Spill reduction multiplier)
}

export type ChromaKeyPresetKey =
  | 'green_screen'
  | 'blue_screen'
  | 'magenta_screen'
  | 'dark_shadow_key'
  | 'high_key_white';

export interface ChromaKeyPreset {
  name: string;
  description: string;
  settings: Omit<ChromaKeySettings, 'enabled'>;
}

export const CHROMA_KEY_PRESETS: Record<ChromaKeyPresetKey, ChromaKeyPreset> = {
  green_screen: {
    name: 'Green Screen',
    description: 'Optimized for standard studio green backdrop (cyclorama or paper)',
    settings: {
      keyColorHex: '#00FF00',
      similarity: 0.35,
      smoothness: 0.08,
      spillSuppression: 0.6,
    },
  },
  blue_screen: {
    name: 'Blue Screen',
    description: 'Optimized for high-contrast blue cyc wall and fine hair details',
    settings: {
      keyColorHex: '#0000FF',
      similarity: 0.35,
      smoothness: 0.08,
      spillSuppression: 0.6,
    },
  },
  magenta_screen: {
    name: 'Magenta / Pink',
    description: 'High-visibility fluorescent magenta screen keying',
    settings: {
      keyColorHex: '#FF00FF',
      similarity: 0.30,
      smoothness: 0.06,
      spillSuppression: 0.5,
    },
  },
  dark_shadow_key: {
    name: 'Dark / Black Key',
    description: 'Removes deep black backgrounds for overlaying isolated graphics',
    settings: {
      keyColorHex: '#0A0A0A',
      similarity: 0.20,
      smoothness: 0.05,
      spillSuppression: 0.0,
    },
  },
  high_key_white: {
    name: 'High-Key White',
    description: 'Removes blown-out pure white backdrops',
    settings: {
      keyColorHex: '#F8F8F8',
      similarity: 0.22,
      smoothness: 0.05,
      spillSuppression: 0.0,
    },
  },
};

export const DEFAULT_CHROMA_KEY_SETTINGS: ChromaKeySettings = {
  enabled: false,
  ...CHROMA_KEY_PRESETS.green_screen.settings,
};

export interface RgbColor {
  r: number; // 0 to 255
  g: number; // 0 to 255
  b: number; // 0 to 255
}

export interface YuvColor {
  y: number; // 0.0 to 1.0 (Luminance)
  u: number; // -0.5 to 0.5 (Chroma Blue-difference)
  v: number; // -0.5 to 0.5 (Chroma Red-difference)
}

/**
 * Parses a Hex color string (e.g. '#00FF00' or '00FF00') into RGB components.
 */
export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return { r, g, b };
  }
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Formats RGB components into a standard 6-character hex code '#RRGGBB'.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hexR = clamp(r).toString(16).padStart(2, '0');
  const hexG = clamp(g).toString(16).padStart(2, '0');
  const hexB = clamp(b).toString(16).padStart(2, '0');
  return `#${hexR}${hexG}${hexB}`.toUpperCase();
}

/**
 * Converts RGB components [0, 255] to normalized YUV colorspace using ITU-R BT.601 coefficients.
 */
export function rgbToYuv(r: number, g: number, b: number): YuvColor {
  const normR = r / 255;
  const normG = g / 255;
  const normB = b / 255;

  const y = 0.299 * normR + 0.587 * normG + 0.114 * normB;
  const u = -0.14713 * normR - 0.28886 * normG + 0.436 * normB;
  const v = 0.615 * normR - 0.51499 * normG - 0.10001 * normB;

  return { y, u, v };
}

/**
 * Computes the Euclidean distance between two colors in UV chromaticity space.
 * Isolating chroma from luminance guarantees robust keying under uneven lighting.
 */
export function calculateChromaDistance(c1: RgbColor, c2: RgbColor): number {
  const yuv1 = rgbToYuv(c1.r, c1.g, c1.b);
  const yuv2 = rgbToYuv(c2.r, c2.g, c2.b);

  const du = yuv1.u - yuv2.u;
  const dv = yuv1.v - yuv2.v;

  return Math.sqrt(du * du + dv * dv);
}

/**
 * Calculates the resulting alpha matte value [0.0 (transparent) to 1.0 (opaque)]
 * for a pixel given the key color, similarity, and smoothness parameters.
 */
export function calculateKeyAlpha(
  pixelRgb: RgbColor,
  keyRgb: RgbColor,
  similarity: number,
  smoothness: number
): number {
  const dist = calculateChromaDistance(pixelRgb, keyRgb);
  const sim = Math.max(0.01, Math.min(1.0, similarity));
  const smooth = Math.max(0.0, Math.min(0.5, smoothness));

  // Key edge band thresholds
  const innerCut = Math.max(0, sim - smooth);
  const outerCut = sim + smooth;

  if (dist <= innerCut) {
    return 0.0; // Completely keyed out
  }
  if (dist >= outerCut || smooth <= 0.0001) {
    return 1.0; // Completely opaque
  }

  // Smoothstep transition band
  const t = (dist - innerCut) / (outerCut - innerCut);
  return t * t * (3 - 2 * t);
}

/**
 * Applies green or blue spill suppression to remove reflected backdrop light from edges and hair.
 */
export function applySpillSuppression(
  rgb: RgbColor,
  keyColorHex: string,
  spillFactor: number
): RgbColor {
  if (spillFactor <= 0) return rgb;

  const keyRgb = hexToRgb(keyColorHex);
  const isGreenKey = keyRgb.g > keyRgb.r && keyRgb.g > keyRgb.b;
  const isBlueKey = keyRgb.b > keyRgb.r && keyRgb.b > keyRgb.g;

  const factor = Math.max(0, Math.min(1.0, spillFactor));

  if (isGreenKey) {
    // Limit green to average of red and blue
    const limit = (rgb.r + rgb.b) / 2;
    if (rgb.g > limit) {
      const despilledG = limit + (1 - factor) * (rgb.g - limit);
      return { r: rgb.r, g: Math.round(despilledG), b: rgb.b };
    }
  } else if (isBlueKey) {
    // Limit blue to average of red and green
    const limit = (rgb.r + rgb.g) / 2;
    if (rgb.b > limit) {
      const despilledB = limit + (1 - factor) * (rgb.b - limit);
      return { r: rgb.r, g: rgb.g, b: Math.round(despilledB) };
    }
  }

  return rgb;
}

/**
 * Generates an FFmpeg filter segment for chroma keying and color spill suppression.
 * Uses native `chromakey` filter with color, similarity, and blend settings,
 * followed by `despill` when applicable.
 */
export function buildFfmpegChromaKeyFilter(settings: ChromaKeySettings | undefined): string {
  if (!settings || !settings.enabled) return '';

  const hex = settings.keyColorHex.replace(/^#/, '');
  const sim = Math.max(0.01, Math.min(1.0, settings.similarity)).toFixed(3);
  const blend = Math.max(0.0, Math.min(0.5, settings.smoothness)).toFixed(3);

  const filters: string[] = [];
  filters.push(`chromakey=color=0x${hex}:similarity=${sim}:blend=${blend}`);

  if (settings.spillSuppression > 0) {
    const keyRgb = hexToRgb(settings.keyColorHex);
    const spillMix = Math.max(0, Math.min(1.0, settings.spillSuppression)).toFixed(2);
    if (keyRgb.g > keyRgb.r && keyRgb.g > keyRgb.b) {
      filters.push(`despill=type=green:mix=${spillMix}`);
    } else if (keyRgb.b > keyRgb.r && keyRgb.b > keyRgb.g) {
      filters.push(`despill=type=blue:mix=${spillMix}`);
    }
  }

  return filters.join(',');
}

/**
 * Generates an FFmpeg blend filter argument for compositing overlay tracks.
 */
export function buildFfmpegBlendFilter(mode: BlendMode | undefined): string {
  if (!mode || mode === 'normal') return '';
  const def = BLEND_MODES.find((m) => m.mode === mode);
  const ffmpegMode = def ? def.ffmpegMode : 'normal';
  return `blend=all_mode='${ffmpegMode}'`;
}

/**
 * Computes SVG feColorMatrix values and component transfer parameters
 * to approximate chroma key alpha channel isolation in browser DOM preview.
 */
export function buildSvgChromaFilterMatrix(settings: ChromaKeySettings | undefined): {
  matrixValues: string;
  slope: number;
  intercept: number;
} {
  if (!settings || !settings.enabled) {
    return {
      matrixValues: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
      slope: 1,
      intercept: 0,
    };
  }

  const keyRgb = hexToRgb(settings.keyColorHex);
  const isGreen = keyRgb.g >= keyRgb.r && keyRgb.g >= keyRgb.b;
  const isBlue = keyRgb.b >= keyRgb.r && keyRgb.b >= keyRgb.g;

  // Calculate matrix weights that map key color distance to the alpha channel
  let aR = 0;
  let aG = 0;
  let aB = 0;

  if (isGreen) {
    // Alpha is derived from non-green dominance: (R + B) - G
    aR = 1.0;
    aG = -1.2;
    aB = 1.0;
  } else if (isBlue) {
    // Alpha is derived from non-blue dominance: (R + G) - B
    aR = 1.0;
    aG = 1.0;
    aB = -1.2;
  } else {
    // Luminance subtraction for dark key or white key
    aR = keyRgb.r > 128 ? -1.0 : 1.0;
    aG = keyRgb.g > 128 ? -1.0 : 1.0;
    aB = keyRgb.b > 128 ? -1.0 : 1.0;
  }

  const matrixValues = `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${aR.toFixed(2)} ${aG.toFixed(2)} ${aB.toFixed(2)} 0 1`;

  const sim = Math.max(0.05, Math.min(1.0, settings.similarity));
  const smooth = Math.max(0.02, Math.min(0.5, settings.smoothness));

  const slope = Math.round((1 / smooth) * 10) / 10;
  const intercept = Math.round(-((sim - smooth) / smooth) * 10) / 10;

  return { matrixValues, slope, intercept };
}
