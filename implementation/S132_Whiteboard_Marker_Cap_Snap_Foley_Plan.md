# Milestone S132: Whiteboard Marker Cap Snap & Pressure Vacuum Click Foley Acoustics with Magnetic Dock Snapping

## 1. Context & Motivation
In physical and high-fidelity digital whiteboard presentations, the auditory and kinetic feedback of opening, closing, and docking markers provides essential tactility and realism:
1. **Pneumatic Suction Uncap Pop**:
   - Pulling off a marker cap releases an airtight rubberized seal, generating a brief suction vacuum cavitation pop ($400 - 900$ Hz, $15 - 25$ ms exponential decay).
2. **Spring-Loaded Mechanical Recap Snap**:
   - Pushing the cap back on forces the internal lip over the barrel detent, creating a dual-transient impact snap ($2400 - 3600$ Hz) followed by hollow plastic barrel body resonance ($800 - 1200$ Hz).
3. **Magnetic Dock Latching Dynamics**:
   - For magnetic whiteboard markers, approaching the steel frame within a capture distance $d_{\text{snap}}$ engages an inverse-square magnetic acceleration pull $F_{\text{mag}} \propto 1 / (d + d_0)^2$, snapping the marker cleanly into the dock tray with a crisp metallic latch click.
4. **Zero-Asset Procedural Audio Synthesis**:
   - Fully procedural 16-bit PCM waveform generation without external audio dependencies, identical across Python core engine and TypeScript/React audio graph.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/cap_snap_foley_engine.py`)
1. Data Structures:
   - `CapSnapEvent`: `'uncap_pop'` | `'recap_snap'` | `'magnetic_dock'`
   - `CapSnapFoleyConfig`:
     - `enabled: bool = True`
     - `sample_rate: int = 44100`
     - `volume: float = 0.75`
     - `snap_sharpness: float = 0.80` # Detent friction stiffness
     - `suction_depth: float = 0.65`    # Vacuum pop frequency depth
     - `magnetic_latch_gain: float = 0.70`
     - `magnetic_snap_distance_px: float = 35.0`
2. Core Algorithms:
   - `synthesize_cap_pop(sample_rate, volume, suction_depth) -> np.ndarray`:
     - Generates vacuum release suction burst: exponential frequency down-chirp (650 Hz -> 250 Hz) with rapid decay.
   - `synthesize_cap_snap(sample_rate, volume, sharpness) -> np.ndarray`:
     - Generates dual-transient mechanical plastic click (initial 2800 Hz transient + secondary 950 Hz barrel body resonance).
   - `synthesize_magnetic_dock_latch(sample_rate, volume) -> np.ndarray`:
     - Generates metallic-plastic strike impulse with high damping (1800 Hz + 3200 Hz).
   - `compute_magnetic_snap_kinematics(current_pos, dock_pos, capture_radius_px) -> Tuple[Point2D, bool]`:
     - Inverse-square non-linear pull toward dock slot.
3. Standalone Unit Test:
   - **Test 53** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/cap-snap-foley-ops.ts`:
   - Interfaces: `CapSnapFoleySettings`, `CapAcousticTransient`.
   - Pure functions:
     - `synthesizeCapPopSamples(sampleRate?: number, volume?: number, suctionDepth?: number): Float32Array`
     - `synthesizeCapSnapSamples(sampleRate?: number, volume?: number, sharpness?: number): Float32Array`
     - `synthesizeMagneticDockSamples(sampleRate?: number, volume?: number): Float32Array`
     - `calculateMagneticSnapVector(distPx: number, snapRadiusPx: number): number`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/cap-snap-foley-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.capSnapFoley` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.capSnapFoley` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Marker Cap Snap & Magnetic Dock Foley" section:
    - Enabled toggle.
    - Foley Volume slider ($0 - 100\%$).
    - Cap Snap Detent Sharpness slider ($10 - 100\%$).
    - Vacuum Suction Pop Depth slider ($10 - 100\%$).
    - Magnetic Capture Radius slider ($15 - 80$ px).
    - Preview Playback test buttons for Uncap Pop, Recap Snap, and Magnetic Dock.

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Standalone Test 53 passes in `scripts/test_engine.py` (**53/53 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with **116/116 test files** and **1,111/1,111 tests green**.
   - 7 unit tests in `src/shared/utils/timeline/__tests__/cap-snap-foley-ops.test.ts` passing.
3. UI Integration:
   - Full reactive controls integrated in `SketchPane.tsx` Card 3.
4. Documentation:
   - Artifact `walkthrough.md` updated with Milestone S132 details.

---

## 4. Status: COMPLETED (Verified 100%)
- Python engine: `scripts/core/cap_snap_foley_engine.py` (verified in Test 53)
- VideoStudio ops: `src/shared/utils/timeline/cap-snap-foley-ops.ts`
- Tests: `src/shared/utils/timeline/__tests__/cap-snap-foley-ops.test.ts` (7/7 passing)
- Schema: `WhiteboardSettings.capSnapFoley` and `clipEffectsSchema.whiteboard.capSnapFoley`
- UI: `SketchPane.tsx` Card 3 Cap Snap & Vacuum Foley Acoustics controls
- Full suite: 53/53 Python tests & 1,111/1,111 Vitest tests green!
