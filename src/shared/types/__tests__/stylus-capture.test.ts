import { describe, expect, it } from 'vitest';

import {
  calculateStrokeVelocity,
  DEFAULT_TOOL_COLORS,
  DEFAULT_TOOL_SIZES,
  packageRecordingToWhiteboardClip,
  smoothStrokePoints,
  STYLUS_NIB_TOOLS,
  type LiveRecordingSession,
  type RecordedPointerPoint,
  type RecordedStroke,
} from '../stylus-capture';

describe('Stylus Capture Engine & Whiteboard Automation (Milestone S160)', () => {
  it('defines standard stylus nib tools with default colors and sizes', () => {
    expect(STYLUS_NIB_TOOLS).toEqual(['pen', 'marker', 'pencil', 'chalk', 'eraser']);

    for (const tool of STYLUS_NIB_TOOLS) {
      expect(DEFAULT_TOOL_COLORS[tool]).toBeDefined();
      expect(DEFAULT_TOOL_SIZES[tool]).toBeGreaterThan(0);
    }
  });

  describe('calculateStrokeVelocity', () => {
    it('calculates physical drawing velocity in pixels per second', () => {
      const p1: RecordedPointerPoint = {
        x: 0.1,
        y: 0.1,
        pressure: 0.5,
        timestamp: 1000,
        timeOffsetMs: 0,
        frame: 0,
      };

      const p2: RecordedPointerPoint = {
        x: 0.2, // 0.1 * 1920 = 192 px
        y: 0.1,
        pressure: 0.5,
        timestamp: 1100, // 0.1 sec
        timeOffsetMs: 100,
        frame: 3,
      };

      const vel = calculateStrokeVelocity(p1, p2, 1920, 1080);
      // 192 px in 0.1s => 1920 px/sec
      expect(vel).toBe(1920);
    });

    it('clamps minimum time delta to prevent division by zero', () => {
      const p1: RecordedPointerPoint = { x: 0.1, y: 0.1, pressure: 0.5, timestamp: 1000, timeOffsetMs: 0, frame: 0 };
      const p2: RecordedPointerPoint = { x: 0.1, y: 0.1, pressure: 0.5, timestamp: 1000, timeOffsetMs: 0, frame: 0 };

      const vel = calculateStrokeVelocity(p1, p2, 1920, 1080);
      expect(vel).toBe(0);
    });
  });

  describe('smoothStrokePoints', () => {
    it('returns unmodified points when smoothing is none or points length <= 2', () => {
      const points: RecordedPointerPoint[] = [
        { x: 0.1, y: 0.1, pressure: 0.5, timestamp: 1000, timeOffsetMs: 0, frame: 0 },
        { x: 0.2, y: 0.2, pressure: 0.6, timestamp: 1050, timeOffsetMs: 50, frame: 1 },
      ];

      expect(smoothStrokePoints(points, 'none')).toEqual(points);
      expect(smoothStrokePoints(points, 'smooth')).toEqual(points);
    });

    it('interpolates intermediate points with Catmull-Rom spline while preserving start and end points', () => {
      const points: RecordedPointerPoint[] = [
        { x: 0.1, y: 0.1, pressure: 0.2, timestamp: 1000, timeOffsetMs: 0, frame: 0 },
        { x: 0.3, y: 0.4, pressure: 0.5, timestamp: 1100, timeOffsetMs: 100, frame: 3 },
        { x: 0.6, y: 0.7, pressure: 0.8, timestamp: 1200, timeOffsetMs: 200, frame: 6 },
        { x: 0.8, y: 0.9, pressure: 0.4, timestamp: 1300, timeOffsetMs: 300, frame: 9 },
      ];

      const subtle = smoothStrokePoints(points, 'subtle');
      const smooth = smoothStrokePoints(points, 'smooth');

      expect(subtle.length).toBeGreaterThan(points.length);
      expect(smooth.length).toBeGreaterThan(subtle.length);

      // Start point matches
      expect(smooth[0].x).toBeCloseTo(points[0].x, 5);
      expect(smooth[0].y).toBeCloseTo(points[0].y, 5);
      // End point matches
      const lastSmooth = smooth[smooth.length - 1];
      const lastOriginal = points[points.length - 1];
      expect(lastSmooth.x).toBeCloseTo(lastOriginal.x, 2);
      expect(lastSmooth.y).toBeCloseTo(lastOriginal.y, 2);

      // Coordinates stay bounded [0..1]
      for (const pt of smooth) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
        expect(pt.pressure).toBeGreaterThanOrEqual(0.01);
        expect(pt.pressure).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('packageRecordingToWhiteboardClip', () => {
    it('packages a live recording session into an automated timeline Whiteboard clip', () => {
      const mockStroke: RecordedStroke = {
        id: 'stroke_1',
        tool: 'marker',
        color: '#ef4444',
        baseSize: 12,
        points: [
          { x: 0.1, y: 0.2, pressure: 0.5, timestamp: 1000, timeOffsetMs: 0, frame: 10 },
          { x: 0.5, y: 0.6, pressure: 0.7, timestamp: 1500, timeOffsetMs: 500, frame: 25 },
        ],
        startTimeMs: 1000,
        endTimeMs: 1500,
        startFrame: 10,
        endFrame: 25,
      };

      const session: LiveRecordingSession = {
        id: 'session_test',
        sequenceId: 'seq_123',
        startPlayheadFrame: 10,
        endPlayheadFrame: 100,
        durationFrames: 90,
        fps: 30,
        canvasWidth: 1920,
        canvasHeight: 1080,
        strokes: [mockStroke],
        activeTool: 'marker',
        activeColor: '#ef4444',
        activeSize: 12,
        foleyEnabled: true,
        foleyVolume: 0.7,
        smoothing: 'smooth',
      };

      const clip = packageRecordingToWhiteboardClip(session, 'track_v_overlay');

      expect(clip.sequenceId).toBe('seq_123');
      expect(clip.trackId).toBe('track_v_overlay');
      expect(clip.startFrames).toBe(10);
      expect(clip.durationFrames).toBe(90);
      expect(clip.effects?.whiteboard).toBeDefined();

      const wb = clip.effects!.whiteboard!;
      expect(wb.pattern).toBe('trace');
      expect(wb.hand).toBe('marker');
      expect(wb.foleyEnabled).toBe(true);
      expect(wb.foleyVolume).toBe(0.7);
      expect(wb.stylusPressure?.enabled).toBe(true);
      expect(wb.pressureAudio?.enabled).toBe(true);
    });

    it('assigns matching hand and look presets for chalk and pencil nibs', () => {
      const chalkSession: LiveRecordingSession = {
        id: 'session_chalk',
        sequenceId: 'seq_123',
        startPlayheadFrame: 0,
        endPlayheadFrame: 60,
        durationFrames: 60,
        fps: 30,
        canvasWidth: 1920,
        canvasHeight: 1080,
        strokes: [],
        activeTool: 'chalk',
        activeColor: '#ffffff',
        activeSize: 8,
        foleyEnabled: true,
        foleyVolume: 0.8,
        smoothing: 'subtle',
      };

      const clip = packageRecordingToWhiteboardClip(chalkSession, 'track_v1');
      const wb = clip.effects!.whiteboard!;
      expect(wb.hand).toBe('chalk');
      expect(wb.look).toBe('sketch');
      expect(wb.pressureAudio?.baseFreqHz).toBe(1200);
    });
  });
});
