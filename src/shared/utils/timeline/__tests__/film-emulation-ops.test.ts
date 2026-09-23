import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILM_EMULATION_SETTINGS,
  FILM_EMULATION_PRESETS,
  calculateGateWeaveOffset,
  buildCssFilmEmulationStyle,
  buildFfmpegFilmEmulationFilter,
  type FilmEmulationSettings,
} from '../film-emulation-ops';

describe('Film Emulation Engine (film-emulation-ops)', () => {
  it('provides sensible default settings with emulation disabled', () => {
    expect(DEFAULT_FILM_EMULATION_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_FILM_EMULATION_SETTINGS.grain.enabled).toBe(true);
    expect(DEFAULT_FILM_EMULATION_SETTINGS.grain.intensity).toBeGreaterThan(0);
    expect(DEFAULT_FILM_EMULATION_SETTINGS.halation.enabled).toBe(true);
    expect(DEFAULT_FILM_EMULATION_SETTINGS.gateWeave.enabled).toBe(true);
  });

  it('contains valid studio presets with expected stock characteristics', () => {
    const presetKeys = Object.keys(FILM_EMULATION_PRESETS) as (keyof typeof FILM_EMULATION_PRESETS)[];
    expect(presetKeys).toContain('kodak_vision3_500t');
    expect(presetKeys).toContain('kodak_tri_x_400');
    expect(presetKeys).toContain('fuji_eterna_250d');
    expect(presetKeys).toContain('vintage_16mm');
    expect(presetKeys).toContain('super_8mm');

    // Kodak Tri-X 400 B&W should have halation disabled
    const triX = FILM_EMULATION_PRESETS.kodak_tri_x_400.settings;
    expect(triX.enabled).toBe(true);
    expect(triX.halation.enabled).toBe(false);
    expect(triX.grain.intensity).toBeGreaterThan(0.4);

    // Super 8mm should have aggressive gate weave and coarse grain
    const super8 = FILM_EMULATION_PRESETS.super_8mm.settings;
    expect(super8.grain.size).toBeGreaterThan(2.0);
    expect(super8.gateWeave.amplitudeX).toBeGreaterThanOrEqual(3.0);
  });

  describe('calculateGateWeaveOffset', () => {
    it('returns zero displacement when gate weave is disabled', () => {
      const offset = calculateGateWeaveOffset(100, 30, {
        enabled: false,
        amplitudeX: 2.0,
        amplitudeY: 1.5,
        speedHz: 2.0,
        jitterPct: 0.25,
      });
      expect(offset).toEqual({ dx: 0, dy: 0 });
    });

    it('returns zero displacement when amplitudes are 0', () => {
      const offset = calculateGateWeaveOffset(100, 30, {
        enabled: true,
        amplitudeX: 0,
        amplitudeY: 0,
        speedHz: 2.0,
        jitterPct: 0.25,
      });
      expect(offset).toEqual({ dx: 0, dy: 0 });
    });

    it('produces deterministic output for the same frame', () => {
      const settings = FILM_EMULATION_PRESETS.vintage_16mm.settings.gateWeave;
      const offset1 = calculateGateWeaveOffset(45, 24, settings);
      const offset2 = calculateGateWeaveOffset(45, 24, settings);
      expect(offset1).toEqual(offset2);
    });

    it('produces dynamic displacement over successive frames within amplitude boundaries', () => {
      const settings = FILM_EMULATION_PRESETS.kodak_vision3_500t.settings.gateWeave;
      const o0 = calculateGateWeaveOffset(0, 30, settings);
      const o15 = calculateGateWeaveOffset(15, 30, settings);
      const o30 = calculateGateWeaveOffset(30, 30, settings);

      expect(o0).not.toEqual(o15);
      expect(Math.abs(o15.dx)).toBeLessThanOrEqual(settings.amplitudeX * 2.0);
      expect(Math.abs(o15.dy)).toBeLessThanOrEqual(settings.amplitudeY * 2.0);
      expect(Math.abs(o30.dx)).toBeLessThanOrEqual(settings.amplitudeX * 2.0);
    });
  });

  describe('buildCssFilmEmulationStyle', () => {
    it('returns an empty object when disabled or settings are undefined', () => {
      expect(buildCssFilmEmulationStyle(undefined)).toEqual({});
      expect(buildCssFilmEmulationStyle({ ...DEFAULT_FILM_EMULATION_SETTINGS, enabled: false })).toEqual({});
    });

    it('generates drop-shadow halation and grain filters when enabled', () => {
      const settings: FilmEmulationSettings = {
        enabled: true,
        grain: { enabled: true, intensity: 0.3, size: 1.0, chromatic: false, roughness: 0.4 },
        halation: { enabled: true, threshold: 0.7, radiusPx: 12, intensity: 0.5, hueShiftDeg: 0 },
        gateWeave: { enabled: false, amplitudeX: 0, amplitudeY: 0, speedHz: 1, jitterPct: 0 },
      };

      const style = buildCssFilmEmulationStyle(settings, 0, 30);
      expect(style.filter).toBeDefined();
      expect(style.filter).toContain('drop-shadow');
      expect(style.filter).toContain('rgba(255, 35, 20');
      expect(style.filter).toContain('contrast');
      expect(style.filter).toContain('brightness');
      expect(style.transform).toBeUndefined();
    });

    it('generates transform translate3d when gate weave is active', () => {
      const settings: FilmEmulationSettings = {
        enabled: true,
        grain: { enabled: false, intensity: 0, size: 1, chromatic: false, roughness: 0 },
        halation: { enabled: false, threshold: 0.7, radiusPx: 0, intensity: 0, hueShiftDeg: 0 },
        gateWeave: { enabled: true, amplitudeX: 3.0, amplitudeY: 2.0, speedHz: 2.5, jitterPct: 0.3 },
      };

      const style = buildCssFilmEmulationStyle(settings, 12, 30);
      expect(style.transform).toBeDefined();
      expect(style.transform).toMatch(/^translate3d\(.+px,.+px, 0\)$/);
    });
  });

  describe('buildFfmpegFilmEmulationFilter', () => {
    it('returns empty string when disabled or settings are undefined', () => {
      expect(buildFfmpegFilmEmulationFilter(undefined)).toBe('');
      expect(buildFfmpegFilmEmulationFilter({ ...DEFAULT_FILM_EMULATION_SETTINGS, enabled: false })).toBe('');
    });

    it('generates monochromatic noise filter when chromatic is false', () => {
      const settings: FilmEmulationSettings = {
        enabled: true,
        grain: { enabled: true, intensity: 0.4, size: 1.0, chromatic: false, roughness: 0.5 },
        halation: { enabled: false, threshold: 0.7, radiusPx: 0, intensity: 0, hueShiftDeg: 0 },
        gateWeave: { enabled: false, amplitudeX: 0, amplitudeY: 0, speedHz: 0, jitterPct: 0 },
      };

      const filter = buildFfmpegFilmEmulationFilter(settings);
      expect(filter).toBe('noise=alls=14:allf=t');
    });

    it('generates chromatic noise and colorbalance halation filters', () => {
      const settings: FilmEmulationSettings = {
        enabled: true,
        grain: { enabled: true, intensity: 0.5, size: 1.5, chromatic: true, roughness: 0.5 },
        halation: { enabled: true, threshold: 0.65, radiusPx: 10, intensity: 0.6, hueShiftDeg: 0 },
        gateWeave: { enabled: false, amplitudeX: 0, amplitudeY: 0, speedHz: 0, jitterPct: 0 },
      };

      const filter = buildFfmpegFilmEmulationFilter(settings);
      expect(filter).toContain('noise=alls=18:allf=t+u');
      expect(filter).toContain('colorbalance=rh=0.048:gh=-0.02:bh=-0.04');
    });
  });
});
