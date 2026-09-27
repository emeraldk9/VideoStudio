/**
 * Whiteboard Custom Hand Asset Calibration & Dynamic Pose Warping Operations.
 * Calculates nib-anchored 2D affine transformations preserving contact-point invariance
 * across arbitrary rotations, scales, and velocity-responsive forearm tilts.
 */

import type { Point2D } from './calligraphy-ops';

export interface WhiteboardCustomHandSettings {
  assetUri?: string;
  nibAnchorPct?: { x: number; y: number }; // 0..1 relative to sprite bounds
  wristAnchorPct?: { x: number; y: number };
  dynamicTilt?: boolean; // default true
  tiltIntensity?: number; // 0..1, default 0.35
  scale?: number; // 0.2..3.0, default 1.0
}

export interface AffineMatrix2D {
  a: number; // cos_a * s
  b: number; // sin_a * s
  c: number; // -sin_a * s
  d: number; // cos_a * s
  tx: number;
  ty: number;
}

/**
 * Computes a 2D affine transform matrix that maps the sprite nib anchor point
 * EXACTLY to targetCanvasXy, regardless of rotation angle or scaling factor.
 */
export function computeNibAnchoredTransform(
  nibSpriteXy: Point2D,
  targetCanvasXy: Point2D,
  angleDeg: number = 0.0,
  scale: number = 1.0
): AffineMatrix2D {
  const [x0, y0] = nibSpriteXy;
  const [targetX, targetY] = targetCanvasXy;

  const rad = (angleDeg * Math.PI) / 180.0;
  const a = Math.cos(rad) * scale;
  const b = Math.sin(rad) * scale;
  const c = -Math.sin(rad) * scale;
  const d = Math.cos(rad) * scale;

  // tx = targetX - (a * x0 + c * y0)
  // ty = targetY - (b * x0 + d * y0)
  const tx = targetX - (a * x0 + c * y0);
  const ty = targetY - (b * x0 + d * y0);

  return { a, b, c, d, tx, ty };
}

/**
 * Transforms a 2D sprite point into world/canvas coordinates via the affine matrix.
 */
export function applyAffineToPoint(matrix: AffineMatrix2D, p: Point2D): Point2D {
  const [x, y] = p;
  const xPrime = matrix.a * x + matrix.c * y + matrix.tx;
  const yPrime = matrix.b * x + matrix.d * y + matrix.ty;
  return [xPrime, yPrime];
}

/**
 * Computes organic wrist/forearm tilt in response to instantaneous drawing velocity.
 */
export function calculateDynamicHandTilt(
  velocity: Point2D,
  baseAngleDeg: number = 0.0,
  tiltIntensity: number = 0.35
): number {
  const [vx, vy] = velocity;
  const speed = Math.hypot(vx, vy);
  if (speed < 0.5) {
    return baseAngleDeg;
  }

  const strokeAngleRad = Math.atan2(vy, vx);
  const baseAngleRad = (baseAngleDeg * Math.PI) / 180.0;

  const deltaSin = Math.sin(strokeAngleRad - baseAngleRad);
  const safeIntensity = Math.max(0.0, Math.min(1.0, tiltIntensity));
  const tiltOffsetDeg = deltaSin * 18.0 * safeIntensity;

  return baseAngleDeg + tiltOffsetDeg;
}
