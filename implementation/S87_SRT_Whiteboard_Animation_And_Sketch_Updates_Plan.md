# S87: SRT Whiteboard Animation Codebase Audit & Sketch Update Architecture Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S87_SRT_Whiteboard_Animation_And_Sketch_Updates_Plan.md`  
**Target Repository**: `C:\Users\vivan\Documents\My Apps\srt-whiteboard-animation-main`  
**Integration Synergy**: VideoStudio Whiteboard & Sketch Track System (`SketchKeyframeLane.tsx`, `whiteboard.ts`, `whiteboard-trace.ts`)  
**Status**: 🟢 Core Implementation Complete & Verified  
**Standard**: Classical Vision & Vector Sketch Animation Engineering (VideoScribe, Doodly, SVG Path Tracing, CapCut Whiteboard)

---

## Progress Checklist & Tracker

- [x] **Phase 1: Deep Codebase Audit & Defect Remediation in `srt-whiteboard-animation-main`**
  - [x] **Audit Item 1.1**: Resolve cross-platform font crash in `scripts/render_annotation_preview.py` (replace hardcoded `C:/Windows/Fonts/msyh.ttc` with dynamic system font resolution & Pillow fallback).
  - [x] **Audit Item 1.2**: Fix missing `protectedRegions` visualization in `render_annotation_preview.py` (render hatched protection zones and boundary warning halos).
  - [x] **Audit Item 1.3**: Eliminate disk I/O bottleneck & temporary raw video clutter in `render_stream_whiteboard.py` and `stream_render.py`.
  - [x] **Audit Item 1.4**: Fix unsafe 4-corner background sampling in `_match_original_background` to prevent background color corruption on sketches with border lines or corner drawings (perimeter ribbon sampling).
  - [x] **Audit Item 1.5**: Unify code duplication into shared core module (`scripts/core/`).
  - [x] **Audit Item 1.6**: Fix Windows console `cp1252` encoding crashes across all scripts by adding `ensure_utf8_streams()`.

- [x] **Phase 2: Sketch Stroke Engine & Natural Human Drawing Optimization**
  - [x] **Optimization 2.1**: Replace crude 12px scanline stroke ordering (`min(ys) // 12`) with **Semantic Topological Stroke Hierarchy**:
    - Hierarchy tier 1: Outer silhouettes / structural boundaries.
    - Hierarchy tier 2: Internal feature strokes & connected contours.
    - Hierarchy tier 3: Fine cross-hatching, textures, and details.
  - [x] **Optimization 2.2**: Accelerated Morphological Thinning / Skeletonization:
    - Morphological thinning with fast C++ `cv2.ximgproc` when available and vectorized NumPy fallback.
  - [x] **Optimization 2.3**: Chaikin curve smoothing & arc-length resampling to eliminate 1px pixel-staircase artifacts.

- [x] **Phase 3: Interactive Sketch Updates & Annotation Workflow in `preview.html`**
  - [x] **Feature 3.1**: Live Protected Region Visualizer & Editor in Web Preview:
    - Interactive overlay for `protectedRegions` with warning dashed borders and resize handles.
    - Protected region management in sidebar (list, add, delete, drag, resize).
  - [x] **Feature 3.2**: Subtitle & timecode synchronization display on preview cards.
  - [x] **Feature 3.3**: In-Browser 60 FPS Drawing Stroke & Pen Path Simulation in `preview.html`:
    - 3-tier semantic hierarchy stroke generator (outer silhouette loop $\to$ internal feature lines $\to$ cross-hatch shading).
    - Progressively rendered graphite ink linework followed by radial color wash bloom.
    - Synchronized hand pen tip trajectory following actual stroke path coordinates.

- [x] **Phase 4: Seamless VideoStudio Integration & Bidirectional Bridge**
  - [x] **Integration 4.1**: Bidirectional converter (`scripts/videostudio_bridge.py`) between `annotation.json` and VideoStudio `WhiteboardSettings` (`zones` + `inFraction` + `drawFraction`).
  - [x] **Integration 4.2**: Timeline Keyframe alignment: mapping `startMs`, `durationMs` to `inFraction` / `drawFraction` on VideoStudio's `SketchKeyframeLane.tsx`.
  - [x] **Integration 4.3**: Native SVG vector line art parser (`scripts/core/vector_sketch.py`) bypassing raster thinning.
  - [x] **Integration 4.4**: Incremental disk-backed sketch cache engine (`scripts/core/cache_engine.py`) keyed by content hashes.
  - [x] **Integration 4.5**: End-to-end multi-scene batch orchestrator (`scripts/batch_pipeline.py`) with dialogue audio mixdown.
  - [x] **Integration 4.6**: Automated test suite (`scripts/test_engine.py`) verifying all 7 core engine components (100% pass).
  - [x] **Integration 4.7**: VideoStudio UI Bridge in `WhiteboardZoneEditorModal.tsx`:
    - Direct "Import Annotation" and "Export Annotation" action buttons in the modal footer.
    - `exportWhiteboardAnnotation` and `importWhiteboardAnnotation` core conversion functions in `src/shared/utils/timeline/whiteboard.ts`.
    - Unit tests in `src/main/media/__tests__/sketch-keyframes.test.ts` verifying seamless roundtrip and coordinate normalizations.
  - [x] **Integration 4.8**: VideoStudio Inspector Toolbar in `SketchPane.tsx`:
    - Quick "Import" and "Export" action buttons directly in the Zones inspector card for instant one-click workflow without opening the modal editor.
  - [x] **Integration 4.9**: Speech-Paced Dialogue Cadence Alignment (`batch_pipeline.py --srt`):
    - Automatically syncs scene element timing (`startMs`, `durationMs`) with speech dialogue cues.
    - Honors natural conversational pauses with pen resting intervals, ensuring 100% audio-visual synchronization without audio drift.
    - Added test 8 to `scripts/test_engine.py` (8/8 tests passing, 100%).

- [x] **Phase 5: End-to-End Golden Verification & Production Deliverables**
  - [x] **Golden Test 5.1**: Annotated region & protected zone verification render (`examples/golden_preview.png`).
  - [x] **Golden Test 5.2**: Two-way VideoStudio format serialization & deserialization validation (`examples/vs_clip_golden.json` $\leftrightarrow$ `examples/restored_annotation.json`).
  - [x] **Golden Test 5.3**: 60 FPS skeleton stroke tracing and contour-wipe color bloom full MP4 render (`examples/golden_render.mp4`).
  - [x] **Golden Test 5.4**: Regression test suite passes 100% across both Python (`test_engine.py` 8/8) and VideoStudio (Vitest 76/76 files, 941/941 tests).

---

## 1. Executive Summary & Codebase Audit

### 1.1 Architecture Overview
`srt-whiteboard-animation-main` is a specialized Python skill and rendering pipeline designed to turn SRT subtitles into sequential whiteboard hand-drawn videos. It couples:
1. **Subtitle Parsing & Scene Planning (`scripts/parse_srt.py`)**: Groups timestamped dialogue lines into 25–35 second scenes.
2. **Annotation Data Schema (`*.annotation.json`)**: Encapsulates rectangular regions, sequence order, timing (`startMs`, `durationMs`), and protected zones.
3. **Web-Based Preview Station (`assets/preview.html`)**: A standalone HTML5 client leveraging the File System Access API for visual bounding box adjustment.
4. **Stream & Mask Video Rendering Engine (`scripts/render_stream_whiteboard.py` & `scripts/stream_render.py`)**:
   - Skeleton thinning via Zhang-Suen algorithm.
   - 8-connected stroke tracing with Chaikin corner-cutting smoothing.
   - Grid cell cluster traversal (nearest neighbor & density gradient walk).
   - Contour wipe color blooming using an exponential decay resistance field.
   - Procedural or image-based pen hand overlay (`assets/drawing-hand.png`).
5. **Multi-Scene Stitching (`scripts/merge_scenes.py`)**: Concat via FFmpeg stream copy or PyAV re-encode.

---

### 1.2 Comprehensive Defect & Limitation Audit

| Component | File & Lines | Severity | Issue Description & Impact |
| :--- | :--- | :--- | :--- |
| **Annotation Preview** | `scripts/render_annotation_preview.py:12-14` | **High (Crash)** | Hardcoded Windows font path `C:/Windows/Fonts/msyh.ttc`. Fails immediately on Linux, macOS, or Windows machines without YaHei installed. |
| **Protected Region Audit** | `scripts/render_annotation_preview.py:18-35` | **High (Defect)** | Completely ignores `element['reveal']['protectedRegions']`. Users cannot verify protection zones despite SKILL.md specifying this script as the validation gate. |
| **Stroke Ordering** | `scripts/stream_render.py:946-959` | **Medium (Aesthetic)** | `_order_skeleton_strokes` sorts strokes using `min(ys) // 12`. This chops continuous sketches into arbitrary 12-pixel horizontal bands, causing artificial pen hopping instead of human-like drawing. |
| **Disk & Memory I/O** | `scripts/stream_render.py:1580-1605` | **High (Performance)** | Emits an intermediate uncompressed `_raw.mp4` video (often 1–3 GB for 1080p60) before executing `transcode_h264`. Doubles write cycles and disk wear. |
| **Background Color Bleed** | `scripts/stream_render.py:1080-1090` | **Medium (Visual Artifact)** | Corner median background sampling (`img[:margin, :margin]`, etc.) corrupts background identification when drawings touch canvas corners or contain borders. |
| **Preview Station Limitations** | `assets/preview.html:230-300` | **Medium (Workflow)** | Shows only a coarse rectangular wipe proxy. Cannot preview actual pen paths, stroke order, polygonal zones, or protected regions. |
| **Thinning Computation** | `scripts/stream_render.py:754-791` | **Medium (Latency)** | Pure Python NumPy-slice Zhang-Suen implementation runs up to 160 iterations sequentially on CPU. High resolution sketches incur significant processing latency. |
| **Code Duplication** | `stream_render.py` vs `render_stream_whiteboard.py` | **Low (Maintainability)** | Identical functions (`_zhang_suen_skeleton`, Chaikin smoothing, disk stamp, grid pathing) duplicated across both files without a shared core library. |

---

## 2. Proposed Architectural Solutions for Sketch Updates

### 2.1 Solution A: Semantic Topological Stroke Ordering (Human-Like Drawing Flow)
Instead of arbitrary 12px scanlines:
1. **Graph-Based Stroke Topology**:
   - Construct a stroke connectivity graph where edges represent physical stroke intersections or spatial proximity.
2. **Three-Tier Human Drawing Hierarchy**:
   - **Tier 1 (Outer Silhouettes)**: Longest closed contours and exterior boundaries are drawn first.
   - **Tier 2 (Internal Structures)**: Connected interior lines (facial features, clothing folds, object details).
   - **Tier 3 (Hatching & Accents)**: Short high-frequency strokes (cross-hatching, shading, text stippling).
3. **Eulerian / Greedy Minimal-Jump Pathing**:
   - Within each tier, select the next stroke whose starting point minimizes pen lift distance $\Delta d = \|P_{\text{start}} - P_{\text{end, prev}}\|$, preventing jarring pen teleports.

### 2.2 Solution B: Accelerated & Robust Sketch Extraction
1. **High-Performance Morphological Skeletonization**:
   - Use OpenCV's native C++ Zhang-Suen or Guo-Hall thinning (`cv2.ximgproc.thinning`) when `opencv-contrib-python` is available, with vectorized NumPy fallback.
2. **Adaptive Dynamic Range & Edge Filter**:
   - Implement multi-scale Difference-of-Gaussians (DoG) + Otsu thresholding to preserve delicate sketch lines even under uneven illustration lighting or paper textures.
3. **Safe Robust Background Sampling**:
   - Replace simple 4-corner sampling with an edge-histogram mode algorithm that detects the dominant canvas paper tone while ignoring ink strokes reaching the margins.

### 2.3 Solution C: Polygonal Masks & Visual Protected Regions in `preview.html`
1. **Interactive Canvas Zone Editor**:
   - Support both rectangular bounding boxes and arbitrary convex/concave polygonal zones (compatible with VideoStudio's `WhiteboardZone`).
   - Add visual overlay for `protectedRegions` with diagonal warning stripes (red/amber hatch).
2. **In-Browser SVG Pen Path Simulation**:
   - Extract and render the skeleton pen trajectory directly inside the HTML5 canvas so the user can scrub the timeline and verify true stroke animation before starting heavy MP4 rendering.

### 2.4 Solution D: Incremental Sketch Update Pipeline & VideoStudio Integration
1. **Scene & Layer Cache Engine**:
   - Cache extracted strokes, time-maps, and intermediate masks keyed by `(image_hash, region_hash, timing_hash)`.
   - When updating a sketch in Scene 2, Scenes 1 and 3 are pulled from cache without re-computation.
2. **VideoStudio Bridge**:
   - Provide direct conversion between `annotation.json` and VideoStudio sequence clip effects (`effects.whiteboard = { pattern: 'zones', zones: [...], trace: {...} }`).

---

## 3. Detailed Implementation Plan & File Modifications

### Component 1: Core Engine Refactoring (`scripts/core/`)
- **[NEW] `scripts/core/stroke_engine.py`**:
  - Unified Zhang-Suen & morphological skeletonization.
  - Semantic stroke classification (contour vs internal vs hatching).
  - Graph-based minimal-jump stroke ordering.
  - Chaikin smoothing and arc-length resampling.
- **[NEW] `scripts/core/color_wash.py`**:
  - Cached resistance field generator for contour-wipe.
  - Brush disk stamper with feathered edge blending.
- **[NEW] `scripts/core/system_utils.py`**:
  - Cross-platform font resolver (Windows, macOS, Linux).
  - Direct FFmpeg stdin video pipe writer (eliminating uncompressed raw MP4 temp files).
  - Robust paper background color sampler.

### Component 2: Script Modernization
- **[MODIFY] `scripts/render_annotation_preview.py`**:
  - Integrate `system_utils.resolve_system_font()`.
  - Add full rendering of `protectedRegions` (red hatched fill with warning outline).
  - Add subtitle text and timecode badges (`startMs` - `endMs`).
- **[MODIFY] `scripts/render_stream_whiteboard.py`**:
  - Import optimized functions from `scripts/core/`.
  - Stream frames directly to FFmpeg/PyAV encoder without intermediate `_raw.mp4`.
  - Support incremental scene caching.
- **[MODIFY] `scripts/stream_render.py`**:
  - Refactor to consume shared `scripts/core/` modules.
- **[MODIFY] `assets/preview.html`**:
  - Add UI controls for adding, editing, and deleting `protectedRegions`.
  - Add visual toggle for previewing true pen trajectory path.

---

## 4. Verification & Testing Strategy

1. **Automated Unit Tests**:
   - Test stroke ordering continuity on synthetic line-art shapes (circles, intersecting lines, text glyphs).
   - Test font resolution across Windows, macOS, and Linux fallback paths.
   - Test background color extraction with bordered and borderless images.
2. **End-to-End Render Verification**:
   - Render `examples/scene-01-monkey-mountain.png` with new semantic stroke ordering.
   - Verify zero uncompressed `_raw.mp4` leftover files.
   - Compare frame output quality against baseline GIF/MP4.
3. **UI Preview Verification**:
   - Load `examples/scene-01-monkey-mountain-banana.annotation.json` into updated `preview.html`.
   - Verify protected region display and interaction.
