/**
 * Beta S161 — whiteboard (hand-drawn) reveal: the shared geometry.
 *
 * One pure function describes the reveal at any progress, consumed by BOTH
 * renderers — the ffmpeg expression builder in `whiteboard-segment.ts` and
 * the preview's CSS `clip-path` — the `buildColorFilterChain`/`buildCssFilter`
 * pattern. If the two ever disagree about where the reveal front is, the fix
 * is here, once.
 *
 * The reveal is **position-animated, never size-animated**: ffmpeg's
 * `drawbox` cannot take time expressions (its `t` is border thickness), but
 * `overlay=x:y:eval=frame` can — so the mask is solid planes sliding over a
 * black canvas, and this module only ever speaks in *positions*.
 *
 * Serpentine, R rows over the draw window: completed rows are a full-width
 * plane whose bottom edge has descended `floor(p·R)/R` of the height; the
 * current row is a bar one row tall slid in from the left by the fractional
 * remainder. `pattern: 'wipe'` is the R=1 case, not a second code path.
 */

import {
  clipPolygonHalfPlane,
  polygonBounds,
  polygonCentroid,
  polygonClipPath,
} from '../geometry/polygon';

export interface WhiteboardSettings {
  /**
   * Reveal pattern. `'wipe'` is serpentine with one row; `'zones'` is S275's
   * user-drawn regions; `'trace'` is S277's content-aware sketch (the still's
   * own linework drawn stroke-by-stroke, then the fill blooming outward).
   */
  pattern: 'serpentine' | 'wipe' | 'zones' | 'trace';
  /** Serpentine row count. Clamped 2–16; 8 reads as writing at 1080p. */
  rows: number;
  /**
   * Legacy (pre-S279) absolute draw time in seconds. Honored when present so
   * S161-era documents render byte-identically, but `drawFraction` wins —
   * see {@link resolveWhiteboardDrawSeconds}. New stamps write neither field.
   */
  drawSeconds?: number;
  /**
   * S279 — share of the clip spent drawing (0.1..1); the rest holds the
   * finished frame. A *fraction*, not seconds, for the S229 motion reason:
   * the duration is stored on the clip, the window derives at eval time, so
   * a retime can never strand the draw inside (or past) the picture.
   */
  drawFraction?: number;
  /**
   * S5 — fractional start time of drawing (0..drawFraction, default 0).
   * Keyframe In for sketches.
   */
  inFraction?: number;
  /** S5 — absolute draw start time in seconds. */
  inSeconds?: number;
  hand: 'pen' | 'marker' | 'none';
  /**
   * S296 — the reveal clock's step rate in Hz (4..30). Absent = smooth: the
   * reveal advances every sequence frame, the pre-S296 behaviour exactly.
   * Present, the *drawing* — mask front and hand alike — jumps `cadenceFps`
   * times a second while the picture itself stays at the sequence rate: the
   * choppy hand-drawn aesthetic, as a clock property rather than a re-time.
   * Both renderers derive from {@link whiteboardCadenceQuantizeSeconds}.
   */
  cadenceFps?: number;
  /**
   * Board look applied to the source before the reveal. `'sketch'` is S161's
   * mono line-art; S295 adds `'pencil'` (soft graphite linework with animated
   * paper grain) and `'comic'` (high-contrast posterized tone flats — the
   * honest single-chain cousin of true crosshatching, which would need a
   * pattern overlay branch). Looks render in the export; the preview shows
   * the original picture under the reveal, as the ⓘ line discloses.
   */
  look: 'none' | 'sketch' | 'pencil' | 'comic';
  /**
   * S275 — `pattern: 'zones'` only: the user-drawn reveal regions, in reveal
   * order (the array order IS the order — there is no separate index field to
   * fall out of sync). Absent or empty degrades to the serpentine reveal, so
   * a document that chose the pattern before drawing anything still renders.
   */
  zones?: WhiteboardZone[];
  /**
   * S277 — `pattern: 'trace'` only: the tracing parameters. **Parameters,
   * never artifacts** (the S229 motion posture): the time-map PNG and pen
   * path derive in the main process at render time and cache by source
   * identity + these knobs + the algorithm version. A document never carries
   * a derived file's path.
   */
  trace?: WhiteboardTraceSettings;
}

/** S277 — the vector-sketch trace's knobs. */
export interface WhiteboardTraceSettings {
  /** Edge sensitivity → stroke density. */
  detail: 'low' | 'medium' | 'high';
  /**
   * Stroke ordering: `'reading'` row-quantized top-left→bottom-right;
   * `'nearest'` greedy from the previous stroke's end — the default, because
   * it minimizes the hand teleporting across the frame.
   */
  order: 'reading' | 'nearest';
  /** Fraction of the draw window spent on linework before the fill bloom. @default 0.7 */
  strokeFraction?: number;
}

export const WHITEBOARD_TRACE_DEFAULTS: WhiteboardTraceSettings = {
  detail: 'medium',
  order: 'nearest',
};

export const WHITEBOARD_TRACE_STROKE_FRACTION = 0.7;

/**
 * S277 — one keyframe of the traced pen path: `t` normalized 0..1 of the
 * draw window, `x`/`y` normalized to the padded sequence frame (the zone
 * coordinate space). The path is decimated to ≤ {@link WHITEBOARD_TRACE_MAX_PEN_POINTS}
 * points because the export compiles it into nested `if()` overlay
 * expressions, whose depth is bounded by the expression parser.
 */
export interface WhiteboardPenPoint {
  t: number;
  x: number;
  y: number;
}

export const WHITEBOARD_TRACE_MAX_PEN_POINTS = 240;
export const WHITEBOARD_EXPORT_MAX_PEN_POINTS = 33;

/**
 * The pen tip along the traced path at draw progress 0..1 — piecewise-linear
 * between keyframes, `null` once drawing completes or with no path. The
 * export's nested-`if` overlay expressions are the compile of exactly this
 * interpolation; the preview's glyph reads it directly.
 */
export function whiteboardTraceFrontAt(
  penPath: readonly WhiteboardPenPoint[],
  progress: number,
): { x: number; y: number } | null {
  if (penPath.length === 0) return null;
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return null;
  if (p <= penPath[0].t) return { x: penPath[0].x, y: penPath[0].y };
  for (let i = 1; i < penPath.length; i += 1) {
    if (p <= penPath[i].t) {
      const a = penPath[i - 1];
      const b = penPath[i];
      const span = Math.max(1e-6, b.t - a.t);
      const s = (p - a.t) / span;
      return { x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y) };
    }
  }
  // Past the last keyframe the linework is finished and the remainder of the
  // draw window is the fill bloom — nothing a pen draws, so the hand leaves.
  return null;
}

/**
 * S278 — the trace artifact as it crosses IPC to the preview: the raw gray
 * time-map (base64 of `width*height` bytes, 0..254) plus the pen path. Data
 * rather than a path, deliberately — `media://` does not serve the trace
 * cache and a preview is no reason to widen that allowlist.
 */
export interface WhiteboardTraceMapPayload {
  width: number;
  height: number;
  /** Base64 of the row-major gray plane; decode to `Uint8Array(width*height)`. */
  mapBase64: string;
  penPath: WhiteboardPenPoint[];
}

/** The preview mask's soft-edge width, in map value units (~2 frames of a 5s draw). */
export const WHITEBOARD_TRACE_EDGE = 6;

/**
 * One pixel's mask alpha at draw progress `p` — the preview-side statement of
 * the export's `threshold` + `gblur=0.8`: fully revealed once the ramp has
 * passed the pixel's time by the edge width, fully hidden before it, a linear
 * shoulder between. `mapValue` is the stored 0..254; the ramp is `p·255`
 * (the export's full-range fade, spike-verified linear).
 */
export function whiteboardTraceMaskAlpha(mapValue: number, progress: number): number {
  const ramp = Math.min(1, Math.max(0, progress)) * 255;
  const delta = ramp - mapValue;
  if (delta <= 0) return 0;
  if (delta >= WHITEBOARD_TRACE_EDGE) return 1;
  return delta / WHITEBOARD_TRACE_EDGE;
}

export type WhiteboardZoneType = 'sketch' | 'scribble' | 'writing' | 'wipe';

/**
 * S275 / Refactor — one user-drawn reveal region. Points are normalized 0..1 of the
 * **padded sequence frame** (what the export's `scale…,pad=…` produces), the
 * one coordinate space the zone editor, the CSS preview, and the ffmpeg
 * masks all share — so no consumer ever converts.
 */
export interface WhiteboardZone {
  /** Simplified freehand polygon, 3..64 vertices. */
  points: { x: number; y: number }[];
  /** Entrance style. Draw-in only by owner decision. */
  entrance: 'draw';
  /** Zone drawing engine: contour sketch, scribble shading, multi-line writing, or directional wipe. @default 'sketch' */
  type?: WhiteboardZoneType;
  /** Angle for scribble shading (in degrees, default 45). */
  hatchAngle?: number;
  /** Number of text rows for writing mode (2..16, default 4). */
  rows?: number;
  /** Sweep direction of the draw-in front. @default 'lr' */
  sweep?: 'lr' | 'rl' | 'tb';
  /** This zone's share of the draw window, proportional. Clamped 0.25–4. @default 1 */
  weight?: number;
}

export const WHITEBOARD_MIN_ROWS = 2;
export const WHITEBOARD_MAX_ROWS = 16;
export const WHITEBOARD_MIN_DRAW_SECONDS = 0.5;
export const WHITEBOARD_MAX_ZONES = 12;
export const WHITEBOARD_MAX_ZONE_POINTS = 64;
export const WHITEBOARD_MIN_ZONE_WEIGHT = 0.25;
export const WHITEBOARD_MAX_ZONE_WEIGHT = 4;

/**
 * The defaults an "Apply whiteboard" gesture stamps. Deliberately carries no
 * draw time at all — the 90% default lives in {@link resolveWhiteboardDrawSeconds},
 * so an apply is duration-independent by construction (S279).
 */
export const WHITEBOARD_DEFAULTS: WhiteboardSettings = {
  pattern: 'serpentine',
  rows: 8,
  hand: 'pen',
  look: 'none',
};

export const WHITEBOARD_DRAW_FRACTION = 0.9;

export const WHITEBOARD_MIN_CADENCE_FPS = 4;
export const WHITEBOARD_MAX_CADENCE_FPS = 30;

/**
 * S296 — the effective cadence: the clamped integer step rate, or `null` for
 * smooth. The one clamp both renderers share — the export compiles it into
 * `floor(t*C)/C` expressions (and the trace ramp's source rate), the preview
 * quantizes its elapsed seconds; if they ever disagree about where a step
 * lands, the fix is here, once.
 */
export function whiteboardCadenceHz(
  settings: Pick<WhiteboardSettings, 'cadenceFps'>,
): number | null {
  if (settings.cadenceFps == null) return null;
  return Math.min(
    WHITEBOARD_MAX_CADENCE_FPS,
    Math.max(WHITEBOARD_MIN_CADENCE_FPS, Math.round(settings.cadenceFps)),
  );
}

/** S296 — a moment on the reveal clock: stepped when a cadence is set, untouched when smooth. */
export function whiteboardCadenceQuantizeSeconds(
  seconds: number,
  settings: Pick<WhiteboardSettings, 'cadenceFps'>,
): number {
  const hz = whiteboardCadenceHz(settings);
  return hz === null ? seconds : Math.floor(seconds * hz) / hz;
}

/**
 * S279 — THE draw window, derived at eval time (render, preview, inspector
 * all call this; if they ever disagree about how long the drawing takes, the
 * fix is here, once). Precedence: `drawFraction` × clip → legacy absolute
 * `drawSeconds` → the 90% default. Then the S161 clamp, relocated from
 * `whiteboard-segment.ts`: inside the clip, and strictly under it by one
 * frame so `min(t/D,1)` genuinely reaches 1 on a rendered frame.
 */
export function resolveWhiteboardDrawSeconds(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction'>,
  durationFrames: number,
  fps: number,
): number {
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const totalSeconds = Math.max(1, Math.round(durationFrames)) / safeFps;
  const requested =
    settings.drawFraction != null
      ? settings.drawFraction * totalSeconds
      : (settings.drawSeconds ?? WHITEBOARD_DRAW_FRACTION * totalSeconds);
  const lo = Math.min(WHITEBOARD_MIN_DRAW_SECONDS, totalSeconds);
  const hi = Math.max(0.1, totalSeconds - 1 / safeFps);
  return Math.min(hi, Math.max(lo, requested));
}

/**
 * S5 — symmetric alias for resolveWhiteboardDrawSeconds (Keyframe Out).
 */
export function resolveWhiteboardOutSeconds(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction'>,
  durationFrames: number,
  fps: number,
): number {
  return resolveWhiteboardDrawSeconds(settings, durationFrames, fps);
}

/**
 * S5 — start of drawing in seconds (Keyframe In). Clamped strictly between 0 and
 * the out time minus one frame.
 */
export function resolveWhiteboardInSeconds(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction' | 'inSeconds' | 'inFraction'>,
  durationFrames: number,
  fps: number,
): number {
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const totalSeconds = Math.max(1, Math.round(durationFrames)) / safeFps;
  const requested =
    settings.inFraction != null
      ? settings.inFraction * totalSeconds
      : (settings.inSeconds ?? 0);
  const outSeconds = resolveWhiteboardOutSeconds(settings, durationFrames, fps);
  const maxIn = Math.max(0, outSeconds - 1 / safeFps);
  return Math.min(maxIn, Math.max(0, requested));
}

/**
 * S5 — Keyframe In in integer frames (clip-relative, 0..durationFrames - 1).
 */
export function resolveWhiteboardInFrame(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction' | 'inSeconds' | 'inFraction'>,
  durationFrames: number,
  fps: number,
): number {
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const inSec = resolveWhiteboardInSeconds(settings, durationFrames, safeFps);
  return Math.min(Math.max(0, durationFrames - 1), Math.max(0, Math.round(inSec * safeFps)));
}

/**
 * S5 — Keyframe Out in integer frames (clip-relative, inFrame + 1..durationFrames).
 */
export function resolveWhiteboardOutFrame(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction'>,
  durationFrames: number,
  fps: number,
): number {
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const outSec = resolveWhiteboardOutSeconds(settings, durationFrames, safeFps);
  return Math.min(durationFrames, Math.max(1, Math.round(outSec * safeFps)));
}

/**
 * S5 — Keyframe In as an effective fraction of the clip (0..1).
 */
export function whiteboardEffectiveInFraction(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction' | 'inSeconds' | 'inFraction'>,
  durationFrames: number,
  fps: number,
): number {
  if (settings.inFraction != null) {
    return Math.min(1, Math.max(0, settings.inFraction));
  }
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const totalSeconds = Math.max(1, Math.round(durationFrames)) / safeFps;
  const resolved = resolveWhiteboardInSeconds(settings, durationFrames, fps);
  return Math.min(1, Math.max(0, resolved / totalSeconds));
}

/**
 * S5 — draw progress (0..1) at any given clip-relative frame, respecting In and Out keyframes.
 * 0 before inFrame, linear ramp 0..1 between inFrame and outFrame, and 1 (hold) after outFrame.
 */
export function whiteboardProgressAtFrame(
  frame: number,
  inFrame: number,
  outFrame: number,
): number {
  if (frame <= inFrame) return 0;
  if (frame >= outFrame) return 1;
  const span = Math.max(1, outFrame - inFrame);
  return (frame - inFrame) / span;
}

/**
 * The draw window as a fraction of the clip — what the draw-time slider
 * edits and displays. Inverts {@link resolveWhiteboardDrawSeconds} for legacy
 * absolute-seconds documents so the slider lands where the render does.
 */
export function whiteboardEffectiveDrawFraction(
  settings: Pick<WhiteboardSettings, 'drawSeconds' | 'drawFraction'>,
  durationFrames: number,
  fps: number,
): number {
  if (settings.drawFraction != null) {
    return Math.min(1, Math.max(0.1, settings.drawFraction));
  }
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const totalSeconds = Math.max(1, Math.round(durationFrames)) / safeFps;
  const resolved = resolveWhiteboardDrawSeconds(settings, durationFrames, fps);
  return Math.min(1, Math.max(0.1, resolved / totalSeconds));
}

/** The effective row count — the one place `'wipe'` collapses to R=1. */
export function whiteboardRows(settings: Pick<WhiteboardSettings, 'pattern' | 'rows'>): number {
  if (settings.pattern === 'wipe') return 1;
  return Math.min(WHITEBOARD_MAX_ROWS, Math.max(WHITEBOARD_MIN_ROWS, Math.round(settings.rows)));
}

export interface WhiteboardRevealState {
  /** Fraction of the height fully revealed (the completed rows). */
  fullRowFraction: number;
  /** How far the current row's front has travelled, 0–1 of the width. */
  partialFraction: number;
  /** Top edge of the current row, as a fraction of the height. */
  rowTopFraction: number;
  /** Height of one row, as a fraction of the height. */
  rowHeightFraction: number;
  /** The pen tip — where the hand sits. `x` = partial front, `y` = current row's top. */
  frontX: number;
  frontY: number;
}

/**
 * The reveal at `progress` (0–1 of the draw window, clamped — the clamp is
 * what lets a clip hold the finished frame after `drawSeconds`).
 */
export function whiteboardRevealAt(progress: number, rows: number): WhiteboardRevealState {
  const p = Math.min(1, Math.max(0, progress));
  const r = Math.max(1, Math.round(rows));
  const scaled = p * r;
  const fullRows = Math.floor(scaled);
  const partial = scaled - fullRows;
  const rowHeightFraction = 1 / r;
  // At p=1 exactly, every row is complete and the "current row" is parked
  // past the last one with an empty partial — the same shape the ffmpeg
  // expressions produce (frac→0, plane covers the frame).
  const rowTopFraction = Math.min(1, fullRows * rowHeightFraction);
  return {
    fullRowFraction: rowTopFraction,
    partialFraction: p >= 1 ? 0 : partial,
    rowTopFraction,
    rowHeightFraction,
    frontX: p >= 1 ? 1 : partial,
    frontY: rowTopFraction,
  };
}

/**
 * The reveal as a CSS `clip-path` polygon (fractions × 100 = percentages) —
 * the preview's whole implementation. A serpentine reveal is one rectilinear
 * polygon: the full-width completed band plus the partial current row.
 */
export function whiteboardClipPath(progress: number, rows: number): string {
  const state = whiteboardRevealAt(progress, rows);
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const bandBottom = pct(state.fullRowFraction);
  const rowBottom = pct(Math.min(1, state.rowTopFraction + state.rowHeightFraction));
  const front = pct(state.partialFraction);
  if (state.fullRowFraction >= 1 || progress >= 1) {
    return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
  }
  // Completed band (full width, down to bandBottom), then the current row's
  // partial rectangle (0..front, bandBottom..rowBottom).
  return `polygon(0% 0%, 100% 0%, 100% ${bandBottom}, ${front} ${bandBottom}, ${front} ${rowBottom}, 0% ${rowBottom})`;
}

// ---------------------------------------------------------------------------
// S275 — the zone reveal. Same discipline as above: pure functions of
// progress, consumed by BOTH the ffmpeg zone-graph builder (which compiles
// their closed forms into `overlay` expressions) and the preview's stacked
// clip-path layers. If the two renderers ever disagree about a zone's front,
// the fix is here, once.

const clampZoneWeight = (weight: number | undefined): number => {
  if (weight === undefined || !Number.isFinite(weight)) return 1;
  return Math.min(WHITEBOARD_MAX_ZONE_WEIGHT, Math.max(WHITEBOARD_MIN_ZONE_WEIGHT, weight));
};

/**
 * The draw window partitioned across zones, weight-proportionally, as
 * **fractions of the window** `[start, end)` — the single timing arbiter.
 * The export multiplies by `drawSeconds`; the preview compares progress
 * directly. Windows are contiguous by construction and the last ends at 1.
 */
export function whiteboardZoneWindows(
  zones: readonly WhiteboardZone[],
): { start: number; end: number }[] {
  const weights = zones.map((zone) => clampZoneWeight(zone.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return zones.map(() => ({ start: 0, end: 1 }));
  const windows: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const end = i === weights.length - 1 ? 1 : cursor + weights[i] / total;
    windows.push({ start: cursor, end });
    cursor = end;
  }
  return windows;
}

export interface WhiteboardZoneTimeSlice {
  index: number;
  zone: WhiteboardZone;
  /** 0..1 fraction within the active drawing window [in, out] */
  startFraction: number;
  endFraction: number;
  /** Clip-relative frame numbers */
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  durationSeconds: number;
}

/**
 * S6 — Computes the exact clip-relative timeline frame and second windows for each zone.
 */
export function whiteboardZoneTimeSlices(
  zones: readonly WhiteboardZone[],
  inFrame: number,
  outFrame: number,
  fps: number,
): WhiteboardZoneTimeSlice[] {
  const windows = whiteboardZoneWindows(zones);
  const drawSpanFrames = Math.max(1, outFrame - inFrame);
  const safeFps = Math.max(1, Math.round(fps));

  return zones.map((zone, i) => {
    const win = windows[i] ?? { start: 0, end: 1 };
    const zoneStartFrame = Math.round(inFrame + win.start * drawSpanFrames);
    const zoneEndFrame = Math.round(inFrame + win.end * drawSpanFrames);
    const durFrames = Math.max(1, zoneEndFrame - zoneStartFrame);

    return {
      index: i,
      zone,
      startFraction: win.start,
      endFraction: win.end,
      startFrame: zoneStartFrame,
      endFrame: zoneEndFrame,
      durationFrames: durFrames,
      durationSeconds: durFrames / safeFps,
    };
  });
}

export interface WhiteboardZoneState {
  phase: 'pending' | 'active' | 'done';
  /** 0–1 within this zone's own window. */
  localProgress: number;
  /**
   * The visible region: the zone clipped at the sweep front (even-odd, like
   * every polygon here). `[]` while pending; the full zone once done.
   */
  clipPolygon: { x: number; y: number }[];
  /** The sweep front in normalized frame coordinates, on the sweep axis. */
  front: number;
}

/**
 * The sweep axis and travel of one zone: from its bounding box, along its
 * `sweep`. Exported because the ffmpeg zone graph compiles exactly this
 * closed form into its `overlay` expressions — the same numbers the preview
 * reads through `whiteboardZoneStateAt`.
 */
export function whiteboardZoneSweep(zone: WhiteboardZone): {
  axis: 'x' | 'y';
  from: number;
  to: number;
  keep: 'lte' | 'gte';
} {
  const bounds = polygonBounds(zone.points);
  switch (zone.sweep ?? 'lr') {
    case 'rl':
      return { axis: 'x', from: bounds.maxX, to: bounds.minX, keep: 'gte' };
    case 'tb':
      return { axis: 'y', from: bounds.minY, to: bounds.maxY, keep: 'lte' };
    default:
      return { axis: 'x', from: bounds.minX, to: bounds.maxX, keep: 'lte' };
  }
}

/** One zone's reveal state at overall draw progress (0–1 of the draw window, clamped). */
export function whiteboardZoneStateAt(
  progress: number,
  zones: readonly WhiteboardZone[],
  index: number,
): WhiteboardZoneState {
  const zone = zones[index];
  const window = whiteboardZoneWindows(zones)[index];
  const p = Math.min(1, Math.max(0, progress));
  const span = Math.max(1e-6, window.end - window.start);
  const local = Math.min(1, Math.max(0, (p - window.start) / span));
  const sweep = whiteboardZoneSweep(zone);
  const front = sweep.from + local * (sweep.to - sweep.from);
  if (local <= 0) return { phase: 'pending', localProgress: 0, clipPolygon: [], front };
  if (local >= 1) {
    return { phase: 'done', localProgress: 1, clipPolygon: zone.points.slice(), front };
  }
  return {
    phase: 'active',
    localProgress: local,
    clipPolygon: clipPolygonHalfPlane(zone.points, sweep.axis, front, sweep.keep),
    front,
  };
}

/** The zone state as a CSS clip-path, or `null` when there is nothing to show yet. */
export function whiteboardZoneClipPath(state: WhiteboardZoneState): string | null {
  return polygonClipPath(state.clipPolygon);
}

/**
 * The pen tip across the whole zone timeline, or `null` once drawing is complete:
 * - 'writing': the pen writes row-by-row across natural reading lines with carriage returns.
 * - 'scribble': the pen rapidly zigzags back and forth, shading the area with a marker.
 * - 'sketch': the pen traces the contour perimeter and interior linework.
 * - 'wipe': the pen rides the linear sweep front.
 */
export function whiteboardZoneFrontAt(
  progress: number,
  zones: readonly WhiteboardZone[],
): { x: number; y: number } | null {
  if (zones.length === 0) return null;
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return null;
  const windows = whiteboardZoneWindows(zones);
  let index = windows.findIndex((window) => p < window.end);
  if (index < 0) index = zones.length - 1;
  const state = whiteboardZoneStateAt(p, zones, index);
  const zone = zones[index];
  const local = state.localProgress;
  const bounds = polygonBounds(zone.points);
  const type = zone.type ?? 'sketch';

  if (type === 'writing') {
    const rows = Math.min(16, Math.max(2, zone.rows ?? 4));
    const pRow = local * rows;
    const r = Math.min(rows - 1, Math.floor(pRow));
    const f = pRow - r;
    const rowHeight = (bounds.maxY - bounds.minY) / rows;
    const yMid = bounds.minY + (r + 0.5) * rowHeight;
    // Writing sweep (0..0.88), carriage return (0.88..1.0)
    if (f < 0.88) {
      const x = bounds.minX + (f / 0.88) * (bounds.maxX - bounds.minX);
      return { x, y: yMid };
    }
    const ret = (f - 0.88) / 0.12;
    const x = bounds.maxX - ret * (bounds.maxX - bounds.minX);
    const y = yMid + ret * rowHeight;
    return { x, y: Math.min(bounds.maxY, y) };
  }

  if (type === 'scribble') {
    // Energetic zigzag shading across the zone bounding area
    const cycles = 14;
    const sweep = whiteboardZoneSweep(zone);
    const phase = local * cycles;
    const tri = 2 * Math.abs(phase - Math.floor(phase) - 0.5); // 0..1..0
    if (sweep.axis === 'x') {
      const x = sweep.from + local * (sweep.to - sweep.from);
      const y = bounds.minY + tri * (bounds.maxY - bounds.minY);
      return { x, y };
    }
    const y = sweep.from + local * (sweep.to - sweep.from);
    const x = bounds.minX + tri * (bounds.maxX - bounds.minX);
    return { x, y };
  }

  if (type === 'sketch' && zone.points.length >= 3) {
    // Contour-tracing: the stylus traces the perimeter of the zone polygon,
    // then performs an interior swirl fill
    if (local < 0.65) {
      const norm = local / 0.65;
      const ptIdx = norm * zone.points.length;
      const i = Math.floor(ptIdx) % zone.points.length;
      const next = (i + 1) % zone.points.length;
      const frac = ptIdx - Math.floor(ptIdx);
      const a = zone.points[i];
      const b = zone.points[next];
      return {
        x: a.x + frac * (b.x - a.x),
        y: a.y + frac * (b.y - a.y),
      };
    }
    const fillProg = (local - 0.65) / 0.35;
    const centroid = polygonCentroid(zone.points);
    const radius = 0.4 * (1 - fillProg) * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    const angle = fillProg * Math.PI * 6;
    return {
      x: centroid.x + radius * Math.cos(angle),
      y: centroid.y + radius * Math.sin(angle),
    };
  }

  // Fallback: classic linear directional wipe
  const sweep = whiteboardZoneSweep(zone);
  const centroid = polygonCentroid(zone.points);
  return sweep.axis === 'x' ? { x: state.front, y: centroid.y } : { x: centroid.x, y: state.front };
}
