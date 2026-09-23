# Step S22: Interactive Audio Gain Rubberband, Clip Fade Handles, and Audio Gain HUD (G)

## Status: Complete

## Executive Summary
Professional audio editing on the timeline requires rapid, tactile control over clip levels and fades directly on the timeline canvas:
1. **Interactive Fade In/Out Drag Handles**:
   - Visual drag handles at clip corners (top-left for fade-in, top-right for fade-out) when clips are audio-capable.
   - Horizontal drag intuitively adjusts `fadeInFrames` and `fadeOutFrames`.
   - Dynamic SVG attenuation slope ramp overlay (`<svg>` polygon with dashed hypotenuse) rendering the volume curve directly over the clip.
2. **Interactive Audio Gain Rubberband (Volume Line)**:
   - Draggable horizontal line running across audio clips at a height proportional to `gainDb` (-40 dB to +20 dB).
   - Real-time dB tooltip badge during vertical drag gestures.
   - Double-click to instantly reset gain to unity (`0.0 dB`).
3. **Audio Gain HUD Modal & Shortcut (`G`)**:
   - Industry-standard `G` shortcut, toolbar button (`graphic_eq`), or context menu action opens `AudioGainModal`.
   - Direct dB adjustment with quick stepping ($\pm1\text{ dB}$, $\pm3\text{ dB}$, $\pm6\text{ dB}$, $\pm12\text{ dB}$) and fade presets (`0.25s`, `0.5s`, `1.0s`, `2.0s`).
4. **Pure Operational Utilities & Test Coverage**:
   - Math helpers for dB-to-screen coordinate mapping, clamping, and fade frame derivation in `src/shared/utils/timeline/audio-gain-ops.ts`.
   - 14 passed unit tests in `src/shared/utils/timeline/__tests__/audio-gain-ops.test.ts`.

---

## Verification Results
- **Unit Tests**: `npx vitest run src/shared/utils/timeline/__tests__/audio-gain-ops.test.ts` (14/14 tests passed).
- **Full Test Suite**: `npm test` (16/16 test files passed, 118/118 unit tests passed).
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) (0 errors).
- **Production Bundle**: `npx vite build --config vite.main.config.ts` (Clean build in 7.26s).
