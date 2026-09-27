# Milestone S155: Multi-Track Whiteboard Master Sequence Audio Stems & Dolby Atmos Spatial Panning

## Overview
Milestone S155 introduces a 3D Spatial Audio and Dolby Atmos panning engine for whiteboard animation sequences. The engine dynamically positions audio sources (presenter voice, pen nib tool contact, felt eraser sweeps, background music, room ambience) within a 3D hemispherical soundstage $(x, y, z)$ matching the canvas visual coordinates, computing real-time binaural psychoacoustic cues (ITD, ILD, elevation pinna filtering, distance falloff) and multi-channel 7.1.4 speaker bed pan coefficients, alongside ADM BWF (Audio Definition Model) object metadata export for master sequence stem buses.

## Architectural Components

### 1. 3D Coordinate Mapping & Soundstage
- Normalizes canvas coordinates $(x_{canvas}, y_{canvas})$ into listener soundstage coordinates $(x \in [-1, 1], y \in [0.5, 5.0], z \in [-1, 1])$ where listener is centered at $(0, 0, 0)$ facing positive $y$.
- Source dynamic tracking:
  - **Tool Foley**: Directly follows active marker/pen nib position $(x(t), y(t))$ on the board.
  - **Eraser Foley**: Follows eraser sweep bounding box centroid and velocity.
  - **Presenter Speech**: Positioned at presenter avatar or configurable hand position with proximity effect.
  - **Music Bed / Room Ambience**: Diffuse surround soundstage with adjustable width and decorrelation.

### 2. Psychoacoustic Binaural Acoustics Engine
- **Interaural Time Difference (ITD)**:
  - Spherical head acoustic model (Woodworth-Schlosser):
    $$\text{ITD}(\theta) = \frac{r_{\text{head}}}{c_s} (\sin|\theta| + |\theta|) \cdot \text{sign}(\theta)$$
    where head radius $r_{\text{head}} \approx 0.0875\text{ m}$, speed of sound $c_s \approx 343\text{ m/s}$, max $\text{ITD} \approx 0.66\text{ ms}$.
- **Interaural Level Difference (ILD)**:
  - Frequency and azimuth head-shadowing model:
    $$\text{ILD}(\theta, f) = 20 \log_{10}\left(1 + \left(\frac{f}{f_0}\right)^2 \sin^2\theta\right)^{1/2}$$
    clamped to $[-20\text{ dB}, +20\text{ dB}]$.
- **Distance Attenuation & Air Absorption**:
  - Distance $d = \sqrt{x^2 + y^2 + z^2}$.
  - $A(d) = \frac{1}{\max(1.0, (d / d_{\text{ref}})^\gamma)} \cdot \exp(-\mu \cdot d)$ with distance falloff exponent $\gamma \in [0.5, 2.0]$.
- **Elevation Pinna Spectral Notch Filter**:
  - Elevation angle $\phi = \arcsin(z / d)$.
  - Median plane pinna notch center frequency: $f_{\text{notch}}(\phi) \approx 6500 + 3500 \cdot \sin\phi\text{ Hz}$.

### 3. Dolby Atmos 7.1.4 Speaker Bed Matrix & Object Metadata
- **Bed Channels**:
  - Ear-level 7.1: L (Left), R (Right), C (Center), LFE (Sub), Ls (Left Surround), Rs (Right Surround), Lb (Left Back), Rb (Right Back).
  - Height 0.0.4: Tfl (Top Front Left), Tfr (Top Front Right), Tbl (Top Back Left), Tbr (Top Back Right).
- **VBAP (Vector Base Amplitude Panning)**:
  - 3D triangle mesh panning across speaker coordinates for exact immersive placement.
- **ADM BWF Object Metadata**:
  - Generates ITU-R BS.2076 compliant XML metadata nodes `<audioBlockFormat>` with cartesian positions $(x, y, z)$, gain, spread, and channel locks for DAW mastering (Pro Tools, Logic Pro, DaVinci Resolve Fairlight).

### 4. Multi-Track Master Stem Export
- Stems: `Speech`, `ToolFoley`, `EraserFoley`, `MusicBed`, `RoomAmbience`.
- Downmix modes: `StereoBinaural`, `Surround51`, `Atmos714`, `ADM_BWF_Objects`.

## Status: COMPLETED & VERIFIED
- Python Engine: `scripts/core/spatial_audio_atmos_engine.py` (Test 76 verified passing, total 76/76 passing).
- VideoStudio Ops: `src/shared/utils/timeline/spatial-audio-atmos-ops.ts` (7/7 vitest unit tests passing, total 139/139 files & 1,345/1,345 tests passing).
- TypeScript Typecheck: `npx tsc --noEmit` exits with 0 errors.
- UI Controls: Integrated in Card 3 of `src/renderer/features/timeline-media/ui/SketchPane.tsx`.

