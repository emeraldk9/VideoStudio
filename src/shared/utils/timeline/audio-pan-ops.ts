/**
 * S50 — Audio Stereo Panner, Binaural 3D Spatializer & Surround Sound Panning Engine.
 *
 * Implements:
 * 1. Constant-energy equal-power stereo panning (3dB, 4.5dB, linear 6dB pan laws).
 * 2. Binaural 3D spherical-to-Cartesian spatial positioning (Azimuth, Elevation, Distance).
 * 3. Interactive 2D/3D circular radar HUD coordinates.
 * 4. FFmpeg stereo pan filter synthesis for timeline video exports.
 */

export type PanLawType = 'equal_power_3db' | 'equal_power_4_5db' | 'linear_6db';

export type PanPresetKey =
  | 'center'
  | 'hard_left'
  | 'hard_right'
  | 'wide_stereo'
  | 'cinema_front'
  | 'overhead_ambient'
  | 'behind_listener';

export interface PanSpatial3DSettings {
  enabled: boolean;
  /** Horizontal azimuth angle in degrees [-180..180], where 0 is dead center, -90 left, +90 right, ±180 rear. */
  azimuthDeg: number;
  /** Vertical elevation angle in degrees [-90..90], where 0 is ear-level, +90 overhead zenith, -90 nadir. */
  elevationDeg: number;
  /** Acoustic distance from listener in meters [0.1..10.0]. */
  distance: number;
}

export interface AudioPanSettings {
  enabled: boolean;
  /** Horizontal stereo pan in [-1.0..1.0], where -1 is full left, 0 is center, +1 is full right. */
  pan: number;
  /** Panning law determining center attenuation. */
  law: PanLawType;
  /** Binaural 3D spatial acoustic settings. */
  spatial3d: PanSpatial3DSettings;
  /** Optional active preset key. */
  preset?: PanPresetKey;
}

export const DEFAULT_AUDIO_PAN_SETTINGS: AudioPanSettings = {
  enabled: false,
  pan: 0.0,
  law: 'equal_power_3db',
  spatial3d: {
    enabled: false,
    azimuthDeg: 0,
    elevationDeg: 0,
    distance: 1.0,
  },
  preset: undefined,
};

export interface PanPresetDefinition {
  label: string;
  description: string;
  settings: AudioPanSettings;
}

export const PAN_PRESETS: Record<PanPresetKey, PanPresetDefinition> = {
  center: {
    label: 'Dead Center',
    description: 'Balanced stereo center with equal acoustic energy in left and right channels.',
    settings: {
      enabled: true,
      pan: 0.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: false,
        azimuthDeg: 0,
        elevationDeg: 0,
        distance: 1.0,
      },
      preset: 'center',
    },
  },
  hard_left: {
    label: 'Hard Left (L100)',
    description: 'Full left channel isolation (-1.0).',
    settings: {
      enabled: true,
      pan: -1.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: false,
        azimuthDeg: -90,
        elevationDeg: 0,
        distance: 1.0,
      },
      preset: 'hard_left',
    },
  },
  hard_right: {
    label: 'Hard Right (R100)',
    description: 'Full right channel isolation (+1.0).',
    settings: {
      enabled: true,
      pan: 1.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: false,
        azimuthDeg: 90,
        elevationDeg: 0,
        distance: 1.0,
      },
      preset: 'hard_right',
    },
  },
  wide_stereo: {
    label: 'Slight Right (R30)',
    description: 'Natural off-center acoustic positioning commonly used for dialogue separation.',
    settings: {
      enabled: true,
      pan: 0.3,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: false,
        azimuthDeg: 25,
        elevationDeg: 0,
        distance: 1.0,
      },
      preset: 'wide_stereo',
    },
  },
  cinema_front: {
    label: 'Cinema Front Stage (3D)',
    description: 'Forward-projected 3D soundstage slightly elevated at screen level.',
    settings: {
      enabled: true,
      pan: 0.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: true,
        azimuthDeg: 0,
        elevationDeg: 15,
        distance: 1.5,
      },
      preset: 'cinema_front',
    },
  },
  overhead_ambient: {
    label: 'Overhead Atmos (3D)',
    description: 'Elevated spatial sound positioned high above the listener (+60° elevation).',
    settings: {
      enabled: true,
      pan: 0.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: true,
        azimuthDeg: 0,
        elevationDeg: 60,
        distance: 2.0,
      },
      preset: 'overhead_ambient',
    },
  },
  behind_listener: {
    label: 'Rear Surround (3D)',
    description: 'Spatial audio placed directly behind the listener (180° azimuth).',
    settings: {
      enabled: true,
      pan: 0.0,
      law: 'equal_power_3db',
      spatial3d: {
        enabled: true,
        azimuthDeg: 180,
        elevationDeg: 5,
        distance: 1.8,
      },
      preset: 'behind_listener',
    },
  },
};

/**
 * Calculates equal-power linear gain coefficients (gainL, gainR) for a given pan value.
 *
 * 1. 'equal_power_3db':
 *    theta = (pi / 4) * (pan + 1)
 *    gainL = cos(theta), gainR = sin(theta)
 *    Center: gainL = gainR = sqrt(2)/2 ≈ 0.7071 (-3dB)
 *
 * 2. 'equal_power_4_5db':
 *    gainL = cos(theta)^1.5, gainR = sin(theta)^1.5
 *    Center: ≈ 0.5946 (-4.5dB)
 *
 * 3. 'linear_6db':
 *    gainL = (1 - pan) / 2, gainR = (1 + pan) / 2
 *    Center: 0.5 (-6dB)
 */
export function calculateEqualPowerPanGains(
  pan: number,
  law: PanLawType = 'equal_power_3db',
): { gainL: number; gainR: number } {
  const clampedPan = Math.max(-1.0, Math.min(1.0, pan));
  const theta = (Math.PI / 4) * (clampedPan + 1.0); // 0 at -1, pi/4 at 0, pi/2 at +1

  switch (law) {
    case 'equal_power_4_5db': {
      const cosVal = Math.cos(theta);
      const sinVal = Math.sin(theta);
      const gainL = Math.pow(Math.max(0, cosVal), 1.5);
      const gainR = Math.pow(Math.max(0, sinVal), 1.5);
      return {
        gainL: Number(gainL.toFixed(4)),
        gainR: Number(gainR.toFixed(4)),
      };
    }

    case 'linear_6db': {
      const gainL = (1.0 - clampedPan) / 2.0;
      const gainR = (1.0 + clampedPan) / 2.0;
      return {
        gainL: Number(gainL.toFixed(4)),
        gainR: Number(gainR.toFixed(4)),
      };
    }

    case 'equal_power_3db':
    default: {
      const gainL = Math.cos(theta);
      const gainR = Math.sin(theta);
      return {
        gainL: Number(gainL.toFixed(4)),
        gainR: Number(gainR.toFixed(4)),
      };
    }
  }
}

/**
 * Converts spherical spatial audio parameters (azimuth, elevation, distance)
 * into Cartesian coordinates (x, y, z) for Web Audio PannerNode.
 *
 * Coordinates:
 * - x: positive right, negative left
 * - y: positive up, negative down
 * - z: positive behind, negative forward (Web Audio right-handed coordinate standard)
 */
export function calculateSpatialCoordinates(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number = 1.0,
): { x: number; y: number; z: number } {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const elRad = (elevationDeg * Math.PI) / 180;
  const d = Math.max(0.1, distance);

  // x = d * sin(azimuth) * cos(elevation)
  // y = d * sin(elevation)
  // z = -d * cos(azimuth) * cos(elevation)
  const cosEl = Math.cos(elRad);
  const x = d * Math.sin(azRad) * cosEl;
  const y = d * Math.sin(elRad);
  const z = -d * Math.cos(azRad) * cosEl;

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    z: Number(z.toFixed(4)),
  };
}

/**
 * Emits an FFmpeg pan filter string for export rendering.
 */
export function buildFfmpegPanFilter(settings: AudioPanSettings | undefined): string {
  if (!settings || !settings.enabled) {
    return '';
  }

  // If spatial 3D is enabled, derive pan from azimuth angle
  let effectivePan = settings.pan;
  if (settings.spatial3d.enabled) {
    // -90 to +90 deg maps to -1 to +1
    const clampedAz = Math.max(-90, Math.min(90, settings.spatial3d.azimuthDeg));
    effectivePan = clampedAz / 90;
  }

  if (Math.abs(effectivePan) < 0.001) {
    return '';
  }

  const { gainL, gainR } = calculateEqualPowerPanGains(effectivePan, settings.law);
  return `pan=stereo|c0=${gainL.toFixed(3)}*c0|c1=${gainR.toFixed(3)}*c1`;
}
