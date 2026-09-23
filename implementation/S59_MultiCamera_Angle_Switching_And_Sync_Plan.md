# Step S59: Multi-Camera Angle Switching, Waveform Audio Sync & MultiCam Engine

## Overview & Background
In professional broadcast, multicam interviews, and music concert production (such as DaVinci Resolve Multicam Clip, Adobe Premiere Pro Multi-Camera Source Sequence, and Apple Final Cut Pro Multicam):
- **Multi-Camera Angle Grouping**: Unifying multiple simultaneous camera angles (e.g., Cam A Master/Wide, Cam B Close-up, Cam C Reaction, Cam D Overhead) into a single editorial container on the timeline.
- **Audio Waveform Cross-Correlation Synchronization**:
  - Automatically determining the temporal frame offset $\tau$ between camera takes by calculating the cross-correlation function between their audio amplitude envelopes:
    $$R_{xy}(\tau) = \frac{1}{N} \sum_{t} x[t] \cdot y[t + \tau]$$
  - Pinpoints exact frame alignment without manual clap-matching.
- **Non-Destructive Active Angle Switching**:
  - Editors can switch the active camera view of any multi-camera cut on the timeline at any time without altering cut timings, transitions, or track layout.
- **Audio-Follows-Video vs. Dedicated Audio Master**:
  - Provides the option to lock the audio track to a master microphone / primary camera or have the audio stream dynamically follow the active video angle.
- **Inspector MultiCam Matrix HUD**:
  - Interactive 2x2 grid representing camera angles with active status pulse, per-angle frame offset readouts, sync method selector (`Audio Waveform`, `First In-Point`, `Timecode`), and audio-follows-video toggle.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/multi-cam-ops.ts`)
- `MultiCamAngle`: `{ id, name, cameraLabel, sourceMediaId, syncOffsetFrames, colorTag }`.
- `MultiCamClipSettings`: `{ enabled, activeAngleIndex, angles, audioFollowsVideo, syncMethod }`.
- `DEFAULT_MULTICAM_SETTINGS`: Neutral defaults with multiCam bypassed.
- `calculateCrossCorrelationOffset(envelopeA, envelopeB, maxSearchFrames)`: Computes maximum cross-correlation lag to calculate relative frame sync offset.
- `switchActiveAngle(settings, targetIndex)`: Non-destructively switches active angle, safely clamping within angle array bounds.
- `createMultiCamGroup(cameraNames)`: Factory scaffolding multi-camera setup from camera labels.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `multiCam?: MultiCamClipSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.multiCam` in Zod schema.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all symbols and types from `multi-cam-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Multi-Camera Angle Switcher (MultiCam)" section for video clips under Video tab.
- Integrated master switch, 2x2 multi-camera angle switcher buttons with active pulse indicator, camera labels, and per-angle sync offset indicators.
- Added Sync Source dropdown (`Audio Waveform`, `First In-Point Frame`, `Source Timecode`).
- Added Audio Follows Video toggle switch with explanatory subtitle.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/multi-cam-ops.test.ts` (10 dedicated unit tests verifying cross-correlation lag calculation, positive/negative offsets, angle switching, bounds clamping, undefined safety, and group factory creation).
- **Vitest Full Test Suite**: 53 test files passed, 618 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
