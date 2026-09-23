export type MotionBlurPresetKey =
  | 'cinema_standard_180'
  | 'action_staccato_90'
  | 'dreamy_fluid_360'
  | 'high_speed_ramp';

export interface MotionBlurSettings {
  enabled: boolean;
  shutterAngle: number;     // 0 to 360 degrees (default 180)
  shutterPhase: number;     // -90 to 90 degrees (default 0)
  sampleCount: number;      // 2 to 16 samples (default 8)
  motionThreshold: number;  // 0.0 to 1.0 (default 0.1)
  preset?: MotionBlurPresetKey;
}

export const DEFAULT_MOTION_BLUR_SETTINGS: MotionBlurSettings = {
  enabled: false,
  shutterAngle: 180,
  shutterPhase: 0,
  sampleCount: 8,
  motionThreshold: 0.1,
};

export const MOTION_BLUR_PRESETS: Record<MotionBlurPresetKey, MotionBlurSettings> = {
  cinema_standard_180: {
    enabled: true,
    shutterAngle: 180,
    shutterPhase: 0,
    sampleCount: 8,
    motionThreshold: 0.1,
    preset: 'cinema_standard_180',
  },
  action_staccato_90: {
    enabled: true,
    shutterAngle: 90,
    shutterPhase: 0,
    sampleCount: 4,
    motionThreshold: 0.15,
    preset: 'action_staccato_90',
  },
  dreamy_fluid_360: {
    enabled: true,
    shutterAngle: 360,
    shutterPhase: 0,
    sampleCount: 12,
    motionThreshold: 0.05,
    preset: 'dreamy_fluid_360',
  },
  high_speed_ramp: {
    enabled: true,
    shutterAngle: 240,
    shutterPhase: -45,
    sampleCount: 16,
    motionThreshold: 0.08,
    preset: 'high_speed_ramp',
  },
};

/**
 * Calculates the exposure fraction (0.0 to 1.0) of a frame interval corresponding to the shutter angle.
 */
export function calculateExposureFraction(shutterAngle: number): number {
  const angle = Math.max(0, Math.min(360, shutterAngle));
  return Math.round((angle / 360) * 1000) / 1000;
}

/**
 * Calculates the equivalent photographic shutter speed string for a given shutter angle and frame rate.
 * e.g., at 180° and 24fps -> "1/48s"
 */
export function calculateEffectiveShutterSpeed(shutterAngle: number, fps: number = 24): string {
  const safeFps = Math.max(1, fps);
  const angle = Math.max(1, Math.min(360, shutterAngle));
  const denominator = Math.round((360 / angle) * safeFps);
  return `1/${denominator}s`;
}

/**
 * Generates an FFmpeg video filter string implementing motion blur via frame mixing / interpolation.
 */
export function buildFfmpegMotionBlurFilter(
  settings: MotionBlurSettings | undefined,
  _fps: number = 24,
): string {
  if (!settings || !settings.enabled) {
    return '';
  }

  const samples = Math.max(2, Math.min(16, Math.round(settings.sampleCount)));
  const exposureRatio = calculateExposureFraction(settings.shutterAngle);

  // Weights generate a temporal roll-off across the exposure window:
  const weights: string[] = [];
  for (let i = 0; i < samples; i++) {
    // Center-weighted bell or linear decay:
    const normalized = (i + 1) / samples;
    const weight = Math.max(0.1, (1.0 - (1.0 - exposureRatio) * (1.0 - normalized))).toFixed(2);
    weights.push(weight);
  }

  return `tmix=frames=${samples}:weights='${weights.join(' ')}'`;
}
