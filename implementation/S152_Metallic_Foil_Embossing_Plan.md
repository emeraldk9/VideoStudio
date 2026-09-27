# Milestone S152: Metallic Foil Embossing & Hot Stamp Shimmer Shader Pipeline

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
In premium whiteboard presentation, luxury certificate calligraphy, and technical graphics, artists apply **Hot Stamp Metallic Foil Embossing** (Gold Leaf, Silver, Rose Gold, Holographic Rainbow Foil):
1. **Embossing Relief Profile & Normal Mapping**:
   - Stroke cross-section exhibits raised bevel relief:
     $$h(x, y) = h_{\max} \cdot \max\left(0, 1 - \frac{d(x, y)^2}{R^2}\right)$$
   - Surface normals derived via gradient operator:
     $$\vec{N} = \text{normalize}\left(-\frac{\partial h}{\partial x}, -\frac{\partial h}{\partial y}, 1.0\right)$$
2. **Micro-Facet Specular Shimmer**:
   - Metallic reflection with custom specular color tinting $C_{\text{foil}}$ (Gold: `#D4AF37`, Silver: `#E6E8FA`, Rose Gold: `#B76E79`, Holographic):
     $$I_{\text{spec}} = k_s \cdot \max(0, \vec{N} \cdot \vec{H})^{\alpha_{\text{shininess}}}$$
3. **Diffraction Grating Iridescence (Holographic Foil)**:
   - Thin-film wave interference modulates spectral hue based on view and light angles:
     $$\text{Hue}_{\text{iridescent}} = \left(\text{BaseHue} + k_{\text{diffract}} \cdot (\vec{N} \cdot \vec{V}) + \omega_{\text{sweep}} \cdot t\right) \pmod{1.0}$$
4. **Micro-Sparkle Flake Glint**:
   - Procedural high-frequency cellular noise generating micro-glints on moving light source.
5. **Heat Press & Foil Peel Foley Acoustics**:
   - Hydraulic press contact thump, thermal sizzle hiss, and vacuum adhesive foil peel crinkle.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/metallic_foil_emboss_engine.py`)
1. Data Structures:
   - `FoilPreset`: `gold`, `silver`, `rose_gold`, `copper`, `holographic`
   - `FoilConfig`:
     - `preset`: str (default `'gold'`)
     - `emboss_height_px`: float (default `2.5`)
     - `bevel_width_px`: float (default `3.0`)
     - `specular_shininess`: float (default `32.0`)
     - `light_angle_deg`: float (default `45.0`)
     - `light_elevation_deg`: float (default `60.0`)
     - `shimmer_speed`: float (default `1.0`)
     - `sparkle_intensity`: float (default `0.35`)
     - `foley_press_volume`: float (default `0.70`)
   - `FoilFoleyTelemetry`:
     - `press_thump_gain`: float
     - `thermal_hiss_gain`: float
     - `peel_crinkle_gain`: float
     - `peak_frequency_hz`: float
2. Core Algorithms:
   - `compute_stroke_emboss_normals(mask_or_distance, bevel_width, emboss_height) -> np.ndarray`
   - `render_metallic_foil_shading(canvas, stroke_mask, config, time_sec) -> np.ndarray`
   - `compute_holographic_diffraction(normals, light_dir, view_dir, time_sec) -> np.ndarray`
   - `generate_foil_foley_telemetry(duration_sec, config) -> FoilFoleyTelemetry`
3. Test 73 in `scripts/test_engine.py`:
   - Validates emboss relief height mapping and normal vector normalization.
   - Validates preset color tinting (gold, silver, rose gold, holographic iridescence).
   - Validates moving light shimmer and micro-sparkle generation.
   - Validates heat press and foil peel foley acoustic telemetry.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/metallic-foil-ops.ts`:
   - Interfaces: `FoilConfig`, `FoilPreset`, `FoilFoleyTelemetry`, `FoilSettings`.
   - Pure functions:
     - `validateFoilConfig(config)`
     - `resolveFoilBaseColor(preset)`
     - `computeEmbossNormal(dx, dy, bevelWidth, embossHeight)`
     - `calculateFoilSpecular(normal, lightDir, viewDir, shininess)`
     - `calculateHolographicIridescence(normal, viewDir, timeSec, shimmerSpeed)`
     - `generateFoilSvgFilters(config, filterId)`
     - `computeFoilFoleyTelemetry(durationSec, config)`
2. Unit Tests: `src/shared/utils/timeline/__tests__/metallic-foil-ops.test.ts`:
   - Tests covering normal derivation, specular calculation, holographic hue sweep, SVG filter generation, and config validation.
3. Schema & Integration:
   - Add `metallicFoil` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export all types and functions from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Dedicated Metallic Foil Embossing & Hot Stamp Shimmer panel in Card 3 of `SketchPane.tsx`:
  - Toggle: "Metallic Foil & Hot Stamp Emboss".
  - Preset selector: segmented buttons (Gold, Silver, Rose Gold, Copper, Holographic).
  - Sliders:
    - Emboss Relief Height [0.5px to 8.0px]
    - Bevel Transition Width [1.0px to 10.0px]
    - Specular Shininess [8 to 128]
    - Light Azimuth Angle [0° to 360°]
    - Shimmer Sweep Speed [0.0 to 3.0]
    - Micro-Sparkle Flake Glint [0% to 100%]
    - Heat Press Foley Volume [0% to 100%]

---

## 3. Verification & Acceptance Criteria
- Python: `scripts/test_engine.py` passes all 73 tests (**73/73 green**).
- TypeScript: `npx vitest run` passes all test suites (**136/136 files passing**).
- TypeScript Compiler: `npx tsc --noEmit` exits with 0 errors.
