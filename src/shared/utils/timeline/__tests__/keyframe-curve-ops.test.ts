import { describe, expect, it } from 'vitest';
import {
  type ClipKeyframe,
  keyframesFor,
  toFfmpegExpression,
  valueAtFrame,
} from '../keyframes';
import {
  evaluateCubicBezier1D,
  evaluateCubicBezierDerivative1D,
  generatePresetHandles,
  getKeyframeControlPoints,
  getVelocityAtFrame,
  interpolateKeyframePair,
  sampleCurvePoints,
  solveBezierTForX,
  normalizeKeyframeValue,
  denormalizeKeyframeValue,
  formatKeyframeValue,
  updateKeyframeTangent,
  insertKeyframeAtFrame,
  deleteKeyframeAtFrame,
  buildSvgKeyframePath,
  KEYFRAME_PROPERTY_CONFIGS,
} from '../keyframe-curve-ops';

describe('keyframe-curve-ops (Beta S154 Phase 6 / S32)', () => {
  describe('evaluateCubicBezier1D', () => {
    it('returns exact endpoints at t=0 and t=1', () => {
      expect(evaluateCubicBezier1D(10, 20, 80, 100, 0)).toBe(10);
      expect(evaluateCubicBezier1D(10, 20, 80, 100, 1)).toBe(100);
    });

    it('clamps t beyond bounds [0, 1]', () => {
      expect(evaluateCubicBezier1D(0, 25, 75, 100, -0.5)).toBe(0);
      expect(evaluateCubicBezier1D(0, 25, 75, 100, 1.5)).toBe(100);
    });

    it('evaluates symmetric midpoint correctly', () => {
      // Linear control points (0, 33.33, 66.66, 100) -> midpoint is 50
      const mid = evaluateCubicBezier1D(0, 100 / 3, 200 / 3, 100, 0.5);
      expect(mid).toBeCloseTo(50, 4);
    });
  });

  describe('evaluateCubicBezierDerivative1D', () => {
    it('evaluates derivatives at endpoints correctly', () => {
      // B'(0) = 3 * (P1 - P0)
      const d0 = evaluateCubicBezierDerivative1D(0, 10, 90, 100, 0);
      expect(d0).toBe(30);

      // B'(1) = 3 * (P3 - P2)
      const d1 = evaluateCubicBezierDerivative1D(0, 10, 90, 100, 1);
      expect(d1).toBe(30);
    });
  });

  describe('solveBezierTForX', () => {
    it('inverts linear control points accurately', () => {
      const x0 = 0;
      const x1 = 10;
      const x2 = 20;
      const x3 = 30;

      const tMid = solveBezierTForX(15, x0, x1, x2, x3);
      expect(tMid).toBeCloseTo(0.5, 4);

      const tQuarter = solveBezierTForX(7.5, x0, x1, x2, x3);
      expect(tQuarter).toBeCloseTo(0.25, 4);
    });

    it('returns boundary values for targets out of range', () => {
      expect(solveBezierTForX(-10, 0, 10, 20, 30)).toBe(0);
      expect(solveBezierTForX(50, 0, 10, 20, 30)).toBe(1);
    });

    it('converges reliably for ease-in curve time values', () => {
      // Ease in: x1 = 0 + 30 * 0.42 = 12.6, x2 = 30
      const t = solveBezierTForX(10, 0, 12.6, 30, 30);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      const evaluatedX = evaluateCubicBezier1D(0, 12.6, 30, 30, t);
      expect(evaluatedX).toBeCloseTo(10, 3);
    });
  });

  describe('generatePresetHandles', () => {
    it('generates symmetric tangent handles for linear', () => {
      const handles = generatePresetHandles('linear', 30, 10);
      expect(handles.handleOut.frameOffset).toBeCloseTo(10, 1);
      expect(handles.handleOut.valueOffset).toBeCloseTo(3.33, 1);
      expect(handles.handleIn.frameOffset).toBeCloseTo(-10, 1);
      expect(handles.handleIn.valueOffset).toBeCloseTo(-3.33, 1);
    });

    it('generates zero tangent handles for hold', () => {
      const handles = generatePresetHandles('hold', 30, 10);
      expect(handles.handleOut.frameOffset).toBe(0);
      expect(handles.handleOut.valueOffset).toBe(0);
      expect(handles.handleIn.frameOffset).toBe(0);
      expect(handles.handleIn.valueOffset).toBe(0);
    });

    it('generates flat ease-in and ease-out handles', () => {
      const easeIn = generatePresetHandles('ease_in', 30, 10);
      expect(easeIn.handleOut.frameOffset).toBeCloseTo(30 * 0.42, 2);
      expect(easeIn.handleOut.valueOffset).toBe(0);
      expect(easeIn.handleIn.frameOffset).toBe(0);

      const easeOut = generatePresetHandles('ease_out', 30, 10);
      expect(easeOut.handleOut.frameOffset).toBe(0);
      expect(easeOut.handleIn.frameOffset).toBeCloseTo(-30 * 0.58, 2);
      expect(easeOut.handleIn.valueOffset).toBe(0);
    });
  });

  describe('interpolateKeyframePair', () => {
    const kStart: ClipKeyframe = {
      property: 'x',
      frame: 0,
      value: 0,
      interpolation: 'linear',
    };
    const kEnd: ClipKeyframe = {
      property: 'x',
      frame: 100,
      value: 100,
      interpolation: 'linear',
    };

    it('handles boundary frames', () => {
      expect(interpolateKeyframePair(kStart, kEnd, -10)).toBe(0);
      expect(interpolateKeyframePair(kStart, kEnd, 0)).toBe(0);
      expect(interpolateKeyframePair(kStart, kEnd, 100)).toBe(100);
      expect(interpolateKeyframePair(kStart, kEnd, 120)).toBe(100);
    });

    it('performs linear interpolation', () => {
      expect(interpolateKeyframePair(kStart, kEnd, 50)).toBe(50);
      expect(interpolateKeyframePair(kStart, kEnd, 25)).toBe(25);
    });

    it('performs hold interpolation', () => {
      const kHold: ClipKeyframe = { ...kStart, interpolation: 'hold' };
      expect(interpolateKeyframePair(kHold, kEnd, 20)).toBe(0);
      expect(interpolateKeyframePair(kHold, kEnd, 99)).toBe(0);
      expect(interpolateKeyframePair(kHold, kEnd, 100)).toBe(100);
    });

    it('performs ease-in interpolation (starts slow)', () => {
      const kEaseIn: ClipKeyframe = { ...kStart, interpolation: 'ease_in' };
      // At 25% of the time, an ease-in curve has progressed significantly less than 25% in value
      const val25 = interpolateKeyframePair(kEaseIn, kEnd, 25);
      expect(val25).toBeLessThan(20);
      expect(val25).toBeGreaterThan(0);
    });

    it('performs ease-out interpolation (ends slow)', () => {
      const kEaseOut: ClipKeyframe = { ...kStart, interpolation: 'ease_out' };
      // At 75% of the time, an ease-out curve has progressed significantly more than 75% in value
      const val75 = interpolateKeyframePair(kEaseOut, kEnd, 75);
      expect(val75).toBeGreaterThan(80);
      expect(val75).toBeLessThan(100);
    });

    it('performs bezier S-curve interpolation', () => {
      const kBezier: ClipKeyframe = { ...kStart, interpolation: 'bezier' };
      const val50 = interpolateKeyframePair(kBezier, kEnd, 50);
      expect(val50).toBeCloseTo(50, 1);

      // S-curve is below linear before 50%, above linear after 50%
      const val25 = interpolateKeyframePair(kBezier, kEnd, 25);
      const val75 = interpolateKeyframePair(kBezier, kEnd, 75);
      expect(val25).toBeLessThan(25);
      expect(val75).toBeGreaterThan(75);
    });

    it('respects custom tangent handles on bezier keyframe', () => {
      const kCustom: ClipKeyframe = {
        ...kStart,
        interpolation: 'bezier',
        handleOut: { frameOffset: 50, valueOffset: 50 }, // strong overshoot handle
      };
      const val25 = interpolateKeyframePair(kCustom, kEnd, 25);
      expect(val25).toBeGreaterThan(25);
    });
  });

  describe('getVelocityAtFrame', () => {
    it('returns constant velocity for linear interpolation', () => {
      const k1: ClipKeyframe = { property: 'x', frame: 0, value: 0, interpolation: 'linear' };
      const k2: ClipKeyframe = { property: 'x', frame: 30, value: 30, interpolation: 'linear' };
      // 30 units over 30 frames at 30 fps = 30 units / second
      expect(getVelocityAtFrame(k1, k2, 10, 30)).toBeCloseTo(30, 2);
      expect(getVelocityAtFrame(k1, k2, 20, 30)).toBeCloseTo(30, 2);
    });

    it('returns zero velocity for hold interpolation', () => {
      const k1: ClipKeyframe = { property: 'x', frame: 0, value: 10, interpolation: 'hold' };
      const k2: ClipKeyframe = { property: 'x', frame: 30, value: 50, interpolation: 'linear' };
      expect(getVelocityAtFrame(k1, k2, 15, 30)).toBe(0);
    });

    it('shows acceleration on ease-in curve', () => {
      const k1: ClipKeyframe = { property: 'x', frame: 0, value: 0, interpolation: 'ease_in' };
      const k2: ClipKeyframe = { property: 'x', frame: 60, value: 100, interpolation: 'linear' };
      const velEarly = getVelocityAtFrame(k1, k2, 10, 30);
      const velLate = getVelocityAtFrame(k1, k2, 50, 30);
      expect(velLate).toBeGreaterThan(velEarly);
    });
  });

  describe('sampleCurvePoints', () => {
    it('samples dense points across multiple keyframes', () => {
      const keys: ClipKeyframe[] = [
        { property: 'volume', frame: 0, value: 0, interpolation: 'ease_in' },
        { property: 'volume', frame: 30, value: -12, interpolation: 'bezier' },
        { property: 'volume', frame: 60, value: 0, interpolation: 'linear' },
      ];

      const points = sampleCurvePoints(keys, 'volume', 0, 60, 5, 30);
      expect(points.length).toBe(13); // 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60
      expect(points[0].value).toBe(0);
      expect(points[6].frame).toBe(30);
      expect(points[6].value).toBeCloseTo(-12, 1);
      expect(points[12].value).toBeCloseTo(0, 1);
    });

    it('handles empty keyframes gracefully', () => {
      const points = sampleCurvePoints([], 'volume', 0, 30);
      expect(points).toEqual([]);
    });
  });

  describe('valueAtFrame integration with bezier/ease modes', () => {
    const keys: ClipKeyframe[] = [
      { property: 'x', frame: 10, value: 0.2, interpolation: 'ease_in' },
      { property: 'x', frame: 50, value: 0.8, interpolation: 'hold' },
      { property: 'x', frame: 80, value: 1.0, interpolation: 'linear' },
    ];

    it('evaluates before first keyframe with first key value', () => {
      expect(valueAtFrame(keys, 'x', 5, 0.5)).toBe(0.2);
    });

    it('evaluates after last keyframe with last key value', () => {
      expect(valueAtFrame(keys, 'x', 100, 0.5)).toBe(1.0);
    });

    it('evaluates ease_in between keys 0 and 1', () => {
      const mid = valueAtFrame(keys, 'x', 30, 0.5);
      expect(mid).toBeGreaterThan(0.2);
      expect(mid).toBeLessThan(0.8);
      // Ease in should be below linear midpoint (0.5)
      expect(mid).toBeLessThan(0.5);
    });

    it('evaluates hold between keys 1 and 2', () => {
      expect(valueAtFrame(keys, 'x', 60, 0.5)).toBe(0.8);
      expect(valueAtFrame(keys, 'x', 79, 0.5)).toBe(0.8);
    });
  });

  describe('toFfmpegExpression with bezier and ease interpolations', () => {
    it('produces valid piecewise expression for bezier curves', () => {
      const keys: ClipKeyframe[] = [
        { property: 'x', frame: 0, value: 0.1, interpolation: 'bezier' },
        { property: 'x', frame: 30, value: 0.9, interpolation: 'linear' },
      ];

      const expr = toFfmpegExpression(keys, 'x', { fps: 30, fallback: 0.5 });
      expect(expr).toContain('if(lt(t,');
      // Subdivided steps should be present
      expect(expr).toContain('0.100000');
      expect(expr).toContain('0.900000');
    });
  });

  describe('Milestone S67: Value normalization, formatting, and tangent manipulation', () => {
    it('normalizes and denormalizes property values correctly', () => {
      // Volume: min -40, max 12
      const norm0dB = normalizeKeyframeValue('volume', 0);
      expect(norm0dB).toBeCloseTo((0 - -40) / 52, 4);
      expect(denormalizeKeyframeValue('volume', norm0dB)).toBe(0);

      // Opacity: min 0, max 1
      expect(normalizeKeyframeValue('opacity', 0.5)).toBe(0.5);
      expect(denormalizeKeyframeValue('opacity', 0.5)).toBe(0.5);

      // Clamping out of range
      expect(normalizeKeyframeValue('opacity', -0.5)).toBe(0);
      expect(normalizeKeyframeValue('opacity', 1.5)).toBe(1);
    });

    it('formats values accurately with proper units', () => {
      expect(formatKeyframeValue('volume', 0)).toBe('+0.0 dB');
      expect(formatKeyframeValue('volume', -6.5)).toBe('-6.5 dB');
      expect(formatKeyframeValue('scale', 1.5)).toBe('1.50x');
      expect(formatKeyframeValue('rotation', 45)).toBe('45°');
      expect(formatKeyframeValue('opacity', 0.75)).toBe('75%');
    });

    it('updates tangent handles symmetrically', () => {
      const key: ClipKeyframe = { property: 'volume', frame: 30, value: 0, interpolation: 'linear' };
      const updatedOut = updateKeyframeTangent(key, 'out', 12, 3, true);

      expect(updatedOut.interpolation).toBe('bezier');
      expect(updatedOut.handleOut).toEqual({ frameOffset: 12, valueOffset: 3 });
      expect(updatedOut.handleIn).toEqual({ frameOffset: -12, valueOffset: -3 });

      const updatedIn = updateKeyframeTangent(key, 'in', -8, 2, true);
      expect(updatedIn.handleIn).toEqual({ frameOffset: -8, valueOffset: 2 });
      expect(updatedIn.handleOut).toEqual({ frameOffset: 8, valueOffset: -2 });
    });

    it('inserts keyframe with curve value continuity', () => {
      const existing: ClipKeyframe[] = [
        { property: 'volume', frame: 0, value: 0, interpolation: 'linear' },
        { property: 'volume', frame: 100, value: -20, interpolation: 'linear' },
      ];

      const updated = insertKeyframeAtFrame(existing, 'volume', 50, 0);
      expect(updated.length).toBe(3);
      expect(updated[1].frame).toBe(50);
      expect(updated[1].value).toBeCloseTo(-10, 1);
      expect(updated[1].interpolation).toBe('bezier');

      // Update existing frame
      const replaced = insertKeyframeAtFrame(updated, 'volume', 50, 0, 'linear');
      expect(replaced.length).toBe(3);
      expect(replaced[1].interpolation).toBe('linear');
    });

    it('deletes keyframe at specific frame and property', () => {
      const keys: ClipKeyframe[] = [
        { property: 'volume', frame: 0, value: 0, interpolation: 'linear' },
        { property: 'volume', frame: 30, value: -6, interpolation: 'linear' },
        { property: 'opacity', frame: 30, value: 0.5, interpolation: 'linear' },
      ];

      const afterDelete = deleteKeyframeAtFrame(keys, 'volume', 30);
      expect(afterDelete.length).toBe(2);
      expect(afterDelete.some((k) => k.property === 'volume' && k.frame === 30)).toBe(false);
      expect(afterDelete.some((k) => k.property === 'opacity' && k.frame === 30)).toBe(true);
    });

    it('builds SVG path d attribute for keyframes', () => {
      const keys: ClipKeyframe[] = [
        { property: 'opacity', frame: 0, value: 0, interpolation: 'linear' },
        { property: 'opacity', frame: 50, value: 1, interpolation: 'hold' },
        { property: 'opacity', frame: 100, value: 0.5, interpolation: 'linear' },
      ];

      const path = buildSvgKeyframePath(keys, 'opacity', 100, 200, 60, 1, 6);
      expect(path).toContain('M 0');
      expect(path).toContain('L 100.0'); // midpoint at frame 50 of 100 -> 100px
      expect(path).toContain('L 200.0'); // end
    });

    it('builds flat SVG path fallback when no keyframes exist', () => {
      const path = buildSvgKeyframePath([], 'volume', 100, 200, 60, 0);
      expect(path).toContain('M 0');
      expect(path).toContain('L 200.0');
      expect(path).not.toContain('C');
    });
  });
});

