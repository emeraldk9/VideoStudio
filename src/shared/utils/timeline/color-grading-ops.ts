/**
 * Step S30 — 3-Way Color Grading Mathematics & Filter Graph Operations
 *
 * Professional primary color correction:
 * - 3-Way Color Wheels: Lift (Shadows), Gamma (Midtones), Gain (Highlights)
 * - White Balance: Temperature (-100 to +100) & Tint (-100 to +100)
 * - Tone Controls: Exposure (-4 to +4 EV), Contrast (0.5 to 2.0), Saturation (0 to 2.0), Vibrance (-100 to +100)
 * - Dual Engine: ffmpeg `colorbalance` + `eq` render chain & CSS/SVG preview pipeline
 */

export interface ColorWheelValue {
  /** Red component offset (-1.0 to +1.0) */
  r: number;
  /** Green component offset (-1.0 to +1.0) */
  g: number;
  /** Blue component offset (-1.0 to +1.0) */
  b: number;
  /** Master luminance offset (-1.0 to +1.0) */
  luma: number;
}

export interface ColorGradingSettings {
  /** Shadows color balance & luminance (-1.0 to +1.0) */
  lift: ColorWheelValue;
  /** Midtones color balance & luminance (-1.0 to +1.0) */
  gamma: ColorWheelValue;
  /** Highlights color balance & luminance (-1.0 to +1.0) */
  gain: ColorWheelValue;
  /** Color temperature in arbitrary kelvin-equivalent units: -100 (Cool/Blue) to +100 (Warm/Amber) */
  temperature: number;
  /** Color tint: -100 (Green) to +100 (Magenta) */
  tint: number;
  /** Exposure in EV stops (-4.0 to +4.0) */
  exposure: number;
  /** Contrast multiplier (0.5 to 2.0, default 1.0) */
  contrast: number;
  /** Saturation multiplier (0.0 to 2.0, default 1.0) */
  saturation: number;
  /** Vibrance: smart saturation protecting skin tones (-100 to +100) */
  vibrance: number;
}

export const DEFAULT_COLOR_WHEEL_VALUE: ColorWheelValue = {
  r: 0,
  g: 0,
  b: 0,
  luma: 0,
};

export const DEFAULT_COLOR_GRADING: ColorGradingSettings = {
  lift: { ...DEFAULT_COLOR_WHEEL_VALUE },
  gamma: { ...DEFAULT_COLOR_WHEEL_VALUE },
  gain: { ...DEFAULT_COLOR_WHEEL_VALUE },
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 1.0,
  saturation: 1.0,
  vibrance: 0,
};

/**
 * Converts a polar coordinate (angle in radians, normalized distance 0..1)
 * from a color wheel into RGB component offsets (-1.0 to +1.0).
 * 0 radians points right (0° / Red-Amber), PI/2 points down, PI points left (Cyan), etc.
 */
export function colorWheelToRgb(
  angleRad: number,
  distanceNormalized: number,
): { r: number; g: number; b: number } {
  const dist = Math.min(1, Math.max(0, distanceNormalized));
  if (dist < 0.005) {
    return { r: 0, g: 0, b: 0 };
  }

  // 3-phase chromatic calculation separated by 120° (2*PI / 3)
  // Red phase at 0 rad
  // Green phase at 2*PI / 3 (120°)
  // Blue phase at 4*PI / 3 (240°)
  const rOffset = Math.cos(angleRad) * dist;
  const gOffset = Math.cos(angleRad - (2 * Math.PI) / 3) * dist;
  const bOffset = Math.cos(angleRad - (4 * Math.PI) / 3) * dist;

  return {
    r: Math.min(1, Math.max(-1, rOffset)),
    g: Math.min(1, Math.max(-1, gOffset)),
    b: Math.min(1, Math.max(-1, bOffset)),
  };
}

/**
 * Converts RGB component offsets into polar coordinates for color wheel display.
 */
export function rgbToColorWheel(
  r: number,
  g: number,
  b: number,
): { angleRad: number; distanceNormalized: number } {
  // Project RGB offsets onto 2D plane
  const x = r - 0.5 * (g + b);
  const y = (Math.sqrt(3) / 2) * (g - b);

  const distance = Math.min(1, Math.hypot(x, y));
  if (distance < 0.005) {
    return { angleRad: 0, distanceNormalized: 0 };
  }

  let angle = Math.atan2(y, x);
  if (angle < 0) {
    angle += 2 * Math.PI;
  }

  return { angleRad: angle, distanceNormalized: distance };
}

function isWheelNeutral(w: ColorWheelValue | undefined): boolean {
  if (!w) return true;
  return (
    Math.abs(w.r) < 0.001 &&
    Math.abs(w.g) < 0.001 &&
    Math.abs(w.b) < 0.001 &&
    Math.abs(w.luma) < 0.001
  );
}

/**
 * Returns true if all grading values are at identity/neutral state.
 */
export function isNeutralColorGrading(settings: ColorGradingSettings | undefined): boolean {
  if (!settings) return true;
  return (
    isWheelNeutral(settings.lift) &&
    isWheelNeutral(settings.gamma) &&
    isWheelNeutral(settings.gain) &&
    Math.abs(settings.temperature) < 0.01 &&
    Math.abs(settings.tint) < 0.01 &&
    Math.abs(settings.exposure) < 0.01 &&
    Math.abs(settings.contrast - 1.0) < 0.001 &&
    Math.abs(settings.saturation - 1.0) < 0.001 &&
    Math.abs(settings.vibrance) < 0.01
  );
}

/**
 * Clamps a number to a specific range and formats with fixed decimal places.
 */
function clampRound(val: number, min: number, max: number, decimals = 3): number {
  const clamped = Math.min(max, Math.max(min, val));
  return Number(clamped.toFixed(decimals));
}

/**
 * Builds the ffmpeg filter chain string for color grading:
 * Combines `colorbalance` (for 3-way Lift/Gamma/Gain wheels, Temperature, Tint)
 * and `eq` (for Exposure, Contrast, Saturation, Luma).
 */
export function buildFfmpegColorBalanceFilter(
  settings: ColorGradingSettings | undefined,
): string {
  if (!settings || isNeutralColorGrading(settings)) {
    return '';
  }

  const parts: string[] = [];

  // 1. Calculate White Balance offsets
  // Temperature: positive warms highlights/midtones (adds Red, subtracts Blue)
  // Tint: positive adds Magenta (adds Red+Blue, subtracts Green)
  const tempNorm = settings.temperature / 100; // -1.0 to +1.0
  const tintNorm = settings.tint / 100;       // -1.0 to +1.0

  const tempRed = tempNorm * 0.4;
  const tempBlue = -tempNorm * 0.4;

  const tintRed = tintNorm * 0.2;
  const tintGreen = -tintNorm * 0.35;
  const tintBlue = tintNorm * 0.2;

  // 2. Sum colorbalance parameters:
  // Shadows (Lift): rs, gs, bs (-1.0 to 1.0)
  const rs = clampRound(settings.lift.r + tempRed * 0.2 + tintRed * 0.2, -1, 1);
  const gs = clampRound(settings.lift.g + tintGreen * 0.2, -1, 1);
  const bs = clampRound(settings.lift.b + tempBlue * 0.2 + tintBlue * 0.2, -1, 1);

  // Midtones (Gamma): rm, gm, bm (-1.0 to 1.0)
  const rm = clampRound(settings.gamma.r + tempRed * 0.6 + tintRed * 0.6, -1, 1);
  const gm = clampRound(settings.gamma.g + tintGreen * 0.6, -1, 1);
  const bm = clampRound(settings.gamma.b + tempBlue * 0.6 + tintBlue * 0.6, -1, 1);

  // Highlights (Gain): rh, gh, bh (-1.0 to 1.0)
  const rh = clampRound(settings.gain.r + tempRed + tintRed, -1, 1);
  const gh = clampRound(settings.gain.g + tintGreen, -1, 1);
  const bh = clampRound(settings.gain.b + tempBlue + tintBlue, -1, 1);

  const hasColorBalance =
    Math.abs(rs) > 0.001 ||
    Math.abs(gs) > 0.001 ||
    Math.abs(bs) > 0.001 ||
    Math.abs(rm) > 0.001 ||
    Math.abs(gm) > 0.001 ||
    Math.abs(bm) > 0.001 ||
    Math.abs(rh) > 0.001 ||
    Math.abs(gh) > 0.001 ||
    Math.abs(bh) > 0.001;

  if (hasColorBalance) {
    const cbParams: string[] = [];
    if (Math.abs(rs) > 0.001) cbParams.push(`rs=${rs}`);
    if (Math.abs(gs) > 0.001) cbParams.push(`gs=${gs}`);
    if (Math.abs(bs) > 0.001) cbParams.push(`bs=${bs}`);

    if (Math.abs(rm) > 0.001) cbParams.push(`rm=${rm}`);
    if (Math.abs(gm) > 0.001) cbParams.push(`gm=${gm}`);
    if (Math.abs(bm) > 0.001) cbParams.push(`bm=${bm}`);

    if (Math.abs(rh) > 0.001) cbParams.push(`rh=${rh}`);
    if (Math.abs(gh) > 0.001) cbParams.push(`gh=${gh}`);
    if (Math.abs(bh) > 0.001) cbParams.push(`bh=${bh}`);

    parts.push(`colorbalance=${cbParams.join(':')}`);
  }

  // 3. Calculate tone and luminance adjustments for eq filter
  // Exposure (-4..4) translates to brightness adjustment (-0.5..0.5)
  // Lift luma adds directly to brightness baseline
  const exposureBrightness = settings.exposure * 0.125;
  const totalBrightness = clampRound(
    exposureBrightness + settings.lift.luma * 0.2 + settings.gain.luma * 0.2,
    -1,
    1,
  );

  const totalContrast = clampRound(
    settings.contrast * (1.0 + (settings.gain.luma - settings.lift.luma) * 0.3),
    0.1,
    3.0,
  );

  // Vibrance compounds with saturation
  const vibranceSaturation = (settings.vibrance / 100) * 0.5;
  const totalSaturation = clampRound(
    Math.max(0, settings.saturation + vibranceSaturation),
    0,
    3.0,
  );

  // Gamma luma maps to eq gamma (0.1 to 10.0, default 1.0)
  // Positive gamma luma brightens midtones (lower gamma value in eq, or inverted exponent)
  const gammaExponent = clampRound(Math.pow(2, -settings.gamma.luma * 1.5), 0.2, 5.0);

  const eqParams: string[] = [];
  if (Math.abs(totalBrightness) > 0.001) eqParams.push(`brightness=${totalBrightness}`);
  if (Math.abs(totalContrast - 1.0) > 0.001) eqParams.push(`contrast=${totalContrast}`);
  if (Math.abs(totalSaturation - 1.0) > 0.001) eqParams.push(`saturation=${totalSaturation}`);
  if (Math.abs(gammaExponent - 1.0) > 0.001) eqParams.push(`gamma=${gammaExponent}`);

  if (eqParams.length > 0) {
    parts.push(`eq=${eqParams.join(':')}`);
  }

  return parts.join(',');
}

/**
 * Builds CSS filter style properties for real-time video/canvas preview.
 * Translates exposure, contrast, saturation, and temperature/tint hue rotation.
 */
export function buildCssColorFilter(
  settings: ColorGradingSettings | undefined,
): string {
  if (!settings || isNeutralColorGrading(settings)) {
    return '';
  }

  const filters: string[] = [];

  // Brightness: base 100%, + exposure and lift/gain luma
  const brightnessPct = Math.max(
    0,
    Math.round(
      (1.0 + settings.exposure * 0.2 + settings.lift.luma * 0.25 + settings.gain.luma * 0.25) * 100,
    ),
  );
  if (brightnessPct !== 100) {
    filters.push(`brightness(${brightnessPct}%)`);
  }

  // Contrast: base 100%
  const contrastPct = Math.max(
    10,
    Math.round(settings.contrast * (1.0 + (settings.gain.luma - settings.lift.luma) * 0.3) * 100),
  );
  if (contrastPct !== 100) {
    filters.push(`contrast(${contrastPct}%)`);
  }

  // Saturation & Vibrance: base 100%
  const satPct = Math.max(
    0,
    Math.round((settings.saturation + (settings.vibrance / 100) * 0.4) * 100),
  );
  if (satPct !== 100) {
    filters.push(`saturate(${satPct}%)`);
  }

  // Tint / Temperature hue-rotate approximation for CSS preview
  // Amber / Warm -> slight negative hue; Blue / Cool -> slight positive hue
  // Magenta -> positive hue; Green -> negative hue
  const hueDeg = Math.round(
    (-settings.temperature * 0.15) + (settings.tint * 0.2) + (settings.gamma.r - settings.gamma.b) * 20,
  );
  if (Math.abs(hueDeg) >= 1) {
    filters.push(`hue-rotate(${hueDeg}deg)`);
  }

  // Sepia / warm tint wash if strong temperature
  if (settings.temperature > 15) {
    const sepiaPct = Math.min(40, Math.round((settings.temperature - 15) * 0.3));
    if (sepiaPct > 0) filters.push(`sepia(${sepiaPct}%)`);
  }

  return filters.join(' ');
}

/**
 * Color grading preset looks.
 */
export interface ColorGradingPreset {
  id: string;
  name: string;
  description: string;
  settings: ColorGradingSettings;
}

export const COLOR_GRADING_PRESETS: ColorGradingPreset[] = [
  {
    id: 'neutral',
    name: 'Reset / Neutral',
    description: 'Clean, uncolored baseline profile',
    settings: { ...DEFAULT_COLOR_GRADING },
  },
  {
    id: 'teal_and_orange',
    name: 'Teal & Orange',
    description: 'Blockbuster cinematic look: cool shadows with warm skin-tone highlights',
    settings: {
      lift: { r: -0.15, g: 0.05, b: 0.25, luma: -0.05 },
      gamma: { r: 0.05, g: -0.02, b: -0.08, luma: 0 },
      gain: { r: 0.25, g: 0.1, b: -0.2, luma: 0.05 },
      temperature: 12,
      tint: -4,
      exposure: 0,
      contrast: 1.25,
      saturation: 1.15,
      vibrance: 20,
    },
  },
  {
    id: 'warm_sunset',
    name: 'Golden Hour / Sunset',
    description: 'Rich amber highlights, golden midtones, and soft lifted shadows',
    settings: {
      lift: { r: 0.1, g: -0.02, b: -0.05, luma: 0.05 },
      gamma: { r: 0.2, g: 0.05, b: -0.15, luma: 0 },
      gain: { r: 0.35, g: 0.15, b: -0.3, luma: 0.08 },
      temperature: 35,
      tint: 8,
      exposure: 0.2,
      contrast: 1.1,
      saturation: 1.2,
      vibrance: 25,
    },
  },
  {
    id: 'cool_noir',
    name: 'Moody Film Noir',
    description: 'Desaturated, high-contrast monochrome with cool shadow depth',
    settings: {
      lift: { r: -0.05, g: 0.0, b: 0.12, luma: -0.15 },
      gamma: { r: -0.02, g: 0.0, b: 0.05, luma: -0.05 },
      gain: { r: 0.0, g: 0.02, b: 0.06, luma: 0.1 },
      temperature: -20,
      tint: 2,
      exposure: -0.1,
      contrast: 1.45,
      saturation: 0.35,
      vibrance: -40,
    },
  },
  {
    id: 'bleach_bypass',
    name: 'Bleach Bypass',
    description: 'Silver-retention cinema process: harsh contrast, muted saturation',
    settings: {
      lift: { r: 0.05, g: 0.05, b: 0.05, luma: -0.1 },
      gamma: { r: 0.0, g: 0.0, b: 0.0, luma: 0.1 },
      gain: { r: 0.1, g: 0.1, b: 0.08, luma: 0.15 },
      temperature: -5,
      tint: 0,
      exposure: 0.1,
      contrast: 1.5,
      saturation: 0.6,
      vibrance: -30,
    },
  },
];
