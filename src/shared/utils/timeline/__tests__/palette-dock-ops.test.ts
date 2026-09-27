import { describe, expect, it } from 'vitest';
import {
  resolvePaletteColor,
  computeCarouselRotation,
  computeSlotElevations,
  generatePaletteDockSvg,
  PALETTE_PRESETS_HEX,
  DEFAULT_PALETTE_DOCK_SETTINGS,
} from '../palette-dock-ops';

describe('palette-dock-ops', () => {
  it('resolves preset colors accurately', () => {
    // Standard preset
    expect(resolvePaletteColor('standard', 0)).toBe('#191919'); // Black
    expect(resolvePaletteColor('standard', 1)).toBe('#d72323'); // Red
    expect(resolvePaletteColor('standard', 2)).toBe('#1e55d7'); // Blue
    expect(resolvePaletteColor('standard', 3)).toBe('#2da52d'); // Green

    // Neon preset
    expect(resolvePaletteColor('neon', 1)).toBe('#f523e1'); // Neon Magenta
    expect(resolvePaletteColor('neon', 2)).toBe('#19e1f5'); // Neon Cyan

    // Clamps out of bound indices
    expect(resolvePaletteColor('standard', 99)).toBe('#2da52d');
  });

  it('computes carousel angular rotations for 4 slots', () => {
    expect(computeCarouselRotation(0, 4)).toBe(0);
    expect(computeCarouselRotation(1, 4)).toBe(-90);
    expect(computeCarouselRotation(2, 4)).toBe(-180);
    expect(computeCarouselRotation(3, 4)).toBe(-270);
  });

  it('computes elevation displacement per dock style', () => {
    // Caddy: selected pen is lifted upward
    const elevCaddy = computeSlotElevations(1, 'caddy', 1.0, 4);
    expect(elevCaddy[1]).toBe(18);
    expect(elevCaddy[0]).toBe(0);

    // Multi-pen click: selected plunger is depressed downward
    const elevClick = computeSlotElevations(2, 'multipen_click', 1.0, 4);
    expect(elevClick[2]).toBe(-12);
    expect(elevClick[0]).toBe(0);

    // Ring dock: selected pen slightly elevated
    const elevRing = computeSlotElevations(3, 'ring_dock', 1.0, 4);
    expect(elevRing[3]).toBe(10);
    expect(elevRing[0]).toBe(0);
  });

  it('generates declarative SVG preview markup', () => {
    const svg = generatePaletteDockSvg(1, 'standard', 'caddy', 1.0);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 160 120"');
    expect(svg.match(/<rect/g)?.length).toBe(5); // base + 4 slots
  });
});
