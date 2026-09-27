# Milestone S149: Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
In traditional pointed pen calligraphy (Copperplate, Spencerian, Engrosser's script), master penmen write using metal dip flex nibs (such as Hunt 101, Brause Rose, or Gillott 303):
1. **Cantilever Tine Splay Mechanics**:
   - The pen nib is split longitudinally by a central slit ending at a breather hole.
   - On downstrokes, increased stylus pressure forces the two steel tines to splay outwards laterally, expanding stroke width from a 1px hairline up to 15px swell:
     $$w(p) = w_0 + K_{\text{flex}} \cdot p^{\gamma_{\text{flex}}}$$
   - On upstrokes, downforce is released, snapping the spring steel tines back together to draw microscopic hairline strokes.
2. **Capillary Meniscus Surface Tension & Rupture ("Railroading")**:
   - Ink spans the gap between the separating tines via a cohesive liquid meniscus film.
   - If downforce flexes the tines beyond critical width $w_{\text{rupture}}$ or ink depletion starves the capillary bridge, surface tension collapses:
     - The meniscus snaps and retreats to the two metal edges.
     - The stroke abruptly splits into **twin parallel outer line tracks** with a hollow gap inside ("railroading").
   - Hysteresis reconnection: The split tracks only recombine when the tines narrow back below $w_{\text{reconnect}} < w_{\text{rupture}}$.
3. **Dip Reservoir Depletion & Bottle Re-Dipping**:
   - Dip pens carry a finite droplet reservoir without a cartridge. As stroke length accumulates scaled by stroke width, reservoir depletes.
   - Low ink increases railroading probability and introduces dry-out streaking.
4. **Steel Tine Scratch Acoustic Foley Telemetry**:
   - Flexible metal points produce characteristic high-frequency paper scratching (1800–4500 Hz), flex chirp, and inkwell dipping foley.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/flex_nib_railroading_engine.py`)
1. Data Structures:
   - `FlexNibConfig`:
     - `hairline_width`: float (default 1.2 px)
     - `max_swell_width`: float (default 14.0 px)
     - `flex_sensitivity`: float (default 1.4, power exponent)
     - `meniscus_rupture_width`: float (default 9.5 px)
     - `meniscus_reconnect_width`: float (default 6.0 px)
     - `reservoir_capacity_px`: float (default 1200.0 px arc length)
     - `ink_flow_rate`: float (default 1.0)
     - `ink_color_bgr`: Tuple[int, int, int] (default `(25, 20, 20)`)
     - `paper_scratch_resonance`: float (default 0.8)
   - `FlexNibPointState`:
     - `pt`: Tuple[float, float]
     - `pressure`: float
     - `tine_width`: float
     - `is_railroaded`: bool
     - `left_tine_pt`: Tuple[float, float]
     - `right_tine_pt`: Tuple[float, float]
     - `reservoir_level`: float
     - `foley_telemetry`: Dict[str, float]
2. Core Algorithms:
   - `compute_tine_splay_width(pressure, config) -> float`
   - `evaluate_meniscus_state(current_width, is_currently_railroaded, reservoir_level, config) -> bool`
   - `calculate_tine_offsets(point, tangent, width) -> Tuple[Tuple[float, float], Tuple[float, float]]`
   - `simulate_dip_pen_stroke(points, pressures, initial_reservoir, config) -> List[FlexNibPointState]`
   - `rasterize_flex_nib_stroke(canvas, stroke_states, config) -> np.ndarray`
3. Unit Test 70 in `scripts/test_engine.py`:
   - Validates hairline to swell line widening under pressure.
   - Validates meniscus rupture and hysteresis reconnection loop.
   - Validates dip ink reservoir drainage and low-ink rupture acceleration.
   - Validates high-frequency scratch audio telemetry and visual rasterization of twin railroad tracks.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/flex-nib-railroading-ops.ts`:
   - Interfaces: `FlexNibConfig`, `FlexNibPointState`, `FlexNibFoleyTelemetry`, `TransformedFlexNibStroke`.
   - Pure functions:
     - `validateFlexNibConfig(config)`
     - `computeTineSplayWidth(pressure, config)`
     - `evaluateMeniscusState(currentWidth, isCurrentlyRailroaded, reservoirLevel, config)`
     - `calculateTineOffsets(pt, normal, width)`
     - `simulateDipPenStroke(points, pressures, initialReservoir, config)`
     - `generateFlexNibSvgPaths(strokeStates, config)`
2. Unit Tests: `src/shared/utils/timeline/__tests__/flex-nib-railroading-ops.test.ts`:
   - Tests covering non-linear tine splay, meniscus rupture hysteresis, reservoir depletion, SVG path formatting, and config domain clamping.
3. Schema & Exports:
   - Add `flexNibRailroading` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export all types and functions from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Dedicated Calligraphic Flex Nib & Railroading panel in Card 3 of `SketchPane.tsx`:
  - Toggle: "Flexible Dip Nib & Railroading".
  - Sliders:
    - Maximum Swell Width [5px to 25px]
    - Meniscus Rupture Threshold [4px to 20px]
    - Spring Steel Elasticity [1.0 to 2.5]
    - Dip Reservoir Capacity [300px to 3000px]
    - Metallic Scratch Foley Volume [0% to 100%]
  - Button: "Re-Dip in Inkwell"

---

## 3. Verification & Acceptance Criteria
- Python: `scripts/test_engine.py` passes all 70 tests (**70/70 green**).
- TypeScript: `npx vitest run` passes all test suites (**133/133 files passing**).
- TypeScript Compiler: `npx tsc --noEmit` exits with 0 errors.
