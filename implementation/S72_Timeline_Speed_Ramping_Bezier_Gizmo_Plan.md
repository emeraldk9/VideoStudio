# Milestone S72: Interactive Timeline Speed Ramping Bézier Gizmo & Optical Flow Retiming HUD

**Status:** Completed ✅  
**Scope:** Direct timeline clip speed ramping curve editor with keyframe inflection pins, freeze frame hold bars, smooth Bézier acceleration curves, and optical flow retiming controls.

---

## 1. Executive Summary & Problem Statement
In professional cinematic workflows (Premiere Pro Time Remapping, Final Cut Pro Blade Speed, DaVinci Resolve Speed Warp):
- **Current Behavior in VideoStudio:**
  - Speed changes are primarily set via the `SpeedModal.tsx` modal or static percentage values.
  - `speed-ramp-ops.ts` and `optical-flow-ops.ts` exist with pure mathematical routines, but lack a direct in-clip interactive visual speed ramp gizmo on the timeline.
  - Editors cannot visually grab speed curve segments to ramp from 100% to 500% and drop down to 20% slow motion with smooth Bézier ease handles directly on the clip itself.
- **The Solution (Milestone S72):**
  - **In-Clip Speed Ramp Bézier Gizmo (`InlineSpeedRampCurve.tsx`):**
    - Render a speed curve strip directly inside or beneath the clip on the timeline with speed range lines (0%, 50%, 100%, 200%, 400%, 800%).
    - Speed keyframe inflection pins: click or `Alt+Click` to place speed ramp cut points.
    - Drag speed segments up/down to adjust velocity percentage.
    - Bézier transition zones: drag ease handles to create buttery smooth acceleration and deceleration curves without jarring velocity jumps.
    - Freeze Frame Bar: insert hold frames with crosshatch visual styling.
  - **Retiming Quality Selector & Optical Flow Integration:**
    - Toggle retiming interpolation mode: Nearest Frame, Frame Blending, or Optical Flow Motion Vectors.
    - Visual motion vector flow density preview.
  - **Ripple Sequence Option:**
    - Seamlessly ripple timeline sequence duration when speed ramping alters overall clip playback length.

---

## 2. Technical Architecture & Implementation Steps

### 2.1 Pure Speed Ramping & Retiming Operations Extension (`speed-ramp-ops.ts`)
- Add interactive speed segment manipulation helpers:
  - `splitSpeedSegmentAtFrame(curve, frame, newSpeed)`
  - `adjustSegmentSpeed(curve, segmentIndex, newSpeed, ripple)`
  - `updateTransitionEasing(curve, keyframeIndex, easeInFrames, easeOutFrames)`
  - `insertFreezeFrameSegment(curve, atFrame, holdDurationFrames)`
  - `buildSvgSpeedRampPath(curve, clipWidth, clipHeight)`

### 2.2 Unit Test Suite (`src/shared/utils/timeline/__tests__/speed-ramp-ops.test.ts`)
- Verify speed segment splitting, velocity adjustments, and ripple calculations.
- Verify Bézier easing transition curve generation.
- Verify freeze frame segment insertion.

### 2.3 UI Speed Ramp Gizmo Component (`InlineSpeedRampCurve.tsx`)
- SVG interactive speed graph overlaid on `TimelineClip.tsx`.
- Draggable speed bars, inflection pins, and ease handles.
- Toggle button in `TimelineClip.tsx` (Speed icon) and hotkey `Alt+R`.

---

## 3. Verification Plan
- Unit tests: `npx vitest run src/shared/utils/timeline/__tests__/speed-ramp-ops.test.ts`.
- Full test suite: `npx vitest run` (target: 64/64 suites passing, 780+ tests).
- Static check: `npm run typecheck` (`tsc --noEmit`): 0 errors.
