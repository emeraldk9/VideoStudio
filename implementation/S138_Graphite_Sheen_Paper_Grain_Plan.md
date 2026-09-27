# Milestone S138: Whiteboard Graphite Sheen Reflection & Textured Paper Grain Bump Mapping

> **Status**: COMPLETED & VERIFIED (Python Test 59 passing; 9 Vitest tests in graphite-sheen-grain-ops.test.ts passing; full Vitest 122/122 suite passing; TypeScript check 0 errors; SketchPane Card 3 UI integrated)

## 1. Context & Motivation
Traditional sketch modes (pencil, comic, and fine-line drafting) exhibit distinctive surface physics absent on smooth dry-erase substrates:
1. **Textured Paper Grain & Height-Dependent Deposition**:
   - Paper substrate height field $H(x, y) \in [0, 1]$ generated via procedural fractal Perlin / Simplex noise.
   - Graphite and chalk deposit preferentially onto micro-surface peaks ($H > H_{\text{threshold}}$). Stylus pressure lowers the threshold, forcing carbon particles into the valleys.
2. **Graphite Metallic Specular Sheen (Blinn-Phong / Anisotropic)**:
   - Sheared graphene crystalline micro-flakes align with stroke tangent $\vec{t}$.
   - At glancing light angles, dense pencil strokes produce a metallic silver sheen:
     $$I_{\text{sheen}} = k_{\text{spec}} \cdot (\vec{N} \cdot \vec{H})^\gamma \cdot D_{\text{graphite}}$$
3. **Micro-Normal Bump Mapping**:
   - Height gradients generate surface normals $\vec{N} = \text{normalize}(-\nabla H, 1)$, imparting tangible tactile depth to pencil and comic sketches.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/graphite_sheen_grain_engine.py`)
1. Data Structures:
   - `GraphiteGrainConfig`:
     - `enabled: bool = True`
     - `grain_scale: float = 8.0` (wavelength in pixels)
     - `grain_roughness: float = 0.35` (peak-to-valley contrast [0.0 - 1.0])
     - `graphite_sheen_intensity: float = 0.25` (metallic sheen brightness [0.0 - 0.8])
     - `sheen_shininess: float = 32.0` (specular exponent)
     - `light_angle_deg: float = 45.0` (incident light azimuth)
     - `light_elevation_deg: float = 35.0` (incident light elevation)
2. Core Algorithms:
   - `generate_paper_grain_heightmap(width, height, scale, roughness, seed) -> np.ndarray`
   - `compute_grain_normal_map(heightmap) -> np.ndarray`
   - `modulate_deposition_by_grain(stroke_alpha, heightmap, pressure, roughness) -> np.ndarray`
   - `compute_graphite_specular_sheen(density_map, normal_map, light_dir, view_dir, sheen_intensity, shininess) -> np.ndarray`
   - `render_graphite_sketch_composite(base_canvas, stroke_layer, config) -> np.ndarray`
3. Python Test 59:
   - Validates paper grain heightmap is non-uniform and within $[0, 1]$.
   - Validates that higher stylus pressure forces deposition into grain valleys (higher fill ratio).
   - Validates metallic graphite sheen increases specular intensity when light aligns with specular lobe.
   - Validates final composite outputs realistic tactile graphite shading.

### Phase 2: VideoStudio Operations & Tests
1. Module: `src/shared/utils/timeline/graphite-sheen-grain-ops.ts`
   - `computeGrainDepositionThreshold(pressure: number, roughness: number): number`
   - `computeGraphiteSheen(nDotH: number, graphiteDensity: number, sheenIntensity: number, shininess?: number): number`
   - `generatePaperGrainFeTurbulenceDefs(scale: number, roughness: number, sheenIntensity: number): string`
2. Unit Tests: `src/shared/utils/timeline/__tests__/graphite-sheen-grain-ops.test.ts`
3. Schema & Exports:
   - Add `graphiteGrain?: GraphiteGrainSettings` to `WhiteboardSettings` in `whiteboard.ts`.
   - Add `graphiteGrain` to `clipEffectsSchema` in `effects.ts`.
   - Export from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Graphite Sheen & Paper Grain" section:
    - Enabled toggle.
    - Paper Grain Roughness slider ($0\% - 80\%$).
    - Graphite Metallic Sheen slider ($0\% - 80\%$).
    - Specular Shininess Exponent slider ($8 - 64$).
    - Incident Light Direction slider ($0^\circ - 360^\circ$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 59 passes in `scripts/test_engine.py` (**59/59 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with all test files green.
3. UI Integration:
   - Controls verified in `SketchPane.tsx` Card 3.
4. Documentation:
   - `walkthrough.md` updated with Milestone S138.
