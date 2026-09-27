# Milestone S110: Whiteboard Multi-Tool Hot-Swapping, Eraser Cap Flip & Sound-Synchronized Tool Carousel
**Status: Complete (100% Verified)**
- Python tests: **31/31 passed** (including Test 31 for multi-tool hot swapping and eraser cap flip)
- VideoStudio tests: **94/94 test files passed, 1,022/1,022 tests passed**
- TypeScript type-checking: **0 errors (`tsc --noEmit` clean)**
- UI: Multi-Tool Swap & Stylus Flip controls integrated into `SketchPane.tsx` Card 3.
Realistic whiteboard illustrations and educational presentations rarely use a single rigid pen across an entire sequence. Presenters fluidly switch between writing notes (fine pen), highlighting key takeaways (translucent highlighter), drawing diagrams (broad chisel marker), and correcting mistakes (eraser cap or felt block).

Milestone S110 introduces:
1. **Eraser Cap Flip Kinematics**:
   - 180° axial flip gesture: When a small correction or highlight lift is triggered, the stylus lifts along a parabolic z-arc, rotates 180° around its roll/pitch axis, and re-engages the surface with the eraser tip.
2. **Dock/Holster Hot-Swapping**:
   - When switching colors (e.g. black pen to red warning marker) or disparate tools (pen to chalk or felt eraser), the hand travels to an off-canvas or corner holster dock, swaps instruments with a grip adjustment, and navigates to the next stroke's entry coordinate.
3. **Sound-Synchronized Foley Cues**:
   - Every tool transition emits synchronized audio triggers (`cap_snap`, `stylus_flip`, `holster_click`) for the procedural whiteboard Foley engine.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/tool_swap_carousel_engine.py`)
1. Data structures:
   - `ToolType`: `'pen' | 'marker' | 'highlighter' | 'eraser_cap' | 'felt_eraser' | 'chalk'`.
   - `ToolTransitionEvent`: `from_tool`, `to_tool`, `transition_type`, `start_sec`, `duration_sec`, `start_pos`, `end_pos`.
2. Kinematic curves:
   - `calculate_tool_flip_poses`: 180° rotation with quadratic apex lift and smooth easing.
   - `calculate_dock_swap_poses`: Dual cubic Bezier curves to corner holster dock with tool handoff at the apex.
3. Foley event cue emitter:
   - Generates timed audio trigger metadata (`cap_snap`, `stylus_flip`, `dock_click`).
4. Standalone **Test 31** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/tool-swap-ops.ts`:
   - Interfaces: `ToolSwapConfig`, `ToolTransitionRecord`, `ToolSwapPoseKeyframe`.
   - Pure functions:
     - `computeToolFlipTrajectory(startPose, endPose, progress)`
     - `computeHolsterSwapTrajectory(startPoint, endPoint, dockPoint, progress)`
     - `generateToolSwapFoleyCues(transitions)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/tool-swap-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `toolSwap`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Multi-Tool Swap & Stylus Flip" controls:
    - Enabled toggle.
    - Transition Style: `flip` (180° Stylus Flip) | `dock` (Corner Holster) | `instant`.
    - Transition Duration slider (0.2s - 1.2s).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (31/31 passing).
- Run `npx tsc --noEmit` (clean).
- Run `npx vitest run` (94/94 passing).
