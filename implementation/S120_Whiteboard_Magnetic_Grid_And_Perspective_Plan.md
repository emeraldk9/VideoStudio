# Milestone S120: Whiteboard Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective

## 1. Context & Motivation
When drawing technical diagrams, engineering blueprints, architectural structures, and 3D geometric illustrations:
1. **Assistive Grid Substrates**:
   - **Cartesian Grid**: Traditional orthogonal graph paper $(X, Y)$ with customizable grid pitch.
   - **Isometric Grid**: Classic $30^\circ / 90^\circ / 150^\circ$ engineering projection for drawing 3D prisms, cubes, and piping without perspective distortion.
   - **Perspective 3D Grid**: Vanishing points on a customizable horizon line ($y_{horizon}$) for architectural depth and receding floor/wall grid lines.
   - **Dot Matrix Grid**: Minimalist dotted drafting grid popular in modern bullet journals and digital whiteboards.
2. **Magnetic Pen-Tip Snapping**:
   - As the stylus draws within a magnetic capture radius ($R_{snap} \in [4\text{px}, 24\text{px}]$), the point softly or rigidly locks to the nearest grid node or axis constraint.
3. **Seamless Video Overlay**:
   - Subtle background grid overlay with controllable opacity ($5\% - 50\%$) that guides drawing during creation and export.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/perspective_grid_engine.py`)
1. Data structures:
   - `PerspectiveGridConfig`:
     - `enabled: bool = True`
     - `mode: str = 'isometric'` # 'cartesian' | 'isometric' | 'perspective' | 'dots'
     - `spacing_px: float = 40.0`
     - `snap_radius_px: float = 12.0`
     - `horizon_y_pct: float = 0.40`
     - `opacity: float = 0.20`
     - `grid_color_bgr: Tuple[int, int, int] = (160, 160, 160)`
2. Core algorithms:
   - `render_grid_overlay(canvas_bgr, config)`: renders Cartesian, Isometric triangular lattice, vanishing ray perspective, or dot grid onto canvas.
   - `snap_point_to_grid(point, config, canvas_shape)`:
     - Calculates nearest grid node.
     - If distance $\le snap\_radius\_px$, snaps point to the exact lattice node.
   - `snap_stroke_polyline(points, config, canvas_shape)`:
     - Filters and snaps stroke polyline vertices to nearest magnetic grid lines.
3. Standalone **Test 41** in `scripts/test_engine.py`:
   - Validates grid overlay rendering and magnetic snapping across Cartesian, Isometric, and Dot modes.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/perspective-grid-ops.ts`:
   - Interfaces: `PerspectiveGridSettings`, `GridSubstrateMode` (`'cartesian' | 'isometric' | 'perspective' | 'dots'`).
   - Pure functions:
     - `snapPointToGridLattice(pt: Point2D, mode: GridSubstrateMode, spacingPx: number, snapRadiusPx: number): Point2D`
     - `generateGridSvgMarkup(width: number, height: number, settings: PerspectiveGridSettings): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/perspective-grid-ops.test.ts`.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Update `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Magnetic Grid & Perspective Drafting" section:
    - Enabled toggle.
    - Grid Mode segmented control (`Cartesian`, `Isometric`, `Perspective`, `Dots`).
    - Grid Spacing slider (20px – 80px).
    - Magnetic Snap Radius slider (4px – 24px).
    - Substrate Grid Opacity slider (5% – 50%).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (41/41 passing) -> **VERIFIED (41/41 passing)**.
- Run `npx tsc --noEmit` (clean exit code 0) -> **VERIFIED (clean exit 0)**.
- Run `npx vitest run` (104/104 test files passing, 1,058 tests passing) -> **VERIFIED (104/104 files, 1,058/1,058 tests passing)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- **Python**: `scripts/core/perspective_grid_engine.py` implemented with Cartesian, Isometric triangular lattice, 3D vanishing horizon perspective, and dot grid snapping.
- **Python Test**: Test 41 in `scripts/test_engine.py` passing (**41/41 tests passing**).
- **TypeScript Core**: `src/shared/utils/timeline/perspective-grid-ops.ts` with `snapPointToGridLattice`, `snapStrokePolyline`, and `generateGridSvgMarkup`.
- **TypeScript Unit Tests**: `src/shared/utils/timeline/__tests__/perspective-grid-ops.test.ts` passing (**6/6 tests passing**).
- **Schema & Types**: `WhiteboardSettings.gridSubstrate` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard.gridSubstrate` in `src/shared/utils/timeline/effects.ts`.
- **UI Controls**: Integrated into Card 3 of `src/renderer/features/timeline-media/ui/SketchPane.tsx` with mode picker, spacing, snap radius, horizon position, and opacity sliders.
- **Module Exports**: Exported from `src/shared/index.ts`.

