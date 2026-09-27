import { describe, it, expect } from 'vitest';
import {
  detectScriptDirection,
  isRtlCodepoint,
  isDiacriticCodepoint,
  computeBidiCarriageReturn,
  reorderBidiGlyphStrokes,
} from '../bidi-writing-ops';
import type { Point2D } from '../calligraphy-ops';

describe('bidi-writing-ops', () => {
  it('detects RTL, LTR, and neutral script directions', () => {
    expect(detectScriptDirection('مرحبا بالعالم')).toBe('rtl');
    expect(detectScriptDirection('שלום עולם')).toBe('rtl');
    expect(detectScriptDirection('Whiteboard Studio')).toBe('ltr');
    expect(detectScriptDirection('12345 67890')).toBe('neutral');
  });

  it('identifies RTL and diacritic codepoints correctly', () => {
    expect(isRtlCodepoint('ب'.charCodeAt(0))).toBe(true);
    expect(isRtlCodepoint('ש'.charCodeAt(0))).toBe(true);
    expect(isRtlCodepoint('A'.charCodeAt(0))).toBe(false);

    // Diacritics
    expect(isDiacriticCodepoint(0x064e)).toBe(true); // Arabic Fathah
    expect(isDiacriticCodepoint(0x05b8)).toBe(true); // Hebrew Qamats
    expect(isDiacriticCodepoint('b'.charCodeAt(0))).toBe(false);
  });

  it('computes right-aligned carriage returns for RTL scripts', () => {
    const rtlReturn = computeBidiCarriageReturn(1, 80, 1920, 'rtl', 100);
    expect(rtlReturn[0]).toBe(1820); // 1920 - 100
    expect(rtlReturn[1]).toBe(2 * 80 + 100);

    const ltrReturn = computeBidiCarriageReturn(1, 80, 1920, 'ltr', 100);
    expect(ltrReturn[0]).toBe(100);
    expect(ltrReturn[1]).toBe(2 * 80 + 100);
  });

  it('reorders word strokes deferring diacritics in two-pass handwriting', () => {
    const rawStrokes = [
      {
        char: 'ب', // Base letter
        points: [
          [100, 100],
          [120, 100],
        ] as Point2D[],
      },
      {
        char: '\u064E', // Fathah diacritic
        points: [
          [110, 130],
          [112, 132],
        ] as Point2D[],
      },
      {
        char: 'ت', // Base letter
        points: [
          [120, 100],
          [150, 100],
        ] as Point2D[],
      },
    ];

    const reordered = reorderBidiGlyphStrokes(rawStrokes, { deferDiacritics: true });
    expect(reordered.length).toBe(3);
    // Base strokes first, diacritic last
    expect(reordered[0].char).toBe('ب');
    expect(reordered[1].char).toBe('ت');
    expect(reordered[2].char).toBe('\u064E');
  });
});
