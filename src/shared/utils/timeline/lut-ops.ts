/**
 * Pure arithmetic, .cube parsing, trilinear 3D color interpolation,
 * and cinematic film stock emulation engine for VideoStudio.
 *
 * Implements:
 * - Full Adobe / DaVinci `.cube` 3D LUT parser (supports 17x17x17, 33x33x33, 64x64x64 grids)
 * - Pure arithmetic trilinear interpolation for sampling arbitrary RGB triplets
 * - 6 Curated Hollywood & film stock emulation presets:
 *   - 'teal_orange': Blockbuster action aesthetic with warm skin tones and teal shadows
 *   - 'kodak_vision3': 35mm Hollywood film stock with organic highlight rolloff and rich blacks
 *   - 'fuji_eterna': Low-saturation indie cinema look with soft pastel highlights
 *   - 'bleach_bypass': Gritty high-contrast silver-halide retention look
 *   - 'noir_monochrome': Classic black & white film with calibrated tonal curve
 *   - 'vintage_polaroid': 1970s warm nostalgic instant film with lifted shadows
 * - Real-time CSS filter generator for 60fps canvas preview
 * - FFmpeg `lut3d` and color matrix filter generator for export renders
 */

export type LutPresetKey =
  | 'teal_orange'
  | 'kodak_vision3'
  | 'fuji_eterna'
  | 'bleach_bypass'
  | 'noir_monochrome'
  | 'vintage_polaroid';

export interface ClipLutSettings {
  enabled: boolean;
  preset?: LutPresetKey;
  customCubePath?: string;
  intensity: number; // 0.0 to 1.0 (default 1.0)
}

export interface LutPresetDefinition {
  key: LutPresetKey;
  name: string;
  category: 'cinematic' | 'film_stock' | 'vintage' | 'monochrome';
  description: string;
  generateCss: (intensity: number) => string;
}

export const LUT_PRESETS: readonly LutPresetDefinition[] = [
  {
    key: 'teal_orange',
    name: 'Teal & Orange',
    category: 'cinematic',
    description: 'Modern Hollywood blockbuster aesthetic separating warm golden skintones against deep cyan shadows',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const c = (1 + 0.18 * i).toFixed(3);
      const s = (1 + 0.22 * i).toFixed(3);
      const sep = (0.22 * i).toFixed(3);
      const hue = (-12 * i).toFixed(1);
      return `contrast(${c}) saturate(${s}) sepia(${sep}) hue-rotate(${hue}deg)`;
    },
  },
  {
    key: 'kodak_vision3',
    name: 'Kodak Vision3 500T',
    category: 'film_stock',
    description: 'Gold-standard 35mm Hollywood motion picture film stock with lush organic highlights and rich filmic contrast',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const c = (1 + 0.12 * i).toFixed(3);
      const s = (1 + 0.14 * i).toFixed(3);
      const sep = (0.12 * i).toFixed(3);
      const b = (1 + 0.03 * i).toFixed(3);
      return `contrast(${c}) saturate(${s}) sepia(${sep}) brightness(${b})`;
    },
  },
  {
    key: 'fuji_eterna',
    name: 'Fuji Eterna 250D',
    category: 'film_stock',
    description: 'Subdued pastel color palette with soft contrast and creamy shadow roll-off popular in festival indie cinema',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const c = (1 - 0.12 * i).toFixed(3);
      const s = (1 - 0.25 * i).toFixed(3);
      const b = (1 + 0.06 * i).toFixed(3);
      return `contrast(${c}) saturate(${s}) brightness(${b})`;
    },
  },
  {
    key: 'bleach_bypass',
    name: 'Bleach Bypass',
    category: 'cinematic',
    description: 'Gritty metallic aesthetic skipping the bleaching stage of color film development for extreme contrast and desaturation',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const c = (1 + 0.45 * i).toFixed(3);
      const s = (1 - 0.65 * i).toFixed(3);
      return `contrast(${c}) saturate(${s})`;
    },
  },
  {
    key: 'noir_monochrome',
    name: 'Noir Silver Halide',
    category: 'monochrome',
    description: 'Classic high-contrast silver monochrome with deep velvety blacks and luminous specular highlights',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const g = (1.0 * i).toFixed(3);
      const c = (1 + 0.35 * i).toFixed(3);
      const b = (1 - 0.04 * i).toFixed(3);
      return `grayscale(${g}) contrast(${c}) brightness(${b})`;
    },
  },
  {
    key: 'vintage_polaroid',
    name: 'Vintage 1970s Instant',
    category: 'vintage',
    description: 'Nostalgic analog snapshot with warm honey tint, faded blacks, and gentle vignetted highlights',
    generateCss: (intensity: number) => {
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.001) return '';
      const sep = (0.35 * i).toFixed(3);
      const c = (1 - 0.06 * i).toFixed(3);
      const b = (1 + 0.08 * i).toFixed(3);
      const s = (1 - 0.12 * i).toFixed(3);
      return `sepia(${sep}) contrast(${c}) brightness(${b}) saturate(${s})`;
    },
  },
];

export const DEFAULT_LUT_SETTINGS: ClipLutSettings = {
  enabled: false,
  preset: 'teal_orange',
  intensity: 1.0,
};

export interface Lut3DTable {
  title?: string;
  size: number;
  data: Float32Array; // Size * Size * Size * 3 (RGB tuples)
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

/**
 * Parses an Adobe / DaVinci Resolve `.cube` 3D LUT string.
 */
export function parseCubeLut(cubeText: string): Lut3DTable {
  const lines = cubeText.split(/\r?\n/);
  let size = 0;
  let title: string | undefined;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const numbers: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }

    if (line.startsWith('TITLE')) {
      const match = line.match(/TITLE\s+"?([^"]+)"?/i);
      if (match) title = match[1];
      continue;
    }

    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) {
        domainMin[0] = parts[0];
        domainMin[1] = parts[1];
        domainMin[2] = parts[2];
      }
      continue;
    }

    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) {
        domainMax[0] = parts[0];
        domainMax[1] = parts[1];
        domainMax[2] = parts[2];
      }
      continue;
    }

    // RGB floating point data line: "0.1234 0.5678 0.9012"
    const tokens = line.split(/\s+/);
    if (tokens.length >= 3) {
      const r = parseFloat(tokens[0]);
      const g = parseFloat(tokens[1]);
      const b = parseFloat(tokens[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        numbers.push(r, g, b);
      }
    }
  }

  if (size <= 0) {
    // If size not declared in header, deduce cubic root
    const entries = Math.floor(numbers.length / 3);
    size = Math.round(Math.cbrt(entries));
  }

  const expectedLength = size * size * size * 3;
  const data = new Float32Array(expectedLength);
  for (let i = 0; i < Math.min(numbers.length, expectedLength); i++) {
    data[i] = numbers[i];
  }

  return {
    title,
    size,
    data,
    domainMin,
    domainMax,
  };
}

/**
 * Trilinear interpolation of an input RGB triplet [0, 1] through a 3D LUT table.
 */
export function sampleLut3D(
  table: Lut3DTable,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const { size, data, domainMin, domainMax } = table;
  if (size < 2 || data.length < size * size * size * 3) {
    return [r, g, b];
  }

  // Normalize input coordinates against domain bounds
  const normR = Math.max(0, Math.min(1, (r - domainMin[0]) / (domainMax[0] - domainMin[0] || 1)));
  const normG = Math.max(0, Math.min(1, (g - domainMin[1]) / (domainMax[1] - domainMin[1] || 1)));
  const normB = Math.max(0, Math.min(1, (b - domainMin[2]) / (domainMax[2] - domainMin[2] || 1)));

  // Scaled coordinates
  const scale = size - 1;
  const x = normR * scale;
  const y = normG * scale;
  const z = normB * scale;

  const x0 = Math.floor(x);
  const x1 = Math.min(size - 1, x0 + 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(size - 1, y0 + 1);
  const z0 = Math.floor(z);
  const z1 = Math.min(size - 1, z0 + 1);

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  // Cube data index function: standard ordering R runs fastest, then G, then B
  const index = (ix: number, iy: number, iz: number) => (iz * size * size + iy * size + ix) * 3;

  const out: [number, number, number] = [0, 0, 0];

  for (let c = 0; c < 3; c++) {
    const c000 = data[index(x0, y0, z0) + c];
    const c100 = data[index(x1, y0, z0) + c];
    const c010 = data[index(x0, y1, z0) + c];
    const c110 = data[index(x1, y1, z0) + c];
    const c001 = data[index(x0, y0, z1) + c];
    const c101 = data[index(x1, y0, z1) + c];
    const c011 = data[index(x0, y1, z1) + c];
    const c111 = data[index(x1, y1, z1) + c];

    // Trilinear interpolation:
    // Interpolate along x
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    // Interpolate along y
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    // Interpolate along z
    out[c] = c0 * (1 - fz) + c1 * fz;
  }

  return out;
}

/**
 * Builds CSS filter string for real-time video canvas preview.
 */
export function buildCssLutFilter(settings: ClipLutSettings | undefined): string {
  if (!settings || !settings.enabled || settings.intensity <= 0.001) {
    return '';
  }

  if (settings.preset) {
    const presetDef = LUT_PRESETS.find((p) => p.key === settings.preset);
    if (presetDef) {
      return presetDef.generateCss(settings.intensity);
    }
  }

  // Fallback for custom LUT: subtle film contrast
  const i = Math.max(0, Math.min(1, settings.intensity));
  return `contrast(${(1 + 0.15 * i).toFixed(3)}) saturate(${(1 + 0.1 * i).toFixed(3)})`;
}

/**
 * Builds FFmpeg filter command for master export rendering.
 */
export function buildFfmpegLutFilter(settings: ClipLutSettings | undefined): string {
  if (!settings || !settings.enabled || settings.intensity <= 0.001) {
    return '';
  }

  if (settings.customCubePath) {
    return `lut3d=file='${settings.customCubePath}'`;
  }

  // Built-in presets map to color balance / curve adjustments in FFmpeg
  const i = Math.max(0, Math.min(1, settings.intensity));
  switch (settings.preset) {
    case 'teal_orange': {
      const rs = (0.08 * i).toFixed(3);
      const bs = (-0.08 * i).toFixed(3);
      return `colorbalance=rs=${rs}:bs=${bs}:rm=${rs}:bm=${bs}`;
    }
    case 'kodak_vision3': {
      const rh = (0.05 * i).toFixed(3);
      const gs = (0.03 * i).toFixed(3);
      return `colorbalance=rh=${rh}:gs=${gs},eq=contrast=${(1 + 0.1 * i).toFixed(2)}`;
    }
    case 'fuji_eterna': {
      return `eq=saturation=${(1 - 0.25 * i).toFixed(2)}:contrast=${(1 - 0.1 * i).toFixed(2)}`;
    }
    case 'bleach_bypass': {
      return `eq=contrast=${(1 + 0.4 * i).toFixed(2)}:saturation=${(1 - 0.65 * i).toFixed(2)}`;
    }
    case 'noir_monochrome': {
      return `hue=s=0,eq=contrast=${(1 + 0.3 * i).toFixed(2)}`;
    }
    case 'vintage_polaroid': {
      const rs = (0.1 * i).toFixed(3);
      const bs = (-0.12 * i).toFixed(3);
      return `colorbalance=rs=${rs}:bs=${bs},eq=contrast=${(1 - 0.05 * i).toFixed(2)}`;
    }
    default:
      return '';
  }
}
