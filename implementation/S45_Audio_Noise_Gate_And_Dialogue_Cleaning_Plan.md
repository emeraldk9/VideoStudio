# S45: Audio Noise Gate, Downward Expander & Dialogue De-Esser / De-Hummer Engine

## 1. Overview & Objective
Step S45 introduces a broadcast-grade **Audio Noise Gate, Downward Expander & Dialogue De-Esser / De-Hummer Engine** into VideoStudio, completing the professional studio audio mastering suite alongside the 3-Band Parametric EQ (S35), Dynamic Range Compressor & Peak Limiter (S36), Reverb & Stereo Echo Delay (S41), and Rhythm Transient Detection (S44).

Key capabilities delivered:
- **Mathematical Downward Expander & Hard Gate (`calculateGateGainReduction`)**:
  - Continuous dB transfer curve with soft-knee smoothing across threshold $(-60 \dots 0\text{ dB})$.
  - Configurable ratio ($1:1 \dots 16:1$, with $\ge 12:1$ acting as a firm gate).
  - Configurable attenuation floor/range ($-80 \dots -6\text{ dB}$).
  - Dynamic hysteresis gap ($0 \dots 12\text{ dB}$) decoupling opening and closing thresholds to prevent flutter on spoken dialogue.
- **Dynamic Ballistics & Envelope Smoothing**:
  - Attack time ($0.5 \dots 30\text{ ms}$), Hold time ($0 \dots 500\text{ ms}$), and Release time ($20 \dots 600\text{ ms}$).
- **Vocal De-Esser**:
  - Parametric high-frequency sibilance suppression ($4000 \dots 9000\text{ Hz}$) targeting harsh consonants ("s", "sh", "t") with up to $-18\text{ dB}$ attenuation.
- **Mains Ground-Loop De-Hummer**:
  - Notch filtering for 50Hz / 100Hz (European / International mains) and 60Hz / 120Hz (American mains) AC hum.
- **FFmpeg Master Export Filter (`buildFfmpegGateFilter`)**:
  - Synthesizes `agate=threshold=...dB:ratio=...:range=...:attack=...:release=...:knee=...` with chained parametric equalizer notch filters.
- **Inspector UI Suite Integration**:
  - Added dedicated **Noise Gate & Dialogue Cleaning** section in `ClipInspector.tsx` with:
    - Master on/off toggle and reset button.
    - 6 broadcast preset buttons (`Voiceover Clean`, `Hard Gate`, `Room Expander`, `De-Esser`, `50Hz Hum`, `60Hz Hum`).
    - Real-time SVG transfer curve visualization with threshold line, -60dB/0dB axes, and diagonal unity reference.
    - Sliders for Threshold, Ratio, Range Floor, Attack, and Release.
    - De-Esser toggle with frequency and cut controls.
    - De-Hummer 3-way mode buttons (`Off`, `50Hz`, `60Hz`).

---

## 2. Architecture & Implementation

### A. Core Mathematical & Audio DSP Engine
- **File**: `src/shared/utils/timeline/audio-gate-ops.ts`
  - Defines `ClipNoiseGateSettings`, `NoiseGatePresetKey`, and `NOISE_GATE_PRESETS`.
  - `calculateGateGainReduction`: Analytical soft-knee gain reduction equation.
  - `sampleGateCurvePoints`: Produces coordinate pairs $(x, y)$ for SVG transfer curve rendering.
  - `buildFfmpegGateFilter`: Generates `agate` and notch equalizer filtergraph strings for exports.

### B. Effects Model & Validation
- **File**: `src/shared/utils/timeline/effects.ts`
  - Extended `ClipEffects` interface with `noiseGate?: ClipNoiseGateSettings`.
  - Extended `clipEffectsSchema` in Zod with validation for all threshold, ratio, range, timing, and notch filter options.
- **File**: `src/shared/index.ts`
  - Re-exported all gate types, presets, and functions.

### C. Inspector UI Suite
- **File**: `src/renderer/features/timeline-edit/ui/ClipInspector.tsx`
  - Rendered `Noise Gate & Dialogue Cleaning` section under Audio tab.
  - Integrated SVG transfer curve, preset selector, and interactive sliders.

---

## 3. Verification & Test Results
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/audio-gate-ops.test.ts`: **11/11 tests passed**.
  - Total test suite: **39 test files passed, 451/451 tests passed (100%)**.
- **TypeScript Typecheck**:
  - `npm run typecheck` (`tsc --noEmit`): **0 errors (Exit Code 0)**.
- **Production Bundles**:
  - `npx vite build --config vite.renderer.config.ts`: **Successfully built in 8.87s (Exit Code 0)**.
  - `npx vite build --config vite.main.config.ts`: **Successfully built in 8.82s (Exit Code 0)**.
