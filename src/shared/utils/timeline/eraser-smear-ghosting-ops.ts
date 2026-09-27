/**
 * Whiteboard Dry-Erase Felt Eraser Swipe Smear & Ghosting Residuals Operations.
 *
 * Models real-world felt pad particulate saturation, trailing wiper streaks, and chemical ghosting:
 * 1. Felt pad saturation: accumulating dry pigment powder as dark strokes are cleared.
 * 2. Trailing wiper streaks: faint directional smear bands deposited behind moving eraser edges.
 * 3. Chemical ghosting memory: faint residual silhouettes persisting after initial erasing passes.
 * 4. Multi-pass cleaning decay: successive wipes progressively diminish ghosting residuals.
 */

export interface EraserGhostingSettings {
  enabled?: boolean;
  feltSaturationRate?: number; // 0.01..0.20, default 0.08
  smearOpacity?: number;       // 0.01..0.15, default 0.06
  ghostPersistence?: number;   // 0.01..0.12, default 0.05
  cleaningDecayRate?: number;  // 0.20..0.80, default 0.40
}

export const DEFAULT_ERASER_GHOSTING_SETTINGS: Required<EraserGhostingSettings> = {
  enabled: false,
  feltSaturationRate: 0.08,
  smearOpacity: 0.06,
  ghostPersistence: 0.05,
  cleaningDecayRate: 0.40,
};

export interface SmearPoint2D {
  x: number;
  y: number;
}

export interface SmearBandQuad {
  v0: SmearPoint2D;
  v1: SmearPoint2D;
  v2: SmearPoint2D;
  v3: SmearPoint2D;
  opacity: number;
  colorHex: string;
}

export interface SmearBandMesh {
  quads: SmearBandQuad[];
  totalLength: number;
}

/**
 * Updates eraser felt pad saturation based on cleared ink mass.
 */
export function updateFeltSaturation(
  currentSat: number,
  clearedPixels: number,
  satRate = 0.08
): number {
  const cur = Math.max(0.0, Math.min(1.0, currentSat));
  const gain = (Math.max(0, clearedPixels) / 1000.0) * satRate;
  return Math.min(1.0, cur + gain);
}

/**
 * Computes residual ghosting memory opacity after N eraser passes.
 */
export function computeGhostingOpacity(
  passCount: number,
  basePersistence = 0.05,
  decayRate = 0.40
): number {
  const passes = Math.max(1, Math.round(passCount));
  const base = Math.max(0.0, Math.min(0.30, basePersistence));
  const decay = Math.max(0.10, Math.min(0.90, decayRate));
  return base * Math.pow(1.0 - decay, passes - 1);
}

/**
 * Generates trailing wiper smear quads along the eraser wiping trajectory.
 */
export function generateWiperSmearBands(
  swipePath: SmearPoint2D[],
  eraserWidth = 30.0,
  saturation = 0.50,
  smearOpacity = 0.06,
  smearColorHex = '#374151'
): SmearBandMesh {
  if (swipePath.length < 2) {
    return { quads: [], totalLength: 0 };
  }

  const halfW = Math.max(2.0, eraserWidth * 0.5);
  const effOpacity = Math.max(0.0, Math.min(1.0, smearOpacity * saturation));
  const quads: SmearBandQuad[] = [];
  let totalLength = 0;

  for (let i = 0; i < swipePath.length - 1; i++) {
    const p0 = swipePath[i];
    const p1 = swipePath[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const mag = Math.hypot(dx, dy);
    totalLength += mag;

    if (mag <= 1e-4) continue;

    const nx = -dy / mag;
    const ny = dx / mag;

    quads.push({
      v0: { x: p0.x - nx * halfW, y: p0.y - ny * halfW },
      v1: { x: p0.x + nx * halfW, y: p0.y + ny * halfW },
      v2: { x: p1.x + nx * halfW, y: p1.y + ny * halfW },
      v3: { x: p1.x - nx * halfW, y: p1.y - ny * halfW },
      opacity: effOpacity,
      colorHex: smearColorHex,
    });
  }

  return { quads, totalLength };
}

/**
 * Serializes smear mesh and ghosting residuals into SVG overlay markup.
 */
export function generateEraserGhostingSvgMarkup(
  mesh: SmearBandMesh,
  ghostSvgSnippet = '',
  ghostOpacity = 0.05
): string {
  const smearPolys = mesh.quads
    .filter((q) => q.opacity > 1e-3)
    .map(
      (q) =>
        `<polygon points="${q.v0.x.toFixed(1)},${q.v0.y.toFixed(1)} ${q.v1.x.toFixed(1)},${q.v1.y.toFixed(1)} ${q.v2.x.toFixed(1)},${q.v2.y.toFixed(1)} ${q.v3.x.toFixed(1)},${q.v3.y.toFixed(1)}" fill="${q.colorHex}" opacity="${q.opacity.toFixed(3)}" />`
    )
    .join('');

  let ghostSnippet = '';
  if (ghostSvgSnippet && ghostOpacity > 1e-3) {
    ghostSnippet = `<g opacity="${ghostOpacity.toFixed(3)}" filter="url(#ghostBlur)">${ghostSvgSnippet}</g>`;
  }

  return smearPolys + ghostSnippet;
}
