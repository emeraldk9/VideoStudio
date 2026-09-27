# Milestone S105: Whiteboard Kinetic Typography & Direct Calligraphic Font Stroke Skeletonizer

## 1. Context & Motivation
Whiteboard explainer videos and educational documentaries frequently feature hand-written text: titles, key concepts, formulas, lists, and dialogue captions. Currently, text on the whiteboard is revealed through raster serpentine wipes or outline edge tracing.

To produce authentic, professional whiteboard handwriting:
1. **Direct Font Stroke Skeletonization / Medial Axis Extraction**:
   - Extract single-stroke centerline trajectories from font outlines and letterforms, avoiding dual-outline rendering.
2. **Kinetic Handwriting Cadence & Micro-Pauses**:
   - Realistic stroke timing that slows down on intricate curves/loops (e.g. cursive loops, dots on 'i', crossbars on 't') and accelerates on straight downstrokes.
   - Natural micro-pauses at whitespace and punctuation marks (periods, commas, question marks).
3. **Cursive Ligatures & Organic Pen Travel**:
   - Smooth pen-up transition leaps between characters and continuous connected strokes for cursive typography.
   - Dynamic synchronization with the physical hand stylus (S103), foley sound synthesis (S91), and ink pooling (S101).

---

## 2. Architecture & Design

### Phase 1: Python Engine (`scripts/core/kinetic_typography.py`)
1. Data Structures:
   - `GlyphStroke`: Points representing a single pen stroke in a glyph.
   - `KineticTextPackage`: Container of ordered glyph strokes with calculated timing timestamps and pen-up travel trajectories.
2. Direct Skeletonization & Centerline Extraction:
   - Morphological thinning (Zhang-Suen / medial axis) on high-contrast rasterized glyph bitmaps or direct vector path centerline approximations.
   - Continuous 8-connected stroke graph tracing into ordered `(x, y)` paths.
3. Natural Handwriting Timing Model:
   - Variable write speed based on stroke curvature $\kappa$:
     $$v(t) = v_{\text{base}} \cdot \frac{1}{1 + \alpha |\kappa|}$$
   - Micro-pauses: 120ms at word boundaries, 250ms at commas, 450ms at sentence ends.
4. Python Verification:
   - Standalone **Test 26** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/kinetic-typography-ops.ts`:
   - Data structures: `KineticTextSettings`, `GlyphKineticStroke`, `KineticTextLayout`.
   - Pure functions:
     - `computeKineticGlyphTiming(text, options)`: generates sequential per-character stroke timestamps and pauses.
     - `applyHandwritingJitter(points, intensity, seed)`: simulates micro-variations of human motor hand tremor.
     - `generateKineticTextSvg(layout)`: serializes kinetic text layout to SVG paths with stroke-dasharray animations.
2. Unit Tests:
   - `src/shared/utils/timeline/__tests__/kinetic-typography-ops.test.ts`.
3. Schema & Settings:
   - Extend `WhiteboardSettings` & `clipEffectsSchema`:
     ```ts
     kineticTypography?: {
       enabled?: boolean;
       letterCadenceMs?: number; // 40..500 ms per letter
       punctuationPauseMs?: number; // 50..1000 ms
       cursiveLigatures?: boolean;
       handwritingJitter?: number; // 0..1
     };
     ```
   - Export through `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- Add "Kinetic Handwriting & Text Typography" section in Card 1 (Writing & Text Reveal) of `src/renderer/features/timeline-media/ui/SketchPane.tsx`:
  - Handwriting Cadence slider (Fast / Natural / Deliberate).
  - Punctuation Pause slider.
  - Organic Handwriting Jitter slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 26/26 pass). -> **PASS: 26/26 passed**.
- Run `npx tsc --noEmit` (ensure exit code 0). -> **PASS: Clean exit code 0**.
- Run `npm test` across all 89 test files (ensure 1000+ tests pass). -> **PASS: 89/89 test files passed (1,006 tests passed)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- Python Engine: `scripts/core/kinetic_typography.py` with `GlyphStroke`, `KineticTextPackage`, `_compute_curvature`, and `skeletonize_text_layout`.
- Test Suite: Test 26 in `scripts/test_engine.py` (**26/26 passed**).
- TypeScript Operations: `src/shared/utils/timeline/kinetic-typography-ops.ts` with `calculateCharacterPause`, `applyHandwritingJitter`, `scheduleKineticStrokeCadence`, and `generateKineticTypographySvg`.
- Unit Tests: `src/shared/utils/timeline/__tests__/kinetic-typography-ops.test.ts` (**3/3 passed**).
- Schema & Settings: Extended `WhiteboardSettings` & `clipEffectsSchema` with `kineticTypography`.
- UI: Card 1 (Serpentine Writing) in `SketchPane.tsx` with Kinetic Handwriting Flow toggle, Letter Cadence slider, Punctuation Pause slider, Cursive Ligatures checkbox, and Motor Tremor Jitter slider.

