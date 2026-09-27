/**
 * Whiteboard Multi-Language Bidirectional (BiDi) RTL Writing & Diacritic Scheduling Operations.
 * Detects RTL scripts (Arabic, Hebrew, Persian, Urdu), manages right-aligned carriage returns,
 * and schedules authentic two-pass cursive handwriting (base rasm skeleton first, dots/diacritics second).
 */

import type { Point2D } from './calligraphy-ops';

export type ScriptDirection = 'auto' | 'ltr' | 'rtl' | 'vertical' | 'neutral';

export interface BidiWritingSettings {
  direction?: ScriptDirection;
  deferDiacritics?: boolean; // default true for authentic Arabic/Hebrew calligraphy
  diacriticDelayMs?: number; // micro-pause before dotting, default 80ms
}

/**
 * Checks whether a Unicode codepoint belongs to a Right-to-Left script.
 */
export function isRtlCodepoint(cp: number): boolean {
  return (
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0x08a0 && cp <= 0x08ff) || // Arabic Extended-A
    (cp >= 0xfb1d && cp <= 0xfb4f) || // Hebrew Presentation Forms
    (cp >= 0xfb50 && cp <= 0xfdff) || // Arabic Presentation Forms-A
    (cp >= 0xfe70 && cp <= 0xfeff)    // Arabic Presentation Forms-B
  );
}

/**
 * Checks whether a character codepoint is an Arabic Tashkeel, Hebrew Niqqud, or combining diacritic.
 */
export function isDiacriticCodepoint(cp: number): boolean {
  // Arabic Tashkeel / Harakat (Fathah, Dammah, Kasrah, Sukun, Shaddah, Tanwin)
  if ((cp >= 0x064b && cp <= 0x065f) || cp === 0x0670 || (cp >= 0x06d6 && cp <= 0x06ed)) {
    return true;
  }
  // Hebrew Niqqud
  if ((cp >= 0x0591 && cp <= 0x05bd) || cp === 0x05bf || cp === 0x05c1 || cp === 0x05c2 || cp === 0x05c4 || cp === 0x05c5 || cp === 0x05c7) {
    return true;
  }
  // Combining Diacritical Marks
  if (cp >= 0x0300 && cp <= 0x036f) {
    return true;
  }
  return false;
}

/**
 * Detects the predominant script direction of a text string.
 */
export function detectScriptDirection(text: string): ScriptDirection {
  let rtlCount = 0;
  let ltrCount = 0;

  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (isRtlCodepoint(cp)) {
      rtlCount++;
    } else if ((cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122) || (cp >= 0x0400 && cp <= 0x04ff)) {
      ltrCount++;
    }
  }

  if (rtlCount > ltrCount) return 'rtl';
  if (ltrCount > 0) return 'ltr';
  return 'neutral';
}

/**
 * Computes carriage return jump coordinates for next line based on script direction.
 */
export function computeBidiCarriageReturn(
  lineIndex: number,
  lineHeight: number,
  frameWidth: number = 1920,
  direction: ScriptDirection = 'ltr',
  marginPx: number = 120
): Point2D {
  const y = (lineIndex + 1) * lineHeight + marginPx;
  if (direction === 'rtl') {
    // Return to the right margin
    return [frameWidth - marginPx, y];
  }
  // Return to the left margin
  return [marginPx, y];
}

/**
 * Reorders glyph strokes within words/tokens so base connected strokes
 * are drawn first, followed by precision placement of diacritic marks and dots.
 */
export function reorderBidiGlyphStrokes<T extends { points: Point2D[]; char: string }>(
  strokes: T[],
  options: BidiWritingSettings = {}
): T[] {
  const deferDiacritics = options.deferDiacritics ?? true;
  if (!deferDiacritics || strokes.length <= 1) {
    return strokes.slice();
  }

  // Tokenize into words
  const tokens: T[][] = [];
  let currentToken: T[] = [];

  for (const s of strokes) {
    if (s.char === ' ' || s.char === '\t' || s.char === '\n') {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = [];
      }
      tokens.push([s]); // Space token
    } else {
      currentToken.push(s);
    }
  }
  if (currentToken.length > 0) {
    tokens.push(currentToken);
  }

  const result: T[] = [];

  for (const token of tokens) {
    if (token.length <= 1) {
      result.push(...token);
      continue;
    }

    const baseStrokes: T[] = [];
    const diacritics: T[] = [];

    for (const s of token) {
      const isDiacritic = s.char.length > 0 && isDiacriticCodepoint(s.char.charCodeAt(0));
      if (isDiacritic) {
        diacritics.push(s);
      } else {
        baseStrokes.push(s);
      }
    }

    // Base cursive skeleton first, then dots/vowels
    result.push(...baseStrokes, ...diacritics);
  }

  return result;
}
