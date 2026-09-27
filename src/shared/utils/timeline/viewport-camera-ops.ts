/**
 * Whiteboard Dynamic Viewport Camera & Multi-Layer Ink Compositor Operations.
 * Calculates inertial camera framing that follows active pen positions with smooth mass/lag,
 * enforces boundary-safe viewport limits, and computes directional hand drop-shadow vectors.
 */

import type { Point2D } from './calligraphy-ops';

export interface CameraState {
  cx: number;
  cy: number;
  zoom: number;
}

export interface WhiteboardCameraFollowerSettings {
  enabled?: boolean;
  zoom?: number; // 1.0 to 2.5, default 1.35
  smoothness?: number; // 0.1 to 0.95, default 0.85
  showHandShadow?: boolean; // default true
  shadowAngleDeg?: number; // 0 to 360, default 315 (North-West)
}

export interface FollowerCameraOptions {
  frameW?: number;
  frameH?: number;
  targetZoom?: number;
  smoothness?: number;
  leadInFrames?: number;
  leadOutFrames?: number;
}

/**
 * Ensure camera center does not allow visible zoomed frame to exceed master canvas bounds.
 */
export function clampCameraCenter(
  cx: number,
  cy: number,
  zoom: number,
  frameW: number = 1920,
  frameH: number = 1080
): Point2D {
  if (zoom <= 1.001) {
    return [frameW * 0.5, frameH * 0.5];
  }

  const halfW = (frameW * 0.5) / zoom;
  const halfH = (frameH * 0.5) / zoom;

  const minX = halfW;
  const maxX = frameW - halfW;
  const minY = halfH;
  const maxY = frameH - halfH;

  const clampedX = Math.max(minX, Math.min(maxX, cx));
  const clampedY = Math.max(minY, Math.min(maxY, cy));

  return [clampedX, clampedY];
}

/**
 * Generate smooth frame-by-frame CameraState sequence following the pen trajectory.
 */
export function calculateFollowerCameraTrajectory(
  penPositions: (Point2D | null)[],
  options: FollowerCameraOptions = {}
): CameraState[] {
  const n = penPositions.length;
  if (n === 0) return [];

  const frameW = options.frameW ?? 1920;
  const frameH = options.frameH ?? 1080;
  const targetZoom = Math.max(1.0, Math.min(3.0, options.targetZoom ?? 1.35));
  const smoothness = Math.max(0.1, Math.min(0.98, options.smoothness ?? 0.85));
  const leadInFrames = Math.max(1, options.leadInFrames ?? 15);
  const leadOutFrames = Math.max(1, options.leadOutFrames ?? 20);

  const defaultCx = frameW * 0.5;
  const defaultCy = frameH * 0.5;

  let firstDraw = -1;
  let lastDraw = -1;
  for (let i = 0; i < n; i++) {
    if (penPositions[i] !== null) {
      if (firstDraw === -1) firstDraw = i;
      lastDraw = i;
    }
  }

  if (firstDraw === -1) {
    firstDraw = 0;
    lastDraw = n - 1;
  }

  const states: CameraState[] = [];
  let currCx = defaultCx;
  let currCy = defaultCy;
  let currZoom = 1.0;

  const alpha = 1.0 - smoothness;

  for (let i = 0; i < n; i++) {
    const pen = penPositions[i];

    // Determine target zoom
    let targetZ = targetZoom;
    if (i < firstDraw) {
      const progress = Math.max(0.0, 1.0 - (firstDraw - i) / leadInFrames);
      targetZ = 1.0 + (targetZoom - 1.0) * (0.5 - 0.5 * Math.cos(progress * Math.PI));
    } else if (i > lastDraw) {
      const progress = Math.min(1.0, (i - lastDraw) / leadOutFrames);
      targetZ = targetZoom - (targetZoom - 1.0) * (0.5 - 0.5 * Math.cos(progress * Math.PI));
    }

    // Smooth zoom transition
    currZoom += (targetZ - currZoom) * 0.12;

    // Determine target point
    let targetX = defaultCx;
    let targetY = defaultCy;
    if (pen !== null) {
      targetX = pen[0];
      targetY = pen[1];
    }

    // Inertial follow
    currCx += (targetX - currCx) * alpha;
    currCy += (targetY - currCy) * alpha;

    // Boundary clamp
    const [clampedX, clampedY] = clampCameraCenter(currCx, currCy, currZoom, frameW, frameH);
    states.push({ cx: clampedX, cy: clampedY, zoom: currZoom });
  }

  return states;
}

/**
 * Calculates screen (dx, dy) shadow shift from a compass light direction (0=N, 90=E, 180=S, 270=W, 315=NW).
 * In screen coordinates: +X is right, +Y is down.
 */
export function calculateHandShadowOffset(
  lightAngleDeg: number = 315.0,
  distancePx: number = 16.0
): { dx: number; dy: number } {
  // Shadow casts opposite to light source (e.g. NW light casts SE shadow: dx > 0, dy > 0)
  const shadowCompassDeg = (lightAngleDeg + 180.0) % 360.0;
  const rad = (shadowCompassDeg * Math.PI) / 180.0;
  const dx = Math.round(distancePx * Math.sin(rad));
  const dy = Math.round(-distancePx * Math.cos(rad));
  return { dx, dy };
}
