# Step S51: AI Video Background Matting & Smart Portrait Cutout Engine

## Overview & Background
In professional and modern creator video suites (such as CapCut Smart Cutout, DaVinci Resolve Magic Mask / Depth Map, Adobe Premiere Pro Auto-Matte, and After Effects Roto Brush), background separation without physical green screens is an essential creative capability:
- **Smart Subject Isolation**: Segmenting human figures or primary foreground subjects from video backgrounds cleanly without requiring physical green backdrops.
- **Sub-Pixel Edge Matting**: Refining hair, clothes, and complex boundaries using edge feathering, alpha erosion (choke), and edge blur smoothing.
- **Color Spill Decontamination**: Neutralizing background environmental color bounce and fringing along subject perimeters.
- **Matte Inspection View Modes**: Immediate visual inspection modes:
  - `composite`: Clean foreground over transparent / underlying timeline track.
  - `alpha_matte`: High-contrast black & white grayscale mask preview.
  - `overlay_mask`: Semi-transparent ruby/emerald overlay showing masked areas.
  - `original`: Bypass preview for instant A/B comparison.
- **FFmpeg Master Export Filter Pipeline**: Generating filter chains for alpha channel synthesis, thresholding, and composite blending during export.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/portrait-matting-ops.ts`)
- `PortraitMattingSettings`: `{ enabled, mode, threshold, edgeFeather, edgeChoke, edgeBlur, spillSuppression, invertMatte, viewMode, preset }`.
- `PortraitMattingMode`: `'smart_portrait' | 'silhouette' | 'color_isolate'`.
- `PortraitMattingViewMode`: `'composite' | 'alpha_matte' | 'overlay_mask' | 'original'`.
- `PortraitMattingPresetKey`: `'crisp_portrait' | 'soft_hair_detail' | 'silhouette_choke' | 'dramatic_isolate'`.
- `DEFAULT_PORTRAIT_MATTING_SETTINGS`: Neutral defaults with matting bypassed.
- `PORTRAIT_MATTING_PRESETS`: 4 curated presets with distinct threshold, choke, feather, and despill balances.
- `calculateAlphaRamp(confidence, threshold, feather)`: S-curve smoothstep alpha ramp.
- `calculateChokeOffset(alpha, chokePx)`: Morphological contraction (erosion) and dilation (expansion).
- `calculateDecontamination(rgb, backgroundCast, strength)`: Desaturates edge pixels contaminated by background bounce.
- `buildFfmpegMattingFilter(settings)`: Synthesizes frame-accurate FFmpeg filter expression (`gblur`, `erosion`, `dilation`, `despill`, `format=gray`).

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `matting?: PortraitMattingSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.matting` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `portrait-matting-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Smart Portrait Cutout & Matting" section under the Video tab for all video and still clips.
- Integrated master switch, preset buttons, matte view mode buttons (`Composite`, `Alpha Matte`, `Overlay Mask`, `Original`).
- Added interactive sliders for Sensitivity/Threshold (10%-90%), Feather (0-50px), Choke (-20px to +30px), and De-Spill (0%-100%).
- Integrated Invert Matte toggle (Keep Background).

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/portrait-matting-ops.test.ts` (17 dedicated unit tests verifying alpha ramps, choke erosion/dilation, decontamination, view mode formatting, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 45 test files passed, 525 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
