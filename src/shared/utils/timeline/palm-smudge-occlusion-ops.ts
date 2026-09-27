/**
 * Whiteboard Hand Palm Occlusion & Natural Smudging Physics Operations.
 *
 * Models physical contact and smudge dynamics of the resting palm heel (hypothenar eminence):
 * 1. Derives 2D palm footprint from pen tip, wrist angle, and hand vertical elevation.
 * 2. Elevation thresholding for contact touchdown / liftoff.
 * 3. Intersection detection against freshly laid wet ink strokes within drying window.
 * 4. Directional smudge smear generation with exponential pigment decay.
 * 5. Palm heel contact ambient occlusion shadow parameters.
 */

export interface PalmSmudgeConfig {
  enabled: boolean;
  touchdownElevationMm: number; // 2 to 20 mm (default 8.0)
  palmRadiusPx: number;         // 15 to 80 px (default 35.0)
  palmAspectRatio: number;      // 0.4 to 1.0 (default 0.70)
  palmOffsetX: number;          // 0 to 100 px (default 40.0)
  palmOffsetY: number;          // 0 to 100 px (default 35.0)
  smudgeIntensity: number;      // 0.05 to 1.0 (default 0.40)
  smudgeDecayPx: number;        // 10 to 150 px (default 60.0)
  wetTimeWindowSec: number;     // 0.5 to 5.0 s (default 2.0)
  shadowOpacity: number;        // 0.0 to 0.8 (default 0.35)
}

export type PalmSmudgeSettings = Partial<PalmSmudgeConfig>;

export const DEFAULT_PALM_SMUDGE_CONFIG: PalmSmudgeConfig = {
  enabled: false,
  touchdownElevationMm: 8.0,
  palmRadiusPx: 35.0,
  palmAspectRatio: 0.70,
  palmOffsetX: 40.0,
  palmOffsetY: 35.0,
  smudgeIntensity: 0.40,
  smudgeDecayPx: 60.0,
  wetTimeWindowSec: 2.0,
  shadowOpacity: 0.35,
};

export interface PalmFootprint {
  center: { x: number; y: number };
  radiusX: number;
  radiusY: number;
  angleDeg: number;
  isTouching: boolean;
  contactPressure: number;
}

export interface WetStrokeOverlap {
  point: { x: number; y: number };
  time: number;
  age: number;
  wetness: number;
  colorHex: string;
  width: number;
}

export interface SmudgeTrail {
  origin: { x: number; y: number };
  velocity: { x: number; y: number };
  lengthPx: number;
  initialIntensity: number;
  decayPx: number;
  widthPx: number;
  colorHex: string;
}

/**
 * Computes the oriented elliptical footprint and contact status of the palm heel.
 */
export function computePalmHeelFootprint(
  tipPos: { x: number; y: number },
  wristAngleDeg: number = 45.0,
  elevationMm: number = 4.0,
  config?: Partial<PalmSmudgeConfig>
): PalmFootprint {
  const fullConfig: PalmSmudgeConfig = {
    ...DEFAULT_PALM_SMUDGE_CONFIG,
    ...config,
  };

  const rad = (wristAngleDeg * Math.PI) / 180.0;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;

  const cx = tipPos.x + fullConfig.palmOffsetX * ux + fullConfig.palmOffsetY * vx;
  const cy = tipPos.y + fullConfig.palmOffsetX * uy + fullConfig.palmOffsetY * vy;

  const rx = Math.max(5.0, fullConfig.palmRadiusPx);
  const ry = rx * Math.max(0.2, Math.min(1.0, fullConfig.palmAspectRatio));

  const thresh = Math.max(0.1, fullConfig.touchdownElevationMm);
  const isTouching = elevationMm <= thresh;
  const contactPressure = isTouching
    ? Math.max(0.05, Math.min(1.0, 1.0 - elevationMm / thresh))
    : 0.0;

  return {
    center: { x: cx, y: cy },
    radiusX: rx,
    radiusY: ry,
    angleDeg: wristAngleDeg,
    isTouching,
    contactPressure,
  };
}

/**
 * Tests whether a point falls inside the oriented elliptical palm footprint.
 */
export function isPointInsidePalm(
  point: { x: number; y: number },
  palm: PalmFootprint
): boolean {
  const rad = (palm.angleDeg * Math.PI) / 180.0;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const dx = point.x - palm.center.x;
  const dy = point.y - palm.center.y;

  const lx = dx * cosA + dy * sinA;
  const ly = -dx * sinA + dy * cosA;

  const distSq = (lx * lx) / (palm.radiusX * palm.radiusX) + (ly * ly) / (palm.radiusY * palm.radiusY);
  return distSq <= 1.0;
}

/**
 * Finds all points in recently drawn strokes that intersect the palm contact zone
 * and are still within the wet drying window.
 */
export function findWetStrokeOverlaps(
  palm: PalmFootprint,
  strokes: Array<{
    points: Array<{ x: number; y: number }>;
    times: number[];
    colorHex?: string;
    width?: number;
  }>,
  currentTimeSec: number,
  config?: Partial<PalmSmudgeConfig>
): WetStrokeOverlap[] {
  const fullConfig: PalmSmudgeConfig = {
    ...DEFAULT_PALM_SMUDGE_CONFIG,
    ...config,
  };

  if (!palm.isTouching) return [];

  const wetWindow = Math.max(0.1, fullConfig.wetTimeWindowSec);
  const overlaps: WetStrokeOverlap[] = [];

  for (const stroke of strokes) {
    const pts = stroke.points;
    const times = stroke.times;
    const colorHex = stroke.colorHex ?? '#1f2937';
    const width = stroke.width ?? 6.0;

    const n = Math.min(pts.length, times.length);
    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      const t = times[i];
      const age = currentTimeSec - t;

      if (age >= 0.0 && age <= wetWindow) {
        if (isPointInsidePalm(pt, palm)) {
          const wetness = Math.max(0.0, 1.0 - age / wetWindow);
          overlaps.push({
            point: { ...pt },
            time: t,
            age,
            wetness,
            colorHex,
            width,
          });
        }
      }
    }
  }

  return overlaps;
}

/**
 * Generates directional smear trails from wet stroke intersections along the palm velocity vector.
 */
export function generateSmudgeTrails(
  overlaps: Array<{
    point: { x: number; y: number };
    wetness: number;
    colorHex?: string;
    width?: number;
  }>,
  palmVelocity: { x: number; y: number },
  palm: PalmFootprint,
  config?: Partial<PalmSmudgeConfig>
): SmudgeTrail[] {
  const fullConfig: PalmSmudgeConfig = {
    ...DEFAULT_PALM_SMUDGE_CONFIG,
    ...config,
  };

  if (!palm.isTouching || overlaps.length === 0) return [];

  const speed = Math.hypot(palmVelocity.x, palmVelocity.y);
  if (speed < 1.0) return [];

  const trailLength = Math.min(fullConfig.smudgeDecayPx * 2.5, speed * 0.15);
  if (trailLength < 2.0) return [];

  const trails: SmudgeTrail[] = [];

  for (const item of overlaps) {
    const intensity = fullConfig.smudgeIntensity * palm.contactPressure * item.wetness;
    if (intensity <= 0.01) continue;

    trails.push({
      origin: { ...item.point },
      velocity: { ...palmVelocity },
      lengthPx: trailLength,
      initialIntensity: intensity,
      decayPx: fullConfig.smudgeDecayPx,
      widthPx: (item.width ?? 6.0) * 1.5,
      colorHex: item.colorHex ?? '#1f2937',
    });
  }

  return trails;
}

/**
 * Evaluates exponential smudge trail intensity at a given distance along the drag trail.
 */
export function evaluateSmudgeIntensityAt(
  distancePx: number,
  initialIntensity: number,
  decayPx: number
): number {
  if (distancePx < 0) return 0;
  return initialIntensity * Math.exp(-distancePx / Math.max(1.0, decayPx));
}

/**
 * Validates palm smudge configuration values.
 */
export function validatePalmSmudgeConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const c = config as Partial<PalmSmudgeConfig>;

  if (c.touchdownElevationMm !== undefined && (typeof c.touchdownElevationMm !== 'number' || c.touchdownElevationMm < 1 || c.touchdownElevationMm > 30)) {
    errors.push('touchdownElevationMm must be between 1 and 30');
  }
  if (c.palmRadiusPx !== undefined && (typeof c.palmRadiusPx !== 'number' || c.palmRadiusPx < 5 || c.palmRadiusPx > 150)) {
    errors.push('palmRadiusPx must be between 5 and 150');
  }
  if (c.smudgeIntensity !== undefined && (typeof c.smudgeIntensity !== 'number' || c.smudgeIntensity < 0 || c.smudgeIntensity > 1.5)) {
    errors.push('smudgeIntensity must be between 0 and 1.5');
  }
  if (c.smudgeDecayPx !== undefined && (typeof c.smudgeDecayPx !== 'number' || c.smudgeDecayPx < 5 || c.smudgeDecayPx > 300)) {
    errors.push('smudgeDecayPx must be between 5 and 300');
  }
  if (c.wetTimeWindowSec !== undefined && (typeof c.wetTimeWindowSec !== 'number' || c.wetTimeWindowSec <= 0 || c.wetTimeWindowSec > 20)) {
    errors.push('wetTimeWindowSec must be between 0.1 and 20');
  }
  if (c.shadowOpacity !== undefined && (typeof c.shadowOpacity !== 'number' || c.shadowOpacity < 0 || c.shadowOpacity > 1)) {
    errors.push('shadowOpacity must be between 0 and 1');
  }

  return { valid: errors.length === 0, errors };
}
