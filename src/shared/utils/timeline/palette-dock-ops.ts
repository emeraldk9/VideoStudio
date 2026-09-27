/**
 * Whiteboard Multi-Color Palette Carousel, Ring Dock & Click-Pen Dynamics.
 * Simulates physical multi-color desk caddies, rotating carousel ring docks,
 * and 4-in-1 multi-color mechanical click-pen mechanisms:
 * 1. Palette Presets: Standard quad (Black/Red/Blue/Green), Neon Fluorescent, and Earth Tones.
 * 2. Dock Carousel State: Computes rotational orientation and individual pen deployment elevations.
 * 3. Mechanical Click Acoustics: Foley audio triggering on color switch transitions.
 */

export type PaletteDockStyle = 'caddy' | 'ring_dock' | 'multipen_click';
export type PaletteColorPreset = 'standard' | 'neon' | 'earth';

export interface PaletteDockSettings {
  enabled?: boolean;
  dockStyle?: PaletteDockStyle; // default 'caddy'
  activeColorIdx?: number; // 0..3, default 0
  palettePreset?: PaletteColorPreset; // default 'standard'
  rotationDurationSec?: number; // 0.1..1.0, default 0.20
  clickFoleyVolume?: number; // 0.0..1.0, default 0.70
}

export const PALETTE_PRESETS_HEX: Record<PaletteColorPreset, string[]> = {
  standard: [
    '#191919', // Black
    '#d72323', // Red
    '#1e55d7', // Blue
    '#2da52d', // Green
  ],
  neon: [
    '#f5f5f5', // White
    '#f523e1', // Neon Magenta
    '#19e1f5', // Neon Cyan
    '#41f523', // Neon Lime
  ],
  earth: [
    '#2d2d2d', // Charcoal
    '#b95f23', // Terracotta
    '#238791', // Slate Teal
    '#9b412d', // Umber Rust
  ],
};

export const DEFAULT_PALETTE_DOCK_SETTINGS: Required<PaletteDockSettings> = {
  enabled: true,
  dockStyle: 'caddy',
  activeColorIdx: 0,
  palettePreset: 'standard',
  rotationDurationSec: 0.2,
  clickFoleyVolume: 0.7,
};

/**
 * Resolves hex color string for slot index and palette preset.
 */
export function resolvePaletteColor(
  preset: PaletteColorPreset = 'standard',
  colorIdx = 0
): string {
  const colors = PALETTE_PRESETS_HEX[preset] ?? PALETTE_PRESETS_HEX.standard;
  const idx = Math.max(0, Math.min(colors.length - 1, colorIdx));
  return colors[idx];
}

/**
 * Computes angular carousel rotation degrees to bring active slot to front.
 */
export function computeCarouselRotation(
  activeIdx: number,
  totalSlots = 4
): number {
  const slotAngle = 360.0 / Math.max(1, totalSlots);
  const rot = -(activeIdx * slotAngle);
  return rot === 0 ? 0 : rot;
}

/**
 * Computes individual pen / plunger vertical displacement in pixels.
 */
export function computeSlotElevations(
  activeIdx: number,
  dockStyle: PaletteDockStyle = 'caddy',
  progress = 1.0,
  totalSlots = 4
): number[] {
  const p = Math.max(0.0, Math.min(1.0, progress));
  const easeP = 1.0 - Math.pow(1.0 - p, 3);
  const elevations: number[] = new Array(totalSlots).fill(0.0);

  if (dockStyle === 'caddy') {
    for (let i = 0; i < totalSlots; i++) {
      elevations[i] = i === activeIdx ? Math.round(18.0 * easeP) : 0.0;
    }
  } else if (dockStyle === 'multipen_click') {
    for (let i = 0; i < totalSlots; i++) {
      elevations[i] = i === activeIdx ? Math.round(-12.0 * easeP) : 0.0;
    }
  } else {
    // 'ring_dock'
    for (let i = 0; i < totalSlots; i++) {
      elevations[i] = i === activeIdx ? Math.round(10.0 * easeP) : 0.0;
    }
  }

  return elevations;
}

/**
 * Generates an SVG preview markup representing the physical palette dock / caddy.
 */
export function generatePaletteDockSvg(
  activeIdx = 0,
  preset: PaletteColorPreset = 'standard',
  dockStyle: PaletteDockStyle = 'caddy',
  progress = 1.0
): string {
  const colors = PALETTE_PRESETS_HEX[preset] ?? PALETTE_PRESETS_HEX.standard;
  const totalSlots = colors.length;
  const elevations = computeSlotElevations(activeIdx, dockStyle, progress, totalSlots);

  const slotSvgs: string[] = [];
  const slotWidth = 24;
  const slotSpacing = 32;
  const baseY = 80;

  for (let i = 0; i < totalSlots; i++) {
    const x = 20 + i * slotSpacing;
    const y = baseY - elevations[i];
    const color = colors[i];
    const isSelected = i === activeIdx;
    const strokeWidth = isSelected ? 2 : 1;
    const strokeColor = isSelected ? '#ffffff' : '#666666';

    slotSvgs.push(
      `<rect x="${x}" y="${y}" width="${slotWidth}" height="40" rx="4" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">\n<rect x="10" y="70" width="140" height="40" rx="6" fill="#222222" stroke="#444444" stroke-width="1.5" />\n${slotSvgs.join('\n')}\n</svg>`;
}
