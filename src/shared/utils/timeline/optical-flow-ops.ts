/**
 * Operations and mathematical models for Optical Flow Motion Estimation,
 * AI Video Super Slow-Motion, and Frame Interpolation.
 */

export type OpticalFlowMode = 'nearest' | 'blend' | 'optical_flow' | 'smooth_motion';

export type MotionVectorPrecision = 'pixel' | 'half_pixel' | 'quarter_pixel';

export type OpticalFlowPresetKey =
  | 'smooth_slow_mo_4x'
  | 'extreme_dream_mo_10x'
  | 'action_sports_2x'
  | 'cinematic_60fps_fluid';

export interface OpticalFlowSettings {
  enabled: boolean;
  mode: OpticalFlowMode;
  targetFps: number; // e.g. 24, 30, 60, 120, 240
  speedMultiplier: number; // 0.05 to 1.0 (fractional playback rate)
  motionVectorPrecision: MotionVectorPrecision;
  sceneChangeThreshold: number; // 0.0 to 1.0 (cut detection break)
  blockOverlapPct: number; // 0 to 100% (Overlapped Block Motion Compensation)
  preset?: OpticalFlowPresetKey;
}

export const DEFAULT_OPTICAL_FLOW_SETTINGS: OpticalFlowSettings = {
  enabled: false,
  mode: 'optical_flow',
  targetFps: 60,
  speedMultiplier: 0.5,
  motionVectorPrecision: 'quarter_pixel',
  sceneChangeThreshold: 0.4,
  blockOverlapPct: 50,
};

export interface OpticalFlowPresetConfig {
  name: string;
  description: string;
  settings: Omit<OpticalFlowSettings, 'enabled'>;
}

export const OPTICAL_FLOW_PRESETS: Record<OpticalFlowPresetKey, OpticalFlowPresetConfig> = {
  smooth_slow_mo_4x: {
    name: '4x Fluid Slow-Mo',
    description: 'Quarter speed (0.25x) high-density sub-pixel motion vector warping at 60fps.',
    settings: {
      mode: 'optical_flow',
      targetFps: 60,
      speedMultiplier: 0.25,
      motionVectorPrecision: 'quarter_pixel',
      sceneChangeThreshold: 0.45,
      blockOverlapPct: 50,
      preset: 'smooth_slow_mo_4x',
    },
  },
  extreme_dream_mo_10x: {
    name: '10x Dream-Mo',
    description: 'Ultra slow-motion (0.10x) with heavy overlapped block motion compensation.',
    settings: {
      mode: 'smooth_motion',
      targetFps: 120,
      speedMultiplier: 0.1,
      motionVectorPrecision: 'quarter_pixel',
      sceneChangeThreshold: 0.5,
      blockOverlapPct: 75,
      preset: 'extreme_dream_mo_10x',
    },
  },
  action_sports_2x: {
    name: '2x Action Sports',
    description: 'Half-speed (0.50x) rapid movement retiming with high scene-cut resilience.',
    settings: {
      mode: 'optical_flow',
      targetFps: 60,
      speedMultiplier: 0.5,
      motionVectorPrecision: 'half_pixel',
      sceneChangeThreshold: 0.35,
      blockOverlapPct: 25,
      preset: 'action_sports_2x',
    },
  },
  cinematic_60fps_fluid: {
    name: 'Fluid 60fps HFR',
    description: 'Frame rate multiplier converting 24fps cinema cadence into silky 60fps.',
    settings: {
      mode: 'smooth_motion',
      targetFps: 60,
      speedMultiplier: 1.0,
      motionVectorPrecision: 'quarter_pixel',
      sceneChangeThreshold: 0.4,
      blockOverlapPct: 50,
      preset: 'cinematic_60fps_fluid',
    },
  },
};

/**
 * Computes 2D displacement motion vector and Euclidean velocity magnitude.
 */
export function calculateMotionVector(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dt: number = 1.0,
): { dx: number; dy: number; velocity: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const safeDt = Math.max(0.0001, dt);
  const distance = Math.hypot(dx, dy);
  const velocity = distance / safeDt;
  return { dx, dy, velocity };
}

/**
 * Computes bidirectional warping weights for intermediate frame synthesis at normalized time t in [0.0, 1.0].
 * Uses cosine ease-in-out curve for natural visual cross-fading of occlusion artifacts.
 */
export function calculateInterpolatedWeights(timeFraction: number): {
  forwardWeight: number;
  backwardWeight: number;
} {
  const t = Math.max(0, Math.min(1, timeFraction));
  // Cosine smooth fade: weight from frame A (1 -> 0), weight from frame B (0 -> 1)
  const forwardWeight = 0.5 * (1 + Math.cos(Math.PI * t));
  const backwardWeight = 1 - forwardWeight;
  return {
    forwardWeight: Number(forwardWeight.toFixed(4)),
    backwardWeight: Number(backwardWeight.toFixed(4)),
  };
}

/**
 * Detects whether an abrupt scene cut occurs, preventing unnatural morphing across edits.
 * Returns true if the frame difference indicates a scene transition break.
 */
export function detectSceneCutBreak(similarityScore: number, threshold: number): boolean {
  const clampedSim = Math.max(0, Math.min(1, similarityScore));
  const clampedThresh = Math.max(0.01, Math.min(0.99, threshold));
  // When similarity drops below (1 - threshold), a scene break is triggered
  return clampedSim < 1 - clampedThresh;
}

/**
 * Synthesizes an FFmpeg `minterpolate` filter expression for export rendering.
 */
export function buildFfmpegOpticalFlowFilter(settings: OpticalFlowSettings): string {
  if (!settings.enabled) return '';

  const fps = Math.max(12, Math.min(240, Math.round(settings.targetFps)));
  const scThresh = (settings.sceneChangeThreshold * 100).toFixed(1);

  if (settings.mode === 'nearest') {
    return `fps=${fps}`;
  }

  if (settings.mode === 'blend') {
    return `minterpolate=mi_mode=blend:fps=${fps}:scd=fdiff:scd_threshold=${scThresh}`;
  }

  // Optical Flow or Smooth Motion
  const mcMode = settings.mode === 'smooth_motion' ? 'aobmc' : 'obmc';
  const meMode = 'bidir';
  const vsbmc = settings.blockOverlapPct > 0 ? 1 : 0;

  return `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=${mcMode}:me_mode=${meMode}:vsbmc=${vsbmc}:scd=fdiff:scd_threshold=${scThresh}`;
}
