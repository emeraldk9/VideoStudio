import { describe, expect, it } from 'vitest';
import {
  resolveLightboardLedColor,
  computeLightboardGhostOffset,
  generateLightboardSvgFilterMarkup,
  LIGHTBOARD_LED_COLORS,
} from '../lightboard-glass-ops';

describe('lightboard-glass-ops', () => {
  it('resolves preset and custom LED illumination colors', () => {
    expect(resolveLightboardLedColor('cyan')).toBe(LIGHTBOARD_LED_COLORS.cyan);
    expect(resolveLightboardLedColor('emerald')).toBe(LIGHTBOARD_LED_COLORS.emerald);
    expect(resolveLightboardLedColor('amber')).toBe(LIGHTBOARD_LED_COLORS.amber);
    expect(resolveLightboardLedColor('white')).toBe(LIGHTBOARD_LED_COLORS.white);

    // Custom hex overrides preset
    expect(resolveLightboardLedColor('cyan', '#ff00aa')).toBe('#ff00aa');
    // Invalid custom hex falls back to preset
    expect(resolveLightboardLedColor('cyan', 'invalid-color')).toBe(LIGHTBOARD_LED_COLORS.cyan);
  });

  it('computes 2D ghost reflection offset from thickness and angle', () => {
    // 0 degrees -> purely horizontal
    const hOffset = computeLightboardGhostOffset(10.0, 0.0);
    expect(hOffset.dx).toBe(10.0);
    expect(hOffset.dy).toBe(0.0);

    // 45 degrees -> symmetric diagonal
    const diagOffset = computeLightboardGhostOffset(10.0, 45.0);
    expect(diagOffset.dx).toBeCloseTo(7.07, 1);
    expect(diagOffset.dy).toBeCloseTo(7.07, 1);
  });

  it('generates valid SVG filter markup for internal glass ghost reflection', () => {
    const markup = generateLightboardSvgFilterMarkup('test-lightboard-filter', 8.0, 0.12, 45.0);
    expect(markup).toContain('<filter id="test-lightboard-filter"');
    expect(markup).toContain('feOffset');
    expect(markup).toContain('dx="5.66" dy="5.66"');
    expect(markup).toContain('feColorMatrix');
    expect(markup).toContain('0.120');
    expect(markup).toContain('feMergeNode in="fadedGhost"');
    expect(markup).toContain('feMergeNode in="sharp"');
  });
});
