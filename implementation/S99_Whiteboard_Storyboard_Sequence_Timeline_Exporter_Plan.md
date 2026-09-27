# Milestone S99: Whiteboard Storyboard Sequence Timeline Exporter & Multi-Scene Packaging Engine

## 1. Context & Motivation
Whiteboard explainer videos and educational presentations almost never consist of a single isolated still. Instead, they unfold as structured, multi-scene storyboards:
- **Scene 1**: Concept Introduction & Main Title.
- **Scene 2**: Problem Breakdown & Architecture Diagram.
- **Scene 3**: Deep Dive / Mathematical Derivation / Detail.
- **Scene 4**: Summary & Call to Action.

Between scenes, the board is either cleared using the physical felt duster wipe (developed in S93) or morphs directly into the next outline (developed in S95). Dialogue and voiceover align with subtitle timecodes, while procedural foley audio plays continuously across the drawn strokes.

Milestone S99 establishes an end-to-end multi-scene storyboard sequence engine across both the Python core engine (`srt-whiteboard-animation-main`) and `VideoStudio` (React/Electron NLE).

### Objectives:
1. **Python Core Engine Multi-Scene Exporter (`scripts/core/storyboard_exporter.py`)**:
   - `StoryboardScene` & `StoryboardPackage` data models.
   - Ken Burns dynamic camera panning/zooming (`zoom_start`, `zoom_end`, `pan_dx`, `pan_dy`).
   - Scene timeline sequencing with automatic eraser-wipe inter-scene transitions or morph cuts.
   - Dual export targets:
     - Direct stitched master video export (`master_storyboard.mp4`) with synchronized voiceover & foley audio track.
     - VideoStudio native project timeline export (`timeline.json` / `sequence.json`) allowing immediate non-linear editing.
2. **Python Engine Verification**:
   - Add **Test 20** to `scripts/test_engine.py`: verifies 3-scene storyboard assembly, duration calculation, transition continuity, and VideoStudio timeline JSON generation.
3. **VideoStudio Timeline Operations (`src/shared/utils/timeline/storyboard-sequence-ops.ts`)**:
   - Zero-dependency TypeScript module to assemble, re-time, and split multi-scene storyboards onto multi-track timelines (Video, Audio, Subtitles, Transitions).
   - Automated layout calculation aligning clip boundaries with speech transcript cues.
4. **Unit Test Suite**:
   - `src/shared/utils/timeline/__tests__/storyboard-sequence-ops.test.ts`.
5. **VideoStudio UI Integration**:
   - Expose Storyboard Sequence generation and scene transition controls in `SketchPane.tsx`.
6. **Full Verification**:
   - All 20/20 Python engine tests passing.
   - All 83/83 VideoStudio test files passing with 0 TypeScript errors.

---

## 2. Architecture & Design

### Phase 1: Python Engine Implementation (`scripts/core/storyboard_exporter.py`)
1. Data models:
   ```python
   @dataclass
   class StoryboardScene:
       scene_id: str
       title: str
       image_path: str
       duration_sec: float
       subtitle_text: str = ""
       hand_stylus: str = "marker"
       erase_out: bool = True
       erase_pattern: str = "zigzag"
       erase_fraction: float = 0.20
       foley_enabled: bool = True
       foley_volume: float = 0.6
       camera_zoom_start: float = 1.0
       camera_zoom_end: float = 1.05
   ```
2. Methods:
   - `calculate_total_duration(package)`
   - `export_to_videostudio_timeline(package, output_json_path, fps=30.0)`
   - `render_storyboard_master(package, output_mp4_path, ffmpeg_bin=None)`
3. Test 20 in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Unit Tests
1. `src/shared/utils/timeline/storyboard-sequence-ops.ts`:
   - Data types matching `StoryboardScene` and `StoryboardPackage`.
   - `buildTimelineClipsFromStoryboard(scenes, options)`: generates video clips, audio clips, subtitle entries, and transitions positioned along the timeline.
   - `validateStoryboardContinuity(scenes)`: checks for gapless timing and valid media references.
2. `src/shared/utils/timeline/__tests__/storyboard-sequence-ops.test.ts`:
   - Validates multi-scene conversion to timeline tracks, frame rounding, and eraser transition boundaries.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Add "Storyboard Sequence" badge and multi-scene packaging export utility in `SketchPane.tsx`.

### Phase 4: Full Validation & Test Suite
- [x] Run `test_engine.py` (20/20 tests passing).
- [x] Run `npx tsc --noEmit` (clean 0 errors).
- [x] Run `npm test` across all 83 test files (985/985 tests passing).

---

## 3. Execution Status: 100% Complete & Verified
- **Python Whiteboard Engine**: `scripts/core/storyboard_exporter.py` with `calculate_storyboard_timeline`, `export_videostudio_timeline_json`, `StoryboardScene`, and `StoryboardPackage`. Verified with Test 20 in `scripts/test_engine.py` (**20/20 passing**).
- **TypeScript Operations**: `src/shared/utils/timeline/storyboard-sequence-ops.ts` built with zero external dependencies, providing `calculateStoryboardSchedule`, `buildStoryboardClips`, and `validateStoryboardContinuity`. Exported via `src/shared/index.ts`.
- **Unit Tests**: `src/shared/utils/timeline/__tests__/storyboard-sequence-ops.test.ts` (**3/3 passing**).
- **UI Integration**: Storyboard Sequence Packaging card and JSON export handler added to `SketchPane.tsx`.
- **Full Suite Health**: 83/83 test files, 985/985 unit tests passing cleanly.

