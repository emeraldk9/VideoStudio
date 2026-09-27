# Milestone S133: Whiteboard Multi-Color Pen Ribbon Blending & Gradient Transition Wash

## 1. Context & Motivation
When artists or educators transition between colors along an unbroken line (or blend intersecting marker strokes), physical felt-tip markers exhibit natural capillary color washing:
1. **Porous Nib Pigment Washout**:
   - As ink flow shifts from color $C_1$ to color $C_2$, the residual dye in the porous fiber nib gradually dissipates over a transition arc-length $L_{\text{wash}}$ ($20 - 80$ px).
2. **Perceptual Color Interpolation (OKLab)**:
   - Interpolating in naive sRGB creates muddy, desaturated brownish/grayish tones in intermediate regions (e.g. blue to yellow creating dull gray instead of vibrant green).
   - Performing color washing in perceptual OKLab space ensures physically authentic, vibrant chromatic transitions.
3. **Continuous Ribbon Mesh Rendering**:
   - Decomposes the stroke path into a 2D ribbon mesh where each vertex quad carries interpolated color attributes, enabling export to both Python OpenCV raster pipelines and VideoStudio SVG/Canvas renderer.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/gradient_wash_ribbon_engine.py`)
1. Data Structures:
   - `ColorStop`: `(offset_t: float, color_bgr: Tuple[int, int, int])`
   - `GradientRibbonQuad`: `v0, v1, v2, v3: Tuple[float, float]`, `color_start_bgr`, `color_end_bgr`
   - `GradientWashConfig`:
     - `enabled: bool = True`
     - `wash_length_px: float = 45.0`
     - `color_space: str = 'oklab'`
     - `dither_noise: float = 0.05`
2. Core Algorithms:
   - `srgb_to_oklab(bgr) -> (L, a, b)` and `oklab_to_srgb(L, a, b) -> bgr`:
     - Perceptually uniform color conversion.
   - `interpolate_perceptual_color(c1, c2, t) -> bgr`:
     - Linear interpolation in OKLab with clamped sRGB output.
   - `build_gradient_wash_ribbon(points, color_transitions, base_width, wash_length_px) -> List[GradientRibbonQuad]`:
     - Calculates cumulative stroke distance, normal expansion vectors, and color transitions over $L_{\text{wash}}$.
   - `render_gradient_wash_stroke(canvas, ribbon_quads) -> np.ndarray`:
     - Sub-segment rendering onto canvas substrate.
3. Automated Unit Test:
   - **Test 54** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/gradient-wash-ribbon-ops.ts`:
   - Pure functions:
     - `hexToRgb`, `rgbToHex`
     - `interpolatePerceptualColor(colorA: string, colorB: string, t: number): string`
     - `computeGradientRibbonMesh(points: Point[], colorTransitions: ColorTransition[], strokeWidth: number, washLengthPx: number): GradientRibbonMesh`
     - `generateGradientRibbonSvgDefs(mesh: GradientRibbonMesh): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/gradient-wash-ribbon-ops.test.ts`.
3. Schema & Exports:
   - Add `GradientWashSettings` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Add `gradientWash` to `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Multi-Color Pen Ribbon Blending & Gradient Wash" controls:
    - Enabled toggle.
    - Wash Transition Length slider ($10 - 150$ px).
    - Secondary Accent Color picker.
    - Perceptual OKLab Blending switch.
    - Micro-Dither Texture slider ($0 - 20\%$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Standalone Test 54 passes in `scripts/test_engine.py` (**54/54 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with **117/117 test files** and **1,120/1,120 tests green**.
   - 9 unit tests in `src/shared/utils/timeline/__tests__/gradient-wash-ribbon-ops.test.ts` passing.
3. UI Integration:
   - Card 3 controls fully interactive and synced with clip settings.
4. Documentation:
   - `walkthrough.md` updated with Milestone S133.

---

## 4. Status: COMPLETED (Verified 100%)
- Python engine: `scripts/core/gradient_wash_ribbon_engine.py` (verified in Test 54)
- VideoStudio ops: `src/shared/utils/timeline/gradient-wash-ribbon-ops.ts`
- Tests: `src/shared/utils/timeline/__tests__/gradient-wash-ribbon-ops.test.ts` (9/9 passing)
- Schema: `WhiteboardSettings.gradientWash` and `clipEffectsSchema.whiteboard.gradientWash`
- UI: `SketchPane.tsx` Card 3 Ribbon Blending & Gradient Wash controls
- Full suite: 54/54 Python tests & 1,120/1,120 Vitest tests green!
