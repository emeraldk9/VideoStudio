# Milestone S66: End-to-End FFmpeg Render Engine Full-Filter Synthesis

## Executive Overview
Over milestones S30 through S65, VideoStudio added advanced real-time preview editing capabilities, including:
- Primary Color Balance & 3-Way Wheels (S30)
- 3-Band Parametric Audio Equalizer (S35)
- Dynamic Range Audio Compressor & Peak Limiter (S36)
- Variable Speed Ramping & Bézier Velocity Curves (S37)
- Chroma Key & Color Spill Suppression (S38)
- Video Masking & Shape Cropping (S39)
- Audio Reverb & Stereo Delay (S41)
- 3D LUT (Look-Up Table) Color Grading (S42)
- Picture-in-Picture & Grid Split (S43)
- Audio Noise Gate, De-Esser & De-Hummer (S45)
- Cinematic Lens Distortion & Chromatic Aberration (S46)
- Film Grain, Halation & Gate Weave (S48)
- Audio Pitch Shifter & Formant Correction (S49)
- Stereo Audio Panner & 3D Spatial Audio (S50)
- AI Portrait Matting & Background Cutout (S51)
- Optical Flow Motion Estimation (S52)
- AI Vocal Isolation & Dialogue Enhancement (S53)
- Video Stabilization & Deshake (S54)
- HDR Tone Mapping & ACES Color Science (S55)
- Multiband Audio Denoiser & De-Clicker (S56)
- Temporal Video Noise Reduction (S57)
- Multi-Camera Angle Switching (S59 & S65)
- Cinematic Motion Blur & Rotary Shutter (S60)
- Adjustment Layers & Timeline Containers (S62)
- Audio Submix Buses & Routing (S63)
- Compound Clips (S64)

In **Milestone S66**, we connect all these features into the export pipeline (`sequence-render-service.ts`, `sequence-normalize.ts`, `audio-timeline.ts`, and `effects.ts`). Exported MP4/ProRes/WebM deliverables will achieve 100% fidelity matching live preview playback.

---

## Architectural Changes

### 1. Video Filter Pipeline Synthesis (`src/shared/utils/timeline/effects.ts`)
- In `buildColorFilterChain(effects, dimensions)`:
  - Synthesize native FFmpeg filters in deterministic order:
    1. Base Color Adjustments (`eq`, `hue`, `unsharp`, `vignette`)
    2. Color Balance & 3-Way Wheels (`colorbalance`)
    3. 3D LUTs (`lut3d`)
    4. HDR Tone Mapping (`tonemap`, `pseudocolor`)
    5. Lens Optics & Distortion Correction (`lenscorrection`, `chromashift`, `vignette`)
    6. Video Stabilization (`deshake`, auto-crop)
    7. Portrait Matting / Keying (`gblur`, `erosion`, `dilation`, `despill`)
    8. Chroma Keying (`chromakey`, `despill`)
    9. Shape Masking (`crop`, `drawbox`)
    10. Film Emulation (`noise`, `eq`)
    11. Temporal Video Denoiser (`hqdn3d`, `atadenoise`, `unsharp`)
    12. Motion Blur (`tblend`, `tmix`)

### 2. Audio Filter Pipeline Synthesis (`src/shared/utils/timeline/effects.ts`)
- In `buildAudioFilterChain(effects)`:
  - Studio post-production signal chain order:
    1. Audio Isolation & Dialogue Enhancement (`afftdn`, `bandpass`, `speechnorm`)
    2. Multiband Spectral Denoiser & Mains De-Hummer (`adeclick`, notch `equalizer`, `afftdn`)
    3. Noise Gate, De-Esser & De-Hummer (`equalizer` notch, `agate`, `speechnorm`)
    4. 3-Band Parametric Equalizer (`equalizer`)
    5. Dynamic Range Compressor & Limiter (`acompressor`)
    6. Pitch Shifter & Formants (`rubberband`)
    7. Reverb & Stereo Delay (`aecho`)
    8. Stereo Panner & Spatial Audio (`pan`)

### 3. Audio Timeline Delivery (`src/main/media/audio-timeline.ts` & `audio-layout.ts`)
- Add `audioFilter?: string` to `DubSegmentInput`.
- Inject `segment.audioFilter` into each segment's audio chain before fades and delay in `buildAudioTimelineGraph`.

### 4. Render Service Integration (`src/main/media/sequence-render-service.ts`)
- In `toSegments`:
  - MultiCam angle resolution: when a clip is a MultiCam clip with an active angle carrying its own `filePath`, use the angle's file path and add `syncOffsetFrames` to `sourceInFrames`.
  - Pass `audioFilter: buildAudioFilterChain(item.clip.effects)`.
- In `normalizeSegmentArgs`:
  - MultiCam angle resolution for video: switch source file and add `syncOffsetFrames` to `sourceInFrames`.
  - Pass sequence dimensions to `buildColorFilterChain`.

---

## Verification Criteria
1. `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
2. `npm test` passes 100% of all vitest suites including new `render-filter-synthesis.test.ts`.
3. Clips with no active effects produce empty filter strings (zero export overhead).
4. Audio and video filter graphs conform to strict FFmpeg syntax and parameter clamping.
