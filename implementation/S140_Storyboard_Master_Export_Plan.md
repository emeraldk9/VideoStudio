# Milestone S140: Multi-Track Storyboard Master Mixdown & 4K ProRes/H.265 Export Pipeline

> **Status**: COMPLETED & VERIFIED (Python Test 61 passing; 9 Vitest tests in storyboard-master-export-ops.test.ts passing; full Vitest 124/124 suite passing; TypeScript check 0 errors; SketchPane UI integrated)

## 1. Context & Motivation
Milestone S140 crowns the master whiteboard animation architecture by unifying all procedural optical layers, multi-scene storyboard sequences, and multi-stem foley audio into professional broadcast-ready deliverables:
1. **Multi-Track Audio Stem Mixdown & EBU R128 Loudness Normalization**:
   - Procedural drawing foley (pressure pitch, squeaks, cap snaps, magnetic docking, eraser wipes) + speech voiceover.
   - Dynamic speech ducking ($-6\text{ dB}$ to $-12\text{ dB}$) during active narration.
   - EBU R128 / ITU-R BS.1770-4 two-pass loudness normalization:
     $$\Delta G = \min(\text{Target}_{\text{LUFS}} - \text{Measured}_{\text{LUFS}}, -\text{Peak}_{\text{dBTP}} - 1.0)$$
2. **Master Video Export Presets**:
   - **ProRes 422 HQ (4K 60fps / 10-bit)**: Uncompressed master archiving with PCM 24-bit 48kHz audio.
   - **H.265 / HEVC Main10 (4K 60fps / 10-bit CRF 18)**: High-efficiency master distribution.
   - **H.264 High (1080p 60fps CRF 20)**: Universal web / LMS playback with AAC 320 kbps.
3. **End-to-End Whiteboard Storyboard Filtergraph Compiler**:
   - Assembles multi-scene storyboard sequences with procedural wipes, glass specular glare, paper grain tooth, and solvent vapor shimmer.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/storyboard_master_export_engine.py`)
1. Data Structures:
   - `MasterExportPreset`: enum / dataclass for `'prores_422_hq'`, `'hevc_4k'`, `'h264_web'`.
   - `AudioStemTrack`: audio path/buffer, gain_db, ducking_enabled, role (`'speech'`, `'drawing_foley'`, `'tool_foley'`).
   - `MasterExportConfig`: resolution $(w, h)$, fps, preset, audio_stems, ebu_r128_target_lufs ($-23.0$ or $-14.0$).
2. Core Algorithms:
   - `compute_ebu_r128_gain(current_lufs, target_lufs=-23.0, true_peak_db=-1.0) -> Tuple[float, float]`
   - `build_ffmpeg_master_export_cmd(config, scene_list, output_path) -> List[str]`
   - `synthesize_storyboard_package_manifest(config, scenes, stems) -> dict`
3. Python Unit Test 61:
   - Validates EBU R128 gain calculation and true-peak limiter clamp.
   - Validates FFmpeg command flags correctly map ProRes 422 HQ profile 3, HEVC crf 18, and H.264 profile high.
   - Validates storyboard package manifest JSON serialization.

### Phase 2: VideoStudio Operations & Tests
1. Module: `src/shared/utils/timeline/storyboard-master-export-ops.ts`
   - `computeEbuR128Gain(currentLufs: number, targetLufs?: number, truePeakCeilingDb?: number): { gainDb: number; scaleFactor: number }`
   - `buildMasterExportFfmpegArgs(config: MasterExportConfig): string[]`
   - `validateMasterExportConfig(config: MasterExportConfig): { valid: boolean; errors: string[] }`
2. Unit Tests: `src/shared/utils/timeline/__tests__/storyboard-master-export-ops.test.ts`
3. Schema & Exports:
   - Add `storyboardMasterExport` schema in `effects.ts`.
   - Export from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Storyboard Packaging section:
  - Add Master Mixdown & Export configuration:
    - Master Export Preset selector (ProRes 422 HQ 4K, H.265 4K, H.264 Web).
    - EBU R128 Loudness Target switch (Broadcast -23 LUFS vs Web -14 LUFS).
    - Multi-Stem Foley Mixdown balance sliders (Drawing Foley, Tool Foley, Speech Ducking).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 61 passes in `scripts/test_engine.py` (**61/61 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with all test files green.
3. UI Integration:
   - Controls verified in `SketchPane.tsx`.
4. Documentation:
   - `walkthrough.md` updated with Milestone S140.
