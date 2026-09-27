/**
 * Whiteboard Chalk Dust Gravitational Settling & Tray Sedimentation Operations.
 * Simulates realistic particle physics for chalk writing on blackboards/slates:
 * 1. Micro-particulates fracture and shed from active chalk strokes.
 * 2. Airborne particles drift downward under gravity subject to viscous air drag and lateral turbulence.
 * 3. Bottom Chalk Tray Accumulation: When dust motes reach the bottom ledge (chalk tray),
 *    they deposit into an accumulated sediment berm governed by natural particulate angle of repose.
 * 4. Tray sediment persists and builds up physically as drawing continues.
 */

export interface SettlingChalkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  isSettled: boolean;
}

export interface ChalkDustSettlingSettings {
  enabled?: boolean;
  gravitySpeed?: number;        // Downward acceleration/speed (10..150 px/s, default 80.0)
  terminalVelocity?: number;    // Maximum terminal falling speed (20..200 px/s, default 50.0)
  turbulenceAmplitude?: number; // Horizontal Brownian flutter (0.0..10.0, default 2.5)
  trayYPercent?: number;        // Relative bottom shelf elevation (0.50..0.98, default 0.93)
  trayDepthPx?: number;         // Chalk tray vertical height (4..50 px, default 18.0)
  reposeSigma?: number;         // Angle of repose splat radius (1..20 px, default 5.0)
  accumulationGain?: number;    // Mass-to-pixel height amplification (5..50, default 25.0)
  chalkColorHex?: string;       // Chalk dust tint hex (default #f0f0f0)
}

export const DEFAULT_CHALK_DUST_SETTLING_SETTINGS: Required<ChalkDustSettlingSettings> = {
  enabled: false,
  gravitySpeed: 80.0,
  terminalVelocity: 50.0,
  turbulenceAmplitude: 2.5,
  trayYPercent: 0.93,
  trayDepthPx: 18.0,
  reposeSigma: 5.0,
  accumulationGain: 25.0,
  chalkColorHex: '#f0f0f0',
};

/**
 * Advances kinematic simulation of a single chalk dust particle for dt seconds.
 * Returns true if particle settled onto the tray ledge during this step.
 */
export function stepParticleKinematics(
  particle: SettlingChalkParticle,
  dt: number,
  config: Partial<ChalkDustSettlingSettings> = {},
  trayY = 1000.0,
  randomFlutter = 0.0
): boolean {
  if (particle.isSettled || dt <= 0) {
    return false;
  }

  const gravity = config.gravitySpeed ?? DEFAULT_CHALK_DUST_SETTLING_SETTINGS.gravitySpeed;
  const termVel = config.terminalVelocity ?? DEFAULT_CHALK_DUST_SETTLING_SETTINGS.terminalVelocity;
  const turb = config.turbulenceAmplitude ?? DEFAULT_CHALK_DUST_SETTLING_SETTINGS.turbulenceAmplitude;
  const airDrag = 1.8;

  // Vertical acceleration with drag
  const ay = gravity - airDrag * particle.vy;
  particle.vy += ay * dt;
  if (particle.vy > termVel) {
    particle.vy = termVel;
  }

  // Horizontal Brownian flutter
  const ax = -airDrag * particle.vx + randomFlutter * turb * 10.0;
  particle.vx += ax * dt;

  // Integrate position
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;

  // Collision with bottom tray shelf
  if (particle.y >= trayY) {
    particle.y = trayY;
    particle.isSettled = true;
    particle.vx = 0;
    particle.vy = 0;
    return true;
  }

  return false;
}

/**
 * Deposits settled chalk dust particle mass onto the 1D tray sedimentation histogram.
 * Uses a Gaussian kernel to model the natural particulate angle of repose.
 */
export function depositParticleOntoTray(
  trayBins: Float32Array,
  depositX: number,
  mass: number,
  reposeSigma = 5.0,
  canvasWidth = 1920
): void {
  const sigma = Math.max(1.0, reposeSigma);
  const kernelRadius = Math.ceil(sigma * 2.5);
  const centerBin = Math.round(depositX);

  for (let offset = -kernelRadius; offset <= kernelRadius; offset++) {
    const binIdx = centerBin + offset;
    if (binIdx >= 0 && binIdx < canvasWidth && binIdx < trayBins.length) {
      const distSq = offset * offset;
      const gaussian = Math.exp(-0.5 * distSq / (sigma * sigma));
      trayBins[binIdx] += mass * gaussian * 0.15;
    }
  }
}

/**
 * Smooths and scales the 1D tray bins histogram into pixel heights for visual mound rendering.
 */
export function calculateTraySedimentHeights(
  trayBins: Float32Array,
  maxDepthPx = 18.0,
  gain = 25.0
): number[] {
  const n = trayBins.length;
  const heights = new Array<number>(n);
  const halfKernel = 4;

  for (let i = 0; i < n; i++) {
    // 9-tap box/triangle filter
    let sum = 0;
    let count = 0;
    for (let k = -halfKernel; k <= halfKernel; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < n) {
        const weight = 1.0 - Math.abs(k) / (halfKernel + 1);
        sum += trayBins[idx] * weight;
        count += weight;
      }
    }
    const smoothMass = count > 0 ? sum / count : trayBins[i];
    const rawHeight = smoothMass * gain;
    heights[i] = Math.round(Math.min(maxDepthPx, rawHeight) * 10) / 10;
  }

  return heights;
}

/**
 * Generates an SVG path data string for rendering the accumulated chalk dust berm along the bottom tray ledge.
 */
export function generateChalkTraySvgPath(
  trayBins: Float32Array,
  canvasWidth: number,
  trayY: number,
  maxDepthPx = 18.0,
  gain = 25.0
): string {
  const heights = calculateTraySedimentHeights(trayBins, maxDepthPx, gain);
  if (heights.every((h) => h <= 0.05)) {
    return '';
  }

  // Draw top crest of berm from left to right, then close along bottom tray shelf
  let d = `M 0 ${trayY}`;
  const step = Math.max(1, Math.floor(canvasWidth / 200));

  for (let x = 0; x < canvasWidth; x += step) {
    const binIdx = Math.min(trayBins.length - 1, x);
    const moundH = heights[binIdx];
    const crestY = Math.round((trayY - moundH * 0.7) * 10) / 10;
    d += ` L ${x} ${crestY}`;
  }

  // Right edge down to shelf baseline and back to start
  d += ` L ${canvasWidth} ${trayY + maxDepthPx * 0.3} L 0 ${trayY + maxDepthPx * 0.3} Z`;
  return d;
}
