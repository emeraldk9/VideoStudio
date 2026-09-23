# Step S55: HDR Color Tone Mapping, ACES Color Science & False Color Exposure HUD

## Overview & Background
In professional cinema and broadcast grading (such as DaVinci Resolve ACES Color Management, Adobe Premiere Pro HDR Lumetri, and Apple Final Cut Pro Wide Gamut HDR):
- **High-Dynamic Range (HDR) Tone Mapping**: Compressing high-dynamic range highlights smoothly into standard dynamic range (SDR) without harsh specular clipping or shadow flattening.
- **Filmic Tone Curves**:
  - `aces_filmic`: Academy Color Encoding System tone reproduction with cinematic S-curve response and natural highlight desaturation.
  - `hable`: Filmic curve with distinct toe, linear midtone, and smooth shoulder rolloff.
  - `reinhard`: Classical luminance compression preserving linear gradients.
  - `mobius`: Linear mapping up to transition knee followed by smooth compression.
- **Target Peak Luminance**: Calibrating target white point (100 nits SDR Rec.709, 1000 nits HDR10, 4000 nits Dolby Vision master).
- **False Color Exposure HUD**: 16-step IRE heatmap scale enabling instant exposure verification:
  - Underexposure / Black crush (< 5 IRE, Crushed Black / Indigo)
  - 18% Middle Gray reference (38–42 IRE, Pure Green)
  - Skin tones reference (60–70 IRE, Hot Pink)
  - Highlight Warning / Clipping (> 98 IRE, Saturated Red)
- **FFmpeg Master Export Filter Pipeline**: Serializing frame-accurate `tonemap=tonemap=...:desat=...:peak=...` and `pseudocolor` filter chains.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/hdr-tone-mapping-ops.ts`)
- `HdrToneMappingSettings`: `{ enabled, curve, targetPeakNits, desaturation, exposureCompensationEv, falseColorEnabled, preset }`.
- `HdrToneCurve`: `'aces_filmic' | 'hable' | 'reinhard' | 'mobius'`.
- `HdrToneMappingPresetKey`: `'aces_rec709_cinema' | 'filmic_soft_rolloff' | 'high_contrast_punch' | 'broadcast_safe_sdr'`.
- `DEFAULT_HDR_TONE_MAPPING_SETTINGS`: Neutral defaults with tone mapping bypassed.
- `HDR_TONE_MAPPING_PRESETS`: 4 curated presets (ACES Cinema, Filmic Soft Shoulder, HDR Punch 1000 Nits, Broadcast Safe SDR).
- `FALSE_COLOR_IRE_SCALE`: Standard 16-step IRE benchmark color scale.
- `calculateAcesFilmicTone(linearLuma)`: Evaluates ACES S-curve $f(x) = \frac{x(2.51x + 0.03)}{x(2.43x + 0.59) + 0.14}$.
- `calculateHableTone(linearLuma)`: Computes Hable filmic curve with toe and shoulder parameters.
- `mapLumaToFalseColor(luma01)`: Maps normalized luminance to false color IRE RGB values and diagnostic labels.
- `buildFfmpegToneMappingFilter(settings)`: Synthesizes frame-accurate FFmpeg `tonemap`, `eq`, and `pseudocolor` filter chains.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `hdrToneMapping?: HdrToneMappingSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.hdrToneMapping` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `hdr-tone-mapping-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "HDR Tone Mapping & False Color HUD" section under Color / Video tab for video, still, and effect clips.
- Integrated master switch, preset buttons, curve selector (`ACES Filmic`, `Hable`, `Reinhard`, `Mobius`).
- Added sliders for Target Nits (100–2000), Highlight Desaturation (0%–100%), and Exposure EV (-3.0 to +3.0).
- Integrated False Color Exposure HUD toggle with live multi-stop IRE gradient legend and benchmark markers.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/hdr-tone-mapping-ops.test.ts` (14 dedicated unit tests verifying ACES and Hable formulas, false color IRE mapping, preset boundaries, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 49 test files passed, 576 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
