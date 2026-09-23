import { describe, it, expect } from 'vitest';
import {
  FONT_FAMILIES,
  STUDIO_TEXT_PRESETS,
  CAPCUT_CAPTION_PRESETS,
  calculateTypewriterSlice,
  calculateTextMotionTransform,
  calculateKaraokeHighlight,
  applyTypographyStyleToClips,
  buildFfmpegDrawTextOptions,
} from '../typography-ops';

describe('typography-ops', () => {
  describe('FONT_FAMILIES', () => {
    it('contains all 8 curated font families with categories and css definitions', () => {
      expect(FONT_FAMILIES).toHaveLength(8);
      const families = FONT_FAMILIES.map((f) => f.family);
      expect(families).toContain('Inter');
      expect(families).toContain('Montserrat');
      expect(families).toContain('Bebas Neue');
      expect(families).toContain('Playfair Display');
      expect(families).toContain('Oswald');
      expect(families).toContain('Cinzel');
      expect(families).toContain('Roboto Mono');
      expect(families).toContain('Impact');

      for (const font of FONT_FAMILIES) {
        expect(font.label).toBeTruthy();
        expect(font.cssFont).toBeTruthy();
        expect(['sans', 'serif', 'display', 'mono']).toContain(font.category);
      }
    });
  });

  describe('STUDIO_TEXT_PRESETS', () => {
    it('provides high quality motion title presets', () => {
      const presetKeys = Object.keys(STUDIO_TEXT_PRESETS);
      expect(presetKeys.length).toBeGreaterThanOrEqual(6);

      expect(STUDIO_TEXT_PRESETS.cinematic_gold).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.cyberpunk_neon).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.modern_bold).toBeDefined();
      expect(STUDIO_TEXT_PRESETS.typewriter_retro).toBeDefined();

      for (const [id, preset] of Object.entries(STUDIO_TEXT_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(preset.name).toBeTruthy();
        expect(preset.fontSizePx).toBeGreaterThan(0);
        expect(preset.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('calculateTypewriterSlice', () => {
    const text = 'Hello VideoStudio!';

    it('returns empty string when frame is 0 or negative', () => {
      expect(calculateTypewriterSlice(text, 0, 30)).toBe('');
      expect(calculateTypewriterSlice(text, -5, 30)).toBe('');
    });

    it('returns full text when frame is at or beyond duration', () => {
      expect(calculateTypewriterSlice(text, 30, 30)).toBe(text);
      expect(calculateTypewriterSlice(text, 45, 30)).toBe(text);
    });

    it('returns full text if duration is zero or negative', () => {
      expect(calculateTypewriterSlice(text, 10, 0)).toBe(text);
      expect(calculateTypewriterSlice(text, 10, -1)).toBe(text);
    });

    it('slices proportionally at mid-point frames', () => {
      const half = calculateTypewriterSlice(text, 15, 30);
      expect(half.length).toBe(Math.round(text.length * 0.5));
      expect(text.startsWith(half)).toBe(true);
    });

    it('handles empty string gracefully', () => {
      expect(calculateTypewriterSlice('', 10, 30)).toBe('');
    });
  });

  describe('calculateTextMotionTransform', () => {
    it('returns empty state for none, undefined, or typewriter animation', () => {
      expect(calculateTextMotionTransform(undefined, 10, 30)).toEqual({});
      expect(calculateTextMotionTransform({ type: 'none', durationFrames: 30 }, 10, 30)).toEqual({});
      expect(calculateTextMotionTransform({ type: 'typewriter', durationFrames: 30 }, 10, 30)).toEqual({});
    });

    it('calculates fade_in opacity easing from 0 to 1', () => {
      const start = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 0, 30);
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 20, 30);
      expect(end.opacity).toBe(1);

      const mid = calculateTextMotionTransform({ type: 'fade_in', durationFrames: 20 }, 10, 30);
      expect(mid.opacity).toBeGreaterThan(0);
      expect(mid.opacity).toBeLessThan(1);
    });

    it('calculates slide_up translation from +36px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_up', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateY(36.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_up', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates slide_down translation from -36px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_down', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateY(-36.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_down', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates pop_scale with subtle overshoot (> 1.0) and settles to 1.0', () => {
      const start = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 0, 30);
      expect(start.transform).toContain('scale(0.300)');

      // At ~70% of duration (14 of 20 frames), overshoot hits peak (scale 1.050)
      const peak = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 14, 30);
      expect(peak.transform).toContain('scale(1.050)');

      // Settles to 1.000 at end
      const end = calculateTextMotionTransform({ type: 'pop_scale', durationFrames: 20 }, 20, 30);
      expect(end.transform).toContain('scale(1.000)');
    });

    it('calculates bounce physics with vertical offset and opacity decay', () => {
      const start = calculateTextMotionTransform({ type: 'bounce', durationFrames: 30 }, 0, 30);
      expect(start.transform).toContain('translateY(-30.0px)');

      const end = calculateTextMotionTransform({ type: 'bounce', durationFrames: 30 }, 30, 30);
      expect(end.transform).toContain('translateY(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates glow_pulse with pulsating textShadow', () => {
      const frame0 = calculateTextMotionTransform({ type: 'glow_pulse', durationFrames: 30 }, 0, 30);
      expect(frame0.textShadow).toContain('rgba(0, 240, 255,');

      const frame15 = calculateTextMotionTransform({ type: 'glow_pulse', durationFrames: 30 }, 15, 30);
      expect(frame15.textShadow).toContain('rgba(0, 240, 255,');
    });
    it('calculates slide_left translation from +48px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_left', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateX(48.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_left', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateX(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates slide_right translation from -48px to 0px', () => {
      const start = calculateTextMotionTransform({ type: 'slide_right', durationFrames: 20 }, 0, 30);
      expect(start.transform).toBe('translateX(-48.0px)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'slide_right', durationFrames: 20 }, 20, 30);
      expect(end.transform).toBe('translateX(0.0px)');
      expect(end.opacity).toBe(1);
    });

    it('calculates zoom_in scale and opacity', () => {
      const start = calculateTextMotionTransform({ type: 'zoom_in', durationFrames: 20 }, 0, 30);
      expect(start.transform).toContain('scale(0.400)');
      expect(start.opacity).toBe(0);

      const end = calculateTextMotionTransform({ type: 'zoom_in', durationFrames: 20 }, 20, 30);
      expect(end.transform).toContain('scale(1.000)');
      expect(end.opacity).toBe(1);
    });

    it('calculates exit animations (fade_out, zoom_out, dissolve)', () => {
      const fadeOut = calculateTextMotionTransform({ type: 'fade_out', durationFrames: 20 }, 20, 30);
      expect(fadeOut.opacity).toBe(0);

      const zoomOut = calculateTextMotionTransform({ type: 'zoom_out', durationFrames: 20 }, 20, 30);
      expect(zoomOut.opacity).toBe(0);
      expect(zoomOut.transform).toContain('scale(0.400)');

      const dissolve = calculateTextMotionTransform({ type: 'dissolve', durationFrames: 20 }, 20, 30);
      expect(dissolve.opacity).toBe(0);
    });

    it('calculates loop animations (wave, shimmer, bounce_loop)', () => {
      const wave = calculateTextMotionTransform({ type: 'wave', durationFrames: 30 }, 15, 30);
      expect(wave.transform).toContain('translateY(');

      const shimmer = calculateTextMotionTransform({ type: 'shimmer', durationFrames: 30 }, 15, 30);
      expect(shimmer.opacity).toBeGreaterThanOrEqual(0.5);

      const bounceLoop = calculateTextMotionTransform({ type: 'bounce_loop', durationFrames: 30 }, 15, 30);
      expect(bounceLoop.transform).toContain('translateY(');
    });
  });

  describe('calculateKaraokeHighlight', () => {
    const lyric = 'Never gonna give you up';

    it('tokenizes words and whitespace correctly', () => {
      const result = calculateKaraokeHighlight(lyric, 0, 100);
      expect(result.tokens.length).toBeGreaterThan(5);
      const reconstructed = result.tokens.map((t) => t.word).join('');
      expect(reconstructed).toBe(lyric);
    });

    it('highlights first word at beginning of clip', () => {
      const result = calculateKaraokeHighlight(lyric, 0, 100);
      expect(result.activeWordIndex).toBe(0);
      const activeToken = result.tokens.find((t) => t.isActive);
      expect(activeToken?.word).toBe('Never');
    });

    it('progressively advances active word as playhead progresses', () => {
      // 5 words: 'Never' (0), 'gonna' (1), 'give' (2), 'you' (3), 'up' (4)
      const mid = calculateKaraokeHighlight(lyric, 50, 100);
      expect(mid.activeWordIndex).toBe(2);
      const activeToken = mid.tokens.find((t) => t.isActive);
      expect(activeToken?.word).toBe('give');

      // Tokens before 'give' should have isPast = true
      const pastTokens = mid.tokens.filter((t) => t.isPast && t.word.trim().length > 0);
      expect(pastTokens.map((t) => t.word)).toEqual(['Never', 'gonna']);
    });

    it('reaches final word at end of duration', () => {
      const end = calculateKaraokeHighlight(lyric, 100, 100);
      expect(end.activeWordIndex).toBe(4);
      const activeToken = end.tokens.find((t) => t.isActive);
      expect(activeToken?.word).toBe('up');
    });

    it('safely handles empty strings', () => {
      const result = calculateKaraokeHighlight('', 10, 100);
      expect(result.tokens).toEqual([{ word: '', isActive: false, isPast: false, startIndex: 0, endIndex: 0 }]);
      expect(result.activeWordIndex).toBe(-1);
    });
  });

  describe('applyTypographyStyleToClips', () => {
    const mockClips = [
      {
        id: 'clip-1',
        sequenceId: 'seq-1',
        trackId: 'track-subtitles',
        orderIndex: 0,
        sourceKind: 'text' as const,
        filePath: null,
        startFrames: 0,
        durationFrames: 30,
        transitionIn: 'cut' as const,
        transitionFrames: 0,
        motionPreset: 'none' as const,
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'First subtitle cue',
        overrides: [],
        effects: {
          text: {
            text: 'First subtitle cue',
            fontSizePx: 36,
            colorHex: '#FFFFFF',
            align: 'center' as const,
            positionPct: { x: 0.5, y: 0.85 },
            preset: 'caption' as const,
          },
        },
      },
      {
        id: 'clip-2',
        sequenceId: 'seq-1',
        trackId: 'track-subtitles',
        orderIndex: 1,
        sourceKind: 'text' as const,
        filePath: null,
        startFrames: 35,
        durationFrames: 40,
        transitionIn: 'cut' as const,
        transitionFrames: 0,
        motionPreset: 'none' as const,
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Second subtitle cue',
        overrides: [],
        effects: {
          text: {
            text: 'Second subtitle cue',
            fontSizePx: 36,
            colorHex: '#FFFFFF',
            align: 'center' as const,
            positionPct: { x: 0.5, y: 0.85 },
            preset: 'caption' as const,
          },
        },
      },
    ];

    it('batch applies typography patch while preserving original cue text', () => {
      const patch = {
        fontFamily: 'Montserrat',
        fontSizePx: 48,
        colorHex: '#FFD700',
        stroke: { colorHex: '#000000', widthPx: 3 },
      };

      const result = applyTypographyStyleToClips(mockClips, patch, 'track-subtitles');
      expect(result.updatedCount).toBe(2);
      expect(result.clips[0].effects?.text?.fontFamily).toBe('Montserrat');
      expect(result.clips[0].effects?.text?.fontSizePx).toBe(48);
      expect(result.clips[0].effects?.text?.colorHex).toBe('#FFD700');
      // Preserves original text
      expect(result.clips[0].effects?.text?.text).toBe('First subtitle cue');
      expect(result.clips[1].effects?.text?.text).toBe('Second subtitle cue');
    });

    it('filters by trackId when provided', () => {
      const result = applyTypographyStyleToClips(mockClips, { colorHex: '#FF0000' }, 'other-track');
      expect(result.updatedCount).toBe(0);
    });
  });

  describe('CAPCUT_CAPTION_PRESETS', () => {
    it('defines all signature CapCut caption presets with valid attributes', () => {
      expect(Object.keys(CAPCUT_CAPTION_PRESETS)).toEqual([
        'tiktok_viral_pill',
        'karaoke_party',
        'cyber_glow',
        'cinema_subtitles',
        'comic_pop',
        'bold_shadow',
      ]);

      const pill = CAPCUT_CAPTION_PRESETS.tiktok_viral_pill;
      expect(pill.name).toBe('TikTok Viral Pill');
      expect((pill.effects.box as { borderRadiusPx: number }).borderRadiusPx).toBe(20);

      const karaoke = CAPCUT_CAPTION_PRESETS.karaoke_party;
      expect((karaoke.effects.animation as { type: string }).type).toBe('karaoke_highlight');
    });
  });

  describe('buildFfmpegDrawTextOptions', () => {
    it('returns empty options when neither stroke nor shadow is set', () => {
      expect(buildFfmpegDrawTextOptions({})).toEqual({});
    });

    it('outputs borderw and bordercolor when stroke width > 0', () => {
      const opts = buildFfmpegDrawTextOptions({
        stroke: { colorHex: '#000000', widthPx: 3.5 },
      });
      expect(opts.borderw).toBe(4);
      expect(opts.bordercolor).toBe('#000000');
    });

    it('outputs shadowx, shadowy, shadowcolor when shadow is configured', () => {
      const opts = buildFfmpegDrawTextOptions({
        shadow: { colorHex: '#FF0000', blurPx: 5, offsetX: 3, offsetY: 4, opacity: 0.8 },
      });
      expect(opts.shadowx).toBe(3);
      expect(opts.shadowy).toBe(4);
      expect(opts.shadowcolor).toBe('#FF0000');
    });

    it('combines both stroke and shadow options simultaneously', () => {
      const opts = buildFfmpegDrawTextOptions({
        stroke: { colorHex: '#FFFFFF', widthPx: 2 },
        shadow: { colorHex: '#000000', blurPx: 8, offsetX: 2, offsetY: 2, opacity: 0.9 },
      });
      expect(opts.borderw).toBe(2);
      expect(opts.bordercolor).toBe('#FFFFFF');
      expect(opts.shadowx).toBe(2);
      expect(opts.shadowy).toBe(2);
      expect(opts.shadowcolor).toBe('#000000');
    });
  });
});
