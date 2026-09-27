# Milestone S94: Stroke Decimation, Ramer-Douglas-Peucker (RDP) Simplification, Corner Snapping & Dynamic Bézier Smoothing Engine

## 1. Context & Motivation
In both the Python whiteboard engine (`srt-whiteboard-animation-main`) and VideoStudio's timeline sketch system (`VideoStudio`), stroke paths traced from raster line drawings via skeletonization contain raw 1-pixel-step vertex sequences. A typical 1080p line drawing yields 80,000–250,000 discrete coordinates.

### Current Deficiencies:
1. **High-Frequency Directional Jitter**: Point-to-point discrete grid steps ($0^\circ, 45^\circ, 90^\circ, 135^\circ$) create noisy instantaneous velocity angles ($\theta = \text{atan2}(\Delta y, \Delta x)$), making the virtual drawing hand and pen nib visibly tremble during rendering.
2. **Foley Audio Spikes**: Discrete point steps produce erratic $\Delta d / \Delta t$ velocity spikes, leading to buzzing/crackling in procedural friction sound generation.
3. **Overhead in VideoStudio Preview & Serialization**: Serializing raw pixel point lists into `.annotation.json` results in multi-megabyte payloads that stall timeline scrubbing and JSON parsing.

---

## 2. Architecture & Design

### Phase 1: Python Engine Core Simplification & Smoothing (`scripts/core/stroke_smoother.py`) [COMPLETE]
1. **Ramer-Douglas-Peucker (RDP) Vector Decimation**: [DONE]
   - Built `ramer_douglas_peucker` with recursive perpendicular distance computation.
2. **Corner Snapping & Critical Landmark Preservation**: [DONE]
   - Built `detect_corner_indices` and `simplify_stroke` ensuring sharp turning angles ($\ge 55^\circ$) are strictly preserved as immutable vertices.
3. **Catmull-Rom to Cubic Bézier Spline Fitting**: [DONE]
   - Built `fit_catmull_rom_to_bezier`, `sample_bezier_segment`, and `sample_smooth_trajectory` with continuous analytical tangent angles ($\theta = \text{atan2}(v_y, v_x)$).
4. **Integration into Skeleton Pipeline (`render_stream_whiteboard.py`)**: [DONE]
   - Integrated `simplify_stroke(pts, epsilon=1.2, corner_angle_deg=55.0)` into `_region_skeleton_strokes`.

### Phase 2: Python Unit & Integration Verification (`test_engine.py`) [COMPLETE]
- Added **Test 15** in `scripts/test_engine.py`: [PASS]
  - Verified RDP reduction ratio $\ge 75\%$ (achieving $> 85\%$ on raster skeletons).
  - Verified $90^\circ$ sharp corner retention without degradation.
  - Verified Catmull-Rom spline trajectory generation with continuous tangents and no NaN values.
  - Test suite result: **15/15 tests passing**.

### Phase 3: VideoStudio Timeline & Shared Types Integration [COMPLETE]
1. **Shared Types (`src/shared/utils/timeline/whiteboard.ts` & `effects.ts`)**: [DONE]
   - Extended `WhiteboardSettings` with `strokeSmoothing` and `simplifyTolerance`.
   - Updated `clipEffectsSchema` in `effects.ts`.
2. **Zero-Dependency TypeScript RDP & Catmull-Rom Spline Engine (`src/shared/utils/timeline/stroke-smoother-ops.ts`)**: [DONE]
   - High-performance, pure TypeScript implementation of RDP decimation, corner snapping, and Catmull-Rom Bézier spline sampling.
   - Built comprehensive unit test suite in `src/shared/utils/timeline/__tests__/stroke-smoother-ops.test.ts` (**6/6 tests passing**).
3. **UI Integration in `SketchPane.tsx`**: [DONE]
   - Added Stroke Smoothing (`none` / `subtle` / `smooth` / `high`) segmented control and Corner Precision slider in Card 1.

### Phase 4: Full Test Suite & End-to-End Validation [COMPLETE]
- Python test suite: `scripts/test_engine.py` (**15/15 pass**).
- VideoStudio typecheck: `npx tsc --noEmit` (**0 errors**).
- VideoStudio unit test suite: `npx vitest run` (**78/78 test files, 965/965 tests passing**).

---

### Milestone Completion Summary
- **Status**: **100% COMPLETE & VERIFIED**
- **Artifacts**:
  - `scripts/core/stroke_smoother.py`
  - `scripts/render_stream_whiteboard.py`
  - `scripts/test_engine.py` (Test 15)
  - `src/shared/utils/timeline/stroke-smoother-ops.ts`
  - `src/shared/utils/timeline/__tests__/stroke-smoother-ops.test.ts`
  - `src/shared/utils/timeline/whiteboard.ts`
  - `src/shared/utils/timeline/effects.ts`
  - `src/renderer/features/timeline-media/ui/SketchPane.tsx`

