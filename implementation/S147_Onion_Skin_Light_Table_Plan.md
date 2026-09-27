# Milestone S147: Multi-Layer Animation Onion Skinning & Light Table Backlighting

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
In classic 2D hand-drawn animation, traditional animators rely on a translucent **light table** with frosted-glass backlighting to compare current poses against adjacent frames:
1. **Multi-Frame Onion Skinning**:
   - Prior frames ($k < 0$) are rendered with a cool cyan/blue tint and geometric falloff:
     $$\alpha_{\text{past}}(k) = \alpha_0 \cdot \gamma_{\text{falloff}}^{|k| - 1}$$
   - Upcoming future frames ($k > 0$) are rendered with a warm amber/orange tint:
     $$\alpha_{\text{future}}(k) = \alpha_0 \cdot \gamma_{\text{falloff}}^{k - 1}$$
   - Current frame ($k = 0$) remains 100% opaque solid ink.
2. **Backlit Frosted Glass Light Table Substrate**:
   - Radial luminescence diffusion simulating under-table lamp glow shining through stacked vellum sheets.
3. **Acme Standard Animation Peg Bar Registration**:
   - Acme 3-hole registration peg system (round center pin and twin horizontal slotted outer pins) maintaining sub-millimeter frame alignment.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/onion_skin_light_table_engine.py`)
1. Data Structures:
   - `OnionSkinLightTableConfig`: enabled, past_frames_count (1-5), future_frames_count (1-5), base_opacity (0.1-0.9), opacity_falloff_gamma (0.3-0.95), past_tint_bgr, future_tint_bgr, light_table_intensity, frosted_diffusion_px, peg_bar_enabled.
2. Core Algorithms:
   - `compute_onion_frame_alpha(offset, config) -> float`
   - `generate_light_table_substrate(width, height, config) -> np.ndarray`
   - `composite_onion_skin_stack(frame_layers, current_idx, config) -> np.ndarray`
   - `render_peg_bar(canvas, width, config) -> np.ndarray`
3. Python Unit Test 68 in `scripts/test_engine.py`:
   - Validates past/future frame alpha attenuation and chromatic color separation.
   - Validates light table substrate illumination generation.
   - Validates peg bar registration pins.
   - Validates multi-layer composited canvas output.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/onion-skin-light-table-ops.ts`:
   - Pure functions for frame alpha attenuation, chromatic tint resolution, SVG peg bar markup generation, CSS light table background gradient, and config validation.
2. Unit Tests: `src/shared/utils/timeline/__tests__/onion-skin-light-table-ops.test.ts`:
   - 12 comprehensive unit tests covering chromatic tinting, exponential falloff, Acme peg pin geometry, and config domain clamping.
3. Schema & Exports:
   - Added `onionSkinLightTable` to `WhiteboardSettings` in `whiteboard.ts` and `clipEffectsSchema.whiteboard` in `effects.ts`.
   - Exported from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Added dedicated Onion Skinning & Light Table panel in Card 3 of `SketchPane.tsx`:
  - Toggle switch: "Onion Skinning & Light Table".
  - Sliders:
    - Past Frames Visible [1 to 5 frames]
    - Future Frames Visible [1 to 5 frames]
    - Base Ghost Opacity [10% to 80%]
    - Opacity Attenuation Gamma [0.3 to 0.9]
    - Light Table Backlight Intensity [0% to 100%]
  - Toggle switch: "Animation Peg Bar Registration".

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 68 added to `scripts/test_engine.py` and passes cleanly (**68/68 tests passing**).
2. VideoStudio:
   - `onion-skin-light-table-ops.test.ts` passes 100% (12/12 tests).
   - Full Vitest suite passes (**131/131 files, 1,273/1,273 tests**).
   - `tsc --noEmit` exits with 0 errors.

