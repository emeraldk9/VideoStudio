# Milestone S108: Whiteboard Granular Surface Friction, Nib Wear & Paper Micro-Texture

## 1. Context & Motivation
Physical drawing instruments (dry-erase markers, graphite pencils, chalk sticks) interact directly with the microscopic substrate texture of the drawing surface:
1. **Granular Surface Tooth & Micro-Roughness**:
   - Smooth glass/dry-erase whiteboard has virtually zero tooth ($\mu \approx 0.05$), yielding frictionless gliding.
   - Heavy watercolor paper, slate chalkboards, and textured canvas possess high tooth roughness ($\mu \in [0.2, 0.7]$) that creates micro-drag on the hand and irregular microscopic pigment deposition.
2. **Nib Wear & Tip Bevel Flattening**:
   - As a chalk stick, soft graphite lead, or felt marker draws continuous strokes over dozens of meters of trajectory, the tip wears down and flattens.
   - This causes progressive line-width broadening and subtle directional asymmetry along the dragging bevel.
3. **Micro-Deposition Grain**:
   - Pressure against surface peaks deposits pigment heavily on ridges while leaving valleys partially exposed (simulating authentic chalk/charcoal grain).

Milestone S108 builds this physical granular friction and progressive nib degradation model across Python and TypeScript.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/surface_friction_engine.py`)
1. Multi-Scale Surface Tooth Noise:
   - Analytical multi-octave 2D value/gradient noise reproducing whiteboard, paper, slate, and canvas grain profiles.
2. Progressive Nib Wear Model:
   - Track cumulative stroke travel distance $S = \sum \|\Delta \mathbf{p}\|$.
   - Effective radius expansion:
     $$R_{\text{eff}}(S) = R_0 + (R_{\text{max}} - R_0) \cdot \left(1 - e^{-k_{\text{wear}} \cdot S}\right)$$
3. Micro-Friction Kinetic Drag:
   - Velocity retardation from tooth contact: $v_{\text{eff}} = v / (1 + \mu \cdot \text{tooth}(x, y))$.
4. Standalone **Test 29** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/surface-friction-ops.ts`:
   - Data models: `SurfaceFrictionSettings`, `SurfaceTextureType`.
   - Pure functions:
     - `sampleSurfaceTooth(x, y, surfaceType, grainScale)`
     - `calculateNibWearExpansion(distancePx, initialRadius, wearRate, maxRadius)`
     - `applyFrictionToVelocities(points, surfaceType, roughness)`
2. Unit Tests:
   - `src/shared/utils/timeline/__tests__/surface-friction-ops.test.ts`.
3. Schema & Settings:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `surfaceFriction`.
   - Export through `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- Add "Surface Friction & Nib Wear" in Card 3 (Board Look & Hand Stylus) of `SketchPane.tsx`:
  - Surface Substrate: Whiteboard / Fine Paper / Rough Canvas / Slate Blackboard.
  - Surface Tooth Roughness slider.
  - Progressive Nib Wear slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 29/29 pass). -> **PASS: 29/29 passed**.
- Run `npx tsc --noEmit` (ensure exit code 0). -> **PASS: Clean exit code 0**.
- Run `npm test` across all 92 test files (ensure 1016+ tests pass). -> **PASS: 92/92 test files passed (1,016 tests passed)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- Python Engine: `scripts/core/surface_friction_engine.py` with `sample_surface_tooth`, `calculate_nib_wear_radius`, and `simulate_surface_friction_pass`.
- Test Suite: Test 29 in `scripts/test_engine.py` (**29/29 passed**).
- TypeScript Operations: `src/shared/utils/timeline/surface-friction-ops.ts` with `sampleSurfaceTooth`, `calculateNibWearExpansion`, and `applySurfaceFrictionDynamics`.
- Unit Tests: `src/shared/utils/timeline/__tests__/surface-friction-ops.test.ts` (**3/3 passed**).
- Schema & Settings: Extended `WhiteboardSettings` & `clipEffectsSchema` with `surfaceFriction`.
- UI: Card 3 (Board Look & Hand Stylus) in `SketchPane.tsx` with Surface Friction & Nib Wear toggle, Substrate Texture segmented control (Board / Paper / Slate / Canvas), Tooth Drag slider, and Nib Wear Rate slider.

