# Milestone S134: Whiteboard Felt-Tip Marker Nib Splay & Directional Fiber Compression Dynamics

## 1. Context & Motivation
In physical handwriting with bullet or bullet-chisel felt-tip dry-erase markers:
1. **Non-Linear Porous Fiber Elasticity**:
   - The bonded synthetic polymer fibers of the marker nib exhibit Hookean spring behavior at low contact pressure ($P \le 0.3$), but rapidly compress and reach a geometric saturation threshold at high pressure ($P > 0.7$).
   - A hyperbolic tangent response $\tanh(\alpha \cdot P)$ accurately captures this compressive plateau without artificial clipping.
2. **Directional Drag Deflection (Asymmetric Footprint)**:
   - When pulling the marker across the board, friction drags the flexible nib tip backwards relative to the pen body. The effective contact patch shifts backward by $\vec{\delta}_{\text{splay}} = -\lambda \cdot P \cdot \hat{v}$.
   - The contact footprint is therefore not a symmetric disc, but an elongated teardrop/ellipse whose lateral width expands significantly more than its longitudinal width.
3. **Curvature Thinning on Tight Arcs**:
   - High angular velocity $\omega = \frac{d\theta}{ds}$ reduces contact residence time, causing the splayed nib to momentarily narrow around tight hairpin curves and corners before expanding again on straightaways.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/nib_splay_compression_engine.py`)
1. Data Structures:
   - `SplayPoint`: `(x: float, y: float, pressure: float)`
   - `SplayRibbonQuad`: `v0, v1, v2, v3: Tuple[float, float]`, `center_offset: Tuple[float, float]`, `effective_width: float`
   - `NibSplayConfig`:
     - `enabled: bool = True`
     - `base_width: float = 6.0`
     - `splay_gain: float = 1.2`        # Lateral expansion multiplier
     - `fiber_stiffness: float = 0.65`  # Resistance to compression
     - `drag_deflection: float = 0.40`  # Backward displacement factor
2. Core Algorithms:
   - `compute_splay_width(base_width, pressure, splay_gain, stiffness) -> float`:
     - Uses $\Delta w = w_0 \cdot (1 + \text{gain} \cdot \tanh(2.5 \cdot (1 - \text{stiffness}) \cdot P))$.
   - `compute_nib_deflection(point, velocity_unit, pressure, drag_deflection) -> Tuple[float, float]`:
     - Calculates backward center-of-mass shift.
   - `generate_splay_ribbon_mesh(points, pressures, config) -> List[SplayRibbonQuad]`:
     - Computes normal expansion taking splay footprint into account.
   - `render_splay_stroke(canvas, quads, color_bgr) -> np.ndarray`:
     - Rasterizes anti-aliased deformed quads.
3. Automated Unit Test:
   - **Test 55** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/nib-splay-compression-ops.ts`:
   - Pure functions:
     - `computeSplayWidth(baseWidth: number, pressure: number, splayGain: number, fiberStiffness: number): number`
     - `computeNibDeflection(p: Point2D, velUnit: Point2D, pressure: number, dragFactor: number): Point2D`
     - `generateSplayRibbonMesh(points: Array<{x: number, y: number, pressure?: number}>, baseWidth?: number, splayGain?: number, fiberStiffness?: number, dragFactor?: number): SplayRibbonMesh`
     - `generateSplayRibbonSvgPath(mesh: SplayRibbonMesh): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/nib-splay-compression-ops.test.ts`.
3. Schema & Exports:
   - Add `NibSplaySettings` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Add `nibSplay` to `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Felt-Tip Marker Nib Splay & Fiber Compression" section:
    - Enabled toggle.
    - Splay Expansion Gain slider ($0.2 - 2.5\times$).
    - Fiber Stiffness / Spring Resistance slider ($10 - 100\%$).
    - Directional Drag Deflection slider ($0 - 100\%$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 55 passes in `scripts/test_engine.py` (**55/55 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with **118/118 test files** and **1,130/1,130 tests green**.
   - 10 unit tests in `src/shared/utils/timeline/__tests__/nib-splay-compression-ops.test.ts` passing.
3. UI Integration:
   - Controls in `SketchPane.tsx` Card 3 verified.
4. Documentation:
   - `walkthrough.md` updated with Milestone S134.

---

## 4. Status: COMPLETED (Verified 100%)
- Python engine: `scripts/core/nib_splay_compression_engine.py` (verified in Test 55)
- VideoStudio ops: `src/shared/utils/timeline/nib-splay-compression-ops.ts`
- Tests: `src/shared/utils/timeline/__tests__/nib-splay-compression-ops.test.ts` (10/10 passing)
- Schema: `WhiteboardSettings.nibSplay` and `clipEffectsSchema.whiteboard.nibSplay`
- UI: `SketchPane.tsx` Card 3 Felt Nib Splay & Fiber Compression controls
- Full suite: 55/55 Python tests & 1,130/1,130 Vitest tests green!
