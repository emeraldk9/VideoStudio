import { describe, expect, it } from 'vitest';
import {
  TRANSLATION_LANGUAGES,
  formatBilingualSubtitleText,
  splitBilingualSubtitleText,
  translateSubtitleClips,
  translateSubtitleText,
} from '../subtitle-translation-ops';
import type { SequenceClip } from '../../../types/sequence';

describe('subtitle-translation-ops (Step S81: Multi-Language Translation & Bilingual Subtitles)', () => {
  describe('Language Registry', () => {
    it('defines major supported languages with native names and flags', () => {
      expect(TRANSLATION_LANGUAGES.en.name).toBe('English');
      expect(TRANSLATION_LANGUAGES.es.flag).toBe('🇪🇸');
      expect(TRANSLATION_LANGUAGES.ja.nativeName).toBe('日本語');
      expect(TRANSLATION_LANGUAGES.vi.flag).toBe('🇻🇳');
    });
  });

  describe('translateSubtitleText', () => {
    it('translates common phrases into Spanish with preserved casing', () => {
      expect(translateSubtitleText('Welcome to this video', 'es', 'en')).toBe(
        'Bienvenidos a este video',
      );
      expect(translateSubtitleText('HELLO', 'es', 'en')).toBe('HOLA');
      expect(translateSubtitleText('Thank you', 'es', 'en')).toBe('Gracias');
    });

    it('translates into Vietnamese', () => {
      expect(translateSubtitleText('Welcome', 'vi', 'en')).toBe('Chào mừng');
      expect(translateSubtitleText('Thank you', 'vi', 'en')).toBe('Cảm ơn');
    });

    it('translates into Japanese', () => {
      expect(translateSubtitleText('Welcome', 'ja', 'en')).toBe('ようこそ');
      expect(translateSubtitleText('Hello', 'ja', 'en')).toBe('こんにちは');
    });

    it('returns original text if source and target languages are identical', () => {
      expect(translateSubtitleText('Welcome to this video', 'en', 'en')).toBe(
        'Welcome to this video',
      );
    });

    it('handles empty or whitespace-only strings gracefully', () => {
      expect(translateSubtitleText('', 'es', 'en')).toBe('');
      expect(translateSubtitleText('   ', 'es', 'en')).toBe('   ');
    });
  });

  describe('formatBilingualSubtitleText & splitBilingualSubtitleText', () => {
    it('formats stacked bilingual subtitles', () => {
      const formatted = formatBilingualSubtitleText(
        'Welcome to this video',
        'Bienvenidos a este video',
        'stacked',
      );
      expect(formatted).toBe('Welcome to this video\nBienvenidos a este video');
    });

    it('formats bracketed bilingual subtitles', () => {
      const formatted = formatBilingualSubtitleText(
        'Welcome to this video',
        'Bienvenidos a este video',
        'brackets',
      );
      expect(formatted).toBe('Welcome to this video (Bienvenidos a este video)');
    });

    it('formats reverse stacked bilingual subtitles', () => {
      const formatted = formatBilingualSubtitleText(
        'Welcome to this video',
        'Bienvenidos a este video',
        'reverse_stacked',
      );
      expect(formatted).toBe('Bienvenidos a este video\nWelcome to this video');
    });

    it('splits stacked bilingual text back into primary and secondary parts', () => {
      const text = 'Welcome to this video\nBienvenidos a este video';
      const parsed = splitBilingualSubtitleText(text);
      expect(parsed.primary).toBe('Welcome to this video');
      expect(parsed.secondary).toBe('Bienvenidos a este video');
    });

    it('splits bracketed bilingual text back into primary and secondary parts', () => {
      const text = 'Welcome to this video (Bienvenidos a este video)';
      const parsed = splitBilingualSubtitleText(text);
      expect(parsed.primary).toBe('Welcome to this video');
      expect(parsed.secondary).toBe('Bienvenidos a este video');
    });

    it('returns null secondary for monolingual text', () => {
      const parsed = splitBilingualSubtitleText('Single line subtitle');
      expect(parsed.primary).toBe('Single line subtitle');
      expect(parsed.secondary).toBeNull();
    });
  });

  describe('translateSubtitleClips', () => {
    const mockClips: SequenceClip[] = [
      {
        id: 'clip-sub-1',
        sequenceId: 'seq-1',
        trackId: 'track-sub-1',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        startFrames: 0,
        durationFrames: 60,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Welcome to this video',
        colorLabel: 'violet',
        overrides: [],
        effects: {
          text: {
            text: 'Welcome to this video',
            fontSizePx: 44,
            colorHex: '#ffffff',
            align: 'center',
            positionPct: { x: 0.5, y: 0.88 },
            anchor: 'bottom',
            preset: 'caption',
          },
        },
      },
    ];

    it('translates in-place (replace_in_place)', () => {
      const updated = translateSubtitleClips(mockClips, {
        targetLang: 'es',
        mode: 'replace_in_place',
      });

      expect(updated.length).toBe(1);
      expect(updated[0].effects?.text?.text).toBe('Bienvenidos a este video');
      expect(updated[0].label).toBe('Bienvenidos a este video');
      expect(updated[0].id).toBe(mockClips[0].id);
    });

    it('generates dual bilingual subtitles (dual_bilingual)', () => {
      const updated = translateSubtitleClips(mockClips, {
        targetLang: 'es',
        mode: 'dual_bilingual',
        bilingualLayout: 'stacked',
      });

      expect(updated.length).toBe(1);
      expect(updated[0].effects?.text?.text).toBe(
        'Welcome to this video\nBienvenidos a este video',
      );
      expect(updated[0].label).toBe(
        'Welcome to this video\nBienvenidos a este video',
      );
    });

    it('duplicates subtitles to a new dedicated track (duplicate_new_track)', () => {
      const cloned = translateSubtitleClips(mockClips, {
        targetLang: 'es',
        mode: 'duplicate_new_track',
        targetTrackId: 'track-sub-es',
        secondaryColorHex: '#fef08a',
        secondaryFontScale: 0.8,
      });

      expect(cloned.length).toBe(1);
      expect(cloned[0].trackId).toBe('track-sub-es');
      expect(cloned[0].id).not.toBe(mockClips[0].id); // New UUID
      expect(cloned[0].effects?.text?.text).toBe('Bienvenidos a este video');
      expect(cloned[0].effects?.text?.colorHex).toBe('#fef08a');
      expect(cloned[0].effects?.text?.fontSizePx).toBe(Math.round(44 * 0.8));
    });

    it('throws error when duplicate_new_track is requested without targetTrackId', () => {
      expect(() =>
        translateSubtitleClips(mockClips, {
          targetLang: 'es',
          mode: 'duplicate_new_track',
        }),
      ).toThrowError(/targetTrackId is required/);
    });
  });
});
