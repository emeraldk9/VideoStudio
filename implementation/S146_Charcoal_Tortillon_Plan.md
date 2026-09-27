# Milestone S146: Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
Traditional dry drawing media (vine charcoal, willow sticks, compressed charcoal, conte crayons) deposit loose, friable carbon powder particles onto the micro-peaks of paper grain. Artists use paper blending stumps (tortillons) to burnish, blend, and drag this powder into the paper tooth valleys, creating soft atmospheric chiaroscuro gradients, smoky sfumato transitions, and directional tone modeling.

Milestone S146 introduces:
1. **Friable Powder Deposition Map**:
   - Computes surface powder density as a function of pressure and paper grain tooth height $H_{\text{tooth}}(x, y)$.
2. **Tortillon Blending Stump Contact Dynamics**:
   - Models elliptical stump tip footprint, tip firmness / hardness $K_{\text{stump}} \in [0.1, 0.9]$, and directional drag vectors.
3. **Powder Migration & Valley Burnishing Physics**:
   - Picks up loose particulate powder from ridges and redistributes it downstream into tooth valleys, compressing tone contrast.
4. **Directional Gaussian Sfumato Diffusion**:
   - Anisotropic blending along tortillon stroke trajectory with configurable blend radius and pressure-sensitive opacity.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/charcoal_tortillon_engine.py`)
1. Data Structures:
   - `CharcoalTortillonConfig`: enabled, media_type ('vine_charcoal', 'compressed_charcoal', 'conte_crayon'), powder_friability, stump_hardness, blend_radius_px, burnish_depth.
   - `PowderSample`: position, density, is_burnished.
2. Core Algorithms:
   - `generate_paper_tooth_map(width, height, seed) -> np.ndarray`
   - `deposit_friable_powder(stroke_points, pressures, tooth_map, config) -> np.ndarray`
   - `simulate_tortillon_burnish(powder_map, stump_path, stump_pressures, tooth_map, config) -> np.ndarray`
   - `render_charcoal_tortillon_composite(canvas, powder_map, config) -> np.ndarray`
3. Python Unit Test 67 in `scripts/test_engine.py`:
   - Validates powder deposition on tooth peaks.
   - Validates tortillon stump pickup and downstream redistribution.
   - Validates valley burnishing and contrast softening.
   - Validates canvas rasterization.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/charcoal-tortillon-ops.ts`:
   - Pure mathematical functions for powder distribution, tortillon smudge pickup/deposition, tooth valley filling, and parameter validation.
2. Unit Tests: `src/shared/utils/timeline/__tests__/charcoal-tortillon-ops.test.ts`:
   - 12 comprehensive unit tests covering media friability, stump hardness, burnish depth, directional drag, and config clamping.
3. Schema & Exports:
   - Added `charcoalTortillon` to `WhiteboardSettings` in `whiteboard.ts` and `clipEffectsSchema.whiteboard` in `effects.ts`.
   - Exported from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Added dedicated Charcoal & Tortillon Blending panel in Card 3 of `SketchPane.tsx`:
  - Toggle switch: "Charcoal & Tortillon Stump Blending".
  - Segmented control: Media Type (Vine, Compressed, Conte).
  - Sliders:
    - Media Powder Friability [0.1 to 1.0]
    - Tortillon Stump Hardness [0.1 to 0.9]
    - Stump Blending Radius [2 to 25 px]
    - Tooth Valley Burnish Depth [0.1 to 1.0]

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 67 added to `scripts/test_engine.py` and passes cleanly (**67/67 tests passing**).
2. VideoStudio:
   - `charcoal-tortillon-ops.test.ts` passes 100% (12/12 tests).
   - Full Vitest suite passes (**130/130 files, 1,261/1,261 tests**).
   - `tsc --noEmit` exits with 0 errors.

