# VideoStudio: Master Strategic Roadmap & Next Steps (Milestones S156 – S161)

**Document Version:** 1.0.0  
**Status:** Ready / Proposed  
**Date:** 2026-09-27  
**Scope:** Architectural modularization of the 9,018-line `SketchPane`, multi-stem Dolby Atmos offline render synthesis, GPU hardware-accelerated encoding profiles, hierarchical track folders, live canvas drawing capture, and desktop release packaging.

---

## 1. Executive Summary & App Health Audit

Through **Milestones S1 to S155**, VideoStudio has achieved full desktop NLE capabilities across multi-track timeline editing, audio mixing & mastering (Atmos 7.1.4, binaural psychoacoustics, 4-stem vocal separator), AI computer vision (auto-reframe, auto-beats, auto-captions STT, multi-language translation, portrait matting, color matching), and whiteboard/vector animation suite.

### Current System Health Metrics
- **Unit Test Suite:** **139 passed test suites (139/139), 1,345 passed unit tests (100% pass rate)**.
- **Static Type Check:** **0 errors** across main, renderer, and shared packages via `tsc --noEmit`.
- **Git Tree:** Clean working tree on `origin/main` (latest commit `fceca2f`).

---

## 2. Identified Bottlenecks & Critical Opportunities

1. **`SketchPane.tsx` Mega Component (9,018 lines)**:
   - Just as `ClipInspector.tsx` grew to 7,846 lines and was refactored in S61 into 14 memoized tabs, `SketchPane.tsx` has reached 9,018 lines (~438 KB) due to inlining all S87–S155 cards, controls, and physics settings.
   - Decomposing this file into dedicated sub-cards under `src/renderer/features/timeline-media/ui/sketch/` will drastically lower compile times, isolate React re-renders, and make editing clean and fast.

2. **FFmpeg Render Engine Multi-Stem & Atmos Synthesis Gap**:
   - The S87–S155 features (3D spatial audio panning, Dolby Atmos 7.1.4 bed, ITU-R BS.2076 ADM BWF metadata, procedural stroke fragment shaders, dry-erase ghosting, paper texture) are fully modeled and tested in pure math, but need full offline synthesis in `sequence-render-service.ts` so users can export multi-track audio stems and Atmos beds directly.

3. **GPU Hardware-Accelerated Encoding Profiles**:
   - Currently, software encoders (`libx264`, `libx265`, `libvpx-vp9`) handle rendering. Adding GPU acceleration (NVIDIA NVENC, Intel QuickSync, AMD AMF, Apple VideoToolbox) and professional mastering codecs (Apple ProRes 422 HQ / 4444, Avid DNxHR HQX) will provide 4x–8x faster exports.

4. **Timeline Track Organization & Keymap Profiles**:
   - High-track-count projects (15+ tracks with video, whiteboard, B-roll, subtitles, 4-stem audio, foley, SFX, music) need hierarchical track folders with group mute/solo and collapse/expand.
   - Editors coming from DaVinci Resolve, Premiere Pro, Final Cut Pro, or CapCut benefit from selectable keymap profiles.

5. **Real-Time Canvas Stylus Recording**:
   - Adding a live inking record mode directly on the canvas monitor allows creators to sketch in real time with pen pressure and audio foley feedback, automatically generating a keyframed whiteboard clip on the timeline.

6. **Release Packaging & Installer Verification**:
   - Electron Forge packaging verification (`npm run package` / `npm run make`), ensuring native dependencies (`better-sqlite3`, `onnxruntime-node`, `ffmpeg-static`) package cleanly for Windows distribution.

---

## 3. Detailed Milestone Roadmap (S156 – S161)

| Step | Milestone Name | Objective & Scope | Status |
| :--- | :--- | :--- | :--- |
| **S156** | **`SketchPane.tsx` Modular Decomposition & Memoization** | Decompose the 9,018-line `SketchPane.tsx` into 10 modular sub-cards under `ui/sketch/`. Target: `SketchPane.tsx` < 450 lines, 0 regressions, all 139 test files passing. | **Completed (432 lines, 139/139 passed)** |
| **S157** | **FFmpeg Multi-Stem & Atmos Offline Render Synthesis** | Wire the S87–S155 audio engines into `sequence-render-service.ts`. Enable Render Queue export of discrete stems (Dialogue, Foley, Music, SFX, Master, Atmos 7.1.4 bed WAV / ADM BWF XML). | **Completed (139/139 passed, 1,359 tests)** |
| **S158** | **GPU Hardware-Accelerated Encoding & Pro Codec Profiles** | Auto-detect NVENC, QSV, AMF, and VideoToolbox. Add Apple ProRes 422 HQ/4444 and Avid DNxHR HQX presets to `ExportModal.tsx`. | **Next Up (Ready)** |
| **S159** | **Hierarchical Track Folders & NLE Keymap Profiles** | Add collapsible timeline track groups with group mute/solo/fader controls. Add customizable keymap profiles (Resolve, Premiere, FCP, CapCut). | **Proposed** |
| **S160** | **Live Canvas Stylus Recording & Timeline Capture** | Real-time stylus/pointer drawing mode on the preview canvas that captures strokes, pressure, and timing directly into a timeline whiteboard clip. | **Proposed** |
| **S161** | **Electron Desktop Packaging & Release Build Audit** | Run full `electron-forge package` and Squirrel installer generation; verify native bindings and runtime performance. | **Proposed** |

---

## 4. Execution Plan for Milestone S156

### Step-by-Step Architecture for S156
1. Create directory `src/renderer/features/timeline-media/ui/sketch/`.
2. Extract cards:
   - `WritingCategoryCard.tsx`
   - `WipeCategoryCard.tsx`
   - `ZonesCategoryCard.tsx`
   - `TraceCategoryCard.tsx`
   - `WhiteboardTimingCard.tsx`
   - `WhiteboardStylusCard.tsx`
   - `WhiteboardPhysicsCard.tsx`
   - `WhiteboardAtmosAudioCard.tsx`
   - `WhiteboardStudioToolsCard.tsx`
3. Refactor `SketchPane.tsx` to cleanly orchestrate these 9 components.
4. Verify all 1,345 unit tests pass (`npm test`) and `npm run typecheck` passes with 0 errors.
