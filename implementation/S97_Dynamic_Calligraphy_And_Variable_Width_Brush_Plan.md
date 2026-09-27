# Milestone S97: Real-Time Dynamic Pen Calligraphy, Pressure-Sensitive Variable-Width Brush Extrusion & Nib Modeling

## 1. Context & Motivation
Currently, whiteboard strokes rendered in both `srt-whiteboard-animation-main` and VideoStudio preview utilize constant-width lines (e.g. static 3px strokes). In authentic hand-drawn whiteboard videos, calligraphy, and chalk drawings:
- **Velocity-to-Pressure Dynamics**: Fast drawing motions create natural stroke tapering ($w_{\min}$) while deliberate slow lines press down to deposit thicker pigment ($w_{\max}$).
- **Anisotropic Chisel-Tip & Italic Nibs**: Markers and calligraphy pens have oriented flat nibs (e.g. $45^\circ$), producing broad strokes when moving perpendicular to the nib and sharp hairlines when moving parallel.
- **Chalk Granularity**: Chalk sticks on slate blackboards deposit granulated pigment with soft, feathering edges rather than hard vector boundaries.

### Objectives:
1. **Velocity-to-Pressure Physical Dynamics**:
   - Model pen pressure $p(t) \in [0.3, 1.2]$ inversely proportional to velocity $\|\vec{v}(t)\|$:
     $$w(t) = w_{\text{base}} \cdot \left(1.0 - \kappa \cdot \min\left(1.0, \frac{\|\vec{v}(t)\|}{v_{\max}}\right)\right)$$
2. **Chisel & Calligraphic Nib Geometry**:
   - For marker and chisel stylus types, modulate thickness based on the angle difference between stroke tangent $\theta_t$ and nib orientation angle $\theta_{\text{nib}}$:
     $$w_{\text{chisel}}(t) = w(t) \cdot \left(\sin^2(\theta_t - \theta_{\text{nib}}) + \rho \cos^2(\theta_t - \theta_{\text{nib}})\right)$$
3. **Variable-Width Normal Extrusion (Triangle Strip / Polygon Mesh)**:
   - Compute unit normal vectors $\vec{n}(t) = (-v_y / \|\vec{v}\|, v_x / \|\vec{v}\|)$ along smoothed trajectories.
   - Extrude left and right vertex envelopes: $V_{\text{left}}(t) = P(t) + \vec{n}(t) \cdot \frac{w(t)}{2}$, $V_{\text{right}}(t) = P(t) - \vec{n}(t) \cdot \frac{w(t)}{2}$.
   - Connect consecutive quad segments into closed filled polygons with round cap joins.
4. **Python Core Engine (`scripts/core/calligraphy_engine.py`)**:
   - Variable-width stroke extruder and polygon rasterizer.
   - Verification in `scripts/test_engine.py` (Test 18).
5. **VideoStudio Timeline & UI Integration**:
   - TypeScript operations in `src/shared/utils/timeline/calligraphy-ops.ts`.
   - Update `WhiteboardSettings` & `clipEffectsSchema` with `brushDynamics?: WhiteboardBrushDynamics`.
   - UI controls in `src/renderer/features/timeline-media/ui/SketchPane.tsx`.
   - Automated unit tests and verification.

---

## 2. Multi-Milestone Roadmap

| Milestone | Title | Scope |
|---|---|---|
| **S97 (Next)** | Dynamic Calligraphy & Variable-Width Brush Extrusion | Velocity-pressure taper, chisel-tip nib angle modeling, quad normal extrusion, Test 18 |
| **S98** | Intelligent Multi-Path Saliency Clustering & Contour Prioritization | Connected-component saliency grouping, hierarchical stroke level-of-detail, Test 19 |
| **S99** | Whiteboard Storyboard Sequence Timeline Exporter & Multi-Scene Packaging | Automated batch storyboard assembly, cross-scene manifest generation, Test 20 |
| **S100** | Whiteboard Animation Studio Milestone & Interactive Polish | Complete studio integration review, preset bundles, and automated end-to-end audit |

---

## 3. Milestone S97 Detailed Architecture

### Phase 1: Python Engine Implementation (`scripts/core/calligraphy_engine.py`) [COMPLETE]
1. **Mathematical Envelope Computation**: [DONE]
   - Built `compute_point_normals`, `compute_variable_widths`, and `extrude_variable_width_polygon`.
   - Extrudes left and right normal offsets with round caps.
2. **Rasterization**: [DONE]
   - Built `CalligraphyEngine.render_calligraphy_stroke` using OpenCV anti-aliased polyfill.
3. **Standalone Verification in `scripts/test_engine.py`**: [DONE]
   - Added **Test 18**: Verified normal vectors, start/end tapering, chisel nib anisotropic modulation, and canvas polygon rasterization (**18/18 tests passing**).

### Phase 2: VideoStudio Operations & Shared Types [COMPLETE]
1. **`src/shared/utils/timeline/calligraphy-ops.ts`**: [DONE]
   - Pure TypeScript, zero-dependency functions: `computePointNormals`, `computeVariableWidths`, `extrudeVariableWidthPolygon`, and `buildSvgPolygonPath`.
2. **`WhiteboardSettings` & `effects.ts` Schema Extension**: [DONE]
   - Added `brushDynamics` (`taper`, `chiselNib`, `nibAngleDeg`, `minWidthRatio`) to `WhiteboardSettings` and `clipEffectsSchema`.
3. **Unit Tests in `src/shared/utils/timeline/__tests__/calligraphy-ops.test.ts`**: [DONE]
   - Unit tests covering normals, tapering, chisel nib angle modulation, and SVG path generation (**4/4 passing**).

### Phase 3: VideoStudio UI in `SketchPane.tsx` [COMPLETE]
- Added "Calligraphy & Brush Dynamics" section in Card 3 with Speed Tapering toggle, Chisel-Tip Nib toggle, and Nib Angle slider (0–180°).

### Phase 4: Full Validation & Test Suite [COMPLETE]
- Python test suite: `scripts/test_engine.py` (**18/18 pass**).
- VideoStudio typecheck: `npx tsc --noEmit` (**0 errors**).
- VideoStudio unit test suite: `npx vitest run` (**81/81 test files, 978/978 tests passing**).

---

### Milestone Completion Summary
- **Status**: **100% COMPLETE & VERIFIED**
- **Artifacts**:
  - `scripts/core/calligraphy_engine.py`
  - `scripts/test_engine.py` (Test 18)
  - `src/shared/utils/timeline/calligraphy-ops.ts`
  - `src/shared/utils/timeline/__tests__/calligraphy-ops.test.ts`
  - `src/shared/utils/timeline/whiteboard.ts`
  - `src/shared/utils/timeline/effects.ts`
  - `src/renderer/features/timeline-media/ui/SketchPane.tsx`

