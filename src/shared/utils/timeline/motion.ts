/**
 * Beta S228 — the motion model: one curve, two consumers.
 * Beta S229 — the editorial vocabulary on top of it: registers, rates, and
 * the preset family.
 *
 * Two layers, deliberately:
 *
 * - **`ClipMotion`** (stored, in `effects.motion`) is *parametric*: a preset
 *   name, a rate register, and the preset's own knobs. It stores the **rate**
 *   and never the travel — travel is `rate × holdSeconds`, derived at eval
 *   time and clamped, so a duration change re-derives the look instead of
 *   silently turning a crawl into a lurch. That is the audit's central rule
 *   (§3.2): constant *rate* is what makes 116 shots feel like one hand
 *   operating one camera.
 * - **`MotionCurve`** (resolved, internal) is *geometric*: `from`/`to`
 *   viewpoints, an easing, an optional sway field. `resolveMotionCurve`
 *   derives it from the parametric form plus the clip's duration and fps.
 *   `motionAt` is what the preview reads per rAF tick; `motionToZoompanExprs`
 *   emits the same arithmetic as `zoompan` expressions over `on` —
 *   `keyframes.ts`'s discipline, pinned frame-by-frame by
 *   `tests/unit/motion-agreement.test.ts`.
 *
 * No imports from `sequence.ts` or `effects.ts` on purpose — both import
 * *this* module, and a type-only cycle is still a cycle under the house dep
 * rules.
 */

// ---------------------------------------------------------------- registers

/**
 * Rate registers, in percent-of-frame per second — the audit's §3.2 table.
 * Tension is *slower* than ambient on purpose: a held breath, not a chase.
 */
export const MOTION_REGISTER_NAMES = [
  'tension',
  'ambient',
  'observation',
  'discovery',
  'survival',
] as const;
export type MotionRegister = (typeof MOTION_REGISTER_NAMES)[number];

export const MOTION_REGISTERS: Record<MotionRegister, number> = {
  tension: 0.18,
  ambient: 0.3,
  observation: 0.45,
  discovery: 0.6,
  survival: 1.2,
};

export const MOTION_REGISTER_LABELS: Record<MotionRegister, string> = {
  tension: 'Tension · 0.18 %/s',
  ambient: 'Ambient · 0.30 %/s',
  observation: 'Observation · 0.45 %/s',
  discovery: 'Discovery · 0.60 %/s',
  survival: 'Survival · 1.20 %/s',
};

/** Hard caps, un-overridable: past these a full-frame still in motion is uncomfortable, and there is no story reason to go there. */
export const MAX_MOTION_RATE_PCT_PER_SEC = 2;
export const MIN_MOTION_RATE_PCT_PER_SEC = 0.02;
export const MAX_MOTION_TRAVEL_PCT = 12;

// ------------------------------------------------------------------ presets

export const MOTION_PRESETS = [
  'hold',
  'push_in',
  'pull_out',
  'drift',
  'push_to_point',
  'settle',
  'arrive',
  'breathe',
  'float',
  'reframe',
] as const;
export type MotionPresetName = (typeof MOTION_PRESETS)[number];

export const MOTION_PRESET_LABELS: Record<MotionPresetName, string> = {
  hold: 'Hold',
  push_in: 'Push in',
  pull_out: 'Pull out',
  drift: 'Drift',
  push_to_point: 'Push to point',
  settle: 'Settle',
  arrive: 'Arrive',
  breathe: 'Breathe',
  float: 'Float',
  reframe: 'Reframe A→B',
};

export const MOTION_DIRECTIONS = [
  'left',
  'right',
  'up',
  'down',
  'up_left',
  'up_right',
  'down_left',
  'down_right',
] as const;
export type MotionDirection = (typeof MOTION_DIRECTIONS)[number];

export const MOTION_DIRECTION_LABELS: Record<MotionDirection, string> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  up_left: 'Up-left',
  up_right: 'Up-right',
  down_left: 'Down-left',
  down_right: 'Down-right',
};

/**
 * The stored form — what `effects.motion` holds and the inspector writes.
 * The rate comes from `register` unless `ratePctPerSec` overrides it
 * (`custom` in the UI). Preset-specific knobs are optional and ignored by
 * the presets that don't read them.
 */
export interface ClipMotion {
  preset: MotionPresetName;
  /** Default `'ambient'`. */
  register?: MotionRegister;
  /** Custom rate, %/s — wins over the register when set. Clamped hard. */
  ratePctPerSec?: number;
  /** `drift` only. Default `'right'`. */
  direction?: MotionDirection;
  /** `push_to_point` only — the picked detail, 0–1 of the source. */
  point?: { x: number; y: number };
  /** `float` only — the sway's deterministic identity. */
  seed?: number;
  /** Ease length at each end for the ramped presets. Default {@link MOTION_DEFAULT_RAMP_FRAMES}. */
  rampFrames?: number;
  /**
   * S237 — `reframe` only: the two authored viewports. The deliberate
   * exception to rate-not-amount: a reframe is a *composition*, not a
   * rate-driven move — a duration change alters its speed and keeps its
   * framing, which is what recomposition means. The comfort cap still
   * applies as a preflight warning (`motion_rate_exceeded`), never a clamp.
   */
  from?: MotionViewpoint;
  to?: MotionViewpoint;
}

// ------------------------------------------------------- the resolved curve

/** A viewport over the source: centre in normalised coordinates, `scale` >= 1 pushed in. */
export interface MotionViewpoint {
  /** Viewport centre, 0–1 of the source. 0.5/0.5 = centred. */
  x: number;
  y: number;
  /** 1 = the viewport is the whole frame; 1.12 = pushed in 12%. */
  scale: number;
}

export type MotionEasing =
  | 'linear'
  | 'ramped'
  | 'sine'
  | 'hold'
  | 'settle'
  | 'arrive'
  | 'breathe';

/** One sinusoid of the float preset's sway — fully numeric, so both emitters just sum sines of the frame counter. */
export interface SwayComponent {
  /** Amplitude, fraction of the frame. */
  amp: number;
  /** Angular velocity, radians per frame (fps baked in at resolve time). */
  omega: number;
  phase: number;
}

/**
 * The resolved, geometric curve — everything the emitters need and nothing
 * the author sees. Produced by {@link resolveMotionCurve}; consumed by
 * {@link motionAt} and {@link motionToPerspectiveExprs}.
 */
export interface MotionCurve {
  from: MotionViewpoint;
  to: MotionViewpoint;
  easing: MotionEasing;
  rampFrames?: number;
  /** `float`'s seeded drift — added to the centre after the lerp, before the clamp. */
  sway?: { x: SwayComponent[]; y: SwayComponent[] };
  /**
   * S237 — a decaying head offset: the match dissolve's alignment. The
   * centre starts displaced by (dx, dy) and eases linearly to the curve's
   * own path over `frames` frames. Added before the clamp, like sway.
   */
  nudge?: { dx: number; dy: number; frames: number };
}

export const MOTION_DEFAULT_RAMP_FRAMES = 12;

/** The S154 travel: 12% reads as motion without looking like a push-in. */
export const LEGACY_MOTION_TRAVEL = 0.12;

const CENTRE = { x: 0.5, y: 0.5 };

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// -------------------------------------------------------------- resolution

/** The rate a stored motion actually plays at, %/s, after the register and the hard caps. */
export function motionRatePctPerSec(motion: ClipMotion): number {
  const rate = motion.ratePctPerSec ?? MOTION_REGISTERS[motion.register ?? 'ambient'];
  return clamp(rate, MIN_MOTION_RATE_PCT_PER_SEC, MAX_MOTION_RATE_PCT_PER_SEC);
}

/** Travel over the hold, %, derived and clamped — never stored (§3.2). */
export function motionTravelPct(motion: ClipMotion, durationFrames: number, fps: number): number {
  const seconds = Math.max(0, durationFrames) / Math.max(1, fps);
  return Math.min(motionRatePctPerSec(motion) * seconds, MAX_MOTION_TRAVEL_PCT);
}

const DRIFT_VECTORS: Record<MotionDirection, { x: number; y: number }> = (() => {
  const d = Math.SQRT1_2;
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    up_left: { x: -d, y: -d },
    up_right: { x: d, y: -d },
    down_left: { x: -d, y: d },
    down_right: { x: d, y: d },
  };
})();

/** A deterministic phase in [0, 2π) from the seed and a component index — mulberry-style integer mixing, identical everywhere. */
function seededPhase(seed: number, index: number): number {
  let h = (Math.trunc(seed) + index * 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h / 0x100000000) * 2 * Math.PI;
}

/** Float's frequency stack, Hz — different per axis so the path never closes into a visible loop. */
const SWAY_FREQS_HZ = { x: [0.11, 0.23, 0.05], y: [0.13, 0.29, 0.07] };
const SWAY_WEIGHTS = [0.5, 0.3, 0.2];

function buildSway(amplitude: number, seed: number, fps: number): MotionCurve['sway'] {
  const axis = (freqs: number[], base: number): SwayComponent[] =>
    freqs.map((hz, index) => ({
      amp: amplitude * SWAY_WEIGHTS[index],
      omega: (2 * Math.PI * hz) / Math.max(1, fps),
      phase: seededPhase(seed, base + index),
    }));
  return { x: axis(SWAY_FREQS_HZ.x, 0), y: axis(SWAY_FREQS_HZ.y, 3) };
}

/**
 * The parametric form made geometric, against this clip's own hold. `'hold'`
 * resolves to `undefined` — the deliberate freeze is the *absence* of a
 * curve, which is also what routes the render down the byte-identical static
 * path.
 */
export function resolveMotionCurve(
  motion: ClipMotion,
  durationFrames: number,
  fps: number,
): MotionCurve | undefined {
  if (motion.preset === 'hold') return undefined;
  const travel = motionTravelPct(motion, durationFrames, fps) / 100;
  const ramp = motion.rampFrames ?? MOTION_DEFAULT_RAMP_FRAMES;

  switch (motion.preset) {
    case 'push_in':
      return {
        from: { ...CENTRE, scale: 1 },
        to: { ...CENTRE, scale: 1 + travel },
        easing: 'ramped',
        rampFrames: ramp,
      };
    case 'pull_out':
      return {
        from: { ...CENTRE, scale: 1 + travel },
        to: { ...CENTRE, scale: 1 },
        easing: 'ramped',
        rampFrames: ramp,
      };
    case 'drift': {
      const vector = DRIFT_VECTORS[motion.direction ?? 'right'];
      const axisTravel = Math.max(Math.abs(vector.x), Math.abs(vector.y)) * travel;
      // The least zoom that gives the travel room: pannable range is 1−1/z,
      // so z = 1/(1−a) crosses exactly the picture the drift needs and no more.
      const scale = 1 / Math.max(1e-6, 1 - Math.min(axisTravel, 0.5));
      return {
        from: { x: 0.5 - (vector.x * travel) / 2, y: 0.5 - (vector.y * travel) / 2, scale },
        to: { x: 0.5 + (vector.x * travel) / 2, y: 0.5 + (vector.y * travel) / 2, scale },
        easing: 'ramped',
        rampFrames: ramp,
      };
    }
    case 'push_to_point': {
      const point = motion.point ?? CENTRE;
      return {
        from: { ...CENTRE, scale: 1 },
        // motionAt's centre clamp keeps the window inside the source at
        // every intermediate zoom, so an edge point is safe to store.
        to: { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1), scale: 1 + travel },
        easing: 'ramped',
        rampFrames: ramp,
      };
    }
    case 'settle':
      // Arrival: the move spends itself in the first fifth, then the frame
      // can be read. Geometry is a pull to rest.
      return {
        from: { ...CENTRE, scale: 1 + travel },
        to: { ...CENTRE, scale: 1 },
        easing: 'settle',
      };
    case 'arrive':
      // Settle's mirror: still for the first 70%, then the camera notices.
      return {
        from: { ...CENTRE, scale: 1 },
        to: { ...CENTRE, scale: 1 + travel },
        easing: 'arrive',
      };
    case 'breathe':
      // Out-and-back, total travel halved (§3.3) — the honest answer to a
      // 17.5s hold, where a one-way move would over-travel.
      return {
        from: { ...CENTRE, scale: 1 },
        to: { ...CENTRE, scale: 1 + travel / 2 },
        easing: 'breathe',
      };
    case 'reframe': {
      // Authored geometry, ramped like every directional move. Falls back
      // to a hold-in-place when the viewports are missing (a half-authored
      // reframe must not lurch).
      const from = motion.from ?? { ...CENTRE, scale: 1 };
      const to = motion.to ?? from;
      return {
        from: { x: clamp(from.x, 0, 1), y: clamp(from.y, 0, 1), scale: clamp(from.scale, 1, 4) },
        to: { x: clamp(to.x, 0, 1), y: clamp(to.y, 0, 1), scale: clamp(to.scale, 1, 4) },
        easing: 'ramped',
        rampFrames: ramp,
      };
    }
    case 'float': {
      // Aliveness with no directional statement: seeded low-frequency sway,
      // no net travel. Zoomed just enough that the sway has room.
      const amplitude = travel / 2;
      const scale = 1 / Math.max(1e-6, 1 - Math.min(2 * amplitude, 0.5));
      const viewpoint = { ...CENTRE, scale };
      return {
        from: viewpoint,
        to: viewpoint,
        easing: 'hold',
        sway: buildSway(amplitude, motion.seed ?? 0, fps),
      };
    }
    default:
      return undefined;
  }
}

/**
 * The five S154 presets as viewport pairs — identical intent, one model.
 * Legacy motion is amount-based (a fixed 12% regardless of hold), which is
 * exactly the lurch/crawl pathology the registers replace — but an existing
 * document keeps rendering what it rendered.
 */
export function motionFromLegacyPreset(preset: string): MotionCurve | undefined {
  const zoom = 1 + LEGACY_MOTION_TRAVEL;
  const half = 1 / (2 * zoom);
  switch (preset) {
    case 'zoom_in':
      return { from: { ...CENTRE, scale: 1 }, to: { ...CENTRE, scale: zoom }, easing: 'linear' };
    case 'zoom_out':
      return { from: { ...CENTRE, scale: zoom }, to: { ...CENTRE, scale: 1 }, easing: 'linear' };
    case 'pan_lr':
      return {
        from: { x: half, y: 0.5, scale: zoom },
        to: { x: 1 - half, y: 0.5, scale: zoom },
        easing: 'linear',
      };
    case 'pan_rl':
      return {
        from: { x: 1 - half, y: 0.5, scale: zoom },
        to: { x: half, y: 0.5, scale: zoom },
        easing: 'linear',
      };
    default:
      return undefined;
  }
}

/**
 * What a clip actually plays: an authored `effects.motion` wins (resolved
 * against this clip's hold), else the legacy preset column. Callers pass the
 * pieces because this module cannot name `SequenceClip` (see the header).
 */
export function resolveClipMotion(
  legacyPreset: string,
  authored: ClipMotion | undefined,
  durationFrames: number,
  fps: number,
): MotionCurve | undefined {
  return authored
    ? resolveMotionCurve(authored, durationFrames, fps)
    : motionFromLegacyPreset(legacyPreset);
}

// ------------------------------------------------------------ the closed form

/**
 * The ramp profile's constants, shared by the closed form and the emitted
 * expression so the two cannot drift: linear ramps of `r` frames at each end,
 * constant velocity `v` between, total distance exactly 1 over `span` frames.
 */
function rampConstants(span: number, rampFrames: number): { r: number; v: number } {
  const r = clamp(Math.round(rampFrames), 0, Math.floor(span / 2));
  return { r, v: 1 / (span - r) };
}

/** Settle spends the move in the first fifth; arrive holds still until the last three-tenths. */
const SETTLE_FRACTION = 0.2;
const ARRIVE_FRACTION = 0.7;

/** Eased progress at frame `f` of a `span`-frame move. Pure and closed-form. */
function easedProgress(easing: MotionEasing, f: number, span: number, rampFrames: number): number {
  const p = clamp(f / span, 0, 1);
  switch (easing) {
    case 'hold':
      return 0;
    case 'sine':
      return (1 - Math.cos(Math.PI * p)) / 2;
    case 'breathe':
      return (1 - Math.cos(2 * Math.PI * p)) / 2;
    case 'settle': {
      if (p >= SETTLE_FRACTION) return 1;
      const remain = 1 - p / SETTLE_FRACTION;
      return 1 - remain * remain;
    }
    case 'arrive': {
      if (p <= ARRIVE_FRACTION) return 0;
      const into = (p - ARRIVE_FRACTION) / (1 - ARRIVE_FRACTION);
      return into * into;
    }
    case 'ramped': {
      const { r, v } = rampConstants(span, rampFrames);
      if (r <= 0) return p;
      const frame = clamp(f, 0, span);
      if (frame <= r) return (v * frame * frame) / (2 * r);
      if (frame <= span - r) return v * (frame - r / 2);
      return 1 - (v * (span - frame) * (span - frame)) / (2 * r);
    }
    default:
      return p;
  }
}

function swayOffset(components: SwayComponent[] | undefined, frame: number): number {
  if (!components) return 0;
  let offset = 0;
  for (const { amp, omega, phase } of components) offset += amp * Math.sin(omega * frame + phase);
  return offset;
}

/**
 * The viewport at a clip-relative frame — the one arbiter of where the
 * picture is. The centre is clamped so the viewport never leaves the source
 * (`cx ± 1/(2z)` stays inside 0..1), which is the same clamp the emitted
 * pixel expression applies — equivalent because the map is monotone.
 */
export function motionAt(motion: MotionCurve, frame: number, durationFrames: number): MotionViewpoint {
  const span = Math.max(1, Math.round(durationFrames) - 1);
  const progress = easedProgress(
    motion.easing,
    frame,
    span,
    motion.rampFrames ?? MOTION_DEFAULT_RAMP_FRAMES,
  );
  const lerp = (from: number, to: number): number => from + (to - from) * progress;
  const scale = Math.max(1, lerp(motion.from.scale, motion.to.scale));
  const half = 1 / (2 * scale);
  const decay = motion.nudge
    ? Math.max(0, 1 - frame / Math.max(1, motion.nudge.frames))
    : 0;
  return {
    x: clamp(
      lerp(motion.from.x, motion.to.x) +
        swayOffset(motion.sway?.x, frame) +
        (motion.nudge?.dx ?? 0) * decay,
      half,
      1 - half,
    ),
    y: clamp(
      lerp(motion.from.y, motion.to.y) +
        swayOffset(motion.sway?.y, frame) +
        (motion.nudge?.dy ?? 0) * decay,
      half,
      1 - half,
    ),
    scale,
  };
}

// ----------------------------------------------------------- the expressions

/** Fixed-precision numeric literal for an expression — enough for sub-pixel agreement at 8K. */
function num(value: number): string {
  return value.toFixed(6);
}

/** The eased-progress expression over zoompan's output-frame counter `on`. */
/**
 * Beta S256 — `frame` is the expression for the clip-relative frame index.
 * `zoompan` exposed it as `on` counting from 0; `perspective` also calls it
 * `on` but counts from **1**, so its emitter passes `(on-1)`. Threading the
 * token through is what keeps the curve written once.
 */
function progressExpr(easing: MotionEasing, span: number, rampFrames: number, frame: string): string {
  const p = `clip(${frame}/${span},0,1)`;
  switch (easing) {
    case 'hold':
      return '0';
    case 'sine':
      return `(1-cos(PI*${p}))/2`;
    case 'breathe':
      return `(1-cos(2*PI*${p}))/2`;
    case 'settle':
      return `if(lt(${p},${SETTLE_FRACTION}),1-(1-${p}/${SETTLE_FRACTION})*(1-${p}/${SETTLE_FRACTION}),1)`;
    case 'arrive':
      return `if(lt(${p},${ARRIVE_FRACTION}),0,((${p}-${ARRIVE_FRACTION})/${num(1 - ARRIVE_FRACTION)})*((${p}-${ARRIVE_FRACTION})/${num(1 - ARRIVE_FRACTION)}))`;
    case 'ramped': {
      const { r, v } = rampConstants(span, rampFrames);
      if (r <= 0) return p;
      const f = `clip(${frame},0,${span})`;
      return (
        `if(lt(${f},${r}),${num(v / (2 * r))}*${f}*${f},` +
        `if(lt(${f},${span - r}),${num(v)}*(${f}-${num(r / 2)}),` +
        `1-${num(v / (2 * r))}*(${span}-${f})*(${span}-${f})))`
      );
    }
    default:
      return p;
  }
}

function swayExpr(components: SwayComponent[] | undefined, frame: string): string {
  if (!components || components.length === 0) return '';
  return components
    .map(({ amp, omega, phase }) => `+${num(amp)}*sin(${num(omega)}*${frame}+${num(phase)})`)
    .join('');
}

/**
 * The crop window as the eight corner coordinates ffmpeg's `perspective`
 * filter takes — top-left, top-right, bottom-left, bottom-right — in pixels
 * of the frame it is given (`W`x`H`), as expressions over the output frame.
 */
export interface PerspectiveExprs {
  x0: string;
  y0: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  x3: string;
  y3: string;
}

/**
 * `perspective` numbers its output frames from 1 where the curve (and
 * `motionAt`) number from 0. Measured, not read: a quad sliding `10*on` per
 * frame rendered frame 0 at the position a static quad at 10 renders — so
 * without this every move would start one frame in.
 */
const PERSPECTIVE_FRAME = '(on-1)';

/**
 * Beta S256 — the same curve as `perspective` corner expressions.
 *
 * ## Why `perspective` and not `zoompan`
 *
 * `zoompan` resolves its crop window to **integer input pixels**, so a slow
 * move steps in whole pixels and judders (S228's A2.2). The only defence was
 * to supersample the input until a pixel was small enough not to show — and
 * at 6x that meant resampling a ~68-megapixel crop per output frame, on one
 * thread, to produce a 2-megapixel picture. On the sequence that exposed it
 * a 13-second still took 292 seconds.
 *
 * `perspective` takes the window as **float coordinates** and interpolates at
 * 1/256 px. That is the sub-pixel placement the supersample was imitating,
 * done natively: measured on the same still, 46s instead of 292s, a
 * frame-to-frame jitter of 2.2% instead of 20.4%, and a sharper picture,
 * because the frame is resampled once rather than up six times and back.
 *
 * The clamp is the same one `motionAt` applies to the centre, in pixel space;
 * the map between them is monotone, so both land on the same window.
 */
export function motionToPerspectiveExprs(motion: MotionCurve, durationFrames: number): PerspectiveExprs {
  const frame = PERSPECTIVE_FRAME;
  const span = Math.max(1, Math.round(durationFrames) - 1);
  const progress = progressExpr(
    motion.easing,
    span,
    motion.rampFrames ?? MOTION_DEFAULT_RAMP_FRAMES,
    frame,
  );
  const lerp = (from: number, to: number): string =>
    from === to ? num(from) : `(${num(from)}+${num(to - from)}*${progress})`;
  const nudgeExpr = (delta: number): string => {
    if (!motion.nudge || delta === 0) return '';
    const frames = Math.max(1, Math.round(motion.nudge.frames));
    return `+${num(delta)}*max(0,1-${frame}/${frames})`;
  };
  const centre = (
    from: number,
    to: number,
    sway: SwayComponent[] | undefined,
    delta: number,
  ): string => {
    const tail = `${swayExpr(sway, frame)}${nudgeExpr(delta)}`;
    return tail ? `(${lerp(from, to)}${tail})` : lerp(from, to);
  };
  const zoom = `max(1,${lerp(motion.from.scale, motion.to.scale)})`;
  const cropW = `(W/${zoom})`;
  const cropH = `(H/${zoom})`;
  const left = `clip(W*${centre(motion.from.x, motion.to.x, motion.sway?.x, motion.nudge?.dx ?? 0)}-${cropW}/2,0,W-${cropW})`;
  const top = `clip(H*${centre(motion.from.y, motion.to.y, motion.sway?.y, motion.nudge?.dy ?? 0)}-${cropH}/2,0,H-${cropH})`;
  return {
    x0: left,
    y0: top,
    x1: `${left}+${cropW}`,
    y1: top,
    x2: left,
    y2: `${top}+${cropH}`,
    x3: `${left}+${cropW}`,
    y3: `${top}+${cropH}`,
  };
}

// ------------------------------------------------------------- measurements

/**
 * S237 — the largest edge travel of the crop window over the whole move, as
 * a fraction of the frame. The window's edges move differently when the
 * zoom changes, so all four are measured. Feeds the comfort-cap preflight
 * (`motion_rate_exceeded`).
 */
export function motionEdgeTravelFraction(motion: MotionCurve): number {
  const edges = (viewpoint: MotionViewpoint): number[] => {
    const half = 1 / (2 * viewpoint.scale);
    return [viewpoint.x - half, viewpoint.x + half, viewpoint.y - half, viewpoint.y + half];
  };
  const from = edges(motion.from);
  const to = edges(motion.to);
  return Math.max(...from.map((edge, index) => Math.abs(to[index] - edge)));
}

/** The deepest zoom the move reaches — what the source-resolution guard measures against. */
export function motionPeakScale(motion: MotionCurve): number {
  return Math.max(motion.from.scale, motion.to.scale, 1);
}

/**
 * The viewport as a CSS transform for the preview's media element. The
 * element shows the whole source; scaling by `z` about the centre and
 * translating so the viewport centre lands mid-frame reproduces the crop —
 * `scale(z) translate(d)` applies the translate first, so a point `p`
 * (normalised, centre-relative) lands at `z·(p+d)`, and `d = 0.5 − c` puts
 * the viewport centre at zero. The percentages are of the element's own box,
 * which is why the preview pairs this with cover-fit — the same reason the
 * export crops instead of padding a moving clip.
 */
export function motionCssTransform(viewpoint: MotionViewpoint): string {
  const dx = ((0.5 - viewpoint.x) * 100).toFixed(3);
  const dy = ((0.5 - viewpoint.y) * 100).toFixed(3);
  return `scale(${viewpoint.scale.toFixed(4)}) translate(${dx}%, ${dy}%)`;
}

/**
 * S237 — the match dissolve's alignment, composed onto whatever the incoming
 * clip already does. At the transition's first frame the incoming viewport
 * centres so its `inPoint` lands where the outgoing frame held `outPoint`
 * (`c = 0.5 + in − out`), easing linearly to the clip's own path over the
 * window. A static clip synthesises just enough zoom to give the offset
 * room (`z = 1/(1−2a)` — a translate at zoom 1 has nowhere to go); a moving
 * clip keeps its zoom and the per-frame clamp honestly limits what the
 * headroom cannot afford — identically in both consumers, because this is
 * one function and `motionAt` is one clamp.
 */
export function composeMatchNudge(
  curve: MotionCurve | undefined,
  outPoint: { x: number; y: number },
  inPoint: { x: number; y: number },
  frames: number,
): MotionCurve {
  const dx = clamp(inPoint.x - outPoint.x, -0.5, 0.5);
  const dy = clamp(inPoint.y - outPoint.y, -0.5, 0.5);
  const window = Math.max(1, Math.round(frames));
  if (curve) return { ...curve, nudge: { dx, dy, frames: window } };
  const amplitude = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), 0.4);
  const scale = 1 / Math.max(1e-6, 1 - 2 * amplitude);
  const viewpoint = { ...CENTRE, scale: Math.max(1.02, scale) };
  return { from: viewpoint, to: viewpoint, easing: 'hold', nudge: { dx, dy, frames: window } };
}
