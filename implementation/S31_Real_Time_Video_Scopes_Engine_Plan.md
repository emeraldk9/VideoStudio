# Implementation Plan: Step S31 — Real-time Video Scopes Engine (Luma Waveform, RGB Parade, Vectorscope & Histogram HUD)

Equip VideoStudio with industry-standard broadcast video scopes to accompany the Step S30 Color Grading suite: real-time **Luma Waveform (0–100 IRE)**, **RGB Parade**, **Vectorscope (with 75% SMPTE color targets and skin-tone line)**, and **RGB/Luma Histogram** for objective exposure and color balance inspection.

## 1. Background & Architecture
- **Broadcast Scopes**: Professional NLEs (DaVinci Resolve, Premiere Pro) require photometric video scopes to detect clipping, black crush, channel imbalance, and skin-tone hue deviation.
- **Real-Time 60fps Performance**: Scopes sample lightweight downsampled frame buffers (160×90) via offscreen 2D canvas extraction (`willReadFrequently: true`), ensuring zero impact on video playback frame rates.
- **Display Modes**:
  - **Luma Waveform**: Rec.709 relative luminance distribution across horizontal picture position with 0–100 IRE graticule lines.
  - **RGB Parade**: Separate Red, Green, and Blue channels side-by-side with IRE scales.
  - **Vectorscope**: Polar UV color difference space with 75% SMPTE color target boxes (`R`, `Mg`, `B`, `Cy`, `G`, `Yl`) and universal 123° Skin-Tone I-Line.
  - **Histogram**: 256-bin density curves for Red, Green, Blue, and Luminance with shadow/midtone/highlight region dividers.

## 2. Key Modules & Functions
- **`src/shared/utils/timeline/video-scopes-ops.ts`**:
  - `calculateLumaRec709(r, g, b)`
  - `rgbToUvVectorscope(r, g, b)`
  - `computeLumaWaveform(pixels, width, height, outputWidth, numBins)`
  - `computeRgbParade(pixels, width, height, channelWidth, numBins)`
  - `computeVectorscopePoints(pixels, width, height, sampleStride)`
  - `computeHistogramBins(pixels, width, height)`
  - `VECTORSCOPE_SMPTE_TARGETS` & `SKIN_TONE_LINE_ANGLE_RAD`
- **`src/renderer/features/timeline-preview/model/videoScopesStore.ts`**:
  - `useVideoScopesStore` managing `isOpen`, `scopeType`, `intensity`, `showGraticule`, `showSkinToneLine`, `frameBuffer`.
- **`src/renderer/features/timeline-preview/ui/VideoScopesModal.tsx`**:
  - Broadcast scopes modal with 2D Canvas rasterizer, mode tabs, trace gain fader, and graticule toggles.
- **`src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`**:
  - Frame capture bridge connecting video/canvas pixels to scopes buffer.
  - Dedicated `query_stats` scopes toggle button in player transport bar.
- **`src/renderer/screens/timeline/ui/TimelineScreen.tsx` & `KeyboardShortcutsModal.tsx`**:
  - Bound `Shift+C` hotkey and documented under `Timeline Editing`.

## 3. Verification Plan
- Unit tests in `video-scopes-ops.test.ts` (12/12 passed).
- Full Vitest suite (`npm test`, 25 test files, 239/239 passed).
- TypeScript typecheck (`npm run typecheck`, 0 errors).
- Production build verification (`npx vite build --config vite.renderer.config.ts` & `vite.main.config.ts`).
