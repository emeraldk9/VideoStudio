# Step S58: AI Smart Scene Cut Detection, Shot Boundary Indexing & Auto-Split Engine

## Overview & Background
In professional non-linear video editing suites (such as DaVinci Resolve Scene Cut Detection, Adobe Premiere Pro Scene Edit Detection, and Apple Final Cut Pro Shot Tracking):
- **Content-Aware Scene Cut Detection**: Inspects inter-frame image differences, normalized luminance/color histogram deltas, and edge changes to identify shot boundaries.
- **Normalized Histogram Manhattan Delta**: Computes normalized difference metric ($0.0 \le \Delta \le 1.0$) between adjacent video frames:
  $$\Delta = \frac{1}{2} \sum_{i=1}^{N} \left| \frac{h_A[i]}{\sum h_A} - \frac{h_B[i]}{\sum h_B} \right|$$
- **Hard Cut vs. Dissolve Classification**: Distinguishes single-frame sharp cuts from multi-frame dissolved transitions where adjacent frame differences remain elevated across contiguous frames.
- **Strobe Flash Rejection**: Suppresses false-positive cuts caused by single-frame camera flashes or strobe lighting by verifying delta dropback within 1–2 frames.
- **Minimum Shot Duration Clustering**: Filters out micro-cuts violating user-defined minimum shot length (6 to 120 frames), retaining the highest confidence cut in each temporal window.
- **Automated Editorial Actions**:
  - **Auto-Split into Clips**: Automatically performs blade cuts at all detected cut points using `splitClipAtFrame`, committing split segments directly to the timeline.
  - **Drop Scene Markers**: Adds color-coded AI markers (`ai` color) at timeline cut points labeled with shot numbers and transition classification.
- **FFmpeg Integration Pipeline**: Emits frame-accurate scene analysis queries using `select='gt(scene,threshold)',showinfo`.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/scene-cut-detection-ops.ts`)
- `SceneCutDetectionSettings`: `{ threshold, minShotDurationFrames, ignoreFlashes, action }`.
- `DetectedCutPoint`: `{ frame, confidence, type }`.
- `DEFAULT_SCENE_CUT_DETECTION_SETTINGS`: Standard studio defaults (threshold 0.40, min duration 24 frames, ignore flashes true).
- `calculateHistogramDelta(histA, histB)`: Computes normalized Manhattan difference between histogram arrays.
- `detectSceneCuts(frameDeltas, settings)`: Identifies cuts, classifies hard vs dissolve, suppresses flashes, and filters by duration.
- `filterCutsByMinDuration(cuts, minDurationFrames)`: Clusters nearby cuts and retains the best candidate.
- `buildFfmpegSceneDetectionCommand(inputPath, threshold)`: Generates frame-accurate FFmpeg scene detection command.

### 2. Shared Exports (`src/shared/index.ts`)
- Exported all symbols and types from `scene-cut-detection-ops`.

### 3. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Smart Scene Cut Detection & Auto-Split" section for video clips under Video tab.
- Integrated Sensitivity threshold slider (10% to 90%), Min Shot Length slider (6 to 120 frames), and Ignore Flashes toggle.
- Built interactive triggers:
  - **Detect & Split Clip**: Automatically invokes `splitClipAtFrame` across all detected cuts and commits split segments to the sequence store.
  - **Add Cut Markers**: Drops timestamped sequence markers with shot numbers and transition type.
  - Live feedback banner displaying cut analysis summary and operation status.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/scene-cut-detection-ops.test.ts` (13 dedicated unit tests verifying histogram deltas, hard cuts, dissolve transitions, strobe rejection, duration pruning, and FFmpeg command emission).
- **Vitest Full Test Suite**: 52 test files passed, 608 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
