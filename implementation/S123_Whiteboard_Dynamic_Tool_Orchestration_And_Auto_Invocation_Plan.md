# Milestone S123: Whiteboard Dynamic Tool Auto-Invocation, Staging Carousel & Retraction Dynamics

## 1. Context & Motivation
In live whiteboard lectures, presenters constantly transition between instruments without manual button presses:
1. **Intelligent Gesture Auto-Invocation**:
   - Long straight line gesture $\implies$ Auto-invokes Vector Ruler drafting guide along the stroke vector.
   - Circular arc gesture $\implies$ Auto-invokes Compass with fixed needle pivot.
   - Point-and-hold stationary hesitation $\implies$ Auto-activates Laser Pointer with phosphor luminescence.
   - Vigorous zigzag wiping $\implies$ Auto-swaps to Felt Eraser block with wiping contact foley.
2. **Staging Dynamics & Smooth Retraction**:
   - Tools don't instantaneously pop in/out: they slide smoothly from the tray boundary with inertial spring physics (`ease-out-back`), align to the active stroke trajectory, and retract when drawing concludes.
3. **Parametric Orchestration**:
   - Configurable sensitivity, tray staging speed, and tool auto-dismiss timeout ($t_{dismiss} \in [0.2\text{s}, 2.0\text{s}]$).

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/tool_orchestrator_engine.py`)
1. Data structures:
   - `ToolOrchestrationConfig`:
     - `enabled: bool = True`
     - `auto_ruler_threshold_px: float = 80.0`   # Line length threshold to invoke ruler
     - `auto_laser_hold_sec: float = 0.40`       # Hover hesitation time to invoke laser
     - `tool_enter_duration_sec: float = 0.25`   # Slide-in transition duration
     - `tool_dismiss_timeout_sec: float = 0.60`  # Idle duration before tool retraction
     - `tray_position: str = 'bottom-right'`     # Staging tray screen quadrant
2. Core algorithms:
   - `classify_drawing_intent(recent_points, timestamp_sec, is_touching)`:
     - Identifies intended tool: `'pen' | 'ruler' | 'compass' | 'laser' | 'eraser'`.
   - `compute_tool_staging_transform(active_tool, progress, stroke_anchor, canvas_shape)`:
     - Calculates 2D affine transform $(x, y, \theta, \text{scale})$ for smooth sliding tool entrance and retraction.
3. Standalone **Test 44** in `scripts/test_engine.py`:
   - Validates drawing intent classification, transition staging transforms, and auto-dismiss timeouts.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/tool-orchestration-ops.ts`:
   - Interfaces: `ToolOrchestrationSettings`, `ToolIntentClassification`.
   - Pure functions:
     - `classifyStrokeIntent(stroke: Point2D[], holdDurationSec: number): ToolIntentClassification`
     - `calculateToolStagingTransform(tool: string, entranceProgress: number, target: Point2D): { x: number; y: number; opacity: number }`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/tool-orchestration-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.toolOrchestrator` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.toolOrchestrator` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Dynamic Tool Orchestration & Auto-Invocation" section:
    - Enabled toggle.
    - Auto-Ruler gesture detection toggle.
    - Auto-Laser hover detection toggle.
    - Tool Staging Duration slider (0.1s to 0.8s).
    - Auto-Dismiss Timeout slider (0.2s to 1.5s).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 44/44 passing) -> **VERIFIED (44/44 passing)**.
- Run `npx tsc --noEmit` (clean exit 0) -> **VERIFIED (clean exit 0)**.
- Run `npx vitest run` (ensure 107/107 test files passing, 1,070+ tests) -> **VERIFIED (107/107 test files, 1,071/1,071 tests passing)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- **Python**: `scripts/core/tool_orchestrator_engine.py` created with drawing intent classification (ruler for straight chords, laser for hover hesitation, eraser for rapid zigzag, pen for curves) and ease-out staging affine transforms.
- **Python Test**: Standalone Test 44 in `scripts/test_engine.py` (**44/44 passing**).
- **TypeScript**: `src/shared/utils/timeline/tool-orchestration-ops.ts` with `classifyDrawingIntent` and `calculateToolStagingTransform`.
- **TypeScript Test**: `src/shared/utils/timeline/__tests__/tool-orchestration-ops.test.ts` (**5/5 passing**).
- **Schema & Types**: `WhiteboardSettings.toolOrchestrator` in `whiteboard.ts` and `clipEffectsSchema.whiteboard.toolOrchestrator` in `effects.ts`.
- **UI**: Added Dynamic Tool Auto-Invocation section in `src/renderer/features/timeline-media/ui/SketchPane.tsx` Card 3 with ruler trigger, laser hold, staging speed, and dismiss delay sliders.
- **Module Exports**: Exported in `src/shared/index.ts`.

