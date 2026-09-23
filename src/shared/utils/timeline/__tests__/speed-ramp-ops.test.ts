import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  applyClipSpeedRamp,
  buildFfmpegSpeedRampFilter,
  calculateRampAverageSpeed,
  calculateRampedDuration,
  calculateRampSourceFrame,
  evaluateSpeedAtNormalizedTime,
  integrateSpeedRamp,
  normalizeSpeedRampPoints,
  sampleSpeedRampSvgPoints,
  splitSpeedSegmentAtNormalizedTime,
  updateSpeedPointVelocity,
  updateSpeedPointEasing,
  insertFreezeFrameRamp,
  buildSvgSpeedRampPath,
  SPEED_RAMP_PRESETS,
  type SpeedRampSettings,
} from '../speed-ramp-ops';

function makeTrack(id: string, magnetic = true): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    kind: 'video',
    name: id,
    orderIndex: 0,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
    magnetic,
  };
}

function makeClip(id: string, trackId: string, orderIndex: number, durationFrames: number, extra?: Partial<SequenceClip>): SequenceClip {
  return {
    id,
    sequenceId: 'seq-1',
    trackId,
    orderIndex,
    durationFrames,
    sourceInFrames: 0,
    sourceOutFrames: null,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: '/media/action.mp4',
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip',
    overrides: [],
    keyframes: [],
    ...extra,
  };
}

describe('speed-ramp-ops (Variable Speed Ramping & Bézier Velocity Curves)', () => {
  describe('normalizeSpeedRampPoints', () => {
    it('provides default endpoints when given empty points', () => {
      const normalized = normalizeSpeedRampPoints([]);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].timePct).toBe(0.0);
      expect(normalized[1].timePct).toBe(1.0);
      expect(normalized[0].speed).toBe(1.0);
    });

    it('sorts points chronologically by timePct and clamps values', () => {
      const unsorted = [
        { id: 'p2', timePct: 0.8, speed: 15.0 }, // speed should clamp to 10
        { id: 'p1', timePct: 0.3, speed: 0.05 }, // speed should clamp to 0.1
        { id: 'p0', timePct: -0.1, speed: 2.0 }, // timePct should clamp to 0
      ];
      const normalized = normalizeSpeedRampPoints(unsorted);
      expect(normalized[0].timePct).toBe(0.0);
      expect(normalized[0].speed).toBe(2.0);
      expect(normalized[1].timePct).toBe(0.3);
      expect(normalized[1].speed).toBe(0.1);
      expect(normalized[2].timePct).toBe(0.8);
      expect(normalized[2].speed).toBe(10.0);
      // Padded end at 1.0
      expect(normalized[normalized.length - 1].timePct).toBe(1.0);
    });
  });

  describe('SPEED_RAMP_PRESETS', () => {
    it('contains all required studio retime presets', () => {
      const keys = ['constant', 'hero_ramp', 'bullet_time', 'montage_flash', 'slow_in_fast_out', 'fast_in_slow_out'] as const;
      for (const key of keys) {
        const preset = SPEED_RAMP_PRESETS[key];
        expect(preset).toBeDefined();
        expect(preset.name).toBeTruthy();
        expect(preset.points.length).toBeGreaterThanOrEqual(2);
        expect(preset.points[0].timePct).toBe(0.0);
        expect(preset.points[preset.points.length - 1].timePct).toBe(1.0);
        for (const pt of preset.points) {
          expect(pt.speed).toBeGreaterThanOrEqual(0.1);
          expect(pt.speed).toBeLessThanOrEqual(10.0);
        }
      }
    });
  });

  describe('evaluateSpeedAtNormalizedTime', () => {
    it('returns 1.0 when settings are undefined or disabled', () => {
      expect(evaluateSpeedAtNormalizedTime(undefined, 0.5)).toBe(1.0);
      expect(evaluateSpeedAtNormalizedTime({ enabled: false, points: [] }, 0.5)).toBe(1.0);
    });

    it('returns constant speed for constant preset across timeline', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.constant.points,
      };
      expect(evaluateSpeedAtNormalizedTime(settings, 0.0)).toBe(1.0);
      expect(evaluateSpeedAtNormalizedTime(settings, 0.5)).toBe(1.0);
      expect(evaluateSpeedAtNormalizedTime(settings, 1.0)).toBe(1.0);
    });

    it('interpolates smoothly with Bézier handles in Hero Ramp', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.hero_ramp.points,
      };
      // Start is 2.5x
      expect(evaluateSpeedAtNormalizedTime(settings, 0.0)).toBeCloseTo(2.5, 1);
      // Mid-section (around 0.5) is slow-mo 0.3x
      expect(evaluateSpeedAtNormalizedTime(settings, 0.5)).toBeCloseTo(0.3, 1);
      // End is 2.0x
      expect(evaluateSpeedAtNormalizedTime(settings, 1.0)).toBeCloseTo(2.0, 1);
    });
  });

  describe('integrateSpeedRamp', () => {
    it('produces monotonically non-decreasing cumulative area', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.bullet_time.points,
      };
      const lut = integrateSpeedRamp(settings, 50);
      expect(lut.sampleTimes).toHaveLength(51);
      expect(lut.cumulativeArea).toHaveLength(51);
      expect(lut.cumulativeArea[0]).toBe(0);
      expect(lut.cumulativeArea[50]).toBeCloseTo(lut.totalArea, 4);

      for (let i = 1; i < lut.cumulativeArea.length; i++) {
        expect(lut.cumulativeArea[i]).toBeGreaterThanOrEqual(lut.cumulativeArea[i - 1]);
      }
    });

    it('computes total area ~1.0 for constant 1.0x ramp', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.constant.points,
      };
      const lut = integrateSpeedRamp(settings, 100);
      expect(lut.totalArea).toBeCloseTo(1.0, 2);
      expect(lut.averageSpeed).toBeCloseTo(1.0, 2);
    });
  });

  describe('calculateRampSourceFrame', () => {
    it('returns unmodified frame when speed ramp is disabled', () => {
      expect(calculateRampSourceFrame(undefined, 30, 60)).toBe(30);
      expect(calculateRampSourceFrame({ enabled: false, points: [] }, 45, 60)).toBe(45);
    });

    it('maps frame progress correctly without ripple', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 2.0 },
          { id: 'p1', timePct: 1.0, speed: 2.0 },
        ],
      };
      // Constant 2.0x speed over 100 frames -> 200 source frames consumed
      const endSourceFrame = calculateRampSourceFrame(settings, 100, 100);
      expect(endSourceFrame).toBeCloseTo(200, 1);

      const midSourceFrame = calculateRampSourceFrame(settings, 50, 100);
      expect(midSourceFrame).toBeCloseTo(100, 1);
    });

    it('maps exactly to sourceDurationFrames when rippleSequence is true', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.hero_ramp.points,
        rippleSequence: true,
      };
      const sourceDuration = 300;
      const timelineDuration = 200;

      // Start is frame 0
      expect(calculateRampSourceFrame(settings, 0, timelineDuration, sourceDuration)).toBe(0);
      // End frame exactly reaches sourceDuration
      const endFrame = calculateRampSourceFrame(settings, timelineDuration, timelineDuration, sourceDuration);
      expect(endFrame).toBeCloseTo(sourceDuration, 1);
    });
  });

  describe('calculateRampAverageSpeed and calculateRampedDuration', () => {
    it('calculates expected average speed and new duration for slow and fast ramps', () => {
      const fastSettings: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 2.0 },
          { id: 'p1', timePct: 1.0, speed: 2.0 },
        ],
      };
      expect(calculateRampAverageSpeed(fastSettings)).toBeCloseTo(2.0, 2);
      // 100 frames at 2.0x -> 50 frames
      expect(calculateRampedDuration(100, fastSettings)).toBe(50);

      const slowSettings: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 0.5 },
          { id: 'p1', timePct: 1.0, speed: 0.5 },
        ],
      };
      expect(calculateRampAverageSpeed(slowSettings)).toBeCloseTo(0.5, 2);
      // 100 frames at 0.5x -> 200 frames
      expect(calculateRampedDuration(100, slowSettings)).toBe(200);
    });
  });

  describe('sampleSpeedRampSvgPoints', () => {
    it('generates SVG coordinate points and valid path string', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.hero_ramp.points,
      };
      const { points, pathData } = sampleSpeedRampSvgPoints(settings, 400, 160, 40, 0.1, 5.0);

      expect(points).toHaveLength(41);
      expect(points[0].x).toBe(0);
      expect(points[40].x).toBe(400);
      expect(pathData.startsWith('M 0,')).toBe(true);
      expect(pathData).toContain(' L ');
    });
  });

  describe('buildFfmpegSpeedRampFilter', () => {
    it('returns empty string if ramp is disabled', () => {
      expect(buildFfmpegSpeedRampFilter(undefined, 100, 30)).toBe('');
      expect(buildFfmpegSpeedRampFilter({ enabled: false, points: [] }, 100, 30)).toBe('');
    });

    it('generates accurate setpts expression for active ramp', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 2.0 },
          { id: 'p1', timePct: 1.0, speed: 2.0 },
        ],
      };
      const filter = buildFfmpegSpeedRampFilter(settings, 100, 30);
      // 2x speed means 0.5*PTS
      expect(filter).toBe('setpts=0.5*PTS');
    });
  });

  describe('applyClipSpeedRamp', () => {
    it('attaches speedRamp to clip effects without rippling duration when rippleSequence is false', () => {
      const track = makeTrack('v1', true);
      const clip = makeClip('c1', 'v1', 0, 120);
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.hero_ramp.points,
        rippleSequence: false,
      };

      const result = applyClipSpeedRamp([clip], [track], 'c1', settings);
      expect(result[0].durationFrames).toBe(120);
      expect(result[0].effects?.speedRamp).toEqual(settings);
    });

    it('recalculates duration and shifts downstream clips on a free track when rippling', () => {
      const track = makeTrack('v2', false); // Free track
      const clip1 = makeClip('c1', 'v2', 0, 100, { startFrames: 0 });
      const clip2 = makeClip('c2', 'v2', 1, 60, { startFrames: 100 });

      // Ramp with 2.0x average speed -> new duration 50 (delta = -50)
      const settings: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 2.0 },
          { id: 'p1', timePct: 1.0, speed: 2.0 },
        ],
        rippleSequence: true,
      };

      const result = applyClipSpeedRamp([clip1, clip2], [track], 'c1', settings);
      const updatedClip1 = result.find((c) => c.id === 'c1')!;
      const updatedClip2 = result.find((c) => c.id === 'c2')!;

      expect(updatedClip1.durationFrames).toBe(50);
      expect(updatedClip1.overrides).toContain('durationFrames');
      expect(updatedClip2.startFrames).toBe(50); // Shifted by -50
    });
  });

  describe('Interactive Speed Curve Manipulation & SVG Generation', () => {
    it('splits speed segment and inserts new inflection keyframe pin', () => {
      const initial: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 1.0 },
          { id: 'p1', timePct: 1.0, speed: 1.0 },
        ],
      };

      const result = splitSpeedSegmentAtNormalizedTime(initial, 0.4, 3.0);
      expect(result.points).toHaveLength(3);
      const inserted = result.points.find((p) => Math.abs(p.timePct - 0.4) < 0.01);
      expect(inserted).toBeDefined();
      expect(inserted?.speed).toBe(3.0);
      expect(inserted?.handleIn).toBeDefined();
      expect(inserted?.handleOut).toBeDefined();
    });

    it('updates keyframe velocity clamped between 0.1x and 10x', () => {
      const initial: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 1.0 },
          { id: 'p1', timePct: 1.0, speed: 1.0 },
        ],
      };

      const updated = updateSpeedPointVelocity(initial, 'p0', 5.5);
      expect(updated.points.find((p) => p.id === 'p0')?.speed).toBe(5.5);

      const clamped = updateSpeedPointVelocity(initial, 'p0', 25.0);
      expect(clamped.points.find((p) => p.id === 'p0')?.speed).toBe(10.0);
    });

    it('updates Bézier ease handles for smooth acceleration transitions', () => {
      const initial: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 1.0 },
          { id: 'p1', timePct: 0.5, speed: 2.0 },
          { id: 'p2', timePct: 1.0, speed: 1.0 },
        ],
      };

      const eased = updateSpeedPointEasing(initial, 'p1', 0.15);
      const p1 = eased.points.find((p) => p.id === 'p1')!;
      expect(p1.handleIn?.dt).toBe(-0.15);
      expect(p1.handleOut?.dt).toBe(0.15);
    });

    it('inserts freeze frame hold plateau into speed curve', () => {
      const initial: SpeedRampSettings = {
        enabled: true,
        points: [
          { id: 'p0', timePct: 0.0, speed: 1.0 },
          { id: 'p1', timePct: 1.0, speed: 1.0 },
        ],
      };

      const frozen = insertFreezeFrameRamp(initial, 0.4, 0.2);
      expect(frozen.points.length).toBeGreaterThanOrEqual(4);
      const freezePoints = frozen.points.filter((p) => p.speed <= 0.15);
      expect(freezePoints.length).toBeGreaterThanOrEqual(2);
    });

    it('generates valid SVG path coordinates for continuous curve rendering', () => {
      const settings: SpeedRampSettings = {
        enabled: true,
        points: SPEED_RAMP_PRESETS.hero_ramp.points,
      };

      const svg = buildSvgSpeedRampPath(settings, 400, 100);
      expect(svg.pathD).toMatch(/^M 0/);
      expect(svg.fillPathD).toContain('L 400 100');
      expect(svg.points.length).toBeGreaterThanOrEqual(4);
      for (const pt of svg.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(400);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(100);
      }
    });
  });
});

