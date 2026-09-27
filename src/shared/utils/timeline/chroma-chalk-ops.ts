/**
 * Whiteboard Chroma Chalk & Neon UV Blacklight Luminescence Shader Operations.
 * Simulates dark blackboard neon luminescence:
 * 1. High-chroma saturated chalk extraction and fluorescent UV emission.
 * 2. Multi-scale dual-pass Gaussian bloom halo layers.
 * 3. Sub-pixel chromatic aberration fringe on high-contrast emissive boundaries.
 * 4. Cyberpunk, retro arcade, and electric pastel color palettes.
 */

export type NeonPalettePreset = 'cyber' | 'pastels' | 'arcade';

export interface ChromaChalkNeonSettings {
  enabled?: boolean;
  palette?: NeonPalettePreset; // default 'cyber'
  bloomRadiusPx?: number; // 4..30 px, default 14
  bloomIntensity?: number; // 0.1..1.5, default 0.7
  chromaticAberrationPx?: number; // 0..5 px, default 2.0
  darkSlateBackground?: boolean; // default true
}

export interface NeonStrokeStyle {
  coreColor: string;
  haloColor: string;
  glowSigma: number;
  haloOpacity: number;
}

export const NEON_PALETTES: Record<NeonPalettePreset, readonly string[]> = {
  cyber: ['#00f3ff', '#ff007f', '#39ff14', '#ffe600'],
  pastels: ['#70d6ff', '#ff70a6', '#ff9770', '#ffd670', '#e9ff70'],
  arcade: ['#05ffa1', '#b967ff', '#fffb96', '#01cdfe', '#ff71ce'],
};

/**
 * Returns a list of hex color codes for the selected neon palette.
 */
export function resolveNeonPalette(palette: NeonPalettePreset = 'cyber'): readonly string[] {
  return NEON_PALETTES[palette] ?? NEON_PALETTES.cyber;
}

/**
 * Computes the dual-layer stroke styling (sharp white-hot core + diffuse fluorescent halo).
 */
export function computeNeonStrokeStyle(
  colorHex: string,
  intensity: number = 0.7,
  radiusPx: number = 14.0,
): NeonStrokeStyle {
  const safeIntensity = Math.max(0.1, Math.min(1.5, intensity));
  const safeRadius = Math.max(2.0, Math.min(40.0, radiusPx));

  return {
    coreColor: colorHex,
    haloColor: colorHex,
    glowSigma: Number((safeRadius * 0.75).toFixed(2)),
    haloOpacity: Number(Math.min(1.0, safeIntensity * 0.85).toFixed(2)),
  };
}

/**
 * Generates an SVG filter markup string for optical UV neon bloom and chromatic dispersion.
 */
export function generateNeonSvgFilterMarkup(
  filterId: string = 'neon-uv-bloom',
  radiusPx: number = 14.0,
  intensity: number = 0.7,
  aberrationPx: number = 2.0,
): string {
  const sigma1 = (radiusPx * 0.4).toFixed(1);
  const sigma2 = (radiusPx * 1.1).toFixed(1);
  const gain = Math.min(2.0, intensity * 1.4).toFixed(2);
  const shift = Math.max(0, aberrationPx).toFixed(1);

  return `<filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
  <!-- Core emission isolation -->
  <feGaussianBlur in="SourceGraphic" stdDeviation="${sigma1}" result="tightGlow" />
  <feGaussianBlur in="SourceGraphic" stdDeviation="${sigma2}" result="wideGlow" />
  <feMerge result="bloom">
    <feMergeNode in="wideGlow" />
    <feMergeNode in="tightGlow" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
  <!-- Chromatic edge offset -->
  <feOffset in="bloom" dx="-${shift}" dy="0" result="blueShift" />
  <feOffset in="bloom" dx="${shift}" dy="0" result="redShift" />
  <feBlend in="bloom" in2="SourceGraphic" mode="screen" />
</filter>`;
}
