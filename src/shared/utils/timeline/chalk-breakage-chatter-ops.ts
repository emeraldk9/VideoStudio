/**
 * Whiteboard Chalk Breakage & Variable Angle Edge Chatters Operations.
 *
 * Implements physical contact mechanics of brittle calcium carbonate/sulfate chalk:
 * 1. Stick-slip friction chattering creating rhythmic dashed skips (staccato gaps).
 * 2. Slant grazing angle modulation scaling chatter frequency and wavelength.
 * 3. Critical downforce shear breakage snapping the chalk stick at high pressure.
 * 4. Irregular sharp wedge-facet width expansion following snap events.
 * 5. Radial micro-burst of chalk dust fragments and sedimentation shards radiating from the snap.
 */

export interface DebrisShard {
  position: [number, number];
  velocity: [number, number];
  radius: number;
  opacity: number;
}

export interface ChalkBreakEvent {
  index: number;
  timestamp: number;
  position: [number, number];
  originalWidth: number;
  brokenWidth: number;
  shards: DebrisShard[];
}

export interface ChatteredSegment {
  start: [number, number];
  end: [number, number];
  width: number;
  opacity: number;
  isGap: boolean;
}

export interface ChalkChatterConfig {
  enabled: boolean;
  slantAngleDeg: number;            // grazing angle between chalk stick and board (20 - 75 deg)
  chatterFrequencyHz: number;      // stick-slip resonant frequency (60 - 240 Hz)
  skipThreshold: number;           // duty cycle threshold for hollow gaps (0.1 - 0.7)
  breakagePressureThreshold: number; // critical downforce pressure for stick snap (0.6 - 0.98)
  facetWidthMultiplier: number;    // wedge facet width multiplier after snap (1.5 - 3.5)
  dustBurstCount: number;          // number of debris shards emitted upon snap (0 - 30)
  chalkColorHex: string;           // Chalk color (default: #f0f5f5)
}

export type ChalkChatterSettings = Partial<ChalkChatterConfig>;

export const DEFAULT_CHALK_CHATTER_CONFIG: ChalkChatterConfig = {
  enabled: false,
  slantAngleDeg: 40.0,
  chatterFrequencyHz: 140.0,
  skipThreshold: 0.35,
  breakagePressureThreshold: 0.88,
  facetWidthMultiplier: 2.2,
  dustBurstCount: 12,
  chalkColorHex: '#f0f5f5',
};

/**
 * Validates and clamps chalk chatter configuration parameters into physically sound domains.
 */
export function validateChalkChatterConfig(config?: Partial<ChalkChatterConfig>): ChalkChatterConfig {
  if (!config) {
    return { ...DEFAULT_CHALK_CHATTER_CONFIG };
  }
  return {
    enabled: Boolean(config.enabled ?? DEFAULT_CHALK_CHATTER_CONFIG.enabled),
    slantAngleDeg: Math.max(10.0, Math.min(85.0, Number(config.slantAngleDeg ?? DEFAULT_CHALK_CHATTER_CONFIG.slantAngleDeg))),
    chatterFrequencyHz: Math.max(20.0, Math.min(300.0, Number(config.chatterFrequencyHz ?? DEFAULT_CHALK_CHATTER_CONFIG.chatterFrequencyHz))),
    skipThreshold: Math.max(0.05, Math.min(0.9, Number(config.skipThreshold ?? DEFAULT_CHALK_CHATTER_CONFIG.skipThreshold))),
    breakagePressureThreshold: Math.max(0.5, Math.min(0.99, Number(config.breakagePressureThreshold ?? DEFAULT_CHALK_CHATTER_CONFIG.breakagePressureThreshold))),
    facetWidthMultiplier: Math.max(1.0, Math.min(5.0, Number(config.facetWidthMultiplier ?? DEFAULT_CHALK_CHATTER_CONFIG.facetWidthMultiplier))),
    dustBurstCount: Math.max(0, Math.min(50, Math.round(Number(config.dustBurstCount ?? DEFAULT_CHALK_CHATTER_CONFIG.dustBurstCount)))),
    chalkColorHex: typeof config.chalkColorHex === 'string' && config.chalkColorHex.length > 0
      ? config.chalkColorHex
      : DEFAULT_CHALK_CHATTER_CONFIG.chalkColorHex,
  };
}

/**
 * Computes spatial wavelength of stick-slip chatter skips.
 * Shallower slant angles increase compliance and skip length.
 */
export function computeChatterWavelength(
  speedPxPerSec: number,
  freqHz: number = 140.0,
  slantDeg: number = 40.0
): number {
  const safeSpeed = Math.max(10.0, Number(speedPxPerSec));
  const safeFreq = Math.max(20.0, Number(freqHz));
  const clampedSlant = Math.max(10.0, Math.min(80.0, Number(slantDeg)));
  const rad = (clampedSlant * Math.PI) / 180.0;
  // Compliance factor: cos(theta) increases as chalk lays flatter
  const compliance = 1.0 + Math.cos(rad) * 0.8;
  const wavelength = (safeSpeed / safeFreq) * compliance * 10.0;
  return Math.max(1.0, Math.min(150.0, wavelength));
}

/**
 * Generates radial chalk dust shards and fragments radiating outward from snap point.
 */
export function generateDebrisShards(
  pos: [number, number],
  count: number = 12,
  burstRadius: number = 24.0
): DebrisShard[] {
  const shards: DebrisShard[] = [];
  const safeCount = Math.max(0, Math.round(count));
  if (safeCount <= 0) {
    return shards;
  }

  for (let i = 0; i < safeCount; i++) {
    const angle = (2.0 * Math.PI * i) / safeCount + 0.35 * Math.sin(i * 1.7);
    const dist = burstRadius * (0.3 + 0.7 * Math.abs(Math.sin(i * 2.3)));
    const px = pos[0] + dist * Math.cos(angle);
    const py = pos[1] + dist * Math.sin(angle);
    const radius = Math.max(1.0, 2.5 * (1.0 - dist / (burstRadius * 1.2)));
    const opacity = Math.max(0.15, Math.min(0.85, 1.0 - (dist / burstRadius) * 0.6));

    shards.push({
      position: [px, py],
      velocity: [Math.cos(angle) * 10.0, Math.sin(angle) * 10.0],
      radius,
      opacity,
    });
  }
  return shards;
}

/**
 * Transforms continuous stroke points into stick-slip chattered segments,
 * detecting structural breakage when pressure exceeds threshold.
 */
export function generateChatteredStroke(
  points: [number, number][],
  pressures: number[],
  timestamps: number[],
  baseWidth: number = 6.0,
  config?: Partial<ChalkChatterConfig>
): { segments: ChatteredSegment[]; breakEvent: ChalkBreakEvent | null } {
  const validConfig = validateChalkChatterConfig(config);
  const n = Math.min(points.length, pressures.length, timestamps.length);
  if (n < 2) {
    return { segments: [], breakEvent: null };
  }

  // 1. Detect Chalk Stick Breakage
  let breakEvent: ChalkBreakEvent | null = null;
  if (validConfig.enabled) {
    const thresh = validConfig.breakagePressureThreshold;
    for (let i = 0; i < n; i++) {
      if (pressures[i] >= thresh) {
        const brokenWidth = baseWidth * validConfig.facetWidthMultiplier;
        const shards = generateDebrisShards(points[i], validConfig.dustBurstCount);
        breakEvent = {
          index: i,
          timestamp: timestamps[i],
          position: [points[i][0], points[i][1]],
          originalWidth: baseWidth,
          brokenWidth,
          shards,
        };
        break;
      }
    }
  }

  // 2. Build Chattered Stroke Segments
  const segments: ChatteredSegment[] = [];
  let arcLength = 0.0;
  let isBroken = false;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const t0 = timestamps[i];
    const t1 = timestamps[i + 1];
    const dt = Math.max(1e-4, t1 - t0);

    const segDist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const speed = segDist / dt;

    if (breakEvent !== null && i >= breakEvent.index) {
      isBroken = true;
    }

    const currentWidth = isBroken
      ? baseWidth * validConfig.facetWidthMultiplier
      : baseWidth;

    if (!validConfig.enabled) {
      // Simple continuous segment without chattering
      segments.push({
        start: [p0[0], p0[1]],
        end: [p1[0], p1[1]],
        width: currentWidth,
        opacity: 1.0,
        isGap: false,
      });
      arcLength += segDist;
      continue;
    }

    // Subdivide segment to resolve high-frequency chatter oscillation
    const wavelength = computeChatterWavelength(
      speed,
      validConfig.chatterFrequencyHz,
      validConfig.slantAngleDeg
    );
    const steps = Math.max(1, Math.ceil(segDist / (wavelength * 0.25)));

    for (let s = 0; s < steps; s++) {
      const frac0 = s / steps;
      const frac1 = (s + 1) / steps;

      const subP0: [number, number] = [
        p0[0] + frac0 * (p1[0] - p0[0]),
        p0[1] + frac0 * (p1[1] - p0[1]),
      ];
      const subP1: [number, number] = [
        p0[0] + frac1 * (p1[0] - p0[0]),
        p0[1] + frac1 * (p1[1] - p0[1]),
      ];

      const subArc = arcLength + frac0 * segDist;
      // Stick-slip harmonic: sin(2*pi*s / wavelength)
      const phase = (2.0 * Math.PI * subArc) / wavelength;
      const waveVal = (Math.sin(phase) + 1.0) * 0.5; // [0, 1]

      const isGap = waveVal < validConfig.skipThreshold;
      const opacity = isGap
        ? 0.05
        : Math.max(
            0.4,
            Math.min(
              1.0,
              (waveVal - validConfig.skipThreshold) / (1.0 - validConfig.skipThreshold)
            )
          );

      segments.push({
        start: subP0,
        end: subP1,
        width: currentWidth,
        opacity,
        isGap,
      });
    }

    arcLength += segDist;
  }

  return { segments, breakEvent };
}
