# Milestone S137: Whiteboard Dual-Layer Tempered Glass Specular Glare & Parallax Reflection

> **Status**: COMPLETED & VERIFIED (Python Test 58 passing; 9 Vitest tests in glass-specular-parallax-ops.test.ts passing; full Vitest 121/121 suite passing; TypeScript check 0 errors; SketchPane Card 3 UI integrated)

## 1. Context & Motivation
Modern magnetic glassboards and architectural whiteboard installations feature a front tempered glass sheet ($4\text{mm} - 6\text{mm}$ thickness, refractive index $n \approx 1.52$) mounted in front of a white ceramic / metal backing. This optical assembly produces distinct physical phenomena:
1. **Dual Fresnel Specular Reflections ($R_1, R_2$)**:
   - The front air-glass interface reflects $\approx 4.3\%$ of light at normal incidence, scaling at glancing angles via Schlick's Fresnel approximation:
     $$R(\theta) = R_0 + (1 - R_0)(1 - \cos\theta)^5$$
   - The rear glass-enamel interface produces a secondary internal reflection with a refractive spatial shift $\Delta_{\text{refract}}$.
2. **Refractive Ink Parallax Ghosting**:
   - Ink deposited on the front surface casts a soft secondary shadow / reflection against the rear white backing layer.
   - For a camera at $(C_x, C_y, C_z)$, the parallax offset vector between front ink and rear projection is:
     $$\vec{\delta}_{\text{parallax}} = d_{\text{glass}} \cdot \frac{(x - C_x, y - C_y)}{C_z}$$
3. **Overhead Luminaire Anisotropic Glare Streak**:
   - Ceiling fluorescent tubes and studio key lights produce a soft, elongated specular glare streak across the board's surface, enhancing realistic depth.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/glass_specular_parallax_engine.py`)
1. Data Structures:
   - `GlassBoardConfig`:
     - `enabled: bool = True`
     - `glass_thickness: float = 4.0` (mm, normalized to viewport pixels)
     - `refractive_index: float = 1.52`
     - `fresnel_glare_intensity: float = 0.20`
     - `parallax_ghost_opacity: float = 0.08`
     - `overhead_glare_pos: Tuple[float, float] = (0.5, 0.15)` (normalized light position)
     - `overhead_glare_spread: float = 0.45`
   - `ParallaxOffset`: computes 2D displacement $(\Delta x, \Delta y)$ for points given camera origin and glass thickness.
2. Core Algorithms:
   - `compute_fresnel_factor(cos_theta, n1=1.0, n2=1.52) -> float`
   - `compute_parallax_offset(pt, cam_pos, glass_thickness) -> Tuple[float, float]`
   - `generate_glass_specular_map(width, height, light_pos, glare_intensity, spread) -> np.ndarray`
   - `render_glass_parallax_ghost(ink_layer, cam_pos, glass_thickness, ghost_opacity) -> np.ndarray`
   - `composite_glassboard_optics(canvas, ink_layer, config) -> np.ndarray`
3. Python Unit Test 58:
   - Validates Fresnel reflectivity calculation matches Schlick's formula.
   - Validates parallax offset magnitude is linearly proportional to glass thickness and camera angle.
   - Validates specular glare streak correctly illuminates upper region with non-zero luminance.
   - Validates composite output preserves ink details while adding dual-layer depth.

### Phase 2: VideoStudio Operations & Tests
1. Module: `src/shared/utils/timeline/glass-specular-parallax-ops.ts`
   - `computeFresnelReflectance(cosTheta: number, n1?: number, n2?: number): number`
   - `computeParallaxOffset(pt: {x: number; y: number}, camPos: {x: number; y: number; z: number}, thickness: number): {x: number; y: number}`
   - `generateOverheadGlareGradient(lightX: number, lightY: number, intensity: number, spread: number): {center: string; stops: Array<{offset: number; color: string; opacity: number}>}`
   - `generateParallaxFilterSvg(thickness: number, opacity: number, angleDeg: number): string`
2. Unit Tests: `src/shared/utils/timeline/__tests__/glass-specular-parallax-ops.test.ts`
3. Schema & Exports:
   - Add `glassParallax?: GlassParallaxSettings` to `WhiteboardSettings` in `whiteboard.ts`.
   - Add `glassParallax` to `clipEffectsSchema` in `effects.ts`.
   - Export from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Tempered Glass Specular & Parallax" section:
    - Enabled toggle.
    - Glass Thickness slider ($1\text{mm} - 10\text{mm}$).
    - Fresnel Specular Glare slider ($0\% - 60\%$).
    - Parallax Ink Shadow Opacity slider ($1\% - 20\%$).
    - Overhead Luminaire Position / Spread sliders.

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 58 passes in `scripts/test_engine.py` (**58/58 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with all test files green.
3. UI Integration:
   - Controls verified in `SketchPane.tsx` Card 3.
4. Documentation:
   - `walkthrough.md` updated with Milestone S137.
