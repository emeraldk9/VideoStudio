import { z } from 'zod';

import {
  MAX_MOTION_RATE_PCT_PER_SEC,
  MIN_MOTION_RATE_PCT_PER_SEC,
  MOTION_DIRECTIONS,
  MOTION_PRESETS,
  MOTION_REGISTER_NAMES,
  type ClipMotion,
} from './motion';
import type { VideoEffectSettings } from './video-effects';
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
import {
  type ColorGradingSettings,
  buildFfmpegColorBalanceFilter,
  buildCssColorFilter as buildGradingCssFilter,
} from './color-grading-ops';
import {
  type AudioEqualizerSettings,
  buildFfmpegEqFilter,
} from './audio-eq-ops';
import { type AudioCompressorSettings, buildFfmpegCompressorFilter } from './audio-compressor-ops';
import { type SpeedRampSettings } from './speed-ramp-ops';
import { type BlendMode, type ChromaKeySettings, buildFfmpegChromaKeyFilter } from './compositing-ops';
import { type ClipMaskSettings, buildFfmpegMaskFilter } from './mask-ops';
import {
  type FontFamily,
  type FontWeight,
  type TextStrokeSettings,
  type TextShadowSettings,
  type TextGlowSettings,
  type TextGradientSettings,
  type TextAnimationSettings,
  type CompoundTextAnimationSettings,
} from './typography-ops';
import { type AudioReverbSettings, buildFfmpegReverbFilter } from './audio-reverb-ops';
import { type ClipNoiseGateSettings, buildFfmpegGateFilter } from './audio-gate-ops';
import { type ClipLutSettings, buildCssLutFilter, buildFfmpegLutFilter } from './lut-ops';
import { type ClipPipGridSettings } from './pip-grid-ops';
import { type ClipLensOpticsSettings, buildCssLensStyle, buildFfmpegLensFilter } from './lens-optics-ops';
import {
  type FilmEmulationSettings,
  buildCssFilmEmulationStyle,
  buildFfmpegFilmEmulationFilter,
} from './film-emulation-ops';
import { type AudioPitchSettings, buildFfmpegPitchFilter } from './audio-pitch-ops';
import { type AudioPanSettings, buildFfmpegPanFilter } from './audio-pan-ops';
import { type PortraitMattingSettings, buildFfmpegMattingFilter } from './portrait-matting-ops';
import { type OpticalFlowSettings, buildFfmpegOpticalFlowFilter } from './optical-flow-ops';
import { type AudioIsolationSettings, buildFfmpegIsolationFilter } from './audio-isolation-ops';
import { type VideoStabilizerSettings, buildFfmpegStabilizerFilter } from './video-stabilizer-ops';
import { type HdrToneMappingSettings, buildFfmpegToneMappingFilter } from './hdr-tone-mapping-ops';
import { type MultibandDenoiserSettings, buildFfmpegMultibandDenoiserFilter } from './multiband-denoiser-ops';
import { type VideoDenoiserSettings, buildFfmpegVideoDenoiserFilter } from './video-denoiser-ops';
import { type MultiCamClipSettings } from './multi-cam-ops';
import { type MotionBlurSettings, buildFfmpegMotionBlurFilter } from './motion-blur-ops';
import { type VocalStemSeparationSettings } from './vocal-separator-ops';
import {
  type StudioDeEsserSettings,
  type MainsHumNotchSettings,
  generateDeEsserFilterString,
  generateNotchFilterString,
} from './audio-deesser-notch-ops';
import { type ClipAnchorSettings } from './connected-clip-anchor-ops';
import { type SpectralDuckingSettings } from './spectral-ducking-ops';
import { type DynamicEqSettings, generateDynamicEqFiltergraph } from './dynamic-eq-ops';

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
  box?: {
    colorHex: string;
    opacity: number;
    paddingPx: number;
    borderRadiusPx?: number;
  };
  preset: 'title' | 'lower_third' | 'caption';
  /** S40 / S78 — Rich Typography, Art Effects & Motion Extensions */
  fontFamily?: FontFamily;
  fontWeight?: FontWeight;
  italic?: boolean;
  underline?: boolean;
  letterSpacingPx?: number;
  lineHeight?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  stroke?: TextStrokeSettings;
  shadow?: TextShadowSettings;
  glow?: TextGlowSettings;
  gradient?: TextGradientSettings;
  animation?: TextAnimationSettings;
  /** S85 — CapCut Smart Text Templates & Dynamic Multi-Field Title Engine */
  secondaryText?: string;
  secondaryFontSizePx?: number;
  secondaryColorHex?: string;
  badgeIcon?: string;
  templateStyleId?: string;
  templateLayout?: 'single' | 'stacked' | 'badge_pill' | 'callout_pointer' | 'news_ticker' | 'bordered_card';
  compoundAnimation?: CompoundTextAnimationSettings;
}

/** S160 / S78 — what the inspector's box toggle stamps on first enable. */
export const DEFAULT_TEXT_BOX: NonNullable<TextContent['box']> = {
  colorHex: '#000000',
  opacity: 0.5,
  paddingPx: 12,
  borderRadiusPx: 6,
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
  /** 0–1. @default 1 */
  opacity?: number;
  /** Rotation in degrees (−180..180). @default 0 */
  rotation?: number;
}

export interface CompoundClipSettings {
  nestedSequenceId: string;
  nestedSequenceName: string;
  childClipCount: number;
  childTrackCount: number;
  durationFrames: number;
  nestedTracks?: unknown[];
  nestedClips?: unknown[];
}

export interface ClipEffects {
  /** Source-consumption rate. 1 (or absent) = normal. */
  speed?: number;
  filters?: ClipColorFilters;
  /** Filter intensity percentage (0..100). Default 100. */
  filterIntensity?: number;
  /** S30 — 3-Way Color Wheels & Primary Color Balance Engine */
  colorGrade?: ColorGradingSettings;
  /** S42 — 3D LUT (Look-Up Table) & Film Emulation */
  lut?: ClipLutSettings;
  /** S55 — HDR Tone Mapping & ACES Color Science */
  hdrToneMapping?: HdrToneMappingSettings;
  /** CapCut-style dynamic Video Effect */
  videoEffect?: VideoEffectSettings;
  /** Present exactly when `sourceKind === 'text'`. */
  text?: TextContent;
  /** Overlay-track clips only — the spine is the base and has nowhere to move. */
  transform?: ClipTransform;
  /** S35 / S166 — 4-Band Parametric Audio Equalizer */
  equalizer?: AudioEqualizerSettings;
  /** S36 — Dynamic Range Audio Compressor & Peak Limiter */
  compressor?: AudioCompressorSettings;
  /** S41 — Audio Reverb, Stereo Echo Delay & Spatial Ambience */
  reverb?: AudioReverbSettings;
  /** S45 — Audio Noise Gate, Downward Expander & Dialogue De-Esser / De-Hummer */
  noiseGate?: ClipNoiseGateSettings;
  /** S49 — Audio Pitch Shifter & Formant Voice Effects */
  pitch?: AudioPitchSettings;
  /** S50 — Stereo Audio Panner & 3D Spatial Audio */
  pan?: AudioPanSettings;
  /** S53 — AI Vocal Isolation, Dialogue Enhancer & Stems Separation */
  audioIsolation?: AudioIsolationSettings;
  /** S86 — CapCut AI Vocal Remover & 4-Stem Audio Separator */
  vocalSeparation?: VocalStemSeparationSettings;
  /** S56 — Multiband Audio Denoiser, De-Clicker & Hum Removal */
  multibandDenoiser?: MultibandDenoiserSettings;
  /** S183 — Studio Vocal De-Esser */
  deEsser?: StudioDeEsserSettings;
  /** S183 — Parametric AC Mains Hum Notch Filter Rack */
  notchFilter?: MainsHumNotchSettings;
  /** S51 — AI Video Background Matting & Smart Portrait Cutout */
  matting?: PortraitMattingSettings;
  /** S52 — Optical Flow Motion Estimation & AI Video Super Slow-Motion */
  opticalFlow?: OpticalFlowSettings;
  /** S54 — Video Stabilization, Rolling Shutter & Gyro Smoothing */
  stabilizer?: VideoStabilizerSettings;
  /** S37 — Variable Speed Ramping & Bézier Velocity Curves */
  speedRamp?: SpeedRampSettings;
  /** S38 — Layer Blend Modes & Chroma Key Compositing */
  blendMode?: BlendMode;
  chromaKey?: ChromaKeySettings;
  /** S39 — Video Masking, Shape Cropping & Feathering */
  mask?: ClipMaskSettings;
  /** S43 — Picture-in-Picture (PiP), Split-Screen & Video Grid Layout */
  pipGrid?: ClipPipGridSettings;
  /** S46 — Cinematic Lens Distortion, Radial Chromatic Aberration & Optical Vignette */
  lensOptics?: ClipLensOpticsSettings;
  /** S48 — Film Grain, Analog Halation & Gate Weave Emulation */
  filmEmulation?: FilmEmulationSettings;
  /** S57 — Temporal Video Noise Reduction (TNR) & Detail Enhancer */
  videoDenoiser?: VideoDenoiserSettings;
  /** S59 — Multi-Camera Angle Switching, Waveform Audio Sync & MultiCam */
  multiCam?: MultiCamClipSettings;
  /** S60 — Cinematic Motion Blur & Rotary Shutter Angle Emulation */
  motionBlur?: MotionBlurSettings;
  /** S64 — Compound Clip & Nested Sequence Packaging */
  compound?: CompoundClipSettings;
  /** S188 — Magnetic Connected Clips & Relational Parent-Child Storyline Anchoring */
  anchor?: ClipAnchorSettings;
  /** S189 — Frequency-Selective Spectral Audio Ducking & Formant Attenuation */
  spectralDucking?: SpectralDuckingSettings;
  /** S191 — Multi-Band Dynamic EQ & Resonance Notch Suppressor */
  dynamicEq?: DynamicEqSettings;
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

export const colorWheelValueSchema = z
  .object({
    r: boundedNumber(-1, 1).default(0),
    g: boundedNumber(-1, 1).default(0),
    b: boundedNumber(-1, 1).default(0),
    luma: boundedNumber(-1, 1).default(0),
  })
  .strict();

export const curvePointSchema = z.tuple([boundedNumber(0, 1), boundedNumber(0, 1)]);

export const rgbCurvesSchema = z
  .object({
    all: z.array(curvePointSchema).min(2).optional(),
    r: z.array(curvePointSchema).min(2).optional(),
    g: z.array(curvePointSchema).min(2).optional(),
    b: z.array(curvePointSchema).min(2).optional(),
  })
  .strict();

export const colorGradingSchema = z
  .object({
    lift: colorWheelValueSchema.optional().default(() => ({ r: 0, g: 0, b: 0, luma: 0 })),
    gamma: colorWheelValueSchema.optional().default(() => ({ r: 0, g: 0, b: 0, luma: 0 })),
    gain: colorWheelValueSchema.optional().default(() => ({ r: 0, g: 0, b: 0, luma: 0 })),
    temperature: boundedNumber(-100, 100).default(0),
    tint: boundedNumber(-100, 100).default(0),
    exposure: boundedNumber(-4, 4).default(0),
    contrast: boundedNumber(0, 5).default(1.0),
    saturation: boundedNumber(0, 5).default(1.0),
    vibrance: boundedNumber(-100, 100).default(0),
    curves: rgbCurvesSchema.optional(),
  })
  .strict();

export const compoundClipSettingsSchema = z
  .object({
    nestedSequenceId: z.string().min(1),
    nestedSequenceName: z.string().min(1),
    childClipCount: z.number().int().min(0),
    childTrackCount: z.number().int().min(0),
    durationFrames: z.number().int().min(0),
    nestedTracks: z.array(z.unknown()).optional(),
    nestedClips: z.array(z.unknown()).optional(),
  })
  .strict();

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
    filterIntensity: boundedNumber(0, 100).optional(),
    colorGrade: colorGradingSchema.optional(),
    lut: z
      .object({
        enabled: z.boolean(),
        preset: z
          .enum([
            'teal_orange',
            'kodak_vision3',
            'fuji_eterna',
            'bleach_bypass',
            'noir_monochrome',
            'vintage_polaroid',
          ])
          .optional(),
        customCubePath: z.string().optional(),
        intensity: boundedNumber(0, 1),
      })
      .strict()
      .optional(),
    videoEffect: z
      .object({
        id: z.string().min(1),
        presetId: z.string().min(1),
        label: z.string().max(200),
        category: z.enum([
          'trending',
          'opening_closing',
          'lens_blur',
          'light_glitch',
          'retro_film',
          'distortion',
          'atmosphere',
          'split_dsk',
        ]),
        intensity: boundedNumber(0, 100),
        speed: boundedNumber(0, 100),
        scale: boundedNumber(0, 100).optional(),
        param: boundedNumber(0, 100).optional(),
        colorHex: hexColorSchema.optional(),
        disabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    transform: z
      .object({
        scale: boundedNumber(0.05, 1).optional(),
        x: boundedNumber(0, 1).optional(),
        y: boundedNumber(0, 1).optional(),
        opacity: boundedNumber(0, 1).optional(),
        rotation: boundedNumber(-360, 360).optional(),
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
            borderRadiusPx: boundedNumber(0, 50).optional(),
          })
          .optional(),
        preset: z.enum(['title', 'lower_third', 'caption']),
        fontFamily: z
          .enum([
            'Inter',
            'Montserrat',
            'Bebas Neue',
            'Playfair Display',
            'Oswald',
            'Cinzel',
            'Roboto Mono',
            'Impact',
          ])
          .optional(),
        fontWeight: z.enum(['400', '600', '700', '900']).optional(),
        italic: z.boolean().optional(),
        underline: z.boolean().optional(),
        letterSpacingPx: boundedNumber(-5, 50).optional(),
        lineHeight: boundedNumber(0.5, 3).optional(),
        textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
        stroke: z
          .object({
            colorHex: hexColorSchema,
            widthPx: boundedNumber(0, 30),
          })
          .strict()
          .optional(),
        shadow: z
          .object({
            colorHex: hexColorSchema,
            blurPx: boundedNumber(0, 50),
            offsetX: boundedNumber(-50, 50),
            offsetY: boundedNumber(-50, 50),
            opacity: boundedNumber(0, 1),
          })
          .strict()
          .optional(),
        glow: z
          .object({
            colorHex: hexColorSchema,
            radiusPx: boundedNumber(0, 50),
            intensity: boundedNumber(0, 1),
          })
          .strict()
          .optional(),
        gradient: z
          .object({
            enabled: z.boolean(),
            fromHex: hexColorSchema,
            toHex: hexColorSchema,
            angleDeg: boundedNumber(-360, 360).optional(),
          })
          .strict()
          .optional(),
        animation: z
          .object({
            type: z.enum([
              'none',
              'typewriter',
              'fade_in',
              'slide_up',
              'slide_down',
              'slide_left',
              'slide_right',
              'pop_scale',
              'bounce',
              'zoom_in',
              'glitch',
              'fade_out',
              'slide_down_out',
              'zoom_out',
              'dissolve',
              'karaoke_highlight',
              'glow_pulse',
              'wave',
              'shimmer',
              'bounce_loop',
            ]),
            durationFrames: z.number().int().min(0).max(300),
          })
          .strict()
          .optional(),
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
        drawFraction: boundedNumber(0.01, 1).optional(),
        // S5 / S6 — Keyframe In start delay (fraction and seconds)
        inFraction: boundedNumber(0, 1).optional(),
        inSeconds: z.number().min(0).max(3600).optional(),
        hand: z.enum(['pen', 'marker', 'pencil', 'chalk', 'none']),
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
                type: z.enum(['sketch', 'scribble', 'writing', 'wipe']).optional(),
                hatchAngle: z.number().optional(),
                crossHatch: z.boolean().optional(),
                hatchSpacingPx: boundedNumber(2, 50).optional(),
                rows: z.number().int().min(2).max(16).optional(),
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
        // S91 — procedural whiteboard drawing foley sound effects
        foleyEnabled: z.boolean().optional(),
        foleyVolume: boundedNumber(0, 1).optional(),
        // S93 — procedural whiteboard board clearing / erase-out
        eraseOut: z.boolean().optional(),
        eraseFraction: boundedNumber(0.05, 0.40).optional(),
        erasePattern: z.enum(['zigzag', 'wipe']).optional(),
        // S94 — stroke decimation & Catmull-Rom Bezier smoothing
        strokeSmoothing: z.enum(['none', 'subtle', 'smooth', 'high']).optional(),
        simplifyTolerance: boundedNumber(0, 3.0).optional(),
        // S95 — vector path continuous morphing
        morphTransition: z
          .object({
            enabled: z.boolean().optional(),
            easing: z.enum(['linear', 'ease-in-out', 'elastic']).optional(),
            durationSeconds: boundedNumber(0.1, 10).optional(),
          })
          .strict()
          .optional(),
        // S96 — procedural cross-hatching and graphite texture shading
        shadingStyle: z.enum(['bloom', 'hatch', 'crosshatch']).optional(),
        hatchAngle: z.number().optional(),
        hatchSpacingPx: boundedNumber(2, 50).optional(),
        crossHatch: z.boolean().optional(),
        // S97 — dynamic calligraphy & chisel nib geometry
        brushDynamics: z
          .object({
            taper: z.boolean().optional(),
            chiselNib: z.boolean().optional(),
            nibAngleDeg: boundedNumber(0, 180).optional(),
            minWidthRatio: boundedNumber(0.1, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S98 — multi-path saliency clustering & contour prioritization
        clusteringMode: z.enum(['none', 'proximity', 'saliency', 'hierarchical']).optional(),
        // S100 — dynamic inertial viewport camera follower & directional hand shadow
        cameraFollower: z
          .object({
            enabled: z.boolean().optional(),
            zoom: boundedNumber(1.0, 3.0).optional(),
            smoothness: boundedNumber(0.1, 0.98).optional(),
            showHandShadow: z.boolean().optional(),
            shadowAngleDeg: boundedNumber(0, 360).optional(),
          })
          .strict()
          .optional(),
        // S101 — physical ink bleed, wet-edge pooling & chalk dust
        inkPhysics: z
          .object({
            bleedIntensity: boundedNumber(0, 1.0).optional(),
            poolingFactor: boundedNumber(0, 1.0).optional(),
            dustParticles: z.boolean().optional(),
            subtractiveBlend: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S103 — custom hand stylus asset calibration & dynamic pose warping
        customHand: z
          .object({
            assetUri: z.string().optional(),
            nibAnchorPct: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict().optional(),
            wristAnchorPct: z.object({ x: boundedNumber(0, 1), y: boundedNumber(0, 1) }).strict().optional(),
            dynamicTilt: z.boolean().optional(),
            tiltIntensity: boundedNumber(0, 1).optional(),
            scale: boundedNumber(0.1, 5).optional(),
          })
          .strict()
          .optional(),
        // S104 — bitmap vectorization & contour auto-trace
        autoTrace: z
          .object({
            enabled: z.boolean().optional(),
            threshold: z.number().int().min(0).max(255).optional(),
            minPathLength: boundedNumber(1, 1000).optional(),
            cornerTolerance: boundedNumber(0.1, 10).optional(),
          })
          .strict()
          .optional(),
        // S105 — kinetic typography & handwriting cadence
        kineticTypography: z
          .object({
            enabled: z.boolean().optional(),
            letterCadenceMs: boundedNumber(10, 2000).optional(),
            punctuationPauseMs: boundedNumber(10, 3000).optional(),
            cursiveLigatures: z.boolean().optional(),
            handwritingJitter: boundedNumber(0, 1).optional(),
          })
          .strict()
          .optional(),
        // S106 — multi-language bidirectional RTL writing & diacritic scheduling
        bidiWriting: z
          .object({
            direction: z.enum(['auto', 'ltr', 'rtl', 'vertical', 'neutral']).optional(),
            deferDiacritics: z.boolean().optional(),
            diacriticDelayMs: boundedNumber(0, 1000).optional(),
          })
          .strict()
          .optional(),
        // S107 — pressure-sensitive stylus dynamics & variable ribbon
        stylusPressure: z
          .object({
            enabled: z.boolean().optional(),
            curve: z.enum(['linear', 'exponential', 'sigmoid', 'calligraphic']).optional(),
            sensitivity: boundedNumber(0.1, 3.0).optional(),
            minWidthPct: boundedNumber(0.05, 0.95).optional(),
            tiltDeformation: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S108 — granular surface friction & nib wear
        surfaceFriction: z
          .object({
            enabled: z.boolean().optional(),
            surfaceType: z.enum(['whiteboard', 'paper', 'slate', 'canvas']).optional(),
            grainScale: boundedNumber(0.1, 5.0).optional(),
            nibWearRate: boundedNumber(0, 1.0).optional(),
            toothRoughness: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S109 — procedural smudge blending & eraser highlights
        smudgeBlend: z
          .object({
            enabled: z.boolean().optional(),
            mode: z.enum(['finger', 'stump', 'towel', 'kneaded_eraser']).optional(),
            radiusPx: boundedNumber(1, 200).optional(),
            strength: boundedNumber(0, 1.0).optional(),
            liftHighlights: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S110 — multi-tool hot-swapping & eraser cap flip
        toolSwap: z
          .object({
            enabled: z.boolean().optional(),
            defaultTransition: z.enum(['flip', 'dock', 'instant']).optional(),
            durationSec: boundedNumber(0.1, 5.0).optional(),
            dockX: boundedNumber(0, 1.0).optional(),
            dockY: boundedNumber(0, 1.0).optional(),
            foleyAudioCues: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S111 — attention lighting & dynamic vignetting
        attentionLighting: z
          .object({
            enabled: z.boolean().optional(),
            spotlightRadiusPx: boundedNumber(50, 1200).optional(),
            spotlightIntensity: boundedNumber(0, 1.0).optional(),
            vignetteStrength: boundedNumber(0, 1.0).optional(),
            inertia: boundedNumber(0, 0.99).optional(),
          })
          .strict()
          .optional(),
        // S112 — geometric drafting guides (ruler & compass)
        draftingGuide: z
          .object({
            enabled: z.boolean().optional(),
            mode: z.enum(['auto', 'ruler', 'compass', 'none']).optional(),
            material: z.enum(['acrylic', 'wood', 'metal']).optional(),
            minLineLengthPx: boundedNumber(20, 1000).optional(),
            slideAudioCue: z.boolean().optional(),
            showGraduations: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S113 — optical depth-of-field & bokeh hand blur
        depthOfField: z
          .object({
            enabled: z.boolean().optional(),
            aperture: z.enum(['f1.4', 'f1.8', 'f2.8', 'f4.0', 'f5.6']).optional(),
            maxBlurPx: boundedNumber(1, 100).optional(),
            tipLiftDefocus: z.boolean().optional(),
            wristElevationMm: boundedNumber(10, 500).optional(),
          })
          .strict()
          .optional(),
        // S114 — multi-hand duet collaboration
        dualHandDuet: z
          .object({
            enabled: z.boolean().optional(),
            partitionMode: z.enum(['spatial', 'interleaved', 'sync']).optional(),
            minSeparationPx: boundedNumber(50, 600).optional(),
            collisionLiftPx: boundedNumber(10, 300).optional(),
            stereoFoleyPanning: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S115 — whiteboard chroma chalk & neon UV luminescence
        chromaChalk: z
          .object({
            enabled: z.boolean().optional(),
            palette: z.enum(['cyber', 'pastels', 'arcade']).optional(),
            bloomRadiusPx: boundedNumber(1, 100).optional(),
            bloomIntensity: boundedNumber(0, 3.0).optional(),
            chromaticAberrationPx: boundedNumber(0, 10).optional(),
            darkSlateBackground: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S116 — wet sponge evaporation & moisture condensation
        wetSponge: z
          .object({
            enabled: z.boolean().optional(),
            initialWetness: boundedNumber(0.01, 1.0).optional(),
            dryingTimeSec: boundedNumber(0.5, 60.0).optional(),
            dilutionFactor: boundedNumber(0, 1.0).optional(),
            gravityDrip: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S117 — optical glass lightboard & edge-lit luminescence
        lightboard: z
          .object({
            enabled: z.boolean().optional(),
            mirrorHorizontal: z.boolean().optional(),
            ledPreset: z.enum(['cyan', 'emerald', 'amber', 'white']).optional(),
            customLedColorHex: hexColorSchema.optional(),
            ledIntensity: boundedNumber(0.1, 5.0).optional(),
            glassThicknessPx: boundedNumber(1, 30).optional(),
            ghostReflectionOpacity: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S118 — smart geometric shape recognition & snap-to-vector primitive
        shapeRecognition: z
          .object({
            enabled: z.boolean().optional(),
            snapTolerance: boundedNumber(0.05, 0.90).optional(),
            angleSnap: z.boolean().optional(),
            morphDurationSec: boundedNumber(0.05, 3.0).optional(),
          })
          .strict()
          .optional(),
        // S119 — whiteboard laser pointer & phosphor afterglow
        laserPointer: z
          .object({
            enabled: z.boolean().optional(),
            colorPreset: z.enum(['emerald', 'ruby', 'violet']).optional(),
            customColorHex: hexColorSchema.optional(),
            coreRadiusPx: boundedNumber(1, 20).optional(),
            haloRadiusPx: boundedNumber(4, 60).optional(),
            persistenceSec: boundedNumber(0.05, 5.0).optional(),
            trailIntensity: boundedNumber(0.1, 3.0).optional(),
          })
          .strict()
          .optional(),
        // S120 — whiteboard magnetic grid & perspective drafting substrate
        gridSubstrate: z
          .object({
            enabled: z.boolean().optional(),
            mode: z.enum(['cartesian', 'isometric', 'perspective', 'dots']).optional(),
            spacingPx: boundedNumber(5, 500).optional(),
            snapRadiusPx: boundedNumber(1, 100).optional(),
            horizonYPct: boundedNumber(0.05, 0.95).optional(),
            opacity: boundedNumber(0, 1.0).optional(),
            gridColor: hexColorSchema.optional(),
          })
          .strict()
          .optional(),
        // S121 — procedural whiteboard hand contact shadows & ambient occlusion
        contactShadow: z
          .object({
            enabled: z.boolean().optional(),
            lightAngleDeg: boundedNumber(0, 360).optional(),
            shadowOpacity: boundedNumber(0.01, 1.0).optional(),
            blurRadiusPx: boundedNumber(1, 100).optional(),
            offsetDistancePx: boundedNumber(0, 100).optional(),
            liftDissipation: boundedNumber(0, 1.0).optional(),
            wristSkewFactor: boundedNumber(0.5, 5.0).optional(),
          })
          .strict()
          .optional(),
        // S122 — whiteboard marker ink depletion, dry-out streaking & chalk micro-chatter
        inkDepletion: z
          .object({
            enabled: z.boolean().optional(),
            depletionRate: boundedNumber(0.0001, 0.1).optional(),
            minSaturation: boundedNumber(0.05, 0.95).optional(),
            streakCount: z.number().int().min(1).max(20).optional(),
            rechargeRate: boundedNumber(0.01, 5.0).optional(),
            chatterFrequency: boundedNumber(0.01, 2.0).optional(),
            enableChalkChatter: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S123 — whiteboard dynamic tool auto-invocation & staging carousel
        toolOrchestrator: z
          .object({
            enabled: z.boolean().optional(),
            autoRulerThresholdPx: boundedNumber(10, 500).optional(),
            autoLaserHoldSec: boundedNumber(0.05, 5.0).optional(),
            toolEnterDurationSec: boundedNumber(0.05, 3.0).optional(),
            toolDismissTimeoutSec: boundedNumber(0.1, 5.0).optional(),
            trayPosition: z.enum(['bottom-right', 'bottom-left', 'top-right']).optional(),
          })
          .strict()
          .optional(),
        // S124 — whiteboard multi-color palette carousel & pen dock
        paletteDock: z
          .object({
            enabled: z.boolean().optional(),
            dockStyle: z.enum(['caddy', 'ring_dock', 'multipen_click']).optional(),
            activeColorIdx: z.number().int().min(0).max(7).optional(),
            palettePreset: z.enum(['standard', 'neon', 'earth']).optional(),
            rotationDurationSec: boundedNumber(0.05, 3.0).optional(),
            clickFoleyVolume: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S125 — whiteboard stylus pressure audio & squeak resonance
        pressureAudio: z
          .object({
            enabled: z.boolean().optional(),
            baseFreqHz: boundedNumber(100, 5000).optional(),
            pitchSensitivity: boundedNumber(0, 1.0).optional(),
            squeakThresholdPressure: boundedNumber(0.1, 1.0).optional(),
            squeakThresholdVelocity: boundedNumber(10, 2000).optional(),
            squeakBaseFreqHz: boundedNumber(500, 10000).optional(),
            squeakVolume: boundedNumber(0, 1.0).optional(),
            hapticThumpVolume: boundedNumber(0, 1.0).optional(),
            hapticRumbleGain: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S126 — whiteboard sticky notes & stencil masking
        stickyNote: z
          .object({
            enabled: z.boolean().optional(),
            colorPreset: z.enum(['canary', 'pink', 'cyan', 'mint', 'orange']).optional(),
            customColorHex: hexColorSchema.optional(),
            posX: boundedNumber(-2000, 4000).optional(),
            posY: boundedNumber(-2000, 4000).optional(),
            width: boundedNumber(50, 1200).optional(),
            height: boundedNumber(50, 1200).optional(),
            rotationDeg: boundedNumber(-180, 180).optional(),
            peelElevationPx: boundedNumber(0, 50).optional(),
            pinStyle: z.enum(['magnet', 'pushpin', 'tape', 'none']).optional(),
          })
          .strict()
          .optional(),
        stencilMask: z
          .object({
            enabled: z.boolean().optional(),
            shape: z.enum(['rectangle', 'circle', 'speech_bubble']).optional(),
            invertMask: z.boolean().optional(),
            posX: boundedNumber(-2000, 4000).optional(),
            posY: boundedNumber(-2000, 4000).optional(),
            width: boundedNumber(50, 2000).optional(),
            height: boundedNumber(50, 2000).optional(),
            radius: boundedNumber(10, 1000).optional(),
          })
          .strict()
          .optional(),
        // S127 — whiteboard lasso gesture recognition & auto-callout badges
        lassoCallout: z
          .object({
            enabled: z.boolean().optional(),
            closureThresholdRatio: boundedNumber(0.05, 0.95).optional(),
            minEnclosedArea: boundedNumber(10, 50000).optional(),
            calloutStyle: z.enum(['pulse_beacon', 'badge_pin', 'magnifier_loupe']).optional(),
            badgeLabel: z.string().max(10).optional(),
            pulseFrequencyHz: boundedNumber(0.1, 10.0).optional(),
            glowColorHex: hexColorSchema.optional(),
          })
          .strict()
          .optional(),
        // S128 — whiteboard broad chisel-tip fluorescent highlighter
        highlighter: z
          .object({
            enabled: z.boolean().optional(),
            colorPreset: z.enum(['yellow', 'green', 'pink', 'cyan', 'orange']).optional(),
            customColorHex: hexColorSchema.optional(),
            nibWidthPx: boundedNumber(5, 100).optional(),
            nibAngleDeg: boundedNumber(0, 180).optional(),
            opacity: boundedNumber(0.05, 1.0).optional(),
            compositeMode: z.enum(['subtractive_multiply', 'under_ink']).optional(),
          })
          .strict()
          .optional(),
        // S129 — whiteboard multi-source hand lighting & dual-penumbra contact shadows
        multiSourceLighting: z
          .object({
            enabled: z.boolean().optional(),
            keyLight: z
              .object({
                angleDeg: boundedNumber(0, 360).optional(),
                intensity: boundedNumber(0, 1.0).optional(),
                distancePx: boundedNumber(0, 100).optional(),
                blurRadiusPx: boundedNumber(1, 100).optional(),
              })
              .strict()
              .optional(),
            fillLight: z
              .object({
                angleDeg: boundedNumber(0, 360).optional(),
                intensity: boundedNumber(0, 1.0).optional(),
                distancePx: boundedNumber(0, 100).optional(),
                blurRadiusPx: boundedNumber(1, 100).optional(),
              })
              .strict()
              .optional(),
            ambientOcclusionIntensity: boundedNumber(0, 1.0).optional(),
            liftHeightPx: boundedNumber(0, 100).optional(),
            inverseSquareFalloff: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S130 — whiteboard chalk dust settling & gravitational tray physics
        chalkDustSettling: z
          .object({
            enabled: z.boolean().optional(),
            gravitySpeed: boundedNumber(10, 300).optional(),
            terminalVelocity: boundedNumber(10, 300).optional(),
            turbulenceAmplitude: boundedNumber(0, 10.0).optional(),
            trayYPercent: boundedNumber(0.50, 0.99).optional(),
            trayDepthPx: boundedNumber(2, 100).optional(),
            reposeSigma: boundedNumber(0.5, 50).optional(),
            accumulationGain: boundedNumber(1.0, 100).optional(),
            chalkColorHex: hexColorSchema.optional(),
          })
          .strict()
          .optional(),
        // S131 — whiteboard hand shadow soft-penumbra contact AO with silhouette tracing
        handSilhouettePenumbra: z
          .object({
            enabled: z.boolean().optional(),
            lightElevationMm: boundedNumber(100, 3000).optional(),
            wristElevationMm: boundedNumber(10, 300).optional(),
            umbraOpacity: boundedNumber(0.05, 1.0).optional(),
            maxPenumbraBlurPx: boundedNumber(1, 100).optional(),
            minUmbraBlurPx: boundedNumber(0.5, 30).optional(),
            aoIntensity: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S132 — whiteboard marker cap snap & pressure vacuum click foley acoustics
        capSnapFoley: z
          .object({
            enabled: z.boolean().optional(),
            volume: boundedNumber(0, 1.0).optional(),
            snapSharpness: boundedNumber(0.1, 1.0).optional(),
            suctionDepth: boundedNumber(0.1, 1.0).optional(),
            magneticSnapDistancePx: boundedNumber(10, 100).optional(),
            autoFoleyOnToolSwap: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S133 — whiteboard multi-color pen ribbon blending & gradient transition wash
        gradientWash: z
          .object({
            enabled: z.boolean().optional(),
            washLengthPx: boundedNumber(10, 150).optional(),
            useOklab: z.boolean().optional(),
            secondaryColorHex: hexColorSchema.optional(),
            ditherNoise: boundedNumber(0, 0.20).optional(),
          })
          .strict()
          .optional(),
        // S134 — whiteboard felt-tip marker nib splay & directional fiber compression dynamics
        nibSplay: z
          .object({
            enabled: z.boolean().optional(),
            splayGain: boundedNumber(0.2, 2.5).optional(),
            fiberStiffness: boundedNumber(0.1, 0.95).optional(),
            dragDeflection: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S135 — whiteboard wet-on-wet capillary bleed & pigment diffusion at stroke intersections
        capillaryBleed: z
          .object({
            enabled: z.boolean().optional(),
            dryingTimeSec: boundedNumber(0.5, 5.0).optional(),
            bleedBloomRadiusPx: boundedNumber(2.0, 15.0).optional(),
            solventDilution: boundedNumber(0, 0.70).optional(),
            featherSpikes: boundedNumber(3, 12).optional(),
          })
          .strict()
          .optional(),
        // S136 — whiteboard dry-erase felt eraser swipe smear & ghosting residuals
        eraserGhosting: z
          .object({
            enabled: z.boolean().optional(),
            feltSaturationRate: boundedNumber(0.01, 0.20).optional(),
            smearOpacity: boundedNumber(0.01, 0.15).optional(),
            ghostPersistence: boundedNumber(0.01, 0.12).optional(),
            cleaningDecayRate: boundedNumber(0.20, 0.80).optional(),
          })
          .strict()
          .optional(),
        // S137 — whiteboard dual-layer tempered glass specular glare & parallax reflection
        glassParallax: z
          .object({
            enabled: z.boolean().optional(),
            glassThickness: boundedNumber(1.0, 25.0).optional(),
            fresnelGlareIntensity: boundedNumber(0, 0.60).optional(),
            parallaxGhostOpacity: boundedNumber(0.01, 0.25).optional(),
            glarePosX: boundedNumber(0, 1.0).optional(),
            glarePosY: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S138 — whiteboard graphite sheen reflection & textured paper grain bump mapping
        graphiteGrain: z
          .object({
            enabled: z.boolean().optional(),
            grainRoughness: boundedNumber(0, 0.80).optional(),
            graphiteSheenIntensity: boundedNumber(0, 0.80).optional(),
            sheenShininess: boundedNumber(8, 64).optional(),
            lightAzimuthDeg: boundedNumber(0, 360).optional(),
          })
          .strict()
          .optional(),
        // S139 — whiteboard solvent vapor shimmer & ambient thermal convection
        vaporShimmer: z
          .object({
            enabled: z.boolean().optional(),
            shimmerAmplitudePx: boundedNumber(0.5, 8.0).optional(),
            solventEvapHalfLife: boundedNumber(0.3, 3.0).optional(),
            convectionSpeed: boundedNumber(10, 100).optional(),
            buoyancyPlumeHeightPx: boundedNumber(15, 80).optional(),
          })
          .strict()
          .optional(),
        // S140 — multi-track storyboard master mixdown & 4K ProRes/H.265 export pipeline
        storyboardMasterExport: z
          .object({
            preset: z.enum(['prores_422_hq', 'hevc_4k', 'h264_web']).optional(),
            ebuTargetLufs: boundedNumber(-36, -6).optional(),
            speechDuckingAttenuationDb: boundedNumber(-24, 0).optional(),
            drawingFoleyGainDb: boundedNumber(-24, 12).optional(),
            toolFoleyGainDb: boundedNumber(-24, 12).optional(),
          })
          .strict()
          .optional(),
        // S141 — whiteboard live audio-visual reactive ink pulsing
        audioReactiveInk: z
          .object({
            enabled: z.boolean().optional(),
            energyGain: boundedNumber(0, 5.0).optional(),
            energyGamma: boundedNumber(0.1, 4.0).optional(),
            attackMs: boundedNumber(1, 200).optional(),
            releaseMs: boundedNumber(1, 1000).optional(),
            pitchRippleAmp: boundedNumber(0, 20).optional(),
            pitchRefHz: boundedNumber(30, 1000).optional(),
            transientThreshold: boundedNumber(0.01, 1.0).optional(),
            transientBurstRadius: boundedNumber(0, 50).optional(),
            syncOffsetMs: boundedNumber(-500, 500).optional(),
          })
          .strict()
          .optional(),
        // S142 — whiteboard hand palm occlusion & natural smudging physics
        palmSmudge: z
          .object({
            enabled: z.boolean().optional(),
            touchdownElevationMm: boundedNumber(1, 30).optional(),
            palmRadiusPx: boundedNumber(5, 150).optional(),
            palmAspectRatio: boundedNumber(0.2, 1.0).optional(),
            palmOffsetX: boundedNumber(0, 150).optional(),
            palmOffsetY: boundedNumber(0, 150).optional(),
            smudgeIntensity: boundedNumber(0, 1.5).optional(),
            smudgeDecayPx: boundedNumber(5, 300).optional(),
            wetTimeWindowSec: boundedNumber(0.1, 20).optional(),
            shadowOpacity: boundedNumber(0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S143 — multi-resolution spatial tile caching & vector quadtree acceleration
        quadtreeTileCache: z
          .object({
            enabled: z.boolean().optional(),
            maxDepth: boundedNumber(2, 10).optional(),
            maxItemsPerNode: boundedNumber(2, 64).optional(),
            tileSize: z.union([z.literal(128), z.literal(256), z.literal(512)]).optional(),
            mipLevels: boundedNumber(1, 5).optional(),
            cullingMarginPx: boundedNumber(0, 200).optional(),
          })
          .strict()
          .optional(),
        // S144 — whiteboard chalk breakage & variable angle edge chatters
        chalkBreakage: z
          .object({
            enabled: z.boolean().optional(),
            slantAngleDeg: boundedNumber(10, 85).optional(),
            chatterFrequencyHz: boundedNumber(20, 300).optional(),
            skipThreshold: boundedNumber(0.05, 0.9).optional(),
            breakagePressureThreshold: boundedNumber(0.5, 0.99).optional(),
            facetWidthMultiplier: boundedNumber(1.0, 5.0).optional(),
            dustBurstCount: boundedNumber(0, 50).optional(),
            chalkColorHex: z.string().optional(),
          })
          .strict()
          .optional(),
        // S145 — real-time WebGL/WebGPU stroke fragment shader pipeline
        strokeShader: z
          .object({
            enabled: z.boolean().optional(),
            substrateRoughness: boundedNumber(0, 1).optional(),
            edgeFeathering: boundedNumber(0.2, 6.0).optional(),
            specularIntensity: boundedNumber(0, 1).optional(),
            specularRoughness: boundedNumber(0.02, 1.0).optional(),
            fresnelStrength: boundedNumber(0, 1).optional(),
            shadowOpacity: boundedNumber(0, 1).optional(),
            inkColorHex: z.string().optional(),
          })
          .strict()
          .optional(),
        // S146 — charcoal & conte crayon powder smearing with tortillon stump blending
        charcoalTortillon: z
          .object({
            enabled: z.boolean().optional(),
            mediaType: z.enum(['vine_charcoal', 'compressed_charcoal', 'conte_crayon']).optional(),
            powderFriability: boundedNumber(0.1, 1).optional(),
            stumpHardness: boundedNumber(0.1, 0.9).optional(),
            blendRadiusPx: boundedNumber(2, 25).optional(),
            burnishDepth: boundedNumber(0.1, 1).optional(),
            charcoalColorHex: z.string().optional(),
          })
          .strict()
          .optional(),
        // S147 — multi-layer animation onion skinning & light table backlighting
        onionSkinLightTable: z
          .object({
            enabled: z.boolean().optional(),
            pastFramesCount: boundedNumber(1, 5).optional(),
            futureFramesCount: boundedNumber(1, 5).optional(),
            baseOpacity: boundedNumber(0.05, 0.95).optional(),
            opacityFalloffGamma: boundedNumber(0.2, 0.98).optional(),
            pastTintHex: z.string().optional(),
            futureTintHex: z.string().optional(),
            currentInkHex: z.string().optional(),
            lightTableIntensity: boundedNumber(0, 1).optional(),
            pegBarEnabled: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S148 — whiteboard drafting pantograph mechanical linkage & magnetic arc pivot
        pantographPivot: z
          .object({
            enabled: z.boolean().optional(),
            anchorPoint: z.tuple([z.number(), z.number()]).optional(),
            scaleRatio: boundedNumber(0.2, 5.0).optional(),
            armLengthPrimary: boundedNumber(50, 1000).optional(),
            armLengthSecondary: boundedNumber(50, 1000).optional(),
            magneticSnapEnabled: z.boolean().optional(),
            magneticSnapRadius: boundedNumber(1, 200).optional(),
            arcLockRadius: boundedNumber(0, 2000).optional(),
            arcSnapStep: boundedNumber(5, 500).optional(),
            elasticFlexDamping: boundedNumber(0, 0.5).optional(),
            needleFrictionFactor: boundedNumber(0, 2.0).optional(),
            renderOverlayEnabled: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S149 — calligraphic dip pen flexible nib tine splitting & meniscus railroading
        flexNib: z
          .object({
            enabled: z.boolean().optional(),
            hairlineWidth: boundedNumber(0.5, 5.0).optional(),
            maxSwellWidth: boundedNumber(1.0, 40.0).optional(),
            flexSensitivity: boundedNumber(0.5, 3.0).optional(),
            meniscusRuptureWidth: boundedNumber(1.0, 40.0).optional(),
            meniscusReconnectWidth: boundedNumber(0.5, 40.0).optional(),
            reservoirCapacityPx: boundedNumber(100, 10000).optional(),
            inkFlowRate: boundedNumber(0.1, 5.0).optional(),
            inkColorHex: z.string().optional(),
            paperScratchResonance: boundedNumber(0, 2.0).optional(),
          })
          .strict()
          .optional(),
        // S150 — multi-client whiteboard live stream sync protocol & jitter buffer
        liveStreamSync: z
          .object({
            enabled: z.boolean().optional(),
            minDelayMs: boundedNumber(5, 100).optional(),
            maxDelayMs: boundedNumber(15, 1000).optional(),
            targetDelayMs: boundedNumber(5, 1000).optional(),
            smoothingAlpha: boundedNumber(0.01, 0.5).optional(),
            plcEnabled: z.boolean().optional(),
            showCursorPresence: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S151 — procedural stippling & pointillism ink shading engine
        proceduralStippling: z
          .object({
            enabled: z.boolean().optional(),
            minDotRadius: boundedNumber(0.2, 10.0).optional(),
            maxDotRadius: boundedNumber(0.5, 20.0).optional(),
            densityScale: boundedNumber(0.1, 5.0).optional(),
            relaxationIterations: boundedNumber(0, 10).optional(),
            dotGainFactor: boundedNumber(0.0, 1.0).optional(),
            paperBleedPx: boundedNumber(0.0, 5.0).optional(),
            stippleColorHex: z.string().optional(),
            foleyTapVolume: boundedNumber(0.0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S152 — metallic foil embossing & hot stamp shimmer shader pipeline
        metallicFoil: z
          .object({
            enabled: z.boolean().optional(),
            preset: z.enum(['gold', 'silver', 'rose_gold', 'copper', 'holographic']).optional(),
            embossHeightPx: boundedNumber(0.5, 8.0).optional(),
            bevelWidthPx: boundedNumber(1.0, 10.0).optional(),
            specularShininess: boundedNumber(8.0, 128.0).optional(),
            lightAngleDeg: boundedNumber(0.0, 360.0).optional(),
            lightElevationDeg: boundedNumber(15.0, 85.0).optional(),
            shimmerSpeed: boundedNumber(0.0, 3.0).optional(),
            sparkleIntensity: boundedNumber(0.0, 1.0).optional(),
            foleyPressVolume: boundedNumber(0.0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S153 — whiteboard drafting compass & mechanical divider caliper geometry
        draftingCompass: z
          .object({
            enabled: z.boolean().optional(),
            armLengthPx: boundedNumber(80.0, 400.0).optional(),
            needleFriction: boundedNumber(0.0, 1.0).optional(),
            thumbscrewPitchPx: boundedNumber(0.5, 10.0).optional(),
            showCompassOverlay: z.boolean().optional(),
            foleyRatchetVolume: boundedNumber(0.0, 1.0).optional(),
          })
          .strict()
          .optional(),
        // S154 — collaborative spatial locking & optimistic CRDT stroke merging engine
        collaborativeCRDT: z
          .object({
            enabled: z.boolean().optional(),
            clientId: z.string().optional(),
            spatialLeaseTtlMs: boundedNumber(500, 5000).optional(),
            lockPaddingPx: boundedNumber(0, 50).optional(),
            optimisticBufferLimit: boundedNumber(10, 500).optional(),
            enableSelectiveUndo: z.boolean().optional(),
          })
          .strict()
          .optional(),
        // S155 — multi-track whiteboard master sequence audio stems & Dolby Atmos spatial panning
        spatialAudio: z
          .object({
            enabled: z.boolean().optional(),
            roomWidthM: boundedNumber(4.0, 20.0).optional(),
            roomDepthM: boundedNumber(4.0, 20.0).optional(),
            roomHeightM: boundedNumber(2.5, 6.0).optional(),
            listenerPos: z.tuple([z.number(), z.number(), z.number()]).optional(),
            distanceFalloffExponent: boundedNumber(0.5, 2.0).optional(),
            referenceDistanceM: boundedNumber(0.5, 3.0).optional(),
            airAbsorptionCoeff: boundedNumber(0.0, 0.01).optional(),
            headRadiusM: boundedNumber(0.07, 0.11).optional(),
            speedOfSoundMps: boundedNumber(300.0, 360.0).optional(),
            hrtfBinauralEnabled: z.boolean().optional(),
            masterFormat: z.enum(['StereoBinaural', 'Surround51', 'Atmos714', 'ADM_BWF']).optional(),
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
    equalizer: z
      .object({
        enabled: z.boolean(),
        low: z
          .object({
            gainDb: boundedNumber(-18, 18),
            frequencyHz: boundedNumber(20, 20000),
            q: boundedNumber(0.1, 10).optional(),
          })
          .strict(),
        lowMid: z
          .object({
            gainDb: boundedNumber(-18, 18),
            frequencyHz: boundedNumber(20, 20000),
            q: boundedNumber(0.1, 10).optional(),
          })
          .strict(),
        highMid: z
          .object({
            gainDb: boundedNumber(-18, 18),
            frequencyHz: boundedNumber(20, 20000),
            q: boundedNumber(0.1, 10).optional(),
          })
          .strict(),
        high: z
          .object({
            gainDb: boundedNumber(-18, 18),
            frequencyHz: boundedNumber(20, 20000),
            q: boundedNumber(0.1, 10).optional(),
          })
          .strict(),
        mid: z
          .object({
            gainDb: boundedNumber(-18, 18),
            frequencyHz: boundedNumber(20, 20000),
            q: boundedNumber(0.1, 10).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    compressor: z
      .object({
        enabled: z.boolean(),
        threshold: boundedNumber(-60, 0),
        ratio: boundedNumber(1, 20),
        knee: boundedNumber(0, 40),
        attack: boundedNumber(0.001, 1),
        release: boundedNumber(0.01, 1),
        makeupGain: boundedNumber(0, 24),
      })
      .strict()
      .optional(),
    reverb: z
      .object({
        enabled: z.boolean(),
        space: z.enum(['booth', 'room', 'hall', 'cathedral', 'plate', 'delay']),
        decaySeconds: boundedNumber(0.1, 10),
        preDelayMs: boundedNumber(0, 250),
        wetLevel: boundedNumber(0, 1),
        dryLevel: boundedNumber(0, 1),
        highDamping: boundedNumber(0, 1),
        echoDelayMs: boundedNumber(10, 1000).optional(),
        echoFeedback: boundedNumber(0, 0.85).optional(),
      })
      .strict()
      .optional(),
    noiseGate: z
      .object({
        enabled: z.boolean(),
        threshold: boundedNumber(-100, 0),
        ratio: boundedNumber(1, 50),
        rangeDb: boundedNumber(-120, 0),
        attackMs: boundedNumber(0.1, 100),
        holdMs: boundedNumber(0, 1000),
        releaseMs: boundedNumber(1, 2000),
        hysteresisDb: boundedNumber(0, 24),
        kneeDb: boundedNumber(0, 24),
        deEsserEnabled: z.boolean(),
        deEsserFreq: boundedNumber(2000, 15000),
        deEsserAmount: boundedNumber(0, 30),
        deHummerMode: z.enum(['off', '50hz', '60hz']),
      })
      .strict()
      .optional(),
    pitch: z
      .object({
        enabled: z.boolean(),
        semitones: boundedNumber(-24, 24),
        cents: boundedNumber(-100, 100),
        preserveFormants: z.boolean(),
        formantShiftSemitones: boundedNumber(-12, 12).optional(),
        preset: z
          .enum([
            'deep_trailer',
            'helium_cartoon',
            'robot_harmonizer',
            'anonymous_interview',
            'octave_up',
            'octave_down',
            'subtle_tune',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    pan: z
      .object({
        enabled: z.boolean(),
        pan: boundedNumber(-1, 1),
        law: z.enum(['equal_power_3db', 'equal_power_4_5db', 'linear_6db']),
        spatial3d: z
          .object({
            enabled: z.boolean(),
            azimuthDeg: boundedNumber(-180, 180),
            elevationDeg: boundedNumber(-90, 90),
            distance: boundedNumber(0.1, 10),
          })
          .strict(),
        preset: z
          .enum([
            'center',
            'hard_left',
            'hard_right',
            'wide_stereo',
            'cinema_front',
            'overhead_ambient',
            'behind_listener',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    lensOptics: z
      .object({
        enabled: z.boolean(),
        distortionK1: boundedNumber(-1, 1),
        distortionK2: boundedNumber(-1, 1),
        anamorphicRatio: boundedNumber(1, 3),
        chromaticAberrationPx: boundedNumber(0, 50),
        chromaticAberrationAngleDeg: boundedNumber(0, 360),
        vignetteEnabled: z.boolean(),
        vignetteStrength: boundedNumber(0, 1),
        vignetteRadius: boundedNumber(0.1, 2),
        vignetteFeather: boundedNumber(0.1, 1),
        vignetteRoundness: boundedNumber(0.1, 2),
        centerX: boundedNumber(0, 1),
        centerY: boundedNumber(0, 1),
      })
      .strict()
      .optional(),
    filmEmulation: z
      .object({
        enabled: z.boolean(),
        preset: z
          .enum([
            'kodak_vision3_500t',
            'kodak_tri_x_400',
            'fuji_eterna_250d',
            'vintage_16mm',
            'super_8mm',
          ])
          .optional(),
        grain: z
          .object({
            enabled: z.boolean(),
            intensity: boundedNumber(0, 1),
            size: boundedNumber(0.5, 3),
            chromatic: z.boolean(),
            roughness: boundedNumber(0, 1),
          })
          .strict(),
        halation: z
          .object({
            enabled: z.boolean(),
            threshold: boundedNumber(0.4, 0.98),
            radiusPx: boundedNumber(1, 40),
            intensity: boundedNumber(0, 1),
            hueShiftDeg: boundedNumber(-20, 40),
          })
          .strict(),
        gateWeave: z
          .object({
            enabled: z.boolean(),
            amplitudeX: boundedNumber(0, 10),
            amplitudeY: boundedNumber(0, 10),
            speedHz: boundedNumber(0.2, 6),
            jitterPct: boundedNumber(0, 1),
          })
          .strict(),
      })
      .strict()
      .optional(),
    speedRamp: z
      .object({
        enabled: z.boolean(),
        points: z.array(
          z
            .object({
              id: z.string(),
              timePct: boundedNumber(0, 1),
              speed: boundedNumber(0.1, 10),
              handleIn: z
                .object({
                  dt: z.number().finite(),
                  dv: z.number().finite(),
                })
                .strict()
                .optional(),
              handleOut: z
                .object({
                  dt: z.number().finite(),
                  dv: z.number().finite(),
                })
                .strict()
                .optional(),
            })
            .strict(),
        ),
        rippleSequence: z.boolean().optional(),
      })
      .strict()
      .optional(),
    blendMode: z
      .enum([
        'normal',
        'screen',
        'multiply',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'color-burn',
        'hard-light',
        'soft-light',
        'difference',
        'exclusion',
      ])
      .optional(),
    chromaKey: z
      .object({
        enabled: z.boolean(),
        keyColorHex: hexColorSchema,
        similarity: boundedNumber(0.01, 1),
        smoothness: boundedNumber(0, 0.5),
        spillSuppression: boundedNumber(0, 1),
      })
      .strict()
      .optional(),
    mask: z
      .object({
        enabled: z.boolean(),
        shape: z.enum(['none', 'rectangle', 'circle', 'split', 'filmstrip', 'heart', 'star']),
        x: boundedNumber(0, 1),
        y: boundedNumber(0, 1),
        width: boundedNumber(0.05, 1),
        height: boundedNumber(0.05, 1),
        cornerRadius: boundedNumber(0, 100).optional(),
        feather: boundedNumber(0, 100),
        rotation: boundedNumber(-180, 180).optional(),
        invert: z.boolean().optional(),
      })
      .strict()
      .optional(),
    pipGrid: z
      .object({
        enabled: z.boolean(),
        layout: z.enum([
          'split_horizontal_50',
          'split_vertical_50',
          'grid_2x2',
          'grid_3_split',
          'grid_3x3',
          'split_3_columns',
          'split_1_top_2_bottom',
          'split_2_top_1_bottom',
          'split_cinema_2',
          'pip_floating_br',
          'pip_floating_tr',
          'pip_floating_tl',
          'pip_floating_bl',
          'triple_portrait_16x9',
        ]),
        cellIndex: z.number().int().min(0).max(16),
        gapPx: boundedNumber(0, 50).optional(),
        borderWidthPx: boundedNumber(0, 30).optional(),
        borderColorHex: hexColorSchema.optional(),
        cornerRadiusPx: boundedNumber(0, 100).optional(),
        shadow: z.boolean().optional(),
      })
      .strict()
      .optional(),
    matting: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(['smart_portrait', 'silhouette', 'color_isolate']),
        threshold: boundedNumber(0, 1),
        edgeFeather: boundedNumber(0, 100),
        edgeChoke: boundedNumber(-50, 50),
        edgeBlur: boundedNumber(0, 50),
        spillSuppression: boundedNumber(0, 1),
        invertMatte: z.boolean(),
        viewMode: z.enum(['composite', 'alpha_matte', 'overlay_mask', 'original']),
        preset: z
          .enum([
            'crisp_portrait',
            'soft_hair_detail',
            'silhouette_choke',
            'dramatic_isolate',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    opticalFlow: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(['nearest', 'blend', 'optical_flow', 'smooth_motion']),
        targetFps: boundedNumber(12, 240),
        speedMultiplier: boundedNumber(0.01, 10),
        motionVectorPrecision: z.enum(['pixel', 'half_pixel', 'quarter_pixel']),
        sceneChangeThreshold: boundedNumber(0, 1),
        blockOverlapPct: boundedNumber(0, 100),
        preset: z
          .enum([
            'smooth_slow_mo_4x',
            'extreme_dream_mo_10x',
            'action_sports_2x',
            'cinematic_60fps_fluid',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    audioIsolation: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(['vocal_isolate', 'instrumental_isolate', 'dialogue_enhance', 'de_reverb']),
        isolationStrength: boundedNumber(0, 1),
        speechClarity: boundedNumber(0, 1),
        deReverbAmount: boundedNumber(0, 1),
        levelerEnabled: z.boolean(),
        targetLufs: boundedNumber(-30, -14),
        preset: z
          .enum([
            'podcast_clarity',
            'interview_cleanup',
            'acapella_vocal_only',
            'karaoke_instrumental',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    stabilizer: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(['smooth_motion', 'tripod_lock', 'translation_only']),
        smoothness: boundedNumber(1, 50),
        shakiness: boundedNumber(1, 10),
        autoCropZoom: boundedNumber(0, 0.35),
        rollingShutterCorrection: z.boolean(),
        rollingShutterStrength: boundedNumber(0, 1),
        preset: z
          .enum([
            'handheld_vlog',
            'action_cam_extreme',
            'drone_aerial',
            'tripod_lock',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    hdrToneMapping: z
      .object({
        enabled: z.boolean(),
        curve: z.enum(['aces_filmic', 'hable', 'reinhard', 'mobius']),
        targetPeakNits: boundedNumber(100, 4000),
        desaturation: boundedNumber(0, 1),
        exposureCompensationEv: boundedNumber(-4, 4),
        falseColorEnabled: z.boolean(),
        preset: z
          .enum([
            'aces_rec709_cinema',
            'filmic_soft_rolloff',
            'high_contrast_punch',
            'broadcast_safe_sdr',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    multibandDenoiser: z
      .object({
        enabled: z.boolean(),
        lowBandReductionDb: boundedNumber(0, 30),
        lowMidBandReductionDb: boundedNumber(0, 30),
        highMidBandReductionDb: boundedNumber(0, 30),
        highBandReductionDb: boundedNumber(0, 30),
        deClickEnabled: z.boolean(),
        deClickSensitivity: boundedNumber(1, 10),
        deHumMode: z.enum(['off', '50hz_mains', '60hz_mains']),
        deHumHarmonics: boundedNumber(1, 8),
        preset: z
          .enum([
            'fan_hiss_suppression',
            'ac_rumble_cleanup',
            'vinyl_click_restoration',
            'complete_studio_denoise',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    videoDenoiser: z
      .object({
        enabled: z.boolean(),
        spatialLumaStrength: boundedNumber(0, 15),
        spatialChromaStrength: boundedNumber(0, 15),
        temporalLumaStrength: boundedNumber(0, 20),
        temporalChromaStrength: boundedNumber(0, 20),
        temporalRadius: boundedNumber(1, 5),
        chromaDenoiseBoost: z.boolean(),
        detailSharpenAmount: boundedNumber(0, 2),
        preset: z
          .enum([
            'subtle_sensor_grain',
            'high_iso_digital_noise',
            'chroma_blotch_cleaner',
            'night_low_light_salvage',
            'vintage_analog_restoration',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    multiCam: z
      .object({
        enabled: z.boolean(),
        activeAngleIndex: boundedNumber(0, 15),
        angles: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            cameraLabel: z.string(),
            sourceMediaId: z.string().optional(),
            syncOffsetFrames: boundedNumber(-10000, 10000),
            colorTag: z.string().optional(),
          }),
        ),
        audioFollowsVideo: z.boolean(),
        syncMethod: z.enum(['audio_waveform', 'in_point', 'timecode']),
      })
      .strict()
      .optional(),
    motionBlur: z
      .object({
        enabled: z.boolean(),
        shutterAngle: boundedNumber(0, 360),
        shutterPhase: boundedNumber(-90, 90),
        sampleCount: boundedNumber(2, 16),
        motionThreshold: boundedNumber(0, 1),
        preset: z
          .enum([
            'cinema_standard_180',
            'action_staccato_90',
            'dreamy_fluid_360',
            'high_speed_ramp',
          ])
          .optional(),
      })
      .strict()
      .optional(),
    compound: compoundClipSettingsSchema.optional(),
    anchor: z
      .object({
        enabled: z.boolean(),
        parentClipId: z.string(),
        offsetFrames: z.number().int(),
        anchorPoint: z.enum(['start', 'end', 'midpoint']).optional(),
        orphanPolicy: z.enum(['keep_absolute', 'delete', 'reanchor_nearest']).optional(),
      })
      .strict()
      .optional(),
    spectralDucking: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(['broadband', 'spectral_formant']),
        preset: z
          .enum([
            'transparent_speech',
            'broadcast_podcast',
            'subtle_acoustic',
            'high_impact_trailer',
          ])
          .optional(),
        thresholdDb: boundedNumber(-50, 0),
        duckingDepthDb: boundedNumber(-50, 0),
        lowCrossoverHz: boundedNumber(100, 1000),
        highCrossoverHz: boundedNumber(1000, 10000),
        lookaheadMs: boundedNumber(0, 100),
        attackMs: boundedNumber(1, 500),
        holdMs: boundedNumber(0, 2000),
        releaseMs: boundedNumber(10, 5000),
        ratio: boundedNumber(1, 20),
      })
      .strict()
      .optional(),
    dynamicEq: z
      .object({
        enabled: z.boolean(),
        globalGainDb: boundedNumber(-12, 12),
        lookaheadMs: boundedNumber(0, 20),
        bands: z.array(
          z
            .object({
              id: z.string(),
              name: z.string().optional(),
              enabled: z.boolean(),
              type: z.enum(['bell', 'low_shelf', 'high_shelf', 'notch']),
              frequencyHz: boundedNumber(20, 20000),
              q: boundedNumber(0.1, 20.0),
              staticGainDb: boundedNumber(-24, 24),
              dynamicGainDb: boundedNumber(-24, 24),
              thresholdDb: boundedNumber(-60, 0),
              ratio: boundedNumber(1.0, 20.0),
              kneeDb: boundedNumber(0, 12),
              attackMs: boundedNumber(0.1, 100),
              releaseMs: boundedNumber(5, 1000),
              mode: z.enum(['compress', 'expand']),
              detection: z.enum(['peak', 'rms']).optional(),
            })
            .strict(),
        ),
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
export function buildColorFilterChain(
  effects: ClipEffects | undefined,
  dimensions: { width: number; height: number } = { width: 1920, height: 1080 },
): string {
  if (!effects) return '';
  const parts: string[] = [];

  // 1. Base color adjustments (brightness, contrast, saturation, gamma, hue, sharpen, vignette)
  if (effects.filters) {
    const values = resolveFilterValues(effects);
    if (!isNeutralFilterValues(values)) {
      const eq: string[] = [];
      if (!neutral(values.brightness, 0)) eq.push(`brightness=${values.brightness.toFixed(3)}`);
      if (!neutral(values.contrast, 1)) eq.push(`contrast=${values.contrast.toFixed(3)}`);
      if (!neutral(values.saturation, 1)) eq.push(`saturation=${values.saturation.toFixed(3)}`);
      if (!neutral(values.gamma, 1)) eq.push(`gamma=${values.gamma.toFixed(3)}`);
      if (eq.length > 0) parts.push(`eq=${eq.join(':')}`);

      if (!neutral(values.hue, 0)) parts.push(`hue=h=${values.hue.toFixed(1)}`);
      if (!neutral(values.sharpen, 0)) {
        // 5x5 luma matrix; amount 0..1 maps onto unsharp's useful 0..1.5 range.
        parts.push(`unsharp=5:5:${(values.sharpen * 1.5).toFixed(3)}`);
      }
      if (!neutral(values.vignette, 0)) {
        // vignette's angle: PI/5 is its own default look; strength scales toward it.
        parts.push(`vignette=PI/5*${values.vignette.toFixed(3)}`);
      }
    }
  }

  // S30 — Primary Color Balance & 3-Way Wheels
  const colorGrade = buildFfmpegColorBalanceFilter(effects.colorGrade);
  if (colorGrade) {
    parts.push(colorGrade);
  }

  // S42 — 3D LUT (Look-Up Table) & Film Emulation LUTs
  const lutFilter = buildFfmpegLutFilter(effects.lut);
  if (lutFilter) {
    parts.push(lutFilter);
  }

  // S55 — HDR Tone Mapping & ACES Color Science
  if (effects.hdrToneMapping) {
    const hdrFilter = buildFfmpegToneMappingFilter(effects.hdrToneMapping);
    if (hdrFilter) {
      parts.push(hdrFilter);
    }
  }

  // S46 — Lens Distortion, Anamorphic Desqueeze & Chromatic Aberration
  const lensFilter = buildFfmpegLensFilter(effects.lensOptics);
  if (lensFilter) {
    parts.push(lensFilter);
  }

  // S54 — Video Stabilization & Rolling Shutter Deshake
  if (effects.stabilizer) {
    const stabilizerFilter = buildFfmpegStabilizerFilter(effects.stabilizer);
    if (stabilizerFilter) {
      parts.push(stabilizerFilter);
    }
  }

  // S51 — AI Portrait Matting & Cutout
  if (effects.matting) {
    const mattingFilter = buildFfmpegMattingFilter(effects.matting);
    if (mattingFilter) {
      parts.push(mattingFilter);
    }
  }

  // S38 — Chroma Key & Color Spill Suppression
  const chromaFilter = buildFfmpegChromaKeyFilter(effects.chromaKey);
  if (chromaFilter) {
    parts.push(chromaFilter);
  }

  // S39 — Video Masking & Shape Cropping
  const maskFilter = buildFfmpegMaskFilter(effects.mask, dimensions.width, dimensions.height);
  if (maskFilter) {
    parts.push(maskFilter);
  }

  // S48 — Film Grain, Analog Halation & Gate Weave Emulation
  const filmEmulation = buildFfmpegFilmEmulationFilter(effects.filmEmulation);
  if (filmEmulation) {
    parts.push(filmEmulation);
  }

  // S57 — Temporal Video Noise Reduction (TNR) & Detail Enhancer
  const videoDenoiser = buildFfmpegVideoDenoiserFilter(effects.videoDenoiser);
  if (videoDenoiser) {
    parts.push(videoDenoiser);
  }

  // S60 — Cinematic Motion Blur & Rotary Shutter Angle Emulation
  const motionBlur = buildFfmpegMotionBlurFilter(effects.motionBlur);
  if (motionBlur) {
    parts.push(motionBlur);
  }

  return parts.join(',');
}

/**
 * Beta S66 — Synthesizes a studio-grade FFmpeg audio filter chain from ClipEffects.
 *
 * Signal processing flow conforms to audio post-production standard:
 * 1. Restoration & Isolation: AI vocal isolation, spectral denoiser, harmonic de-hummer
 * 2. Dynamics gating: Noise gate, de-esser
 * 3. Tonal shaping: 3-band parametric EQ (bass, mid, treble)
 * 4. Dynamic range control: Compressor and peak limiter
 * 5. Pitch & Modulation: Pitch shifter and formant correction
 * 6. Spatial ambience: Convolution/algorithmic reverb and stereo delay
 * 7. Stereo staging: Pan and 3D spatial orientation
 *
 * Strict neutrality posture: returns `''` when no audio filters are active.
 */
export function buildAudioFilterChain(effects: ClipEffects | undefined): string {
  if (!effects) return '';
  const parts: string[] = [];

  // S53 — AI Vocal Isolation, Dialogue Enhancer & Stems
  if (effects.audioIsolation) {
    const filter = buildFfmpegIsolationFilter(effects.audioIsolation);
    if (filter) parts.push(filter);
  }

  // S56 — Multiband Audio Denoiser, De-Clicker & Hum Removal
  if (effects.multibandDenoiser) {
    const filter = buildFfmpegMultibandDenoiserFilter(effects.multibandDenoiser);
    if (filter) parts.push(filter);
  }

  // S183 — Parametric AC Mains Hum Notch Filter Rack
  if (effects.notchFilter) {
    const notchFilter = generateNotchFilterString(effects.notchFilter);
    if (notchFilter) parts.push(notchFilter);
  }

  // S45 — Audio Noise Gate, Downward Expander & Dialogue De-Esser / De-Hummer
  const gateFilter = buildFfmpegGateFilter(effects.noiseGate);
  if (gateFilter) {
    parts.push(gateFilter);
  }

  // S183 — Studio Vocal De-Esser
  if (effects.deEsser) {
    const deEsserFilter = generateDeEsserFilterString(effects.deEsser);
    if (deEsserFilter) parts.push(deEsserFilter);
  }

  // S35 — 3-Band Parametric Audio Equalizer (Bass, Mid, Treble)
  const eqFilter = buildFfmpegEqFilter(effects.equalizer);
  if (eqFilter) {
    parts.push(eqFilter);
  }

  // S191 — Multi-Band Dynamic EQ & Resonance Notch Suppressor
  if (effects.dynamicEq) {
    const dynamicEqFilter = generateDynamicEqFiltergraph(effects.dynamicEq);
    if (dynamicEqFilter) {
      parts.push(dynamicEqFilter);
    }
  }

  // S36 — Dynamic Range Audio Compressor & Peak Limiter
  if (effects.compressor) {
    const compFilter = buildFfmpegCompressorFilter(effects.compressor);
    if (compFilter) {
      parts.push(compFilter);
    }
  }

  // S49 — Audio Pitch Shifter & Formant Voice Effects
  const pitchFilter = buildFfmpegPitchFilter(effects.pitch);
  if (pitchFilter) {
    parts.push(pitchFilter);
  }

  // S41 — Audio Reverb, Stereo Echo Delay & Spatial Ambience
  if (effects.reverb) {
    const reverbFilter = buildFfmpegReverbFilter(effects.reverb);
    if (reverbFilter) {
      parts.push(reverbFilter);
    }
  }

  // S50 — Stereo Audio Panner & 3D Spatial Audio
  const panFilter = buildFfmpegPanFilter(effects.pan);
  if (panFilter) {
    parts.push(panFilter);
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
/**
 * Maps CapCut video effects to equivalent ffmpeg filters for export rendering.
 */
export function buildVideoEffectFfmpegFilter(vfx: VideoEffectSettings | undefined): string {
  if (!vfx || vfx.disabled) return '';
  const intensity = (vfx.intensity ?? 75) / 100;

  switch (vfx.presetId) {
    case 'camera_shake':
      return `crop=in_w-20:in_h-20:10+5*sin(t*15):10+5*cos(t*18),scale=in_w:in_h`;
    case 'rgb_split':
      return `rgbashift=rh=4:bv=-4`;
    case 'flash_white':
    case 'strobe_light':
      return `eq=brightness='if(lt(mod(t,0.5),0.1),${(0.3 * intensity).toFixed(2)},0)'`;
    case 'crt_scanlines':
      return `drawgrid=width=10000:height=4:thickness=1:color=black@0.3`;
    case 'film_8mm_nostalgia':
      return `noise=alls=20:allf=t+u,eq=contrast=1.1:saturation=1.1`;
    case 'vhs_static_noise':
      return `noise=alls=25:allf=t,eq=saturation=1.2`;
    case 'promist_soft_glow':
    case 'radial_blur':
    case 'motion_blur_speed':
      return `boxblur=2:1`;
    case 'film_burn_edge':
    case 'light_leak_vintage':
      return `eq=contrast=1.1:saturation=1.2`;
    default:
      return '';
  }
}

/**
 * S157 — the colour and video effect chain, gated to a time window.
 *
 * The adjustment-layer render (an `'effect'` clip) applies its filters to the
 * finished composite only between the clip's own start and end. ffmpeg's
 * `enable=` is per-filter, so each filter in the chain carries the same
 * `between(t,…)` clause.
 */
export function buildWindowedColorFilterChain(
  effects: ClipEffects | undefined,
  startSeconds: number,
  endSeconds: number,
  dimensions?: { width: number; height: number },
): string {
  const parts: string[] = [];
  const colorChain = buildColorFilterChain(effects, dimensions);
  if (colorChain) parts.push(colorChain);
  const vfxChain = buildVideoEffectFfmpegFilter(effects?.videoEffect);
  if (vfxChain) parts.push(vfxChain);
  if (parts.length === 0) return '';
  const enable = `enable='between(t,${startSeconds.toFixed(3)},${endSeconds.toFixed(3)})'`;
  return parts
    .join(',')
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
  const intensity =
    effects?.filterIntensity !== undefined
      ? Math.max(0, Math.min(100, effects.filterIntensity)) / 100
      : 1;

  const at = (value: number | undefined, neutralValue: number): number => {
    if (neutral(value, neutralValue)) return neutralValue;
    const scaled = neutralValue + (value! - neutralValue) * intensity;
    return Number(scaled.toFixed(3));
  };

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
  if (!effects) return '';
  const parts: string[] = [];
  if (effects.filters) {
    const values = resolveFilterValues(effects);
    if (values.brightness !== 0) parts.push(`brightness(${(1 + values.brightness).toFixed(3)})`);
    if (values.contrast !== 1) parts.push(`contrast(${values.contrast.toFixed(3)})`);
    if (values.saturation !== 1) parts.push(`saturate(${values.saturation.toFixed(3)})`);
    if (values.hue !== 0) parts.push(`hue-rotate(${values.hue.toFixed(1)}deg)`);
  }
  // S30 — Primary Color Balance & 3-Way Wheels CSS Preview
  const gradeCss = buildGradingCssFilter(effects.colorGrade);
  if (gradeCss) {
    parts.push(gradeCss);
  }
  // S42 — 3D LUT & Film Emulation CSS Preview
  const lutCss = buildCssLutFilter(effects.lut);
  if (lutCss) {
    parts.push(lutCss);
  }
  // S48 — Film Emulation (Halation drop-shadow & grain) CSS Preview
  if (effects.filmEmulation?.enabled) {
    const filmStyle = buildCssFilmEmulationStyle(effects.filmEmulation);
    if (filmStyle.filter) {
      parts.push(filmStyle.filter);
    }
  }
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
