# S40: Rich Text & Kinetic Motion Typography Engine

## 1. Overview & Objective
Step S40 implements a comprehensive **Rich Text & Kinetic Motion Typography Engine** for VideoStudio. It elevates text overlays and title cards to broadcast, cinema, and social media quality with:
- **Curated Font Typography**: 8 font families across Sans, Serif, Display, and Monospace (`Inter`, `Montserrat`, `Bebas Neue`, `Playfair Display`, `Oswald`, `Cinzel`, `Roboto Mono`, `Impact`).
- **Advanced Text Styling**: Configurable font weight (`400`, `600`, `700`, `900`), letter spacing (`letterSpacingPx`), line height, text casing (`uppercase`, `lowercase`, `capitalize`).
- **Stroke / Outline**: High-contrast border outline (`-webkit-text-stroke`) with configurable width and color.
- **Drop Shadow & Glow**: Multi-layer drop shadow and neon glow with blur, offset X/Y, color, and opacity.
- **2-Color Linear Gradient**: Rich gradient fills with customizable angle (`angleDeg`).
- **Procedural Kinetic Entrance Motion**:
  - `typewriter`: Frame-synchronized character-by-character live typing reveal.
  - `fade_in`: Cubic ease-out entrance fading.
  - `slide_up` & `slide_down`: Directional kinetic translation with opacity ease.
  - `pop_scale`: Elastic scale entrance with overshoot (0.3 -> 1.05 -> 1.0).
  - `bounce`: Physics-based gravity decay bounce.
  - `glow_pulse`: Sinusoidal luminosity pulsation text shadow.
- **Studio Motion Title Presets**: Clickable studio presets (`Cinematic Gold`, `Cyberpunk Neon`, `Modern Bold`, `Vibrant Subtitles`, `News Lower Third`, `Typewriter Classic`, `Editorial Serif`).
- **FFmpeg drawtext Argument Generator**: Automatic border (`borderw`, `bordercolor`) and shadow (`shadowx`, `shadowy`, `shadowcolor`) export parameters.

---

## 2. Architecture & Implementation

### A. Pure Mathematics & Styling Engine
- **File**: `src/shared/utils/timeline/typography-ops.ts`
  - Defines `FontFamily`, `FontWeight`, `TextStrokeSettings`, `TextShadowSettings`, `TextGradientSettings`, `TextAnimationSettings`, and `StudioTextPreset`.
  - `FONT_FAMILIES`: Catalog of 8 fonts with categories (`sans`, `serif`, `display`, `mono`) and fallback CSS strings.
  - `STUDIO_TEXT_PRESETS`: Curated design presets with coordinated fonts, weights, colors, strokes, shadows, and kinetic animations.
  - `calculateTypewriterSlice(text, frameInClip, durationFrames)`: Computes character substring based on timeline playhead frame progress.
  - `calculateTextMotionTransform(animation, frameInClip, fps)`: Computes procedural CSS transforms, opacities, and animated text shadows without external animation library overhead.
  - `buildFfmpegDrawTextOptions(text)`: Translates strokes and shadows to FFmpeg drawtext parameters for export rendering.

### B. Effects & Schema Integration
- **File**: `src/shared/utils/timeline/effects.ts`
  - Extended `TextContent` interface with `fontFamily`, `fontWeight`, `letterSpacingPx`, `lineHeight`, `textTransform`, `stroke`, `shadow`, `gradient`, and `animation`.
  - Extended `clipEffectsSchema.text` Zod validator to ensure strict schema adherence and safe persistence in project JSON files.
- **File**: `src/shared/index.ts`
  - Re-exported all typography operations and types.

### C. Live Real-Time Canvas Preview
- **File**: `src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`
  - Updated `renderText(clipId, effectsText, clipStartFrames)`:
    - Calculates active frame within the clip (`frameInClip = playheadFrame - startFrames`).
    - Applies `calculateTypewriterSlice` for live character typing reveals.
    - Applies `calculateTextMotionTransform` for real-time smooth kinetic transforms and opacities.
    - Applies font families, weights, letter spacing, text transforms, `-webkit-text-stroke`, and drop shadows.

### D. Inspector UI Controls
- **File**: `src/renderer/features/timeline-edit/ui/ClipInspector.tsx`
  - Added Studio Motion Presets quick-apply grid.
  - Added Font Family selector and Font Weight segmented control.
  - Added Letter Spacing slider and Text Transform casing segmented control.
  - Added Stroke / Outline width and color controls.
  - Added Drop Shadow & Glow blur, offset X/Y, opacity, and color controls.
  - Added Kinetic Entrance Motion animation preset selector and duration slider.

---

## 3. Verification & Results
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/typography-ops.test.ts`: 18/18 tests passed.
  - Full suite: 34 test files passed, 391/391 tests passed (100%).
- **TypeScript Typecheck**:
  - `npm run typecheck` (`tsc --noEmit`): 0 errors.
- **Production Bundles**:
  - `npx vite build --config vite.renderer.config.ts`: Succeeded (0 errors).
  - `npx vite build --config vite.main.config.ts`: Succeeded (0 errors).
