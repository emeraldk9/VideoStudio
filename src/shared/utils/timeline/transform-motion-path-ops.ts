/**
 * Pure arithmetic and geometric operations for Video Transform Keyframing Engine & Motion Path Spline Interpolator.
 *
 * Implements:
 * - 2D Spatial Motion Path interpolation using Catmull-Rom splines converted to cubic Béziers
 * - Arc-length parameterization for uniform velocity travel along spatial curved paths
 * - Cinematic easing functions (linear, quadratic, cubic, sine, spring overshoot, smoothstep)
 * - Instantaneous velocity profiling and Auto-Orient heading angle calculation
 * - SVG Motion Path generation for on-canvas interactive visualizers
 * - Comprehensive 2D Transform state evaluation (Position X/Y, Scale X/Y, Rotation, Opacity)
 */

import {
  type ClipKeyframe,
  keyframesFor,
  valueAtFrame,
} from './keyframes';

export type { ClipKeyframe };

export interface Vector2D {
  x: number;
  y: number;
}

export interface Transform2DState {
  /** Center X position in normalized coordinates (0..1, where 0.5 is canvas center). */
  x: number;
  /** Center Y position in normalized coordinates (0..1, where 0.5 is canvas center). */
  y: number;
  /** Horizontal scale factor (default 1.0). */
  scaleX: number;
  /** Vertical scale factor (default 1.0). */
  scaleY: number;
  /** Rotation in degrees (e.g. -360 to +360). */
  rotationDeg: number;
  /** Opacity level (0.0 to 1.0). */
  opacity: number;
}

export const DEFAULT_TRANSFORM_2D: Transform2DState = {
  x: 0.5,
  y: 0.5,
  scaleX: 1.0,
  scaleY: 1.0,
  rotationDeg: 0,
  opacity: 1.0,
};

export type MotionEasingCurve =
  | 'linear'
  | 'ease_in_quad'
  | 'ease_out_quad'
  | 'ease_in_out_cubic'
  | 'ease_in_out_sine'
  | 'spring_elastic_overshoot'
  | 'cinematic_smooth';

export const MOTION_EASING_LABELS: Record<MotionEasingCurve, string> = {
  cinematic_smooth: 'Cinematic Smooth (Catmull-Rom)',
  ease_in_out_cubic: 'Ease In/Out Cubic',
  ease_in_out_sine: 'Ease In/Out Sine',
  spring_elastic_overshoot: 'Spring Overshoot',
  ease_in_quad: 'Ease In (Quadratic)',
  ease_out_quad: 'Ease Out (Quadratic)',
  linear: 'Linear (Direct)',
};

export interface MotionPathWaypoint {
  frame: number;
  x: number;
  y: number;
}

export interface CubicBezierSegment2D {
  p0: Vector2D;
  c1: Vector2D;
  c2: Vector2D;
  p1: Vector2D;
  startFrame: number;
  endFrame: number;
  arcLength: number;
}

export interface MotionVelocity {
  /** Velocity X in pixels per second. */
  vx: number;
  /** Velocity Y in pixels per second. */
  vy: number;
  /** Scalar speed in pixels per second. */
  speed: number;
  /** Heading angle in degrees (-180 to +180) for Auto-Orient along path. */
  headingDeg: number;
}

export interface MotionPathSvgResult {
  /** SVG path 'd' attribute string (e.g. "M 100 200 C 120 180, 160 140, 200 120"). */
  svgPathD: string;
  /** Sampled pixel coordinates along the path. */
  sampledPoints: Array<Vector2D & { frame: number }>;
  /** Pixel positions of all keyframe waypoints. */
  waypointPositions: Array<Vector2D & { frame: number; index: number }>;
  /** Total physical path distance in pixels. */
  totalPathLengthPx: number;
}

/**
 * Evaluates standard easing functions mapping normalized time u in [0, 1] to eased progress in [0, 1].
 */
export function evaluateMotionEasing(u: number, easing: MotionEasingCurve): number {
  const t = Math.max(0, Math.min(1, u));

  switch (easing) {
    case 'linear':
      return t;
    case 'ease_in_quad':
      return t * t;
    case 'ease_out_quad':
      return t * (2 - t);
    case 'ease_in_out_cubic':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'ease_in_out_sine':
      return -(Math.cos(Math.PI * t) - 1) / 2;
    case 'spring_elastic_overshoot': {
      if (t === 0 || t === 1) return t;
      const p = 0.3;
      const s = p / 4;
      return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
    }
    case 'cinematic_smooth':
      // Smoothstep / Quintic polynomial: 6t^5 - 15t^4 + 10t^3
      return t * t * t * (t * (t * 6 - 15) + 10);
    default:
      return t;
  }
}

/**
 * Evaluates 2D position on a Cubic Bézier curve at parameter t in [0, 1].
 */
export function evaluateCubicBezier2D(
  p0: Vector2D,
  c1: Vector2D,
  c2: Vector2D,
  p1: Vector2D,
  t: number
): Vector2D {
  const clampedT = Math.max(0, Math.min(1, t));
  const omt = 1 - clampedT;
  const omt2 = omt * omt;
  const t2 = clampedT * clampedT;

  const a = omt2 * omt;
  const b = 3 * omt2 * clampedT;
  const c = 3 * omt * t2;
  const d = t2 * clampedT;

  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/**
 * Evaluates 2D tangent vector (first derivative dP/dt) on a Cubic Bézier curve at parameter t.
 */
export function evaluateCubicBezierDerivative2D(
  p0: Vector2D,
  c1: Vector2D,
  c2: Vector2D,
  p1: Vector2D,
  t: number
): Vector2D {
  const clampedT = Math.max(0, Math.min(1, t));
  const omt = 1 - clampedT;

  const a = 3 * omt * omt;
  const b = 6 * omt * clampedT;
  const c = 3 * clampedT * clampedT;

  return {
    x: a * (c1.x - p0.x) + b * (c2.x - c1.x) + c * (p1.x - c2.x),
    y: a * (c1.y - p0.y) + b * (c2.y - c1.y) + c * (p1.y - c2.y),
  };
}

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function distance2D(a: Vector2D, b: Vector2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Estimates arc length of a Cubic Bézier segment via numerical chord integration.
 */
export function estimateSegmentArcLength(
  p0: Vector2D,
  c1: Vector2D,
  c2: Vector2D,
  p1: Vector2D,
  subdivisions: number = 16
): number {
  let length = 0;
  let prev = p0;

  for (let i = 1; i <= subdivisions; i++) {
    const t = i / subdivisions;
    const curr = evaluateCubicBezier2D(p0, c1, c2, p1, t);
    length += distance2D(prev, curr);
    prev = curr;
  }

  return length;
}

/**
 * Converts a sequence of spatial waypoints into smooth Cubic Bézier segments
 * using Catmull-Rom spline tangents with configurable tension.
 *
 * @param waypoints Array of spatial positions with frame numbers (sorted by frame)
 * @param tension Catmull-Rom tension (0.0 to 1.0, default 0.5 for centripetal feel)
 */
export function buildMotionPathSegments(
  waypoints: readonly MotionPathWaypoint[],
  tension: number = 0.5
): CubicBezierSegment2D[] {
  if (waypoints.length < 2) return [];

  const segments: CubicBezierSegment2D[] = [];
  const n = waypoints.length;
  const alpha = (1 - tension) / 2;

  for (let i = 0; i < n - 1; i++) {
    const p0 = waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = waypoints[Math.min(n - 1, i + 2)];

    // Catmull-Rom tangent vectors at P1 and P2
    const m1: Vector2D = {
      x: alpha * (p2.x - p0.x),
      y: alpha * (p2.y - p0.y),
    };
    const m2: Vector2D = {
      x: alpha * (p3.x - p1.x),
      y: alpha * (p3.y - p1.y),
    };

    // Convert Catmull-Rom to Cubic Bézier control points
    const c1: Vector2D = {
      x: p1.x + m1.x / 3,
      y: p1.y + m1.y / 3,
    };
    const c2: Vector2D = {
      x: p2.x - m2.x / 3,
      y: p2.y - m2.y / 3,
    };

    const arcLength = estimateSegmentArcLength(p1, c1, c2, p2);

    segments.push({
      p0: { x: p1.x, y: p1.y },
      c1,
      c2,
      p1: { x: p2.x, y: p2.y },
      startFrame: p1.frame,
      endFrame: p2.frame,
      arcLength,
    });
  }

  return segments;
}

/**
 * Inverts the arc length s on a Cubic Bézier segment to find parameter t.
 * Enables uniform velocity travel along curved paths.
 */
export function solveTForArcLength(
  segment: CubicBezierSegment2D,
  targetDistance: number,
  subdivisions: number = 24
): number {
  if (segment.arcLength <= 0 || targetDistance <= 0) return 0;
  if (targetDistance >= segment.arcLength) return 1;

  let accumulated = 0;
  let prev = segment.p0;

  for (let i = 1; i <= subdivisions; i++) {
    const t = i / subdivisions;
    const curr = evaluateCubicBezier2D(segment.p0, segment.c1, segment.c2, segment.p1, t);
    const chord = distance2D(prev, curr);

    if (accumulated + chord >= targetDistance) {
      // Linear interpolation between (i-1)/N and i/N
      const remainder = targetDistance - accumulated;
      const frac = chord > 0 ? remainder / chord : 0;
      return (i - 1 + frac) / subdivisions;
    }

    accumulated += chord;
    prev = curr;
  }

  return 1;
}

/**
 * Extracts sorted spatial waypoints from clip keyframes where X and Y are present.
 */
export function extractSpatialWaypoints(
  keyframes: readonly ClipKeyframe[] | undefined,
  defaultX: number = 0.5,
  defaultY: number = 0.5
): MotionPathWaypoint[] {
  if (!keyframes || keyframes.length === 0) {
    return [];
  }

  const xKeys = keyframesFor(keyframes, 'x');
  const yKeys = keyframesFor(keyframes, 'y');

  // Collect all unique frames that keyframe x or y
  const frameSet = new Set<number>();
  for (const k of xKeys) frameSet.add(k.frame);
  for (const k of yKeys) frameSet.add(k.frame);

  if (frameSet.size === 0) return [];

  const sortedFrames = [...frameSet].sort((a, b) => a - b);
  return sortedFrames.map((frame) => ({
    frame,
    x: valueAtFrame(keyframes, 'x', frame, defaultX),
    y: valueAtFrame(keyframes, 'y', frame, defaultY),
  }));
}

/**
 * Evaluates the 2D spatial position (x, y) along a spline motion path at a given frame.
 * If uniformVelocity is enabled, uses arc-length parameterization.
 */
export function evaluateSpatialMotionPath(
  segments: readonly CubicBezierSegment2D[],
  frame: number,
  easing: MotionEasingCurve = 'linear',
  uniformVelocity: boolean = true
): Vector2D | null {
  if (segments.length === 0) return null;

  // Boundary cases: before first or after last segment
  if (frame <= segments[0].startFrame) {
    return { ...segments[0].p0 };
  }
  const lastSeg = segments[segments.length - 1];
  if (frame >= lastSeg.endFrame) {
    return { ...lastSeg.p1 };
  }

  // Find the active segment spanning the requested frame
  const segment = segments.find(
    (s) => frame >= s.startFrame && frame <= s.endFrame
  );
  if (!segment) return null;

  const duration = Math.max(1, segment.endFrame - segment.startFrame);
  const u = (frame - segment.startFrame) / duration;
  const easedU = evaluateMotionEasing(u, easing);

  let t = easedU;
  if (uniformVelocity && segment.arcLength > 0) {
    t = solveTForArcLength(segment, easedU * segment.arcLength);
  }

  return evaluateCubicBezier2D(segment.p0, segment.c1, segment.c2, segment.p1, t);
}

/**
 * Calculates instantaneous 2D motion velocity, speed, and heading angle at a given frame.
 */
export function calculateMotionVelocity(
  segments: readonly CubicBezierSegment2D[],
  frame: number,
  fps: number,
  boxWidthPx: number = 1920,
  boxHeightPx: number = 1080
): MotionVelocity {
  if (segments.length === 0) {
    return { vx: 0, vy: 0, speed: 0, headingDeg: 0 };
  }

  // Finite difference over a tiny frame delta (0.25 frames)
  const dtFrames = 0.25;
  const pA = evaluateSpatialMotionPath(segments, Math.max(0, frame - dtFrames / 2));
  const pB = evaluateSpatialMotionPath(segments, frame + dtFrames / 2);

  if (!pA || !pB) {
    return { vx: 0, vy: 0, speed: 0, headingDeg: 0 };
  }

  const dxPx = (pB.x - pA.x) * boxWidthPx;
  const dyPx = (pB.y - pA.y) * boxHeightPx;

  // dt in seconds = dtFrames / fps
  const dtSec = dtFrames / Math.max(1, fps);
  const vx = dxPx / dtSec;
  const vy = dyPx / dtSec;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // Heading angle in degrees (-180 to +180)
  const headingRad = Math.atan2(dyPx, dxPx);
  const headingDeg = Math.round((headingRad * 180) / Math.PI * 10) / 10;

  return {
    vx: Math.round(vx * 10) / 10,
    vy: Math.round(vy * 10) / 10,
    speed: Math.round(speed * 10) / 10,
    headingDeg,
  };
}

/**
 * Generates SVG path coordinates and waypoint handles for on-canvas interactive transform overlays.
 */
export function generateMotionPathSvg(
  segments: readonly CubicBezierSegment2D[],
  waypoints: readonly MotionPathWaypoint[],
  boxWidthPx: number,
  boxHeightPx: number,
  samplesPerSegment: number = 20
): MotionPathSvgResult {
  if (segments.length === 0 || boxWidthPx <= 0 || boxHeightPx <= 0) {
    return {
      svgPathD: '',
      sampledPoints: [],
      waypointPositions: [],
      totalPathLengthPx: 0,
    };
  }

  let totalLengthPx = 0;
  const sampledPoints: Array<Vector2D & { frame: number }> = [];

  // Build SVG Path 'd' attribute
  const pathParts: string[] = [];
  const startX = Math.round(segments[0].p0.x * boxWidthPx * 10) / 10;
  const startY = Math.round(segments[0].p0.y * boxHeightPx * 10) / 10;
  pathParts.push(`M ${startX} ${startY}`);

  for (const seg of segments) {
    const c1x = Math.round(seg.c1.x * boxWidthPx * 10) / 10;
    const c1y = Math.round(seg.c1.y * boxHeightPx * 10) / 10;
    const c2x = Math.round(seg.c2.x * boxWidthPx * 10) / 10;
    const c2y = Math.round(seg.c2.y * boxHeightPx * 10) / 10;
    const p1x = Math.round(seg.p1.x * boxWidthPx * 10) / 10;
    const p1y = Math.round(seg.p1.y * boxHeightPx * 10) / 10;

    pathParts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1x} ${p1y}`);

    const segLengthPx = estimateSegmentArcLength(
      { x: seg.p0.x * boxWidthPx, y: seg.p0.y * boxHeightPx },
      { x: seg.c1.x * boxWidthPx, y: seg.c1.y * boxHeightPx },
      { x: seg.c2.x * boxWidthPx, y: seg.c2.y * boxHeightPx },
      { x: seg.p1.x * boxWidthPx, y: seg.p1.y * boxHeightPx }
    );
    totalLengthPx += segLengthPx;

    // Sample discrete trajectory dots along the curve
    const duration = Math.max(1, seg.endFrame - seg.startFrame);
    for (let i = 0; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const pt = evaluateCubicBezier2D(seg.p0, seg.c1, seg.c2, seg.p1, t);
      const frame = Math.round(seg.startFrame + t * duration);
      sampledPoints.push({
        x: Math.round(pt.x * boxWidthPx * 10) / 10,
        y: Math.round(pt.y * boxHeightPx * 10) / 10,
        frame,
      });
    }
  }

  // Waypoint positions in pixels
  const waypointPositions = waypoints.map((wp, idx) => ({
    x: Math.round(wp.x * boxWidthPx * 10) / 10,
    y: Math.round(wp.y * boxHeightPx * 10) / 10,
    frame: wp.frame,
    index: idx,
  }));

  return {
    svgPathD: pathParts.join(' '),
    sampledPoints,
    waypointPositions,
    totalPathLengthPx: Math.round(totalLengthPx * 10) / 10,
  };
}

/**
 * Evaluates the full 2D Transform state at an arbitrary frame,
 * combining spatial spline interpolation for (X, Y) with scalar evaluation for Scale, Rotation, and Opacity.
 */
export function evaluateTransformAtFrame(
  keyframes: readonly ClipKeyframe[] | undefined,
  defaultTransform: Partial<Transform2DState> = {},
  frame: number,
  fps: number = 30,
  options?: {
    easing?: MotionEasingCurve;
    autoOrient?: boolean;
    boxWidthPx?: number;
    boxHeightPx?: number;
  }
): Transform2DState {
  const mergedDefault: Transform2DState = {
    ...DEFAULT_TRANSFORM_2D,
    ...defaultTransform,
  };

  if (!keyframes || keyframes.length === 0) {
    return mergedDefault;
  }

  // 1. Spatial Motion Path (X, Y)
  const waypoints = extractSpatialWaypoints(keyframes, mergedDefault.x, mergedDefault.y);
  let x = mergedDefault.x;
  let y = mergedDefault.y;

  let segments: CubicBezierSegment2D[] = [];
  if (waypoints.length >= 2) {
    segments = buildMotionPathSegments(waypoints);
    const spatialPos = evaluateSpatialMotionPath(segments, frame, options?.easing ?? 'linear');
    if (spatialPos) {
      x = spatialPos.x;
      y = spatialPos.y;
    }
  } else if (waypoints.length === 1) {
    x = waypoints[0].x;
    y = waypoints[0].y;
  } else {
    x = valueAtFrame(keyframes, 'x', frame, mergedDefault.x);
    y = valueAtFrame(keyframes, 'y', frame, mergedDefault.y);
  }

  // 2. Scale X & Scale Y
  const scale = valueAtFrame(keyframes, 'scale', frame, mergedDefault.scaleX);
  const scaleX = scale;
  const scaleY = scale;

  // 3. Rotation (Deg) with Auto-Orient option
  let rotationDeg = valueAtFrame(keyframes, 'rotation', frame, mergedDefault.rotationDeg);
  if (options?.autoOrient && segments.length > 0) {
    const vel = calculateMotionVelocity(
      segments,
      frame,
      fps,
      options?.boxWidthPx ?? 1920,
      options?.boxHeightPx ?? 1080
    );
    if (vel.speed > 5) {
      rotationDeg += vel.headingDeg;
    }
  }

  // 4. Opacity
  const opacity = Math.max(0, Math.min(1, valueAtFrame(keyframes, 'opacity', frame, mergedDefault.opacity)));

  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    scaleX: Math.round(scaleX * 1000) / 1000,
    scaleY: Math.round(scaleY * 1000) / 1000,
    rotationDeg: Math.round(rotationDeg * 10) / 10,
    opacity: Math.round(opacity * 1000) / 1000,
  };
}

/**
 * Smooths keyframe tangents for all or specified properties using Catmull-Rom spline slopes,
 * updating interpolation to 'bezier' with computed handleIn and handleOut control points.
 */
export function smoothKeyframeTangents(
  keyframes: ClipKeyframe[] | undefined,
  targetProperties?: Array<'x' | 'y' | 'scale' | 'opacity' | 'rotation' | 'volume'>
): ClipKeyframe[] {
  if (!keyframes || keyframes.length === 0) return [];
  const props = targetProperties ?? ['x', 'y', 'scale', 'opacity', 'rotation'];

  const result: ClipKeyframe[] = keyframes.map((k) => ({
    ...k,
    handleIn: k.handleIn ? { ...k.handleIn } : undefined,
    handleOut: k.handleOut ? { ...k.handleOut } : undefined,
  }));

  for (const prop of props) {
    const propKeys = result.filter((k) => k.property === prop).sort((a, b) => a.frame - b.frame);
    if (propKeys.length < 2) continue;

    for (let i = 0; i < propKeys.length; i++) {
      const cur = propKeys[i];
      const prev = i > 0 ? propKeys[i - 1] : null;
      const next = i < propKeys.length - 1 ? propKeys[i + 1] : null;

      let slope = 0;
      if (prev && next) {
        const df = next.frame - prev.frame;
        if (df > 0) {
          slope = (next.value - prev.value) / df;
        }
      } else if (next && !prev) {
        const df = next.frame - cur.frame;
        if (df > 0) {
          slope = (next.value - cur.value) / df;
        }
      } else if (prev && !next) {
        const df = cur.frame - prev.frame;
        if (df > 0) {
          slope = (cur.value - prev.value) / df;
        }
      }

      cur.interpolation = 'bezier';

      if (prev) {
        const spanLeft = cur.frame - prev.frame;
        const dtIn = Math.max(1, spanLeft / 3);
        cur.handleIn = {
          frameOffset: -Math.round(dtIn * 10) / 10,
          valueOffset: -Math.round(slope * dtIn * 1000) / 1000,
        };
      }

      if (next) {
        const spanRight = next.frame - cur.frame;
        const dtOut = Math.max(1, spanRight / 3);
        cur.handleOut = {
          frameOffset: Math.round(dtOut * 10) / 10,
          valueOffset: Math.round(slope * dtOut * 1000) / 1000,
        };
      }
    }
  }

  return result;
}

