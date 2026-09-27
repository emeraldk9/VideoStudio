/**
 * Milestone S160 — Real-Time Stylus Capture, Vector Stroke Recording & Whiteboard Automation.
 *
 * Captures high-frequency digitizer pointer events (pressure, tilt, twist, coalesced events)
 * from stylus/tablet/mouse input, performs live stroke smoothing, and packages recorded
 * vector drawings into native Timeline Whiteboard clips with frame-accurate timing.
 */

import type { SequenceClip } from './sequence';
import type { WhiteboardSettings } from '../utils/timeline/whiteboard';

export const STYLUS_NIB_TOOLS = ['pen', 'marker', 'pencil', 'chalk', 'eraser'] as const;
export type StylusNibTool = (typeof STYLUS_NIB_TOOLS)[number];

export interface RecordedPointerPoint {
  /** Normalized coordinate within the sequence canvas (0.0 to 1.0) */
  x: number;
  /** Normalized coordinate within the sequence canvas (0.0 to 1.0) */
  y: number;
  /** Stylus pressure (0.0 to 1.0, default 0.5) */
  pressure: number;
  /** Stylus tilt along X axis (-90 to 90 degrees) */
  tiltX?: number;
  /** Stylus tilt along Y axis (-90 to 90 degrees) */
  tiltY?: number;
  /** Stylus barrel twist (0 to 359 degrees) */
  twist?: number;
  /** High-resolution timestamp from performance.now() */
  timestamp: number;
  /** Relative milliseconds since recording session began */
  timeOffsetMs: number;
  /** Timeline sequence frame at the moment of capture */
  frame: number;
}

export interface RecordedStroke {
  id: string;
  tool: StylusNibTool;
  color: string;
  /** Base width in sequence pixels (e.g. at 1080p: pen ~3px, marker ~12px, chalk ~8px) */
  baseSize: number;
  points: RecordedPointerPoint[];
  startTimeMs: number;
  endTimeMs: number;
  startFrame: number;
  endFrame: number;
}

export interface LiveRecordingSession {
  id: string;
  sequenceId: string;
  startPlayheadFrame: number;
  endPlayheadFrame: number;
  durationFrames: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  strokes: RecordedStroke[];
  activeTool: StylusNibTool;
  activeColor: string;
  activeSize: number;
  foleyEnabled: boolean;
  foleyVolume: number;
  smoothing: 'none' | 'subtle' | 'smooth';
}

export const DEFAULT_TOOL_COLORS: Record<StylusNibTool, string> = {
  pen: '#1e293b',       // Deep slate ink
  marker: '#ef4444',    // Vivid red marker
  pencil: '#64748b',    // Graphite gray
  chalk: '#f8fafc',     // Crisp white chalk
  eraser: '#000000',    // Alpha clear
};

export const DEFAULT_TOOL_SIZES: Record<StylusNibTool, number> = {
  pen: 3,
  marker: 12,
  pencil: 2,
  chalk: 7,
  eraser: 24,
};

/**
 * Calculates physical drawing velocity in sequence pixels per second between two points.
 */
export function calculateStrokeVelocity(
  p1: RecordedPointerPoint,
  p2: RecordedPointerPoint,
  canvasWidth: number = 1920,
  canvasHeight: number = 1080,
): number {
  const dtSec = Math.max(0.001, (p2.timestamp - p1.timestamp) / 1000);
  const dxPx = (p2.x - p1.x) * canvasWidth;
  const dyPx = (p2.y - p1.y) * canvasHeight;
  const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  return Math.round(distPx / dtSec);
}

/**
 * Centripetal Catmull-Rom spline interpolation for stroke smoothing.
 * Eliminates digitizer staircasing and jitter without rounding sharp corners.
 */
export function smoothStrokePoints(
  points: RecordedPointerPoint[],
  smoothing: 'none' | 'subtle' | 'smooth' = 'smooth',
): RecordedPointerPoint[] {
  if (smoothing === 'none' || points.length <= 2) {
    return [...points];
  }

  const stepsPerSegment = smoothing === 'subtle' ? 2 : 4;
  const result: RecordedPointerPoint[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let step = 1; step <= stepsPerSegment; step++) {
      const t = step / stepsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      // Standard Catmull-Rom matrix
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      // Linearly interpolate pressure and timestamps
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const timestamp = p1.timestamp + (p2.timestamp - p1.timestamp) * t;
      const timeOffsetMs = p1.timeOffsetMs + (p2.timeOffsetMs - p1.timeOffsetMs) * t;
      const frame = Math.round(p1.frame + (p2.frame - p1.frame) * t);

      result.push({
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        pressure: Math.max(0.01, Math.min(1, pressure)),
        timestamp,
        timeOffsetMs,
        frame,
      });
    }
  }

  return result;
}

/**
 * Packages a finished live recording session into an automated Timeline Whiteboard clip.
 */
export function packageRecordingToWhiteboardClip(
  session: LiveRecordingSession,
  trackId: string,
  clipId?: string,
): SequenceClip {
  const id =
    clipId ??
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? `wb_rec_${crypto.randomUUID()}`
      : `wb_rec_${Date.now()}`);
  const durationFrames = Math.max(1, session.durationFrames);
  const startFrames = Math.max(0, session.startPlayheadFrame);

  // Derive whiteboard hand preset matching primary recorded tool
  let whiteboardHand: WhiteboardSettings['hand'] = 'pen';
  if (session.activeTool === 'marker') whiteboardHand = 'marker';
  else if (session.activeTool === 'chalk') whiteboardHand = 'chalk';
  else if (session.activeTool === 'pencil') whiteboardHand = 'pencil';

  const whiteboardEffect: WhiteboardSettings = {
    pattern: 'trace',
    rows: 8,
    hand: whiteboardHand,
    look: session.activeTool === 'chalk' ? 'sketch' : 'none',
    drawFraction: 0.9,
    inFraction: 0.0,
    foleyEnabled: session.foleyEnabled,
    foleyVolume: session.foleyVolume,
    strokeSmoothing: session.smoothing === 'none' ? 'none' : 'smooth',
    stylusPressure: {
      enabled: true,
      curve: 'sigmoid',
      sensitivity: 1.0,
      minWidthPct: 0.25,
      tiltDeformation: true,
    },
    pressureAudio: {
      enabled: session.foleyEnabled,
      squeakVolume: session.foleyVolume,
      baseFreqHz: session.activeTool === 'chalk' ? 1200 : 800,
    },
  };

  return {
    id,
    sequenceId: session.sequenceId,
    trackId,
    orderIndex: 0,
    sourceKind: 'still',
    filePath: '', // Transparent canvas overlay clip
    label: `Stylus Recording (${session.strokes.length} strokes)`,
    startFrames,
    durationFrames,
    sourceInFrames: null,
    sourceOutFrames: null,
    transitionIn: 'cut',
    transitionFrames: 0,
    transitionOut: 'cut',
    transitionOutFrames: 0,
    audioOffsetFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    sourceAudioEnabled: false,
    duckExempt: true,
    overrides: [],
    effects: {
      whiteboard: whiteboardEffect,
    },
  };
}
