# Step S52: Optical Flow Motion Estimation & AI Video Super Slow-Motion Frame Interpolation Engine

## Overview & Background
In professional post-production (such as DaVinci Resolve Optical Flow / Speed Warp, Adobe Premiere Pro Optical Flow Time Remapping, Final Cut Pro Optical Flow, and CapCut Smooth Slow-Mo), playing standard footage at fractional speeds (e.g., 50%, 25%, 10%) without camera high-speed recording causes choppy, repeating frames:
- **Optical Flow Motion Vector Estimation**: Tracking pixel displacement trajectories between consecutive frames $(I_t \leftrightarrow I_{t+1})$ using forward and backward vector fields.
- **Sub-Frame Synthetic Intermediate Frame Generation**: Synthesizing entirely new intermediate photorealistic frames positioned precisely along the sub-frame timeline playhead.
- **Occlusion & Artifact Suppression**: Detecting bidirectional motion inconsistencies where objects enter or leave the frame to prevent warping or tearing artifacts.
- **Retiming Interpolation Algorithms**:
  - `nearest`: Frame repetition (standard budget playback).
  - `blend`: Linear frame cross-dissolve (ghosting/motion blur look).
  - `optical_flow`: Sub-pixel motion vector field warping.
  - `smooth_motion`: Advanced bidirectional vector interpolation with Overlapped Block Motion Compensation (AOBMC).
- **FFmpeg Master Export Filter Pipeline**: Serializing frame-accurate `minterpolate=fps=...:mi_mode=mci:mc_mode=...:me_mode=bidir:vsbmc=1:scd=fdiff:scd_threshold=...` filter chains for video export.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/optical-flow-ops.ts`)
- `OpticalFlowSettings`: `{ enabled, mode, targetFps, speedMultiplier, motionVectorPrecision, sceneChangeThreshold, blockOverlapPct, preset }`.
- `OpticalFlowMode`: `'nearest' | 'blend' | 'optical_flow' | 'smooth_motion'`.
- `MotionVectorPrecision`: `'pixel' | 'half_pixel' | 'quarter_pixel'`.
- `OpticalFlowPresetKey`: `'smooth_slow_mo_4x' | 'extreme_dream_mo_10x' | 'action_sports_2x' | 'cinematic_60fps_fluid'`.
- `DEFAULT_OPTICAL_FLOW_SETTINGS`: Neutral defaults with optical flow bypassed.
- `OPTICAL_FLOW_PRESETS`: 4 curated presets (4x Fluid Slow-Mo, 10x Dream-Mo, 2x Action Sports, Fluid 60fps HFR).
- `calculateMotionVector(x1, y1, x2, y2, dt)`: Computes displacement vector $(\Delta x, \Delta y)$ and Euclidean velocity magnitude.
- `calculateInterpolatedWeights(timeFraction)`: Computes forward and backward bidirectional warping weights using a smooth cosine ease.
- `detectSceneCutBreak(similarityScore, threshold)`: Prevents morphing across hard scene cuts.
- `buildFfmpegOpticalFlowFilter(settings)`: Synthesizes frame-accurate FFmpeg `minterpolate` filter expression.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `opticalFlow?: OpticalFlowSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.opticalFlow` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `optical-flow-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Optical Flow & Smooth Slow-Mo" section under the Video / Speed tab for all video clips.
- Integrated master switch, preset buttons, algorithm selector (`Nearest`, `Blend`, `Optical Flow`, `Smooth Motion`).
- Added interactive sliders for Speed Rate Multiplier ($0.05\times$ to $1.0\times$ with slow-mo factor display), Target FPS ($24$ to $120\text{ fps}$), Motion Vector Precision chips, Scene Change Break Threshold ($10\%$ to $90\%$), and Overlapped Block Motion Compensation (OBMC $0\%$ to $100\%$).

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/optical-flow-ops.test.ts` (15 dedicated unit tests verifying motion vectors, cosine interpolation weights, scene cut breaks, preset boundaries, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 46 test files passed, 540 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
