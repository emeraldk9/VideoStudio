/**
 * Whiteboard Marker Ink Depletion, Dry-Out Streaking & Chalk Micro-Chatter Physics Operations.
 * Simulates realistic solvent evaporation and pigment depletion dynamics:
 * 1. Marker Dry-Out & Felt Striations: Long continuous strokes exhaust solvent, exposing dry felt fibers.
 * 2. Capillary Recharge: Pausing or lifting the pen allows solvent to wick back into the nib.
 * 3. Chalk Micro-Chatter: High-frequency stick-slip friction skips on rough slate surfaces.
 */

export interface InkDepletionSettings {
  enabled?: boolean;
  depletionRate?: number; // Reservoir drain per pixel of travel (0.0005..0.01, default 0.002)
  minSaturation?: number; // Minimum pigment saturation when dry (0.1..0.8, default 0.35)
  streakCount?: number; // Number of parallel felt-fiber striations (1..10, default 5)
  rechargeRate?: number; // Capillary reservoir refill per second of rest (0.05..1.0, default 0.25)
  chatterFrequency?: number; // Chalk micro-skip frequency along path (0.02..0.5, default 0.15)
  enableChalkChatter?: boolean; // Enable stick-slip micro-skipping for chalk (default false)
}

export const DEFAULT_INK_DEPLETION_SETTINGS: Required<InkDepletionSettings> = {
  enabled: true,
  depletionRate: 0.002,
  minSaturation: 0.35,
  streakCount: 5,
  rechargeRate: 0.25,
  chatterFrequency: 0.15,
  enableChalkChatter: false,
};

/**
 * Calculates remaining ink reservoir level after drawing a stroke of given length.
 */
export function calculateStrokeDepletion(
  lengthPx: number,
  initialLevel = 1.0,
  depletionRate = 0.002,
  minSaturation = 0.35
): number {
  if (lengthPx <= 0) return initialLevel;
  const depleted = initialLevel - depletionRate * lengthPx;
  return Math.max(minSaturation, Math.min(1.0, depleted));
}

/**
 * Simulates capillary reservoir recharge while the pen is lifted or resting.
 */
export function rechargeReservoirLevel(
  currentLevel: number,
  restDurationSec: number,
  rechargeRate = 0.25
): number {
  if (restDurationSec <= 0) return currentLevel;
  const recharged = currentLevel + rechargeRate * restDurationSec;
  return Math.max(0.0, Math.min(1.0, recharged));
}

/**
 * Applies high-frequency stick-slip chatter modulation to stroke opacities for chalk textures.
 */
export function applyChalkMicroChatter(
  opacities: number[],
  segmentLengths: number[],
  chatterFrequency = 0.15
): number[] {
  if (opacities.length === 0) return [];
  let accumS = 0;
  return opacities.map((op, i) => {
    if (i > 0 && i - 1 < segmentLengths.length) {
      accumS += segmentLengths[i - 1];
    }
    const wave = 0.5 + 0.5 * Math.sin(accumS * chatterFrequency * 2 * Math.PI);
    const mod = wave < 0.25 ? wave * 0.3 : wave;
    return Math.max(0.05, Math.min(1.0, op * mod));
  });
}

/**
 * Generates an SVG mask markup string representing parallel dry felt fibers.
 */
export function generateStriationMaskSvg(
  width = 100,
  height = 20,
  streakCount = 5,
  drynessRatio = 0.5
): string {
  const streaks: string[] = [];
  const spacing = height / Math.max(1, streakCount);

  for (let i = 0; i < streakCount; i++) {
    const y = Math.round((i + 0.5) * spacing);
    const fiberOpacity = Math.max(0.1, 1.0 - drynessRatio * (0.3 + 0.7 * (i % 2)));
    streaks.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="white" stroke-width="${Math.max(1, Math.round(spacing * 0.7))}" stroke-opacity="${fiberOpacity.toFixed(2)}" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${streaks.join('\n')}\n</svg>`;
}
