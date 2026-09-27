/**
 * Whiteboard Optical Glass Lightboard & Internal Edge-Lit Luminescence Operations.
 * Simulates illuminated glass board (Learning Glass) presentation physics:
 * 1. Total internal reflection (TIR) fluorescent ink scattering.
 * 2. Glass double-surface specular ghost reflection from pane thickness.
 * 3. Perimeter LED frame strip edge-lit illumination glow.
 * 4. Horizontal camera mirroring inversion for audience readability.
 */

export type LightboardLedPreset = 'cyan' | 'emerald' | 'amber' | 'white';

export interface LightboardGlassSettings {
  enabled?: boolean;
  mirrorHorizontal?: boolean; // default true
  ledPreset?: LightboardLedPreset; // default 'cyan'
  customLedColorHex?: string;
  ledIntensity?: number; // 0.5..2.5, default 1.20
  glassThicknessPx?: number; // 2..14 px, default 6.0
  ghostReflectionOpacity?: number; // 0.0..0.20, default 0.08
}

export const LIGHTBOARD_LED_COLORS: Record<LightboardLedPreset, string> = {
  cyan: '#00e6ff',
  emerald: '#00ff88',
  amber: '#ffaa00',
  white: '#ffffff',
};

/**
 * Resolves the active LED frame illumination hex color code.
 */
export function resolveLightboardLedColor(
  preset: LightboardLedPreset = 'cyan',
  customHex?: string,
): string {
  if (customHex && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(customHex)) {
    return customHex;
  }
  return LIGHTBOARD_LED_COLORS[preset] ?? LIGHTBOARD_LED_COLORS.cyan;
}

/**
 * Computes the 2D offset vector for secondary internal glass surface ghost reflection.
 */
export function computeLightboardGhostOffset(
  thicknessPx: number = 6.0,
  angleDeg: number = 45.0,
): { dx: number; dy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    dx: Math.round(thicknessPx * Math.cos(rad) * 100) / 100,
    dy: Math.round(thicknessPx * Math.sin(rad) * 100) / 100,
  };
}

/**
 * Generates an SVG filter markup that produces a secondary diffused ghost reflection
 * behind bright strokes to simulate internal glass refraction.
 */
export function generateLightboardSvgFilterMarkup(
  filterId: string = 'lightboard-ghost-reflection',
  thicknessPx: number = 6.0,
  ghostOpacity: number = 0.08,
  angleDeg: number = 45.0,
): string {
  const { dx, dy } = computeLightboardGhostOffset(thicknessPx, angleDeg);
  const opacityClamped = Math.min(0.3, Math.max(0.0, ghostOpacity)).toFixed(3);

  return [
    `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">`,
    `  <!-- Primary linework pass -->`,
    `  <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="sharp" />`,
    `  <!-- Secondary internal glass ghost reflection -->`,
    `  <feOffset in="SourceGraphic" dx="${dx}" dy="${dy}" result="offsetGhost" />`,
    `  <feGaussianBlur in="offsetGhost" stdDeviation="1.2" result="softGhost" />`,
    `  <feColorMatrix in="softGhost" type="matrix"`,
    `    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${opacityClamped} 0" result="fadedGhost" />`,
    `  <!-- Composite primary over secondary reflection -->`,
    `  <feMerge>`,
    `    <feMergeNode in="fadedGhost" />`,
    `    <feMergeNode in="sharp" />`,
    `  </feMerge>`,
    `</filter>`,
  ].join('\n');
}
