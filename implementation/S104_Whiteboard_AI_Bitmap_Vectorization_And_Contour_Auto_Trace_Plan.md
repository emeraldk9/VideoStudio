# Milestone S104: Whiteboard AI Bitmap Vectorization & Contour Auto-Trace Engine

## 1. Context & Motivation
Currently, whiteboard sketch animation operates either on pre-authored SVG vector paths (Milestone S89) or raster skeletonization (Milestone S87). When users import arbitrary raster logos, hand-drawn sketches, scanned diagrams, or still photographs, converting them into resolution-independent, clean vector Bézier paths with semantic role classification (`outer_contour`, `inner_detail`, `hatch_candidate`) enables:
1. **Resolution-Independent Infinite Scaling**:
   - Clean vector polylines and Bézier curves render without raster pixelation even under 4K zoom-ins (Milestone S100).
2. **Topological Feature Classification**:
   - Boundary contours vs. interior structural details vs. fine texture lines.
3. **Seamless Hand Stylus Guiding**:
   - Continuous vector paths feed directly into our dynamic calligraphy brush (S97) and saliency clusterer (S98).

Milestone S104 implements an automated bitmap-to-vector contour extraction and spline fitting pipeline across Python and TypeScript.

---

### Objectives:
1. **Python Core Engine (`scripts/core/bitmap_vectorizer.py`)**:
   - Adaptive Otsu / local contrast binarization.
   - Moore-Neighbor boundary tracing & topological hole detection.
   - Corner snapping & smooth Catmull-Rom / Bézier spline fitting.
   - Verification in `scripts/test_engine.py`: **Test 25**.
2. **VideoStudio Timeline & UI Operations**:
   - `src/shared/utils/timeline/bitmap-vectorizer-ops.ts`: Zero-dependency TypeScript implementation of radial grid contour walking and vector path conversion.
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with:
     ```ts
     autoTrace?: {
       enabled?: boolean;
       threshold?: number; // 0..255 (0 = auto-Otsu)
       minPathLength?: number; // 5..100 px
       cornerTolerance?: number; // 0.5..5.0
     }
     ```
   - Add Auto-Trace & Edge Vectorization controls into Card 1 of `SketchPane.tsx`.
   - Unit tests: `src/shared/utils/timeline/__tests__/bitmap-vectorizer-ops.test.ts`.
3. **Verification**:
   - All 25/25 Python engine tests passing.
   - All 88/88 VideoStudio test files passing with clean `tsc --noEmit`.

---

## 2. Architecture & Design

### Phase 1: Python Engine Implementation (`scripts/core/bitmap_vectorizer.py`)
1. Multi-scale binarization:
   - Convert image to grayscale, apply bilateral smoothing, extract adaptive contours via OpenCV `findContours` with `RETR_TREE` hierarchy.
2. Arc-length pruning & polygon approximation:
   - Apply `approxPolyDP` with configurable $\epsilon$.
3. Standalone Test 25 in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/bitmap-vectorizer-ops.ts`:
   - `traceBitmapContours(pixels, width, height, options)`
   - `simplifyContourToVectorPaths(contours, tolerance)`
2. Update `WhiteboardSettings` and `clipEffectsSchema`.
3. Unit tests: `src/shared/utils/timeline/__tests__/bitmap-vectorizer-ops.test.ts`.

### Phase 3: VideoStudio UI in `SketchPane.tsx`
- Add "Auto-Trace Bitmap to Vectors" section in Card 1.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 25/25 pass). -> **PASS: 25/25 passed**.
- Run `npx tsc --noEmit` -> **PASS: Clean exit code 0**.
- Run `npm test` across all test files -> **PASS: 88/88 test files passed (1,003 tests passed)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- Python: `scripts/core/bitmap_vectorizer.py` + `scripts/test_engine.py` Test 25.
- TypeScript: `src/shared/utils/timeline/bitmap-vectorizer-ops.ts` + `src/shared/utils/timeline/__tests__/bitmap-vectorizer-ops.test.ts` (7/7 unit tests).
- Schema & Settings: `WhiteboardSettings` & `clipEffectsSchema` extended with `autoTrace`.
- UI: Card 1 Line-Art Sketch / Trace section in `SketchPane.tsx` with Contour Auto-Trace toggle, Auto-Otsu binarization slider, and Corner Tolerance precision slider.

