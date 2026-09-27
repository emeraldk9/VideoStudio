# Milestone S113: Whiteboard Layered Depth-of-Field (DoF) Optical Bokeh & Defocus Hand Blur
**Status: Complete (100% Verified)**
- Python tests: **34/34 passed** (including Test 34 for optical depth-of-field bokeh and hand defocus)
- VideoStudio tests: **97/97 test files passed, 1,033/1,033 tests passed**
- TypeScript type-checking: **0 errors (`tsc --noEmit` clean)**
- UI: Optical Depth-of-Field & Bokeh controls integrated into `SketchPane.tsx` Card 3.
Macro shots of sketching and whiteboard demonstrations feature realistic optical lens physics:
1. **Focal Plane on Active Drawing Nib**:
   - The pen tip touching the canvas surface is in crisp, tack-sharp optical focus ($Z = 0$).
2. **Foreground Forearm & Wrist Defocus**:
   - The presenter's wrist and forearm extend upward toward the camera ($Z > 0$, typically 80–250mm above the whiteboard plane). Under shallow depth of field (e.g. f/1.8 – f/2.8), the forearm blurs softly with an optical circle-of-confusion (CoC) kernel, seamlessly integrating the hand asset into the scene rather than appearing as a harsh flat cutout.
3. **Z-Lift Defocus Dynamics**:
   - When the pen lifts during carriage returns, transitions, or 180° stylus flips, the nib itself elevates off the focal plane and defocuses naturally.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/dof_bokeh_engine.py`)
1. Data models:
   - `CameraDoFConfig`: `f_stop`, `focal_plane_mm`, `max_blur_px`, `bokeh_shape`.
2. Optical calculations:
   - Circle-of-confusion (CoC):
     $$\text{CoC}(Z) = \text{clamp}\left(\frac{|Z - Z_{\text{focal}}|}{\kappa \cdot N}, 0, \sigma_{\max}\right)$$
   - Depth gradient convolution across hand asset from fingertips to wrist/forearm.
3. Standalone **Test 34** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/dof-bokeh-ops.ts`:
   - Data models: `DepthOfFieldSettings`, `HandDoFParams`.
   - Pure functions:
     - `calculateCircleOfConfusion(zDepthMm, focalPlaneMm, fStop, maxBlurPx)`
     - `generateHandDepthMapGradient(handBounds, wristAngleDeg, baseZLiftPx)`
     - `generateDoFSvgFilterMarkup(tipBlurSigma, wristBlurSigma)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/dof-bokeh-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `depthOfField`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Optical Depth-of-Field & Bokeh" controls:
    - Enabled toggle.
    - Lens Aperture: `f1.8` | `f2.8` | `f5.6`.
    - Forearm Defocus Radius slider (4px – 30px).
    - Z-Lift Defocus toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (34/34 passing).
- Run `npx tsc --noEmit` (clean).
- Run `npx vitest run` (97/97 passing).
