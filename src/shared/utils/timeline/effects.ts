import { z } from 'zod';

import {
  MAX_MOTION_RATE_PCT_PER_SEC,
  MIN_MOTION_RATE_PCT_PER_SEC,
  MOTION_DIRECTIONS,
  MOTION_PRESETS,
  MOTION_REGISTER_NAMES,
  type ClipMotion,
} from './motion';
import {
  WHITEBOARD_MAX_ROWS,
  WHITEBOARD_MAX_ZONES,
  WHITEBOARD_MAX_ZONE_POINTS,
  WHITEBOARD_MAX_CADENCE_FPS,
  WHITEBOARD_MIN_CADENCE_FPS,
  WHITEBOARD_MIN_DRAW_SECONDS,
  WHITEBOARD_MAX_ZONE_WEIGHT,
  WHITEBOARD_MIN_ZONE_WEIGHT,
  type WhiteboardSettings,
} from './whiteboard';

/**
 * Beta S154 phase 3 — per-clip effects: colour correction and speed.
 *
 * One module, two consumers, one source of truth: `buildColorFilterChain`
 * feeds ffmpeg and `buildCssFilter` feeds the preview, both reading the same
 * `ClipEffects`, both returning `''` for a neutral object — so **a clip with
 * no effects emits byte-identical ffmpeg args to what shipped before this
 * phase** (S151 F3's compatibility posture for `afade`, applied again). A
 * test pins the neutrality and the agreement.
 *
 * Scope note (`Beta_S145` §2's grading refusal, honoured in spirit): the
 * preset system grades *look* at generation time, upstream. What lands here
 * is per-clip **correction** — matching two shots that rendered differently —
 * not a competing grade. No LUTs.
 *
 * **Speed is a source-consumption rate, never a duration mutation.** The clip
 * occupies exactly `durationFrames` on the timeline; `speed` only decides how
 * much source is consumed to fill it (`-t duration*speed` on input,
 * `setpts=PTS/speed` / `atempo` on the chain). Every arithmetic in
 * `layoutTrack`, `join()`, `snapTargets` and the OTIO export is untouched —
 * which is the answer to S145 §2's "setpts + atempo drift against each other
 * and break every duration in the document".
 */

export const MIN_CLIP_SPEED = 0.25;
export const MAX_CLIP_SPEED = 4;

export interface ClipColorFilters {
  /** -1..1, 0 neutral — `eq=brightness`. */
  brightness?: number;
  /** 0..3, 1 neutral — `eq=contrast`. */
  contrast?: number;
  /** 0..3, 1 neutral — `eq=saturation`. */
  saturation?: number;
  /** 0.1..10, 1 neutral — `eq=gamma`. Export-only; CSS has no gamma. */
  gamma?: number;
  /** Degrees, -180..180, 0 neutral — `hue=h`. */
  hue?: number;
  /** 0..1, 0 neutral — `unsharp` amount. Export-only. */
  sharpen?: number;
  /** 0..1, 0 neutral — `vignette` strength. Export-only. */
  vignette?: number;
}

/**
 * S154 phase 5 — a text clip's content. Rides in `effects_json` rather than
 * its own table: a text clip is still a clip (track, order, duration,
 * transition), and every column already applies.
 *
 * Positions are **fractions of the frame** so a geometry change never moves a
 * title; the pixel font size is authored against the sequence height and
 * scaled by both renderers.
 */
export interface TextContent {
  /** Multi-line. At render it is written to a `textfile=` — never inlined into the filter (escaping trap). */
  text: string;
  /** Authored against the sequence height; both consumers scale it. */
  fontSizePx: number;
  /** #rrggbb. */
  colorHex: string;
  align: 'left' | 'center' | 'right';
  /** 0–1 of the frame; `anchor` names which edge of the block `y` pins. */
  positionPct: { x: number; y: number };
  /**
   * S160 (owner item 9) — the block's vertical anchor: which edge `y`
   * positions. Absent = `'middle'`, the only behaviour that existed before
   * (both renderers hardcoded the centre line), so existing documents render
   * unchanged.
   */
  anchor?: 'top' | 'middle' | 'bottom';
  /** A backing box behind the text — the caption look. */
  box?: { colorHex: string; opacity: number; paddingPx: number };
  preset: 'title' | 'lower_third' | 'caption';
}

/** S160 — what the inspector's box toggle stamps on first enable. */
export const DEFAULT_TEXT_BOX: NonNullable<TextContent['box']> = {
  colorHex: '#000000',
  opacity: 0.5,
  paddingPx: 12,
};

export const TEXT_PRESETS: Record<TextContent['preset'], Omit<TextContent, 'text'>> = {
  title: {
    fontSizePx: 96,
    colorHex: '#ffffff',
    align: 'center',
    positionPct: { x: 0.5, y: 0.4 },
    preset: 'title',
  },
  lower_third: {
    fontSizePx: 48,
    colorHex: '#ffffff',
    align: 'left',
    positionPct: { x: 0.08, y: 0.85 },
    box: { colorHex: '#000000', opacity: 0.55, paddingPx: 16 },
    preset: 'lower_third',
  },
  caption: {
    fontSizePx: 44,
    colorHex: '#ffffff',
    align: 'center',
    positionPct: { x: 0.5, y: 0.9 },
    box: { colorHex: '#000000', opacity: 0.45, paddingPx: 12 },
    preset: 'caption',
  },
};

/**
 * S154 phase 6 — an overlay clip's static placement: picture-in-picture.
 *
 * `scale` is a fraction of the frame (1 = full frame); `x`/`y` are the
 * clip's **centre**, as fractions. Statics on purpose: animated scale is the
 * spine's Ken Burns chain, which does not carry alpha, so a PiP is placed and
 * sized here and *moved* with `x`/`y` keyframes — the actual storyteller
 * need, and the promise that renders correctly on the first try.
 */
export interface ClipTransform {
  /** 0.05–1 of the frame. @default 1 */
  scale?: number;
  /** Centre, 0–1 of the frame. @default 0.5 */
  x?: number;
  y?: number;
  /** 0–1. Static — see the keyframes module for why there is no opacity curve. @default 1 */
  opacity?: number;
}

export interface ClipEffects {
  /** Source-consumption rate. 1 (or absent) = normal. */
  speed?: number;
  filters?: ClipColorFilters;
  /** Present exactly when `sourceKind === 'text'`. */
  text?: TextContent;
  /** Overlay-track clips only — the spine is the base and has nowhere to move. */
  transform?: ClipTransform;
  /**
   * S161 — hand-drawn (whiteboard) reveal. Stills only: the still routes
   * through `whiteboard-segment.ts` instead of the Ken Burns path, and the
   * two are mutually exclusive (`motionPreset` is forced to `'none'` when
   * this is set — a pan of a picture the reveal claims is unfinished).
   * Unrelated to the `style_whiteboard` *prompt* preset, which asks Flow to
   * generate hand-drawn-looking footage and never touches the render.
   */
  whiteboard?: WhiteboardSettings;
  /**
   * Beta S227 — the **video** fade primitive. `fadeInFrames`/`fadeOutFrames`
   * on the clip row have always been audio-only (they reach `afade` and
   * nothing else); until this field the render graph had no way to fade
   * picture at all. `holdBlackFrames` keeps the last N frames fully at the
   * fade colour — a held black is an act break, distinct from a dip, and it
   * spends no timeline length because it lives inside the clip's own tail.
   */
  videoFade?: ClipVideoFade;
  /**
   * Beta S230 — parameters for this clip's **in**-transition, where the type
   * alone is not enough: the asymmetric dissolve's out/in ratio, the dip and
   * flash colour, the flash length. Rides here rather than on new clip
   * columns for the same reason every other parameter block does.
   */
  transition?: ClipTransitionParams;
  /**
   * Beta S228/S229 — the authored move (stills only), overriding the legacy
   * `motionPreset` column when present. Parametric: preset + register + the
   * preset's knobs; the geometry derives from the clip's own hold at eval
   * time. `resolveClipMotion` in `motion.ts` is the arbiter; the render and
   * the preview both read the same `motionAt` curve, which is the whole
   * point of the model.
   */
  motion?: ClipMotion;
}

/** S230 — a flash is 1–3 frames, capped in the schema so it cannot be misused into a dip. */
export const FLASH_FRAMES_MAX = 3;

/** S230 — export-side literals, not theme colours: the classic flash is white, the classic dip is black. */
export const FLASH_DEFAULT_COLOR_HEX = '#ffffff';
export const DIP_DEFAULT_COLOR_HEX = '#000000';

export interface ClipTransitionParams {
  /**
   * Asymmetric dissolve: the fraction of the window the outgoing image takes
   * to leave. 0.3 = "leaves fast, arrives slow" — the memory/echo grammar.
   */
  outInRatio?: number;
  /** Dip-to-colour and flash-frame colour. `#rrggbb`. */
  colorHex?: string;
  /** Flash length, 1–3 frames. Capped in the schema so it cannot become a dip. */
  flashFrames?: number;
  /** S237 — match dissolve: where the shared subject sits on each side. */
  match?: { out: { x: number; y: number }; in: { x: number; y: number } };
}

export interface ClipVideoFade {
  /** Frames fading up from black at the clip's head. */
  inFrames?: number;
  /** Frames fading down at the clip's tail (before any hold). */
  outFrames?: number;
  /** Frames held fully at the fade colour after the fade-out completes. */
  holdBlackFrames?: number;
}

export const PIP_PRESETS: Record<string, ClipTransform> = {
  full: {},
  right_half: { scale: 0.5, x: 0.75, y: 0.5 },
  corner_tl: { scale: 0.33, x: 0.2, y: 0.22 },
  corner_tr: { scale: 0.33, x: 0.8, y: 0.22 },
  corner_bl: { scale: 0.33, x: 0.2, y: 0.78 },
  corner_br: { scale: 0.33, x: 0.8, y: 0.78 },
};

const boundedNumber = (min: number, max: number) => z.number().min(min).max(max);

/** S237 — a viewport for reframe's schema: centre in-frame, zoom bounded well past taste. */
const motionViewpointSchema = z
  .object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1), scale: boundedNumber(1, 4) })
  .strict();

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);


/** The trust-boundary shape — reused by `ipc-schemas` and the repository's defensive parse. */
export const clipEffectsSchema = z
  .object({
    speed: boundedNumber(MIN_CLIP_SPEED, MAX_CLIP_SPEED).optional(),
    filters: z
      .object({
        brightness: boundedNumber(-1, 1).optional(),
        contrast: boundedNumber(0, 3).optional(),
        saturation: boundedNumber(0, 3).optional(),
        gamma: boundedNumber(0.1, 10).optional(),
        hue: boundedNumber(-180, 180).optional(),
        sharpen: boundedNumber(0, 1).optional(),
        vignette: boundedNumber(0, 1).optional(),
      })
      .optional(),
    transform: z
      .object({
        scale: boundedNumber(0.05, 1).optional(),
        x: boundedNumber(0, 1).optional(),
        y: boundedNumber(0, 1).optional(),
        opacity: boundedNumber(0, 1).optional(),
      })
      .strict()
      .optional(),
    text: z
      .object({
        text: z.string().max(2000),
        fontSizePx: boundedNumber(8, 400),
        colorHex: hexColorSchema,
        align: z.enum(['left', 'center', 'right']),
        anchor: z.enum(['top', 'middle', 'bottom']).optional(),
        positionPct: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }),
        box: z
          .object({
            colorHex: hexColorSchema,
            opacity: boundedNumber(0, 1),
            paddingPx: boundedNumber(0, 100),
          })
          .optional(),
        preset: z.enum(['title', 'lower_third', 'caption']),
      })
      .strict()
      .optional(),
    whiteboard: z
      .object({
        pattern: z.enum(['serpentine', 'wipe', 'zones', 'trace']),
        rows: z.number().int().min(1).max(WHITEBOARD_MAX_ROWS),
        // Legacy pre-S279 absolute draw time; still honored so old blobs
        // render unchanged. Ceiling generous on purpose: the render clamps
        // to the clip's own length, which the schema cannot know.
        drawSeconds: z.number().min(WHITEBOARD_MIN_DRAW_SECONDS).max(3600).optional(),
        // S279 — share of the clip spent drawing, derived into seconds at
        // eval time (`resolveWhiteboardDrawSeconds`): the S229 rate-not-
        // amount posture, so a retime re-derives the window instead of
        // stranding a stale absolute. Wins over `drawSeconds`; both absent
        // means the 90% default.
        drawFraction: boundedNumber(0.1, 1).optional(),
        hand: z.enum(['pen', 'marker', 'none']),
        // S296 — the reveal clock's step rate; absent = smooth (pre-S296).
        cadenceFps: z
          .number()
          .int()
          .min(WHITEBOARD_MIN_CADENCE_FPS)
          .max(WHITEBOARD_MAX_CADENCE_FPS)
          .optional(),
        // S295 — pencil and comic joined sketch; old blobs parse unchanged.
        look: z.enum(['none', 'sketch', 'pencil', 'comic']),
        // S275 — user-drawn reveal regions, `pattern: 'zones'` only. Array
        // order is reveal order; points are normalized to the padded
        // sequence frame. Optional so every S161-era blob parses unchanged.
        zones: z
          .array(
            z
              .object({
                points: z
                  .array(z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict())
                  .min(3)
                  .max(WHITEBOARD_MAX_ZONE_POINTS),
                entrance: z.enum(['draw']),
                sweep: z.enum(['lr', 'rl', 'tb']).optional(),
                weight: boundedNumber(WHITEBOARD_MIN_ZONE_WEIGHT, WHITEBOARD_MAX_ZONE_WEIGHT).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(WHITEBOARD_MAX_ZONES)
          .optional(),
        // S277 — the trace pattern's parameters (artifacts derive in main).
        trace: z
          .object({
            detail: z.enum(['low', 'medium', 'high']),
            order: z.enum(['reading', 'nearest']),
            strokeFraction: boundedNumber(0.1, 0.95).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    // S229 — parametric on purpose: the rate is stored, the travel is
    // derived from the hold at eval time (`resolveMotionCurve`). Storing
    // geometry here is what would let a duration change silently turn a
    // crawl into a lurch.
    motion: z
      .object({
        preset: z.enum(MOTION_PRESETS),
        register: z.enum(MOTION_REGISTER_NAMES).optional(),
        ratePctPerSec: boundedNumber(
          MIN_MOTION_RATE_PCT_PER_SEC,
          MAX_MOTION_RATE_PCT_PER_SEC,
        ).optional(),
        direction: z.enum(MOTION_DIRECTIONS).optional(),
        point: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict().optional(),
        seed: z.number().int().min(0).max(0xffffffff).optional(),
        rampFrames: z.number().int().min(0).max(240).optional(),
        // S237 — reframe's authored viewports.
        from: motionViewpointSchema.optional(),
        to: motionViewpointSchema.optional(),
      })
      .strict()
      .optional(),
    transition: z
      .object({
        outInRatio: boundedNumber(0.05, 0.95).optional(),
        colorHex: hexColorSchema.optional(),
        flashFrames: z.number().int().min(1).max(3).optional(),
        // S237 — the match dissolve's registration points.
        match: z
          .object({
            out: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict(),
            in: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    videoFade: z
      .object({
        // Ceilings generous like whiteboard's: the render clamps to the
        // clip's own length, which the schema cannot know.
        inFrames: z.number().int().min(0).max(100_000).optional(),
        outFrames: z.number().int().min(0).max(100_000).optional(),
        holdBlackFrames: z.number().int().min(0).max(100_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Degrades to neutral rather than throwing while a document loads — `parseOverrides`'s idiom. */
export function parseClipEffects(json: string | null | undefined): ClipEffects {
  if (!json) return {};
  try {
    const result = clipEffectsSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export function clipSpeed(effects: ClipEffects | undefined): number {
  const speed = effects?.speed ?? 1;
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed));
}

function neutral(value: number | undefined, neutralValue: number): boolean {
  return value === undefined || Math.abs(value - neutralValue) < 0.001;
}

/**
 * The ffmpeg colour chain, or `''` when every parameter is neutral.
 *
 * `eq` carries the four tone parameters in one filter; `hue`, `unsharp` and
 * `vignette` join only when engaged, so a brightness-only tweak costs one
 * filter, not four.
 */
export function buildColorFilterChain(effects: ClipEffects | undefined): string {
  const filters = effects?.filters;
  if (!filters) return '';
  const parts: string[] = [];

  const eq: string[] = [];
  if (!neutral(filters.brightness, 0)) eq.push(`brightness=${filters.brightness!.toFixed(3)}`);
  if (!neutral(filters.contrast, 1)) eq.push(`contrast=${filters.contrast!.toFixed(3)}`);
  if (!neutral(filters.saturation, 1)) eq.push(`saturation=${filters.saturation!.toFixed(3)}`);
  if (!neutral(filters.gamma, 1)) eq.push(`gamma=${filters.gamma!.toFixed(3)}`);
  if (eq.length > 0) parts.push(`eq=${eq.join(':')}`);

  if (!neutral(filters.hue, 0)) parts.push(`hue=h=${filters.hue!.toFixed(1)}`);
  if (!neutral(filters.sharpen, 0)) {
    // 5x5 luma matrix; amount 0..1 maps onto unsharp's useful 0..1.5 range.
    parts.push(`unsharp=5:5:${(filters.sharpen! * 1.5).toFixed(3)}`);
  }
  if (!neutral(filters.vignette, 0)) {
    // vignette's angle: PI/5 is its own default look; strength scales toward it.
    parts.push(`vignette=PI/5*${filters.vignette!.toFixed(3)}`);
  }

  return parts.join(',');
}

/**
 * Beta S227 — the video fade primitive as an ffmpeg chain fragment.
 *
 * Frame-accurate on purpose (`start_frame`/`nb_frames`, never `st`/`d`): the
 * fade lands on the exact frames the document names, and seconds would let a
 * rounding error move it by one — the same reason `-frames:v` beats `-t`
 * everywhere else in this pipeline. `''` for an absent or neutral fade, so a
 * clip without one emits byte-identical args (the standing neutrality
 * posture). A hold with no fade-out still needs `nb_frames >= 1`, so the
 * fade borrows one frame; everything clamps to the clip's own length, which
 * the zod schema cannot know.
 */
export function buildVideoFadeFilter(
  fade: ClipVideoFade | undefined,
  durationFrames: number,
  color: 'black' | 'white' = 'black',
): string {
  if (!fade) return '';
  const total = Math.max(1, Math.round(durationFrames));
  const hold = Math.min(Math.max(0, Math.round(fade.holdBlackFrames ?? 0)), total - 1);
  let out = Math.min(Math.max(0, Math.round(fade.outFrames ?? 0)), total - hold);
  if (hold > 0 && out === 0) out = 1;
  const fadeIn = Math.min(Math.max(0, Math.round(fade.inFrames ?? 0)), total);

  const parts: string[] = [];
  if (fadeIn > 0) parts.push(`fade=t=in:start_frame=0:nb_frames=${fadeIn}:color=${color}`);
  if (out > 0) {
    parts.push(`fade=t=out:start_frame=${total - out - hold}:nb_frames=${out}:color=${color}`);
  }
  return parts.join(',');
}

/**
 * Beta S230 — the flash frame, as a chain fragment on the incoming segment.
 *
 * `drawbox t=fill` over the first N frames: solid colour, exact frames, no
 * overlap consumed — the boundary in the join stays a hard cut. The colour
 * comes through validated hex only; anything else falls back to white, the
 * classic flash.
 */
export function buildFlashFilter(
  params: ClipTransitionParams | undefined,
  transitionFrames: number,
): string {
  const frames = Math.min(
    FLASH_FRAMES_MAX,
    Math.max(1, Math.round(params?.flashFrames ?? transitionFrames)),
  );
  const hex =
    params?.colorHex && /^#[0-9a-fA-F]{6}$/.test(params.colorHex) ? params.colorHex : '#ffffff';
  return `drawbox=color=0x${hex.slice(1)}:t=fill:enable='lt(n,${frames})'`;
}

/**
 * S157 — the same colour chain, gated to a time window.
 *
 * The adjustment-layer render (an `'effect'` clip) applies its filters to the
 * finished composite only between the clip's own start and end. ffmpeg's
 * `enable=` is per-filter, so each filter in the chain carries the same
 * `between(t,…)` clause — appending one clause to the *chain* would gate only
 * its last filter. Returns `''` exactly when {@link buildColorFilterChain}
 * does, so an effect clip with neutral filters contributes nothing.
 */
export function buildWindowedColorFilterChain(
  effects: ClipEffects | undefined,
  startSeconds: number,
  endSeconds: number,
): string {
  const chain = buildColorFilterChain(effects);
  if (!chain) return '';
  const enable = `enable='between(t,${startSeconds.toFixed(3)},${endSeconds.toFixed(3)})'`;
  return chain
    .split(',')
    .map((filter) => `${filter}:${enable}`)
    .join(',');
}

/**
 * Beta S249 — the same seven parameters as **numbers**, every one resolved to
 * its neutral when absent.
 *
 * `buildColorFilterChain` emits ffmpeg text and `buildCssFilter` emits CSS
 * text; a shader can read neither. Rather than a third hand-written
 * derivation — the arrangement S227 and S228 each had to go back and undo —
 * this is the one place the values are decided, and `buildCssFilter` below
 * now formats *this*. A preview that grades differently from the export is
 * then a formatting bug, not a disagreement about what the grade is.
 */
export interface ResolvedFilterValues {
  /** Additive, 0 neutral — `eq=brightness`. */
  brightness: number;
  /** 1 neutral. */
  contrast: number;
  /** 1 neutral. */
  saturation: number;
  /** 1 neutral. Export-only in CSS; a shader can do it. */
  gamma: number;
  /** Degrees, 0 neutral. */
  hue: number;
  /** 0..1, 0 neutral. Export-only in CSS; a shader can do it. */
  sharpen: number;
  /** 0..1, 0 neutral. Export-only in CSS; a shader can do it. */
  vignette: number;
}

/** Every parameter at its neutral — what an ungraded clip resolves to. */
export const NEUTRAL_FILTER_VALUES: ResolvedFilterValues = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  hue: 0,
  sharpen: 0,
  vignette: 0,
};

/** One clip's grade as numbers. Absent or neutral parameters resolve to neutral. */
export function resolveFilterValues(effects: ClipEffects | undefined): ResolvedFilterValues {
  const filters = effects?.filters;
  if (!filters) return NEUTRAL_FILTER_VALUES;
  const at = (value: number | undefined, neutralValue: number): number =>
    neutral(value, neutralValue) ? neutralValue : value!;
  return {
    brightness: at(filters.brightness, 0),
    contrast: at(filters.contrast, 1),
    saturation: at(filters.saturation, 1),
    gamma: at(filters.gamma, 1),
    hue: at(filters.hue, 0),
    sharpen: at(filters.sharpen, 0),
    vignette: at(filters.vignette, 0),
  };
}

/** True when a grade would change nothing — the cheap skip both renderers want. */
export function isNeutralFilterValues(values: ResolvedFilterValues): boolean {
  return (
    values.brightness === 0 &&
    values.contrast === 1 &&
    values.saturation === 1 &&
    values.gamma === 1 &&
    values.hue === 0 &&
    values.sharpen === 0 &&
    values.vignette === 0
  );
}

/**
 * The preview's CSS `filter` value for the same object, or `''`.
 *
 * CSS has no gamma, unsharp or vignette — those three are export-only *for
 * this path*, and the honesty line discloses it. (S249's GL compositor reads
 * `resolveFilterValues` directly and does all seven; this remains the
 * fallback path's rendering.) The four that do map, map exactly: `eq`'s
 * brightness is additive (CSS's is multiplicative, so 0→1, ±1→0..2), contrast
 * and saturation are 1-neutral in both, hue is degrees in both.
 */
export function buildCssFilter(effects: ClipEffects | undefined): string {
  if (!effects?.filters) return '';
  const values = resolveFilterValues(effects);
  const parts: string[] = [];
  if (values.brightness !== 0) parts.push(`brightness(${(1 + values.brightness).toFixed(3)})`);
  if (values.contrast !== 1) parts.push(`contrast(${values.contrast.toFixed(3)})`);
  if (values.saturation !== 1) parts.push(`saturate(${values.saturation.toFixed(3)})`);
  if (values.hue !== 0) parts.push(`hue-rotate(${values.hue.toFixed(1)}deg)`);
  return parts.join(' ');
}

/**
 * `atempo` accepts 0.5–2.0 per instance; anything wider chains. 4x becomes
 * `atempo=2.0,atempo=2.0`, 0.25x becomes `atempo=0.5,atempo=0.5` — the
 * standard decomposition, kept pure so a test can enumerate it.
 */
export function buildAtempoChain(speed: number): string {
  const clamped = clipSpeed({ speed });
  if (Math.abs(clamped - 1) < 0.001) return '';
  const stages: number[] = [];
  let remaining = clamped;
  while (remaining > 2) {
    stages.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  stages.push(remaining);
  return stages.map((stage) => `atempo=${stage.toFixed(4)}`).join(',');
}
