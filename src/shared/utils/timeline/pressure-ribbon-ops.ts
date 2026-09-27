/**
 * Whiteboard Pressure-Sensitive Stylus Dynamics & Variable Ribbon Operations.
 * Simulates non-linear stylus pressure curves (Linear, Exponential, Sigmoidal, Calligraphic),
 * 3D stylus tilt contact-patch footprint deformation, and continuous 2D ribbon mesh polygon generation.
 */

import type { Point2D } from './calligraphy-ops';

export type PressureCurveType = 'linear' | 'exponential' | 'sigmoid' | 'calligraphic';

export interface StylusPressureSettings {
  enabled?: boolean;
  curve?: PressureCurveType;
  sensitivity?: number; // 0.1..3.0, default 1.0
  minWidthPct?: number; // 0.1..0.8, default 0.25
  tiltDeformation?: boolean; // default true
}

export interface RibbonMeshGeometry {
  leftEdge: Point2D[];
  rightEdge: Point2D[];
  polygon: Point2D[];
}

/**
 * Maps raw physical pen pressure [0..1] through custom transfer response curves.
 */
export function evaluatePressureCurve(
  rawP: number,
  curve: PressureCurveType = 'sigmoid',
  sensitivity: number = 1.0
): number {
  const p = Math.max(0.0, Math.min(1.0, rawP));
  const sens = Math.max(0.1, Math.min(3.0, sensitivity));

  if (curve === 'linear') {
    return Math.max(0.0, Math.min(1.0, p * sens));
  }

  if (curve === 'exponential') {
    // Soft/Firm curve: requires progressive pressure
    const gamma = 1.8 / sens;
    return Math.pow(p, gamma);
  }

  if (curve === 'sigmoid') {
    // S-Curve: responsive midtones with graceful rolloff
    const k = 8.0 * sens;
    const mid = 0.5;
    const sig = 1.0 / (1.0 + Math.exp(-k * (p - mid)));
    const sig0 = 1.0 / (1.0 + Math.exp(-k * (0.0 - mid)));
    const sig1 = 1.0 / (1.0 + Math.exp(-k * (1.0 - mid)));
    return (sig - sig0) / (sig1 - sig0);
  }

  if (curve === 'calligraphic') {
    // Rapid initial swell with expressive dynamic headroom
    const scaled = Math.max(0.0, Math.min(1.0, p * sens));
    return Math.sin(Math.PI * 0.5 * scaled);
  }

  return p;
}

/**
 * Computes contact patch lateral broadening based on stylus tilt altitude and azimuth.
 */
export function calculateTiltMultiplier(
  altitudeDeg: number,
  azimuthDeg: number,
  strokeAngleRad: number
): number {
  const alt = Math.max(15.0, Math.min(90.0, altitudeDeg));
  const altRad = (alt * Math.PI) / 180.0;
  const azRad = (azimuthDeg * Math.PI) / 180.0;

  // Contact patch elongation along tilt direction
  const elongation = 1.0 / Math.sin(altRad);

  // Maximum footprint when moving perpendicular to tilt azimuth
  const relativeAngle = azRad - strokeAngleRad;
  const footprintFactor = 1.0 + (elongation - 1.0) * Math.abs(Math.sin(relativeAngle));

  return Math.max(1.0, Math.min(3.5, footprintFactor));
}

/**
 * Generates a continuous variable-width 2D ribbon mesh envelope from 2D points,
 * pressure levels, and optional 3D stylus tilt orientations.
 */
export function generateVariableRibbon(
  points: Point2D[],
  pressures?: number[],
  options: {
    curve?: PressureCurveType;
    sensitivity?: number;
    baseRadius?: number;
    minWidthRatio?: number;
    altitudesDeg?: number[];
    azimuthsDeg?: number[];
    tiltDeformation?: boolean;
  } = {}
): RibbonMeshGeometry {
  const n = points.length;
  if (n < 2) {
    return { leftEdge: [], rightEdge: [], polygon: [] };
  }

  const rawP = pressures && pressures.length === n ? pressures : new Array(n).fill(0.5);
  const alts = options.altitudesDeg && options.altitudesDeg.length === n ? options.altitudesDeg : new Array(n).fill(90);
  const azims = options.azimuthsDeg && options.azimuthsDeg.length === n ? options.azimuthsDeg : new Array(n).fill(0);
  const baseRadius = options.baseRadius ?? 8.0;
  const minWidthRatio = options.minWidthRatio ?? 0.25;
  const curve = options.curve ?? 'sigmoid';
  const sensitivity = options.sensitivity ?? 1.0;
  const useTilt = options.tiltDeformation ?? true;

  const leftEdge: Point2D[] = [];
  const rightEdge: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const curr = points[i];

    let tx = 0;
    let ty = 0;
    if (i === 0) {
      tx = points[1][0] - curr[0];
      ty = points[1][1] - curr[1];
    } else if (i === n - 1) {
      tx = curr[0] - points[i - 1][0];
      ty = curr[1] - points[i - 1][1];
    } else {
      tx = points[i + 1][0] - points[i - 1][0];
      ty = points[i + 1][1] - points[i - 1][1];
    }

    const tLen = Math.hypot(tx, ty);
    let nx = 0;
    let ny = 1;
    let strokeAngle = 0;

    if (tLen > 1e-4) {
      nx = -ty / tLen;
      ny = tx / tLen;
      strokeAngle = Math.atan2(ty, tx);
    }

    const effP = evaluatePressureCurve(rawP[i], curve, sensitivity);
    const widthRatio = minWidthRatio + (1.0 - minWidthRatio) * effP;
    const tiltMult = useTilt ? calculateTiltMultiplier(alts[i], azims[i], strokeAngle) : 1.0;
    const halfWidth = baseRadius * widthRatio * tiltMult;

    leftEdge.push([curr[0] + nx * halfWidth, curr[1] + ny * halfWidth]);
    rightEdge.push([curr[0] - nx * halfWidth, curr[1] - ny * halfWidth]);
  }

  // Construct closed polygon: leftEdge + reversed rightEdge + first leftEdge point
  const polygon: Point2D[] = [...leftEdge, ...rightEdge.slice().reverse(), leftEdge[0]];

  return {
    leftEdge,
    rightEdge,
    polygon,
  };
}

/**
 * Serializes ribbon mesh geometry to SVG path markup.
 */
export function renderRibbonSvgPath(
  geometry: RibbonMeshGeometry,
  width: number = 1920,
  height: number = 1080,
  fill: string = '#1f2937'
): string {
  if (geometry.polygon.length < 3) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" />`;
  }

  const dParts = [`M ${geometry.polygon[0][0].toFixed(2)} ${geometry.polygon[0][1].toFixed(2)}`];
  for (let i = 1; i < geometry.polygon.length; i++) {
    dParts.push(`L ${geometry.polygon[i][0].toFixed(2)} ${geometry.polygon[i][1].toFixed(2)}`);
  }
  dParts.push('Z');
  const d = dParts.join(' ');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `  <path d="${d}" fill="${fill}" stroke="none" />`,
    `</svg>`,
  ].join('\n');
}
