/**
 * Procedural Stippling & Pointillism Ink Shading Operations.
 *
 * Implements classic technical pen hedcut, botanical engraving, and pointillism:
 * 1. Blue-noise / Poisson-disk dot distribution modulated by local tone darkness density.
 * 2. Spatial repulsion relaxation eliminating clumping artifacts.
 * 3. Sub-pixel fineliner nib dot gain and capillary paper bleed.
 * 4. Stylus tap-tapping foley acoustics telemetry (rhythmic impact transients).
 * 5. High-performance SVG markup generation for stipple clusters.
 */

export interface StippleConfig {
  enabled: boolean;
  minDotRadius: number;          // Minimum dot radius in highlights in px (default: 0.8)
  maxDotRadius: number;          // Maximum dot radius in deep shadows in px (default: 2.4)
  densityScale: number;          // Multiplier for total point budget (default: 1.0)
  relaxationIterations: number;  // Number of spatial repulsion passes (default: 3)
  dotGainFactor: number;         // Physical nib paper bleed factor (default: 0.25)
  paperBleedPx: number;          // Edge feathering blur radius in px (default: 0.35)
  stippleColorHex: string;       // Archival ink black/sepia hex (default: #161414)
  foleyTapVolume: number;        // Tap impact audio volume (default: 0.75)
}

export type StippleSettings = Partial<StippleConfig>;

export const DEFAULT_STIPPLE_CONFIG: StippleConfig = {
  enabled: false,
  minDotRadius: 0.8,
  maxDotRadius: 2.4,
  densityScale: 1.0,
  relaxationIterations: 3,
  dotGainFactor: 0.25,
  paperBleedPx: 0.35,
  stippleColorHex: '#161414',
  foleyTapVolume: 0.75,
};

export interface StippleDot {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  tapTimeMs: number;
}

export interface StippleFoleyTelemetry {
  dotCount: number;
  tapRateHz: number;
  tapIntensity: number;
  transientPeakHz: number;
  paperReboundReverb: number;
}

/**
 * Validates and clamps procedural stippling configuration parameters.
 */
export function validateStippleConfig(
  config?: Partial<StippleConfig>
): StippleConfig {
  if (!config) {
    return { ...DEFAULT_STIPPLE_CONFIG };
  }

  const minR = Math.max(0.2, Math.min(5.0, Number(config.minDotRadius ?? DEFAULT_STIPPLE_CONFIG.minDotRadius)));
  const maxR = Math.max(minR, Math.min(10.0, Number(config.maxDotRadius ?? DEFAULT_STIPPLE_CONFIG.maxDotRadius)));

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_STIPPLE_CONFIG.enabled),
    minDotRadius: minR,
    maxDotRadius: maxR,
    densityScale: Math.max(0.1, Math.min(5.0, Number(config.densityScale ?? DEFAULT_STIPPLE_CONFIG.densityScale))),
    relaxationIterations: Math.max(0, Math.min(8, Math.round(Number(config.relaxationIterations ?? DEFAULT_STIPPLE_CONFIG.relaxationIterations)))),
    dotGainFactor: Math.max(0.0, Math.min(1.0, Number(config.dotGainFactor ?? DEFAULT_STIPPLE_CONFIG.dotGainFactor))),
    paperBleedPx: Math.max(0.0, Math.min(2.0, Number(config.paperBleedPx ?? DEFAULT_STIPPLE_CONFIG.paperBleedPx))),
    stippleColorHex: typeof config.stippleColorHex === 'string' && config.stippleColorHex.length > 0
      ? config.stippleColorHex
      : DEFAULT_STIPPLE_CONFIG.stippleColorHex,
    foleyTapVolume: Math.max(0.0, Math.min(1.5, Number(config.foleyTapVolume ?? DEFAULT_STIPPLE_CONFIG.foleyTapVolume))),
  };
}

/**
 * Generates initial candidate stipple points based on a tone density function.
 * densityFn(x, y) returns a value in [0.0, 1.0] where 1.0 is full shadow.
 */
export function generateStippleDistribution(
  width: number,
  height: number,
  densityFn: (x: number, y: number) => number,
  config?: Partial<StippleConfig>,
  seed = 42
): StippleDot[] {
  const cfg = validateStippleConfig(config);
  // Linear congruential pseudo-random generator for determinism
  let s = seed >>> 0;
  const nextRng = (): number => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296.0;
  };

  const baseBudget = Math.round((width * height / 36.0) * cfg.densityScale);
  const targetCount = Math.max(10, Math.min(3000, baseBudget));

  const dots: StippleDot[] = [];
  const maxAttempts = targetCount * 4;

  for (let i = 0; i < maxAttempts && dots.length < targetCount; i++) {
    const cx = 2.0 + nextRng() * (width - 4.0);
    const cy = 2.0 + nextRng() * (height - 4.0);
    const density = Math.max(0.0, Math.min(1.0, densityFn(cx, cy)));

    if (nextRng() <= density) {
      const r = cfg.minDotRadius + (cfg.maxDotRadius - cfg.minDotRadius) * Math.pow(density, 1.2);
      const rEff = r * (1.0 + cfg.dotGainFactor);
      dots.push({
        x: cx,
        y: cy,
        radius: rEff,
        opacity: 0.75 + 0.25 * density,
        tapTimeMs: (dots.length / targetCount) * 2000.0,
      });
    }
  }

  return applySpatialRelaxation(dots, width, height, cfg.relaxationIterations);
}

/**
 * Applies spatial repulsion relaxation passes to homogenize point distribution.
 */
export function applySpatialRelaxation(
  dots: StippleDot[],
  width: number,
  height: number,
  iterations = 3
): StippleDot[] {
  if (dots.length < 2 || iterations <= 0) return dots;

  const n = dots.length;
  const coordsX = dots.map((d) => d.x);
  const coordsY = dots.map((d) => d.y);
  const radii = dots.map((d) => d.radius);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      let forceX = 0.0;
      let forceY = 0.0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = coordsX[i] - coordsX[j];
        const dy = coordsY[i] - coordsY[j];
        const dist = Math.hypot(dx, dy);
        const repelRadius = (radii[i] + radii[j]) * 2.2;

        if (dist > 1e-4 && dist < repelRadius) {
          const overlap = (repelRadius - dist) / repelRadius;
          forceX += (dx / dist) * overlap;
          forceY += (dy / dist) * overlap;
        }
      }

      const stepSize = 0.35;
      coordsX[i] = Math.max(2.0, Math.min(width - 2.0, coordsX[i] + forceX * stepSize));
      coordsY[i] = Math.max(2.0, Math.min(height - 2.0, coordsY[i] + forceY * stepSize));
    }
  }

  return dots.map((d, i) => ({
    ...d,
    x: coordsX[i],
    y: coordsY[i],
  }));
}

/**
 * Computes rapid stylus tap-tapping foley acoustic telemetry parameters.
 */
export function computeStippleFoleyTelemetry(
  dots: StippleDot[],
  durationMs = 2000.0,
  config?: Partial<StippleConfig>
): StippleFoleyTelemetry {
  const cfg = validateStippleConfig(config);
  const count = dots.length;
  const timeSec = Math.max(0.1, durationMs / 1000.0);
  const tapRateHz = count / timeSec;
  const avgRadius = count > 0 ? dots.reduce((acc, d) => acc + d.radius, 0) / count : 1.0;

  return {
    dotCount: count,
    tapRateHz: Math.min(120.0, tapRateHz),
    tapIntensity: Math.min(1.0, (avgRadius / cfg.maxDotRadius) * cfg.foleyTapVolume),
    transientPeakHz: 2200.0 + Math.min(1800.0, tapRateHz * 15.0),
    paperReboundReverb: Math.min(0.8, cfg.foleyTapVolume * 0.5),
  };
}

/**
 * Generates vector SVG markup for procedural stipple dots with sub-pixel circles.
 */
export function generateStippleSvgMarkup(
  dots: StippleDot[],
  config?: Partial<StippleConfig>
): string {
  const cfg = validateStippleConfig(config);
  if (dots.length === 0) return '';

  const circles = dots.map((d) => {
    return `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.radius.toFixed(2)}" fill="${cfg.stippleColorHex}" opacity="${d.opacity.toFixed(2)}" />`;
  });

  return `<g class="stipple-field" pointer-events="none">\n${circles.join('\n')}\n</g>`;
}
