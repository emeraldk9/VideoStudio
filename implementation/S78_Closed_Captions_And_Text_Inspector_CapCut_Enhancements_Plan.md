# Step S78: CapCut-Grade Closed Captions & Typography Inspector, Effects & Animation Engine

## Status: Completed ✅

---

## 1. Executive Summary & Audit of Existing Closed Captions / Text System

An end-to-end audit of closed captions, subtitles, and text inspection across VideoStudio reveals critical gaps when compared to industry-standard desktop editors, particularly **CapCut PC Desktop**, **Adobe Premiere Pro Captions**, and **DaVinci Resolve**:

### 1.1 Inspector Structure & User Experience Gaps
- **Missing Dedicated Captions & Style Sub-Tabs**: In `SingleClipInspector.tsx`, text clips only present two tabs: `Text` and `Transform`. There is no dedicated layout separating **Basic (Typography & Layout)**, **Style Art & Effects (Outline, Glow, Shadow, Box/Bubble)**, and **Motion & Animations (In, Out, Loop, Karaoke)**.
- **No "Apply to All Captions" in Inspector**: In CapCut PC, the single most critical subtitle feature is the "Apply to All" button/toggle in the Inspector. When editing a subtitle clip, changing font family, font size, stroke, shadow, box pill, or animation should propagate across all subtitle cues in the track with one click.
- **Missing Text Style Toggles**: Standard typographic controls such as Italic, Underline, and Rounded Box / Pill Corner Radius are absent from the schema and UI.

### 1.2 Preview Canvas Rendering Disconnect
- In `TimelinePreview.tsx` (`renderText`):
  - `stroke` (`-webkit-text-stroke`) is configured in the inspector but **not rendered** in preview!
  - `shadow` (`text-shadow`) is configured in the inspector but **not rendered** in preview!
  - `gradient` (`linear-gradient` clip) is defined in presets but **not rendered** in preview!
  - `textTransform` (`uppercase`, `capitalize`) is in the inspector but **not rendered** in preview!
  - `box` backing card lacks `borderRadius` (only sharp square box rendered, lacking TikTok/CapCut rounded pills).
  - Kinetic animations are limited to entrance-only without exit or karaoke word-by-word highlights.

### 1.3 Export Engine (`text-segment.ts`) Disconnect
- `src/main/media/text-segment.ts` generates FFmpeg `drawtext` filters but ignores `stroke` (`borderw`, `bordercolor`) and `shadow` (`shadowx`, `shadowy`, `shadowcolor`), meaning exported videos omit the styling seen by users.

---

## 2. Proposed Architecture & Solutions (CapCut PC Parity)

### 2.1 Enhanced Data Model & Schema (`effects.ts` & `typography-ops.ts`)
1. **Extended Typography Props**:
   - `italic?: boolean`
   - `underline?: boolean`
   - `box?: { colorHex: string; opacity: number; paddingPx: number; borderRadiusPx?: number }` (enables TikTok/Reels rounded pill badges)
   - `glow?: { colorHex: string; radiusPx: number; intensity: number }` (neon glow effect)
   - `curve?: { angleDeg: number }` (curved text distortion)
2. **CapCut-Style Animation Model**:
   - Support for 3 distinct animation phases:
     - **In (Entrance)**: `fade_in`, `slide_up`, `slide_down`, `slide_left`, `slide_right`, `pop_scale`, `bounce`, `typewriter`, `zoom_in`, `glitch`
     - **Out (Exit)**: `fade_out`, `slide_down`, `zoom_out`, `dissolve`
     - **Loop / Karaoke**: `karaoke_highlight`, `glow_pulse`, `wave`, `shimmer`, `bounce_loop`
   - Animation phase durations (e.g. `inDurationFrames`, `outDurationFrames`, `loopSpeed`).
3. **Zod Validation & Trust Boundary**:
   - Update `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts` to strictly validate the enhanced text and animation attributes.

### 2.2 Re-architected Inspector: `CaptionsTextInspectorTab.tsx`
Refactor and elevate `TextInspectorTab.tsx` into an organized, CapCut-style modular inspector with segmented sub-sections:
1. **Action Bar & Quick Tools**:
   - **"Apply to All Captions"**: 1-click batch propagation across all subtitle clips on the active track or timeline.
   - **Quick Presets Carousel**: TikTok Pill, Cinema Gold, Neon Cyberpunk, High Contrast Broadcast, Minimalist, Comic Pop, Karaoke Glow.
2. **Section 1: Basic (Font & Layout)**:
   - Textarea with character count & CPL indicator.
   - Font Family (Google Fonts / System fonts preview), Weight (400, 600, 700, 900), Italic, Underline, Case Transform.
   - Font Size slider, Color picker, Opacity slider.
   - Text Alignment (Left, Center, Right) & Anchor (Top, Middle, Bottom).
   - Letter Spacing & Line Height controls.
   - Backing Pill / Bubble: Color, Opacity, Padding, and Corner Radius (Sharp, Rounded, Capsule Pill).
3. **Section 2: Effects & Typography Art**:
   - **Stroke / Outline**: Width (0–20px), Color, Opacity.
   - **Glow**: Color, Glow Radius (0–40px), Intensity (0–100%).
   - **Drop Shadow**: Color, Blur Radius, Offset X, Offset Y, Opacity.
   - **Gradient Fill**: 2-color linear gradient with angle wheel.
4. **Section 3: Animations (In / Out / Loop / Karaoke)**:
   - CapCut-style 3-tab segmented selector: `[ In ] [ Out ] [ Loop / Karaoke ]`.
   - Visual animation cards with preview icons.
   - Real-time animation duration sliders with frame and second readouts.

### 2.3 Preview Canvas High-Fidelity Rendering (`TimelinePreview.tsx`)
Upgrade `renderText` in `TimelinePreview.tsx`:
- Compute combined `text-shadow` (multi-layer drop shadow + neon glow).
- Apply `-webkit-text-stroke` and `stroke` properties.
- Apply `-webkit-background-clip: text` for gradients.
- Apply `text-transform` (`uppercase`, `capitalize`, `lowercase`).
- Apply `border-radius` to backing box for pill/capsule shapes.
- Implement karaoke word-by-word active highlight simulation:
  - Tokenizes text into words and highlights the currently spoken word based on playback progress.
- Implement exit animation transition as playhead approaches clip end.

### 2.4 Export Pipeline Upgrade (`text-segment.ts`)
- Connect `buildFfmpegDrawTextOptions` to `buildDrawtextFilter` in `src/main/media/text-segment.ts` to pass `borderw`, `bordercolor`, `shadowx`, `shadowy`, `shadowcolor`, and box formatting during video render.

### 2.5 Pure Helper Operations (`typography-ops.ts`)
- `applyTypographyStyleToClips(clips, stylePatch, targetTrackId)`: Pure immutable helper to propagate font, color, effects, and animations across caption clips.
- `calculateKaraokeWordHighlight(text, frameInClip, durationFrames)`: Computes which word is active at any given frame.
- `calculateTextAnimationState(textEffect, frameInClip, clipDurationFrames, fps)`: Unified evaluator for entrance, exit, and loop/karaoke motion.

---

## 3. Progress Tracking Log

- **[2026-09-23 08:15]** Completed comprehensive audit of text/caption systems against CapCut PC Desktop.
- **[2026-09-23 08:16]** Created Milestone S78 plan document (`implementation/S78_Closed_Captions_And_Text_Inspector_CapCut_Enhancements_Plan.md`).
- **[2026-09-23 08:17]** Created implementation plan artifact (`implementation_plan.md`) awaiting user feedback.
- **[2026-09-23 08:18]** Extended `TextContent` and `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`:
  - Added `italic?: boolean`, `underline?: boolean`, `glow?: TextGlowSettings`.
  - Added `borderRadiusPx?: number` to `box` for rounded capsule/pill subtitle badges.
  - Added validation for In, Out, and Loop/Karaoke animation types.
- **[2026-09-23 08:19]** Enhanced `src/shared/utils/timeline/typography-ops.ts`:
  - Added `TextGlowSettings` interface.
  - Extended `TextAnimationType` to include entrance (`slide_left`, `slide_right`, `zoom_in`, `glitch`), exit (`fade_out`, `slide_down_out`, `zoom_out`, `dissolve`), and loop/karaoke (`karaoke_highlight`, `wave`, `shimmer`, `bounce_loop`).
  - Implemented `calculateKaraokeHighlight` for word-by-word active spoken highlight tokenization.
  - Implemented `applyTypographyStyleToClips` for 1-click batch styling across sequence subtitle cues.
  - Implemented `CAPCUT_CAPTION_PRESETS` (`tiktok_viral_pill`, `karaoke_party`, `cyber_glow`, `cinema_subtitles`, `comic_pop`, `bold_shadow`).
- **[2026-09-23 08:20]** Upgraded FFmpeg export filter generator in `src/main/media/text-segment.ts`:
  - Connected `buildFfmpegDrawTextOptions` to `buildDrawtextFilter` to pass `borderw`, `bordercolor`, `shadowx`, `shadowy`, `shadowcolor`, and box padding to `drawtext`.
- **[2026-09-23 08:21]** Upgraded `TimelinePreview.tsx` (`renderText`):
  - Added `-webkit-text-stroke` for outline rendering.
  - Added combined multi-layer `textShadow` (drop shadow + neon glow).
  - Added `-webkit-background-clip: text` for linear gradients.
  - Added `fontStyle: italic`, `textDecoration: underline`, `textTransform`.
  - Added `borderRadius` to backing box for rounded capsule pill badges.
  - Added real-time tokenized karaoke word-by-word active highlight rendering with golden radiance.
- **[2026-09-23 08:22]** Re-architected `TextInspectorTab.tsx` into CapCut PC 3-subtab layout (`[ Basic ] [ Effects & Art ] [ Animation ]`) with:
  - "Apply to All Captions" 1-click transaction button.
  - Quick preset carousel cards.
  - Full controls for text, formatting, capsule pills, stroke, glow, shadow, gradient, and animation phases.
- **[2026-09-23 08:23]** Updated `SingleClipInspector.tsx` to contextually display "Captions" with icon `closed_caption` when inspecting subtitle cues.
- **[2026-09-23 08:24]** Verified with Vitest (`31/31` typography ops tests passing; full suite `856/856` tests passing across 68 suites) and `npx tsc --noEmit` (0 compilation errors).
