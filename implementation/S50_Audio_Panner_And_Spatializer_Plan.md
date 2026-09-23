# Step S50: Audio Stereo Panner, Binaural 3D Spatializer & Surround Sound Panning Engine

## Overview & Background
In professional post-production (Adobe Premiere Pro Pan Controls, DaVinci Resolve Fairlight Sound Panner & 3D Spatial Audio, Final Cut Pro Stereo Panning):
- **Stereo Panning**: Controlling placement between Left (-1.0 / 100% Left) and Right (+1.0 / 100% Right) channels.
- **Equal-Power Pan Laws**: Preventing acoustic center build-up or volume dips. Using standard pan laws:
  - `-3.0 dB`: Constant acoustic power ($G_L^2 + G_R^2 = 1$), center attenuation is $\cos(\pi/4) \approx 0.7071$.
  - `-4.5 dB`: Intermediate balance for cinema and broadcast mixes ($\cos^{1.5}$).
  - `-6.0 dB / Linear`: Constant voltage sum ($G_L + G_R = 1$), center attenuation is $0.5$.
- **Binaural 3D Spatial Audio**: Positioning audio sources in spherical space around the listener:
  - **Azimuth** ($-180^\circ$ to $+180^\circ$): Horizontal rotation around the listener head.
  - **Elevation** ($-90^\circ$ to $+90^\circ$): Vertical tilt (above or below listener).
  - **Distance** ($0.1\text{m}$ to $50\text{m}$): Radial distance with realistic inverse square acoustic rolloff.
- **Cartesian Spatial Coordinates**: Converting spherical coordinates $(\theta, \phi, r)$ into standard Web Audio 3D coordinates $(x, y, z)$.
- **Export Filter Serialization**: Translating stereo pan settings into FFmpeg `pan` audio filters (`pan=stereo|c0=...*c0|c1=...*c1`).
- **Interactive Visual Radar HUD**: Interactive top-down soundstage radar HUD rendered directly in the Audio Inspector.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/audio-pan-ops.ts`)
- `AudioPanSettings`: `{ enabled, pan, panLaw, spatial3dEnabled, azimuth, elevation, distance, preset }`.
- `PanLawKey`: `'equal_power_3db' | 'equal_power_45db' | 'linear_6db'`.
- `PanPresetKey`: `'center' | 'hard_left' | 'hard_right' | 'wide_stereo' | 'front_center' | 'rear_left' | 'rear_right' | 'overhead'`.
- `DEFAULT_AUDIO_PAN_SETTINGS`: Neutral defaults ($pan = 0$, center, $3\text{dB}$ equal power).
- `PAN_PRESETS`: 8 curated stereo and 3D spatial presets.
- `calculateEqualPowerPanGains(pan, panLaw)`: Returns normalized `[gainL, gainR]` gains conforming to equal-power or linear acoustic laws.
- `calculateSpatialCoordinates(azimuth, elevation, distance)`: Computes Cartesian $(x, y, z)$ coordinates for Web Audio `PannerNode`.
- `calculateDistanceGain(distance, refDistance, maxDistance, rolloffFactor)`: Inverse distance attenuation clamping.
- `buildFfmpegPanFilter(settings)`: Synthesizes frame-accurate FFmpeg audio filter strings.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `pan?: AudioPanSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.pan` in Zod.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `audio-pan-ops`.

### 4. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Stereo Panner & 3D Spatial Audio" section under the Audio tab for audio-carrying clips.
- Integrated soundstage radar HUD visualizer depicting listener position and active sound vector.
- Added live L/R equal-power percentage readouts.
- Included Pan Law selector (`-3.0 dB`, `-4.5 dB`, `-6.0 dB`).
- Integrated 3D Spatial Audio controls: Azimuth slider, Elevation slider, Distance slider, and calculated Cartesian $(X, Y, Z)$ readouts.
- Curated preset buttons with instant switching.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/audio-pan-ops.test.ts` (14 dedicated unit tests verifying equal power gains, pan law edge cases, spherical to Cartesian transforms, distance attenuation, and FFmpeg filter generation).
- **Vitest Full Test Suite**: 44 test files passed, 508 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
