# Milestone S93: Whiteboard Scene Transitions & Procedural Board Eraser Wipe Engine Plan

## Executive Summary
In professional whiteboard animations (e.g. VideoScribe, Doodly, Explaindio), a signature storytelling trope is the **active board eraser wipe transition**: between narrative scenes or at clip conclusion, an eraser, sponge, or hand enters the canvas and actively scrubs away linework and color, clearing the board for the next scene.

Milestone S93 implements this end-to-end procedural board eraser wipe and scene transition engine across both the standalone Python whiteboard engine (`srt-whiteboard-animation-main`) and the desktop NLE (`VideoStudio`), tightly coupled with procedural acoustic eraser foley (450 Hz low-mid friction whoosh) established in Milestones S91 & S92.

---

## Architecture & Workflow

### 1. Standalone Python Whiteboard Engine (`srt-whiteboard-animation-main`)
```
Scene N (Full Rendered Drawing)
           │
           ▼
[generate_erase_transition()] ◄─── Eraser Duster / Sponge Asset
           │                      Inverted sweep / zigzag mask clearing
           ├─► Video: frames revealing canvas background under moving eraser
           └─► Audio: procedural eraser foley (450Hz broadband friction whoosh)
           │
           ▼
Transition MP4 (e.g., 1.0s - 1.5s seamless board clearing)
           │
           ▼
[merge_scenes.py / batch_pipeline.py]
  Scene 1 ──► [Erase Transition] ──► Scene 2 ──► [Erase Transition] ──► Scene 3
           │
           ▼
Merged Video with Natural Narrative Whiteboard Continuity
```

- **`scripts/core/eraser_engine.py`**:
  - Procedural board eraser generator: takes a snapshot of the completed board canvas and renders an eraser clearing animation over `erase_frames` (default 1.0s - 1.5s at project FPS).
  - Sweeping wiping patterns:
    - `'zigzag'`: realistic horizontal zigzag scrubbing from top to bottom.
    - `'circular'`: spiral outward/inward scrubbing motion.
    - `'wipe'`: diagonal squeegee/sponge wipe across the canvas.
  - Dynamically renders eraser tip/sponge with contact tilt and records eraser contact velocity for synchronized foley.
  - Generates eraser contact sound WAV using `export_foley_to_wav(..., stylus="eraser")`.
- **`scripts/merge_scenes.py` & `scripts/batch_pipeline.py`**:
  - Add `--transition` CLI argument: `cut` (default), `erase` (procedural eraser clearing), `sponge-wipe`.
  - When `--transition erase` is enabled: automatically generate and insert the eraser transition clip between consecutive scenes before final concatenation and audio multiplexing.

---

### 2. VideoStudio Desktop NLE (`VideoStudio`)
```
Timeline Still Clip with Whiteboard Effect
  ├── Reveal Phase (0% -> drawFraction): Hand draws linework & colors
  ├── Hold / Gaze Phase (drawFraction -> 1.0 - eraseFraction): Full picture holds
  └── Erase Phase (1.0 - eraseFraction -> 100%): Eraser scrubs canvas clean!
           │
           ▼
[effects.ts / whiteboard.ts Schema Update]
  eraseOut?: boolean;          // Default false
  eraseFraction?: number;      // 0.1 to 0.4 (default 0.20)
  erasePattern?: 'zigzag' | 'wipe' | 'circular'; // Default 'zigzag'
           │
           ▼
[whiteboard-segment.ts & whiteboard-mask.ts]
  FFmpeg filtergraph synthesis:
  Inverted alpha mask pass driven by overlay expressions, clearing the image
  back to board canvas color, overlaid with eraser tool asset.
           │
           ▼
[whiteboard-foley-node.ts & sequence-render-service.ts]
  Append synchronized eraser foley sound effect to the clip's foley WAV
  at `durationSeconds * (1.0 - eraseFraction)`.
           │
           ▼
[SketchPane.tsx UI]
  Card 1: "Erase Out / Board Clearing" toggle, erase duration slider, pattern selector.
           │
           ▼
[assets/preview.html & Interactive Preview]
  "🧹 擦除" button triggering live canvas scrubbing animation with Web Audio eraser whoosh.
```

---

## Detailed Execution Steps

### Phase 1: Python Procedural Eraser Engine & Multi-Scene Transition
1. **Create `scripts/core/eraser_engine.py`**:
   - Class `BoardEraserEngine`:
     - Input: base image BGR, canvas background color, eraser tool icon/hand, duration seconds, fps.
     - Patterns: `zigzag` (scrubbing back and forth from top-left to bottom-right), `wipe` (diagonal sweep), `circular` (spiral cleaning).
     - Outputs: sequence of erased frames where picture returns to paper/board texture, plus trajectory points for audio sync.
   - Function `render_eraser_transition(prev_image, next_image, output_mp4, duration_sec, fps, pattern, foley)`:
     - Renders transition video, generates eraser foley WAV via `export_foley_to_wav(..., stylus="eraser")`, and transcodes with audio stream.
2. **Update `scripts/merge_scenes.py` & `scripts/batch_pipeline.py`**:
   - Add `--transition` (`cut`, `erase`, `wipe`) and `--transition-duration` (default 1.2s).
   - In `merge_scenes.py`: if `transition == 'erase'`, generate transition clips between adjacent scene MP4s and concat.
   - In `batch_pipeline.py`: expose `--transition` and `--transition-duration` to CLI and forward to scene merge.
3. **Integration Test in `scripts/test_engine.py`**:
   - Add Test 14: `test_procedural_eraser_transition` verifying eraser frame rendering, eraser foley generation, and transition clip creation.

---

### Phase 2: VideoStudio Whiteboard Schema & Synthesis [COMPLETE]
1. **Schema & Types in `@shared` (`effects.ts`, `whiteboard.ts`)**: [DONE]
   - Add to `WhiteboardSettings`:
     - `eraseOut?: boolean;` (default false)
     - `eraseFraction?: number;` (0.05 to 0.4, default 0.20)
     - `erasePattern?: 'zigzag' | 'wipe';` (default 'zigzag')
   - Update `WHITEBOARD_DEFAULTS` and `clipEffectsSchema`.
   - Add helper functions `resolveWhiteboardEraseSeconds(settings, durationFrames, fps)`.
2. **Filtergraph Synthesis in `src/main/media/whiteboard-segment.ts`**: [DONE]
   - When `settings.eraseOut === true`:
     - Split timeline into Reveal (`[0, drawSeconds]`), Hold (`[drawSeconds, clipSeconds - eraseSeconds]`), and Erase (`[clipSeconds - eraseSeconds, clipSeconds]`).
     - Synthesize erasing mask overlay expression returning canvas to solid background.
3. **Foley Extension in `src/main/media/whiteboard-foley-node.ts`**: [DONE]
   - Support compound actions: drawing sound during `[0, drawDuration]` + eraser whoosh during `[clipDuration - eraseDuration, clipDuration]`.

---

### Phase 3: VideoStudio UI & Interactive Preview [COMPLETE]
1. **`SketchPane.tsx` UI Enhancement**: [DONE]
   - In Card 1 ("Drawing Mechanics"), added "Erase Out (Board Clearing)" disclosure & controls:
     - Switch: "Erase Out at End"
     - Slider: "Erase Duration" (0.5s to 3.0s / 5% to 40%)
     - SegmentedControl: "Erase Style" (`Zigzag Scrub`, `Linear Wipe`)
2. **`assets/preview.html` Interactive Control**: [DONE]
   - Added `🧹 擦除画布` button in top navigation bar (`#eraseBoardBtn`).
   - Implemented `startEraserWipe` and `drawEraserTool` rendering a wooden felt duster with drop shadow, wood bevel, felt bottom, and realistic scrub trajectory.
   - Connected `updateFoleyAudio(vel * 1.2, 'eraser')` with 450Hz bandpass whoosh synthesis.

---

### Phase 4: Automated Verification & Validation [COMPLETE]
1. **Python Engine Test Suite**: [PASS]
   - Ran `scripts/test_engine.py`: **14/14 tests passing**.
2. **VideoStudio Vitest & Typecheck**: [PASS]
   - Ran `npx tsc --noEmit`: 0 errors.
   - Ran `npx vitest run`: **77/77 test suites passing, 959/959 unit tests passing**.

---

### Milestone Completion Summary
- **Status**: **100% COMPLETE & VERIFIED**
- **Artifacts**:
  - `scripts/core/eraser_engine.py`
  - `scripts/merge_scenes.py`
  - `scripts/batch_pipeline.py`
  - `scripts/test_engine.py` (Test 14)
  - `assets/preview.html`
  - `src/shared/utils/timeline/whiteboard.ts`
  - `src/shared/utils/timeline/effects.ts`
  - `src/renderer/features/timeline-media/ui/SketchPane.tsx`
  - `src/main/media/whiteboard-foley-node.ts`
  - `src/main/media/sequence-render-service.ts`
  - `src/main/media/__tests__/whiteboard-foley-node.test.ts`

