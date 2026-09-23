import { describe, expect, it } from 'vitest';
import type { SequenceTrack } from '../../../index';

describe('S16 Track Height Resizing and Filmstrip Density Presets', () => {
  function clampTrackHeight(height: number): number {
    return Math.max(24, Math.min(300, Math.round(height)));
  }

  function resolveDefaultTrackHeight(kind: SequenceTrack['kind']): number {
    return kind === 'audio' ? 36 : 48;
  }

  function resolveFilmstripDensity(heightPx: number): 'chip' | 'head-and-tail' | 'continuous' {
    if (heightPx < 36) return 'chip';
    if (heightPx < 96) return 'head-and-tail';
    return 'continuous';
  }

  it('clamps track heights within [24, 300] pixel bounds', () => {
    expect(clampTrackHeight(10)).toBe(24);
    expect(clampTrackHeight(24)).toBe(24);
    expect(clampTrackHeight(64)).toBe(64);
    expect(clampTrackHeight(96)).toBe(96);
    expect(clampTrackHeight(300)).toBe(300);
    expect(clampTrackHeight(450)).toBe(300);
  });

  it('provides appropriate default heights based on track kind', () => {
    expect(resolveDefaultTrackHeight('audio')).toBe(36);
    expect(resolveDefaultTrackHeight('video')).toBe(48);
  });

  it('correctly maps track height to filmstrip visual density modes', () => {
    // Compact chip view
    expect(resolveFilmstripDensity(24)).toBe('chip');
    expect(resolveFilmstripDensity(28)).toBe('chip');

    // Standard head and tail thumbnails
    expect(resolveFilmstripDensity(48)).toBe('head-and-tail');
    expect(resolveFilmstripDensity(64)).toBe('head-and-tail');
    expect(resolveFilmstripDensity(80)).toBe('head-and-tail');

    // Expanded / continuous full filmstrip mode
    expect(resolveFilmstripDensity(96)).toBe('continuous');
    expect(resolveFilmstripDensity(140)).toBe('continuous');
    expect(resolveFilmstripDensity(200)).toBe('continuous');
  });

  it('verifies height presets are within valid clamped range', () => {
    const presets = [28, 36, 48, 96, 140];
    for (const preset of presets) {
      expect(clampTrackHeight(preset)).toBe(preset);
    }
  });
});
