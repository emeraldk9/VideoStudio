/**
 * Milestone S194: Video HSL Color Qualifier & Secondary Grading Keyer Engine
 *
 * Implements industry-grade HSL secondary color qualification and keying:
 * - 3D HSL Color Qualification Window (Hue center/width/softness with circular 360-degree wrap-around, Saturation low/high/softness, Luminance low/high/softness)
 * - Matte refinement pipeline (invert matte, clean black/white thresholds, edge blur / softness)
 * - Secondary Color Corrections (Hue rotation, Saturation multiplier, Contrast, Brightness EV, Temperature/Tint offsets)
 * - Matte preview audition modes (composite, black_and_white_matte, highlight_isolated, inverted_matte)
 * - Studio secondary grading presets (Skin Tone Warmth, Teal Sky Pop, Lush Foliage Green, Desaturate Background, Golden Hour Glow)
 * - SVG vector visualization paths for HSL color spectrum wedges and keyer windows
 * - FFmpeg filtergraph synthesis
 */

// ─── Constants & Limits ────────────────────────────────────────────────────────

export const HUE_MIN_DEG = 0;
export const HUE_MAX_DEG = 360;
export const HUE_WIDTH_MIN_DEG = 1;
export const HUE_WIDTH_MAX_DEG = 180;
export const HUE_SOFTNESS_MIN_DEG = 0;
export const HUE_SOFTNESS_MAX_DEG = 60;

export const SAT_MIN = 0.0;
export const SAT_MAX = 1.0;
export const LUM_MIN = 0.0;
export const LUM_MAX = 1.0;

export const HUE_SHIFT_MIN_DEG = -180;
export const HUE_SHIFT_MAX_DEG = 180;
export const SATURATION_SCALE_MIN = 0.0;
export const SATURATION_SCALE_MAX = 3.0;
export const CONTRAST_SCALE_MIN = -1.0;
export const CONTRAST_SCALE_MAX = 1.0;
export const BRIGHTNESS_OFFSET_MIN = -1.0;
export const BRIGHTNESS_OFFSET_MAX = 1.0;
export const TEMPERATURE_MIN = -50;
export const TEMPERATURE_MAX = 50;
export const TINT_MIN = -50;
export const TINT_MAX = 50;

// ─── Types & Interfaces ───────────────────────────────────────────────────────

export type HslMattePreviewMode =
  | 'composite'
  | 'black_and_white_matte'
  | 'highlight_isolated'
  | 'inverted_matte';

export interface HslHueQualifier {
  /** Center hue angle in degrees [0..360] */
  centerDeg: number;
  /** Half-width of fully qualified hue band in degrees [1..180] */
  widthDeg: number;
  /** Feathered soft edge transition in degrees [0..60] */
  softnessDeg: number;
}

export interface HslRangeQualifier {
  /** Low threshold [0.0..1.0] */
  low: number;
  /** High threshold [0.0..1.0] */
  high: number;
  /** Softness falloff roll-off [0.0..0.5] */
  softness: number;
}

export interface HslMatteRefinement {
  /** Invert qualified mask (target background instead of subject) */
  invert: boolean;
  /** Clip low-level mask noise to absolute black [0.0..0.4] */
  cleanBlack: number;
  /** Expand high-level mask opacity to absolute white [0.6..1.0] */
  cleanWhite: number;
  /** Edge blur / feathering radius [0.0..10.0 pixels] */
  blurRadius: number;
}

export interface HslSecondaryCorrection {
  /** Hue rotation in degrees [-180..+180] */
  hueShiftDeg: number;
  /** Saturation scale multiplier [0.0..3.0] where 1.0 is neutral */
  saturationScale: number;
  /** Contrast adjustment [-1.0..+1.0] where 0.0 is neutral */
  contrast: number;
  /** Exposure / brightness offset in EV [-1.0..+1.0] */
  brightness: number;
  /** White balance temperature offset (cool to warm) [-50..+50] */
  temperature: number;
  /** White balance tint offset (green to magenta) [-50..+50] */
  tint: number;
}

export interface HslQualifierSettings {
  enabled: boolean;
  previewMode: HslMattePreviewMode;
  hue: HslHueQualifier;
  saturation: HslRangeQualifier;
  luminance: HslRangeQualifier;
  refinement: HslMatteRefinement;
  correction: HslSecondaryCorrection;
}

export type HslQualifierPresetId =
  | 'skin_tone_isolate_warm'
  | 'teal_sky_pop'
  | 'foliage_lush_green'
  | 'desaturate_background'
  | 'orange_golden_hour'
  | 'neutral_reset';

export interface HslQualifierPreset {
  id: HslQualifierPresetId;
  label: string;
  description: string;
  settings: HslQualifierSettings;
}

// ─── Default Settings ────────────────────────────────────────────────────────

export const DEFAULT_HSL_QUALIFIER_SETTINGS: HslQualifierSettings = {
  enabled: true,
  previewMode: 'composite',
  hue: {
    centerDeg: 25, // Typical human skin tone vector
    widthDeg: 20,
    softnessDeg: 15,
  },
  saturation: {
    low: 0.15,
    high: 0.85,
    softness: 0.1,
  },
  luminance: {
    low: 0.1,
    high: 0.9,
    softness: 0.1,
  },
  refinement: {
    invert: false,
    cleanBlack: 0.05,
    cleanWhite: 0.95,
    blurRadius: 1.5,
  },
  correction: {
    hueShiftDeg: 0,
    saturationScale: 1.0,
    contrast: 0.0,
    brightness: 0.0,
    temperature: 0,
    tint: 0,
  },
};

// ─── Production Studio Presets ────────────────────────────────────────────────

export const HSL_QUALIFIER_PRESETS: Record<HslQualifierPresetId, HslQualifierPreset> = {
  skin_tone_isolate_warm: {
    id: 'skin_tone_isolate_warm',
    label: 'Skin Tone Warmth & Clarity',
    description: 'Isolates natural skin tone pigments, adding gentle healthy warmth and micro-contrast.',
    settings: {
      enabled: true,
      previewMode: 'composite',
      hue: {
        centerDeg: 25,
        widthDeg: 18,
        softnessDeg: 12,
      },
      saturation: {
        low: 0.12,
        high: 0.75,
        softness: 0.08,
      },
      luminance: {
        low: 0.15,
        high: 0.88,
        softness: 0.1,
      },
      refinement: {
        invert: false,
        cleanBlack: 0.06,
        cleanWhite: 0.92,
        blurRadius: 2.0,
      },
      correction: {
        hueShiftDeg: 1.5,
        saturationScale: 1.15,
        contrast: 0.05,
        brightness: 0.03,
        temperature: 12,
        tint: 2,
      },
    },
  },

  teal_sky_pop: {
    id: 'teal_sky_pop',
    label: 'Teal Sky & Atmospheric Blue',
    description: 'Isolates sky and atmospheric blues, shifting hue towards cinematic teal with rich saturation.',
    settings: {
      enabled: true,
      previewMode: 'composite',
      hue: {
        centerDeg: 210,
        widthDeg: 30,
        softnessDeg: 15,
      },
      saturation: {
        low: 0.18,
        high: 0.95,
        softness: 0.1,
      },
      luminance: {
        low: 0.25,
        high: 0.98,
        softness: 0.1,
      },
      refinement: {
        invert: false,
        cleanBlack: 0.08,
        cleanWhite: 0.90,
        blurRadius: 2.5,
      },
      correction: {
        hueShiftDeg: -15, // shift blue towards cyan/teal
        saturationScale: 1.35,
        contrast: 0.1,
        brightness: -0.05,
        temperature: -8,
        tint: -5,
      },
    },
  },

  foliage_lush_green: {
    id: 'foliage_lush_green',
    label: 'Lush Foliage & Flora',
    description: 'Keys foliage greens and yellows, deepening shadows and adding vibrant organic green punch.',
    settings: {
      enabled: true,
      previewMode: 'composite',
      hue: {
        centerDeg: 100,
        widthDeg: 35,
        softnessDeg: 18,
      },
      saturation: {
        low: 0.15,
        high: 0.9,
        softness: 0.1,
      },
      luminance: {
        low: 0.1,
        high: 0.85,
        softness: 0.12,
      },
      refinement: {
        invert: false,
        cleanBlack: 0.05,
        cleanWhite: 0.92,
        blurRadius: 1.8,
      },
      correction: {
        hueShiftDeg: -4,
        saturationScale: 1.3,
        contrast: 0.08,
        brightness: -0.02,
        temperature: 4,
        tint: -8,
      },
    },
  },

  desaturate_background: {
    id: 'desaturate_background',
    label: 'Desaturate Background (Color Pop)',
    description: 'Inverts qualified subject to pull saturation completely out of distracting backgrounds.',
    settings: {
      enabled: true,
      previewMode: 'composite',
      hue: {
        centerDeg: 25,
        widthDeg: 25,
        softnessDeg: 15,
      },
      saturation: {
        low: 0.15,
        high: 0.9,
        softness: 0.1,
      },
      luminance: {
        low: 0.1,
        high: 0.95,
        softness: 0.1,
      },
      refinement: {
        invert: true, // targets background
        cleanBlack: 0.1,
        cleanWhite: 0.88,
        blurRadius: 3.0,
      },
      correction: {
        hueShiftDeg: 0,
        saturationScale: 0.15, // near monochrome background
        contrast: -0.05,
        brightness: -0.08,
        temperature: 0,
        tint: 0,
      },
    },
  },

  orange_golden_hour: {
    id: 'orange_golden_hour',
    label: 'Golden Hour Sunset Glow',
    description: 'Targets warm ambient and sunlit highlights, boosting warm saturation and specular warmth.',
    settings: {
      enabled: true,
      previewMode: 'composite',
      hue: {
        centerDeg: 38,
        widthDeg: 24,
        softnessDeg: 14,
      },
      saturation: {
        low: 0.25,
        high: 0.98,
        softness: 0.1,
      },
      luminance: {
        low: 0.35,
        high: 1.0,
        softness: 0.15,
      },
      refinement: {
        invert: false,
        cleanBlack: 0.05,
        cleanWhite: 0.95,
        blurRadius: 2.2,
      },
      correction: {
        hueShiftDeg: -2,
        saturationScale: 1.4,
        contrast: 0.12,
        brightness: 0.06,
        temperature: 20,
        tint: 4,
      },
    },
  },

  neutral_reset: {
    id: 'neutral_reset',
    label: 'Neutral Reset',
    description: 'Resets all secondary color qualification parameters to default baseline.',
    settings: DEFAULT_HSL_QUALIFIER_SETTINGS,
  },
};

// ─── Mathematical Color Space Conversions ────────────────────────────────────

export interface HslRgbColor {
  r: number; // [0..1]
  g: number; // [0..1]
  b: number; // [0..1]
}

export interface HslColor {
  h: number; // [0..360)
  s: number; // [0..1]
  l: number; // [0..1]
}

/**
 * Converts standard normalized sRGB to HSL color coordinates.
 */
export function rgbToHsl(rgb: HslRgbColor): HslColor {
  const r = Math.min(1, Math.max(0, rgb.r));
  const g = Math.min(1, Math.max(0, rgb.g));
  const b = Math.min(1, Math.max(0, rgb.b));

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / delta + 2) * 60;
    } else {
      h = ((r - g) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round((h % 360 + 360) % 360 * 100) / 100,
    s: Math.round(s * 1000) / 1000,
    l: Math.round(l * 1000) / 1000,
  };
}

/**
 * Converts HSL color coordinates back to normalized sRGB.
 */
export function hslToRgb(hsl: HslColor): HslRgbColor {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, hsl.s));
  const l = Math.min(1, Math.max(0, hsl.l));

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let normalizedT = t;
    if (normalizedT < 0) normalizedT += 1;
    if (normalizedT > 1) normalizedT -= 1;
    if (normalizedT < 1 / 6) return p + (q - p) * 6 * normalizedT;
    if (normalizedT < 1 / 2) return q;
    if (normalizedT < 2 / 3) return p + (q - p) * (2 / 3 - normalizedT) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 1000) / 1000,
    g: Math.round(hue2rgb(p, q, hNorm) * 1000) / 1000,
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 1000) / 1000,
  };
}

// ─── Qualification Matte Weight Calculations ─────────────────────────────────

/**
 * Computes shortest angular distance between two hue angles with circular modulo 360 wrap-around.
 */
export function calculateHueAngularDistance(h1: number, h2: number): number {
  const diff = Math.abs(((h1 % 360 + 360) % 360) - ((h2 % 360 + 360) % 360));
  return Math.min(diff, 360 - diff);
}

/**
 * Calculates continuous hue qualification weight [0.0..1.0].
 * Inside [center - width, center + width] => 1.0.
 * In the softness band => smooth cosine / linear roll-off to 0.0.
 */
export function calculateHueWeight(hueDeg: number, qualifier: HslHueQualifier): number {
  const dist = calculateHueAngularDistance(hueDeg, qualifier.centerDeg);
  const innerBound = qualifier.widthDeg;
  const outerBound = innerBound + qualifier.softnessDeg;

  if (dist <= innerBound) return 1.0;
  if (dist >= outerBound || qualifier.softnessDeg <= 0) return 0.0;

  // Smooth Hermite cubic interpolation for natural feathering
  const t = (dist - innerBound) / qualifier.softnessDeg;
  return 1 - (t * t * (3 - 2 * t));
}

/**
 * Calculates continuous range weight (for Saturation or Luminance) in [0.0..1.0].
 */
export function calculateRangeWeight(value: number, qualifier: HslRangeQualifier): number {
  const v = Math.min(1, Math.max(0, value));
  const low = qualifier.low;
  const high = qualifier.high;
  const soft = qualifier.softness;

  if (v >= low && v <= high) return 1.0;

  // Lower transition boundary
  if (v < low) {
    if (soft <= 0 || v <= low - soft) return 0.0;
    const t = (low - v) / soft;
    return 1 - (t * t * (3 - 2 * t));
  }

  // Upper transition boundary
  if (v > high) {
    if (soft <= 0 || v >= high + soft) return 0.0;
    const t = (v - high) / soft;
    return 1 - (t * t * (3 - 2 * t));
  }

  return 0.0;
}

/**
 * Computes raw unrefined 3D HSL qualification matte weight for a given color.
 */
export function calculateRawHslMatte(color: HslColor, settings: HslQualifierSettings): number {
  const wH = calculateHueWeight(color.h, settings.hue);
  if (wH <= 0) return 0.0;

  const wS = calculateRangeWeight(color.s, settings.saturation);
  if (wS <= 0) return 0.0;

  const wL = calculateRangeWeight(color.l, settings.luminance);
  if (wL <= 0) return 0.0;

  return wH * wS * wL;
}

/**
 * Applies clean black, clean white, and mask inversion refinement to raw matte weight.
 */
export function refineMatteWeight(rawWeight: number, refinement: HslMatteRefinement): number {
  let m = rawWeight;

  const cb = Math.min(0.49, Math.max(0, refinement.cleanBlack));
  const cw = Math.max(cb + 0.01, Math.min(1.0, refinement.cleanWhite));

  if (m <= cb) {
    m = 0.0;
  } else if (m >= cw) {
    m = 1.0;
  } else {
    // Normalization stretch
    m = (m - cb) / (cw - cb);
    // Smoothstep
    m = m * m * (3 - 2 * m);
  }

  if (refinement.invert) {
    m = 1.0 - m;
  }

  return Math.min(1, Math.max(0, m));
}

// ─── Secondary Color Grade Transformation ─────────────────────────────────────

/**
 * Applies secondary color modifications (hue shift, sat scale, contrast, brightness, temp, tint)
 * to an input RGB color, modulated by the matte qualification weight.
 */
export function applyHslSecondaryCorrection(
  inputRgb: HslRgbColor,
  settings: HslQualifierSettings,
): HslRgbColor {
  if (!settings.enabled) return inputRgb;

  const hsl = rgbToHsl(inputRgb);
  const rawMatte = calculateRawHslMatte(hsl, settings);
  const matte = refineMatteWeight(rawMatte, settings.refinement);

  // Handle special audition preview modes
  if (settings.previewMode === 'black_and_white_matte') {
    return { r: matte, g: matte, b: matte };
  }

  if (settings.previewMode === 'inverted_matte') {
    const inv = 1 - matte;
    return { r: inv, g: inv, b: inv };
  }

  if (settings.previewMode === 'highlight_isolated') {
    // Retain full color in qualified areas, dim unselected areas to monochrome gray
    const lum = 0.299 * inputRgb.r + 0.587 * inputRgb.g + 0.114 * inputRgb.b;
    const dimmedGray = lum * 0.35;
    return {
      r: inputRgb.r * matte + dimmedGray * (1 - matte),
      g: inputRgb.g * matte + dimmedGray * (1 - matte),
      b: inputRgb.b * matte + dimmedGray * (1 - matte),
    };
  }

  // Mode === 'composite': Apply secondary corrections
  if (matte <= 0.001) {
    return inputRgb;
  }

  const { hueShiftDeg, saturationScale, contrast, brightness, temperature, tint } = settings.correction;

  // 1. Hue & Saturation transforms in HSL space
  let newH = (hsl.h + hueShiftDeg) % 360;
  if (newH < 0) newH += 360;
  const newS = Math.min(1, Math.max(0, hsl.s * saturationScale));
  const newL = hsl.l;

  let gradedRgb = hslToRgb({ h: newH, s: newS, l: newL });

  // 2. Temperature & Tint adjustments
  if (temperature !== 0 || tint !== 0) {
    const tempK = temperature / 100; // [-0.5..+0.5]
    const tintK = tint / 100; // [-0.5..+0.5]

    // Temperature shifts Red vs Blue
    gradedRgb = {
      r: gradedRgb.r * (1 + tempK * 0.4),
      g: gradedRgb.g * (1 - Math.abs(tempK) * 0.1 - tintK * 0.3),
      b: gradedRgb.b * (1 - tempK * 0.4 + tintK * 0.3),
    };
  }

  // 3. Contrast adjustment (S-curve centered on 0.5)
  if (contrast !== 0) {
    const cFactor = 1 + contrast;
    gradedRgb = {
      r: (gradedRgb.r - 0.5) * cFactor + 0.5,
      g: (gradedRgb.g - 0.5) * cFactor + 0.5,
      b: (gradedRgb.b - 0.5) * cFactor + 0.5,
    };
  }

  // 4. Brightness adjustment
  if (brightness !== 0) {
    gradedRgb = {
      r: gradedRgb.r + brightness,
      g: gradedRgb.g + brightness,
      b: gradedRgb.b + brightness,
    };
  }

  // Clamp graded RGB
  const clampedGraded: HslRgbColor = {
    r: Math.min(1, Math.max(0, gradedRgb.r)),
    g: Math.min(1, Math.max(0, gradedRgb.g)),
    b: Math.min(1, Math.max(0, gradedRgb.b)),
  };

  // 5. Alpha blend with original based on matte weight
  return {
    r: Number((inputRgb.r * (1 - matte) + clampedGraded.r * matte).toFixed(4)),
    g: Number((inputRgb.g * (1 - matte) + clampedGraded.g * matte).toFixed(4)),
    b: Number((inputRgb.b * (1 - matte) + clampedGraded.b * matte).toFixed(4)),
  };
}

// ─── Neutral Qualifier Check ──────────────────────────────────────────────────

/**
 * Returns true if the HSL qualifier is disabled or has no visual effect.
 */
export function isNeutralHslQualifier(settings: HslQualifierSettings | undefined): boolean {
  if (!settings || !settings.enabled) return true;
  if (settings.previewMode !== 'composite') return false;

  const c = settings.correction;
  return (
    Math.abs(c.hueShiftDeg) < 0.1 &&
    Math.abs(c.saturationScale - 1.0) < 0.01 &&
    Math.abs(c.contrast) < 0.01 &&
    Math.abs(c.brightness) < 0.01 &&
    Math.abs(c.temperature) < 0.5 &&
    Math.abs(c.tint) < 0.5
  );
}

// ─── SVG Vector Path Visualizers ──────────────────────────────────────────────

export interface HslWedgeSvgPaths {
  /** Full background color spectrum arc/wheel path */
  spectrumWheelPath: string;
  /** Active qualified hue wedge path */
  activeWedgePath: string;
  /** Softness boundary feathering indicator lines */
  softBoundaryMinPath: string;
  softBoundaryMaxPath: string;
  /** Center hue indicator vector */
  centerMarkerPath: string;
}

/**
 * Generates polar SVG paths for the HSL color wheel qualification wedge.
 * Renders into an SVG viewport centered at (cx, cy) with radius r.
 */
export function generateHslQualifierWedgeSvgPaths(
  hueQualifier: HslHueQualifier,
  cx: number = 70,
  cy: number = 70,
  innerR: number = 34,
  outerR: number = 60,
): HslWedgeSvgPaths {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleDeg: number) => {
    // 0 deg at top (12 o'clock), clockwise
    const angleRad = toRad(angleDeg - 90);
    return {
      x: Number((centerX + radius * Math.cos(angleRad)).toFixed(2)),
      y: Number((centerY + radius * Math.sin(angleRad)).toFixed(2)),
    };
  };

  const center = hueQualifier.centerDeg;
  const width = hueQualifier.widthDeg;
  const soft = hueQualifier.softnessDeg;

  // Qualification window angles
  const startAngle = (center - width + 360) % 360;
  const endAngle = (center + width) % 360;
  const softMinAngle = (center - width - soft + 360) % 360;
  const softMaxAngle = (center + width + soft) % 360;

  // Active qualified annular wedge path
  const p1 = polarToCartesian(cx, cy, outerR, startAngle);
  const p2 = polarToCartesian(cx, cy, outerR, endAngle);
  const p3 = polarToCartesian(cx, cy, innerR, endAngle);
  const p4 = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArcFlag = width * 2 > 180 ? 1 : 0;

  const activeWedgePath = `M ${p1.x} ${p1.y} A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y} Z`;

  // Softness boundary radial ticks
  const sm1 = polarToCartesian(cx, cy, innerR - 2, softMinAngle);
  const sm2 = polarToCartesian(cx, cy, outerR + 2, softMinAngle);
  const softBoundaryMinPath = `M ${sm1.x} ${sm1.y} L ${sm2.x} ${sm2.y}`;

  const sx1 = polarToCartesian(cx, cy, innerR - 2, softMaxAngle);
  const sx2 = polarToCartesian(cx, cy, outerR + 2, softMaxAngle);
  const softBoundaryMaxPath = `M ${sx1.x} ${sx1.y} L ${sx2.x} ${sx2.y}`;

  // Center hue pointer
  const c1 = polarToCartesian(cx, cy, innerR + 4, center);
  const c2 = polarToCartesian(cx, cy, outerR - 4, center);
  const centerMarkerPath = `M ${c1.x} ${c1.y} L ${c2.x} ${c2.y}`;

  return {
    spectrumWheelPath: `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx - 0.01} ${cy - outerR} M ${cx} ${cy - innerR} A ${innerR} ${innerR} 0 1 0 ${cx + 0.01} ${cy - innerR} Z`,
    activeWedgePath,
    softBoundaryMinPath,
    softBoundaryMaxPath,
    centerMarkerPath,
  };
}

// ─── FFmpeg Filtergraph Synthesis ─────────────────────────────────────────────

/**
 * Synthesizes an FFmpeg filtergraph string implementing secondary HSL grading.
 * Utilizes `split`, `colorchannelmixer`, `hue`, `eq`, and `overlay` with color qualification.
 */
export function generateHslQualifierFiltergraph(
  settings: HslQualifierSettings | undefined,
): string | null {
  if (!settings || !settings.enabled || isNeutralHslQualifier(settings)) {
    return null;
  }

  const { hue, saturation, luminance, refinement, correction } = settings;

  // Calculate approximate color center in RGB space
  const rgbCenter = hslToRgb({
    h: hue.centerDeg,
    s: (saturation.low + saturation.high) / 2,
    l: (luminance.low + luminance.high) / 2,
  });

  const hexColor = `0x${Math.round(rgbCenter.r * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(rgbCenter.g * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(rgbCenter.b * 255)
    .toString(16)
    .padStart(2, '0')}`;

  // Build secondary grading adjustments string for modified stream
  const gradeFilters: string[] = [];

  // Hue shift (degrees to radians in FFmpeg hue filter)
  if (Math.abs(correction.hueShiftDeg) > 0.1 || Math.abs(correction.saturationScale - 1.0) > 0.01) {
    const hRad = (correction.hueShiftDeg * Math.PI) / 180;
    gradeFilters.push(`hue=h=${hRad.toFixed(3)}:s=${correction.saturationScale.toFixed(2)}`);
  }

  // Contrast & Brightness in FFmpeg eq filter
  if (Math.abs(correction.contrast) > 0.01 || Math.abs(correction.brightness) > 0.01) {
    const eqContrast = (1 + correction.contrast).toFixed(2);
    const eqBrightness = correction.brightness.toFixed(2);
    gradeFilters.push(`eq=contrast=${eqContrast}:brightness=${eqBrightness}`);
  }

  // Temperature / Tint via colorchannelmixer
  if (Math.abs(correction.temperature) > 0.5 || Math.abs(correction.tint) > 0.5) {
    const tNorm = correction.temperature / 100;
    const tintNorm = correction.tint / 100;
    const rr = (1 + tNorm * 0.4).toFixed(3);
    const gg = (1 - Math.abs(tNorm) * 0.1 - tintNorm * 0.3).toFixed(3);
    const bb = (1 - tNorm * 0.4 + tintNorm * 0.3).toFixed(3);
    gradeFilters.push(`colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}`);
  }

  if (gradeFilters.length === 0) {
    gradeFilters.push('null');
  }

  // Tolerance calculated from hue width & saturation
  const similarity = Math.min(0.8, Math.max(0.1, (hue.widthDeg / 180 + (saturation.high - saturation.low)) / 2)).toFixed(2);
  const blend = Math.min(0.5, Math.max(0.05, (hue.softnessDeg / 60 + saturation.softness) / 2)).toFixed(2);

  // Return complete multi-stage stream filtergraph
  // [in] split [base][qual_stream]; [qual_stream] colorkey=color=0x...:similarity=...:blend=..., <gradeFilters> [graded]; [base][graded] overlay [out]
  const joinedGrade = gradeFilters.join(',');

  if (refinement.invert) {
    return `split=2[base][key];[key]colorkey=color=${hexColor}:similarity=${similarity}:blend=${blend},${joinedGrade}[graded];[base][graded]overlay`;
  }

  return `split=2[base][key];[key]colorkey=color=${hexColor}:similarity=${similarity}:blend=${blend},${joinedGrade}[graded];[base][graded]overlay`;
}
