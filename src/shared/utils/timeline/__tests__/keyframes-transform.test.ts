import { describe, expect, it } from 'vitest';
import {
  type ClipKeyframe,
  KEYFRAME_PROPERTIES,
  keyframesFor,
  shiftKeyframes,
  splitKeyframes,
  toFfmpegExpression,
  valueAtFrame,
} from '../keyframes';
import { generatePresetHandles } from '../keyframe-curve-ops';
import { sequenceClipSchema } from '../../../ipc/ipc-schemas';

describe('keyframes-transform (Step S34: Transform Animation Keyframing)', () => {
  it('registers all required transform properties in KEYFRAME_PROPERTIES', () => {
    expect(KEYFRAME_PROPERTIES).toContain('x');
    expect(KEYFRAME_PROPERTIES).toContain('y');
    expect(KEYFRAME_PROPERTIES).toContain('volume');
    expect(KEYFRAME_PROPERTIES).toContain('scale');
    expect(KEYFRAME_PROPERTIES).toContain('opacity');
    expect(KEYFRAME_PROPERTIES).toContain('rotation');
  });

  describe('Scale Keyframe Evaluation', () => {
    it('returns fallback scale when no keyframes are defined', () => {
      const result = valueAtFrame([], 'scale', 15, 1.0);
      expect(result).toBe(1.0);
    });

    it('returns boundary values before first and after last keyframe', () => {
      const keys: ClipKeyframe[] = [
        { property: 'scale', frame: 10, value: 0.8, interpolation: 'linear' },
        { property: 'scale', frame: 30, value: 1.5, interpolation: 'linear' },
      ];

      expect(valueAtFrame(keys, 'scale', 5, 1.0)).toBe(0.8);
      expect(valueAtFrame(keys, 'scale', 10, 1.0)).toBe(0.8);
      expect(valueAtFrame(keys, 'scale', 30, 1.0)).toBe(1.5);
      expect(valueAtFrame(keys, 'scale', 50, 1.0)).toBe(1.5);
    });

    it('linearly interpolates scale across frames', () => {
      const keys: ClipKeyframe[] = [
        { property: 'scale', frame: 0, value: 1.0, interpolation: 'linear' },
        { property: 'scale', frame: 20, value: 2.0, interpolation: 'linear' },
      ];

      expect(valueAtFrame(keys, 'scale', 10, 1.0)).toBeCloseTo(1.5, 4);
      expect(valueAtFrame(keys, 'scale', 5, 1.0)).toBeCloseTo(1.25, 4);
    });

    it('evaluates cubic Bézier curve for zoom-in with ease_in_out handles', () => {
      const handles = generatePresetHandles('bezier', 30, 1.0);
      const keys: ClipKeyframe[] = [
        {
          property: 'scale',
          frame: 0,
          value: 1.0,
          interpolation: 'bezier',
          handleOut: handles.handleOut,
        },
        {
          property: 'scale',
          frame: 30,
          value: 2.0,
          interpolation: 'bezier',
          handleIn: handles.handleIn,
        },
      ];

      // Bézier curve starts slower than linear at t=0.2 (frame 6)
      const bezierVal = valueAtFrame(keys, 'scale', 6, 1.0);
      const linearVal = 1.0 + (6 / 30) * 1.0; // 1.20
      expect(bezierVal).toBeLessThan(linearVal);

      // Midpoint at frame 15 should be near 1.5 for symmetric S-curve
      expect(valueAtFrame(keys, 'scale', 15, 1.0)).toBeCloseTo(1.5, 2);
    });
  });

  describe('Opacity Keyframe Evaluation', () => {
    it('returns fallback opacity when no keyframes are defined', () => {
      expect(valueAtFrame(undefined, 'opacity', 0, 0.75)).toBe(0.75);
    });

    it('smoothly fades out from 1.0 to 0.0 with ease_out interpolation', () => {
      const handles = generatePresetHandles('ease_out', 24, -1.0);
      const keys: ClipKeyframe[] = [
        {
          property: 'opacity',
          frame: 0,
          value: 1.0,
          interpolation: 'ease_out',
          handleOut: handles.handleOut,
        },
        {
          property: 'opacity',
          frame: 24,
          value: 0.0,
          interpolation: 'linear',
          handleIn: handles.handleIn,
        },
      ];

      expect(valueAtFrame(keys, 'opacity', 0, 1.0)).toBe(1.0);
      expect(valueAtFrame(keys, 'opacity', 24, 1.0)).toBe(0.0);

      // Ease out decelerates into the destination, dropping faster initially
      const midOpacity = valueAtFrame(keys, 'opacity', 12, 1.0);
      expect(midOpacity).toBeLessThan(0.5);
    });

    it('respects hold interpolation for stepped cuts in opacity', () => {
      const keys: ClipKeyframe[] = [
        { property: 'opacity', frame: 0, value: 1.0, interpolation: 'hold' },
        { property: 'opacity', frame: 15, value: 0.0, interpolation: 'hold' },
        { property: 'opacity', frame: 30, value: 0.5, interpolation: 'linear' },
      ];

      expect(valueAtFrame(keys, 'opacity', 5, 1.0)).toBe(1.0);
      expect(valueAtFrame(keys, 'opacity', 14, 1.0)).toBe(1.0);
      expect(valueAtFrame(keys, 'opacity', 15, 1.0)).toBe(0.0);
      expect(valueAtFrame(keys, 'opacity', 29, 1.0)).toBe(0.0);
      expect(valueAtFrame(keys, 'opacity', 30, 1.0)).toBe(0.5);
    });
  });

  describe('Rotation Keyframe Evaluation', () => {
    it('returns fallback rotation when no keyframes are defined', () => {
      expect(valueAtFrame([], 'rotation', 10, 45)).toBe(45);
    });

    it('interpolates rotation across negative and positive degree values', () => {
      const keys: ClipKeyframe[] = [
        { property: 'rotation', frame: 0, value: -90, interpolation: 'linear' },
        { property: 'rotation', frame: 30, value: 90, interpolation: 'linear' },
      ];

      expect(valueAtFrame(keys, 'rotation', 0, 0)).toBe(-90);
      expect(valueAtFrame(keys, 'rotation', 15, 0)).toBeCloseTo(0, 4);
      expect(valueAtFrame(keys, 'rotation', 30, 0)).toBe(90);
    });

    it('handles multi-revolution rotation curves (>360 degrees)', () => {
      const keys: ClipKeyframe[] = [
        { property: 'rotation', frame: 0, value: 0, interpolation: 'linear' },
        { property: 'rotation', frame: 60, value: 720, interpolation: 'linear' },
      ];

      expect(valueAtFrame(keys, 'rotation', 30, 0)).toBeCloseTo(360, 4);
      expect(valueAtFrame(keys, 'rotation', 60, 0)).toBe(720);
    });
  });

  describe('FFmpeg Expression Ladder Generation', () => {
    it('generates valid piecewise ladder expression for scale', () => {
      const keys: ClipKeyframe[] = [
        { property: 'scale', frame: 0, value: 1.0, interpolation: 'linear' },
        { property: 'scale', frame: 30, value: 1.5, interpolation: 'linear' },
      ];

      const expr = toFfmpegExpression(keys, 'scale', { fps: 30, fallback: 1.0 });
      expect(expr).toContain('if(lt(t,');
      expect(expr).toContain('1.000000');
      expect(expr).toContain('1.500000');
    });

    it('generates expression for rotation with time offset', () => {
      const keys: ClipKeyframe[] = [
        { property: 'rotation', frame: 0, value: 0, interpolation: 'linear' },
        { property: 'rotation', frame: 60, value: 180, interpolation: 'linear' },
      ];

      const expr = toFfmpegExpression(keys, 'rotation', {
        fps: 30,
        fallback: 0,
        offsetSeconds: 2.0,
      });

      expect(expr).toContain('2.0000'); // offset 2.0s
      expect(expr).toContain('4.0000'); // 60 frames / 30fps + 2.0s = 4.0s
    });
  });

  describe('Timeline Clip Operations (shiftKeyframes and splitKeyframes)', () => {
    it('shifts transform keyframes on head trim and preserves handles', () => {
      const handles = generatePresetHandles('bezier', 20, 0.5);
      const keys: ClipKeyframe[] = [
        { property: 'scale', frame: 5, value: 1.0, interpolation: 'linear' },
        {
          property: 'scale',
          frame: 25,
          value: 1.5,
          interpolation: 'bezier',
          handleIn: handles.handleIn,
          handleOut: handles.handleOut,
        },
        { property: 'rotation', frame: 40, value: 45, interpolation: 'linear' },
      ];

      // Trim 10 frames from head
      const shifted = shiftKeyframes(keys, 10);
      expect(shifted).toBeDefined();
      expect(shifted?.length).toBe(2); // Frame 5 drops because 5 - 10 < 0
      expect(shifted?.[0].frame).toBe(15); // 25 - 10
      expect(shifted?.[0].property).toBe('scale');
      expect(shifted?.[0].handleIn).toEqual(handles.handleIn);
      expect(shifted?.[1].frame).toBe(30); // 40 - 10
      expect(shifted?.[1].property).toBe('rotation');
    });

    it('splits transform keyframes cleanly across cut boundary', () => {
      const keys: ClipKeyframe[] = [
        { property: 'opacity', frame: 10, value: 1.0, interpolation: 'linear' },
        { property: 'opacity', frame: 25, value: 0.5, interpolation: 'linear' },
        { property: 'scale', frame: 30, value: 1.2, interpolation: 'linear' },
        { property: 'scale', frame: 50, value: 1.8, interpolation: 'linear' },
      ];

      // Split at frame 25
      const { first, second } = splitKeyframes(keys, 25);
      expect(first?.length).toBe(1); // frame 10
      expect(first?.[0].frame).toBe(10);
      expect(second?.length).toBe(3); // frame 25, 30, 50 rebased
      expect(second?.[0].frame).toBe(0); // 25 - 25
      expect(second?.[1].frame).toBe(5); // 30 - 25
      expect(second?.[2].frame).toBe(25); // 50 - 25
    });
  });

  describe('IPC Schema Validation for Transform Keyframes', () => {
    it('validates a clip with scale, opacity, and rotation keyframes including handles', () => {
      const clipPayload = {
        id: 'clip-1',
        sequenceId: 'test-seq-1',
        trackId: 'test-track-1',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'Overlay Graphic',
        filePath: '/test/overlay.mp4',
        durationFrames: 120,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        keyframes: [
          {
            property: 'scale',
            frame: 0,
            value: 1.0,
            interpolation: 'linear',
          },
          {
            property: 'scale',
            frame: 60,
            value: 2.2,
            interpolation: 'bezier',
            handleIn: { frameOffset: -10, valueOffset: -0.2 },
            handleOut: { frameOffset: 10, valueOffset: 0.2 },
          },
          {
            property: 'opacity',
            frame: 0,
            value: 1.0,
            interpolation: 'linear',
          },
          {
            property: 'opacity',
            frame: 60,
            value: 0.2,
            interpolation: 'linear',
          },
          {
            property: 'rotation',
            frame: 0,
            value: -45,
            interpolation: 'linear',
          },
          {
            property: 'rotation',
            frame: 60,
            value: 180,
            interpolation: 'bezier',
          },
        ],
      };

      const parsed = sequenceClipSchema.safeParse(clipPayload);
      expect(parsed.success).toBe(true);
    });

    it('rejects an unrecognised keyframe property', () => {
      const clipPayload = {
        id: 'clip-bad',
        sequenceId: 'test-seq-1',
        trackId: 'test-track-1',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'Bad Clip',
        filePath: '/test/bad.mp4',
        durationFrames: 60,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        keyframes: [
          {
            property: 'invalid_transform_prop',
            frame: 0,
            value: 1.0,
            interpolation: 'linear',
          },
        ],
      };

      const parsed = sequenceClipSchema.safeParse(clipPayload);
      expect(parsed.success).toBe(false);
    });
  });
});
