# S44: Audio Beat & Rhythm Transient Detection Engine (Onset Energy Flux, BPM Tempo Estimation, Rhythmic Marker Grid & Auto-Cut to Beat)

## 1. Overview & Objective
Step S44 introduces a professional **Audio Beat & Rhythm Transient Detection Engine** into VideoStudio, empowering creators to seamlessly edit video footage synchronously to music tracks, trailers, and rhythmic speech without tedious manual scrubbing or visual waveform guessing.

Key capabilities delivered:
- **Onset Energy Flux & Transient Detection (`detectTransients`)**:
  - Computes half-wave rectified forward difference flux $D(t) = \max(0, A(t) - A(t-1))$ over audio energy samples.
  - Adaptive dynamic thresholding $T(t) = \mu(t) + \lambda \cdot \sigma(t) + \text{offset}$ with local sliding window statistics.
  - Peak picking with refractory suppression (`minDistanceFrames`) to avoid false multi-triggers on sustained audio signals.
- **Tempo & BPM Estimation (`estimateBpmFromOnsets`)**:
  - Inter-Onset Interval (IOI) histogram clustering with tolerance matching to identify dominant musical tempo.
  - Harmonic folding algorithm guaranteeing realistic musical BPM values within the standard tempo range ($65 \le \text{BPM} \le 185$).
  - Mathematical confidence scoring assessing rhythmic regularity across intervals.
- **Automated Beat Marker Generation (`generateBeatGridMarkers`)**:
  - Converts detected transient onsets into standardized `SequenceMarker` objects with dedicated `'ai'` color tokens and musical measure/subdivision labels (`Beat 1.1`, `Beat 1.2`, `Beat 1.3`, `Beat 1.4`, `Beat 2.1`...).
- **Rhythmic Montage Splitting (`autoCutClipsOnBeats`)**:
  - Non-destructive, pure functional timeline operator that splits clips on target video tracks precisely at musical beat frames.
  - Preserves head/tail transitions, calculates exact `sourceInFrames` and `sourceOutFrames` offsets, and contiguously re-indexes `orderIndex`.
- **Inspector UI Suite Integration**:
  - Dedicated **Rhythm & Beat Detection** panel in `ClipInspector.tsx` for audio clips.
  - Interactive sensitivity selector (`Low`, `Balanced`, `High`) and beat density modes (`Quarter (1/4)`, `Half (1/2)`, `Downbeats (1/1)`).
  - Live readout of estimated BPM tempo and rhythm confidence.
  - One-click "Add Beat Markers to Timeline" action.
  - Track-targeted "Cut Target Track to Beat" montage cutter.

---

## 2. Architecture & Implementation

### A. Core Mathematical & Algorithmic Engine
- **File**: `src/shared/utils/timeline/beat-detection-ops.ts`
  - Defines `OnsetDetectionParams`, `BpmEstimationResult`, and `BeatMarkerOptions`.
  - `computeRmsEnvelope`: Moving RMS energy calculator for sliding-window smoothing.
  - `detectTransients`: Half-wave forward energy flux with adaptive local variance thresholding.
  - `estimateBpmFromOnsets`: IOI clustering and harmonic folding for tempo estimation.
  - `generateBeatGridMarkers`: Generates structured `SequenceMarker[]` with measure numbering.
  - `autoCutClipsOnBeats`: Splices clips at beat frames on designated tracks with edge margins.
  - `generateSyntheticBeatWaveform`: Pulse train generator for testing and metronome reference.

### B. Shared Exports
- **File**: `src/shared/index.ts`
  - Re-exported all beat detection types and operators.

### C. Inspector UI Suite
- **File**: `src/renderer/features/timeline-edit/ui/ClipInspector.tsx`
  - Integrated `BeatDetectionSection` component displayed when inspecting audio tracks/clips.
  - Includes sensitivity and beat density chips, analysis trigger, tempo readout, marker importer, and auto-cut tool.

---

## 3. Verification & Test Results
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/beat-detection-ops.test.ts`: **14/14 unit tests passed**.
  - Full suite: **38 test files passed, 440/440 unit tests passed (100% pass rate)**.
- **TypeScript Typecheck**:
  - `npm run typecheck` (`tsc --noEmit`): **0 errors (Exit Code 0)**.
- **Production Bundles**:
  - `npx vite build --config vite.renderer.config.ts`: **Successfully built in 9.02s (Exit Code 0)**.
  - `npx vite build --config vite.main.config.ts`: **Successfully built in 8.82s (Exit Code 0)**.
