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
import type { WhiteboardCameraFollowerSettings } from './viewport-camera-ops';
import type { WhiteboardInkPhysicsSettings } from './ink-physics-ops';
import type { WhiteboardCustomHandSettings } from './hand-pose-ops';
import type { AutoTraceSettings } from './bitmap-vectorizer-ops';
import type { KineticTypographySettings } from './kinetic-typography-ops';
import type { BidiWritingSettings } from './bidi-writing-ops';
import type { StylusPressureSettings } from './pressure-ribbon-ops';
import type { SurfaceFrictionSettings } from './surface-friction-ops';
import type { SmudgeBlendSettings } from './smudge-blending-ops';
import type { ToolSwapConfig } from './tool-swap-ops';
import type { AttentionLightingSettings } from './attention-lighting-ops';
import type { DraftingGuideSettings } from './drafting-guide-ops';
import type { DepthOfFieldSettings } from './dof-bokeh-ops';
import type { DualHandDuetSettings } from './dual-hand-duet-ops';
import type { ChromaChalkNeonSettings } from './chroma-chalk-ops';
import type { WetSpongeCondensationSettings } from './wet-sponge-ops';
import type { LightboardGlassSettings } from './lightboard-glass-ops';
import type { ShapeRecognitionSettings } from './shape-recognizer-ops';
import type { LaserPointerSettings } from './laser-pointer-ops';
import type { PerspectiveGridSettings } from './perspective-grid-ops';
import type { ContactShadowSettings } from './contact-shadow-ops';
import type { InkDepletionSettings } from './ink-depletion-ops';
import type { ToolOrchestrationSettings } from './tool-orchestration-ops';
import type { PaletteDockSettings } from './palette-dock-ops';
import type { PressureAudioSettings } from './pressure-audio-resonance-ops';
import type { StickyNoteSettings, StencilMaskSettings } from './sticky-stencil-ops';
import type { LassoCalloutSettings } from './lasso-callout-ops';
import type { HighlighterSettings } from './fluorescent-highlighter-ops';
import type { MultiSourceLightingSettings } from './multi-source-lighting-ops';
import type { ChalkDustSettlingSettings } from './chalk-dust-settling-ops';
import type { HandShadowPenumbraSettings } from './hand-silhouette-penumbra-ops';
import type { CapSnapFoleySettings } from './cap-snap-foley-ops';
import type { GradientWashSettings } from './gradient-wash-ribbon-ops';
import type { NibSplaySettings } from './nib-splay-compression-ops';
import type { CapillaryBleedSettings } from './capillary-bleed-ops';
import type { EraserGhostingSettings } from './eraser-smear-ghosting-ops';
import type { GlassParallaxSettings } from './glass-specular-parallax-ops';
import type { GraphiteGrainSettings } from './graphite-sheen-grain-ops';
import type { VaporShimmerSettings } from './solvent-vapor-shimmer-ops';
import type { MasterExportSettings } from './storyboard-master-export-ops';
import type { AudioReactiveInkSettings } from './audio-reactive-ink-ops';
import type { PalmSmudgeSettings } from './palm-smudge-occlusion-ops';
import type { QuadTreeTileSettings } from './spatial-quadtree-tile-ops';
import type { ChalkChatterSettings } from './chalk-breakage-chatter-ops';
import type { StrokeShaderSettings } from './stroke-shader-pipeline-ops';
import type { CharcoalTortillonSettings } from './charcoal-tortillon-ops';
import type { OnionSkinSettings } from './onion-skin-light-table-ops';
import type { PantographSettings } from './pantograph-magnetic-pivot-ops';
import type { FlexNibSettings } from './flex-nib-railroading-ops';
import type { LiveSyncSettings } from './live-stream-sync-ops';
import type { StippleSettings } from './procedural-stippling-ops';
import type { FoilSettings } from './metallic-foil-ops';
import type { CompassSettings } from './compass-divider-caliper-ops';
import type { CollaborativeSyncSettings } from './collaborative-crdt-ops';
import type { SpatialAudioSettings } from './spatial-audio-atmos-ops';

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
  hand: 'pen' | 'marker' | 'pencil' | 'chalk' | 'none';
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
  /** Milestone S91 — Drawing contact foley SFX toggle. @default true */
  foleyEnabled?: boolean;
  /** Milestone S91 — Foley sound volume level (0.0 to 1.0, default 0.6). */
  foleyVolume?: number;
  /** Milestone S93 — Board clearing erase-out at clip conclusion. @default false */
  eraseOut?: boolean;
  /** Milestone S93 — Fraction of clip spent erasing the board (0.05 to 0.40, default 0.20). */
  eraseFraction?: number;
  /** Milestone S93 — Erase wiping motion style. @default 'zigzag' */
  erasePattern?: 'zigzag' | 'wipe';
  /** Milestone S94 — Stroke decimation & Catmull-Rom Bezier smoothing profile. @default 'smooth' */
  strokeSmoothing?: 'none' | 'subtle' | 'smooth' | 'high';
  /** Milestone S94 — RDP simplify deviation tolerance in pixels (0.0 to 3.0, default 1.2). */
  simplifyTolerance?: number;
  /** Milestone S95 — Vector path continuous morphing into next scene element. */
  morphTransition?: {
    enabled?: boolean;
    easing?: 'linear' | 'ease-in-out' | 'elastic';
    durationSeconds?: number;
  };
  /** Milestone S96 — Procedural cross-hatching and graphite texture shading. */
  shadingStyle?: 'bloom' | 'hatch' | 'crosshatch';
  hatchAngle?: number;
  hatchSpacingPx?: number;
  crossHatch?: boolean;
  /** Milestone S97 — Dynamic calligraphy, pressure-sensitive velocity tapering & chisel nib geometry. */
  brushDynamics?: {
    taper?: boolean;
    chiselNib?: boolean;
    nibAngleDeg?: number;
    minWidthRatio?: number;
  };
  /** Milestone S98 — Multi-path saliency clustering & contour prioritization. @default 'hierarchical' */
  clusteringMode?: 'none' | 'proximity' | 'saliency' | 'hierarchical';
  /** Milestone S100 — Dynamic inertial camera viewport follower & directional hand shadow. */
  cameraFollower?: WhiteboardCameraFollowerSettings;
  /** Milestone S101 — Physical ink bleed, wet-edge pooling & chalk dust particles. */
  inkPhysics?: WhiteboardInkPhysicsSettings;
  /** Milestone S103 — Custom hand stylus asset calibration & dynamic pose warping. */
  customHand?: WhiteboardCustomHandSettings;
  /** Milestone S104 — Bitmap vectorization & contour auto-trace settings. */
  autoTrace?: AutoTraceSettings;
  /** Milestone S105 — Kinetic typography & handwriting cadence settings. */
  kineticTypography?: KineticTypographySettings;
  /** Milestone S106 — Multi-language bidirectional RTL writing & diacritic scheduling. */
  bidiWriting?: BidiWritingSettings;
  /** Milestone S107 — Pressure-sensitive stylus dynamics & variable ribbon settings. */
  stylusPressure?: StylusPressureSettings;
  /** Milestone S108 — Granular surface friction, substrate tooth & progressive nib wear. */
  surfaceFriction?: SurfaceFrictionSettings;
  /** Milestone S109 — Procedural smudge advection, finger-blending & eraser highlights. */
  smudgeBlend?: SmudgeBlendSettings;
  /** Milestone S110 — Multi-tool hot-swapping, eraser cap flip & sound-synchronized carousel. */
  toolSwap?: ToolSwapConfig;
  /** Milestone S111 — Heatmap-driven attention lighting, dynamic vignetting & pen spotlight shading. */
  attentionLighting?: AttentionLightingSettings;
  /** Milestone S112 — Real-time vector ruler, compass & geometric drafting guide system. */
  draftingGuide?: DraftingGuideSettings;
  /** Milestone S113 — Layered depth-of-field (DoF) optical bokeh & defocus hand blur. */
  depthOfField?: DepthOfFieldSettings;
  /** Milestone S114 — Multi-hand simultaneous duet collaboration & dual-stylus choreography. */
  dualHandDuet?: DualHandDuetSettings;
  /** Milestone S115 — Whiteboard Chroma Chalk & Neon UV Blacklight Luminescence Shader. */
  chromaChalk?: ChromaChalkNeonSettings;
  /** Milestone S116 — Procedural water droplet condensation, wet sponge evaporation & dew drop smear physics. */
  wetSponge?: WetSpongeCondensationSettings;
  /** Milestone S117 — Whiteboard Optical Glass Lightboard & Internal Edge-Lit Luminescence Mode. */
  lightboard?: LightboardGlassSettings;
  /** Milestone S118 — Smart geometric shape recognition & snap-to-vector primitive engine. */
  shapeRecognition?: ShapeRecognitionSettings;
  /** Milestone S119 — Whiteboard Laser Pointer Tracker, Optical Phosphor Persistence & Luminescent Afterglow Trails. */
  laserPointer?: LaserPointerSettings;
  /** Milestone S120 — Whiteboard Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective. */
  gridSubstrate?: PerspectiveGridSettings;
  /** Milestone S121 — Procedural Whiteboard Hand Contact Shadows & Dynamic Ambient Occlusion. */
  contactShadow?: ContactShadowSettings;
  /** Milestone S122 — Whiteboard Marker Ink Depletion, Dry-Out Streaking & Chalk Micro-Chatter Physics. */
  inkDepletion?: InkDepletionSettings;
  /** Milestone S123 — Whiteboard Dynamic Tool Auto-Invocation, Staging Carousel & Retraction Dynamics. */
  toolOrchestrator?: ToolOrchestrationSettings;
  /** Milestone S124 — Whiteboard Multi-Color Palette Carousel, Ring Dock & Click-Pen Dynamics. */
  paletteDock?: PaletteDockSettings;
  /** Milestone S125 — Whiteboard Stylus Tip Pressure-To-Audio Pitch Modulation, Nib Creak / Slate Squeak Friction Resonance & Multi-Stage Haptic Vibration Feedback. */
  pressureAudio?: PressureAudioSettings;
  /** Milestone S126 — Whiteboard Sticky Notes, Board Magnets & Paper Stencil Masking. */
  stickyNote?: StickyNoteSettings;
  stencilMask?: StencilMaskSettings;
  /** Milestone S127 — Whiteboard Lasso Gesture Recognition, Auto-Callout Badges & Focus Pulsing. */
  lassoCallout?: LassoCalloutSettings;
  /** Milestone S128 — Whiteboard Broad Chisel-Tip Fluorescent Highlighter Sub-Layer. */
  highlighter?: HighlighterSettings;
  /** Milestone S129 — Whiteboard Multi-Source Hand Lighting & Dual-Penumbra Contact Shadows. */
  multiSourceLighting?: MultiSourceLightingSettings;
  /** Milestone S130 — Whiteboard Chalk Dust Settling & Gravitational Blackboard Particle Physics. */
  chalkDustSettling?: ChalkDustSettlingSettings;
  /** Milestone S131 — Whiteboard Hand Shadow Soft-Penumbra Contact AO with Silhouette Tracing. */
  handSilhouettePenumbra?: HandShadowPenumbraSettings;
  /** Milestone S132 — Whiteboard Marker Cap Snap & Pressure Vacuum Click Foley Acoustics with Magnetic Dock Snapping. */
  capSnapFoley?: CapSnapFoleySettings;
  /** Milestone S133 — Whiteboard Multi-Color Pen Ribbon Blending & Gradient Transition Wash. */
  gradientWash?: GradientWashSettings;
  /** Milestone S134 — Whiteboard Felt-Tip Marker Nib Splay & Directional Fiber Compression Dynamics. */
  nibSplay?: NibSplaySettings;
  /** Milestone S135 — Whiteboard Wet-on-Wet Capillary Bleed & Pigment Diffusion at Stroke Intersections. */
  capillaryBleed?: CapillaryBleedSettings;
  /** Milestone S136 — Whiteboard Dry-Erase Felt Eraser Swipe Smear & Ghosting Residuals. */
  eraserGhosting?: EraserGhostingSettings;
  /** Milestone S137 — Whiteboard Dual-Layer Tempered Glass Specular Glare & Parallax Reflection. */
  glassParallax?: GlassParallaxSettings;
  /** Milestone S138 — Whiteboard Graphite Sheen Reflection & Textured Paper Grain Bump Mapping. */
  graphiteGrain?: GraphiteGrainSettings;
  /** Milestone S139 — Whiteboard Solvent Vapor Shimmer & Ambient Thermal Convection. */
  vaporShimmer?: VaporShimmerSettings;
  /** Milestone S140 — Multi-Track Storyboard Master Mixdown & 4K ProRes/H.265 Export Pipeline. */
  storyboardMasterExport?: MasterExportSettings;
  /** Milestone S141 — Whiteboard Live Audio-Visual Reactive Ink Pulsing. */
  audioReactiveInk?: AudioReactiveInkSettings;
  /** Milestone S142 — Whiteboard Hand Palm Occlusion & Natural Smudging Physics. */
  palmSmudge?: PalmSmudgeSettings;
  /** Milestone S143 — Multi-Resolution Spatial Tile Caching & Vector QuadTree Acceleration. */
  quadtreeTileCache?: QuadTreeTileSettings;
  /** Milestone S144 — Whiteboard Chalk Breakage & Variable Angle Edge Chatters. */
  chalkBreakage?: ChalkChatterSettings;
  /** Milestone S145 — Real-Time WebGL/WebGPU Stroke Fragment Shader Pipeline. */
  strokeShader?: StrokeShaderSettings;
  /** Milestone S146 — Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending. */
  charcoalTortillon?: CharcoalTortillonSettings;
  /** Milestone S147 — Multi-Layer Animation Onion Skinning & Light Table Backlighting. */
  onionSkinLightTable?: OnionSkinSettings;
  /** Milestone S148 — Whiteboard Drafting Pantograph Mechanical Linkage & Magnetic Arc Pivot. */
  pantographPivot?: PantographSettings;
  /** Milestone S149 — Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading. */
  flexNib?: FlexNibSettings;
  /** Milestone S150 — Multi-Client Whiteboard Live Stream Sync Protocol & Jitter Buffer. */
  liveStreamSync?: LiveSyncSettings;
  /** Milestone S151 — Procedural Stippling & Pointillism Ink Shading Engine. */
  proceduralStippling?: StippleSettings;
  /** Milestone S152 — Metallic Foil Embossing & Hot Stamp Shimmer Shader Pipeline. */
  metallicFoil?: FoilSettings;
  /** Milestone S153 — Whiteboard Drafting Compass & Mechanical Divider Caliper Geometry. */
  draftingCompass?: CompassSettings;
  /** Milestone S154 — Collaborative Spatial Locking & Optimistic CRDT Stroke Merging Engine. */
  collaborativeCRDT?: CollaborativeSyncSettings;
  /** Milestone S155 — Multi-Track Master Audio Stems & Dolby Atmos Spatial Panning. */
  spatialAudio?: SpatialAudioSettings;
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
  /** Milestone S96 — Secondary intersecting cross-hatch pass. */
  crossHatch?: boolean;
  /** Milestone S96 — Distance in pixels between adjacent hatch lines (default 12). */
  hatchSpacingPx?: number;
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
  foleyEnabled: true,
  foleyVolume: 0.6,
  eraseOut: false,
  eraseFraction: 0.20,
  erasePattern: 'zigzag',
};

export interface WhiteboardPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  cadenceFps: number;
  look: 'none' | 'sketch' | 'pencil' | 'comic';
  hand: 'pen' | 'marker' | 'pencil' | 'chalk' | 'none';
  pattern: 'serpentine' | 'wipe' | 'zones' | 'trace';
  paperColor: string;
  textColor: string;
  rows?: number;
  drawFraction?: number;
}

export const WHITEBOARD_PRESETS: readonly WhiteboardPreset[] = [
  {
    id: 'notion-doodle',
    name: 'Notion Doodle',
    icon: 'draw',
    description: '12 FPS hand-drawn line art on warm parchment with a fountain pen',
    cadenceFps: 12,
    look: 'sketch',
    hand: 'pen',
    pattern: 'trace',
    paperColor: '#F5EBD7',
    textColor: '#2C2523',
    drawFraction: 0.85,
  },
  {
    id: 'chalkboard-lecture',
    name: 'Chalkboard Lecture',
    icon: 'school',
    description: '16 FPS academic chalk linework on dark slate blackboard',
    cadenceFps: 16,
    look: 'pencil',
    hand: 'chalk',
    pattern: 'serpentine',
    paperColor: '#1C221F',
    textColor: '#E8EFEA',
    rows: 6,
    drawFraction: 0.88,
  },
  {
    id: 'architect-blueprint',
    name: 'Architect Blueprint',
    icon: 'architecture',
    description: '24 FPS precise technical vector line tracing on blueprint cyan paper',
    cadenceFps: 24,
    look: 'sketch',
    hand: 'pencil',
    pattern: 'trace',
    paperColor: '#0D3B66',
    textColor: '#E0F2FE',
    drawFraction: 0.8,
  },
  {
    id: 'comic-pop',
    name: 'Comic Pop',
    icon: 'auto_stories',
    description: '18 FPS bold posterized tone flats on newsprint paper',
    cadenceFps: 18,
    look: 'comic',
    hand: 'marker',
    pattern: 'wipe',
    paperColor: '#F9F6EE',
    textColor: '#1E1B18',
    drawFraction: 0.75,
  },
  {
    id: 'speed-paint',
    name: 'Speed Paint',
    icon: 'flash_on',
    description: '30 FPS fluid rapid continuous wipe reveal on clean studio white board',
    cadenceFps: 30,
    look: 'none',
    hand: 'marker',
    pattern: 'wipe',
    paperColor: '#FFFFFF',
    textColor: '#111827',
    drawFraction: 0.7,
  },
];

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
 * Milestone S93 — calculates the duration in seconds of the board erase clearing phase.
 */
export function resolveWhiteboardEraseSeconds(
  settings: Pick<WhiteboardSettings, 'eraseOut' | 'eraseFraction'>,
  durationFrames: number,
  fps: number,
): number {
  if (!settings.eraseOut) return 0;
  const safeFps = Math.min(120, Math.max(1, Math.round(fps)));
  const totalSeconds = Math.max(1, Math.round(durationFrames)) / safeFps;
  const fraction = Math.min(0.40, Math.max(0.05, settings.eraseFraction ?? 0.20));
  return Math.min(totalSeconds * 0.5, fraction * totalSeconds);
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

export interface WhiteboardAnnotationExport {
  canvas: { width: number; height: number };
  version: string;
  elements: Array<{
    id: string;
    label: string;
    sequence: number;
    type: string;
    region: { x: number; y: number; width: number; height: number };
    points: [number, number][];
    reveal: {
      direction: 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left';
      durationMs?: number;
      weight: number;
      style: WhiteboardZoneType;
    };
  }>;
}

export function exportWhiteboardAnnotation(
  zones: readonly WhiteboardZone[],
  canvasWidth = 1920,
  canvasHeight = 1080,
): WhiteboardAnnotationExport {
  const elements = zones.map((zone, idx) => {
    const xs = zone.points.map((p) => p.x * canvasWidth);
    const ys = zone.points.map((p) => p.y * canvasHeight);
    const minX = Math.round(Math.min(...xs));
    const minY = Math.round(Math.min(...ys));
    const maxX = Math.round(Math.max(...xs));
    const maxY = Math.round(Math.max(...ys));
    const direction =
      zone.sweep === 'tb'
        ? ('top_to_bottom' as const)
        : zone.sweep === 'rl'
          ? ('right_to_left' as const)
          : ('left_to_right' as const);

    return {
      id: `zone_${idx + 1}`,
      label: `Zone ${idx + 1}`,
      sequence: idx + 1,
      type: 'structure',
      region: {
        x: Math.max(0, minX),
        y: Math.max(0, minY),
        width: Math.max(10, maxX - minX),
        height: Math.max(10, maxY - minY),
      },
      points: zone.points.map((p) => [
        Number(p.x.toFixed(4)),
        Number(p.y.toFixed(4)),
      ]) as [number, number][],
      reveal: {
        direction,
        weight: zone.weight ?? 1,
        style: zone.type ?? 'sketch',
      },
    };
  });

  return {
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    version: '1.0',
    elements,
  };
}

export function importWhiteboardAnnotation(
  data: any,
  canvasWidth = 1920,
  canvasHeight = 1080,
): WhiteboardZone[] {
  if (!data || typeof data !== 'object') return [];
  const cw = data.canvas?.width || canvasWidth || 1920;
  const ch = data.canvas?.height || canvasHeight || 1080;
  const result: WhiteboardZone[] = [];

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  if (Array.isArray(data.elements)) {
    for (const el of data.elements) {
      if (result.length >= WHITEBOARD_MAX_ZONES) break;
      let pts: { x: number; y: number }[] = [];
      if (Array.isArray(el.points) && el.points.length >= 3) {
        pts = el.points.map((p: any) => {
          const rawX = Array.isArray(p) ? p[0] : p.x ?? 0;
          const rawY = Array.isArray(p) ? p[1] : p.y ?? 0;
          return {
            x: clamp01(rawX <= 1.0 ? rawX : rawX / cw),
            y: clamp01(rawY <= 1.0 ? rawY : rawY / ch),
          };
        });
      } else if (el.region && typeof el.region === 'object') {
        const rx = (el.region.x || 0) / cw;
        const ry = (el.region.y || 0) / ch;
        const rw = (el.region.width || 100) / cw;
        const rh = (el.region.height || 100) / ch;
        pts = [
          { x: clamp01(rx), y: clamp01(ry) },
          { x: clamp01(rx + rw), y: clamp01(ry) },
          { x: clamp01(rx + rw), y: clamp01(ry + rh) },
          { x: clamp01(rx), y: clamp01(ry + rh) },
        ];
      }

      if (pts.length >= 3) {
        const rawStyle = el.reveal?.style ?? 'sketch';
        const type: WhiteboardZoneType =
          rawStyle === 'scribble' || rawStyle === 'writing' || rawStyle === 'wipe'
            ? rawStyle
            : 'sketch';

        let sweep: 'lr' | 'rl' | 'tb' = 'lr';
        if (el.reveal?.direction === 'top_to_bottom') sweep = 'tb';
        else if (el.reveal?.direction === 'right_to_left') sweep = 'rl';

        const weight = Math.min(
          WHITEBOARD_MAX_ZONE_WEIGHT,
          Math.max(WHITEBOARD_MIN_ZONE_WEIGHT, Number(el.reveal?.weight ?? 1)),
        );

        result.push({
          points: pts,
          entrance: 'draw',
          type,
          rows: el.rows ?? 4,
          sweep,
          weight,
        });
      }
    }
  } else {
    const rawZones = Array.isArray(data.zones)
      ? data.zones
      : Array.isArray(data.effects?.whiteboard?.zones)
        ? data.effects.whiteboard.zones
        : [];

    for (const z of rawZones) {
      if (result.length >= WHITEBOARD_MAX_ZONES) break;
      let pts: { x: number; y: number }[] = [];
      if (Array.isArray(z.points) && z.points.length >= 3) {
        pts = z.points.map((p: any) => {
          const rawX = Array.isArray(p) ? p[0] : p.x ?? 0;
          const rawY = Array.isArray(p) ? p[1] : p.y ?? 0;
          return {
            x: clamp01(rawX <= 1.0 ? rawX : rawX / cw),
            y: clamp01(rawY <= 1.0 ? rawY : rawY / ch),
          };
        });
      }
      if (pts.length >= 3) {
        const rawType = z.type ?? 'sketch';
        const type: WhiteboardZoneType =
          rawType === 'scribble' || rawType === 'writing' || rawType === 'wipe'
            ? rawType
            : 'sketch';

        const weight = Math.min(
          WHITEBOARD_MAX_ZONE_WEIGHT,
          Math.max(WHITEBOARD_MIN_ZONE_WEIGHT, Number(z.weight ?? 1)),
        );

        result.push({
          points: pts,
          entrance: 'draw',
          type,
          rows: z.rows ?? 4,
          sweep: z.sweep ?? 'lr',
          weight,
        });
      }
    }
  }

  return result;
}

/**
 * Milestone S90: Auto-aligns whiteboard timing and zone pacing to speech audio peaks.
 *
 * Given a normalized array of audio peaks [0..1] spanning the clip's timeline window:
 * 1. Computes adaptive speech energy threshold:
 *    theta = max(0.025, 0.22 * mean + 0.08 * max)
 * 2. Determines speech onset (first frame >= theta) and offset (last frame >= theta).
 * 3. Maps speech boundaries to normalized inFraction and drawFraction.
 * 4. If custom zones are present, segments speech activity across zones and distributes
 *    relative weights proportional to speech duration / energy.
 */
export function autoAlignWhiteboardToAudioPeaks(
  peaks: readonly number[],
  zones?: readonly WhiteboardZone[],
): {
  inFraction: number;
  drawFraction: number;
  zones?: WhiteboardZone[];
} {
  if (!peaks || peaks.length === 0) {
    return { inFraction: 0, drawFraction: 0.85, zones: zones ? [...zones] : undefined };
  }

  let sum = 0;
  let maxAmp = 0;
  for (let i = 0; i < peaks.length; i++) {
    const val = peaks[i];
    sum += val;
    if (val > maxAmp) maxAmp = val;
  }
  const meanAmp = sum / peaks.length;

  // Threshold: quiet speech or voiceover
  const threshold = Math.max(0.025, 0.22 * meanAmp + 0.08 * maxAmp);

  let firstIndex = -1;
  let lastIndex = -1;

  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] >= threshold) {
      if (firstIndex === -1) firstIndex = i;
      lastIndex = i;
    }
  }

  // Fallback if audio is completely silent
  if (firstIndex === -1 || lastIndex <= firstIndex) {
    return { inFraction: 0, drawFraction: 0.85, zones: zones ? [...zones] : undefined };
  }

  // Small lead-in margin (2% of clip or ~3 bins)
  const marginBins = Math.max(1, Math.round(peaks.length * 0.02));
  const rawIn = Math.max(0, firstIndex - marginBins) / peaks.length;
  const rawOut = Math.min(peaks.length - 1, lastIndex + marginBins) / peaks.length;

  // Clamp fractions
  const inFraction = Number(Math.min(0.75, Math.max(0, rawIn)).toFixed(3));
  const drawFraction = Number(
    Math.min(1.0, Math.max(inFraction + 0.15, rawOut)).toFixed(3),
  );

  if (!zones || zones.length === 0) {
    return { inFraction, drawFraction };
  }

  // Distribute zone weights across speech sub-intervals
  const activeStart = firstIndex;
  const activeEnd = lastIndex;
  const activeSpan = Math.max(1, activeEnd - activeStart);
  const zoneCount = zones.length;

  const updatedZones: WhiteboardZone[] = zones.map((zone, zIdx) => {
    const segStart = activeStart + Math.floor((zIdx / zoneCount) * activeSpan);
    const segEnd = activeStart + Math.floor(((zIdx + 1) / zoneCount) * activeSpan);

    let segEnergy = 0;
    for (let j = segStart; j <= segEnd; j++) {
      segEnergy += peaks[j] || 0;
    }
    const segAvg = segEnergy / Math.max(1, segEnd - segStart + 1);

    // Relative weight scaling
    const normalizedShare = segAvg / Math.max(0.01, meanAmp);
    const rawWeight = Number(
      Math.max(
        WHITEBOARD_MIN_ZONE_WEIGHT,
        Math.min(WHITEBOARD_MAX_ZONE_WEIGHT, normalizedShare),
      ).toFixed(2),
    );

    return {
      ...zone,
      weight: rawWeight,
    };
  });

  return {
    inFraction,
    drawFraction,
    zones: updatedZones,
  };
}

