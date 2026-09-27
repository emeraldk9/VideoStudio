/**
 * Whiteboard Multi-Color Pen Ribbon Blending & Gradient Transition Wash Operations.
 *
 * Implements porous felt-tip nib pigment washout dynamics:
 * 1. Capillary dye dissipation over arc-length wash distance L_wash (typically 20-80 px).
 * 2. Perceptually uniform color interpolation using OKLab color space to prevent muddy/grayish desaturation.
 * 3. 2D ribbon mesh construction with per-segment interpolated vertex colors and normal expansion.
 * 4. Micro-dithered noise blending for authentic fiber grain texture.
 */

export interface GradientWashSettings {
  enabled?: boolean;
  washLengthPx?: number;           // 10..150, default 45.0
  useOklab?: boolean;              // default true (perceptually uniform)
  secondaryColorHex?: string;      // default '#E11D48'
  ditherNoise?: number;            // 0.0..0.20, default 0.05
}

export const DEFAULT_GRADIENT_WASH_SETTINGS: Required<GradientWashSettings> = {
  enabled: false,
  washLengthPx: 45.0,
  useOklab: true,
  secondaryColorHex: '#E11D48',
  ditherNoise: 0.05,
};

export interface ColorStopTransition {
  offsetFraction: number; // 0.0 to 1.0 along the stroke arc length
  colorHex: string;
}

export interface RibbonPoint2D {
  x: number;
  y: number;
}

export interface GradientRibbonSegment {
  v0: RibbonPoint2D; // left edge start
  v1: RibbonPoint2D; // right edge start
  v2: RibbonPoint2D; // right edge end
  v3: RibbonPoint2D; // left edge end
  colorHex: string;
  arcLength: number;
}

import { hexToRgb, rgbToHex } from './compositing-ops';

export interface GradientRibbonMesh {
  segments: GradientRibbonSegment[];
  totalLength: number;
}

function srgbToLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}

export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const rLin = srgbToLinear(r / 255.0);
  const gLin = srgbToLinear(g / 255.0);
  const bLin = srgbToLinear(b / 255.0);

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;

  const lP = Math.cbrt(Math.max(0, l));
  const mP = Math.cbrt(Math.max(0, m));
  const sP = Math.cbrt(Math.max(0, s));

  const L = 0.2104542553 * lP + 0.7936177850 * mP - 0.0040720468 * sP;
  const a = 1.9779984951 * lP - 2.4285922050 * mP + 0.4505937099 * sP;
  const bOk = 0.0259040371 * lP + 0.7827717662 * mP - 0.8086757660 * sP;

  return { L, a, b: bOk };
}

export function oklabToRgb(L: number, a: number, bOk: number): { r: number; g: number; b: number } {
  const lP = L + 0.3963377774 * a + 0.2158037573 * bOk;
  const mP = L - 0.1055613458 * a - 0.0638541728 * bOk;
  const sP = L - 0.0894841775 * a - 1.2914855480 * bOk;

  const l = lP > 0 ? lP * lP * lP : 0;
  const m = mP > 0 ? mP * mP * mP : 0;
  const s = sP > 0 ? sP * sP * sP : 0;

  const rLin = +4.0767439362 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: Math.round(Math.max(0, Math.min(1, linearToSrgb(rLin))) * 255.0),
    g: Math.round(Math.max(0, Math.min(1, linearToSrgb(gLin))) * 255.0),
    b: Math.round(Math.max(0, Math.min(1, linearToSrgb(bLin))) * 255.0),
  };
}

/**
 * Interpolates between two hex colors.
 * When useOklab is true, performs smooth interpolation in OKLab space.
 */
export function interpolatePerceptualColor(
  colorA: string,
  colorB: string,
  t: number,
  useOklab = true
): string {
  const clampedT = Math.max(0.0, Math.min(1.0, t));
  if (clampedT <= 1e-4) return colorA;
  if (clampedT >= 0.9999) return colorB;

  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);

  if (!useOklab) {
    const r = rgbA.r + (rgbB.r - rgbA.r) * clampedT;
    const g = rgbA.g + (rgbB.g - rgbA.g) * clampedT;
    const b = rgbA.b + (rgbB.b - rgbA.b) * clampedT;
    return rgbToHex(r, g, b);
  }

  const labA = rgbToOklab(rgbA.r, rgbA.g, rgbA.b);
  const labB = rgbToOklab(rgbB.r, rgbB.g, rgbB.b);

  const L = labA.L + (labB.L - labA.L) * clampedT;
  const a = labA.a + (labB.a - labA.a) * clampedT;
  const b = labA.b + (labB.b - labA.b) * clampedT;

  const out = oklabToRgb(L, a, b);
  return rgbToHex(out.r, out.g, out.b);
}

/**
 * Generates ribbon quad mesh along path points with interpolated gradient wash colors.
 */
export function computeGradientRibbonMesh(
  points: RibbonPoint2D[],
  colorTransitions: ColorStopTransition[],
  strokeWidth = 6.0,
  washLengthPx = 45.0,
  useOklab = true
): GradientRibbonMesh {
  if (points.length < 2) {
    return { segments: [], totalLength: 0 };
  }

  // 1. Calculate cumulative arc length
  const arcLengths = [0.0];
  let totalLength = 0.0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    totalLength += d;
    arcLengths.push(totalLength);
  }

  if (totalLength <= 1e-3) {
    return { segments: [], totalLength: 0 };
  }

  // Sort transitions
  const sortedTransitions = [...colorTransitions].sort((a, b) => a.offsetFraction - b.offsetFraction);
  if (sortedTransitions.length === 0) {
    sortedTransitions.push({ offsetFraction: 0.0, colorHex: '#000000' });
  }

  const halfW = Math.max(0.5, strokeWidth * 0.5);
  const normals: RibbonPoint2D[] = [];

  for (let i = 0; i < points.length; i++) {
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = points[1].x - points[0].x;
      dy = points[1].y - points[0].y;
    } else if (i === points.length - 1) {
      dx = points[i].x - points[i - 1].x;
      dy = points[i].y - points[i - 1].y;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dy = points[i + 1].y - points[i - 1].y;
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 1e-6) {
      normals.push({ x: -dy / mag, y: dx / mag });
    } else {
      normals.push({ x: 0.0, y: 1.0 });
    }
  }

  const segments: GradientRibbonSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const n0 = normals[i];
    const n1 = normals[i + 1];

    const s0 = arcLengths[i];
    const s1 = arcLengths[i + 1];
    const sMid = (s0 + s1) * 0.5;
    const uMid = sMid / totalLength;

    // Resolve color at uMid
    let colorCurrent = sortedTransitions[0].colorHex;
    for (let k = 0; k < sortedTransitions.length - 1; k++) {
      const tStart = sortedTransitions[k].offsetFraction;
      const tEnd = sortedTransitions[k + 1].offsetFraction;
      const cStart = sortedTransitions[k].colorHex;
      const cEnd = sortedTransitions[k + 1].colorHex;

      if (uMid < tStart) {
        colorCurrent = cStart;
        break;
      } else if (uMid >= tStart && uMid <= tEnd) {
        const segLenPx = (tEnd - tStart) * totalLength;
        const effectiveWash = Math.min(washLengthPx, Math.max(1.0, segLenPx));
        const pxFromStart = (uMid - tStart) * totalLength;
        const tWash = Math.min(1.0, pxFromStart / effectiveWash);
        colorCurrent = interpolatePerceptualColor(cStart, cEnd, tWash, useOklab);
        break;
      } else {
        colorCurrent = cEnd;
      }
    }

    segments.push({
      v0: { x: p0.x - n0.x * halfW, y: p0.y - n0.y * halfW },
      v1: { x: p0.x + n0.x * halfW, y: p0.y + n0.y * halfW },
      v2: { x: p1.x + n1.x * halfW, y: p1.y + n1.y * halfW },
      v3: { x: p1.x - n1.x * halfW, y: p1.y - n1.y * halfW },
      colorHex: colorCurrent,
      arcLength: sMid,
    });
  }

  return { segments, totalLength };
}

/**
 * Serializes ribbon quad mesh into SVG polygon elements.
 */
export function generateGradientRibbonSvgDefs(mesh: GradientRibbonMesh): string {
  if (mesh.segments.length === 0) return '';
  return mesh.segments
    .map((seg) => {
      const p = `${seg.v0.x.toFixed(1)},${seg.v0.y.toFixed(1)} ${seg.v1.x.toFixed(1)},${seg.v1.y.toFixed(1)} ${seg.v2.x.toFixed(1)},${seg.v2.y.toFixed(1)} ${seg.v3.x.toFixed(1)},${seg.v3.y.toFixed(1)}`;
      return `<polygon points="${p}" fill="${seg.colorHex}" />`;
    })
    .join('');
}
