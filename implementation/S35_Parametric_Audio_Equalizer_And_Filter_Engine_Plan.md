# Step S35: 3-Band Parametric Audio Equalizer (EQ) & Audio Filter Engine

## Overview & Background
In professional video and audio editing workflows (such as DaVinci Resolve Fairlight, Premiere Pro Parametric EQ, and Final Cut Pro), audio frequency sculpting is essential for vocal intelligibility, bass management, de-mudding muddy mid-tones, and crafting stylized filters (e.g. vintage radio, telephone).

Step S35 implements an end-to-end Parametric Audio Equalizer and filter pipeline supporting:
1. **Mathematical frequency response curves** across standard human hearing frequencies (20 Hz - 20,000 Hz) using 2nd-order analog biquad transfer functions (Low Shelf, Peaking EQ, High Shelf).
2. **Logarithmic SVG visual frequency response curve** HUD with a dynamic gradient fill, zero-line reference, frequency axis ticks (60Hz, 250Hz, 1kHz, 4kHz, 16kHz), and real-time interactive decibel gain updates.
3. **Web Audio API live DSP processing** inside `TimelinePreview`:
   - Instantiates dynamic `BiquadFilterNode` chains (`lowshelf`, `peaking`, `highshelf`) per HTML media element.
   - Caches node chains using a `WeakMap<HTMLMediaElement, MediaEqNodes>` to safely avoid Chromium `createMediaElementSource` single-attachment exceptions.
   - Updates filter parameters in real-time on playback without stutter or audio dropout.
4. **Studio presets library**:
   - `flat` (Reference bypass)
   - `vocal_clarity` (Low cut, 2.5kHz presence boost, air sheen)
   - `podcast_warmth` (Subtle 120Hz proximity boost, harshness tame)
   - `bass_boost` (Thumping 80Hz low shelf boost)
   - `de_mud` (350Hz narrow Q scoop to clean boxy room acoustics)
   - `bright_air` (Smooth 10kHz high shelf sheen)
   - `phone_radio` (Bandpass-style drastic low & high cut with resonant mid peak)
5. **Clip Inspector and Mixer Dock UI**:
   - Audio Mixer Dock channel strips now include an interactive `EQ` toggle button that unfolds a dedicated Equalizer rack with SVG curve graph, band sliders, and preset selector.
   - Clip Inspector contains a clip-level Equalizer section with bypass toggle, preset picker, mini frequency response visualizer, and decibel sliders (-18 dB to +18 dB).
6. **FFmpeg export filter generator** (`buildFfmpegEqFilter`):
   - Translates parametric bands into FFmpeg `equalizer`, `bass`, and `treble` audio filter chains for seamless offline timeline rendering.

---

## Architectural Changes

### 1. Pure Arithmetic & Geometry Engine (`src/shared/utils/timeline/audio-eq-ops.ts`)
- **Data Models**:
  - `AudioEqualizerBand`: `enabled: boolean`, `type: 'lowshelf' | 'peaking' | 'highshelf'`, `frequency: number`, `gain: number` (-24 dB to +24 dB), `q: number` (0.1 to 10).
  - `AudioEqualizerSettings`: `enabled: boolean`, `low: AudioEqualizerBand`, `mid: AudioEqualizerBand`, `high: AudioEqualizerBand`.
- **Frequency Response Calculation**:
  - `calculateEqGainAtFrequency(settings, freqHz)` computes complex frequency response $H(s)$ in decibels across biquad filter topologies:
    - Low shelf ($s$-plane transfer function with cutoff transition at $f_c$).
    - Peaking bell filter with bandwidth determined by $Q$:
      $$Gain(f) = gain \cdot \frac{1}{1 + Q^2 \cdot (f/f_c - f_c/f)^2}$$
    - High shelf ($s$-plane transfer function with shelf transition at $f_c$).
- **Logarithmic SVG Generator**:
  - `sampleEqCurvePoints(settings, width, height, samples = 100)` translates 20 Hz – 20 kHz log10 space into SVG pixel coordinates $(x, y)$ mapped between $-18\text{ dB}$ and $+18\text{ dB}$.
- **FFmpeg Filter Generation**:
  - `buildFfmpegEqFilter(settings)` builds audio filter chains with `bass=f=...:g=...`, `equalizer=f=...:width_type=q:w=...:g=...`, and `treble=f=...:g=...`.

### 2. Audio Mixer State Store (`src/renderer/features/timeline-edit/model/audioMixerStore.ts`)
- Added per-track EQ map: `trackEq: Record<string, AudioEqualizerSettings>`.
- Added actions: `setTrackEq(trackId, settings)` and `resetTrackEq(trackId)`.
- Added active EQ inspection focus: `activeEqTrackId` and `setActiveEqTrackId(trackId)`.

### 3. Clip Effects Schema (`src/shared/utils/timeline/effects.ts`)
- Expanded `ClipEffects` interface with optional `equalizer?: AudioEqualizerSettings`.
- Updated `clipEffectsSchema` in Zod to validate `equalizer` band parameters and ensure full type safety.

### 4. Real-time Web Audio DSP Engine (`src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`)
- Maintains a shared `AudioContext` and a `WeakMap<HTMLMediaElement, MediaEqNodes>`.
- `applyMediaEq(element, settings)` seamlessly provisions or adjusts:
  - Low shelf filter (`node.lowShelf.gain.value = settings.low.gain`)
  - Peaking filter (`node.peaking.frequency.value = settings.mid.frequency`, `node.peaking.gain.value = settings.mid.gain`, `node.peaking.Q.value = settings.mid.q`)
  - High shelf filter (`node.highShelf.gain.value = settings.high.gain`)
- Filters are piped `source -> lowShelf -> peaking -> highShelf -> ctx.destination`.

### 5. Equalizer UI Components
- **Audio Mixer Dock (`src/renderer/features/timeline-edit/ui/AudioMixerDock.tsx`)**:
  - EQ toggle buttons on each track channel strip.
  - Collapsible parametric EQ rack panel showing:
    - Live SVG frequency response curve with subtle fill and gridlines.
    - Studio preset selector dropdown.
    - Low shelf (80 Hz), Mid peak (1 kHz), High shelf (10 kHz) sliders and decibel readouts.
- **Clip Inspector (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)**:
  - Equalizer card in Audio inspector tab.
  - Master bypass switch, preset selector, and band sliders for clip-level audio processing.

---

## Verification & Test Results
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/audio-eq-ops.test.ts`: 15/15 tests passing.
  - Overall test suite: 29/29 test suites passing (309/309 total tests).
- **TypeScript**:
  - `npm run typecheck` (`tsc --noEmit`): 0 errors.
- **Production Bundle Builds**:
  - Renderer bundle (`vite.renderer.config.ts`): Built cleanly in ~9s.
  - Main process bundle (`vite.main.config.ts`): Built cleanly in ~8s.
