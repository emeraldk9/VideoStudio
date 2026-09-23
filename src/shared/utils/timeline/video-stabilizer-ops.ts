/**
 * Operations and mathematical models for Video Stabilization,
 * Camera Motion Compensation, and Rolling Shutter Wobble Correction.
 */

export type VideoStabilizerMode = 'smooth_motion' | 'tripod_lock' | 'translation_only';

export type VideoStabilizerPresetKey =
  | 'handheld_vlog'
  | 'action_cam_extreme'
  | 'drone_aerial'
  | 'tripod_lock';

export interface VideoStabilizerSettings {
  enabled: boolean;
  mode: VideoStabilizerMode;
  smoothness: number; // 1 to 50 frames (temporal filter window size)
  shakiness: number; // 1 to 10 (motion detection sensitivity)
  autoCropZoom: number; // 0.0 to 0.30 (margin zoom factor to prevent edge voids)
  rollingShutterCorrection: boolean; // CMOS scanning line skew compensation
  rollingShutterStrength: number; // 0.0 to 1.0 (wobble correction depth)
  preset?: VideoStabilizerPresetKey;
}

export const DEFAULT_VIDEO_STABILIZER_SETTINGS: VideoStabilizerSettings = {
  enabled: false,
  mode: 'smooth_motion',
  smoothness: 15,
  shakiness: 5,
  autoCropZoom: 0.08,
  rollingShutterCorrection: false,
  rollingShutterStrength: 0.4,
};

export interface VideoStabilizerPresetConfig {
  name: string;
  description: string;
  settings: Omit<VideoStabilizerSettings, 'enabled'>;
}

export const VIDEO_STABILIZER_PRESETS: Record<VideoStabilizerPresetKey, VideoStabilizerPresetConfig> = {
  handheld_vlog: {
    name: 'Handheld Vlog',
    description: 'Gentle organic stabilization preserving intentional walking and speaking motion.',
    settings: {
      mode: 'smooth_motion',
      smoothness: 12,
      shakiness: 4,
      autoCropZoom: 0.06,
      rollingShutterCorrection: true,
      rollingShutterStrength: 0.3,
      preset: 'handheld_vlog',
    },
  },
  action_cam_extreme: {
    name: 'Action Sports',
    description: 'Aggressive high-frequency vibration and jolt suppression for mountain biking or running.',
    settings: {
      mode: 'smooth_motion',
      smoothness: 28,
      shakiness: 8,
      autoCropZoom: 0.14,
      rollingShutterCorrection: true,
      rollingShutterStrength: 0.6,
      preset: 'action_cam_extreme',
    },
  },
  drone_aerial: {
    name: 'Drone Aerial',
    description: 'Ultra-wide smoothing window eliminating wind buffeting and rotor wobble.',
    settings: {
      mode: 'smooth_motion',
      smoothness: 35,
      shakiness: 6,
      autoCropZoom: 0.09,
      rollingShutterCorrection: false,
      rollingShutterStrength: 0.2,
      preset: 'drone_aerial',
    },
  },
  tripod_lock: {
    name: 'Tripod Lock',
    description: 'Complete motion freeze simulating a heavyweight studio tripod mount.',
    settings: {
      mode: 'tripod_lock',
      smoothness: 50,
      shakiness: 9,
      autoCropZoom: 0.12,
      rollingShutterCorrection: true,
      rollingShutterStrength: 0.5,
      preset: 'tripod_lock',
    },
  },
};

/**
 * Calculates the minimal zoom margin required to prevent black borders given peak displacement in pixels.
 */
export function calculateOptimalZoomMargin(
  maxDisplacementPx: number,
  frameWidth: number = 1920,
  frameHeight: number = 1080,
): number {
  const safeDim = Math.min(frameWidth, frameHeight);
  if (safeDim <= 0 || maxDisplacementPx <= 0) return 0;
  // Margin factor = (2 * maxDisplacement) / minDimension, clamped between 0.0 and 0.35
  const rawRatio = (2 * maxDisplacementPx) / safeDim;
  return Number(Math.max(0, Math.min(0.35, rawRatio)).toFixed(3));
}

/**
 * Applies a 1D Gaussian smoothing filter over a temporal sequence of 2D points.
 */
export function smoothTrajectoryGaussian(
  points: Array<{ x: number; y: number }>,
  windowSize: number = 5,
): Array<{ x: number; y: number }> {
  const n = points.length;
  if (n <= 1 || windowSize <= 1) return [...points];

  const radius = Math.floor(windowSize / 2);
  const sigma = Math.max(0.5, radius / 2);
  const weights: number[] = [];
  let totalWeight = 0;

  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    totalWeight += w;
  }

  return points.map((_, idx) => {
    let accX = 0;
    let accY = 0;
    let localWeight = 0;

    for (let k = -radius; k <= radius; k++) {
      const sampleIdx = idx + k;
      if (sampleIdx >= 0 && sampleIdx < n) {
        const w = weights[k + radius];
        accX += points[sampleIdx].x * w;
        accY += points[sampleIdx].y * w;
        localWeight += w;
      }
    }

    return {
      x: Number((accX / localWeight).toFixed(3)),
      y: Number((accY / localWeight).toFixed(3)),
    };
  });
}

/**
 * Synthesizes an FFmpeg `deshake` filter expression for video stabilization during export.
 */
export function buildFfmpegStabilizerFilter(settings: VideoStabilizerSettings): string {
  if (!settings.enabled) return '';

  const filters: string[] = [];

  // Deshake filter parameters
  // rx/ry: maximum horizontal/vertical shift in pixels
  // edge: 0 = mirror, 1 = clamp, 2 = color
  // blocksize: motion detection block size
  const maxShift = Math.max(8, Math.min(64, Math.round(settings.shakiness * 6)));
  const edgeMode = 'mirror';

  filters.push(`deshake=x=0:y=0:w=0:h=0:rx=${maxShift}:ry=${maxShift}:edge=${edgeMode}`);

  // Auto crop and zoom to conceal stabilized margins
  if (settings.autoCropZoom > 0) {
    const scaleFactor = (1 + settings.autoCropZoom).toFixed(3);
    filters.push(`scale=iw*${scaleFactor}:ih*${scaleFactor}`);
    filters.push('crop=iw/(1+0):ih/(1+0)');
  }

  return filters.join(',');
}
