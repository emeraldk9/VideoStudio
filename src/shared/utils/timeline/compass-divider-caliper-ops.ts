/**
 * Whiteboard Drafting Compass & Mechanical Divider Caliper Geometry Engine.
 *
 * Implements drafting bow compass kinematics, aperture angle solver,
 * divider walking & chord stepping, needle pivot friction, and mechanical thumbscrew ratchet foley.
 */

export interface CompassConfig {
  enabled: boolean;
  armLengthPx: number;          // Mechanical leg length in px (80..400, default: 160)
  needleFriction: number;       // Pivot point friction resistance factor (0..1.0, default: 0.30)
  thumbscrewPitchPx: number;    // Center spindle thread pitch for clicks (0.5..10.0, default: 2.0)
  showCompassOverlay: boolean;  // Render brass compass visual overlay (default: true)
  foleyRatchetVolume: number;   // Thumbscrew ratchet acoustic volume (0..1.0, default: 0.70)
}

export type CompassSettings = Partial<CompassConfig>;

export const DEFAULT_COMPASS_CONFIG: CompassConfig = {
  enabled: false,
  armLengthPx: 160.0,
  needleFriction: 0.30,
  thumbscrewPitchPx: 2.0,
  showCompassOverlay: true,
  foleyRatchetVolume: 0.70,
};

export interface CompassKinematics {
  pivotXy: [number, number];
  pencilXy: [number, number];
  radiusPx: number;
  apertureAngleDeg: number;
  bodyRotationDeg: number;
  hingeXy: [number, number];
  needleElbowXy: [number, number];
  pencilElbowXy: [number, number];
}

export interface CompassFoleyTelemetry {
  ratchetClicks: number;
  ratchetGain: number;
  sweepWhisperGain: number;
  pivotDragTorque: number;
  ratchetPitchHz: number;
}

/**
 * Validates and clamps compass configuration parameters.
 */
export function validateCompassConfig(config?: Partial<CompassConfig>): CompassConfig {
  if (!config) {
    return { ...DEFAULT_COMPASS_CONFIG };
  }

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_COMPASS_CONFIG.enabled),
    armLengthPx: Math.max(80.0, Math.min(400.0, config.armLengthPx ?? DEFAULT_COMPASS_CONFIG.armLengthPx)),
    needleFriction: Math.max(0.0, Math.min(1.0, config.needleFriction ?? DEFAULT_COMPASS_CONFIG.needleFriction)),
    thumbscrewPitchPx: Math.max(0.5, Math.min(10.0, config.thumbscrewPitchPx ?? DEFAULT_COMPASS_CONFIG.thumbscrewPitchPx)),
    showCompassOverlay: Boolean(config.showCompassOverlay ?? DEFAULT_COMPASS_CONFIG.showCompassOverlay),
    foleyRatchetVolume: Math.max(0.0, Math.min(1.0, config.foleyRatchetVolume ?? DEFAULT_COMPASS_CONFIG.foleyRatchetVolume)),
  };
}

/**
 * Solves inverse kinematics for a two-legged articulated drafting bow compass.
 */
export function solveCompassKinematics(
  pivot: [number, number],
  pencil: [number, number],
  armLengthPx: number = 160.0
): CompassKinematics {
  const x0 = pivot[0];
  const y0 = pivot[1];
  const x1 = pencil[0];
  const y1 = pencil[1];

  const dx = x1 - x0;
  const dy = y1 - y0;
  const radius = Math.hypot(dx, dy);

  const maxSpan = 2.0 * armLengthPx * 0.98;
  const clampedR = Math.max(1.0, Math.min(radius, maxSpan));

  const mx = (x0 + x1) * 0.5;
  const my = (y0 + y1) * 0.5;

  const halfAngleRad = Math.asin(Math.min(1.0, (clampedR * 0.5) / armLengthPx));
  const apertureDeg = (halfAngleRad * 2.0 * 180.0) / Math.PI;

  const hDist = Math.sqrt(Math.max(0.0, armLengthPx * armLengthPx - (clampedR * 0.5) ** 2));

  const cLen = Math.hypot(dx, dy) || 1.0;
  const ux = dx / cLen;
  const uy = dy / cLen;
  const nx = -uy;
  const ny = ux;

  const hx = mx + nx * hDist;
  const hy = my + ny * hDist;

  const bodyRotation = (Math.atan2(ny, nx) * 180.0) / Math.PI;

  const needleElbow: [number, number] = [(x0 + hx) * 0.5 + nx * 8.0, (y0 + hy) * 0.5 + ny * 8.0];
  const pencilElbow: [number, number] = [(x1 + hx) * 0.5 + nx * 8.0, (y1 + hy) * 0.5 + ny * 8.0];

  return {
    pivotXy: [x0, y0],
    pencilXy: [x1, y1],
    radiusPx: radius,
    apertureAngleDeg: apertureDeg,
    bodyRotationDeg: bodyRotation,
    hingeXy: [hx, hy],
    needleElbowXy: needleElbow,
    pencilElbowXy: pencilElbow,
  };
}

/**
 * Steps divider caliper legs along a polyline to sample points spaced by fixed chord length.
 */
export function stepDividerChords(
  points: Array<[number, number]>,
  chordLength: number
): Array<[number, number]> {
  if (points.length < 2 || chordLength <= 0) {
    return points;
  }

  const stepped: Array<[number, number]> = [points[0]];
  let currPivot = points[0];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const d = Math.hypot(p[0] - currPivot[0], p[1] - currPivot[1]);
    if (d >= chordLength) {
      const prev = points[i - 1];
      const segDx = p[0] - prev[0];
      const segDy = p[1] - prev[1];
      const segLen = Math.hypot(segDx, segDy) || 1.0;

      const frac = Math.min(1.0, Math.max(0.0, (chordLength - Math.hypot(prev[0] - currPivot[0], prev[1] - currPivot[1])) / segLen));
      const targetPt: [number, number] = [prev[0] + segDx * frac, prev[1] + segDy * frac];

      stepped.push(targetPt);
      currPivot = targetPt;
    }
  }

  return stepped;
}

/**
 * Generates an array of points forming a circular arc swept by the compass pencil leg.
 */
export function generateCompassArcPoints(
  pivot: [number, number],
  radius: number,
  startAngleRad: number,
  endAngleRad: number,
  steps: number = 32
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const count = Math.max(2, steps);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = startAngleRad + (endAngleRad - startAngleRad) * t;
    const x = pivot[0] + radius * Math.cos(angle);
    const y = pivot[1] + radius * Math.sin(angle);
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Generates SVG vector markup for the drafting bow compass overlay.
 */
export function generateMechanicalCompassSvgMarkup(
  kinematics: CompassKinematics,
  config: CompassConfig
): string {
  if (!config.showCompassOverlay) {
    return '';
  }

  const [p0x, p0y] = kinematics.pivotXy;
  const [p1x, p1y] = kinematics.pencilXy;
  const [hx, hy] = kinematics.hingeXy;
  const [e0x, e0y] = kinematics.needleElbowXy;
  const [e1x, e1y] = kinematics.pencilElbowXy;

  const spindleX = (e0x + e1x) * 0.5;
  const spindleY = (e0y + e1y) * 0.5;

  return `
<g class="drafting-compass-overlay" opacity="0.95">
  <!-- Drop Shadows -->
  <path d="M ${p0x + 4} ${p0y + 4} L ${e0x + 4} ${e0y + 4} L ${hx + 4} ${hy + 4} L ${e1x + 4} ${e1y + 4} L ${p1x + 4} ${p1y + 4}"
        stroke="rgba(0,0,0,0.15)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <!-- Needle Pivot Leg -->
  <line x1="${p0x}" y1="${p0y}" x2="${e0x}" y2="${e0y}" stroke="#A0A0A5" stroke-width="2.5" stroke-linecap="round" />
  <line x1="${e0x}" y1="${e0y}" x2="${hx}" y2="${hy}" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round" />
  <!-- Pencil Drawing Leg -->
  <line x1="${p1x}" y1="${p1y}" x2="${e1x}" y2="${e1y}" stroke="#3A3A3C" stroke-width="3.5" stroke-linecap="round" />
  <line x1="${e1x}" y1="${e1y}" x2="${hx}" y2="${hy}" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round" />
  <!-- Center Spindle Wheel & Crossbar -->
  <line x1="${e0x}" y1="${e0y}" x2="${e1x}" y2="${e1y}" stroke="#8C7322" stroke-width="2.0" />
  <circle cx="${spindleX}" cy="${spindleY}" r="5" fill="#D4AF37" stroke="#8C7322" stroke-width="1.5" />
  <!-- Top Hinge Joint -->
  <circle cx="${hx}" cy="${hy}" r="7" fill="#D4AF37" stroke="#8C7322" stroke-width="2.0" />
  <!-- Center Pin Dot -->
  <circle cx="${p0x}" cy="${p0y}" r="2" fill="#1C1C1E" />
</g>
  `.trim();
}

/**
 * Computes acoustic telemetry for thumbscrew wheel ratchet clicks and needle pivot drag.
 */
export function computeCompassFoleyTelemetry(
  deltaRadiusPx: number,
  sweepAngleRad: number,
  config?: Partial<CompassConfig>
): CompassFoleyTelemetry {
  const cfg = validateCompassConfig(config);
  const pitch = Math.max(0.5, cfg.thumbscrewPitchPx);
  const vol = cfg.foleyRatchetVolume;

  const clickCount = Math.floor(Math.abs(deltaRadiusPx) / pitch);
  const ratchetGain = Math.min(1.0, Math.max(0.0, vol * (clickCount > 0 ? 1.0 : 0.0)));
  const sweepWhisperGain = Math.min(1.0, Math.max(0.0, vol * Math.min(1.0, Math.abs(sweepAngleRad) * 0.6)));
  const pivotDragTorque = Math.min(1.0, Math.max(0.0, cfg.needleFriction * 0.75));

  return {
    ratchetClicks: clickCount,
    ratchetGain,
    sweepWhisperGain,
    pivotDragTorque,
    ratchetPitchHz: 1200.0,
  };
}
