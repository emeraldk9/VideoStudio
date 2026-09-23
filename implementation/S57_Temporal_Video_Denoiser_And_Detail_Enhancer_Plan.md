# Step S57: Temporal Video Noise Reduction (TNR), Spatial Detail Enhancer & Chroma Denoising Engine

## Overview & Background
In professional cinematography and post-production color suites (such as DaVinci Resolve Studio Temporal NR, Neat Video, and Adobe Premiere Pro Denoise):
- **Temporal Noise Reduction (TNR)**: Evaluates adjacent frames across a temporal window (radius 1 to 5 frames) to differentiate actual motion from high-frequency sensor grain and low-light thermal CMOS noise. Backgrounds and static textures are smoothed temporally without smearing moving objects.
- **Spatial Luminance & Chrominance Filtering**: Independent control over:
  - **Luma Spatial Smoothing**: Calms high-frequency grain and specular sensor noise.
  - **Chroma Spatial Smoothing**: Eliminates ugly color blotching and purple/green digital chroma artifacts.
- **Chroma Denoise 1.5x Boost**: Dedicated booster specifically suppressing aggressive sensor color noise in high-ISO and dark scenes.
- **Edge-Preserving Detail & Texture Sharpener**: Dynamic unsharp masking ($5 \times 5$ kernel) applied selectively post-denoising to restore edge micro-contrast, hair/textile clarity, and ocular definition.
- **FFmpeg Master Export Filter Pipeline**: Frame-accurate `hqdn3d=luma_spatial:chroma_spatial:luma_tmp:chroma_tmp` and `unsharp=5:5:amount:5:5:0` filter chains for production export.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/video-denoiser-ops.ts`)
- `VideoDenoiserSettings`: `{ enabled, spatialLumaStrength, spatialChromaStrength, temporalLumaStrength, temporalChromaStrength, temporalRadius, chromaDenoiseBoost, detailSharpenAmount, preset }`.
- `VideoDenoiserPresetKey`: `'subtle_sensor_grain' | 'high_iso_digital_noise' | 'chroma_blotch_cleaner' | 'night_low_light_salvage' | 'vintage_analog_restoration'`.
- `DEFAULT_VIDEO_DENOISER_SETTINGS`: Neutral defaults with denoiser bypassed.
- `VIDEO_DENOISER_PRESETS`: 5 curated presets for subtle grain, high ISO, chroma blotches, night salvage, and analog video restoration.
- `calculateEffectiveNoiseReductionRatio(settings)`: Calculates weighted composite noise reduction ratio from 0.0 to 1.0 (safely handling `undefined`).
- `buildFfmpegVideoDenoiserFilter(settings)`: Synthesizes frame-accurate FFmpeg `hqdn3d` and `unsharp` filter chain (safely handling `undefined`).

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `videoDenoiser?: VideoDenoiserSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.videoDenoiser` in Zod schema.
- Integrated `buildFfmpegVideoDenoiserFilter(effects.videoDenoiser)` in `buildColorFilterChain`.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and utility methods from `video-denoiser-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Temporal Video Denoising (TNR) & Detail Enhancer" section under Video / Color tabs for video clips and effect clips.
- Integrated master bypass toggle and studio preset chips (Subtle Grain, High ISO, Chroma Blotch, Night Salvage, Analog Clean).
- Added live noise reduction index badge (`NR: X%`).
- Built interactive sliders for:
  - Temporal Luma Smoothing (0.0 to 20.0)
  - Temporal Chroma Smoothing (0.0 to 20.0)
  - Spatial Luma Smoothing (0.0 to 15.0)
  - Spatial Chroma Smoothing (0.0 to 15.0)
  - Temporal Search Radius (±1 to ±5 frames)
  - Chroma Denoise 1.5x Boost toggle
  - Post-Denoise Detail Sharpen (0.0 to 2.0)

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/video-denoiser-ops.test.ts` (10 dedicated unit tests verifying defaults, presets, ratio metrics, chroma boost, clamp limits, undefined safety, and FFmpeg filter syntax).
- **Vitest Full Test Suite**: 51 test files passed, 595 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
