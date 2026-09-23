import {
  DIP_DEFAULT_COLOR_HEX,
  FLASH_DEFAULT_COLOR_HEX,
  NEUTRAL_FILTER_VALUES,
  resolveFilterValues,
  resolveGpuEffects,
  type ClipTransition,
  type ClipTransitionParams,
  type GlLayerGpuEffects,
  type MotionViewpoint,
  type ResolvedFilterValues,
} from '@shared';

/**
 * Beta S249 — what the compositor should draw this frame, as data.
 *
 * Pure by construction, and that is the point: a WebGL context cannot be
 * created in jsdom, so anything computed inside the draw call is untestable.
 * Everything that decides *what* appears — which family a transition belongs
 * to, where its veil sits, which viewport a moving still is at, how a grade
 * resolves — lives here and is asserted with no canvas present. `GlCompositor`
 * is then only the part that uploads textures and sets uniforms.
 *
 * Every number this module produces comes from a `@shared` arbiter the export
 * also reads (`effectiveBoundaryTransition`, `motionAt`, `resolveFilterValues`),
 * which is the S227/S228 two-consumer rule applied to a third consumer.
 */

/** The shader families. One per genuinely different way of mixing two pictures. */
export const GL_TRANSITION_FAMILIES = [
  'dissolve',
  'dip',
  'wipe',
  'slide',
  'circle',
  'pixelize',
  'radial',
  // S250 — the four S230 dissolve *variants*, which S249 shipped mapped onto
  // the plain dissolve. Each is a different curve on the same blend, and the
  // export expresses each as its own xfade token or custom expression.
  'blur',
  'asymmetric',
  'additive',
  'luma',
] as const;
export type GlTransitionFamily = (typeof GL_TRANSITION_FAMILIES)[number];

export interface GlTransitionPlan {
  family: GlTransitionFamily;
  /** (0, 1], landing on 1 at the window's final frame — the export's xfade convention. */
  progress: number;
  /** Wipe/slide direction as a UV-space unit vector; `circle` uses `sign`. */
  direction: { x: number; y: number };
  /** `circle`: +1 opens from the centre, -1 closes toward it. */
  sign: number;
  /**
   * S250 — whether the blend happens in **linear light**, mirroring
   * `xfadePlanFor`'s `linear` flag exactly. Every dissolve-family transition
   * and the dip do; wipes, slides, circles, pixelize and radial do not,
   * because they select between two pictures rather than blending them and
   * two colour conversions would buy nothing.
   *
   * This is not a detail. A crossfade computed on gamma-encoded values
   * darkens its midpoint — the "digital" mid-dissolve dip S230's comment
   * names — and it is exactly what the DOM path's CSS opacity ramp does. A
   * preview that dips where the export does not is a preview that lies about
   * the one frame anyone scrubs to.
   */
  linear: boolean;
  /**
   * S250 — the asymmetric dissolve's out/in ratio: the fraction of the window
   * the outgoing image takes to leave. Meaningless to the other families,
   * which ignore the uniform.
   */
  ratio: number;
  /**
   * The solid the picture passes through, already evaluated at `progress`.
   * `dip`, `fade_black`/`fade_white` and `flash_frame` have one; nothing else
   * does. `rgb` is 0..1 so it can go straight into a uniform.
   */
  veil: { rgb: [number, number, number]; opacity: number } | null;
}

/** One picture the frame is built from. `a` is the outgoing clip, `b` the incoming. */
export interface GlLayer {
  slot: 'a' | 'b';
  clipId: string;
  /**
   * `cover` when a move is present, `contain` otherwise — the export's own
   * rule (`buildStillFilterChain` crops for a move so the pan crosses picture
   * rather than letterbox, and fits otherwise).
   */
  fit: 'cover' | 'contain';
  /** Where in the source the frame is sampled from: centre + zoom, source fractions. */
  viewport: MotionViewpoint;
  filters: ResolvedFilterValues;
  gpuEffects?: GlLayerGpuEffects;
}

/**
 * How many stacked adjustment layers the shader applies. Four is not a
 * guess about the shader's limit — it is a bound on the unrolled loop, chosen
 * because the graded-timeline case is one adjustment layer and a stack past
 * four under a single playhead has never appeared. `truncatedAdjustments`
 * reports when one is dropped rather than letting the preview quietly
 * disagree with an export that chains all of them.
 */
export const MAX_ADJUSTMENT_LAYERS = 4;

export interface GlFrameGraph {
  layers: GlLayer[];
  transition: GlTransitionPlan | null;
  /**
   * Adjustment-layer grades, in the order the export's windowed pass applies
   * them. A **list**, not one composed set: CSS and ffmpeg both chain these
   * sequentially, and two `eq` passes are not one `eq` with summed
   * parameters (contrast pivots around mid-grey, so composing shifts it).
   */
  adjustments: ResolvedFilterValues[];
  /** True when an adjustment past `MAX_ADJUSTMENT_LAYERS` was dropped. */
  truncatedAdjustments: boolean;
}

const STATIC_VIEWPORT: MotionViewpoint = { x: 0.5, y: 0.5, scale: 1 };

/** `xfadePlanFor`'s own default: "leaves fast, arrives slow" — the echo grammar. */
const DEFAULT_OUT_IN_RATIO = 0.3;

/** `#rrggbb` → three 0..1 components. An unparseable string is black. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * One transition → its shader family and parameters.
 *
 * S250 — the four dissolve variants S230 added (blur, asymmetric, luma,
 * additive) each get their own family here, translated from the very
 * expressions `xfadePlanFor` emits. xfade's `P` runs 1 → 0 across the window
 * while `progress` runs 0 → 1, so every translation substitutes `P = 1 - p`;
 * that substitution is the whole of the arithmetic, and getting it backwards
 * would reverse the transition rather than break it — which is why the
 * shader verification asserts the ends, not just the midpoint.
 */
export function planTransition(
  type: ClipTransition,
  progress: number,
  params: ClipTransitionParams | undefined,
): GlTransitionPlan | null {
  if (type === 'cut') return null;
  const p = Math.min(1, Math.max(0, progress));
  const base = {
    progress: p,
    direction: { x: 0, y: 0 },
    sign: 1,
    veil: null,
    linear: false,
    ratio: DEFAULT_OUT_IN_RATIO,
  };

  switch (type) {
    case 'dip_to_color':
      return {
        ...base,
        family: 'dip',
        // `xfadePlanFor` runs the dip's custom expression inside the linear
        // wrap; the plain fades below fall to its `default:` arm and do not.
        linear: true,
        veil: {
          rgb: hexToRgb(params?.colorHex ?? DIP_DEFAULT_COLOR_HEX),
          // Half in, half out: the veil peaks at the midpoint, which is the
          // same arithmetic the export's custom expression runs.
          opacity: 1 - Math.abs(p * 2 - 1),
        },
      };
    case 'fade_black':
    case 'fade_white':
      return {
        ...base,
        family: 'dip',
        veil: {
          rgb: type === 'fade_white' ? [1, 1, 1] : [0, 0, 0],
          opacity: 1 - Math.abs(p * 2 - 1),
        },
      };
    case 'flash_frame':
      // The window *is* the flash: solid for its 1–3 frames, and the boundary
      // underneath stays a hard cut.
      return {
        ...base,
        family: 'dip',
        veil: { rgb: hexToRgb(params?.colorHex ?? FLASH_DEFAULT_COLOR_HEX), opacity: 1 },
      };
    case 'wipe_left':
      return { ...base, family: 'wipe', direction: { x: -1, y: 0 } };
    case 'wipe_right':
      return { ...base, family: 'wipe', direction: { x: 1, y: 0 } };
    case 'wipe_up':
      return { ...base, family: 'wipe', direction: { x: 0, y: -1 } };
    case 'wipe_down':
      return { ...base, family: 'wipe', direction: { x: 0, y: 1 } };
    case 'slide_left':
      return { ...base, family: 'slide', direction: { x: -1, y: 0 } };
    case 'slide_right':
      return { ...base, family: 'slide', direction: { x: 1, y: 0 } };
    case 'slide_up':
      return { ...base, family: 'slide', direction: { x: 0, y: -1 } };
    case 'slide_down':
      return { ...base, family: 'slide', direction: { x: 0, y: 1 } };
    case 'circle_open':
      return { ...base, family: 'circle', sign: 1 };
    case 'circle_close':
      return { ...base, family: 'circle', sign: -1 };
    case 'pixelize':
      return { ...base, family: 'pixelize' };
    case 'radial':
      return { ...base, family: 'radial' };
    case 'blur_dissolve':
      // The export's `hblur` token: both pictures blur horizontally toward
      // the midpoint and cross-fade underneath.
      return { ...base, family: 'blur', linear: true };
    case 'asymmetric_dissolve':
      return {
        ...base,
        family: 'asymmetric',
        linear: true,
        ratio: Math.min(0.95, Math.max(0.05, params?.outInRatio ?? DEFAULT_OUT_IN_RATIO)),
      };
    case 'additive_dissolve':
      return { ...base, family: 'additive', linear: true };
    case 'luma_dissolve':
      return { ...base, family: 'luma', linear: true };
    default:
      // crossfade and match_dissolve — a plain blend, in linear light. The
      // match's *alignment* is the incoming layer's viewport, not the family.
      return { ...base, family: 'dissolve', linear: true };
  }
}

/** One clip's picture layer. `motion` absent = a static, letterboxed frame. */
export function layerFor(input: {
  slot: 'a' | 'b';
  clipId: string;
  motion: MotionViewpoint | undefined;
  effects: Parameters<typeof resolveFilterValues>[0];
  playheadFrame?: number;
}): GlLayer {
  return {
    slot: input.slot,
    clipId: input.clipId,
    fit: input.motion ? 'cover' : 'contain',
    viewport: input.motion ?? STATIC_VIEWPORT,
    filters: resolveFilterValues(input.effects),
    gpuEffects: resolveGpuEffects(input.effects, input.playheadFrame ?? 0),
  };
}

/**
 * The whole frame, assembled.
 *
 * `outgoing` is present only inside a transition window, and only when its
 * media can be sampled — which after S249 includes a **video**, the case the
 * DOM switcher could not hold (it had one `<video>` element and no way to
 * show a second clip's frame under it).
 */
export function buildFrameGraph(input: {
  incoming: Omit<GlLayer, 'slot'> | null;
  outgoing: Omit<GlLayer, 'slot'> | null;
  transition: GlTransitionPlan | null;
  adjustments: ResolvedFilterValues[];
}): GlFrameGraph {
  const layers: GlLayer[] = [];
  if (input.outgoing) layers.push({ ...input.outgoing, slot: 'a' });
  if (input.incoming) layers.push({ ...input.incoming, slot: 'b' });
  return {
    layers,
    // A transition with nothing to transition *from* is not a transition: it
    // is the incoming clip, plain. The one exception is a veil family, which
    // paints over whatever is there and needs no second picture.
    transition:
      input.transition && (input.outgoing !== null || input.transition.veil !== null)
        ? input.transition
        : null,
    adjustments: input.adjustments.slice(0, MAX_ADJUSTMENT_LAYERS),
    truncatedAdjustments: input.adjustments.length > MAX_ADJUSTMENT_LAYERS,
  };
}

/** An ungraded, transition-free frame — what an empty playhead resolves to. */
export const EMPTY_FRAME_GRAPH: GlFrameGraph = {
  layers: [],
  transition: null,
  adjustments: [],
  truncatedAdjustments: false,
};

export { NEUTRAL_FILTER_VALUES };
