# Step S56: Multiband Spectral Audio Denoiser, De-Clicker & Harmonic Hum Removal Engine

## Overview & Background
In high-end audio post-production (such as iZotope RX Advanced Spectral De-noise, DaVinci Resolve Fairlight Voice Isolation / De-Hummer, and Adobe Audition Spectral Frequency Restoration):
- **4-Band Multiband Spectral Noise Reduction**: Dividing the audio frequency spectrum into 4 acoustic bands:
  - Low (20 Hz – 250 Hz): Low rumble, air conditioning thrum, traffic vibration.
  - Low-Mid (250 Hz – 1,000 Hz): Room reverberation, boxiness, electrical hum overtones.
  - High-Mid (1,000 Hz – 4,000 Hz): Harsh sibilance, fan whirr, computer cooling noise.
  - High (4,000 Hz – 20,000 Hz): Tape hiss, digital white/pink noise, microphone preamp self-noise.
- **Harmonic Mains De-Hummer**:
  - Ground-loop alternator buzz and powerline hum at 50 Hz (Europe, UK, Asia, Australia) or 60 Hz (Americas, Japan 60Hz).
  - Harmonic overtone elimination: Selectable overtone suppression up to 8 harmonics ($f \cdot k$, e.g., 60Hz, 120Hz, 180Hz, 240Hz...) using high-Q notch filters with narrow bandwidth ($Q=10$) to preserve speech and musical warmth.
- **Transient De-Clicker**:
  - Removal of vinyl record pops, digital clocking clicks, mouth smacks, and tongue clicks.
  - Configurable sensitivity (1 to 10) mapped inversely to FFmpeg `adeclick` detection threshold.
- **FFmpeg Master Export Filter Pipeline**:
  - Synthesizing frame-accurate audio filter pipelines combining `afftdn`, `adeclick`, and cascading harmonic notch equalizers (`equalizer=f=...:width_type=q:w=10:g=-24`).

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/multiband-denoiser-ops.ts`)
- `MultibandDenoiserSettings`: `{ enabled, lowReductionDb, lowMidReductionDb, highMidReductionDb, highReductionDb, noiseFloorDb, declickEnabled, declickSensitivity, dehumEnabled, dehumFrequency, dehumHarmonics, preset }`.
- `DehumFrequency`: `50 | 60`.
- `MultibandDenoiserPresetKey`: `'vocal_clean' | 'podcast_voice' | 'hiss_remover' | 'vinyl_restore' | 'mains_hum_destroyer'`.
- `DEFAULT_MULTIBAND_DENOISER_SETTINGS`: Neutral defaults with denoiser bypassed.
- `MULTIBAND_DENOISER_PRESETS`: 5 curated presets for voice, podcast, tape hiss, vinyl record restoration, and mains hum destruction.
- `calculateHarmonicFrequencies(baseFreq, harmonicsCount)`: Computes harmonic overtone notch series up to 8th multiple.
- `calculateEffectiveSpectralReduction(bandReductions)`: Computes root-mean-square spectral attenuation across all 4 frequency bands.
- `buildFfmpegMultibandDenoiserFilter(settings)`: Synthesizes frame-accurate FFmpeg audio filter chains (`afftdn`, `adeclick`, and harmonic notch equalizers).

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `multibandDenoiser?: MultibandDenoiserSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.multibandDenoiser` in Zod schema.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and utility methods from `multiband-denoiser-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Multiband Audio Denoiser & De-Clicker" section under Audio tab for audio and video clips.
- Integrated master bypass toggle and preset buttons (Clean Vocal, Podcast Voice, Tape Hiss, Vinyl Clean, Hum Buster).
- Built interactive 4-Band Spectral Noise Reduction faders with decibel readouts:
  - Low (20–250 Hz)
  - Low-Mid (250–1kHz)
  - High-Mid (1k–4kHz)
  - High (4k–20kHz)
  - Overall Noise Floor (-80 dB to -20 dB)
- Added Transient De-Clicker toggle with Sensitivity slider (1–10).
- Added Harmonic Mains De-Hummer toggle with fundamental frequency selector (50 Hz / 60 Hz) and Harmonics slider (1 to 8 overtones).

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/multiband-denoiser-ops.test.ts` (9 dedicated unit tests verifying harmonic overtone calculations, RMS spectral reduction, preset bounds, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 50 test files passed, 585 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
