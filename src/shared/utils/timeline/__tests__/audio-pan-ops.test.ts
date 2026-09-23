import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUDIO_PAN_SETTINGS,
  PAN_PRESETS,
  calculateEqualPowerPanGains,
  calculateSpatialCoordinates,
  buildFfmpegPanFilter,
  type AudioPanSettings,
} from '../audio-pan-ops';

describe('Audio Stereo Panner & 3D Spatializer (audio-pan-ops)', () => {
  it('provides default settings with panning centered and disabled', () => {
    expect(DEFAULT_AUDIO_PAN_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AUDIO_PAN_SETTINGS.pan).toBe(0.0);
    expect(DEFAULT_AUDIO_PAN_SETTINGS.law).toBe('equal_power_3db');
    expect(DEFAULT_AUDIO_PAN_SETTINGS.spatial3d.enabled).toBe(false);
  });

  it('contains valid spatial presets with distinct positions', () => {
    const presetKeys = Object.keys(PAN_PRESETS) as (keyof typeof PAN_PRESETS)[];
    expect(presetKeys).toContain('center');
    expect(presetKeys).toContain('hard_left');
    expect(presetKeys).toContain('hard_right');
    expect(presetKeys).toContain('wide_stereo');
    expect(presetKeys).toContain('cinema_front');
    expect(presetKeys).toContain('overhead_ambient');
    expect(presetKeys).toContain('behind_listener');

    expect(PAN_PRESETS.hard_left.settings.pan).toBe(-1.0);
    expect(PAN_PRESETS.hard_right.settings.pan).toBe(1.0);
    expect(PAN_PRESETS.overhead_ambient.settings.spatial3d.elevationDeg).toBe(60);
    expect(PAN_PRESETS.behind_listener.settings.spatial3d.azimuthDeg).toBe(180);
  });

  describe('calculateEqualPowerPanGains', () => {
    it('calculates equal power 3dB center gains (~0.7071 / -3dB)', () => {
      const gains = calculateEqualPowerPanGains(0.0, 'equal_power_3db');
      expect(gains.gainL).toBeCloseTo(0.7071, 3);
      expect(gains.gainR).toBeCloseTo(0.7071, 3);
      // Constant energy: gainL^2 + gainR^2 ≈ 1.0
      expect(Math.pow(gains.gainL, 2) + Math.pow(gains.gainR, 2)).toBeCloseTo(1.0, 3);
    });

    it('calculates full left and full right gains correctly', () => {
      const leftGains = calculateEqualPowerPanGains(-1.0, 'equal_power_3db');
      expect(leftGains.gainL).toBeCloseTo(1.0, 3);
      expect(leftGains.gainR).toBeCloseTo(0.0, 3);

      const rightGains = calculateEqualPowerPanGains(1.0, 'equal_power_3db');
      expect(rightGains.gainL).toBeCloseTo(0.0, 3);
      expect(rightGains.gainR).toBeCloseTo(1.0, 3);
    });

    it('calculates equal power 4.5dB law center attenuation (~0.5946)', () => {
      const gains = calculateEqualPowerPanGains(0.0, 'equal_power_4_5db');
      expect(gains.gainL).toBeCloseTo(0.5946, 3);
      expect(gains.gainR).toBeCloseTo(0.5946, 3);
    });

    it('calculates linear 6dB law center gains (0.5)', () => {
      const gains = calculateEqualPowerPanGains(0.0, 'linear_6db');
      expect(gains.gainL).toBe(0.5);
      expect(gains.gainR).toBe(0.5);
    });
  });

  describe('calculateSpatialCoordinates', () => {
    it('calculates forward center position at ear level', () => {
      // Azimuth 0, Elevation 0, Distance 1m -> x=0, y=0, z=-1
      const coords = calculateSpatialCoordinates(0, 0, 1.0);
      expect(coords.x).toBeCloseTo(0.0, 3);
      expect(coords.y).toBeCloseTo(0.0, 3);
      expect(coords.z).toBeCloseTo(-1.0, 3);
    });

    it('calculates full right position', () => {
      // Azimuth 90, Elevation 0, Distance 2m -> x=2, y=0, z=0
      const coords = calculateSpatialCoordinates(90, 0, 2.0);
      expect(coords.x).toBeCloseTo(2.0, 3);
      expect(coords.y).toBeCloseTo(0.0, 3);
      expect(coords.z).toBeCloseTo(0.0, 3);
    });

    it('calculates zenith overhead position', () => {
      // Azimuth 0, Elevation 90, Distance 1.5m -> x=0, y=1.5, z=0
      const coords = calculateSpatialCoordinates(0, 90, 1.5);
      expect(coords.x).toBeCloseTo(0.0, 3);
      expect(coords.y).toBeCloseTo(1.5, 3);
      expect(coords.z).toBeCloseTo(0.0, 3);
    });

    it('calculates rear position behind listener', () => {
      // Azimuth 180, Elevation 0, Distance 1m -> x=0, y=0, z=1
      const coords = calculateSpatialCoordinates(180, 0, 1.0);
      expect(coords.x).toBeCloseTo(0.0, 3);
      expect(coords.y).toBeCloseTo(0.0, 3);
      expect(coords.z).toBeCloseTo(1.0, 3);
    });
  });

  describe('buildFfmpegPanFilter', () => {
    it('returns empty string when disabled or centered', () => {
      expect(buildFfmpegPanFilter(undefined)).toBe('');
      expect(buildFfmpegPanFilter({ ...DEFAULT_AUDIO_PAN_SETTINGS, enabled: false })).toBe('');
      expect(buildFfmpegPanFilter({ ...DEFAULT_AUDIO_PAN_SETTINGS, enabled: true, pan: 0.0 })).toBe('');
    });

    it('generates frame-accurate stereo pan filter string for hard left', () => {
      const settings: AudioPanSettings = {
        enabled: true,
        pan: -1.0,
        law: 'equal_power_3db',
        spatial3d: { enabled: false, azimuthDeg: 0, elevationDeg: 0, distance: 1.0 },
      };
      const filter = buildFfmpegPanFilter(settings);
      expect(filter).toBe('pan=stereo|c0=1.000*c0|c1=0.000*c1');
    });

    it('generates frame-accurate stereo pan filter string for hard right', () => {
      const settings: AudioPanSettings = {
        enabled: true,
        pan: 1.0,
        law: 'equal_power_3db',
        spatial3d: { enabled: false, azimuthDeg: 0, elevationDeg: 0, distance: 1.0 },
      };
      const filter = buildFfmpegPanFilter(settings);
      expect(filter).toBe('pan=stereo|c0=0.000*c0|c1=1.000*c1');
    });

    it('derives pan from 3D azimuth when spatial 3D is active', () => {
      const settings: AudioPanSettings = {
        enabled: true,
        pan: 0.0,
        law: 'equal_power_3db',
        spatial3d: { enabled: true, azimuthDeg: -90, elevationDeg: 0, distance: 1.0 },
      };
      const filter = buildFfmpegPanFilter(settings);
      expect(filter).toBe('pan=stereo|c0=1.000*c0|c1=0.000*c1');
    });
  });
});
