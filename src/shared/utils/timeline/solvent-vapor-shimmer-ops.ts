/**
 * Whiteboard Solvent Vapor Shimmer & Ambient Thermal Convection Operations.
 *
 * Implements volatile organic solvent evaporation physics:
 * 1. Exponential drying half-life decay modeling for freshly deposited ink.
 * 2. Upward buoyant convective plume thermal flutter above recently drawn strokes.
 * 3. SVG displacement filter generation for procedural optical heat shimmer ripples.
 */

export interface VaporShimmerConfig {
  enabled: boolean;
  shimmerAmplitudePx: number; // Max ripple displacement in pixels [0.5 - 8.0] (default 2.5)
  shimmerWavelengthPx: number; // Spatial ripple wavelength in pixels [10 - 50] (default 20.0)
  convectionSpeed: number; // Upward buoyant thermal drift speed (px/sec) [10 - 100] (default 40.0)
  solventEvapHalfLife: number; // Evaporative drying half-life in seconds [0.3 - 3.0] (default 1.0)
  buoyancyPlumeHeightPx: number; // Vertical plume height extent above stroke [15 - 80] (default 35.0)
}

export interface VaporShimmerSettings {
  enabled?: boolean;
  shimmerAmplitudePx?: number;
  solventEvapHalfLife?: number;
  convectionSpeed?: number;
  buoyancyPlumeHeightPx?: number;
}

/**
 * Computes the instantaneous shimmer displacement amplitude given elapsed drying time.
 * A(t) = A_0 * 2^(-t / tau_half)
 */
export function computeShimmerAmplitude(
  elapsedSec: number,
  maxAmplitude = 2.5,
  halfLifeSec = 1.0
): number {
  const t = Math.max(0, elapsedSec);
  const hl = Math.max(0.01, halfLifeSec);
  const amp = maxAmplitude * Math.pow(2.0, -t / hl);
  return Number(Math.max(0, amp).toFixed(3));
}

/**
 * Computes turbulent convective flutter ripple phase at a point (x, y) at time t.
 */
export function computeConvectiveFlutter(
  x: number,
  y: number,
  timeSec: number,
  wavelength = 20.0,
  speed = 40.0
): number {
  const wl = Math.max(1.0, wavelength);
  const phaseY = ((2.0 * Math.PI) / wl) * (y + speed * timeSec);
  const phaseX = 0.5 * Math.cos(((2.0 * Math.PI) / (wl * 1.5)) * x);
  return Number(Math.sin(phaseY + phaseX).toFixed(3));
}

/**
 * Computes vertical buoyant plume falloff weight [0.0, 1.0].
 * Warm vapor rises above the stroke (py), so pixels above py receive full buoyancy weight,
 * whereas pixels below py fall off rapidly.
 */
export function computePlumeBuoyancyWeight(
  py: number,
  y: number,
  plumeHeight = 35.0
): number {
  const yDist = py - y;
  if (yDist >= 0) {
    return Number(Math.max(0, Math.min(1.0, 1.0 - yDist / plumeHeight)).toFixed(3));
  } else {
    // Sharp falloff below stroke origin
    return Number(Math.max(0, Math.min(1.0, 1.0 + yDist / 4.0)).toFixed(3));
  }
}

/**
 * Generates an SVG defs block with feTurbulence and feDisplacementMap to simulate optical heat shimmer.
 */
export function generateVaporShimmerSvgFilter(
  amplitudePx = 2.5,
  wavelengthPx = 20.0,
  elapsedSec = 0.2,
  id = 'solvent-vapor-shimmer'
): string {
  const amp = computeShimmerAmplitude(elapsedSec, amplitudePx);
  const freq = Number((1.0 / Math.max(2.0, wavelengthPx)).toFixed(4));

  return [
    '<defs>',
    `  <filter id="${id}" x="-20%" y="-40%" width="140%" height="160%">`,
    `    <feTurbulence type="fractalNoise" baseFrequency="${freq} ${(freq * 0.5).toFixed(4)}" numOctaves="2" result="vaporTurbulence" />`,
    `    <feDisplacementMap in="SourceGraphic" in2="vaporTurbulence" scale="${amp.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" />`,
    '  </filter>',
    '</defs>',
  ].join('\n');
}
