# Step S54: Video Stabilization, Rolling Shutter Correction & Gyro Smoother Engine

## Overview & Background
In professional video editing (such as Adobe Premiere Pro Warp Stabilizer, DaVinci Resolve Camera Stabilizer, and Final Cut Pro SmoothCam):
- **Camera Motion Estimation**: Tracking multi-axis frame jitter: horizontal translation ($\Delta x$), vertical translation ($\Delta y$), roll rotation ($\Delta \theta$), and perspective scaling ($s$).
- **Stabilization Modes**:
  - `smooth_motion`: Retains intentional camera panning while smoothing high-frequency shakes and jitters.
  - `tripod_lock`: Completely freezes camera motion simulating a physical tripod mount on static shots.
  - `translation_only`: Fast 2D position stabilization without rotation warping.
- **Auto-Zoom & Margin Protection**: Automatically zooming in slightly (e.g. 5% to 15%) to eliminate black borders caused by motion compensation transforms.
- **Rolling Shutter Wobble Correction**: Suppressing CMOS sensor line-by-line scanning artifacts (jello effect) from rapid camera motion or vibrations.
- **FFmpeg Master Export Filter Pipeline**: Serializing frame-accurate `deshake` and `vidstabtransform` filter expressions for video export.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/video-stabilizer-ops.ts`)
- `VideoStabilizerSettings`: `{ enabled, mode, smoothness, shakiness, autoCropZoom, rollingShutterCorrection, rollingShutterStrength, preset }`.
- `VideoStabilizerMode`: `'smooth_motion' | 'tripod_lock' | 'translation_only'`.
- `VideoStabilizerPresetKey`: `'handheld_vlog' | 'action_cam_extreme' | 'drone_aerial' | 'tripod_lock'`.
- `DEFAULT_VIDEO_STABILIZER_SETTINGS`: Neutral defaults with stabilization bypassed.
- `VIDEO_STABILIZER_PRESETS`: 4 curated presets (Handheld Vlog, Action Sports, Drone Aerial, Tripod Lock).
- `calculateOptimalZoomMargin(maxDisplacementPx, frameWidth, frameHeight)`: Calculates minimal zoom factor to prevent black edge voids.
- `smoothTrajectoryGaussian(points, windowSize)`: Damps high-frequency motion noise via 1D Gaussian kernel convolution.
- `buildFfmpegStabilizerFilter(settings)`: Synthesizes frame-accurate FFmpeg `deshake` and `scale/crop` filter chains.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `stabilizer?: VideoStabilizerSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.stabilizer` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `video-stabilizer-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Camera Stabilization & Wobble Correction" section under the Video tab for all video clips.
- Integrated master switch, preset buttons, mode selector (`Smooth Motion`, `Tripod Lock`, `Translation Only`).
- Added sliders for Smoothness Window (1–50f), Shakiness Sensitivity (1–10), Auto-Crop Zoom (0%–30%), and Rolling Shutter Correction toggle with De-Wobble depth slider.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/video-stabilizer-ops.test.ts` (10 dedicated unit tests verifying zoom margin formulas, Gaussian trajectory smoothing, preset defaults, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 48 test files passed, 562 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
