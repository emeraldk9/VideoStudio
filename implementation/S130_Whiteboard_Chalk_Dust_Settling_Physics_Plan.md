# Milestone S130: Whiteboard Chalk Dust Settling & Gravitational Blackboard Particle Physics

## 1. Context & Motivation
On physical blackboards, chalkboards, and slate surfaces, writing with porous chalk sticks fractures microscopic calcite/gypsum dust particles. In realistic physics:
1. **Gravitational Terminal Drift & Brownian Turbulence**:
   - Particles shed from active strokes drift downward under gravity ($g$) influenced by viscous air drag ($v_{\text{term}}$).
   - Horizontal flutter/turbulence creates gentle lateral waving as particles fall towards the lower frame.
2. **Bottom Tray Accumulation (Chalk Ledge Sedimentation)**:
   - At the bottom boundary of the board is the chalk tray / ledge ($y \approx y_{\text{tray}}$).
   - When descending particles reach the ledge, they settle and deposit into an accumulated dust berm/mound.
   - The accumulation forms a continuous physical height/density map along the shelf, displaying realistic heap dispersion governed by natural particulate angle of repose.
3. **Dual State Dynamics (Airborne vs. Settled)**:
   - Airborne particles diffuse and attenuate over their fall duration.
   - Settled tray dust accumulates persistently, deepening in opacity as more writing occurs across the sequence.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/chalk_dust_settling_engine.py`)
1. Data Structures:
   - `ChalkParticleState`:
     - `x: float, y: float`
     - `vx: float, vy: float`
     - `mass: float, radius: float`
     - `opacity: float`
     - `is_settled: bool`
     - `settled_time: float`
     - `color_bgr: Tuple[int, int, int]`
   - `ChalkDustSettlingConfig`:
     - `enabled: bool = True`
     - `gravity: float = 9.8`
     - `air_drag: float = 0.15`
     - `terminal_velocity_px: float = 45.0`
     - `turbulence_amplitude: float = 1.8`
     - `tray_y_pct: float = 0.94` # 94% height is the chalkboard frame shelf
     - `tray_depth_px: float = 16.0` # Chalk ledge height
     - `accumulation_rate: float = 0.8`
     - `repose_dispersion_sigma: float = 6.0`
2. Core Algorithms:
   - `step_particle_physics(particles, dt, config, canvas_w, canvas_h, tray_accumulation)`:
     - Updates position, velocity, and air drag for each active particle.
     - Checks collision with tray $y \ge y_{\text{tray}}$: switches state to `is_settled` and splats mass onto 1D tray heap histogram.
   - `render_chalk_dust_and_tray(canvas_bgr, active_particles, tray_accumulation, config)`:
     - Renders airborne soft dust motes.
     - Renders smooth gaussian-smoothed sedimentary chalk dust layer across the lower tray ledge.
3. Standalone Unit Test:
   - **Test 51** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/chalk-dust-settling-ops.ts`:
   - Interfaces: `SettlingChalkParticle`, `ChalkTrayAccumulator`, `ChalkDustSettlingSettings`.
   - Pure functions:
     - `simulateDustParticleStep(particle, dt, config, trayY)`
     - `depositChalkTrayDust(trayBins: Float32Array, depositX: number, amount: number, sigma: number)`
     - `calculateTraySedimentProfile(trayBins: Float32Array, width: number, trayHeightPx: number)`
     - `generateChalkTraySvgPath(trayBins: Float32Array, width: number, trayY: number, trayHeight: number)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/chalk-dust-settling-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.chalkDustSettling` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.chalkDustSettling` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Chalk Dust Gravitational Settling & Tray Physics" section:
    - Enabled toggle.
    - Gravity Drift Speed slider ($10 - 100$ px/s).
    - Air Turbulence / Flutter slider ($0.0 - 5.0$).
    - Tray Sedimentation Depth slider ($4 - 32$ px).
    - Clear Tray Dust button / reset control.

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Standalone Test 51 passes in `scripts/test_engine.py` (51/51 tests passing).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with 114/114 test files and 1,100+ tests green.
3. Documentation:
   - Artifact `walkthrough.md` updated with Milestone S130 details.

---

## 4. Status: 100% COMPLETE & VERIFIED
- **Python Engine**: Test 51 passed in `scripts/test_engine.py` (51/51 tests passing).
- **VideoStudio Unit Tests**: 4/4 tests passed in `src/shared/utils/timeline/__tests__/chalk-dust-settling-ops.test.ts`.
- **TypeScript**: `tsc --noEmit` clean exit code 0.
- **UI Integration**: Complete in `SketchPane.tsx` Card 3 with gravity speed, terminal velocity, flutter turbulence, bottom tray elevation, and sediment berm depth controls.
