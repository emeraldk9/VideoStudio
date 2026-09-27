/**
 * Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading Operations.
 *
 * Implements pointed metal flex dip pen physics:
 * 1. Nonlinear spring steel tine splay width expansion under stylus pressure.
 * 2. Capillary meniscus cohesive surface tension, rupture snapping into twin parallel tracks ("railroading"),
 *    and hysteresis reconnection below narrowing threshold.
 * 3. Dip reservoir droplet consumption scaled by stroke length and line swell width.
 * 4. Flexible steel tine scratch acoustic foley telemetry (1800-4500 Hz).
 * 5. Vector ribbon and dual-track SVG path generation.
 */

export interface FlexNibConfig {
  enabled: boolean;
  hairlineWidth: number;          // Minimum tip width at zero downforce in px (default: 1.2)
  maxSwellWidth: number;          // Maximum expanded stroke swell at 100% pressure in px (default: 14.0)
  flexSensitivity: number;        // Cantilever spring bending exponent gamma (default: 1.4)
  meniscusRuptureWidth: number;   // Critical width where liquid meniscus snaps in px (default: 9.5)
  meniscusReconnectWidth: number; // Width where tines bridge back together in px (default: 6.0)
  reservoirCapacityPx: number;    // Dip droplet arc length capacity in px (default: 1200.0)
  inkFlowRate: number;            // Multiplier on ink consumption (default: 1.0)
  inkColorHex: string;            // Dense calligraphic black/sepia hex (default: #191414)
  paperScratchResonance: number;  // Foley scratch audio resonance factor (default: 0.8)
}

export type FlexNibSettings = Partial<FlexNibConfig>;

export const DEFAULT_FLEX_NIB_CONFIG: FlexNibConfig = {
  enabled: false,
  hairlineWidth: 1.2,
  maxSwellWidth: 14.0,
  flexSensitivity: 1.4,
  meniscusRuptureWidth: 9.5,
  meniscusReconnectWidth: 6.0,
  reservoirCapacityPx: 1200.0,
  inkFlowRate: 1.0,
  inkColorHex: '#191414',
  paperScratchResonance: 0.8,
};

export interface FlexNibFoleyTelemetry {
  scratchIntensity: number;
  scratchFreqHz: number;
  tineFlexCreak: number;
  isRailroaded: number;
  reservoirLevel: number;
}

export interface FlexNibPointState {
  index: number;
  pt: [number, number];
  pressure: number;
  tineWidth: number;
  isRailroaded: boolean;
  leftTinePt: [number, number];
  rightTinePt: [number, number];
  reservoirLevel: number;
  foleyTelemetry: FlexNibFoleyTelemetry;
}

/**
 * Validates and clamps flex nib calligraphic configuration parameters.
 */
export function validateFlexNibConfig(
  config?: Partial<FlexNibConfig>
): FlexNibConfig {
  if (!config) {
    return { ...DEFAULT_FLEX_NIB_CONFIG };
  }

  const hWidth = Math.max(0.5, Math.min(5.0, Number(config.hairlineWidth ?? DEFAULT_FLEX_NIB_CONFIG.hairlineWidth)));
  const sWidth = Math.max(hWidth, Math.min(40.0, Number(config.maxSwellWidth ?? DEFAULT_FLEX_NIB_CONFIG.maxSwellWidth)));
  const rWidth = Math.max(hWidth, Math.min(sWidth, Number(config.meniscusRuptureWidth ?? DEFAULT_FLEX_NIB_CONFIG.meniscusRuptureWidth)));
  const cWidth = Math.max(hWidth, Math.min(rWidth, Number(config.meniscusReconnectWidth ?? DEFAULT_FLEX_NIB_CONFIG.meniscusReconnectWidth)));

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_FLEX_NIB_CONFIG.enabled),
    hairlineWidth: hWidth,
    maxSwellWidth: sWidth,
    flexSensitivity: Math.max(0.5, Math.min(3.0, Number(config.flexSensitivity ?? DEFAULT_FLEX_NIB_CONFIG.flexSensitivity))),
    meniscusRuptureWidth: rWidth,
    meniscusReconnectWidth: cWidth,
    reservoirCapacityPx: Math.max(100, Math.min(10000, Number(config.reservoirCapacityPx ?? DEFAULT_FLEX_NIB_CONFIG.reservoirCapacityPx))),
    inkFlowRate: Math.max(0.1, Math.min(5.0, Number(config.inkFlowRate ?? DEFAULT_FLEX_NIB_CONFIG.inkFlowRate))),
    inkColorHex: typeof config.inkColorHex === 'string' && config.inkColorHex.length > 0
      ? config.inkColorHex
      : DEFAULT_FLEX_NIB_CONFIG.inkColorHex,
    paperScratchResonance: Math.max(0.0, Math.min(2.0, Number(config.paperScratchResonance ?? DEFAULT_FLEX_NIB_CONFIG.paperScratchResonance))),
  };
}

/**
 * Computes nonlinear splay width between spring steel tines as a function of pressure.
 * w(p) = w_0 + (w_max - w_0) * p^gamma
 */
export function computeTineSplayWidth(
  pressure: number,
  config?: Partial<FlexNibConfig>
): number {
  const cfg = validateFlexNibConfig(config);
  const p = Math.max(0.0, Math.min(1.0, pressure));
  return cfg.hairlineWidth + (cfg.maxSwellWidth - cfg.hairlineWidth) * Math.pow(p, cfg.flexSensitivity);
}

/**
 * Evaluates whether liquid ink capillary meniscus is intact or ruptured into twin railroad tracks.
 * Features hysteresis loop and ink starvation acceleration.
 */
export function evaluateMeniscusState(
  currentWidth: number,
  isCurrentlyRailroaded: boolean,
  reservoirLevel: number,
  config?: Partial<FlexNibConfig>
): boolean {
  const cfg = validateFlexNibConfig(config);
  const res = Math.max(0.0, Math.min(1.0, reservoirLevel));
  const effectiveRupture = cfg.meniscusRuptureWidth * (0.45 + 0.55 * res);
  const reconnectThresh = Math.min(cfg.meniscusReconnectWidth, effectiveRupture * 0.75);

  if (!isCurrentlyRailroaded) {
    if (currentWidth >= effectiveRupture || res <= 0.01) {
      return true;
    }
    return false;
  } else {
    if (currentWidth <= reconnectThresh && res > 0.05) {
      return false;
    }
    return true;
  }
}

/**
 * Calculates 2D positions of left and right steel tine tips orthogonal to stroke tangent.
 */
export function calculateTineOffsets(
  pt: [number, number],
  normal: [number, number],
  width: number
): { leftTinePt: [number, number]; rightTinePt: [number, number] } {
  const halfW = width * 0.5;
  const [nx, ny] = normal;
  return {
    leftTinePt: [pt[0] + nx * halfW, pt[1] + ny * halfW],
    rightTinePt: [pt[0] - nx * halfW, pt[1] - ny * halfW],
  };
}

/**
 * Simulates physical progression of a flex dip pen stroke, computing tine splay,
 * meniscus rupture railroading, reservoir depletion, and acoustic telemetry.
 */
export function simulateDipPenStroke(
  points: Array<[number, number]>,
  pressures?: number[],
  initialReservoir = 1.0,
  config?: Partial<FlexNibConfig>,
  dt = 0.016
): FlexNibPointState[] {
  const cfg = validateFlexNibConfig(config);
  const n = points.length;
  if (n === 0) return [];

  const effectivePressures = pressures && pressures.length === n
    ? pressures
    : new Array(n).fill(0.5);

  const results: FlexNibPointState[] = [];
  let resLevel = Math.max(0.0, Math.min(1.0, initialReservoir));
  const capacity = cfg.reservoirCapacityPx;
  let isRailroaded = false;
  let prevWidth = cfg.hairlineWidth;

  for (let i = 0; i < n; i++) {
    const currPt = points[i];
    const currP = effectivePressures[i];

    let normal: [number, number] = [0, 1];
    let ds = 0.0;

    if (n === 1) {
      normal = [0, 1];
      ds = 0.0;
    } else if (i === 0) {
      const dx = points[1][0] - currPt[0];
      const dy = points[1][1] - currPt[1];
      const segLen = Math.hypot(dx, dy);
      ds = segLen;
      if (segLen > 1e-4) normal = [-dy / segLen, dx / segLen];
    } else if (i === n - 1) {
      const dx = currPt[0] - points[i - 1][0];
      const dy = currPt[1] - points[i - 1][1];
      const segLen = Math.hypot(dx, dy);
      ds = segLen;
      if (segLen > 1e-4) normal = [-dy / segLen, dx / segLen];
    } else {
      const dx = points[i + 1][0] - points[i - 1][0];
      const dy = points[i + 1][1] - points[i - 1][1];
      const segLen = Math.hypot(dx, dy);
      ds = Math.hypot(currPt[0] - points[i - 1][0], currPt[1] - points[i - 1][1]);
      if (segLen > 1e-4) normal = [-dy / segLen, dx / segLen];
    }

    // 1. Tine splay width
    const width = computeTineSplayWidth(currP, cfg);

    // 2. Reservoir consumption
    const wFactor = 1.0 + 0.15 * (width / Math.max(1.0, cfg.hairlineWidth));
    const drain = (ds * wFactor * cfg.inkFlowRate) / capacity;
    resLevel = Math.max(0.0, resLevel - drain);

    // 3. Meniscus rupture evaluation
    isRailroaded = evaluateMeniscusState(width, isRailroaded, resLevel, cfg);

    // 4. Tine tip positions
    const { leftTinePt, rightTinePt } = calculateTineOffsets(currPt, normal, width);

    // 5. Acoustic telemetry
    const speed = ds / Math.max(1e-4, dt);
    const dwDt = Math.abs(width - prevWidth) / Math.max(1e-4, dt);
    prevWidth = width;

    const foley: FlexNibFoleyTelemetry = {
      scratchIntensity: Math.min(1.0, (currP * 0.7 + (speed / 1000.0) * 0.3) * cfg.paperScratchResonance),
      scratchFreqHz: 1800.0 + Math.min(2700.0, speed * 2.5 + width * 90.0),
      tineFlexCreak: Math.min(1.0, (dwDt / 500.0) * 0.8),
      isRailroaded: isRailroaded ? 1.0 : 0.0,
      reservoirLevel: resLevel,
    };

    results.push({
      index: i,
      pt: currPt,
      pressure: currP,
      tineWidth: width,
      isRailroaded,
      leftTinePt,
      rightTinePt,
      reservoirLevel: resLevel,
      foleyTelemetry: foley,
    });
  }

  return results;
}

/**
 * Generates vector SVG path markup for calligraphic flex nib stroke:
 * - Solid ribbons when meniscus is intact.
 * - Split parallel tine tracks when railroaded.
 */
export function generateFlexNibSvgPaths(
  states: FlexNibPointState[],
  config?: Partial<FlexNibConfig>
): string {
  const cfg = validateFlexNibConfig(config);
  if (states.length < 2) return '';

  const paths: string[] = [];
  const ink = cfg.inkColorHex;
  const hairline = cfg.hairlineWidth;

  for (let i = 1; i < states.length; i++) {
    const s0 = states[i - 1];
    const s1 = states[i];

    const opacity = (0.5 + 0.5 * Math.max(0.1, s1.reservoirLevel)).toFixed(2);

    if (!s0.isRailroaded && !s1.isRailroaded) {
      // Solid swell quad ribbon
      const quad = `M ${s0.leftTinePt[0].toFixed(1)} ${s0.leftTinePt[1].toFixed(1)} L ${s1.leftTinePt[0].toFixed(1)} ${s1.leftTinePt[1].toFixed(1)} L ${s1.rightTinePt[0].toFixed(1)} ${s1.rightTinePt[1].toFixed(1)} L ${s0.rightTinePt[0].toFixed(1)} ${s0.rightTinePt[1].toFixed(1)} Z`;
      paths.push(`<path d="${quad}" fill="${ink}" opacity="${opacity}" />`);
    } else {
      // Railroaded twin tracks
      const leftTrack = `M ${s0.leftTinePt[0].toFixed(1)} ${s0.leftTinePt[1].toFixed(1)} L ${s1.leftTinePt[0].toFixed(1)} ${s1.leftTinePt[1].toFixed(1)}`;
      const rightTrack = `M ${s0.rightTinePt[0].toFixed(1)} ${s0.rightTinePt[1].toFixed(1)} L ${s1.rightTinePt[0].toFixed(1)} ${s1.rightTinePt[1].toFixed(1)}`;
      paths.push(`<path d="${leftTrack}" fill="none" stroke="${ink}" stroke-width="${hairline.toFixed(1)}" stroke-linecap="round" opacity="${opacity}" />`);
      paths.push(`<path d="${rightTrack}" fill="none" stroke="${ink}" stroke-width="${hairline.toFixed(1)}" stroke-linecap="round" opacity="${opacity}" />`);
    }
  }

  return paths.join('\n');
}
