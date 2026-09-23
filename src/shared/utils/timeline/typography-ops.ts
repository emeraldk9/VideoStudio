import type { SequenceClip } from '../../types/sequence';

/**
 * Pure arithmetic, typography styling, and kinetic motion animation engine
 * for VideoStudio Rich Text & Motion Titles.
 *
 * Implements:
 * - Curated font families (Inter, Montserrat, Bebas Neue, Playfair Display, Oswald, Cinzel, Roboto Mono, Impact)
 * - Typography styling: font weight, letter spacing, line height, text transform
 * - High-contrast text stroke / outline (-webkit-text-stroke)
 * - Multi-layer drop shadow and neon glow (text-shadow)
 * - 2-color linear text gradients
 * - Procedural kinetic entrance, exit, and loop animations:
 *   - Typewriter (character-by-character synchronized clock)
 *   - Fade In / Fade Out (smooth ease)
 *   - Slide Up / Down / Left / Right (directional translation with opacity)
 *   - Pop Scale & Zoom In / Zoom Out (elastic and proportional scaling)
 *   - Glow Pulse & Shimmer (pulsing luminosity)
 *   - Bounce & Bounce Loop (physics simulation)
 *   - Glitch & Dissolve (stylized motion)
 *   - Karaoke Word-by-Word Highlight (active spoken cadence)
 * - Studio motion title presets & CapCut caption presets
 * - FFmpeg drawtext border and shadow argument generator
 */

export type FontFamily =
  | 'Inter'
  | 'Montserrat'
  | 'Bebas Neue'
  | 'Playfair Display'
  | 'Oswald'
  | 'Cinzel'
  | 'Roboto Mono'
  | 'Impact';

export interface FontFamilyDefinition {
  family: FontFamily;
  label: string;
  category: 'sans' | 'serif' | 'display' | 'mono';
  cssFont: string;
}

export const FONT_FAMILIES: readonly FontFamilyDefinition[] = [
  { family: 'Inter', label: 'Inter (Modern Sans)', category: 'sans', cssFont: "'Inter', sans-serif" },
  { family: 'Montserrat', label: 'Montserrat (Geometric)', category: 'sans', cssFont: "'Montserrat', sans-serif" },
  { family: 'Bebas Neue', label: 'Bebas Neue (Condensed)', category: 'display', cssFont: "'Bebas Neue', sans-serif" },
  { family: 'Playfair Display', label: 'Playfair (Editorial)', category: 'serif', cssFont: "'Playfair Display', serif" },
  { family: 'Oswald', label: 'Oswald (Broadcast)', category: 'sans', cssFont: "'Oswald', sans-serif" },
  { family: 'Cinzel', label: 'Cinzel (Cinematic)', category: 'serif', cssFont: "'Cinzel', serif" },
  { family: 'Roboto Mono', label: 'Roboto Mono (Code/Type)', category: 'mono', cssFont: "'Roboto Mono', monospace" },
  { family: 'Impact', label: 'Impact (Heavy Title)', category: 'display', cssFont: "'Impact', sans-serif" },
];

export type FontWeight = '400' | '600' | '700' | '900';

export interface TextStrokeSettings {
  colorHex: string;
  widthPx: number; // 0 to 16px
}

export interface TextShadowSettings {
  colorHex: string;
  blurPx: number;   // 0 to 30px
  offsetX: number;  // -20 to 20px
  offsetY: number;  // -20 to 20px
  opacity: number;  // 0.0 to 1.0
}

export interface TextGlowSettings {
  colorHex: string;
  radiusPx: number;  // 0 to 40px
  intensity: number; // 0.0 to 1.0
}

export interface TextGradientSettings {
  enabled: boolean;
  fromHex: string;
  toHex: string;
  angleDeg?: number; // default 90 deg
}

export type TextAnimationType =
  | 'none'
  // Entrance (In)
  | 'typewriter'
  | 'fade_in'
  | 'slide_up'
  | 'slide_down'
  | 'slide_left'
  | 'slide_right'
  | 'pop_scale'
  | 'bounce'
  | 'zoom_in'
  | 'glitch'
  | 'flip_x'
  | 'elastic_drop'
  | 'tracking_expand'
  // Exit (Out)
  | 'fade_out'
  | 'slide_down_out'
  | 'zoom_out'
  | 'dissolve'
  | 'shrink_out'
  | 'wipe_right'
  // Loop / Karaoke
  | 'karaoke_highlight'
  | 'glow_pulse'
  | 'wave'
  | 'shimmer'
  | 'bounce_loop'
  | 'rainbow_cycle'
  | 'heartbeat';

export interface TextAnimationSettings {
  type: TextAnimationType;
  durationFrames: number; // e.g. 15 to 90 frames
}

export interface CompoundTextAnimationSettings {
  inAnimation?: TextAnimationType;
  inDurationFrames?: number;
  loopAnimation?: TextAnimationType;
  outAnimation?: TextAnimationType;
  outDurationFrames?: number;
}

export interface StudioTextPreset {
  id: string;
  name: string;
  description: string;
  fontFamily: FontFamily;
  fontWeight: FontWeight;
  fontSizePx: number;
  colorHex: string;
  letterSpacingPx?: number;
  stroke?: TextStrokeSettings;
  shadow?: TextShadowSettings;
  gradient?: TextGradientSettings;
  animation?: TextAnimationSettings;
  box?: { colorHex: string; opacity: number; paddingPx: number };
}

export const STUDIO_TEXT_PRESETS: Record<string, StudioTextPreset> = {
  cinematic_gold: {
    id: 'cinematic_gold',
    name: 'Cinematic Gold',
    description: 'Majestic serif title with warm gold gradient and deep drop shadow',
    fontFamily: 'Cinzel',
    fontWeight: '700',
    fontSizePx: 84,
    colorHex: '#FFD700',
    letterSpacingPx: 6,
    gradient: { enabled: true, fromHex: '#FFE259', toHex: '#FFA751', angleDeg: 90 },
    shadow: { colorHex: '#000000', blurPx: 12, offsetX: 0, offsetY: 6, opacity: 0.8 },
    animation: { type: 'fade_in', durationFrames: 24 },
  },
  cyberpunk_neon: {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Neon',
    description: 'High-contrast cyan fill with hot magenta glow stroke',
    fontFamily: 'Bebas Neue',
    fontWeight: '900',
    fontSizePx: 96,
    colorHex: '#00F0FF',
    letterSpacingPx: 3,
    stroke: { colorHex: '#FF007F', widthPx: 2 },
    shadow: { colorHex: '#00F0FF', blurPx: 16, offsetX: 0, offsetY: 0, opacity: 0.9 },
    animation: { type: 'pop_scale', durationFrames: 18 },
  },
  modern_bold: {
    id: 'modern_bold',
    name: 'Modern Bold',
    description: 'Clean bold white text with heavy 4px black outline for maximum visibility',
    fontFamily: 'Montserrat',
    fontWeight: '900',
    fontSizePx: 72,
    colorHex: '#FFFFFF',
    letterSpacingPx: 1,
    stroke: { colorHex: '#000000', widthPx: 4 },
    shadow: { colorHex: '#000000', blurPx: 8, offsetX: 2, offsetY: 4, opacity: 0.7 },
    animation: { type: 'slide_up', durationFrames: 20 },
  },
  subtitles_yellow: {
    id: 'subtitles_yellow',
    name: 'Vibrant Subtitles',
    description: 'High-visibility yellow captions with black outline and drop shadow',
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSizePx: 48,
    colorHex: '#FFDE00',
    letterSpacingPx: 0,
    stroke: { colorHex: '#000000', widthPx: 3 },
    shadow: { colorHex: '#000000', blurPx: 4, offsetX: 1, offsetY: 2, opacity: 0.85 },
    animation: { type: 'none', durationFrames: 0 },
  },
  news_lower_third: {
    id: 'news_lower_third',
    name: 'News Lower Third',
    description: 'Broadcast headline with dark background badge',
    fontFamily: 'Oswald',
    fontWeight: '700',
    fontSizePx: 46,
    colorHex: '#FFFFFF',
    letterSpacingPx: 2,
    box: { colorHex: '#0F172A', opacity: 0.85, paddingPx: 14 },
    animation: { type: 'slide_up', durationFrames: 16 },
  },
  typewriter_retro: {
    id: 'typewriter_retro',
    name: 'Typewriter Classic',
    description: 'Retro monospace font with character-by-character live typing reveal',
    fontFamily: 'Roboto Mono',
    fontWeight: '600',
    fontSizePx: 48,
    colorHex: '#FFFFFF',
    letterSpacingPx: 1,
    shadow: { colorHex: '#000000', blurPx: 6, offsetX: 0, offsetY: 2, opacity: 0.6 },
    animation: { type: 'typewriter', durationFrames: 45 },
  },
  minimalist_editorial: {
    id: 'minimalist_editorial',
    name: 'Editorial Serif',
    description: 'Refined editorial serif title with wide letter spacing',
    fontFamily: 'Playfair Display',
    fontWeight: '400',
    fontSizePx: 64,
    colorHex: '#F8F9FA',
    letterSpacingPx: 8,
    shadow: { colorHex: '#000000', blurPx: 6, offsetX: 0, offsetY: 2, opacity: 0.4 },
    animation: { type: 'fade_in', durationFrames: 30 },
  },
};

/**
 * Calculates character slice for typewriter animation given current frame progress.
 */
export function calculateTypewriterSlice(
  text: string,
  frameInClip: number,
  durationFrames: number
): string {
  if (durationFrames <= 0 || frameInClip >= durationFrames) {
    return text;
  }
  if (frameInClip <= 0) {
    return '';
  }

  const totalChars = text.length;
  const progress = Math.max(0, Math.min(1, frameInClip / durationFrames));
  const charsToShow = Math.round(progress * totalChars);

  return text.slice(0, charsToShow);
}

export interface TextMotionState {
  transform?: string;
  opacity?: number;
  textShadow?: string;
}

/**
 * Computes procedural kinetic motion transformation properties for real-time preview.
 */
export function calculateTextMotionTransform(
  animation: TextAnimationSettings | undefined,
  frameInClip: number,
  fps: number = 30
): TextMotionState {
  if (!animation || animation.type === 'none' || animation.type === 'typewriter') {
    return {};
  }

  const dur = Math.max(1, animation.durationFrames);
  const t = Math.max(0, Math.min(1, frameInClip / dur));

  // Cubic ease-out
  const easeOut = 1 - Math.pow(1 - t, 3);

  switch (animation.type) {
    case 'fade_in': {
      return { opacity: easeOut };
    }

    case 'slide_up': {
      const translateY = (1 - easeOut) * 36; // starts 36px below
      return {
        transform: `translateY(${translateY.toFixed(1)}px)`,
        opacity: easeOut,
      };
    }

    case 'slide_down': {
      const translateY = (easeOut - 1) * 36; // starts 36px above
      return {
        transform: `translateY(${translateY.toFixed(1)}px)`,
        opacity: easeOut,
      };
    }

    case 'slide_left': {
      const translateX = (1 - easeOut) * 48; // starts 48px to the right
      return {
        transform: `translateX(${translateX.toFixed(1)}px)`,
        opacity: easeOut,
      };
    }

    case 'slide_right': {
      const translateX = (easeOut - 1) * 48; // starts 48px to the left
      return {
        transform: `translateX(${translateX.toFixed(1)}px)`,
        opacity: easeOut,
      };
    }

    case 'pop_scale': {
      // Elastic pop with 1.05 overshoot: scale goes 0.3 -> 1.05 -> 1.0
      let scale: number;
      if (t < 0.7) {
        scale = 0.3 + (t / 0.7) * 0.75;
      } else {
        const subT = (t - 0.7) / 0.3;
        scale = 1.05 - subT * 0.05;
      }
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: Math.min(1, t * 2.5),
      };
    }

    case 'zoom_in': {
      const scale = 0.4 + easeOut * 0.6;
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: easeOut,
      };
    }

    case 'bounce': {
      // Bouncing gravity decay
      if (t >= 1) {
        return {
          transform: 'translateY(0.0px)',
          opacity: 1,
        };
      }
      const bounceHeight = 30 * (1 - t) * Math.exp(-3 * t) * Math.abs(Math.cos(t * Math.PI * 3));
      return {
        transform: `translateY(-${bounceHeight.toFixed(1)}px)`,
        opacity: Math.min(1, t * 3),
      };
    }

    case 'glitch': {
      // Digital glitch jitter during entrance
      if (t >= 1) {
        return { transform: 'none', opacity: 1 };
      }
      const jitterX = ((Math.sin(frameInClip * 17) * 8) * (1 - t)).toFixed(1);
      const jitterY = ((Math.cos(frameInClip * 23) * 4) * (1 - t)).toFixed(1);
      return {
        transform: `translate(${jitterX}px, ${jitterY}px)`,
        opacity: 0.6 + Math.random() * 0.4,
      };
    }

    case 'flip_x': {
      const angle = (1 - easeOut) * 90;
      return {
        transform: `perspective(500px) rotateX(${angle.toFixed(1)}deg)`,
        opacity: easeOut,
      };
    }

    case 'elastic_drop': {
      if (t >= 1) return { transform: 'none', opacity: 1 };
      const dropY = -60 * Math.cos(t * Math.PI * 2.5) * Math.exp(-3 * t);
      return {
        transform: `translateY(${dropY.toFixed(1)}px)`,
        opacity: Math.min(1, t * 2),
      };
    }

    case 'tracking_expand': {
      const scale = 0.85 + easeOut * 0.15;
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: easeOut,
      };
    }

    // Exit Animations (progress based on durationFrames)
    case 'fade_out': {
      return { opacity: Math.max(0, 1 - t) };
    }

    case 'slide_down_out': {
      const translateY = t * 36;
      return {
        transform: `translateY(${translateY.toFixed(1)}px)`,
        opacity: Math.max(0, 1 - t),
      };
    }

    case 'zoom_out': {
      const scale = Math.max(0, 1 - t * 0.6);
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: Math.max(0, 1 - t),
      };
    }

    case 'dissolve': {
      return { opacity: Math.max(0, 1 - Math.pow(t, 2)) };
    }

    case 'shrink_out': {
      const scale = Math.max(0, (1 - t) * 0.9);
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: Math.max(0, 1 - t),
      };
    }

    case 'wipe_right': {
      const translateX = t * 60;
      return {
        transform: `translateX(${translateX.toFixed(1)}px)`,
        opacity: Math.max(0, 1 - t),
      };
    }

    // Loop & Continuous Animations
    case 'glow_pulse': {
      // Continuous sinusoidal glow pulsation
      const seconds = frameInClip / fps;
      const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 2 * 1.5);
      const blur = 8 + pulse * 12;
      return {
        textShadow: `0 0 ${blur.toFixed(1)}px rgba(0, 240, 255, ${(0.5 + pulse * 0.5).toFixed(2)})`,
      };
    }

    case 'wave': {
      const seconds = frameInClip / fps;
      const waveY = Math.sin(seconds * Math.PI * 2) * 6;
      return {
        transform: `translateY(${waveY.toFixed(1)}px)`,
      };
    }

    case 'shimmer': {
      const seconds = frameInClip / fps;
      const shimmer = 0.75 + 0.25 * Math.sin(seconds * Math.PI * 3);
      return {
        opacity: shimmer,
      };
    }

    case 'bounce_loop': {
      const seconds = frameInClip / fps;
      const bounce = -Math.abs(Math.sin(seconds * Math.PI * 2)) * 8;
      return {
        transform: `translateY(${bounce.toFixed(1)}px)`,
      };
    }

    case 'rainbow_cycle': {
      const seconds = frameInClip / fps;
      const hue = Math.round((seconds * 120) % 360);
      return {
        transform: `filter: hue-rotate(${hue}deg)`,
      };
    }

    case 'heartbeat': {
      const seconds = frameInClip / fps;
      const cycle = (seconds * 1.8) % 1; // 1.8 beats/sec
      let scale = 1.0;
      if (cycle < 0.15) {
        scale = 1.0 + Math.sin((cycle / 0.15) * Math.PI) * 0.14;
      } else if (cycle >= 0.2 && cycle < 0.35) {
        scale = 1.0 + Math.sin(((cycle - 0.2) / 0.15) * Math.PI) * 0.08;
      }
      return {
        transform: `scale(${scale.toFixed(3)})`,
      };
    }

    case 'karaoke_highlight': {
      // Highlight is handled in tokenized word render; base transform remains neutral
      return {};
    }

    default:
      return {};
  }
}

/**
 * Tokenizes text and determines active spoken word given frame progress.
 */
export interface KaraokeWordToken {
  word: string;
  isActive: boolean;
  isPast: boolean;
  startIndex: number;
  endIndex: number;
}

export function calculateKaraokeHighlight(
  text: string,
  frameInClip: number,
  durationFrames: number
): {
  tokens: KaraokeWordToken[];
  activeWordIndex: number;
  progressPct: number;
} {
  const words = text.split(/(\s+)/); // Preserves whitespace
  const progress = durationFrames > 0 ? Math.max(0, Math.min(1, frameInClip / durationFrames)) : 1;

  const wordIndices: number[] = [];
  words.forEach((chunk, i) => {
    if (chunk.trim().length > 0) {
      wordIndices.push(i);
    }
  });

  const totalWords = wordIndices.length;
  const activeNonWhitespaceIndex =
    totalWords > 0 ? Math.min(totalWords - 1, Math.floor(progress * totalWords)) : -1;

  let charOffset = 0;
  let wordCounter = 0;
  const tokens: KaraokeWordToken[] = words.map((chunk) => {
    const isWord = chunk.trim().length > 0;
    const startIndex = charOffset;
    charOffset += chunk.length;
    const endIndex = charOffset;

    if (!isWord) {
      return {
        word: chunk,
        isActive: false,
        isPast: wordCounter <= activeNonWhitespaceIndex,
        startIndex,
        endIndex,
      };
    }

    const currentWordNum = wordCounter++;
    const isActive = currentWordNum === activeNonWhitespaceIndex;
    const isPast = currentWordNum < activeNonWhitespaceIndex;

    return {
      word: chunk,
      isActive,
      isPast,
      startIndex,
      endIndex,
    };
  });

  return {
    tokens,
    activeWordIndex: activeNonWhitespaceIndex,
    progressPct: progress,
  };
}

/**
 * Pure immutable batch styling: applies typography, effects, and animation patch
 * across all text clips matching the target track while preserving original text strings.
 */
export function applyTypographyStyleToClips(
  clips: readonly SequenceClip[],
  stylePatch: Record<string, unknown>,
  targetTrackId?: string
): { clips: SequenceClip[]; updatedCount: number } {
  let updatedCount = 0;
  const nextClips = clips.map((clip) => {
    if (clip.sourceKind !== 'text') return clip;
    if (targetTrackId && targetTrackId !== 'all' && clip.trackId !== targetTrackId) return clip;
    if (!clip.effects?.text) return clip;

    updatedCount++;
    return {
      ...clip,
      effects: {
        ...clip.effects,
        text: {
          ...clip.effects.text,
          ...stylePatch,
          // Always preserve existing text string
          text: clip.effects.text.text,
        },
      },
    };
  });

  return { clips: nextClips, updatedCount };
}

/**
 * CapCut-Style Subtitle & Caption Presets
 */
export interface CapCutCaptionPreset {
  id: string;
  name: string;
  category: 'trending' | 'social' | 'cinema' | 'karaoke' | 'retro';
  description: string;
  effects: Record<string, unknown>;
}

export const CAPCUT_CAPTION_PRESETS: Record<string, CapCutCaptionPreset> = {
  tiktok_viral_pill: {
    id: 'tiktok_viral_pill',
    name: 'TikTok Viral Pill',
    category: 'trending',
    description: 'High-contrast white text inside a rounded black translucent capsule',
    effects: {
      fontFamily: 'Montserrat',
      fontWeight: '900',
      fontSizePx: 44,
      colorHex: '#FFFFFF',
      textTransform: 'uppercase',
      box: { colorHex: '#000000', opacity: 0.85, paddingPx: 12, borderRadiusPx: 20 },
      stroke: { colorHex: '#000000', widthPx: 0 },
      shadow: { colorHex: '#000000', blurPx: 8, offsetX: 0, offsetY: 3, opacity: 0.5 },
      animation: { type: 'pop_scale', durationFrames: 14 },
    },
  },
  karaoke_party: {
    id: 'karaoke_party',
    name: 'Karaoke Neon Gold',
    category: 'karaoke',
    description: 'Real-time karaoke word highlight with radiant gold glow',
    effects: {
      fontFamily: 'Montserrat',
      fontWeight: '900',
      fontSizePx: 48,
      colorHex: '#FFFFFF',
      textTransform: 'uppercase',
      stroke: { colorHex: '#000000', widthPx: 3 },
      shadow: { colorHex: '#FFD700', blurPx: 14, offsetX: 0, offsetY: 0, opacity: 0.9 },
      glow: { colorHex: '#FFD700', radiusPx: 16, intensity: 0.85 },
      animation: { type: 'karaoke_highlight', durationFrames: 30 },
    },
  },
  cyber_glow: {
    id: 'cyber_glow',
    name: 'Cyberpunk Neon',
    category: 'social',
    description: 'Vivid cyan text with electric pink outline and intense glow',
    effects: {
      fontFamily: 'Bebas Neue',
      fontWeight: '700',
      fontSizePx: 56,
      colorHex: '#00F0FF',
      textTransform: 'uppercase',
      stroke: { colorHex: '#FF007F', widthPx: 2 },
      glow: { colorHex: '#00F0FF', radiusPx: 18, intensity: 0.9 },
      shadow: { colorHex: '#FF007F', blurPx: 10, offsetX: 0, offsetY: 0, opacity: 0.8 },
      animation: { type: 'glow_pulse', durationFrames: 24 },
    },
  },
  cinema_subtitles: {
    id: 'cinema_subtitles',
    name: 'Cinema Yellow',
    category: 'cinema',
    description: 'Standard film subtitle in warm yellow with clean drop shadow',
    effects: {
      fontFamily: 'Inter',
      fontWeight: '600',
      fontSizePx: 42,
      colorHex: '#FFE600',
      stroke: { colorHex: '#000000', widthPx: 2 },
      shadow: { colorHex: '#000000', blurPx: 4, offsetX: 1, offsetY: 2, opacity: 0.9 },
      animation: { type: 'none', durationFrames: 0 },
    },
  },
  comic_pop: {
    id: 'comic_pop',
    name: 'Comic Pop',
    category: 'retro',
    description: 'Energetic bold yellow text with heavy 4px outline and drop shadow',
    effects: {
      fontFamily: 'Impact',
      fontWeight: '700',
      fontSizePx: 54,
      colorHex: '#FFDD00',
      textTransform: 'uppercase',
      stroke: { colorHex: '#000000', widthPx: 4 },
      shadow: { colorHex: '#000000', blurPx: 0, offsetX: 4, offsetY: 4, opacity: 1 },
      animation: { type: 'bounce', durationFrames: 18 },
    },
  },
  bold_shadow: {
    id: 'bold_shadow',
    name: 'Clean Editorial',
    category: 'trending',
    description: 'Minimal modern white title with elegant soft shadow',
    effects: {
      fontFamily: 'Playfair Display',
      fontWeight: '700',
      fontSizePx: 50,
      colorHex: '#FFFFFF',
      shadow: { colorHex: '#000000', blurPx: 10, offsetX: 0, offsetY: 4, opacity: 0.6 },
      animation: { type: 'fade_in', durationFrames: 20 },
    },
  },
};

/**
 * Builds FFmpeg drawtext border and shadow arguments for export rendering.
 */
export function buildFfmpegDrawTextOptions(text: {
  stroke?: TextStrokeSettings;
  shadow?: TextShadowSettings;
}): {
  borderw?: number;
  bordercolor?: string;
  shadowx?: number;
  shadowy?: number;
  shadowcolor?: string;
} {
  const options: {
    borderw?: number;
    bordercolor?: string;
    shadowx?: number;
    shadowy?: number;
    shadowcolor?: string;
  } = {};

  if (text.stroke && text.stroke.widthPx > 0) {
    options.borderw = Math.round(text.stroke.widthPx);
    options.bordercolor = text.stroke.colorHex;
  }

  if (text.shadow && (text.shadow.offsetX !== 0 || text.shadow.offsetY !== 0 || text.shadow.blurPx > 0)) {
    options.shadowx = Math.round(text.shadow.offsetX);
    options.shadowy = Math.round(text.shadow.offsetY);
    options.shadowcolor = text.shadow.colorHex;
  }

  return options;
}

