# Milestone S118: Whiteboard Smart Geometric Shape Recognition & Snap-to-Vector Primitive Engine

## 1. Context & Motivation
Presenters drawing diagrams, flowcharts, technical schematics, or mathematical illustrations frequently sketch rough, wobbly geometric forms:
1. **Rough Hand-Drawn Inaccuracies**:
   - Skewed rectangles, imperfect circles, wobbly triangles, and uneven arrows detract from professional educational presentations.
2. **Intelligent Geometric Classification**:
   - The engine analyzes stroke closure, curvature profile, corner clustering, and chord ratio to classify:
     - **Circle & Ellipse**: Radial consistency from centroid, high isoperimetric compactness.
     - **Rectangle & Square**: 4 dominant orthogonal corners, opposite edge parallelism.
     - **Triangle**: 3 dominant corner vertices, sharp angle closure.
     - **Straight Line & Arrow**: High chord-to-arc-length ratio, directional angle snap ($0^\circ, 30^\circ, 45^\circ, 90^\circ$).
3. **Smooth Geometric Regularization & Path Morphing**:
   - Instead of jarring replacement, rough input strokes smoothly morph into mathematically crisp Bézier or polygonal vector primitives.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/shape_recognizer_engine.py`)
1. Data structures:
   - `RecognizedShapeType`: `'circle' | 'ellipse' | 'rectangle' | 'triangle' | 'line' | 'freehand'`
   - `ShapeRecognitionResult`:
     - `shape_type: RecognizedShapeType`
     - `confidence: float`
     - `regularized_points: List[Tuple[float, float]]`
     - `center: Tuple[float, float]`
     - `rotation_deg: float`
     - `area: float`
2. Core classification & regularization algorithms:
   - `calculate_polygon_area_and_perimeter(points)`: Green's theorem area and total perimeter.
   - `classify_and_regularize_stroke(points, snap_tolerance=0.20)`:
     - Detects closure distance threshold.
     - If unclosed and chord/length > 0.92: regularizes to crisp straight line with optional 15-degree angle snap.
     - If closed:
       - RDP corner reduction (epsilon = 0.05 * perimeter).
       - 3 corners: fits planar triangle.
       - 4 corners: fits bounding oriented rectangle with orthogonalized $90^\circ$ corners.
       - Curvature circularity: if compactness $P^2 / (4\pi A) \approx 1.0 \pm 0.25$, generates ideal circle/ellipse arc points.
3. Standalone **Test 39** in `scripts/test_engine.py`:
   - Validates classification of wobbly circles, hand-drawn rectangles, triangles, and straight lines into regularized shapes.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/shape-recognizer-ops.ts`:
   - Interfaces: `ShapeRecognitionSettings`, `RecognizedShapeResult`, `ShapeType`.
   - Pure functions:
     - `recognizeGeometricShape(points: Point2D[], tolerance?: number): RecognizedShapeResult`
     - `generateRegularizedShapeSvg(shape: RecognizedShapeResult): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/shape-recognizer-ops.test.ts`.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Update `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Smart Shape Regularization" section:
    - Enabled toggle.
    - Recognition Sensitivity slider (50% – 95%).
    - Angle Snapping toggle (snaps lines to $0^\circ, 45^\circ, 90^\circ$).
    - Morph Transition Duration slider (0.1s – 0.8s).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (39/39 passing) - **Verified [PASS]**
- Run `npx tsc --noEmit` (clean exit code 0) - **Verified [PASS]**
- Run `npx vitest run` (102/102 test files passing, 1,049/1,049 tests passing) - **Verified [PASS]**

## 3. Status: 100% Complete & Verified
- Python engine: `scripts/core/shape_recognizer_engine.py`
- Python Test 39: Passing in `scripts/test_engine.py`
- TypeScript operations: `src/shared/utils/timeline/shape-recognizer-ops.ts`
- Vitest suite: `src/shared/utils/timeline/__tests__/shape-recognizer-ops.test.ts` (3/3 passing)
- Schema & Exports: `whiteboard.ts`, `effects.ts`, `src/shared/index.ts`
- UI controls: `SketchPane.tsx` Card 3 with interactive shape recognition tolerance slider, straight line angle snapping toggle, and morph transition duration slider.

---

## 4. Horizon Roadmap: Subsequent Milestones
- **Milestone S119**: Whiteboard Laser Pointer Tracker, Optical Phosphor Persistence & Luminescent Afterglow Trails.
- **Milestone S120**: Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective.
