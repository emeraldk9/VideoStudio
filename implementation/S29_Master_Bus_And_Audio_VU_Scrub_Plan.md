# Implementation Plan: Step S29 — Master Bus & Per-Track Audio VU Peak-Hold Meters + Real-time Audio Scrub Engine

Elevate VideoStudio's audio monitoring and timeline editing into studio-grade precision: professional dBFS peak-hold audio meters, master stereo toolbar meter, and tape-style jitter-free audio scrubbing on timeline gestures.

## 1. Background & Architecture
- **Audio Meter Accuracy**: Replaced mock pulses with mathematically accurate stereo dBFS metering (-60 dB to +6 dB), peak-hold decay tracking (1200ms hold, 20 dB/s decay), and persistent clipping flags (> 0 dBFS).
- **Real-time Toolbar Metering**: Compact dual L/R LED meter directly beside the Audio Console button with live dB readout and one-click mixer drawer toggle.
- **Audio Scrubbing (Tape-style transient inspection)**: Smooth, pop-free 55ms audio grain playback on paused playhead movement and frame-stepping (`Left`/`Right` arrow keys), managed via Web Audio API gain envelopes.

## 2. Key Modules & Functions
- **`src/shared/utils/timeline/audio-meter-ops.ts`**:
  - `linearToDb(linear: number): number`
  - `dbToLinear(db: number): number`
  - `dbToMeterPercent(db: number): number`
  - `calculateStereoPan(pan: number)` (equal-power law)
  - `updatePeakHold(currentDb, state, now)`
  - `computeTrackStereoLevels({ track, clips, playheadFrame, trackMixerState, isSoloEngaged })`
  - `computeMasterStereoLevels({ trackLevels, masterVolumeDb, masterLimiter })`
- **`src/renderer/features/timeline-preview/lib/audioScrubEngine.ts`**:
  - `triggerAudioScrubGrain({ sourcePath, atSeconds, volume })`
  - `stopAudioScrub()`
- **`src/renderer/entities/sequence/model/sequenceStore.ts`**:
  - `audioScrubEnabled: boolean`
  - `toggleAudioScrub()`
  - `setAudioScrubEnabled(enabled)`
- **`src/renderer/features/timeline-edit/ui/AudioMixerDock.tsx`**:
  - Stereo L/R channel strips with peak-hold lines and clickable red CLIP reset badges.
  - Mixer header audio scrub toggle button (`Shift+S`).
- **`src/renderer/features/timeline-edit/ui/TimelineToolbar.tsx`**:
  - `CompactMasterVuMeter` sub-component with L/R visual meter and live dB display.
- **`src/renderer/screens/timeline/ui/TimelineScreen.tsx` & `KeyboardShortcutsModal.tsx`**:
  - Bound `Shift+S` shortcut and documented under `Timeline Editing`.

## 3. Verification Plan
- Unit tests in `audio-meter-ops.test.ts` (14/14 passed).
- Full Vitest suite (`npm test`, 23 test files, 207/207 unit tests passed).
- Zero TypeScript typecheck errors (`npm run typecheck`, 0 errors).
- Production bundle verification (`npx vite build --config vite.renderer.config.ts` & `vite.main.config.ts`, clean builds).
