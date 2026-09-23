# Milestone S71: Auditory Waveform Peak Metering & EBU R128 Broadcast Loudness Radar

**Status:** Completed ✅  
**Scope:** True-peak audio metering, integrated LUFS loudness radar, short-term/momentary graphs, K-weighting filter curve, and EBU R128 / ITU-R BS.1770-4 compliance for professional broadcast normalization.

---

## 1. Executive Summary & Problem Statement
In professional video and audio post-production (broadcast television, YouTube, Spotify, Apple Podcasts, Netflix):
- **Current Behavior in VideoStudio:**
  - Peak metering in `AudioMixerDock.tsx` and `TimelineToolbar.tsx` relies on basic linear sample dBFS peak approximations (`20 * log10(abs(sample))`).
  - Lacks K-weighting pre-filter curve (ITU-R BS.1770-4 / EBU R128).
  - Lacks Integrated LUFS (Loudness Units relative to Full Scale), Momentary LUFS (400ms window), Short-Term LUFS (3s window), and True Peak (dBTP inter-sample peak detection).
  - Audio exported without broadcast normalization can be rejected by streaming platforms (-14 LUFS for YouTube, -16 LUFS for Apple, -23/-24 LUFS for EBU/ATSC broadcast).
- **The Solution (Milestone S71):**
  - **ITU-R BS.1770-4 / EBU R128 Pure Math Operations (`ebu-r128-ops.ts`):**
    - Stage 1: Pre-filtering (high-shelf filter simulating human head acoustic diffraction).
    - Stage 2: RLB weighting (high-pass filter modeling human hearing frequency sensitivity).
    - True-Peak detector with 4x oversampling interpolation to catch inter-sample clipping.
    - Gating algorithm: Absolute threshold (-70 LKFS) + Relative threshold (-10 LU relative to ungated loudness).
    - Momentary Loudness ($M$, 400ms), Short-term Loudness ($S$, 3s), Integrated Loudness ($I$), Loudness Range (LRA).
  - **Broadcast Target Presets:**
    - EBU R128 (-23.0 LUFS, -1.0 dBTP)
    - ATSC A/85 (-24.0 LUFS, -2.0 dBTP)
    - YouTube / Spotify (-14.0 LUFS, -1.0 dBTP)
    - Apple Music / Podcasts (-16.0 LUFS, -1.0 dBTP)
  - **Interactive Loudness Radar & True Peak Meter Dock (`LoudnessRadarModal.tsx` / `LoudnessRadarDock.tsx`):**
    - Circular radar sweep display showing momentary/short-term loudness history over time.
    - Real-time numerical readout of Integrated LUFS, Short-term LUFS, Momentary LUFS, Loudness Range (LRA), and True Peak Max (dBTP).
    - Color-coded target zones (Green: Target $\pm 1$ LU, Yellow: Warning, Red: Exceeding limit).
    - One-click "Apply Broadcast Normalization Gain" button calculating exact gain adjustment needed ($\Delta \text{dB} = \text{Target LUFS} - I$).

---

## 2. Technical Architecture & Implementation Steps

### 2.1 Pure EBU R128 Operations (`src/shared/utils/timeline/ebu-r128-ops.ts`)
- Implement biquad filter coefficients for K-weighting:
  - High-shelf filter: $+4 \text{ dB}$ gain at high frequencies ($f_0 \approx 1682 \text{ Hz}, Q \approx 0.707$).
  - High-pass filter: 2nd-order Butterworth cutoff at $f_0 \approx 38 \text{ Hz}, Q \approx 0.5$.
- Compute Mean Square energy across channels with channel weights ($L = 1.0, R = 1.0, C = 1.0, LFE = 0.0, Ls = 1.41, Rs = 1.41$).
- Calculate True-Peak oversampling (Whittaker-Shannon 4x sinc/cubic interpolation).
- Implement standard EBU R128 presets and gain normalization formulas.

### 2.2 Unit Test Suite (`src/shared/utils/timeline/__tests__/ebu-r128-ops.test.ts`)
- Test K-weighting filter responses.
- Test sine wave calibration (-23 LUFS reference tone).
- Test gating threshold exclusions for silent pauses.
- Test True Peak detection with inter-sample peaks.
- Test broadcast preset target lookups and auto-gain calculation.

### 2.3 UI Loudness Radar & Audio Mixer Integration
- Create `src/renderer/features/audio-mixer/ui/LoudnessRadarModal.tsx` / dock component.
- Add Loudness Radar toggle button in `AudioMixerDock.tsx` and `TimelineToolbar.tsx`.
- Connect to audio playback buffer / audio worklet or live meter store.

---

## 3. Verification Plan
- `npx vitest run src/shared/utils/timeline/__tests__/ebu-r128-ops.test.ts`
- Full `npx vitest run` (target: 64/64 suites passing, 765+ tests).
- `npm run typecheck` (`tsc --noEmit`): 0 errors.
