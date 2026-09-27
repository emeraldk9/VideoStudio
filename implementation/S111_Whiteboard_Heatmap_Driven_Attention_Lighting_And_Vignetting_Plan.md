# Milestone S111: Whiteboard Heatmap-Driven Attention Lighting, Dynamic Vignetting & Pen Spotlight Shading
**Status: Complete (100% Verified)**
- Python tests: **32/32 passed** (including Test 32 for attention spotlight and vignetting)
- VideoStudio tests: **95/95 test files passed, 1,026/1,026 tests passed**
- TypeScript type-checking: **0 errors (`tsc --noEmit` clean)**
- UI: Attention Lighting & Vignette controls integrated into `SketchPane.tsx` Card 3.
In high-end whiteboard explainer videos and educational tutorials, viewer retention is greatly improved by cinematic focus cues:
1. **Dynamic Pen Spotlight**:
   - A subtle radial luminance gradient follows the active pen tip with inertia damping, guiding the viewer's eyes directly to newly appearing strokes.
2. **Subtle Perimeter Vignetting**:
   - The outer boundaries and corners of the board recede slightly (5–30% attenuation), creating depth and keeping attention focused on the active diagram area.
3. **Contrast & Exposure Preservation**:
   - Lighting is physically modeled so paper highlights do not wash out, nor do dark marker lines clip.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/attention_lighting_engine.py`)
1. Data structures:
   - `AttentionLightConfig`: `spotlight_radius`, `spotlight_intensity`, `vignette_strength`, `inertia`.
2. Spatial lighting math:
   - Elliptical vignette attenuation map:
     $$V(x, y) = 1.0 - S_{\text{vignette}} \cdot \left(\frac{(x - c_x)^2}{a^2} + \frac{(y - c_y)^2}{b^2}\right)$$
   - Inertial spotlight position smoothing:
     $$\mathbf{p}_{\text{light}}[k] = \mathbf{p}_{\text{light}}[k-1] \cdot \lambda + \mathbf{p}_{\text{pen}}[k] \cdot (1 - \lambda)$$
   - Radial spotlight gain:
     $$L(d) = 1.0 + I_{\text{spot}} \cdot \exp\left(-\frac{d^2}{2\sigma^2}\right)$$
3. Standalone **Test 32** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/attention-lighting-ops.ts`:
   - Data models: `AttentionLightingSettings`, `SpotlightState`, `VignetteParams`.
   - Pure functions:
     - `computeDampedSpotlightPosition(targetPos, currentPos, inertia)`
     - `calculateVignetteFactor(point, width, height, strength)`
     - `generateAttentionLightingSvgFilter(spotlight, radius, intensity, vignette, width, height)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/attention-lighting-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `attentionLighting`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Attention Lighting & Vignette" controls:
    - Toggle: Enable attention spotlight & vignette.
    - Spotlight Radius (100–600px).
    - Spotlight Intensity (5%–30%).
    - Perimeter Vignette (0%–40%).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (32/32 passing).
- Run `npx tsc --noEmit` (clean).
- Run `npx vitest run` (95/95 passing).
