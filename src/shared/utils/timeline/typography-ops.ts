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
 * - Procedural kinetic entrance animations:
 *   - Typewriter (character-by-character synchronized clock)
 *   - Fade In (smooth ease-in)
 *   - Slide Up / Slide Down (directional translation with opacity)
 *   - Pop Scale (elastic scale-up with subtle overshoot)
 *   - Glow Pulse (pulsing luminosity)
 *   - Bounce (bouncing physics simulation)
 * - Studio motion title presets
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

export interface TextGradientSettings {
  enabled: boolean;
  fromHex: string;
  toHex: string;
  angleDeg?: number; // default 90 deg
}

export type TextAnimationType =
  | 'none'
  | 'typewriter'
  | 'fade_in'
  | 'slide_up'
  | 'slide_down'
  | 'pop_scale'
  | 'glow_pulse'
  | 'bounce';

export interface TextAnimationSettings {
  type: TextAnimationType;
  durationFrames: number; // e.g. 15 to 90 frames
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

    case 'glow_pulse': {
      // Continuous sinusoidal glow pulsation
      const seconds = frameInClip / fps;
      const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 2 * 1.5);
      const blur = 8 + pulse * 12;
      return {
        textShadow: `0 0 ${blur.toFixed(1)}px rgba(0, 240, 255, ${(0.5 + pulse * 0.5).toFixed(2)})`,
      };
    }

    default:
      return {};
  }
}

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
