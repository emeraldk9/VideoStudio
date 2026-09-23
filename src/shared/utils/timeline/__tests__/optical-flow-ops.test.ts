import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPTICAL_FLOW_SETTINGS,
  OPTICAL_FLOW_PRESETS,
  calculateMotionVector,
  calculateInterpolatedWeights,
  detectSceneCutBreak,
  buildFfmpegOpticalFlowFilter,
  type OpticalFlowSettings,
} from '../optical-flow-ops';

describe('optical-flow-ops', () => {
  describe('calculateMotionVector', () => {
    it('computes displacement and velocity accurately', () => {
      const vector = calculateMotionVector(10, 20, 40, 60, 2.0);
      expect(vector.dx).toBe(30);
      expect(vector.dy).toBe(40);
      expect(vector.velocity).toBe(25); // distance = 50, dt = 2.0 -> velocity = 25
    });

    it('handles zero displacement gracefully', () => {
      const vector = calculateMotionVector(100, 100, 100, 100, 1.0);
      expect(vector.dx).toBe(0);
      expect(vector.dy).toBe(0);
      expect(vector.velocity).toBe(0);
    });

    it('protects against division by zero time delta', () => {
      const vector = calculateMotionVector(0, 0, 3, 4, 0);
      expect(Number.isFinite(vector.velocity)).toBe(true);
      expect(vector.velocity).toBeGreaterThan(0);
    });
  });

  describe('calculateInterpolatedWeights', () => {
    it('gives 1.0 forward and 0.0 backward weight at t=0', () => {
      const weights = calculateInterpolatedWeights(0.0);
      expect(weights.forwardWeight).toBe(1.0);
      expect(weights.backwardWeight).toBe(0.0);
    });

    it('gives 0.0 forward and 1.0 backward weight at t=1', () => {
      const weights = calculateInterpolatedWeights(1.0);
      expect(weights.forwardWeight).toBe(0.0);
      expect(weights.backwardWeight).toBe(1.0);
    });

    it('gives exact 0.5 balanced weights at midpoint t=0.5', () => {
      const weights = calculateInterpolatedWeights(0.5);
      expect(weights.forwardWeight).toBe(0.5);
      expect(weights.backwardWeight).toBe(0.5);
    });

    it('maintains unit sum across arbitrary time fractions', () => {
      for (const t of [0.1, 0.25, 0.67, 0.82]) {
        const weights = calculateInterpolatedWeights(t);
        expect(weights.forwardWeight + weights.backwardWeight).toBeCloseTo(1.0, 3);
      }
    });
  });

  describe('detectSceneCutBreak', () => {
    it('returns false when similarity is high', () => {
      // 90% similarity with 40% scene break threshold should not cut
      expect(detectSceneCutBreak(0.9, 0.4)).toBe(false);
    });

    it('returns true when similarity drops significantly below threshold', () => {
      // 40% similarity with 40% scene break threshold (break when sim < 0.6)
      expect(detectSceneCutBreak(0.4, 0.4)).toBe(true);
    });

    it('clamps similarity within bounds', () => {
      expect(detectSceneCutBreak(1.5, 0.5)).toBe(false);
      expect(detectSceneCutBreak(-0.5, 0.5)).toBe(true);
    });
  });

  describe('buildFfmpegOpticalFlowFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegOpticalFlowFilter(DEFAULT_OPTICAL_FLOW_SETTINGS)).toBe('');
    });

    it('generates simple fps filter for nearest mode', () => {
      const settings: OpticalFlowSettings = {
        enabled: true,
        mode: 'nearest',
        targetFps: 60,
        speedMultiplier: 0.5,
        motionVectorPrecision: 'quarter_pixel',
        sceneChangeThreshold: 0.4,
        blockOverlapPct: 50,
      };
      expect(buildFfmpegOpticalFlowFilter(settings)).toBe('fps=60');
    });

    it('generates blend minterpolate filter for blend mode', () => {
      const settings: OpticalFlowSettings = {
        enabled: true,
        mode: 'blend',
        targetFps: 60,
        speedMultiplier: 0.5,
        motionVectorPrecision: 'half_pixel',
        sceneChangeThreshold: 0.35,
        blockOverlapPct: 0,
      };
      const filter = buildFfmpegOpticalFlowFilter(settings);
      expect(filter).toContain('minterpolate=mi_mode=blend:fps=60');
      expect(filter).toContain('scd_threshold=35.0');
    });

    it('generates bidirectional optical flow filter with aobmc for smooth motion', () => {
      const settings: OpticalFlowSettings = {
        enabled: true,
        mode: 'smooth_motion',
        targetFps: 120,
        speedMultiplier: 0.25,
        motionVectorPrecision: 'quarter_pixel',
        sceneChangeThreshold: 0.5,
        blockOverlapPct: 75,
      };
      const filter = buildFfmpegOpticalFlowFilter(settings);
      expect(filter).toContain('minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
      expect(filter).toContain('scd_threshold=50.0');
    });
  });

  describe('OPTICAL_FLOW_PRESETS', () => {
    it('contains all 4 studio presets with valid configurations', () => {
      const presets = Object.keys(OPTICAL_FLOW_PRESETS);
      expect(presets).toHaveLength(4);
      expect(presets).toContain('smooth_slow_mo_4x');
      expect(presets).toContain('extreme_dream_mo_10x');
      expect(presets).toContain('action_sports_2x');
      expect(presets).toContain('cinematic_60fps_fluid');

      for (const key of presets as Array<keyof typeof OPTICAL_FLOW_PRESETS>) {
        const preset = OPTICAL_FLOW_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.settings.targetFps).toBeGreaterThanOrEqual(24);
        expect(preset.settings.speedMultiplier).toBeGreaterThan(0);
        expect(preset.settings.speedMultiplier).toBeLessThanOrEqual(1);
        expect(preset.settings.blockOverlapPct).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
