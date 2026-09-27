/**
 * Whiteboard Real-Time Vector Ruler, Compass & Geometric Drafting Guide System Operations.
 * Simulates physical straightedge rulers and drafting compasses:
 * 1. Automatic straightedge detection along linear polyline strokes.
 * 2. Parallel bevel offset alignment and ruler sliding kinematics.
 * 3. Two-legged compass anchoring and circular arc sweep generation.
 * 4. Procedural SVG markup generation for transparent acrylic or wooden drafting instruments.
 */

import type { Point2D } from './calligraphy-ops';

export type DraftingGuideMode = 'auto' | 'ruler' | 'compass' | 'none';
export type GuideMaterialType = 'acrylic' | 'wood' | 'metal';

export interface DraftingGuideSettings {
  enabled?: boolean;
  mode?: DraftingGuideMode; // default 'auto'
  material?: GuideMaterialType; // default 'acrylic'
  minLineLengthPx?: number; // 50..300 px, default 100
  slideAudioCue?: boolean; // default true
  showGraduations?: boolean; // tick marks on ruler, default true
}

export interface RulerGuideGeometry {
  origin: Point2D;
  angleDeg: number;
  length: number;
  width: number;
  material: GuideMaterialType;
}

export interface CompassGuideGeometry {
  pivot: Point2D;
  leadPos: Point2D;
  radius: number;
  angleDeg: number;
}

/**
 * Evaluates whether a sequence of polyline points forms a clean straight line suitable for a ruler guide.
 */
export function detectLinearGuideOpportunity(
  points: Point2D[],
  minLen: number = 100.0,
  maxDeviationRatio: number = 0.05,
): { isLinear: boolean; chordLen: number; maxDeviation: number } {
  if (points.length < 2) {
    return { isLinear: false, chordLen: 0, maxDeviation: 0 };
  }

  const p0 = points[0];
  const pEnd = points[points.length - 1];
  const dx = pEnd[0] - p0[0];
  const dy = pEnd[1] - p0[1];
  const chordLen = Math.hypot(dx, dy);

  if (chordLen < minLen) {
    return { isLinear: false, chordLen, maxDeviation: 0 };
  }

  let maxDeviation = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const num = Math.abs(dy * p[0] - dx * p[1] + pEnd[0] * p0[1] - pEnd[1] * p0[0]);
    const dist = num / chordLen;
    if (dist > maxDeviation) {
      maxDeviation = dist;
    }
  }

  const isLinear = maxDeviation / chordLen <= maxDeviationRatio;
  return {
    isLinear,
    chordLen: Number(chordLen.toFixed(2)),
    maxDeviation: Number(maxDeviation.toFixed(2)),
  };
}

/**
 * Computes the parallel spatial placement for a straightedge ruler along a vector segment.
 */
export function computeRulerAlignment(
  p1: Point2D,
  p2: Point2D,
  offsetDist: number = 15.0,
  material: GuideMaterialType = 'acrylic',
): RulerGuideGeometry {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const chordLen = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180.0) / Math.PI;

  const nx = -dy / (chordLen + 1e-6);
  const ny = dx / (chordLen + 1e-6);

  const origin: Point2D = [
    Number((p1[0] + nx * offsetDist).toFixed(2)),
    Number((p1[1] + ny * offsetDist).toFixed(2)),
  ];

  return {
    origin,
    angleDeg: Number(angleDeg.toFixed(2)),
    length: Number((chordLen + 60.0).toFixed(2)),
    width: 44.0,
    material,
  };
}

/**
 * Generates an SVG representation of a straightedge ruler with bevel edge and optional millimeter graduations.
 */
export function generateRulerSvgMarkup(ruler: RulerGuideGeometry): string {
  const { origin, angleDeg, length, width, material } = ruler;
  const fill =
    material === 'acrylic'
      ? 'rgba(210, 235, 255, 0.45)'
      : material === 'wood'
      ? 'rgba(218, 165, 105, 0.85)'
      : 'rgba(200, 205, 215, 0.85)';
  const stroke = material === 'acrylic' ? '#88b0d0' : '#8b5a2b';

  return `<g transform="translate(${origin[0]}, ${origin[1]}) rotate(${angleDeg})">
  <rect x="-10" y="-${width}" width="${length}" height="${width}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
  <line x1="-10" y1="0" x2="${length - 10}" y2="0" stroke="${stroke}" stroke-width="1.8" />
</g>`;
}

/**
 * Generates an SVG representation of a drafting compass with stationary pivot and lead needle.
 */
export function generateCompassSvgMarkup(compass: CompassGuideGeometry): string {
  const { pivot, leadPos, radius } = compass;
  const hingeX = (pivot[0] + leadPos[0]) * 0.5;
  const hingeY = Math.min(pivot[1], leadPos[1]) - radius * 0.8;

  return `<g class="drafting-compass">
  <circle cx="${pivot[0]}" cy="${pivot[1]}" r="3" fill="#333333" />
  <line x1="${hingeX}" y1="${hingeY}" x2="${pivot[0]}" y2="${pivot[1]}" stroke="#555555" stroke-width="3" />
  <line x1="${hingeX}" y1="${hingeY}" x2="${leadPos[0]}" y2="${leadPos[1]}" stroke="#333333" stroke-width="3" />
  <circle cx="${hingeX}" cy="${hingeY}" r="5" fill="#777777" />
  <circle cx="${leadPos[0]}" cy="${leadPos[1]}" r="2.5" fill="#e65100" />
</g>`;
}
