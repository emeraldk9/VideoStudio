# Milestone S112: Whiteboard Real-Time Vector Ruler, Compass & Geometric Drafting Guide System
**Status: Complete (100% Verified)**
- Python tests: **33/33 passed** (including Test 33 for vector ruler slide and compass arc drafting)
- VideoStudio tests: **96/96 test files passed, 1,029/1,029 tests passed**
- TypeScript type-checking: **0 errors (`tsc --noEmit` clean)**
- UI: Geometric Drafting Guides controls integrated into `SketchPane.tsx` Card 3.
In STEM, geometry, architectural, and educational explainer videos, presenters frequently utilize physical drafting guides:
1. **Straightedge Ruler**:
   - For long linear edges (axes, grid lines, geometric polygon edges), an acrylic or wooden ruler smoothly slides into place alongside the stroke path, allowing the pen to draw along its bevelled edge before lifting or rotating to the next segment.
2. **Drafting Compass**:
   - For circular arcs and planetary/mechanical diagrams, a drafting compass plants its pivot point at the arc center and sweeps its pencil leg along the perimeter.
3. **Sound-Synchronized Drafting Foley**:
   - Realistic wooden/acrylic friction slide (`ruler_slide`) and compass needle placement (`compass_tap`) triggers.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/drafting_guide_engine.py`)
1. Data models:
   - `GuideType`: `'ruler' | 'compass' | 'triangle' | 'none'`.
   - `RulerPose`: `origin`, `angle_deg`, `length`, `width`, `opacity`, `material`.
   - `CompassPose`: `pivot`, `lead_pos`, `angle_deg`, `radius`, `opacity`.
2. Geometric analysis:
   - `detect_linear_segment(points, min_len, colinearity_threshold)`: tests maximum perpendicular deviation along chord length.
   - `calculate_ruler_slide_trajectory(from_pose, to_line, duration, fps)`: smooth translation and rotation easing into place.
   - `calculate_compass_arc_trajectory(center, radius, start_ang, end_ang, duration, fps)`.
3. Standalone **Test 33** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/drafting-guide-ops.ts`:
   - Data models: `DraftingGuideSettings`, `RulerGuideGeometry`, `CompassGuideGeometry`.
   - Pure functions:
     - `detectLinearGuideOpportunity(points, minLength, linearityTol)`
     - `computeRulerAlignment(p1, p2, offsetDist)`
     - `generateRulerSvgMarkup(ruler)`
     - `generateCompassSvgMarkup(compass)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/drafting-guide-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `draftingGuide`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Geometric Drafting Guides" controls:
    - Enabled toggle.
    - Guide Mode: Auto / Ruler / Compass.
    - Guide Material: Acrylic / Wood / Metal.
    - Audio Cues toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (33/33 passing).
- Run `npx tsc --noEmit` (clean).
- Run `npx vitest run` (96/96 passing).
