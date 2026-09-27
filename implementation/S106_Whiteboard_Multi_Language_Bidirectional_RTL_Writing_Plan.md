# Milestone S106: Whiteboard Multi-Language Bidirectional RTL Writing & Diacritic Pen Scheduling

## 1. Context & Motivation
Whiteboard animation is used globally across international languages. While Western scripts (Latin, Greek, Cyrillic) flow Left-to-Right (LTR), major world languages—including **Arabic, Hebrew, Persian (Farsi), Urdu, and Sindhi**—write Right-to-Left (RTL). Furthermore, Arabic and Hebrew calligraphy features extensive **diacritic marks** (dots/I'jam, vowels/Tashkeel/Harakat, and Niqqud).

In authentic human handwriting of RTL and Semitic scripts:
1. **Right-to-Left Writing Flow & Carriage Alignment**:
   - The writing hand moves from the right margin towards the left margin.
   - Carriage returns jump to the right side of the next line.
2. **Deferred Diacritic Placement (Two-Pass Handwriting)**:
   - Calligraphers write the connected cursive word skeleton (the Rasm) first.
   - Only after finishing the base word skeleton or syllable does the pen lift to place dots (Nuqāt) and vowel diacritics (Harakat/Tashkeel).
3. **Vertical Writing for East Asian Calligraphy**:
   - Top-to-bottom column progression advancing from right to left (Tategaki).

Milestone S106 integrates native bidirectional script detection, RTL stroke inversion, and deferred diacritic scheduling across both the Python core engine and the VideoStudio timeline.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/bidi_writing_engine.py`)
1. Script & Direction Detection:
   - Unicode block inspection:
     - Arabic: `0x0600 - 0x06FF`, `0x0750 - 0x077F`, `0x08A0 - 0x08FF`
     - Hebrew: `0x0590 - 0x05FF`
     - East Asian Vertical: CJK Unified Ideographs `0x4E00 - 0x9FFF`
2. Diacritic Classification:
   - Identifying combining characters and small auxiliary marks (dots, accents, vowels).
3. Deferred Stroke Scheduling:
   - Separates strokes into `base_strokes` and `diacritic_strokes`.
   - Orders: base cursive ligature path -> pen-up transition -> precision dot/diacritic placement.
4. Python Verification:
   - Standalone **Test 27** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/bidi-writing-ops.ts`:
   - Data models: `BidiWritingSettings`, `BidiStrokeOrderResult`, `ScriptDirection`.
   - Pure functions:
     - `detectScriptDirection(text: string): ScriptDirection`
     - `isDiacriticCodepoint(code: number): boolean`
     - `scheduleBidiGlyphStrokes(strokes, text, options)`
2. Unit Tests:
   - `src/shared/utils/timeline/__tests__/bidi-writing-ops.test.ts`.
3. Schema & Settings:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `bidiWriting`:
     ```ts
     bidiWriting?: {
       direction?: 'auto' | 'ltr' | 'rtl' | 'vertical';
       deferDiacritics?: boolean;
       diacriticDelayMs?: number;
     };
     ```
   - Export through `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- Add "Script Direction & Diacritic Scheduling" in Card 1 (Serpentine / Kinetic Writing) of `src/renderer/features/timeline-media/ui/SketchPane.tsx`:
  - Script Direction: Auto / LTR / RTL / Vertical.
  - Deferred Diacritics toggle: "Two-pass cursive (dots after word)".
  - Diacritic Placement Delay slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 27/27 pass). -> **PASS: 27/27 passed**.
- Run `npx tsc --noEmit` (ensure exit code 0). -> **PASS: Clean exit code 0**.
- Run `npm test` across all 90 test files (ensure all 1009+ tests pass). -> **PASS: 90/90 test files passed (1,010 tests passed)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- Python Engine: `scripts/core/bidi_writing_engine.py` with `is_rtl_codepoint`, `is_diacritic_char`, `detect_text_direction`, and `reorder_bidi_strokes`.
- Test Suite: Test 27 in `scripts/test_engine.py` (**27/27 passed**).
- TypeScript Operations: `src/shared/utils/timeline/bidi-writing-ops.ts` with `detectScriptDirection`, `isRtlCodepoint`, `isDiacriticCodepoint`, `computeBidiCarriageReturn`, and `reorderBidiGlyphStrokes`.
- Unit Tests: `src/shared/utils/timeline/__tests__/bidi-writing-ops.test.ts` (**4/4 passed**).
- Schema & Settings: Extended `WhiteboardSettings` & `clipEffectsSchema` with `bidiWriting`.
- UI: Card 1 (Serpentine Writing) in `SketchPane.tsx` with Script Direction segmented control (Auto / LTR / RTL) and Two-Pass Cursive Diacritics checkbox.

