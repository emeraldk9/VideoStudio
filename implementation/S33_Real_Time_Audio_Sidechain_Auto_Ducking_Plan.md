# S33: Real-Time Audio Sidechain Auto-Ducking Engine & Live Gain Reduction

## Overview
Step S33 delivers a broadcast-quality real-time sidechain auto-ducking engine for VideoStudio. Prior to this step, background music previewed unducked in the timeline player and was only compressed at final export time. With Step S33, background music (`role === 'music'`) and non-exempt video audio smoothly and automatically attenuate under dialogue (`role === 'narration'` and `duckExempt === true` video clips) in real time with frame-accurate attack, hold, and release curves. The feature includes an Auto-Ducking control center in `AudioMixerDock`, a live pulsing Gain Reduction (GR) LED meter, channel role badges (`[KEY]` and `[BED]`), and unified FFmpeg export alignment.

---

## Technical Architecture & Implementation

### 1. Pure Sidechain Ducking Arithmetic & Envelope Engine (`src/shared/utils/timeline/audio-ducking-ops.ts`)
- **`DuckingSettings`**:
  ```ts
  export interface DuckingSettings {
    enabled: boolean;          // default true
    duckingDepthDb: number;   // default -12 dB (range: -30 dB to -3 dB)
    thresholdDb: number;      // default -28 dB (range: -40 dB to -10 dB)
    attackMs: number;         // default 30 ms (range: 5 ms to 200 ms)
    holdMs: number;           // default 150 ms (range: 0 ms to 500 ms)
    releaseMs: number;        // default 400 ms (range: 100 ms to 2000 ms)
  }
  ```
- **Track & Clip Classification**:
  - `isTrackDuckKey`: Audio tracks with `role === 'narration'`.
  - `isTrackDuckTarget`: Audio tracks with `role === 'music'`.
  - `isClipDuckKey`: Dialogue clips on narration tracks and video clips with `duckExempt: true`.
  - `isClipDuckTarget`: Music clips on music tracks and video clips with `duckExempt !== true`.
- **Dialogue Detection (`isDialogueActiveAtFrame`)**:
  - Evaluates active narration or duckExempt dialogue clips at any frame $F$, honoring track mute/solo and audio activation.
- **Envelope Follower Math (`calculateDuckingEnvelopeGain`)**:
  - Computes instantaneous gain multiplier ($10^{\text{gainDb}/20}$) and attenuation in decibels:
    - **Active Dialogue Phase**: Linear/cosine attack ramp towards `duckingDepthDb` over `attackMs`.
    - **Hold Phase**: Retains full `duckingDepthDb` for `holdMs` (default 150 ms) after speech pauses, preventing unnatural volume pumping between words.
    - **Release Phase**: Smoothly recovers from `duckingDepthDb` back to `0 dB` (unity) over `releaseMs`.
- **FFmpeg Filter Generator (`buildFfmpegSidechainCompressFilter`)**:
  - Generates matching `sidechaincompress=threshold=...:ratio=...:attack=...:release=...` parameters.

### 2. Audio Console Mixer State (`audioMixerStore.ts`)
- Added `ducking: DuckingSettings`, `setDucking(patch)`, `resetDucking()`.
- Added `currentGainReductionDb: number` and `setCurrentGainReductionDb(db)` for live LED meter feedback.

### 3. Timeline Preview Playback & Scrubbing Engine (`TimelinePreview.tsx`)
- Subscribed to `ducking` and calculated frame-accurate `duckingResult` per tick.
- Applied ducking multiplier directly to duckable audio tracks and background video audio during both continuous playback and scrubbing.
- Updated `setCurrentGainReductionDb` during playback to animate the live GR meter.
- Removed legacy "ducking previews unducked" disclaimer from accuracy tooltip.

### 4. Audio Console Mixer UI & Channel Badges (`AudioMixerDock.tsx`)
- **Auto-Ducking Control Group**:
  - Ducking toggle button: `Duck: ON / OFF`.
  - Live Gain Reduction (GR) meter badge: pulses amber/red showing active attenuation (e.g. `GR: -12.0 dB`).
  - Tune button opening the Collapsible Sidechain Configuration Panel.
- **Collapsible Configuration Panel**:
  - Depth slider (-30 dB to -3 dB), Threshold slider (-40 dB to -10 dB), Attack slider (10 ms to 150 ms), Release slider (100 ms to 1000 ms).
  - Quick Presets: Subtle (-8dB), Dialogue (-12dB), Voiceover (-18dB).
- **Channel Strip Role Badges**:
  - `KEY`: Dialogue / Narration track header badge in purple.
  - `BED`: Music / Bed track header badge in emerald; dynamically switches to pulsing amber showing active dB reduction when ducked.

---

## Verification
- **Vitest**: 27/27 test files passed (**277 unit tests, 100% pass rate**).
- **TypeScript**: `tsc --noEmit` completed with **0 errors**.
- **Production Bundling**: `vite.renderer.config.ts` (7.92s) and `vite.main.config.ts` (8.50s) built cleanly.
