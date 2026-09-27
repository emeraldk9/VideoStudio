import { describe, expect, it } from 'vitest';
import {
  blendSubtractiveColor,
  computeHighlighterRibbon,
  generateHighlighterSvg,
  getHighlighterColor,
} from '../fluorescent-highlighter-ops';

describe('fluorescent-highlighter-ops', () => {
  it('resolves preset and custom hex colors correctly', () => {
    expect(getHighlighterColor('yellow')).toBe('#FFFA36');
    expect(getHighlighterColor('pink')).toBe('#FF479C');
    expect(getHighlighterColor('yellow', '#abcdef')).toBe('#abcdef');
    expect(getHighlighterColor('cyan', 'invalid')).toBe('#3DE3FF');
  });

  it('computes anisotropic chisel nib ribbon polygon with matching width', () => {
    const points = [
      { x: 100, y: 200 },
      { x: 150, y: 200 },
      { x: 200, y: 200 },
    ];
    const ribbon = computeHighlighterRibbon(points, 30, 0); // 0 deg -> vertical offset (+/- 15px X)
    expect(ribbon).toHaveLength(6);
    // At 0 deg: hw = 15 along X, dy = 0 along Y
    expect(ribbon[0]).toEqual({ x: 85, y: 200 });
    expect(ribbon[5]).toEqual({ x: 115, y: 200 });
  });

  it('preserves black linework under subtractive multiply blending', () => {
    const blackInk: [number, number, number] = [0, 0, 0];
    const yellowDye: [number, number, number] = [255, 250, 54];
    const blendedBlack = blendSubtractiveColor(blackInk, yellowDye, 0.5);
    // Black text must stay completely black (0, 0, 0)
    expect(blendedBlack).toEqual([0, 0, 0]);

    // White substrate gets tinted towards yellow dye
    const whiteBoard: [number, number, number] = [255, 255, 255];
    const blendedWhite = blendSubtractiveColor(whiteBoard, yellowDye, 0.5);
    expect(blendedWhite[0]).toBe(255); // Red stays max
    expect(blendedWhite[1]).toBeGreaterThanOrEqual(250); // Green stays high
    expect(blendedWhite[2]).toBeLessThan(255); // Blue absorbed (yellow tint)
  });

  it('generates valid SVG polygon markup with mix-blend-mode multiply', () => {
    const points = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
    ];
    const svg = generateHighlighterSvg(points, {
      colorPreset: 'green',
      opacity: 0.6,
      compositeMode: 'subtractive_multiply',
    });
    expect(svg).toContain('<polygon points="');
    expect(svg).toContain('fill="#59FF59"');
    expect(svg).toContain('opacity="0.6"');
    expect(svg).toContain('mix-blend-mode: multiply;');
  });
});
