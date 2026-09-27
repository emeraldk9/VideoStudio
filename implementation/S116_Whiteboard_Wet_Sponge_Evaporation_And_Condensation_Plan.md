# Milestone S116: Whiteboard Procedural Water Droplet Condensation, Wet Sponge Evaporation & Dew Drop Smear Physics

## 1. Context & Motivation
Realistic physical whiteboard and chalkboard demonstrations often feature damp cleaning or humidity interactions:
1. **Damp Sponge / Wet Cloth Board Wiping**:
   - Wiping down a whiteboard or slate board with a wet sponge leaves a transient water sheen (film thickness map $M(x, y)$).
   - As air circulates, the thin film evaporates non-linearly: periphery dry spots form first, followed by subtle mineral/water drying rings.
2. **Pigment Dissolution & Capillary Smearing**:
   - Writing with chalk or dry-erase marker over semi-damp regions dissolves pigment into suspension, causing feathered edge dispersal and opacity dilution.
3. **Specular Water Glint & Substrate Darkening**:
   - Wet areas reflect ambient light with heightened glossiness while darkening porous chalkboard slate through refractive index matching.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/wet_sponge_condensation_engine.py`)
1. Data structures:
   - `WetSpongeConfig`:
     - `sponge_width_px: int = 60`
     - `initial_wetness: float = 0.8` (0.0 to 1.0)
     - `evaporation_rate: float = 0.15` (evaporation loss per second)
     - `gravity_drip: bool = False`
     - `pigment_dilution_factor: float = 0.6`
2. Core simulation algorithms:
   - `create_sponge_wipe_moisture_map(shape, wipe_trajectory, sponge_width, wetness)`:
     - Generates 2D float32 moisture map $[0.0, 1.0]$ with soft contact falloff.
   - `simulate_evaporative_drying(moisture_map, elapsed_sec, evaporation_rate)`:
     - Decrements moisture with edge-accelerated drying contour simulation.
   - `apply_wet_board_optics(canvas_bgr, moisture_map)`:
     - Wet slate refractive darkening ($I_{wet} = I_{dry} \times (1.0 - 0.25 \cdot M)$).
     - Specular surface highlight boost ($I_{glint} = I_{wet} + 30 \cdot M^{2.0}$).
   - `simulate_wet_stroke_feathering(stroke_points, moisture_map, dilution_factor)`:
     - Dilutes alpha and expands radius when traversing wet zones.
3. Standalone **Test 37** in `scripts/test_engine.py`:
   - Validates moisture map generation, drying decay over time, optical darkening/glint effect, and pigment feathering response.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/wet-sponge-ops.ts`:
   - Interfaces: `WetSpongeCondensationSettings`, `DryingEvaporationProfile`.
   - Pure functions:
     - `evaluateMoistureEvaporation(initialWetness, elapsedSec, dryingTimeSec)`
     - `computeWaterDilution(baseOpacity, moistureLevel, dilutionFactor)`
     - `generateWetGlintSvgFilterMarkup(filterId, wetness)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/wet-sponge-ops.test.ts`.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Update `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Wet Sponge & Moisture Evaporation" controls:
    - Enabled toggle.
    - Initial Sponge Wetness slider (10% - 100%).
    - Drying Evaporation Time slider (1.0s - 15.0s).
    - Pigment Dilution Factor slider (0% - 90%).
    - Gravity Drip physics toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (37/37 passing) - **Verified [PASS]**
- Run `npx tsc --noEmit` (clean exit code 0) - **Verified [PASS]**
- Run `npx vitest run` (100/100 test files passing, 1,043/1,043 tests passing) - **Verified [PASS]**

## 3. Status: 100% Complete & Verified
- Python engine: `scripts/core/wet_sponge_condensation_engine.py`
- Python Test 37: Passing in `scripts/test_engine.py`
- TypeScript operations: `src/shared/utils/timeline/wet-sponge-ops.ts`
- Vitest suite: `src/shared/utils/timeline/__tests__/wet-sponge-ops.test.ts` (3/3 passing)
- Schema & Exports: `whiteboard.ts`, `effects.ts`, `src/shared/index.ts`
- UI controls: `SketchPane.tsx` Card 3 with interactive initial moisture wetness slider, evaporation drying time slider, capillary ink dilution slider, and gravity droplet drip toggle.
