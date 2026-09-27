import { describe, expect, it } from 'vitest';
import {
  resolveNeonPalette,
  computeNeonStrokeStyle,
  generateNeonSvgFilterMarkup,
} from '../chroma-chalk-ops';

describe('chroma-chalk-ops', () => {
  it('resolves curated neon color palettes', () => {
    const cyber = resolveNeonPalette('cyber');
    expect(cyber).toContain('#00f3ff');
    expect(cyber).toContain('#ff007f');

    const pastels = resolveNeonPalette('pastels');
    expect(pastels.length).toBeGreaterThanOrEqual(4);

    const arcade = resolveNeonPalette('arcade');
    expect(arcade).toContain('#05ffa1');
  });

  it('computes neon dual-layer stroke styling and glow sigma', () => {
    const style = computeNeonStrokeStyle('#39ff14', 0.8, 16.0);
    expect(style.coreColor).toBe('#39ff14');
    expect(style.glowSigma).toBeCloseTo(12.0, 1);
    expect(style.haloOpacity).toBeGreaterThan(0.5);
  });

  it('generates valid SVG filter markup for multi-scale UV bloom', () => {
    const markup = generateNeonSvgFilterMarkup('test-neon', 15.0, 0.75, 2.0);
    expect(markup).toContain('<filter id="test-neon"');
    expect(markup).toContain('feGaussianBlur');
    expect(markup).toContain('wideGlow');
    expect(markup).toContain('blueShift');
    expect(markup).toContain('redShift');
  });
});
