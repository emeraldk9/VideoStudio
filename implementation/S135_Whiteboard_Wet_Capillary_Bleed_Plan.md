# Milestone S135: Whiteboard Wet-on-Wet Capillary Bleed & Pigment Diffusion at Stroke Intersections

## 1. Context & Motivation
When drawing with physical liquid-solvent markers (dry-erase markers, alcohol inks, or fountain pens):
1. **Wet-on-Wet Capillary Bleed**:
   - When a freshly drawn stroke crosses an existing stroke that is still wet (elapsed time $\Delta t < \tau_{\text{dry}} \approx 2.0$ s), capillary fluid suction pulls pigment and solvent across the intersection boundary.
2. **Solvent Pooling & Core Dilution**:
   - Double deposition of liquid solvent at the junction temporarily pools before evaporation, creating a subtly diluted, lighter core surrounded by a darker capillary pigment ring.
3. **Dendritic Micro-Tendril Feathering**:
   - Surface micro-roughness guides microscopic fluid tendrils ($0.5 - 2.5$ mm) blooming outward from the intersection junction.
4. **Temporal Drying Decay**:
   - As $\Delta t$ approaches $\tau_{\text{dry}}$, the wetness factor $W = \max(0, 1 - \Delta t / \tau_{\text{dry}})$ drops linearly to zero. Beyond $\tau_{\text{dry}}$, the second stroke lays cleanly on top with normal dry layering and zero bleeding.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/capillary_bleed_engine.py`)
1. Data Structures:
   - `TimedStroke`: polyline with points $(x, y, t)$, color BGR, and stroke width.
   - `IntersectionBleedNode`:
     - `pos: Tuple[float, float]`
     - `wetness: float` (0.0 to 1.0)
     - `bloom_radius: float`
     - `blended_color_bgr: Tuple[int, int, int]`
   - `CapillaryBleedConfig`:
     - `enabled: bool = True`
     - `drying_time_sec: float = 2.0`
     - `bloom_radius_px: float = 6.0`
     - `solvent_dilution: float = 0.35`
     - `feather_spikes: int = 6`
2. Core Algorithms:
   - `find_stroke_intersections(stroke_a, stroke_b, drying_time_sec) -> List[IntersectionBleedNode]`:
     - Segment-segment geometric intersection tests; extracts intersection coordinates and evaluates relative wetness.
   - `generate_dendritic_bloom_polygon(center, radius, wetness, num_spikes) -> List[Tuple[float, float]]`:
     - Produces organic capillary bloom polygon.
   - `render_capillary_bleed(canvas, bleed_nodes, solvent_dilution) -> np.ndarray`:
     - Renders solvent pool and outward feathering rings.
3. Automated Unit Test:
   - **Test 56** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/capillary-bleed-ops.ts`:
   - Pure functions:
     - `checkSegmentIntersection(p1, p2, p3, p4): { hit: boolean, point?: Point2D }`
     - `detectStrokeIntersections(strokes: TimedStroke[], dryingTimeSec?: number): BleedNode[]`
     - `computeDendriticBloomPoints(center: Point2D, radius: number, wetness: number, spikes?: number): Point2D[]`
     - `generateCapillaryBleedSvgDefs(nodes: BleedNode[], solventDilution?: number): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/capillary-bleed-ops.test.ts`.
3. Schema & Exports:
   - Add `CapillaryBleedSettings` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Add `capillaryBleed` to `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Wet-on-Wet Capillary Bleed & Pigment Diffusion" section:
    - Enabled toggle.
    - Wet Drying Window slider ($0.5 - 5.0$ s).
    - Capillary Bloom Radius slider ($2 - 15$ px).
    - Solvent Dilution Core slider ($0 - 70\%$).
    - Dendritic Tendril Count slider ($3 - 12$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 56 passes in `scripts/test_engine.py` (**56/56 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with **119/119 test files** and **1,139/1,139 tests green**.
   - 9 unit tests in `src/shared/utils/timeline/__tests__/capillary-bleed-ops.test.ts` passing.
3. UI Integration:
   - Controls verified in `SketchPane.tsx` Card 3.
4. Documentation:
   - `walkthrough.md` updated with Milestone S135.

---

## 4. Status: COMPLETED (Verified 100%)
- Python engine: `scripts/core/capillary_bleed_engine.py` (verified in Test 56)
- VideoStudio ops: `src/shared/utils/timeline/capillary-bleed-ops.ts`
- Tests: `src/shared/utils/timeline/__tests__/capillary-bleed-ops.test.ts` (9/9 passing)
- Schema: `WhiteboardSettings.capillaryBleed` and `clipEffectsSchema.whiteboard.capillaryBleed`
- UI: `SketchPane.tsx` Card 3 Wet Capillary Bleed & Diffusion controls
- Full suite: 56/56 Python tests & 1,139/1,139 Vitest tests green!
