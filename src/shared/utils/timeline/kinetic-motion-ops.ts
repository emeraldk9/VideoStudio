/**
 * Milestone S167 — Dynamic Kinetic Typography & Motion Title Presets Engine.
 *
 * Implements:
 * 1. Physics-based spring simulation (damped harmonic oscillator) & customizable easing curves.
 * 2. Duration-responsive animation timing (automatic scaling when clips are trimmed).
 * 3. Studio kinetic title templates (Typewriter with speech cadence & cursor,
 *    Kinetic Pop-In with spring bounce, Minimalist Lower-Third bar reveal,
 *    Glitch Distortion with chromatic aberration, Cinematic Glow Fade).
 * 4. High-resolution ASS (Advanced SubStation Alpha) vector subtitle stream generator
 *    for FFmpeg export synthesis.
 */

import type { SequenceClip } from '../../types/sequence';
import type { TextContent } from './effects';
import type {
  CompoundTextAnimationSettings,
  TextAnimationType,
  TextMotionState,
} from './typography-ops';

// ─── Easing & Physics Types ──────────────────────────────────────────────────

export type EasingCurveType =
  | 'linear'
  | 'ease_out'
  | 'ease_in_out'
  | 'cubic_bezier'
  | 'elastic'
  | 'spring';

export interface SpringPhysicsConfig {
  /** Mass of the spring element (default 1.0). */
  mass: number;
  /** Spring stiffness / tension (default 120.0). Higher = faster snap. */
  stiffness: number;
  /** Spring damping / friction (default 12.0). Lower = more oscillation/bounciness. */
  damping: number;
  /** Initial velocity (default 0). */
  initialVelocity?: number;
}

export const SPRING_PRESETS: Record<string, SpringPhysicsConfig> = {
  default: { mass: 1.0, stiffness: 120, damping: 14 },
  bouncy: { mass: 1.0, stiffness: 180, damping: 9 },
  snappy: { mass: 0.8, stiffness: 240, damping: 18 },
  gentle: { mass: 1.2, stiffness: 80, damping: 16 },
  wobbly: { mass: 1.0, stiffness: 140, damping: 6 },
};

// ─── Spring Physics Analytical Solver ────────────────────────────────────────

/**
 * Solves the closed-form damped harmonic oscillator equation:
 * m * x'' + c * x' + k * (x - 1) = 0, starting from x(0) = 0 with x'(0) = v0.
 *
 * Returns displacement value $x(t)$ targeting 1.0 at equilibrium.
 *
 * @param t Time in seconds (t >= 0)
 * @param config Spring physics parameters
 */
export function solveSpring(t: number, config: SpringPhysicsConfig = SPRING_PRESETS.default): number {
  if (t <= 0) return 0;

  const m = Math.max(0.001, config.mass);
  const k = Math.max(0.1, config.stiffness);
  const c = Math.max(0, config.damping);
  const v0 = config.initialVelocity ?? 0;

  // Natural angular frequency
  const omega0 = Math.sqrt(k / m);
  // Damping ratio zeta
  const zeta = c / (2 * Math.sqrt(m * k));

  // Initial displacement error x(0) - target = -1
  const x0 = -1;

  if (zeta < 1.0) {
    // Underdamped (oscillates around 1.0 with decaying amplitude)
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * t);
    const c1 = x0;
    const c2 = (v0 + zeta * omega0 * x0) / omegaD;
    const displacement = decay * (c1 * Math.cos(omegaD * t) + c2 * Math.sin(omegaD * t));
    return 1 + displacement;
  } else if (Math.abs(zeta - 1.0) < 1e-4) {
    // Critically damped (fastest return without overshoot)
    const decay = Math.exp(-omega0 * t);
    const c1 = x0;
    const c2 = v0 + omega0 * x0;
    const displacement = decay * (c1 + c2 * t);
    return 1 + displacement;
  } else {
    // Overdamped (sluggish return, no overshoot)
    const r1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c1 = (v0 - r2 * x0) / (r1 - r2);
    const c2 = (r1 * x0 - v0) / (r1 - r2);
    const displacement = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    return 1 + displacement;
  }
}

// ─── Easing Curve Evaluator ──────────────────────────────────────────────────

/**
 * Evaluates normalized easing curve at progress `t` in [0, 1].
 */
export function evaluateCustomEasing(
  t: number,
  curve: EasingCurveType = 'ease_out',
  springConfig?: SpringPhysicsConfig
): number {
  const clamped = Math.max(0, Math.min(1, t));

  switch (curve) {
    case 'linear':
      return clamped;

    case 'ease_out':
      return 1 - Math.pow(1 - clamped, 3);

    case 'ease_in_out':
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;

    case 'cubic_bezier': {
      // Standard smooth cubic bezier approximation (ease-out back)
      const p = clamped;
      return p * p * (3 - 2 * p);
    }

    case 'elastic': {
      if (clamped === 0) return 0;
      if (clamped === 1) return 1;
      const p = 0.3;
      return Math.pow(2, -10 * clamped) * Math.sin(((clamped - p / 4) * (2 * Math.PI)) / p) + 1;
    }

    case 'spring': {
      // Maps normalized [0, 1] into 0.6 seconds of spring simulation time
      const simTime = clamped * 0.65;
      return solveSpring(simTime, springConfig ?? SPRING_PRESETS.bouncy);
    }

    default:
      return 1 - Math.pow(1 - clamped, 3);
  }
}

// ─── Duration-Responsive Timing Calculations ─────────────────────────────────

export interface ResponsiveAnimationDurations {
  inDurationFrames: number;
  outDurationFrames: number;
  exitStartFrame: number;
  isClamped: boolean;
}

/**
 * Calculates duration-responsive animation timings.
 * When a clip is trimmed to a short duration, entrance and exit animations
 * automatically scale down proportionally so they never overlap or collide.
 *
 * @param requestedIn Duration of entrance in frames
 * @param requestedOut Duration of exit in frames
 * @param clipDuration Total clip duration in frames
 * @param maxBoundaryFraction Max fraction of clip duration allowed for either phase (default 0.4 = 40%)
 */
export function calculateResponsiveAnimationDurations(
  requestedIn: number,
  requestedOut: number,
  clipDuration: number,
  maxBoundaryFraction = 0.4
): ResponsiveAnimationDurations {
  const safeClipDur = Math.max(1, clipDuration);
  const maxAllowedPerPhase = Math.max(1, Math.floor(safeClipDur * maxBoundaryFraction));

  const clampedIn = Math.min(requestedIn, maxAllowedPerPhase);
  const clampedOut = Math.min(requestedOut, maxAllowedPerPhase);

  const isClamped = clampedIn < requestedIn || clampedOut < requestedOut;
  const exitStartFrame = Math.max(clampedIn, safeClipDur - clampedOut);

  return {
    inDurationFrames: clampedIn,
    outDurationFrames: clampedOut,
    exitStartFrame,
    isClamped,
  };
}

// ─── Typewriter Speech Rhythm & Cursor Simulation ───────────────────────────

export interface TypewriterSpeechResult {
  text: string;
  cursor: string;
  isComplete: boolean;
}

/**
 * Calculates character slice for typewriter animation with natural speech cadence:
 * - Micro-pauses at punctuation (',', '.', '!', '?')
 * - Flashing terminal / text cursor option
 */
export function calculateSpeechTypewriterSlice(
  text: string,
  frameInClip: number,
  durationFrames: number,
  showCursor = true
): TypewriterSpeechResult {
  if (durationFrames <= 0 || frameInClip >= durationFrames) {
    return {
      text,
      cursor: showCursor && frameInClip % 30 < 15 ? '|' : '',
      isComplete: true,
    };
  }
  if (frameInClip <= 0) {
    return {
      text: '',
      cursor: showCursor ? '|' : '',
      isComplete: false,
    };
  }

  // Build weighted character cadence map accounting for punctuation pauses
  const chars = Array.from(text);
  const weights = chars.map((char) => {
    if (char === '.' || char === '!' || char === '?') return 4;
    if (char === ',' || char === ';' || char === ':') return 2.5;
    if (char === ' ') return 1.5;
    return 1.0;
  });
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const progress = Math.max(0, Math.min(1, frameInClip / durationFrames));
  const targetWeight = progress * totalWeight;

  let accumulated = 0;
  let charCount = 0;
  for (let i = 0; i < weights.length; i++) {
    accumulated += weights[i];
    if (accumulated >= targetWeight) {
      charCount = i + 1;
      break;
    }
  }

  const sliced = text.slice(0, Math.max(1, charCount));
  const isComplete = charCount >= text.length;
  const cursor = showCursor && frameInClip % 20 < 10 ? '|' : '';

  return {
    text: sliced,
    cursor,
    isComplete,
  };
}

// ─── S167 Kinetic Motion Transform Evaluator ─────────────────────────────────

/**
 * Computes procedural kinetic motion transformation properties for S167 animations.
 */
export function calculateKineticMotionTransform(
  animationType: TextAnimationType | undefined,
  frameInClip: number,
  durationFrames: number,
  fps = 30
): TextMotionState {
  if (!animationType || animationType === 'none' || animationType === 'typewriter') {
    return {};
  }

  const dur = Math.max(1, durationFrames);
  const t = Math.max(0, Math.min(1, frameInClip / dur));

  switch (animationType) {
    case 'kinetic_pop_in': {
      // Spring physics bounce: scale 0 -> 1.18 -> 0.96 -> 1.0 with subtle rotational snap
      const springVal = solveSpring(t * 0.6, SPRING_PRESETS.bouncy);
      const rotationDeg = (1 - Math.min(1, t * 1.5)) * -3.5;
      const opacity = Math.min(1, t * 3.5);
      return {
        transform: `scale(${springVal.toFixed(3)}) rotate(${rotationDeg.toFixed(1)}deg)`,
        opacity,
      };
    }

    case 'minimal_lower_third': {
      // Smooth slide-in from left with cubic ease-out
      const easeOut = 1 - Math.pow(1 - t, 3);
      const translateX = (1 - easeOut) * -60;
      return {
        transform: `translateX(${translateX.toFixed(1)}px)`,
        opacity: easeOut,
      };
    }

    case 'glitch_distortion': {
      if (t >= 1) return { transform: 'none', opacity: 1 };
      // RGB split chromatic aberration text-shadow with high-frequency jitter
      const decay = 1 - t;
      const jitterX = ((Math.sin(frameInClip * 19.3) * 6) * decay).toFixed(1);
      const jitterY = ((Math.cos(frameInClip * 31.7) * 3) * decay).toFixed(1);
      const redOffset = (4 * decay).toFixed(1);
      const cyanOffset = (-4 * decay).toFixed(1);
      const textShadow = `${redOffset}px 0 rgba(255, 0, 85, 0.9), ${cyanOffset}px 0 rgba(0, 240, 255, 0.9)`;
      return {
        transform: `translate(${jitterX}px, ${jitterY}px)`,
        textShadow,
        opacity: 0.7 + (Math.sin(frameInClip * 11) * 0.3),
      };
    }

    case 'cinematic_glow_fade': {
      // Luminous bloom glow expansion with smooth ease-out opacity
      const easeOut = 1 - Math.pow(1 - t, 3);
      const scale = 0.92 + easeOut * 0.08;
      const glowRadius = Math.round((1 - easeOut) * 24);
      const textShadow = glowRadius > 0
        ? `0 0 ${glowRadius}px rgba(255, 255, 255, 0.8), 0 0 ${glowRadius * 2}px rgba(255, 215, 0, 0.5)`
        : undefined;
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: easeOut,
        textShadow,
      };
    }

    default:
      return {};
  }
}

// ─── ASS (Advanced SubStation Alpha) Vector Subtitle Generator ───────────────

/**
 * Formats frame count into ASS timecode format: `H:MM:SS.cs` (centiseconds).
 */
export function formatAssTimecode(frames: number, fps = 30): string {
  const totalSeconds = Math.max(0, frames / Math.max(1, fps));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cs = String(centiseconds).padStart(2, '0');
  return `${hours}:${mm}:${ss}.${cs}`;
}

/**
 * Converts CSS hex color (`#RRGGBB` or `#RGB`) and opacity into ASS color format `&HAABBGGRR&`.
 * Note: ASS colors are in BGR order with reversed alpha (00 = opaque, FF = fully transparent).
 */
export function hexToAssColor(hex: string, opacity = 1.0): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    clean = 'FFFFFF';
  }

  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);

  // Invert opacity to ASS alpha (0 = opaque, 255 = transparent)
  const alphaVal = Math.round(255 * (1 - Math.max(0, Math.min(1, opacity))));
  const aa = alphaVal.toString(16).padStart(2, '0').toUpperCase();

  return `&H${aa}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}&`;
}

/**
 * Maps VideoStudio text alignment & anchor to ASS numeric alignment code (1–9 numpad layout).
 */
export function mapToAssAlignment(align: 'left' | 'center' | 'right', anchor: 'top' | 'middle' | 'bottom' = 'middle'): number {
  const row = anchor === 'top' ? 7 : anchor === 'middle' ? 4 : 1;
  const col = align === 'left' ? 0 : align === 'center' ? 1 : 2;
  return row + col;
}

export interface AssExportOptions {
  sequenceFps?: number;
  width?: number;
  height?: number;
  scriptTitle?: string;
}

/**
 * Synthesizes a frame-accurate ASS subtitle stream script from timeline text clips.
 * Can be written directly to a `.ass` file and passed to FFmpeg via `subtitles=path.ass`.
 */
export function generateAssSubtitleScript(
  clips: SequenceClip[],
  options: AssExportOptions = {}
): string {
  const fps = options.sequenceFps ?? 30;
  const w = options.width ?? 1920;
  const h = options.height ?? 1080;
  const title = options.scriptTitle ?? 'VideoStudio Kinetic Subtitles';

  const textClips = clips
    .filter((c) => c.sourceKind === 'text' && c.effects?.text && c.startFrames !== null)
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  const lines: string[] = [
    '[Script Info]',
    `; Script generated by VideoStudio Milestone S167 Kinetic Typography Engine`,
    `Title: ${title}`,
    `ScriptType: v4.00+`,
    `WrapStyle: 0`,
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    `ScaledBorderAndShadow: yes`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Inter,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,2,2,40,40,40,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  for (const clip of textClips) {
    const textEffect = clip.effects!.text!;
    const startFrame = clip.startFrames ?? 0;
    const endFrame = startFrame + clip.durationFrames;

    const startTimecode = formatAssTimecode(startFrame, fps);
    const endTimecode = formatAssTimecode(endFrame, fps);

    // Calculate pixel coordinates
    const posX = Math.round(textEffect.positionPct.x * w);
    const posY = Math.round(textEffect.positionPct.y * h);

    const assAlign = mapToAssAlignment(textEffect.align, textEffect.anchor);
    const primaryColor = hexToAssColor(textEffect.colorHex);
    const outlineColor = textEffect.stroke ? hexToAssColor(textEffect.stroke.colorHex) : '&H00000000&';
    const outlineWidth = textEffect.stroke ? Math.round(textEffect.stroke.widthPx) : 0;
    const shadowWidth = textEffect.shadow ? Math.round(textEffect.shadow.blurPx / 2) : 0;
    const shadowColor = textEffect.shadow
      ? hexToAssColor(textEffect.shadow.colorHex, textEffect.shadow.opacity)
      : '&H80000000&';

    // Tags for styling & position
    const styleTags: string[] = [
      `\\an${assAlign}`,
      `\\pos(${posX},${posY})`,
      `\\fn${textEffect.fontFamily ?? 'Inter'}`,
      `\\fs${Math.round(textEffect.fontSizePx)}`,
      `\\1c${primaryColor}`,
      `\\3c${outlineColor}`,
      `\\bord${outlineWidth}`,
      `\\4c${shadowColor}`,
      `\\shad${shadowWidth}`,
    ];

    if (textEffect.letterSpacingPx) {
      styleTags.push(`\\fsp${Math.round(textEffect.letterSpacingPx)}`);
    }

    // In/Out transitions
    const compound = textEffect.compoundAnimation;
    if (compound) {
      const inMs = Math.round(((compound.inDurationFrames ?? 15) / fps) * 1000);
      const outMs = Math.round(((compound.outDurationFrames ?? 15) / fps) * 1000);
      if (inMs > 0 || outMs > 0) {
        styleTags.push(`\\fad(${inMs},${outMs})`);
      }
    }

    // Format text: replace newlines with ASS \N
    const cleanText = textEffect.text.replace(/\r?\n/g, '\\N');
    const overrideBlock = `{${styleTags.join('')}}`;

    lines.push(
      `Dialogue: 0,${startTimecode},${endTimecode},Default,,0,0,0,,${overrideBlock}${cleanText}`
    );
  }

  return lines.join('\n');
}
