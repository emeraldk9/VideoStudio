# Milestone S129: Whiteboard Multi-Source Hand Lighting & Dual-Penumbra Contact Shadows

## 1. Context & Motivation
In professional studio whiteboard recording setups and modern classrooms, presenters are illuminated by multi-point lighting rather than an unrealistic single omnidirectional point light:
1. **Key Light (Primary Luminaire)**:
   - Strongest direct illumination (e.g., overhead softbox or key spotlight at ~315° / NW).
   - Generates a primary directional shadow with a tight, dark umbra at the stylus tip contact point ($z \approx 0$).
2. **Fill Light (Secondary Diffuse Luminaire)**:
   - Positioned at an opposing or complementary angle (e.g., 45° / NE or 60°), providing secondary fill (intensity ratio ~30% - 60%).
   - Softens harsh contrast and casts a secondary, wider, softer penumbra shadow.
3. **Dual-Penumbra Overlap & Photometric Falloff**:
   - In regions where both light sources are occluded by the hand/arm, a dense dual-occlusion umbra forms.
   - Where only one source is occluded, partial light from the other creates soft, overlapping penumbrae.
   - Inverse-square distance attenuation: Shadow intensity and diffusion scale realistically with hand elevation ($z$) and light source distance.
4. **Chromatic Color Temperature**:
   - Key light (warm studio glow ~3200K - 4500K) vs. Fill light (cooler ambient skylight/fill ~5500K - 6500K), allowing chromatic shadow tinting instead of flat grayscale.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/multi_source_lighting_engine.py`)
1. Data Structures:
   - `LightSource`:
     - `angle_deg: float` (Compass angle: 0° N, 90° E, 180° S, 270° W, 315° NW)
     - `intensity: float` (0.0..1.0, e.g. 1.0 for Key, 0.4 for Fill)
     - `distance_px: float` (Offset distance in px)
     - `blur_radius_px: float` (Base blur radius)
     - `color_bgr: Tuple[int, int, int]` (Shadow tint color, default dark neutral e.g. (30, 25, 25))
   - `MultiSourceLightingConfig`:
     - `enabled: bool = True`
     - `key_light: LightSource = LightSource(angle_deg=315.0, intensity=0.75, distance_px=14.0, blur_radius_px=12.0)`
     - `fill_light: LightSource = LightSource(angle_deg=45.0, intensity=0.35, distance_px=20.0, blur_radius_px=22.0)`
     - `ambient_occlusion_intensity: float = 0.30`
     - `lift_height_px: float = 0.0` (0.0 when touching board, >0 when pen is in air)
     - `inverse_square_falloff: bool = True`
2. Core Algorithms:
   - `compute_light_shadow_projection(mask, light, tip_pos, lift_height)`:
     - Offsets alpha mask along direction vector $\vec{d} = (-dist \cdot \sin \theta, dist \cdot \cos \theta)$.
     - Adjusts blur radius and attenuation with tip proximity and lift height.
   - `render_multi_source_shadows(hand_mask, tip_pos, is_touching, config)`:
     - Computes key light shadow layer.
     - Computes fill light shadow layer.
     - Performs photometric dual-penumbra fusion:
       $$T_{\text{ambient}} = (1 - I_{\text{key}} \cdot S_{\text{key}}) \cdot (1 - I_{\text{fill}} \cdot S_{\text{fill}})$$
       $$S_{\text{composite}} = 1.0 - T_{\text{ambient}}$$
     - Renders subtle chromatic tinting and AO at nib contact.
   - `composite_multi_source_shadow_to_canvas(canvas_bgr, shadow_mask_or_bgr, config)`:
     - Subtractive multiply composition onto canvas preserving linework.
3. Unit Test:
   - Standalone **Test 50** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/multi-source-lighting-ops.ts`:
   - Interfaces: `LightSourceConfig`, `MultiSourceLightingSettings`, `DualPenumbraVectors`.
   - Pure functions:
     - `computeDualShadowVectors(keyAngle: number, keyDist: number, fillAngle: number, fillDist: number, liftHeight?: number)`
     - `calculateDualPenumbraAttenuation(keyIntensity: number, fillIntensity: number, overlapRatio: number)`
     - `generateMultiSourceShadowCssFilters(settings?: MultiSourceLightingSettings, isLifting?: boolean)`
     - `simulatePhotometricDualPenumbra(keyAlpha: number, fillAlpha: number, keyIntensity: number, fillIntensity: number)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/multi-source-lighting-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.multiSourceLighting` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.multiSourceLighting` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Multi-Source Hand Lighting & Dual Penumbra" collapsible sub-section:
    - Enabled toggle.
    - Key Light Angle (slider 0°-360°) and Intensity (slider 0-100%).
    - Fill Light Angle (slider 0°-360°) and Intensity (slider 0-100%).
    - Contact Softness & Tip Lift dissipation controls.
    - Visual dual-source lighting badge / indicator.

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Standalone Test 50 passes in `scripts/test_engine.py` (50/50 tests passing).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with 113/113 test files and 1,096+ tests green.
3. Documentation:
   - Artifact `walkthrough.md` updated with Milestone S129 details.

---

## 4. Status: 100% COMPLETE & VERIFIED
- **Python Engine**: Test 50 passed in `scripts/test_engine.py` (50/50 tests passing).
- **VideoStudio Unit Tests**: 4/4 tests passed in `src/shared/utils/timeline/__tests__/multi-source-lighting-ops.test.ts`.
- **TypeScript**: `tsc --noEmit` clean exit code 0.
- **UI Integration**: Complete in `SketchPane.tsx` Card 3 with dual light sliders, contact AO, and elevation dynamics.
