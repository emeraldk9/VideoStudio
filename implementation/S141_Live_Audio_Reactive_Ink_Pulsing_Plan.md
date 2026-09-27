# Milestone S141: Whiteboard Live Audio-Visual Reactive Ink Pulsing

> **Status**: COMPLETED & VERIFIED (Python Test 62 passing; 18 Vitest tests in audio-reactive-ink-ops.test.ts passing; full Vitest 125/125 suite passing; TypeScript check 0 errors; SketchPane UI integrated)

## 1. Context & Motivation
In dynamic whiteboard presentations and animated voiceover storytelling, speech is the primary driving force behind visual cadence. When a presenter emphasizes a crucial point, the vocal acoustic energy (RMS loudness, vocal transients/plosives, and fundamental pitch F0) naturally resonates with the illustration.

Milestone S141 introduces an audio-reactive modulation pipeline that couples narration audio to stroke geometry in real time:
1. **Ballistic Envelope Follower**:
   - Fast attack ($\tau_{\text{att}} \approx 10\text{ ms}$) and smooth release ($\tau_{\text{rel}} \approx 80\text{ ms}$) tracks speech envelope without visual flickering.
2. **Dynamic Stroke Width Pulsing**:
   - Ink expands smoothly with vocal emphasis: $w_{\text{eff}}(t) = w_0 \cdot \left(1 + \beta_{\text{audio}} \cdot E(t)^{\gamma}\right)$.
3. **Pitch F0 Harmonic Edge Ripples**:
   - Vocal inflection and frequency modulate the edge contours of the stroke ribbon with harmonic micro-undulations.
4. **Vocal Plosive Transient Shockwave Halos**:
   - Sudden acoustic energy bursts ($dE/dt > \theta$) emit subtle shockwave pigment rings radiating outward from the pen tip.
5. **Sync Latency Compensation**:
   - User-configurable offset $\Delta t_{\text{sync}}$ adjusts visual lead/lag relative to audio waveforms.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/audio_reactive_ink_engine.py`)
1. Data Structures:
   - `AudioReactiveInkConfig`: configuration dataclass with gain, gamma, attack/release times, pitch amplitude, transient threshold, burst radius, and sync offset.
   - `AudioReactivePoint`: modulated stroke point containing $(x, y, t)$, dynamic effective width, pitch ripple offset, and optional transient shockwave data.
2. Core Algorithms:
   - `follow_audio_envelope(samples: np.ndarray, sample_rate: int, attack_ms: float, release_ms: float) -> np.ndarray`
   - `detect_transient_onsets(envelope: np.ndarray, sample_rate: int, threshold: float, min_interval_ms: float = 60.0) -> List[float]`
   - `compute_pitch_ripple(s: float, pitch_hz: float, ref_hz: float, amp: float, phase: float = 0.0) -> float`
   - `modulate_stroke_with_audio(points: List[Tuple[float, float, float]], audio_samples: np.ndarray, sample_rate: int, config: AudioReactiveInkConfig, pitch_track: Optional[np.ndarray] = None) -> List[dict]`
3. Python Unit Test 62 in `scripts/test_engine.py`:
   - Validates envelope follower attack/release response dynamics.
   - Validates stroke width expansion under vocal peaks.
   - Validates transient onset detection and shockwave halo generation.
   - Validates pitch ripple periodicity and continuity.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/audio-reactive-ink-ops.ts`:
   - Parity implementation of envelope tracking, transient detection, width expansion, pitch ripples, and shockwave bursts.
   - Pure, deterministic functions tested with Vitest.
2. Unit Tests: `src/shared/utils/timeline/__tests__/audio-reactive-ink-ops.test.ts`:
   - At least 8 comprehensive test cases covering envelope follower ballistics, width modulation, transient detection, shockwave rings, and edge cases.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/types/timeline.ts` and Zod schema in `src/shared/types/clipEffectsSchema.ts`.
   - Export ops from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Add dedicated Audio-Reactive Ink panel in Card 3 of `SketchPane.tsx`:
  - Toggle switch: "Live Audio-Reactive Ink Pulsing".
  - Sliders:
    - Energy Gain ($\beta_{\text{audio}}$) [0.0 - 3.0]
    - Energy Gamma ($\gamma$) [0.5 - 2.5]
    - Attack Time ($\tau_{\text{att}}$) [1 - 50 ms]
    - Release Time ($\tau_{\text{rel}}$) [10 - 300 ms]
    - Pitch Ripple Amp ($A_{\text{pitch}}$) [0.0 - 8.0 px]
    - Transient Shockwave Radius ($R_{\text{burst}}$) [0 - 20 px]
    - Sync Latency Offset ($\Delta t$) [-100 ms to +100 ms]

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 62 added to `scripts/test_engine.py` and passes cleanly (**62/62 tests passing**).
2. VideoStudio:
   - `audio-reactive-ink-ops.test.ts` passes 100%.
   - Full Vitest suite passes (**125/125 files, 1,190+ tests**).
   - `tsc --noEmit` exits with 0 errors.
