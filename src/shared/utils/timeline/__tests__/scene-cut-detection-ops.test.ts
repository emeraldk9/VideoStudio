import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCENE_CUT_DETECTION_SETTINGS,
  calculateHistogramDelta,
  detectSceneCuts,
  filterCutsByMinDuration,
  buildFfmpegSceneDetectionCommand,
  DetectedCutPoint,
} from '../scene-cut-detection-ops';

describe('scene-cut-detection-ops', () => {
  it('has valid default scene cut detection settings', () => {
    expect(DEFAULT_SCENE_CUT_DETECTION_SETTINGS.threshold).toBe(0.40);
    expect(DEFAULT_SCENE_CUT_DETECTION_SETTINGS.minShotDurationFrames).toBe(24);
    expect(DEFAULT_SCENE_CUT_DETECTION_SETTINGS.ignoreFlashes).toBe(true);
    expect(DEFAULT_SCENE_CUT_DETECTION_SETTINGS.action).toBe('split_clips');
  });

  describe('calculateHistogramDelta', () => {
    it('returns 0 for identical histograms', () => {
      const histA = [10, 20, 30, 40];
      const histB = [10, 20, 30, 40];
      expect(calculateHistogramDelta(histA, histB)).toBe(0);
    });

    it('returns 1.0 for completely disjoint non-overlapping histograms', () => {
      const histA = [100, 0, 0, 0];
      const histB = [0, 0, 0, 100];
      expect(calculateHistogramDelta(histA, histB)).toBeCloseTo(1.0, 4);
    });

    it('returns 0 if either histogram is empty or mismatched lengths', () => {
      expect(calculateHistogramDelta([], [1, 2, 3])).toBe(0);
      expect(calculateHistogramDelta([1, 2], [1, 2, 3])).toBe(0);
    });

    it('returns intermediate delta for partially overlapping histograms', () => {
      const histA = [50, 50, 0, 0];
      const histB = [25, 25, 25, 25];
      const delta = calculateHistogramDelta(histA, histB);
      expect(delta).toBeGreaterThan(0.2);
      expect(delta).toBeLessThan(0.8);
    });
  });

  describe('detectSceneCuts', () => {
    it('returns empty array when frame deltas are empty', () => {
      expect(detectSceneCuts([])).toEqual([]);
    });

    it('detects a clear hard cut at frame index when delta exceeds threshold', () => {
      // 10 frames with low deltas, frame 5 has high delta (0.8)
      const deltas = [0.05, 0.04, 0.06, 0.05, 0.82, 0.05, 0.04, 0.06, 0.05, 0.04];
      const cuts = detectSceneCuts(deltas, {
        threshold: 0.4,
        minShotDurationFrames: 2,
        ignoreFlashes: false,
        action: 'split_clips',
      });

      expect(cuts.length).toBe(1);
      expect(cuts[0]!.frame).toBe(5); // i = 4 -> frame = 5
      expect(cuts[0]!.confidence).toBe(0.82);
      expect(cuts[0]!.type).toBe('hard_cut');
    });

    it('flags contiguous elevated deltas as dissolve transition', () => {
      const deltas = [0.05, 0.05, 0.50, 0.55, 0.52, 0.05, 0.05];
      const cuts = detectSceneCuts(deltas, {
        threshold: 0.4,
        minShotDurationFrames: 2,
        ignoreFlashes: false,
        action: 'split_clips',
      });

      expect(cuts.length).toBeGreaterThan(0);
      expect(cuts[0]!.type).toBe('dissolve_transition');
    });

    it('rejects isolated single-frame strobe flash when ignoreFlashes is true', () => {
      // Flash occurs at i=3 (0.85) and ends at i=4 (0.85), followed by normal at i=5 (0.05)
      const deltas = [0.05, 0.04, 0.05, 0.85, 0.85, 0.04, 0.05];
      const cutsWithFlashSuppression = detectSceneCuts(deltas, {
        threshold: 0.4,
        minShotDurationFrames: 2,
        ignoreFlashes: true,
        action: 'split_clips',
      });

      expect(cutsWithFlashSuppression.length).toBe(0);
    });
  });

  describe('filterCutsByMinDuration', () => {
    it('returns original cuts if 1 or 0 cut points', () => {
      expect(filterCutsByMinDuration([], 24)).toEqual([]);
      const singleCut: DetectedCutPoint[] = [{ frame: 10, confidence: 0.9, type: 'hard_cut' }];
      expect(filterCutsByMinDuration(singleCut, 24)).toEqual(singleCut);
    });

    it('prunes closely spaced cuts within minShotDuration keeping highest confidence cut', () => {
      const cuts: DetectedCutPoint[] = [
        { frame: 10, confidence: 0.6, type: 'hard_cut' },
        { frame: 15, confidence: 0.95, type: 'hard_cut' },
        { frame: 20, confidence: 0.7, type: 'hard_cut' },
        { frame: 60, confidence: 0.85, type: 'hard_cut' },
      ];

      const pruned = filterCutsByMinDuration(cuts, 24);
      expect(pruned.length).toBe(2);
      expect(pruned[0]!.frame).toBe(15); // highest confidence in the cluster 10..20
      expect(pruned[1]!.frame).toBe(60);
    });
  });

  describe('buildFfmpegSceneDetectionCommand', () => {
    it('generates frame-accurate FFmpeg scene analysis command', () => {
      const cmd = buildFfmpegSceneDetectionCommand('C:/video/clip.mp4', 0.35);
      expect(cmd).toContain('ffmpeg -i "C:/video/clip.mp4"');
      expect(cmd).toContain("select='gt(scene,0.35)'");
      expect(cmd).toContain('showinfo');
      expect(cmd).toContain('-f null -');
    });

    it('clamps threshold to valid boundaries [0.05, 0.95]', () => {
      const cmdLow = buildFfmpegSceneDetectionCommand('clip.mp4', 0.001);
      const cmdHigh = buildFfmpegSceneDetectionCommand('clip.mp4', 2.5);
      expect(cmdLow).toContain("select='gt(scene,0.05)'");
      expect(cmdHigh).toContain("select='gt(scene,0.95)'");
    });
  });
});
