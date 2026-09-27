# Milestone S125: Whiteboard Stylus Pressure-To-Audio Pitch Modulation, Squeak Resonance & Haptic Feedback

## 1. Context & Motivation
Real-world physical drawing and writing exhibits rich acoustic and tactile feedback driven by stylus pressure and velocity:
1. **Dynamic Pitch & Formant Modulation**:
   - As stylus tip pressure increases, acoustic drag shifts the base friction noise spectrum (typically a slight pitch depression or formant widening).
2. **Nib Creak & Slate Squeak Resonance**:
   - Dry-erase markers on slick melamine or glass produce distinctive high-frequency squeaks (stick-slip friction resonance, 1,200 Hz - 3,500 Hz) when velocity and downward pressure exceed threshold limits.
   - Chalk on slate blackboard produces micro-chatter squeal under steep angle and high pressure.
3. **Multi-Stage Haptic Audio Pulses**:
   - Sub-bass micro-thump (60 - 100 Hz) upon stylus contact / touchdown (`is_touching` transitions from False to True).
   - Continuous velocity & pressure proportional tactile rumble during active drawing.
   - Micro-click snap upon stylus lift-off.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/pressure_audio_resonance_engine.py`)
1. Data structures:
   - `PressureAudioConfig`:
     - `enabled: bool = True`
     - `base_freq_hz: float = 800.0`
     - `pitch_sensitivity: float = 0.35`
     - `squeak_threshold_pressure: float = 0.65`
     - `squeak_threshold_velocity: float = 250.0` # px/s
     - `squeak_base_freq_hz: float = 2400.0`
     - `haptic_thump_volume: float = 0.60`
     - `haptic_rumble_gain: float = 0.40`
2. Core algorithms:
   - `compute_pressure_modulated_pitch(base_freq, pressure, sensitivity)`:
     - Applies pressure curve: $f = base\_freq \cdot (1.0 - (pressure - 0.5) \cdot sensitivity)$.
   - `evaluate_squeak_resonance(pressure, velocity, config)`:
     - Returns `{is_squeaking, resonance_freq, intensity}` when both pressure and velocity exceed thresholds.
   - `generate_haptic_envelope(event_type, sample_rate, duration_sec)`:
     - Generates damp sinusoidal micro-thump or liftoff transient envelope.
3. Standalone **Test 46** in `scripts/test_engine.py`:
   - Validates pitch modulation bounds, squeak triggering and frequency scaling, and haptic envelope decay.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/pressure-audio-resonance-ops.ts`:
   - Interfaces: `PressureAudioSettings`, `SqueakResonanceResult`.
   - Pure functions:
     - `computePressurePitchModulation(baseFreq: number, pressure: number, sensitivity: number): number`
     - `detectSqueakResonance(pressure: number, velocity: number, settings: PressureAudioSettings): SqueakResonanceResult`
     - `computeHapticImpulseGain(event: 'touchdown' | 'drag' | 'liftoff', pressure: number, velocity: number): number`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/pressure-audio-resonance-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.pressureAudio` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.pressureAudio` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Stylus Pressure & Squeak Audio Resonance" section:
    - Enabled toggle.
    - Pressure Pitch Sensitivity slider.
    - Stick-Slip Squeak Threshold slider.
    - High-Frequency Squeak Volume slider.
    - Haptic Touchdown Thump Volume slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 46/46 passing).
- Run `npx tsc --noEmit` (clean exit 0).
- Run `npx vitest run` (ensure 109/109 test files passing, 1,079+ tests).

---

## 3. Verification & Results (100% COMPLETE)
- **Python Engine (`scripts/core/pressure_audio_resonance_engine.py`)**:
  - Validated pressure pitch modulation curves and boundaries.
  - Validated stick-slip squeak friction resonance triggering based on velocity and downward pressure.
  - Validated haptic impulse waveforms for touchdown thump, liftoff click, and drag rumble.
  - Standalone Test 46 passing in `scripts/test_engine.py` (**46/46 Python tests passing**).
- **VideoStudio Timeline & UI Operations (`src/shared/utils/timeline/pressure-audio-resonance-ops.ts`)**:
  - `computePressurePitchModulation`, `detectSqueakResonance`, `computeHapticImpulseGain` implemented and tested.
  - Test suite `pressure-audio-resonance-ops.test.ts` passing (**4/4 tests passing**).
- **TypeScript & Vitest Validation**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npx vitest run` passed (**109/109 test files, 1,079/1,079 tests passing**).

