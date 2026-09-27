/**
 * Whiteboard Dynamic Tool Auto-Invocation, Staging Carousel & Retraction Dynamics.
 * Orchestrates physical drafting tools (ruler, compass, laser, eraser, pen) based on drawing intent:
 * 1. Gesture-to-Tool Classification: Automatically selects ruler for long straight lines,
 *    laser pointer for hover hesitations, and eraser for rapid zigzag wiping.
 * 2. Staging Dynamics: Tools slide in smoothly from tray boundaries and retract when idle.
 */

import type { Point2D } from './calligraphy-ops';

export type ToolIntentType = 'pen' | 'ruler' | 'laser' | 'eraser';

export interface ToolOrchestrationSettings {
  enabled?: boolean;
  autoRulerThresholdPx?: number; // Line length threshold to invoke ruler (40..200, default 80.0)
  autoLaserHoldSec?: number; // Hover hesitation time to invoke laser (0.15..1.0, default 0.40)
  toolEnterDurationSec?: number; // Staging slide-in transition duration (0.1..1.0, default 0.25)
  toolDismissTimeoutSec?: number; // Inactive timeout before tool retracts (0.2..2.0, default 0.60)
  trayPosition?: 'bottom-right' | 'bottom-left' | 'top-right'; // default 'bottom-right'
}

export const DEFAULT_TOOL_ORCHESTRATION_SETTINGS: Required<ToolOrchestrationSettings> = {
  enabled: true,
  autoRulerThresholdPx: 80.0,
  autoLaserHoldSec: 0.4,
  toolEnterDurationSec: 0.25,
  toolDismissTimeoutSec: 0.6,
  trayPosition: 'bottom-right',
};

/**
 * Classifies real-time stylus input stream into intended physical drafting tool.
 */
export function classifyDrawingIntent(
  strokePoints: Point2D[],
  holdDurationSec = 0.0,
  isTouching = true,
  settings?: ToolOrchestrationSettings
): ToolIntentType {
  const cfg: Required<ToolOrchestrationSettings> = {
    ...DEFAULT_TOOL_ORCHESTRATION_SETTINGS,
    ...settings,
  };

  if (!cfg.enabled) {
    return 'pen';
  }

  // 1. Hover hesitation: stationary without surface contact -> laser pointer
  if (!isTouching && holdDurationSec >= cfg.autoLaserHoldSec) {
    return 'laser';
  }

  const n = strokePoints.length;
  if (n < 3) {
    return 'pen';
  }

  // 2. Check for rapid zigzag wiping (eraser gesture)
  let directionChanges = 0;
  let totalLen = 0;

  for (let i = 1; i < n - 1; i++) {
    const dx1 = strokePoints[i][0] - strokePoints[i - 1][0];
    const dy1 = strokePoints[i][1] - strokePoints[i - 1][1];
    const dx2 = strokePoints[i + 1][0] - strokePoints[i][0];
    const dy2 = strokePoints[i + 1][1] - strokePoints[i][1];

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    totalLen += len1;

    if (len1 > 2.0 && len2 > 2.0) {
      const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      if (dot < -0.4) {
        directionChanges++;
      }
    }
  }

  if (directionChanges >= 2 && totalLen > 60.0) {
    return 'eraser';
  }

  // 3. Check for straight line gesture (ruler auto-invocation)
  const pStart = strokePoints[0];
  const pEnd = strokePoints[n - 1];
  const chordLen = Math.hypot(pEnd[0] - pStart[0], pEnd[1] - pStart[1]);

  if (chordLen >= cfg.autoRulerThresholdPx) {
    let arcLen = 0;
    for (let i = 1; i < n; i++) {
      arcLen += Math.hypot(
        strokePoints[i][0] - strokePoints[i - 1][0],
        strokePoints[i][1] - strokePoints[i - 1][1]
      );
    }
    if (arcLen > 0 && chordLen / arcLen >= 0.94) {
      return 'ruler';
    }
  }

  return 'pen';
}

export interface ToolStagingTransform {
  x: number;
  y: number;
  rotationDeg: number;
  opacity: number;
}

/**
 * Computes 2D affine staging coordinates for tool entrance and retraction.
 */
export function calculateToolStagingTransform(
  tool: ToolIntentType,
  progress: number,
  targetPos: Point2D,
  canvasWidth = 1920,
  canvasHeight = 1080,
  trayPosition: 'bottom-right' | 'bottom-left' | 'top-right' = 'bottom-right'
): ToolStagingTransform {
  let trayX = canvasWidth + 80;
  let trayY = canvasHeight + 80;

  if (trayPosition === 'bottom-left') {
    trayX = -80;
    trayY = canvasHeight + 80;
  } else if (trayPosition === 'top-right') {
    trayX = canvasWidth + 80;
    trayY = -80;
  }

  const p = Math.max(0.0, Math.min(1.0, progress));
  // Ease-out cubic curve: 1 - (1 - p)^3
  const easeP = 1.0 - Math.pow(1.0 - p, 3);

  const curX = Math.round(trayX + (targetPos[0] - trayX) * easeP);
  const curY = Math.round(trayY + (targetPos[1] - trayY) * easeP);
  const opacity = Math.min(1.0, Math.max(0.0, p * 1.5));

  const baseRotations: Record<ToolIntentType, number> = {
    pen: 45.0,
    ruler: 0.0,
    eraser: 15.0,
    laser: -30.0,
  };
  const targetRot = baseRotations[tool] ?? 45.0;
  const rotationDeg = Math.round(90.0 * (1.0 - easeP) + targetRot * easeP);

  return { x: curX, y: curY, rotationDeg, opacity };
}
