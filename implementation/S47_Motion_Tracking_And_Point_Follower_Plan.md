# Step S47: Motion Tracking & 2D Point Feature Follower Engine

## Overview & Background
In high-end video editing suites (such as Adobe After Effects, DaVinci Resolve Fusion Tracker, and Apple Final Cut Pro Object Tracker), motion tracking allows creators to isolate and track 2D visual feature points across moving video footage, apply trajectory smoothing to suppress hand tremor / sensor jitter, and automatically bake position coordinates into keyframes or pin overlying elements (animated text, stickers, callout pins, subtitle badges, PiP insets) to match the moving subject seamlessly.

Step S47 implements an end-to-end 2D Motion Tracking & Point Feature Follower pipeline:
1. **2D Point Feature Trajectory Model**:
   - `TrackedPoint`: Frame-accurate normalized coordinates $(x, y) \in [0..1]$ with per-point tracking confidence scores.
   - `MotionTrackingTrajectory`: Structured representation containing identifier, source clip binding, start frame, coordinate vertices, smoothing flag, and average tracking confidence.
2. **Zero-Phase Bidirectional Exponential Moving Average (EMA) Filter**:
   - Implements a two-pass recursive filter:
     $$\text{Forward: } x_f[t] = \alpha \cdot x[t] + (1 - \alpha) \cdot x_f[t-1]$$
     $$\text{Backward: } x_b[t] = \alpha \cdot x_f[t] + (1 - \alpha) \cdot x_b[t+1]$$
   - Eliminates high-frequency noise, sensor jitter, and micro-tremor without introducing phase delay or positional lag.
   - Locks start and end boundary anchors to prevent endpoint shrinkage.
3. **Trajectory-to-Keyframe Baking Engine (`bakeTrajectoryToKeyframes`)**:
   - Transcribes continuous motion trajectories into standard timeline `ClipKeyframe` records on transform properties `'x'` and `'y'`.
   - Supports frame decimation (`stepFrames`), custom anchor offsets ($\Delta x, \Delta y$), and bezier interpolation for butter-smooth playback.
4. **Overlying Clip Pinning (`attachClipToTrajectory`)**:
   - Automatically pins any overlying clip (titles, callouts, stickers, overlays) to a subject's tracked motion.
   - Preserves non-positional keyframes (scale, rotation, opacity, volume) while seamlessly replacing or generating transform position tracks.
5. **Interactive Motion Tracker UI in Clip Inspector (`ClipInspector.tsx`)**:
   - **Crosshair Coordinate Sliders**: Interactive anchor point selection ($X, Y \in [0..1]$).
   - **Motion Pattern Simulation Engine**: Simulates realistic motion models (`linear_pan`, `parabolic_arc`, `orbital_circle`, `wandering_subject`).
   - **Live Trajectory HUD**: Interactive SVG path preview displaying start anchor, ending anchor, and feature path with frame count and confidence readout.
   - **Bidirectional EMA Smoothing Controls**: Real-time adjustable smoothing factor $\alpha \in [0.05..0.50]$ with instantaneous trajectory refinement.
   - **Clip Pinning Selector**: Dynamic dropdown selecting any other clip on the timeline, with relative offset sliders and one-click "Bake & Pin Overlying Clip" action.
   - **Self-Bake Action**: Directly bakes the trajectory into the current clip's transform keyframe tracks.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/motion-tracking-ops.ts`)
- `TrackedPoint`: `{ frame: number; x: number; y: number; confidence: number }`.
- `MotionTrackingTrajectory`: `{ id, name, sourceClipId, startFrame, points, smoothed, averageConfidence }`.
- `smoothTrajectory(points, alpha)`: Bidirectional zero-phase EMA filter.
- `bakeTrajectoryToKeyframes(trajectory, options)`: Decimates and transforms path into `ClipKeyframe` records.
- `attachClipToTrajectory(targetClip, trajectory, offset)`: Connects an overlying clip to the tracked feature.
- `simulateMotionTracking(startCoord, motionType, frameCount, noiseStdDev)`: Deterministic synthetic feature tracker generator.

### 2. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `motion-tracking-ops` for seamless cross-process and UI consumption.

### 3. Inspector Panel (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Integrated `MotionTrackingSection` under the `video` and `basic` tabs for video and still clips.
- Connected tracking, bidirectional EMA smoothing, and clip pinning directly to `useSequenceStore.getState().commitClips` and `patchClip`.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/motion-tracking-ops.test.ts` (8 dedicated tests verifying bidirectional EMA smoothing, bounds protection, keyframe baking with decimation & offsets, overlying clip attachment, and simulation models).
- **Vitest Full Test Suite**: 41 test files passed, 470 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
