# S9: Effects & Filters CapCut-Style UI Refactoring & Enhancement Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S9_Effects_And_Filters_CapCut_Refactor_Plan.md`  
**Status**: 🟢 Completed & Verified (`npm run typecheck` & `npm test` passing with 24 tests)  
**Standard**: Aligned with Industry Best Practices (CapCut Desktop, Adobe Premiere Pro, DaVinci Resolve)

---

## Progress Checklist & Tracker

- [x] **Phase 1: Architecture & Data Model Separation (Shared Kernel)**
  - [x] Create `src/shared/utils/timeline/filter-presets.ts` with comprehensive color filter presets, categories, and intensity scaling algorithm (`resolveFilterWithIntensity`).
  - [x] Create `src/shared/utils/timeline/video-effects.ts` defining `VideoEffectSettings`, 8 core CapCut categories, and 30+ industry-standard video effect presets.
  - [x] Extend `ClipEffects` in `src/shared/utils/timeline/effects.ts` with optional `videoEffect?: VideoEffectSettings` and helper functions.
  - [x] Update `edit-ops.ts` and `drag-payload.ts` to seamlessly handle both filter and video effect drag-and-drop payloads.
  - [x] Export all new modules in `src/shared/index.ts`.

- [x] **Phase 2: New Filters Tab Implementation (`FiltersPane.tsx`)**
  - [x] Add `'filters'` to `MediaPanelCategory` in `src/renderer/features/timeline-media/lib/mediaPanelStore.ts`.
  - [x] Create `src/renderer/features/timeline-media/ui/FiltersPane.tsx`:
    - [x] Left category sub-sidebar (Trending, Cinematic, Portrait, Retro & Vintage, Film & Kodachrome, Atmosphere & Mood, B&W & Noir, Lens & Vignette).
    - [x] Instant search input with clear button and result counter.
    - [x] Filter Intensity slider (0% to 100%) dynamically previewing and scaling filter values.
    - [x] Compare / Before-After toggle.
    - [x] CapCut-style square preview cards with swatch gradients and Pro diamond badges.
    - [x] Dual-action triggers: `+ Track` (Adjustment layer) and `Apply` (Direct to selected clip).
    - [x] "Reset Filter" button and active checkmark badges.

- [x] **Phase 3: Refactored Video Effects Tab (`EffectsPane.tsx`)**
  - [x] Rebuild `src/renderer/features/timeline-media/ui/EffectsPane.tsx` as a dedicated CapCut-style Video Effects library:
    - [x] 8 Video Effects categories (Trending, Opening & Closing, Lens & Blur, Light & Glitch, Retro & Film, Distortion & Warp, Atmosphere & Nature, Split & DSK).
    - [x] Dynamic animated preview thumbnails (CSS/SVG keyframe simulations for shake, glitch, strobe, particles, lens distortion).
    - [x] Pro VIP diamond badges and effect tags.
    - [x] Hover quick-actions: `+ Track` (Creates dedicated Effect adjustment clip) and `Apply` (Directly attaches effect to selected clip).
    - [x] Drag-and-drop directly onto timeline tracks or clips.
    - [x] Instant search with category filter.

- [x] **Phase 4: Navigation Rail & Media Panel Integration**
  - [x] Update `MediaPanel.tsx` `RAIL` navigation:
    - `[ Media ]`
    - `[ Transitions ]`
    - `[ Text ]`
    - `[ Effects ]` (New Video Effects)
    - `[ Filters ]` (New Color Filters)
    - `[ Sketch ]`
  - [x] Mount `<FiltersPane />` when `category === 'filters'`.

- [x] **Phase 5: Inspector Panel Parameter Tuning (`ClipInspector.tsx`)**
  - [x] Update `ClipInspector.tsx` for `sourceKind === 'effect'` clips:
    - [x] For Filter Adjustment Layer: show Filter name, Intensity slider (0-100%), and fine-tune color controls.
    - [x] For Video Effect Adjustment Layer: show Effect name, Intensity slider, Speed slider, Scale/Radius slider, Secondary knob, and Disable/Enable toggle.
  - [x] For regular media clips (`video`/`still`):
    - [x] Add Video Effect section with active effect card and parameter sliders.
    - [x] Update Color tab with Filter Intensity slider.

- [x] **Phase 6: Real-Time Preview & SVG Filter Pipeline (`TimelinePreview.tsx`)**
  - [x] Inject SVG filter and CSS keyframe definitions into `TimelinePreview.tsx` for video effects (shake, glitch chromatic split, film grain, scanlines, strobe, light leak, wave warp).
  - [x] Apply active video effect styles to frame composite during playback and scrubbing for 60fps hardware-accelerated preview.

- [x] **Phase 7: Export Pipeline Integration (`sequence-render-service.ts`)**
  - [x] Map video effect parameters to ffmpeg filters in `sequence-render-service.ts` for export.

- [x] **Phase 8: Verification & Polish**
  - [x] Run `npm run typecheck` to guarantee 0 TypeScript errors.
  - [x] Run `npm test` to verify Vitest suite passes without regression (24 passed).
  - [x] Verify UI interactions, drag-and-drop, parameter adjustments, and preview rendering.

- [x] **Phase 9: Post-Implementation Audit & Enhancements**
  - [x] **Collision-Free Overlay Stacking**: Enhanced `ensureOverlayTrack` with span-collision checking (`startFrames` and `durationFrames`). When a user adds both a Filter and a Video Effect at the same playhead frame, they automatically stack across separate overlay tracks without collision or overwriting.
  - [x] **Timeline Clip Identity Differentiation**: Updated `TimelineClip.tsx` to display distinct glyphs: `'photo_filter'` for Color Filter clips and `'auto_fix_high'` for Video Effect clips.
  - [x] **Z-Index Layering Fix**: Updated video effect overlay container to `z-[15]` so it renders crisply above video content and text while staying beneath interactive overlay guides (`z-20`).

---

## 1. Problem Statement & CapCut Industry Standard Alignment

### 1.1 The Current Deficiency
Currently in `VideoStudio`, `EffectsPane.tsx` only contains color adjustments (brightness, contrast, saturation, hue, vignette) which are technically **Color Filters / LUT looks**, not **Video Effects**:
- Real video editing software (CapCut, Premiere Pro, Final Cut Pro) strictly divides **Filters** (tonal color grading, film looks) from **Effects** (visual FX, blurs, glitches, shake, light leaks, film grain, particle overlays, lens distortions).
- Because color grading was placed under "Effects", users have no access to actual dynamic Video Effects, nor can they adjust the **Intensity** (0-100%) of color filters—a basic expectation in modern tools like CapCut.

### 1.2 CapCut Desktop Standards to Implement
| Feature | CapCut Standard | VideoStudio Target |
| :--- | :--- | :--- |
| **Tab Separation** | Dedicated `Effects` (Video FX) and `Filters` (Color Looks) | Separate `Effects` & `Filters` tabs in top media rail |
| **Filter Intensity** | 0–100% Strength slider scaling the grade | Intensity slider in FiltersPane & Inspector |
| **Filter Compare** | Press/hold Before & After preview toggle | Instant Before/After split/hold button |
| **Video FX Catalog** | Trending, Opening/Closing, Lens, Glitch, Retro, Warp, Atmosphere | 8 categorized sub-modules with 30+ effect presets |
| **Video FX Cards** | Dynamic animated thumbnail previews | CSS/SVG animated keyframe previews on hover/card |
| **Dual Application** | Apply to clip OR Add as overlay adjustment layer | `+ Track` and `Apply to Clip` buttons + drag-and-drop |
| **Inspector Controls**| Effect knobs: Speed, Intensity, Scale, Color, Param | Dedicated parameter controls in Inspector |
| **Live Playback** | 60fps hardware-accelerated preview | CSS/SVG hardware-accelerated player overlays |

---

## 2. Technical Architecture & Data Model

### 2.1 Video Effects Data Model (`src/shared/utils/timeline/video-effects.ts`)
```typescript
export type VideoEffectCategory =
  | 'trending'
  | 'opening_closing'
  | 'lens_blur'
  | 'light_glitch'
  | 'retro_film'
  | 'distortion'
  | 'atmosphere'
  | 'split_dsk';

export interface VideoEffectPreset {
  id: string;
  label: string;
  category: VideoEffectCategory;
  description: string;
  icon: string;
  defaultIntensity: number; // 0..100
  defaultSpeed: number;     // 0..100
  defaultScale?: number;    // 0..100
  paramLabel?: string;
  defaultParam?: number;
  colorHex?: string;
  animationClass: string;
  svgFilterId?: string;
}

export interface VideoEffectSettings {
  id: string;
  presetId: string;
  label: string;
  category: VideoEffectCategory;
  intensity: number; // 0..100
  speed: number;     // 0..100
  scale?: number;    // 0..100
  param?: number;    // 0..100
  colorHex?: string;
  disabled?: boolean;
}
```

### 2.2 Filter Presets & Intensity Engine (`src/shared/utils/timeline/filter-presets.ts`)
```typescript
export interface FilterPreset {
  id: string;
  label: string;
  category: FilterCategory;
  description?: string;
  filters: ClipColorFilters;
  intensity?: number; // default 100
}

/** Resolves filters scaled by intensity (0% = neutral, 100% = full preset) */
export function resolveFilterWithIntensity(
  filters: ClipColorFilters,
  intensityPct: number = 100,
): ClipColorFilters {
  const factor = Math.max(0, Math.min(100, intensityPct)) / 100;
  return {
    brightness: filters.brightness !== undefined ? filters.brightness * factor : undefined,
    contrast: filters.contrast !== undefined ? 1 + (filters.contrast - 1) * factor : undefined,
    saturation: filters.saturation !== undefined ? 1 + (filters.saturation - 1) * factor : undefined,
    gamma: filters.gamma !== undefined ? 1 + (filters.gamma - 1) * factor : undefined,
    hue: filters.hue !== undefined ? filters.hue * factor : undefined,
    sharpen: filters.sharpen !== undefined ? filters.sharpen * factor : undefined,
    vignette: filters.vignette !== undefined ? filters.vignette * factor : undefined,
  };
}
```

### 2.3 Extended `ClipEffects` Interface
```typescript
export interface ClipEffects {
  speed?: number;
  filters?: ClipColorFilters;
  filterIntensity?: number;        // 0..100
  videoEffect?: VideoEffectSettings; // New dynamic video effect
  text?: TextContent;
  transform?: ClipTransform;
  whiteboard?: WhiteboardSettings;
  videoFade?: ClipVideoFade;
  transition?: ClipTransitionParams;
  motion?: ClipMotion;
}
```

---

## 3. UI Component Details

### 3.1 Filters Tab (`FiltersPane.tsx`)
1. **Left Category Rail**: 8 filter categories with icons.
2. **Top Search & Intensity Bar**: Global intensity slider for the active filter.
3. **Filter Cards**:
   - High-contrast visual swatch showing the LUT in action.
   - Pro Diamond badge on top-left.
   - Quick action buttons on hover: `+ Track` (overlay adjustment clip) and `Apply` (clip level).
   - Checkmark active badge when active on selected clip.
4. **Compare Mode**: Floating button to quickly view unfiltered vs filtered in the preview.

### 3.2 Effects Tab (`EffectsPane.tsx`)
1. **Left Category Rail**:
   - 🔥 Trending (Shake, RGB Glitch, Flash, Glow, Zoom Pulse)
   - 🎬 Opening & Closing (Blur Open, Halo Blur, TV On/Off)
   - 🔍 Lens & Blur (Radial Blur, Motion Blur, Tilt-Shift, Fisheye)
   - ⚡ Light & Glitch (Cyberpunk Glitch, Scanlines, Light Leak, Film Burn)
   - 📼 Retro & Film (8mm Film, VHS Noise, Super 8 Jitter, Film Grain)
   - 🌀 Distortion & Warp (Wave Warp, Ripple, Vortex, Mirror)
   - ❄️ Atmosphere & Nature (Falling Snow, Rain, Sparks, Dust Bokeh)
   - 🪟 Split & DSK (2-Screen, 4-Screen, Comic Outline)
2. **Interactive Animated Preview Thumbnails**:
   - CSS animation / SVG keyframes simulated right inside each card's thumbnail canvas for instant preview before applying!
3. **Quick Action Overlays**:
   - `+ Track`: creates an `'effect'` clip with `videoEffect` on an overlay track.
   - `Apply`: applies `videoEffect` directly to selected video/still clip.
   - Draggable payload into timeline.

### 3.3 Clip Inspector Enhancements (`ClipInspector.tsx`)
1. **Effect Clip Selected (`sourceKind === 'effect'`)**:
   - Detects whether it is a **Filter Adjustment Layer** (renders Filter name, Intensity slider, Hue/Saturation/Brightness/Contrast/Vignette fine-tuning) or a **Video Effect Layer** (renders Video Effect card, Intensity slider, Speed slider, Scale slider, Custom Param, On/Off eye toggle, Reset button).
2. **Media Clip Selected (`sourceKind === 'video'` / `'still'`)**:
   - Color tab includes Filter Intensity slider.
   - Effects tab/section displays the applied Video Effect with instant parameter tweak sliders.

---

## 4. Verification Plan

### 4.1 Automated Tests
- `npm run typecheck`: Verify 100% strict TypeScript typing across shared models, renderer UI, and main processes.
- `npm test`: Run existing test suite to ensure zero regressions in keyframe/timeline modules.

### 4.2 Manual / Visual Verification
1. Open Filters tab, verify all categories and filter cards render smoothly.
2. Select a clip, click "Apply", adjust the Intensity slider (0-100%), and verify preview updates dynamically.
3. Click "+ Track" to add a Filter Adjustment Layer on an overlay track, verify it spans across clips.
4. Open Effects tab, verify 8 categories and animated thumbnail cards.
5. Click "Apply" for Camera Shake, RGB Split, or Film Grain; verify live playback animation in preview canvas.
6. Click "+ Track" for Video Effect, verify it adds to timeline and affects composite playback.
7. Select effect clip, verify Inspector displays accurate parameter controls (Speed, Intensity, Scale, Color).
