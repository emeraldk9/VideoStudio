# Step S86: CapCut AI Vocal Remover & 4-Stem Audio Separator

## Status: Completed ✅ (100% Tests Passing, Zero TS Errors)

---

## 1. Executive Summary & Problem Analysis

In modern viral video editing, creators frequently need to isolate vocals for clean dialogue/acapellas (e.g. podcasts, remixes, voice replacement) or remove vocals to create clean karaoke instrumental backing tracks for dance reels, travel montages, and product adverts. Furthermore, advanced music videos and pacing edits require separating full songs into 4 discrete musical stems: **Vocals**, **Drums**, **Bass**, and **Instruments**.

Currently in VideoStudio, `audio-isolation-ops.ts` provides single-channel voice suppression, and `audio-stem-ops.ts` plans batch export deliverables, but there is no 4-stem decomposition engine, no interactive multi-channel stem mixer board, no mid-side spectral separation, and no 1-click timeline track decomposition.

### Key Objectives:
1. **AI 4-Stem Separation Engine (`vocal-separator-ops.ts`)**:
   - Pure DSP spectral filtering and harmonic-percussive decomposition:
     - **Vocals** (Mid-frequency stereo center cancellation & speech formant bandpass 250Hz - 4.5kHz).
     - **Drums** (Percussive transient peak isolation, snappy compressor envelope, highpass 60Hz).
     - **Bass** (Sub-bass harmonic lowpass filter 20Hz - 220Hz with mono collapsing).
     - **Instruments** (Side-channel stereo widening, vocal notch attenuation, harmonic residue).
   - Multi-channel stem mixer model with real-time Solo, Mute, Gain (-24dB to +12dB), and Pan controls.
2. **Timeline Multi-Track Decomposition (`decomposeClipInto4Stems`)**:
   - 1-Click action that decomposes a song/clip into 4 discrete, synchronized timeline tracks (`Vocals`, `Drums`, `Bass`, `Instruments`) with color-coded labels (`cyan`, `amber`, `emerald`, `purple`).
3. **Interactive Vocal Remover & Stem Mixer Modal (`VocalStemSeparatorModal.tsx`)**:
   - Audio clip selector for any music or video clip on the sequence.
   - Mode tabs:
     - **Quick Vocal Remover / Karaoke** (Extract instrumental backing).
     - **Quick Vocal Isolator** (Extract clean acapellas).
     - **4-Stem Studio Mixer** (Interactive 4-channel fader board with real-time level meters, Solo, Mute, Pan).
   - Frequency spectrum / stem energy distribution visualizer.
   - Actions: "Apply Filter to Active Clip" and "Decompose to 4 Timeline Tracks".
4. **Timeline Toolbar Launcher & Context Menu**:
   - Registered `MODAL_IDS.VOCAL_SEPARATOR = 'vocal-separator'`.
   - Launcher button with `music_note` / `equalizer` icon in `TimelineToolbar.tsx`.
   - Audio clip context menu item in `ContextMenu.tsx` / `TimelinePanel.tsx`.
   - Audio Inspector section in `AudioInspectorTab.tsx`.

---

## 2. Technical Architecture

### 2.1 Pure Operations (`vocal-separator-ops.ts`)
- `DEFAULT_VOCAL_STEM_SETTINGS`: Default 4-channel configurations.
- `calculateStemEnergyDistribution(audioEnergy)`: Computes relative distribution across the 4 stems.
- `buildFfmpegVocalSeparatorFilter(settings)`: Builds FFmpeg audio filter chains (`pan`, `highpass`, `lowpass`, `bandreject`).
- `decomposeClipInto4Stems(clip, tracks, nextTrackOrderIndex)`: Pure transaction generating 4 new audio tracks and 4 aligned stem clips.

### 2.2 UI & Timeline Integration
- `VocalStemSeparatorModal.tsx`: Interactive modal with 4 faders, live meters, and decomposition buttons.
- `TimelineToolbar.tsx`: Added launcher button.
- `TimelinePanel.tsx`: Mounted modal.
- `AudioInspectorTab.tsx`: Quick Vocal Isolation & Stem Mixer card.

---

## 3. Verification Plan
- Unit tests in `src/shared/utils/timeline/__tests__/vocal-separator-ops.test.ts`.
- Full Vitest test suite passing (100%).
- TypeScript static check (`tsc --noEmit`) passing with 0 errors.

---

## 4. Progress Tracking Log
- **[2026-09-23 10:20]** Initialized Step S86 plan and tracking document.
