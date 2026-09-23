# Implementation Plan: Step S30 — 3-Way Color Grading Wheels & Primary Color Balance Engine

Elevate VideoStudio's color pipeline into a studio-grade color suite: 3-Way Color Wheels (Lift, Gamma, Gain), White Balance (Temperature & Tint), and Primary Tone Controls with interactive radial color puck controls, real-time preview canvas synchronization, and ffmpeg color balance render mapping.

## 1. Background & Architecture
- **3-Way Color Wheels**: Professional NLE standard for tonal grading:
  - **Lift**: Shadows chromatic offset and black level luma.
  - **Gamma**: Midtones chromatic balance and gamma luma exponent.
  - **Gain**: Highlights chromatic tint and white level luma.
- **White Balance**:
  - **Temperature**: Kelvin-calibrated warm/amber (+100) to cool/blue (-100).
  - **Tint**: Green (-100) to magenta (+100).
- **Tone Controls**: Exposure (EV stops), Contrast, Saturation, and Vibrance (skin-tone safe smart saturation).
- **Dual Pipeline Integration**:
  - Real-time CSS preview through `buildCssColorFilter` within `TimelinePreview.tsx`.
  - Export rendering through ffmpeg `colorbalance` and `eq` filter chains via `buildFfmpegColorBalanceFilter`.

## 2. Key Modules & Functions
- **`src/shared/utils/timeline/color-grading-ops.ts`**:
  - `colorWheelToRgb(angleRad, distanceNormalized)`: Converts polar wheel coords to RGB offsets.
  - `rgbToColorWheel(r, g, b)`: Converts RGB offsets to polar coordinates.
  - `isNeutralColorGrading(settings)`: Checks for identity grade state.
  - `buildFfmpegColorBalanceFilter(settings)`: Generates ffmpeg `colorbalance` and `eq` syntax.
  - `buildCssColorFilter(settings)`: Generates real-time CSS filter declarations.
  - `COLOR_GRADING_PRESETS`: Cinematic looks (Teal & Orange, Golden Hour, Moody Noir, Bleach Bypass).
- **`src/shared/utils/timeline/effects.ts`**:
  - Added `colorGrade?: ColorGradingSettings` to `ClipEffects`.
  - Updated `buildColorFilterChain` and `buildCssFilter`.
- **`src/renderer/features/timeline-edit/ui/ColorWheel.tsx`**:
  - Circular chromatic wheel with smooth hue/saturation gradient.
  - Interactive dragging puck with magnetic snap-to-center.
  - Master luminance slider with center zero-notch.
- **`src/renderer/features/timeline-edit/ui/ColorGradingPanel.tsx`**:
  - 3-Way Wheels tab, Balance & Tone tab, and Cinema Looks preset tab.

## 3. Verification Plan
- Unit test suite in `color-grading-ops.test.ts` (20/20 passed).
- Full Vitest suite (`npm test`, 24 test files, 227/227 passed).
- TypeScript typecheck (`npm run typecheck`, 0 errors).
- Production build verification (`npx vite build --config vite.renderer.config.ts` & `vite.main.config.ts`).
