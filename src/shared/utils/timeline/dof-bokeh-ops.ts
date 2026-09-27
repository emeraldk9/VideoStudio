/**
 * Whiteboard Layered Depth-of-Field (DoF) Optical Bokeh & Defocus Hand Blur Operations.
 * Simulates shallow depth-of-field optics:
 * 1. Physical circle-of-confusion (CoC) lens aperture calculations.
 * 2. Tack-sharp focal plane on active writing nib in contact with drawing surface (Z=0).
 * 3. Longitudinal gradient defocus blurring forearm and wrist toward camera (Z > 0).
 * 4. Z-lift optical defocus during transitions, hops, and eraser cap flips.
 */

export type LensApertureFStop = 'f1.4' | 'f1.8' | 'f2.8' | 'f4.0' | 'f5.6';

export interface DepthOfFieldSettings {
  enabled?: boolean;
  aperture?: LensApertureFStop; // default 'f2.8'
  maxBlurPx?: number; // 4..35 px, default 18
  tipLiftDefocus?: boolean; // default true
  wristElevationMm?: number; // 60..250 mm, default 140
}

export interface HandDoFState {
  tipBlurSigma: number;
  wristBlurSigma: number;
  gradientAngleDeg: number;
}

/**
 * Parses lens aperture f-number string into float.
 */
export function parseFStopValue(aperture?: LensApertureFStop): number {
  switch (aperture) {
    case 'f1.4':
      return 1.4;
    case 'f1.8':
      return 1.8;
    case 'f4.0':
      return 4.0;
    case 'f5.6':
      return 5.6;
    case 'f2.8':
    default:
      return 2.8;
  }
}

/**
 * Computes optical circle-of-confusion (blur radius in px) given depth difference from focal plane.
 */
export function calculateCircleOfConfusion(
  zMm: number,
  focalPlaneMm: number = 0.0,
  fStop: number = 2.8,
  maxBlurPx: number = 24.0,
): number {
  const deltaZ = Math.abs(zMm - focalPlaneMm);
  const rawCoc = deltaZ / (15.0 * Math.max(0.5, fStop));
  return Number(Math.max(0.0, Math.min(maxBlurPx, rawCoc)).toFixed(2));
}

/**
 * Computes tip and wrist blur sigmas for the current hand position and z-lift.
 */
export function calculateHandDefocusSigmas(
  tipZLiftPx: number = 0.0,
  config?: DepthOfFieldSettings,
): { tipSigma: number; wristSigma: number } {
  const fStop = parseFStopValue(config?.aperture);
  const maxBlur = config?.maxBlurPx ?? 18.0;
  const wristElevation = config?.wristElevationMm ?? 140.0;
  const allowLift = config?.tipLiftDefocus ?? true;

  const tipZMm = allowLift ? tipZLiftPx * 0.8 : 0.0;
  const tipSigma = calculateCircleOfConfusion(tipZMm, 0.0, fStop, maxBlur);
  const wristSigma = calculateCircleOfConfusion(tipZMm + wristElevation, 0.0, fStop, maxBlur);

  return { tipSigma, wristSigma };
}

/**
 * Generates an SVG filter markup string for depth-of-field blur.
 */
export function generateDoFHandSvgFilterMarkup(
  tipSigma: number,
  wristSigma: number,
  filterId: string = 'hand-dof-filter',
): string {
  const avgSigma = Number(((tipSigma + wristSigma) * 0.5).toFixed(2));
  return `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="${avgSigma}" />
</filter>`;
}
