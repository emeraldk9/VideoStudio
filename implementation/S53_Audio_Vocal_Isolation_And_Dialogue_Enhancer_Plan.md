# Step S53: AI Audio Vocal Isolation, Dialogue Enhancer & Stems Separation Engine

## Overview & Background
In professional post-production and content creation (such as DaVinci Resolve Voice Isolation & Dialogue Leveler, Adobe Premiere Pro AI Enhance Speech, CapCut Vocal Isolation, and Descript Studio Sound):
- **Vocal & Speech Isolation**: Extracting clean dialogue from noisy environments (wind, traffic, air conditioners, room reverberation) without phase distortion or "underwater" artifacts.
- **Instrumental & Stems Separation**: Separating dialogue/vocals from underlying background music and ambient Foley sound effects (Karaoke / Acapella isolation).
- **Dialogue Clarity & Intelligibility**: Dynamic spectral enhancement emphasizing vocal formants (1kHz - 4kHz) while suppressing rumble (<80Hz) and sibilant harshness.
- **Vocal Presence & Leveling**: Dynamic speech normalization ensuring consistent conversational volume across uneven microphone distances.
- **FFmpeg Master Export Filter Pipeline**: Serializing frame-accurate `speechnorm`, `afftdn`, `equalizer`, and band-pass filtering chains for export.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/audio-isolation-ops.ts`)
- `AudioIsolationSettings`: `{ enabled, mode, isolationStrength, speechClarity, deReverbAmount, levelerEnabled, targetLufs, preset }`.
- `AudioIsolationMode`: `'vocal_isolate' | 'instrumental_isolate' | 'dialogue_enhance' | 'de_reverb'`.
- `AudioIsolationPresetKey`: `'podcast_clarity' | 'interview_cleanup' | 'acapella_vocal_only' | 'karaoke_instrumental'`.
- `DEFAULT_AUDIO_ISOLATION_SETTINGS`: Neutral defaults with isolation bypassed.
- `AUDIO_ISOLATION_PRESETS`: 4 curated presets (Podcast Clarity, Street Interview, Acapella, Karaoke).
- `calculateSpeechGainBoost(clarity)`: Computes parametric vocal formant boost in the 2.5kHz–3.5kHz intelligibility band.
- `calculateNoiseFloorReduction(strength)`: Computes decibel attenuation curve up to -36 dB.
- `buildFfmpegIsolationFilter(settings)`: Synthesizes frame-accurate FFmpeg audio filter strings (`highpass`, `afftdn`, `bandpass`, `stereotools`, `equalizer`, `speechnorm`).

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `audioIsolation?: AudioIsolationSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.audioIsolation` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `audio-isolation-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "AI Vocal Isolation & Dialogue Enhancer" section under Audio tab for audio-carrying clips.
- Integrated master switch, preset buttons, mode selectors (`Dialogue Enhance`, `Vocal Isolate`, `Instrumental`, `De-Reverb`).
- Added sliders for Isolation Strength (0%-100%), Speech Clarity (0%-100%), De-Reverb (0%-100%), and Auto Dialogue Leveler toggle with target LUFS display.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/audio-isolation-ops.test.ts` (12 dedicated unit tests verifying speech gain boost, noise floor suppression, preset boundaries, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 47 test files passed, 552 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
