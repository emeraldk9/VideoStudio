# Step S36: Dynamic Range Audio Compressor & Peak Limiter Engine

## Overview & Background
In professional audio production and broadcasting (such as DaVinci Resolve Fairlight Dynamics, Adobe Premiere Pro Dynamics, and Final Cut Pro Compressor), dynamic range control is indispensable for taming erratic volume spikes, improving vocal presence and clarity, adding punch to music/drums, and ensuring broadcast-compliant master output without digital clipping.

Step S36 implements an end-to-end Dynamic Range Audio Compressor and Peak Limiter pipeline:
1. **Mathematical Dynamics Transfer Curves**:
   - Evaluates input levels ($x$ in dB, -60 to 0 dB) and maps them to compressed output levels ($y$ in dB):
     - Linear passthrough below threshold: $y = x$
     - Smooth quadratic soft-knee interpolation: $|x - T| \le \frac{K}{2}$
       $$y = x + \left(\frac{1}{R} - 1\right) \cdot \frac{(x - T + K/2)^2}{2K}$$
     - Compressed slope above knee: $y = T + \frac{x - T}{R}$
     - Post-compression makeup gain compensation ($0$ to $+24\text{ dB}$).
2. **Interactive SVG Transfer Characteristic Curve HUD**:
   - Visualizes input dB (-60 to 0 dB) vs. output dB (-60 to 0 dB).
   - Renders 1:1 linear reference diagonal, dynamic threshold knee curvature, compression ratio angle, and threshold marker.
3. **Web Audio API Real-Time DSP Chain (`TimelinePreview.tsx`)**:
   - Integrated native `DynamicsCompressorNode` and `GainNode` (makeup gain) into the persistent media element DSP graph:
     $$\text{MediaElementSource} \to \text{LowShelf} \to \text{Peaking} \to \text{HighShelf} \to \text{Compressor} \to \text{MakeupGain} \to \text{Destination}$$
   - Cached via `WeakMap<HTMLMediaElement, MediaDspNodes>` to prevent Chromium `InvalidStateError` re-attachment exceptions.
   - Adjusts threshold, knee, ratio, attack, release, and makeup gain dynamically in real time during timeline playback.
4. **Studio Dynamics Presets Library**:
   - `bypass_flat`: 1:1 linear reference passthrough.
   - `broadcast_voice`: Threshold -18 dB, Ratio 3:1, Knee 6 dB, Attack 10ms, Release 120ms, Makeup +4 dB (Podcasts & voiceover).
   - `gentle_master_glue`: Threshold -12 dB, Ratio 1.5:1, Knee 10 dB, Attack 30ms, Release 250ms, Makeup +1.5 dB (Transparent mix bus glue).
   - `punchy_drums_bass`: Threshold -20 dB, Ratio 4:1, Knee 4 dB, Attack 25ms, Release 80ms, Makeup +5 dB (Punchy transients).
   - `acoustic_leveler`: Threshold -16 dB, Ratio 2.5:1, Knee 8 dB, Attack 20ms, Release 200ms, Makeup +3 dB (Acoustic instruments).
   - `brickwall_peak_limiter`: Threshold -2 dB, Ratio 20:1, Knee 0 dB, Attack 1ms, Release 50ms, Makeup 0 dB (Peak clipping guard).
5. **Channel Strip & Clip Inspector Integration**:
   - **Audio Mixer Dock (`AudioMixerDock.tsx`)**: Added `DYN` button to each track strip with active color highlights, plus an expandable 6-parameter Dynamics Rack with transfer curve visualizer, studio presets, and precision sliders (Threshold, Ratio, Knee, Attack, Release, Makeup Gain).
   - **Clip Inspector (`ClipInspector.tsx`)**: Added Dynamics (Compressor & Limiter) section in the Audio tab featuring master bypass switch, presets, mini transfer curve, and sliders for clip-level audio processing.
6. **FFmpeg Export Filter Alignment**:
   - `buildFfmpegCompressorFilter`: Generates frame-accurate FFmpeg `acompressor` filter chains for timeline video exports.

---

## Architectural Changes

### 1. Arithmetic & Geometry Operations (`src/shared/utils/timeline/audio-compressor-ops.ts`)
- `AudioCompressorSettings`: `{ enabled, threshold, ratio, knee, attack, release, makeupGain }`.
- `calculateCompressorOutputDb`: Computes standard quadratic soft-knee dynamics curve.
- `calculateGainReductionDb`: Computes instantaneous attenuation in decibels.
- `sampleCompressorCurvePoints`: Generates coordinate vertices for the SVG transfer curve graph.
- `buildFfmpegCompressorFilter`: Serializes settings into FFmpeg `acompressor=...` filter string.

### 2. Effects & Store Integration
- `src/shared/utils/timeline/effects.ts`:
  - Added optional `compressor?: AudioCompressorSettings` to `ClipEffects`.
  - Added `compressor` validation to `clipEffectsSchema` in Zod.
- `src/renderer/features/timeline-edit/model/audioMixerStore.ts`:
  - Added `trackCompressor: Record<string, AudioCompressorSettings>`.
  - Added `setTrackCompressor(trackId, patch)` and `resetTrackCompressor(trackId)`.
  - Added `activeDynTrackId: string | null` and `setActiveDynTrackId(trackId)`.

### 3. Web Audio Real-Time DSP Engine (`src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`)
- Expanded DSP node cache to `DynamicsCompressorNode` and `GainNode`.
- Chained `MediaElementAudioSourceNode -> BiquadFilterNode(lowshelf) -> BiquadFilterNode(peaking) -> BiquadFilterNode(highshelf) -> DynamicsCompressorNode -> GainNode -> AudioContext.destination`.
- Unified `applyMediaAudioDsp(element, eq, comp)` updates both EQ and dynamics parameters concurrently on continuous playback.

### 4. Mixer Dock & Clip Inspector UI
- Channel strips upgraded from 3-column button grid to 4-column (`M`, `S`, `EQ`, `DYN`).
- Interactive collapsible Dynamics Rack panel with SVG transfer curve, preset selector, and parameter sliders.
- Clip Inspector Audio tab dynamics section with bypass toggle and controls.

---

## Verification & Test Results
- **Automated Tests**:
  - `src/shared/utils/timeline/__tests__/audio-compressor-ops.test.ts`: **12/12 unit tests passed**.
  - Overall Vitest suite: **30/30 test files passed, 321/321 unit tests passed (100% pass rate)**.
- **Static Analysis**:
  - `npm run typecheck` (`tsc --noEmit`): **0 errors**.
- **Production Bundles**:
  - `npx vite build --config vite.renderer.config.ts`: **Built cleanly in 9.04s**.
  - `npx vite build --config vite.main.config.ts`: **Built cleanly in 8.63s**.
