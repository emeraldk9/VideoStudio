/**
 * S85 — CapCut AI Smart Text Templates & Dynamic Title Animation Engine
 *
 * Provides a comprehensive library of motion graphics templates (Social Media,
 * Cinematic Titles, Lower Thirds, Callout Badges, Kinetic Typography), multi-field
 * text schemas, compound In/Loop/Out animation physics, and algorithmic AI Title/Hook generation.
 */

import { type SequenceClip, type ClipTransition } from '../../types/sequence';
import { type TextContent } from './effects';
import {
  type TextMotionState,
  type TextAnimationType,
  type CompoundTextAnimationSettings,
  calculateTextMotionTransform,
} from './typography-ops';

export type SmartTextTemplateCategory =
  | 'titles'
  | 'social'
  | 'lower_thirds'
  | 'callouts'
  | 'kinetic';

export interface SmartTextTemplate {
  id: string;
  category: SmartTextTemplateCategory;
  categoryLabel: string;
  name: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
  badgeIcon?: string;
  layout: 'single' | 'stacked' | 'badge_pill' | 'callout_pointer' | 'news_ticker' | 'bordered_card';
  durationSeconds: number;
  transitionIn?: ClipTransition;
  style: Omit<TextContent, 'text'>;
  compoundAnimation?: CompoundTextAnimationSettings;
}

export const SMART_TEXT_TEMPLATES: readonly SmartTextTemplate[] = [
  // ==========================================
  // 1. Social & Vlog Badges
  // ==========================================
  {
    id: 'yt-subscribe-bell',
    category: 'social',
    categoryLabel: 'Social & Vlog',
    name: 'YouTube Subscribe & Bell',
    description: 'Animated YouTube red pill with subscribe label and notification bell',
    primaryText: 'SUBSCRIBE',
    secondaryText: 'Turn on notifications',
    badgeIcon: 'notifications_active',
    layout: 'badge_pill',
    durationSeconds: 4,
    transitionIn: 'crossfade',
    compoundAnimation: {
      inAnimation: 'elastic_drop',
      inDurationFrames: 18,
      loopAnimation: 'heartbeat',
      outAnimation: 'shrink_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#fecaca',
      align: 'center',
      positionPct: { x: 0.5, y: 0.82 },
      anchor: 'bottom',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#dc2626',
        opacity: 0.95,
        paddingPx: 16,
        borderRadiusPx: 999,
      },
      preset: 'title',
      badgeIcon: 'notifications_active',
      templateStyleId: 'yt-subscribe-bell',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'instagram-handle-pill',
    category: 'social',
    categoryLabel: 'Social & Vlog',
    name: 'Instagram Profile Handle',
    description: 'Gradient purple/pink rounded capsule for creator social handles',
    primaryText: '@creative.studio',
    secondaryText: 'Follow for daily tutorials',
    badgeIcon: 'alternate_email',
    layout: 'badge_pill',
    durationSeconds: 3.5,
    transitionIn: 'crossfade',
    compoundAnimation: {
      inAnimation: 'slide_up',
      inDurationFrames: 15,
      loopAnimation: 'glow_pulse',
      outAnimation: 'fade_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 40,
      colorHex: '#ffffff',
      secondaryFontSizePx: 24,
      secondaryColorHex: '#e2e8f0',
      align: 'center',
      positionPct: { x: 0.5, y: 0.85 },
      anchor: 'bottom',
      fontFamily: 'Inter',
      fontWeight: '700',
      gradient: { enabled: true, fromHex: '#833ab4', toHex: '#fd1d1d', angleDeg: 45 },
      box: {
        colorHex: '#1e1b4b',
        opacity: 0.85,
        paddingPx: 14,
        borderRadiusPx: 999,
      },
      preset: 'lower_third',
      badgeIcon: 'alternate_email',
      templateStyleId: 'instagram-handle-pill',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'tiktok-viral-tag',
    category: 'social',
    categoryLabel: 'Social & Vlog',
    name: 'TikTok Viral Tag',
    description: 'Punchy black pill with neon cyan/magenta chromatic accent',
    primaryText: '#TRENDING_NOW',
    secondaryText: '1.2M Views',
    badgeIcon: 'trending_up',
    layout: 'badge_pill',
    durationSeconds: 3,
    transitionIn: 'flash_frame',
    compoundAnimation: {
      inAnimation: 'pop_scale',
      inDurationFrames: 12,
      loopAnimation: 'bounce_loop',
      outAnimation: 'zoom_out',
      outDurationFrames: 12,
    },
    style: {
      fontSizePx: 42,
      colorHex: '#00f0ff',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#ff007f',
      align: 'center',
      positionPct: { x: 0.5, y: 0.84 },
      anchor: 'bottom',
      fontFamily: 'Bebas Neue',
      fontWeight: '700',
      letterSpacingPx: 2,
      box: {
        colorHex: '#000000',
        opacity: 0.9,
        paddingPx: 14,
        borderRadiusPx: 24,
      },
      preset: 'caption',
      badgeIcon: 'trending_up',
      templateStyleId: 'tiktok-viral-tag',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'like-and-share-card',
    category: 'social',
    categoryLabel: 'Social & Vlog',
    name: 'Like & Share Prompt',
    description: 'Dual icon prompt to drive video engagement',
    primaryText: 'LEAVE A LIKE',
    secondaryText: '& share with friends',
    badgeIcon: 'thumb_up',
    layout: 'badge_pill',
    durationSeconds: 3.5,
    compoundAnimation: {
      inAnimation: 'bounce',
      inDurationFrames: 20,
      loopAnimation: 'heartbeat',
      outAnimation: 'fade_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 38,
      colorHex: '#38bdf8',
      secondaryFontSizePx: 24,
      secondaryColorHex: '#bae6fd',
      align: 'center',
      positionPct: { x: 0.5, y: 0.8 },
      anchor: 'bottom',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#082f49',
        opacity: 0.9,
        paddingPx: 16,
        borderRadiusPx: 30,
      },
      preset: 'lower_third',
      badgeIcon: 'thumb_up',
      templateStyleId: 'like-and-share-card',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'vlog-date-location',
    category: 'social',
    categoryLabel: 'Social & Vlog',
    name: 'Vlog Date & Location',
    description: 'Clean travel vlog timestamp and destination badge',
    primaryText: 'KYOTO, JAPAN',
    secondaryText: 'DAY 04 · AUTUMN 2026',
    badgeIcon: 'location_on',
    layout: 'stacked',
    durationSeconds: 4,
    transitionIn: 'crossfade',
    compoundAnimation: {
      inAnimation: 'tracking_expand',
      inDurationFrames: 24,
      outAnimation: 'fade_out',
      outDurationFrames: 18,
    },
    style: {
      fontSizePx: 46,
      colorHex: '#ffffff',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#cbd5e1',
      align: 'left',
      positionPct: { x: 0.08, y: 0.15 },
      anchor: 'top',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      letterSpacingPx: 4,
      box: {
        colorHex: '#0f172a',
        opacity: 0.7,
        paddingPx: 16,
        borderRadiusPx: 8,
      },
      preset: 'title',
      badgeIcon: 'location_on',
      templateStyleId: 'vlog-date-location',
      templateLayout: 'stacked',
    },
  },

  // ==========================================
  // 2. Titles & Cinematic Openers
  // ==========================================
  {
    id: 'cinematic-gold-title',
    category: 'titles',
    categoryLabel: 'Titles & Intros',
    name: 'Majestic 3D Gold',
    description: 'High-end gold gradient serif header with deep drop shadow',
    primaryText: 'THE CHRONICLES',
    secondaryText: 'A CINEMATIC MASTERPIECE',
    layout: 'stacked',
    durationSeconds: 4.5,
    transitionIn: 'blur_dissolve',
    compoundAnimation: {
      inAnimation: 'tracking_expand',
      inDurationFrames: 30,
      loopAnimation: 'shimmer',
      outAnimation: 'dissolve',
      outDurationFrames: 24,
    },
    style: {
      fontSizePx: 86,
      colorHex: '#ffd700',
      secondaryFontSizePx: 32,
      secondaryColorHex: '#fef08a',
      align: 'center',
      positionPct: { x: 0.5, y: 0.45 },
      anchor: 'middle',
      fontFamily: 'Cinzel',
      fontWeight: '700',
      letterSpacingPx: 6,
      gradient: { enabled: true, fromHex: '#ffe259', toHex: '#ffa751', angleDeg: 90 },
      shadow: { colorHex: '#000000', blurPx: 16, offsetX: 0, offsetY: 8, opacity: 0.85 },
      preset: 'title',
      templateStyleId: 'cinematic-gold-title',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'cyberpunk-glitch-header',
    category: 'titles',
    categoryLabel: 'Titles & Intros',
    name: 'Cyberpunk Glitch Neon',
    description: 'Futuristic glowing title with digital glitch entrance and cyan stroke',
    primaryText: 'CYBER CITY 2099',
    secondaryText: 'SYSTEM INITIALIZED // NODE_01',
    badgeIcon: 'terminal',
    layout: 'stacked',
    durationSeconds: 4,
    transitionIn: 'pixelize',
    compoundAnimation: {
      inAnimation: 'glitch',
      inDurationFrames: 24,
      loopAnimation: 'glow_pulse',
      outAnimation: 'fade_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 88,
      colorHex: '#00f0ff',
      secondaryFontSizePx: 30,
      secondaryColorHex: '#ff007f',
      align: 'center',
      positionPct: { x: 0.5, y: 0.48 },
      anchor: 'middle',
      fontFamily: 'Bebas Neue',
      fontWeight: '900',
      letterSpacingPx: 4,
      stroke: { colorHex: '#ff007f', widthPx: 2 },
      glow: { colorHex: '#00f0ff', radiusPx: 18, intensity: 0.9 },
      preset: 'title',
      badgeIcon: 'terminal',
      templateStyleId: 'cyberpunk-glitch-header',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'minimal-luxury-serif',
    category: 'titles',
    categoryLabel: 'Titles & Intros',
    name: 'Minimal Luxury Serif',
    description: 'Refined editorial title with understated elegance and wide kerning',
    primaryText: 'ESSENCE & FORM',
    secondaryText: 'VOL. 08 · ARCHITECTURAL REVIEW',
    layout: 'stacked',
    durationSeconds: 4,
    transitionIn: 'crossfade',
    compoundAnimation: {
      inAnimation: 'fade_in',
      inDurationFrames: 24,
      outAnimation: 'fade_out',
      outDurationFrames: 20,
    },
    style: {
      fontSizePx: 72,
      colorHex: '#ffffff',
      secondaryFontSizePx: 28,
      secondaryColorHex: '#94a3b8',
      align: 'center',
      positionPct: { x: 0.5, y: 0.5 },
      anchor: 'middle',
      fontFamily: 'Playfair Display',
      fontWeight: '400',
      letterSpacingPx: 8,
      preset: 'title',
      templateStyleId: 'minimal-luxury-serif',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'synthwave-80s-sunset',
    category: 'titles',
    categoryLabel: 'Titles & Intros',
    name: '80s Retro Synthwave',
    description: 'Nostalgic retro wave title with magenta-yellow sunset gradient',
    primaryText: 'NEON NIGHTS',
    secondaryText: 'OUTRUN THE HORIZON',
    layout: 'stacked',
    durationSeconds: 4,
    compoundAnimation: {
      inAnimation: 'flip_x',
      inDurationFrames: 20,
      loopAnimation: 'wave',
      outAnimation: 'shrink_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 84,
      colorHex: '#f43f5e',
      secondaryFontSizePx: 32,
      secondaryColorHex: '#fde047',
      align: 'center',
      positionPct: { x: 0.5, y: 0.46 },
      anchor: 'middle',
      fontFamily: 'Bebas Neue',
      fontWeight: '900',
      letterSpacingPx: 5,
      gradient: { enabled: true, fromHex: '#ec4899', toHex: '#eab308', angleDeg: 180 },
      shadow: { colorHex: '#4c0519', blurPx: 20, offsetX: 0, offsetY: 6, opacity: 0.9 },
      preset: 'title',
      templateStyleId: 'synthwave-80s-sunset',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'blockbuster-impact-intro',
    category: 'titles',
    categoryLabel: 'Titles & Intros',
    name: 'Blockbuster Impact Intro',
    description: 'Heavy bold title designed for trailers and high-energy openers',
    primaryText: 'UNSTOPPABLE',
    secondaryText: 'COMING TO THEATERS WORLDWIDE',
    layout: 'stacked',
    durationSeconds: 3.5,
    transitionIn: 'flash_frame',
    compoundAnimation: {
      inAnimation: 'pop_scale',
      inDurationFrames: 15,
      outAnimation: 'zoom_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 96,
      colorHex: '#facc15',
      secondaryFontSizePx: 30,
      secondaryColorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.48 },
      anchor: 'middle',
      fontFamily: 'Impact',
      fontWeight: '900',
      letterSpacingPx: 3,
      stroke: { colorHex: '#000000', widthPx: 4 },
      shadow: { colorHex: '#000000', blurPx: 12, offsetX: 0, offsetY: 6, opacity: 0.9 },
      preset: 'title',
      templateStyleId: 'blockbuster-impact-intro',
      templateLayout: 'stacked',
    },
  },

  // ==========================================
  // 3. Lower Thirds & Speaker Badges
  // ==========================================
  {
    id: 'broadcast-news-ticker',
    category: 'lower_thirds',
    categoryLabel: 'Lower Thirds',
    name: 'Breaking News Ticker',
    description: 'Classic broadcast news lower third with red breaking header and white banner',
    primaryText: 'BREAKING NEWS',
    secondaryText: 'Global summit reaches historic agreement in Geneva',
    badgeIcon: 'campaign',
    layout: 'news_ticker',
    durationSeconds: 5,
    transitionIn: 'wipe_left',
    compoundAnimation: {
      inAnimation: 'slide_left',
      inDurationFrames: 18,
      outAnimation: 'wipe_right',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 46,
      colorHex: '#ffffff',
      secondaryFontSizePx: 32,
      secondaryColorHex: '#0f172a',
      align: 'left',
      positionPct: { x: 0.05, y: 0.86 },
      anchor: 'bottom',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#dc2626',
        opacity: 0.95,
        paddingPx: 16,
        borderRadiusPx: 4,
      },
      preset: 'lower_third',
      badgeIcon: 'campaign',
      templateStyleId: 'broadcast-news-ticker',
      templateLayout: 'news_ticker',
    },
  },
  {
    id: 'corporate-speaker-card',
    category: 'lower_thirds',
    categoryLabel: 'Lower Thirds',
    name: 'Corporate Speaker & Title',
    description: 'Clean executive name and title badge with accent border bar',
    primaryText: 'Dr. Sarah Mitchell',
    secondaryText: 'Chief Scientific Officer · DeepHealth Labs',
    badgeIcon: 'verified',
    layout: 'stacked',
    durationSeconds: 4.5,
    transitionIn: 'crossfade',
    compoundAnimation: {
      inAnimation: 'slide_up',
      inDurationFrames: 20,
      outAnimation: 'slide_down_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      secondaryFontSizePx: 28,
      secondaryColorHex: '#38bdf8',
      align: 'left',
      positionPct: { x: 0.08, y: 0.85 },
      anchor: 'bottom',
      fontFamily: 'Inter',
      fontWeight: '700',
      box: {
        colorHex: '#0f172a',
        opacity: 0.85,
        paddingPx: 16,
        borderRadiusPx: 8,
      },
      preset: 'lower_third',
      badgeIcon: 'verified',
      templateStyleId: 'corporate-speaker-card',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'minimal-glass-pill',
    category: 'lower_thirds',
    categoryLabel: 'Lower Thirds',
    name: 'Frosted Glass Subtitle',
    description: 'Translucent modern backdrop with crisp white text',
    primaryText: 'Michael Chang',
    secondaryText: 'Cinematographer & Drone Pilot',
    layout: 'badge_pill',
    durationSeconds: 4,
    compoundAnimation: {
      inAnimation: 'fade_in',
      inDurationFrames: 18,
      outAnimation: 'fade_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 40,
      colorHex: '#f8fafc',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#cbd5e1',
      align: 'left',
      positionPct: { x: 0.08, y: 0.86 },
      anchor: 'bottom',
      fontFamily: 'Inter',
      fontWeight: '600',
      box: {
        colorHex: '#1e293b',
        opacity: 0.75,
        paddingPx: 14,
        borderRadiusPx: 20,
      },
      preset: 'lower_third',
      templateStyleId: 'minimal-glass-pill',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'tech-gradient-badge',
    category: 'lower_thirds',
    categoryLabel: 'Lower Thirds',
    name: 'Tech Indigo Gradient',
    description: 'Sleek vibrant gradient bar for engineering and software presentations',
    primaryText: 'API ARCHITECTURE 3.0',
    secondaryText: 'Latency reduced by 48% across regions',
    badgeIcon: 'memory',
    layout: 'bordered_card',
    durationSeconds: 4,
    compoundAnimation: {
      inAnimation: 'slide_right',
      inDurationFrames: 16,
      outAnimation: 'fade_out',
      outDurationFrames: 14,
    },
    style: {
      fontSizePx: 42,
      colorHex: '#ffffff',
      secondaryFontSizePx: 28,
      secondaryColorHex: '#a5b4fc',
      align: 'left',
      positionPct: { x: 0.08, y: 0.84 },
      anchor: 'bottom',
      fontFamily: 'Roboto Mono',
      fontWeight: '700',
      gradient: { enabled: true, fromHex: '#4f46e5', toHex: '#06b6d4', angleDeg: 90 },
      box: {
        colorHex: '#111827',
        opacity: 0.9,
        paddingPx: 16,
        borderRadiusPx: 10,
      },
      preset: 'lower_third',
      badgeIcon: 'memory',
      templateStyleId: 'tech-gradient-badge',
      templateLayout: 'bordered_card',
    },
  },

  // ==========================================
  // 4. Callout Badges & Pointers
  // ==========================================
  {
    id: 'price-tag-callout',
    category: 'callouts',
    categoryLabel: 'Callouts & Badges',
    name: 'Animated Price Tag',
    description: 'Vibrant emerald price badge for e-commerce and product showcases',
    primaryText: 'ONLY $49',
    secondaryText: 'Limited 24h Offer',
    badgeIcon: 'sell',
    layout: 'badge_pill',
    durationSeconds: 3.5,
    compoundAnimation: {
      inAnimation: 'pop_scale',
      inDurationFrames: 16,
      loopAnimation: 'heartbeat',
      outAnimation: 'shrink_out',
      outDurationFrames: 14,
    },
    style: {
      fontSizePx: 48,
      colorHex: '#ffffff',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#bbf7d0',
      align: 'center',
      positionPct: { x: 0.75, y: 0.25 },
      anchor: 'middle',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#059669',
        opacity: 0.95,
        paddingPx: 16,
        borderRadiusPx: 999,
      },
      preset: 'title',
      badgeIcon: 'sell',
      templateStyleId: 'price-tag-callout',
      templateLayout: 'badge_pill',
    },
  },
  {
    id: 'attention-arrow-pointer',
    category: 'callouts',
    categoryLabel: 'Callouts & Badges',
    name: 'Attention Pointer Callout',
    description: 'Bouncing directional pointer highlighting key visual elements',
    primaryText: 'LOOK AT THIS DETAIL',
    secondaryText: 'Notice the reflection here',
    badgeIcon: 'arrow_downward',
    layout: 'callout_pointer',
    durationSeconds: 3,
    compoundAnimation: {
      inAnimation: 'bounce',
      inDurationFrames: 18,
      loopAnimation: 'bounce_loop',
      outAnimation: 'fade_out',
      outDurationFrames: 12,
    },
    style: {
      fontSizePx: 40,
      colorHex: '#facc15',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.3 },
      anchor: 'middle',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#000000',
        opacity: 0.85,
        paddingPx: 14,
        borderRadiusPx: 12,
      },
      preset: 'title',
      badgeIcon: 'arrow_downward',
      templateStyleId: 'attention-arrow-pointer',
      templateLayout: 'callout_pointer',
    },
  },
  {
    id: 'caution-warning-ribbon',
    category: 'callouts',
    categoryLabel: 'Callouts & Badges',
    name: 'Caution Warning Ribbon',
    description: 'Amber hazard warning badge for safety advice or crucial disclaimers',
    primaryText: 'CAUTION: DON’T DO THIS',
    secondaryText: 'Always wear eye protection',
    badgeIcon: 'warning',
    layout: 'bordered_card',
    durationSeconds: 3.5,
    transitionIn: 'flash_frame',
    compoundAnimation: {
      inAnimation: 'elastic_drop',
      inDurationFrames: 18,
      loopAnimation: 'glow_pulse',
      outAnimation: 'fade_out',
      outDurationFrames: 14,
    },
    style: {
      fontSizePx: 44,
      colorHex: '#fef08a',
      secondaryFontSizePx: 28,
      secondaryColorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.2 },
      anchor: 'middle',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#b45309',
        opacity: 0.95,
        paddingPx: 16,
        borderRadiusPx: 8,
      },
      preset: 'title',
      badgeIcon: 'warning',
      templateStyleId: 'caution-warning-ribbon',
      templateLayout: 'bordered_card',
    },
  },
  {
    id: 'question-bubble-pop',
    category: 'callouts',
    categoryLabel: 'Callouts & Badges',
    name: 'Question Prompt Bubble',
    description: 'Interactive question prompt to drive comments and viewer debate',
    primaryText: 'WHAT WOULD YOU CHOOSE?',
    secondaryText: 'Comment below 👇',
    badgeIcon: 'help',
    layout: 'badge_pill',
    durationSeconds: 3.5,
    compoundAnimation: {
      inAnimation: 'pop_scale',
      inDurationFrames: 15,
      loopAnimation: 'wave',
      outAnimation: 'zoom_out',
      outDurationFrames: 14,
    },
    style: {
      fontSizePx: 42,
      colorHex: '#ffffff',
      secondaryFontSizePx: 28,
      secondaryColorHex: '#fde047',
      align: 'center',
      positionPct: { x: 0.5, y: 0.25 },
      anchor: 'middle',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      box: {
        colorHex: '#7c3aed',
        opacity: 0.9,
        paddingPx: 16,
        borderRadiusPx: 30,
      },
      preset: 'title',
      badgeIcon: 'help',
      templateStyleId: 'question-bubble-pop',
      templateLayout: 'badge_pill',
    },
  },

  // ==========================================
  // 5. Kinetic & Quotes
  // ==========================================
  {
    id: 'typewriter-terminal-quote',
    category: 'kinetic',
    categoryLabel: 'Kinetic & Quotes',
    name: 'Typewriter Code Terminal',
    description: 'Monospaced typewriter text simulating retro code execution',
    primaryText: '> const future = await buildVision();',
    secondaryText: 'Process completed in 24ms with 0 errors.',
    badgeIcon: 'terminal',
    layout: 'stacked',
    durationSeconds: 4,
    compoundAnimation: {
      inAnimation: 'typewriter',
      inDurationFrames: 45,
      outAnimation: 'fade_out',
      outDurationFrames: 15,
    },
    style: {
      fontSizePx: 40,
      colorHex: '#4ade80',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#94a3b8',
      align: 'left',
      positionPct: { x: 0.08, y: 0.5 },
      anchor: 'middle',
      fontFamily: 'Roboto Mono',
      fontWeight: '600',
      box: {
        colorHex: '#022c22',
        opacity: 0.9,
        paddingPx: 18,
        borderRadiusPx: 10,
      },
      preset: 'title',
      animation: { type: 'typewriter', durationFrames: 45 },
      badgeIcon: 'terminal',
      templateStyleId: 'typewriter-terminal-quote',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'multi-line-impact-slam',
    category: 'kinetic',
    categoryLabel: 'Kinetic & Quotes',
    name: 'Multi-Line Impact Slam',
    description: 'Heavy 3-line kinetic typography slam for viral hooks and quotes',
    primaryText: 'START TODAY\nNOT TOMORROW',
    secondaryText: '— NO EXCUSES ALLOWED —',
    layout: 'stacked',
    durationSeconds: 3,
    transitionIn: 'flash_frame',
    compoundAnimation: {
      inAnimation: 'pop_scale',
      inDurationFrames: 12,
      outAnimation: 'shrink_out',
      outDurationFrames: 12,
    },
    style: {
      fontSizePx: 84,
      colorHex: '#ffffff',
      secondaryFontSizePx: 32,
      secondaryColorHex: '#facc15',
      align: 'center',
      positionPct: { x: 0.5, y: 0.48 },
      anchor: 'middle',
      fontFamily: 'Montserrat',
      fontWeight: '900',
      letterSpacingPx: 2,
      stroke: { colorHex: '#000000', widthPx: 4 },
      shadow: { colorHex: '#000000', blurPx: 16, offsetX: 0, offsetY: 8, opacity: 0.9 },
      preset: 'title',
      templateStyleId: 'multi-line-impact-slam',
      templateLayout: 'stacked',
    },
  },
  {
    id: 'editorial-quotation-box',
    category: 'kinetic',
    categoryLabel: 'Kinetic & Quotes',
    name: 'Editorial Quotation Card',
    description: 'Sophisticated quote banner with gold quotation mark accent',
    primaryText: '“Design is not just what it looks like.\nDesign is how it works.”',
    secondaryText: 'STEVE JOBS · STANFORD 2005',
    badgeIcon: 'format_quote',
    layout: 'bordered_card',
    durationSeconds: 4.5,
    compoundAnimation: {
      inAnimation: 'fade_in',
      inDurationFrames: 24,
      outAnimation: 'fade_out',
      outDurationFrames: 18,
    },
    style: {
      fontSizePx: 46,
      colorHex: '#f8fafc',
      secondaryFontSizePx: 26,
      secondaryColorHex: '#f59e0b',
      align: 'center',
      positionPct: { x: 0.5, y: 0.48 },
      anchor: 'middle',
      fontFamily: 'Playfair Display',
      fontWeight: '600',
      box: {
        colorHex: '#0f172a',
        opacity: 0.88,
        paddingPx: 24,
        borderRadiusPx: 16,
      },
      preset: 'title',
      badgeIcon: 'format_quote',
      templateStyleId: 'editorial-quotation-box',
      templateLayout: 'bordered_card',
    },
  },
];

/**
 * Procedural motion evaluation combining Entrance (In), Continuous (Loop), and Exit (Out).
 */
export function calculateCompoundTextMotion(
  effectsText: TextContent,
  frameInClip: number,
  durationFrames: number,
  fps: number = 30
): TextMotionState {
  const compound = effectsText.compoundAnimation;

  // If no compound animation is configured, evaluate single animation
  if (!compound) {
    return calculateTextMotionTransform(effectsText.animation, frameInClip, fps);
  }

  const inDuration = Math.max(1, compound.inDurationFrames ?? 15);
  const outDuration = Math.max(1, compound.outDurationFrames ?? 15);
  const exitStartFrame = Math.max(inDuration, durationFrames - outDuration);

  // Phase 1: In / Entrance Animation
  if (frameInClip < inDuration && compound.inAnimation && compound.inAnimation !== 'none') {
    return calculateTextMotionTransform(
      { type: compound.inAnimation, durationFrames: inDuration },
      frameInClip,
      fps
    );
  }

  // Phase 3: Out / Exit Animation
  if (frameInClip >= exitStartFrame && compound.outAnimation && compound.outAnimation !== 'none') {
    const exitFrame = frameInClip - exitStartFrame;
    return calculateTextMotionTransform(
      { type: compound.outAnimation, durationFrames: outDuration },
      exitFrame,
      fps
    );
  }

  // Phase 2: Middle / Loop Animation
  if (compound.loopAnimation && compound.loopAnimation !== 'none') {
    return calculateTextMotionTransform(
      { type: compound.loopAnimation, durationFrames: 30 },
      frameInClip,
      fps
    );
  }

  return {};
}

export interface AITitleHookSuggestion {
  id: string;
  title: string;
  subtitle: string;
  badgeIcon: string;
  recommendedTemplateId: string;
  estimatedEngagement: string;
}

/**
 * Algorithmic AI Title & Hook Generator producing high-converting titles from topic and tone.
 */
export function generateAITitleHooks(
  topic: string,
  tone: 'viral' | 'professional' | 'cinematic' | 'energetic' = 'viral'
): AITitleHookSuggestion[] {
  const clean = topic.trim() || 'Video Creation';

  switch (tone) {
    case 'viral':
      return [
        {
          id: 'v1',
          title: `DON’T IGNORE THIS: ${clean.toUpperCase()}`,
          subtitle: 'The 1 mistake 99% of creators make',
          badgeIcon: 'warning',
          recommendedTemplateId: 'multi-line-impact-slam',
          estimatedEngagement: '98% Viral Score',
        },
        {
          id: 'v2',
          title: `HOW TO MASTER ${clean.toUpperCase()} IN 24H`,
          subtitle: 'Complete beginner-to-pro breakdown',
          badgeIcon: 'trending_up',
          recommendedTemplateId: 'tiktok-viral-tag',
          estimatedEngagement: '94% Viral Score',
        },
        {
          id: 'v3',
          title: `STOP DOING THIS WITH ${clean.toUpperCase()}`,
          subtitle: 'Watch until the very end ⚠️',
          badgeIcon: 'cancel',
          recommendedTemplateId: 'caution-warning-ribbon',
          estimatedEngagement: '91% Viral Score',
        },
        {
          id: 'v4',
          title: `THE SECRET BEHIND ${clean.toUpperCase()}`,
          subtitle: 'What industry experts never tell you',
          badgeIcon: 'visibility',
          recommendedTemplateId: 'yt-subscribe-bell',
          estimatedEngagement: '89% Viral Score',
        },
        {
          id: 'v5',
          title: `IS ${clean.toUpperCase()} REALLY WORTH IT?`,
          subtitle: 'Unfiltered review & honest verdict',
          badgeIcon: 'help',
          recommendedTemplateId: 'question-bubble-pop',
          estimatedEngagement: '87% Viral Score',
        },
      ];

    case 'professional':
      return [
        {
          id: 'p1',
          title: `STRATEGIC ADVANCEMENTS IN ${clean.toUpperCase()}`,
          subtitle: 'Key architectural insights & findings',
          badgeIcon: 'verified',
          recommendedTemplateId: 'corporate-speaker-card',
          estimatedEngagement: 'Executive Grade',
        },
        {
          id: 'p2',
          title: `THE FUTURE OF ${clean.toUpperCase()}`,
          subtitle: 'Annual Industry Benchmark Report',
          badgeIcon: 'insights',
          recommendedTemplateId: 'broadcast-news-ticker',
          estimatedEngagement: 'Broadcast Standard',
        },
        {
          id: 'p3',
          title: `${clean.toUpperCase()} AT SCALE`,
          subtitle: 'Optimizing performance, security & velocity',
          badgeIcon: 'memory',
          recommendedTemplateId: 'tech-gradient-badge',
          estimatedEngagement: 'Technical Deep Dive',
        },
        {
          id: 'p4',
          title: `RETHINKING ${clean.toUpperCase()}`,
          subtitle: 'A pragmatic framework for enterprise teams',
          badgeIcon: 'domain',
          recommendedTemplateId: 'minimal-glass-pill',
          estimatedEngagement: 'Enterprise Grade',
        },
        {
          id: 'p5',
          title: `${clean.toUpperCase()} CASE STUDY`,
          subtitle: 'Measurable outcomes & operational results',
          badgeIcon: 'analytics',
          recommendedTemplateId: 'minimal-luxury-serif',
          estimatedEngagement: 'Executive Grade',
        },
      ];

    case 'cinematic':
      return [
        {
          id: 'c1',
          title: `${clean.toUpperCase()}`,
          subtitle: 'A JOURNEY INTO THE UNKNOWN',
          badgeIcon: 'movie',
          recommendedTemplateId: 'cinematic-gold-title',
          estimatedEngagement: 'Cinematic Chapter',
        },
        {
          id: 'c2',
          title: `BEYOND ${clean.toUpperCase()}`,
          subtitle: 'WHERE THE HORIZON ENDS',
          badgeIcon: 'flare',
          recommendedTemplateId: 'synthwave-80s-sunset',
          estimatedEngagement: 'Epic Opener',
        },
        {
          id: 'c3',
          title: `THE ORIGIN: ${clean.toUpperCase()}`,
          subtitle: 'EVERY STORY HAS A BEGINNING',
          badgeIcon: 'auto_awesome',
          recommendedTemplateId: 'minimal-luxury-serif',
          estimatedEngagement: 'Atmospheric Intro',
        },
        {
          id: 'c4',
          title: `PROJECT ${clean.toUpperCase()}`,
          subtitle: 'DOCUMENTARY SHORT FILM',
          badgeIcon: 'videocam',
          recommendedTemplateId: 'vlog-date-location',
          estimatedEngagement: 'Documentary Title',
        },
        {
          id: 'c5',
          title: `CHRONICLES OF ${clean.toUpperCase()}`,
          subtitle: 'WRITTEN & DIRECTED FOR SCREEN',
          badgeIcon: 'theaters',
          recommendedTemplateId: 'blockbuster-impact-intro',
          estimatedEngagement: 'Trailer Impact',
        },
      ];

    case 'energetic':
    default:
      return [
        {
          id: 'e1',
          title: `LEVEL UP YOUR ${clean.toUpperCase()}`,
          subtitle: 'Hit subscribe for more weekly guides!',
          badgeIcon: 'bolt',
          recommendedTemplateId: 'yt-subscribe-bell',
          estimatedEngagement: 'High Energy',
        },
        {
          id: 'e2',
          title: `INSANE ${clean.toUpperCase()} TRANSFORMATION`,
          subtitle: 'Before vs After results inside 🔥',
          badgeIcon: 'local_fire_department',
          recommendedTemplateId: 'tiktok-viral-tag',
          estimatedEngagement: 'Trending Alert',
        },
        {
          id: 'e3',
          title: `THE ULTIMATE ${clean.toUpperCase()} CHALLENGE`,
          subtitle: 'Can you finish this in under 10 minutes?',
          badgeIcon: 'sports_esports',
          recommendedTemplateId: 'cyberpunk-glitch-header',
          estimatedEngagement: 'Challenge Mode',
        },
        {
          id: 'e4',
          title: `GRAB YOUR ${clean.toUpperCase()} NOW`,
          subtitle: 'Available while stock lasts 🚀',
          badgeIcon: 'sell',
          recommendedTemplateId: 'price-tag-callout',
          estimatedEngagement: 'High Conversion',
        },
        {
          id: 'e5',
          title: `LET’S TALK ABOUT ${clean.toUpperCase()}`,
          subtitle: 'Drop your thoughts in the comments 👇',
          badgeIcon: 'chat',
          recommendedTemplateId: 'like-and-share-card',
          estimatedEngagement: 'Discussion Magnet',
        },
      ];
  }
}

/**
 * Transforms an existing sequence text clip into the chosen smart text template.
 */
export function applyTextTemplateToClip(
  clip: SequenceClip,
  template: SmartTextTemplate,
  preserveText: boolean = true
): SequenceClip {
  const existingText = clip.effects?.text;

  const primary = preserveText && existingText?.text ? existingText.text : template.primaryText;
  const secondary =
    preserveText && existingText?.secondaryText !== undefined
      ? existingText.secondaryText
      : template.secondaryText;

  const nextText: TextContent = {
    ...template.style,
    text: primary,
    secondaryText: secondary,
    badgeIcon: template.badgeIcon,
    templateStyleId: template.id,
    templateLayout: template.layout,
    compoundAnimation: template.compoundAnimation,
  };

  return {
    ...clip,
    label: template.name,
    transitionIn: template.transitionIn ?? clip.transitionIn ?? 'cut',
    transitionFrames: template.transitionIn && template.transitionIn !== 'cut' ? 12 : clip.transitionFrames,
    effects: {
      ...clip.effects,
      text: nextText,
    },
  };
}
