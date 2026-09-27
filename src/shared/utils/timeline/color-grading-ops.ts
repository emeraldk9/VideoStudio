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

/** S164 — 2D Normalized Spline Control Point [x, y] in range [0, 1] */
export type CurvePoint = [number, number];

/** S164 — 4-Channel RGB Spline Curves Settings */
export interface RgbCurvesSettings {
  /** Master Luma curve points: default [[0, 0], [1, 1]] */
  all?: CurvePoint[];
  /** Red channel curve points: default [[0, 0], [1, 1]] */
  r?: CurvePoint[];
  /** Green channel curve points: default [[0, 0], [1, 1]] */
  g?: CurvePoint[];
  /** Blue channel curve points: default [[0, 0], [1, 1]] */
  b?: CurvePoint[];
}

export const DEFAULT_RGB_CURVES: RgbCurvesSettings = {
  all: [
    [0, 0],
    [1, 1],
  ],
  r: [
    [0, 0],
    [1, 1],
  ],
  g: [
    [0, 0],
    [1, 1],
  ],
  b: [
    [0, 0],
    [1, 1],
  ],
};

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
  /** S164 — 4-Channel RGB Spline Curves */
  curves?: RgbCurvesSettings;
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
 * Evaluates whether a set of curve control points is neutral / identity (y = x).
 */
export function isCurveNeutral(points: CurvePoint[] | undefined): boolean {
  if (!points || points.length === 0) return true;
  if (points.length === 2) {
    const [p0, p1] = points;
    return (
      Math.abs(p0[0] - 0) < 0.005 &&
      Math.abs(p0[1] - 0) < 0.005 &&
      Math.abs(p1[0] - 1) < 0.005 &&
      Math.abs(p1[1] - 1) < 0.005
    );
  }
  return points.every(([x, y]) => Math.abs(x - y) < 0.005);
}

/**
 * Checks if all channels in an RGB curves set are neutral.
 */
export function isNeutralCurves(curves: RgbCurvesSettings | undefined): boolean {
  if (!curves) return true;
  return (
    isCurveNeutral(curves.all) &&
    isCurveNeutral(curves.r) &&
    isCurveNeutral(curves.g) &&
    isCurveNeutral(curves.b)
  );
}

/**
 * S164 — Evaluates a smooth monotone cubic spline (Fritsch-Carlson) through the given
 * control points at position x in [0, 1]. Guarantees monotonicity without overshoot.
 */
export function evaluateMonotoneCubicSpline(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0][1];

  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  const n = sorted.length;

  if (x <= sorted[0][0]) return sorted[0][1];
  if (x >= sorted[n - 1][0]) return sorted[n - 1][1];

  const deltas: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = sorted[i + 1][0] - sorted[i][0];
    h.push(dx);
    deltas.push(dx > 0 ? (sorted[i + 1][1] - sorted[i][1]) / dx : 0);
  }

  const m: number[] = new Array(n).fill(0);
  m[0] = deltas[0];
  m[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (deltas[i - 1] + deltas[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-9) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / deltas[i];
      const beta = m[i + 1] / deltas[i];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[i] = tau * alpha * deltas[i];
        m[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    if (x >= sorted[i][0] && x <= sorted[i + 1][0]) {
      k = i;
      break;
    }
  }

  const dx = h[k];
  if (dx <= 0) return sorted[k][1];

  const t = (x - sorted[k][0]) / dx;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const y =
    h00 * sorted[k][1] +
    h10 * dx * m[k] +
    h01 * sorted[k + 1][1] +
    h11 * dx * m[k + 1];

  return Math.min(1, Math.max(0, y));
}

/**
 * S164 — Converts spline control points into an SVG path `d` string
 * using exact Hermite-to-Bézier conversion.
 */
export function generateCurveSvgPath(
  points: CurvePoint[],
  width = 240,
  height = 240,
): string {
  if (points.length === 0) return '';
  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  if (sorted.length === 1) {
    const y = (1 - sorted[0][1]) * height;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const n = sorted.length;
  const deltas: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = sorted[i + 1][0] - sorted[i][0];
    h.push(dx);
    deltas.push(dx > 0 ? (sorted[i + 1][1] - sorted[i][1]) / dx : 0);
  }

  const m: number[] = new Array(n).fill(0);
  m[0] = deltas[0];
  m[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (deltas[i - 1] + deltas[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-9) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / deltas[i];
      const beta = m[i + 1] / deltas[i];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[i] = tau * alpha * deltas[i];
        m[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  const toSvgX = (x: number) => Number((x * width).toFixed(2));
  const toSvgY = (y: number) => Number(((1 - y) * height).toFixed(2));

  let path = `M ${toSvgX(sorted[0][0])} ${toSvgY(sorted[0][1])}`;

  for (let i = 0; i < n - 1; i++) {
    const dx = h[i];
    const p0x = sorted[i][0];
    const p0y = sorted[i][1];
    const p3x = sorted[i + 1][0];
    const p3y = sorted[i + 1][1];

    const cp1x = p0x + dx / 3;
    const cp1y = p0y + (dx * m[i]) / 3;
    const cp2x = p3x - dx / 3;
    const cp2y = p3y - (dx * m[i + 1]) / 3;

    path += ` C ${toSvgX(cp1x)} ${toSvgY(cp1y)}, ${toSvgX(cp2x)} ${toSvgY(cp2y)}, ${toSvgX(p3x)} ${toSvgY(p3y)}`;
  }

  return path;
}

/**
 * S164 — Translates RGB spline curves into FFmpeg `curves` filter string.
 * Format: `curves=all='0/0 0.5/0.4 1/1':r='...'`
 */
export function buildFfmpegCurvesFilter(curves: RgbCurvesSettings | undefined): string {
  if (!curves || isNeutralCurves(curves)) return '';

  const formatPoints = (pts: CurvePoint[]) => {
    return pts
      .slice()
      .sort((a, b) => a[0] - b[0])
      .map(([x, y]) => `${clampRound(x, 0, 1)}/${clampRound(y, 0, 1)}`)
      .join(' ');
  };

  const channelParams: string[] = [];
  if (curves.all && !isCurveNeutral(curves.all)) {
    channelParams.push(`all='${formatPoints(curves.all)}'`);
  }
  if (curves.r && !isCurveNeutral(curves.r)) {
    channelParams.push(`r='${formatPoints(curves.r)}'`);
  }
  if (curves.g && !isCurveNeutral(curves.g)) {
    channelParams.push(`g='${formatPoints(curves.g)}'`);
  }
  if (curves.b && !isCurveNeutral(curves.b)) {
    channelParams.push(`b='${formatPoints(curves.b)}'`);
  }

  if (channelParams.length === 0) return '';
  return `curves=${channelParams.join(':')}`;
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
    Math.abs(settings.vibrance) < 0.01 &&
    isNeutralCurves(settings.curves)
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
 * and `eq` (for Exposure, Contrast, Saturation, Luma), and `curves` (RGB splines).
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

  const vibranceSaturation = (settings.vibrance / 100) * 0.5;
  const totalSaturation = clampRound(
    Math.max(0, settings.saturation + vibranceSaturation),
    0,
    3.0,
  );

  const gammaExponent = clampRound(Math.pow(2, -settings.gamma.luma * 1.5), 0.2, 5.0);

  const eqParams: string[] = [];
  if (Math.abs(totalBrightness) > 0.001) eqParams.push(`brightness=${totalBrightness}`);
  if (Math.abs(totalContrast - 1.0) > 0.001) eqParams.push(`contrast=${totalContrast}`);
  if (Math.abs(totalSaturation - 1.0) > 0.001) eqParams.push(`saturation=${totalSaturation}`);
  if (Math.abs(gammaExponent - 1.0) > 0.001) eqParams.push(`gamma=${gammaExponent}`);

  if (eqParams.length > 0) {
    parts.push(`eq=${eqParams.join(':')}`);
  }

  // 4. S164 — Append RGB Curves filter if defined
  if (settings.curves && !isNeutralCurves(settings.curves)) {
    const curvesFilter = buildFfmpegCurvesFilter(settings.curves);
    if (curvesFilter) {
      parts.push(curvesFilter);
    }
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
  {
    id: 'clean_commercial',
    name: 'Clean Commercial',
    description: 'Crisp broadcast pop with clean whites, vibrant skin tones, and rich midtones',
    settings: {
      lift: { r: -0.02, g: 0.0, b: 0.02, luma: -0.02 },
      gamma: { r: 0.02, g: 0.01, b: -0.02, luma: 0.04 },
      gain: { r: 0.05, g: 0.04, b: 0.02, luma: 0.05 },
      temperature: 4,
      tint: -2,
      exposure: 0.15,
      contrast: 1.18,
      saturation: 1.12,
      vibrance: 15,
      curves: {
        all: [
          [0, 0],
          [0.25, 0.22],
          [0.75, 0.78],
          [1, 1],
        ],
      },
    },
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Neon',
    description: 'Vibrant futuristic palette: deep cyan shadows and electrified magenta-pink highlights',
    settings: {
      lift: { r: -0.2, g: 0.1, b: 0.25, luma: -0.08 },
      gamma: { r: 0.1, g: -0.05, b: 0.12, luma: 0.02 },
      gain: { r: 0.35, g: -0.15, b: 0.25, luma: 0.1 },
      temperature: -10,
      tint: 25,
      exposure: 0.1,
      contrast: 1.35,
      saturation: 1.4,
      vibrance: 35,
      curves: {
        all: [
          [0, 0.04],
          [0.45, 0.42],
          [0.85, 0.92],
          [1, 1],
        ],
        r: [
          [0, 0],
          [0.7, 0.85],
          [1, 1],
        ],
        b: [
          [0, 0.08],
          [0.5, 0.55],
          [1, 1],
        ],
      },
    },
  },
];
