# S43: Picture-in-Picture (PiP) Split-Screen Layouts, Multi-Video Grid & Dynamic Border Insets Engine

## 1. Overview & Objective
Step S43 delivers a broadcast-quality **Picture-in-Picture (PiP) Split-Screen Layouts, Multi-Video Grid & Dynamic Border Insets Engine** to VideoStudio. This allows video editors, podcasters, interviewers, gamers, and tutorial creators to effortlessly configure multi-stream video arrangements, reaction cams, side-by-side comparisons, and multi-speaker grids directly on the timeline without manual keyframing or tedious pixel math.

Key capabilities delivered:
- **10 Curated Multi-Video Split & PiP Templates**:
  - `split_horizontal_50`: Classic left/right 50-50 split screen for side-by-side interviews or before/after comparisons.
  - `split_vertical_50`: Top/bottom 50-50 split screen for reaction videos or dual-feed broadcasts.
  - `grid_2x2`: 4-camera multi-cam layout, esports broadcasts, or collaborative calls.
  - `grid_3_split`: 1 large primary focal video (60% width) with 2 stacked secondary video feeds (40% width).
  - `grid_3x3`: 9-screen Brady Bunch / Zoom gallery layout.
  - `pip_floating_br`: Bottom-right floating overlay (25% width, 5% margin) with shadow and corner rounding.
  - `pip_floating_tr`: Top-right floating overlay.
  - `pip_floating_tl`: Top-left floating overlay.
  - `pip_floating_bl`: Bottom-left floating overlay.
  - `triple_portrait_16x9`: Three vertical 9:16 portrait feeds side-by-side across a 16:9 canvas (TikTok/Shorts compilation).
- **Dynamic Geometric Calculator (`calculateGridLayoutCells`)**:
  - Computes normalized bounding rectangles $(x, y, \text{width}, \text{height}) \in [0, 1]$ for arbitrary cell indices.
  - Accounts for user-configurable gaps (`gapPx`) and aspect ratio compensation (`fit`: `'cover'` vs `'contain'`).
- **Dynamic Styling & Border Insets**:
  - Customizable border width (`borderWidthPx`), border color (`borderColor`), and border radius (`borderRadiusPx`).
  - Optional drop shadow (`dropShadow`: boolean) for floating PiP windows.
  - Normalized rectangle query (`getClipGridRect`) with fallback positioning.
- **Real-Time 60fps CSS Preview Engine (`buildCssGridStyle`)**:
  - Maps normalized cell geometry and inset borders to hardware-accelerated CSS properties (`left`, `top`, `width`, `height`, `objectFit`, `border`, `borderRadius`, `boxShadow`).
- **FFmpeg Master Multi-Stream Export Engine (`buildFfmpegGridFilter`)**:
  - Generates complex filtergraph expressions using `scale`, `pad`, `format`, `drawbox`, and `overlay` with pixel-exact coordinates.
- **Inspector UI Suite Integration**:
  - Added dedicated **Split Screen & Multi-Video Grid** section in `ClipInspector.tsx` with one-click layout presets, slot selector, gap and border sliders, and live interactive controls.

---

## 2. Architecture & Implementation

### A. Core Mathematical & Layout Engine
- **File**: `src/shared/utils/timeline/pip-grid-ops.ts`
  - Defines `PipGridLayoutKey`, `PipGridFitMode`, `ClipPipGridSettings`, `GridCellRect`, and `PipGridLayoutDefinition`.
  - `PIP_GRID_TEMPLATES`: Registry of all 10 layout presets with slot counts, display names, and layout math.
  - `calculateGridLayoutCells`: Pure geometric layout solver converting template layouts and gap fractions into normalized bounds.
  - `getClipGridRect`: Retrieves normalized bounding box for any clip's selected slot with fallback default.
  - `buildCssGridStyle`: Converts grid settings and rects into CSSProperties for real-time video playback.
  - `buildFfmpegGridFilter`: Generates FFmpeg complex filter expressions for high-fidelity exports.

### B. Effects & Pipeline Integration
- **File**: `src/shared/utils/timeline/effects.ts`
  - Extended `ClipEffects` interface with `pipGrid?: ClipPipGridSettings`.
  - Extended `clipEffectsSchema` in Zod with validation for all template keys, slots, gaps, and border parameters.
- **File**: `src/shared/index.ts`
  - Re-exported all layout types, templates, and functions.
- **File**: `src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`
  - Integrated `buildCssGridStyle(clip.effects.pipGrid)` directly into `overlayStyle` during multi-track video playback, cleanly overriding default full-frame scaling when PiP is active.

### C. Inspector UI Suite
- **File**: `src/renderer/features/timeline-edit/ui/ClipInspector.tsx`
  - Added "Split Screen & Multi-Video Grid" collapsible accordion section.
  - Quick layout template picker with slot counter badges.
  - Cell slot selector buttons (`Cell 0`, `Cell 1`, etc.) dynamically bound to the selected template's total capacity.
  - Fit mode switcher (`Cover / Crop` vs `Fit / Contain`).
  - Sliders for Grid Gap (0–64px), Border Width (0–20px), Border Radius (0–40px), Border Color picker, and Drop Shadow toggle.

---

## 3. Verification & Test Results
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/pip-grid-ops.test.ts`: 13/13 tests passed.
  - Total test suite: 37 test files passed, 426/426 tests passed (100%).
- **TypeScript Compilation**:
  - `npm run typecheck` (`tsc --noEmit`): 0 errors.
- **Production Bundles**:
  - `npx vite build --config vite.renderer.config.ts`: Succeeded with 0 errors.
  - `npx vite build --config vite.main.config.ts`: Succeeded with 0 errors.
