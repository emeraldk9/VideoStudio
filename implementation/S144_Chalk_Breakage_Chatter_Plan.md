# Milestone S144: Whiteboard Chalk Breakage & Variable Angle Edge Chatters

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
On natural chalkboards and slate substrates, chalk sticks exhibit non-linear physical stick-slip contact mechanics distinct from porous wet felt pens:
1. **Stick-Slip Edge Chatters (Staccato Skips)**:
   - When dragged at steep grazing angles ($\theta_{\text{slant}} \in [20^\circ, 65^\circ]$), friction against board tooth triggers high-frequency stick-slip resonance ($80 - 240\text{ Hz}$).
   - This creates rhythmic dashed skips and micro-voids along the stroke length:
     $$C(s) = \max\left(0, \sin\left(\frac{2\pi s}{\lambda_{\text{chatter}}} + \phi\right) - \tau_{\text{skip}}\right)$$
2. **Chalk Stick Shear Breakage & Wedge Faceting**:
   - When downforce pressure exceeds the critical structural shear limit ($P \ge P_{\text{break}} \approx 0.88$), the chalk stick snaps abruptly.
   - The snap event transitions the contact cross-section from a cylindrical tip to a broad wedge-facet, expanding line width by $1.8\times - 2.5\times$ and emitting a radial burst of fine chalk debris particles.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/chalk_breakage_chatter_engine.py`)
1. Data Structures:
   - `ChalkChatterConfig`: slant angle, chatter frequency, skip duty threshold, breakage pressure threshold, facet width multiplier, dust burst count.
   - `ChalkBreakEvent`: timestamp, position $(x, y)$, pre/post snap widths, debris shard particles.
   - `ChatteredSegment`: start point, end point, width, opacity, is_gap.
2. Core Algorithms:
   - `compute_chatter_wavelength(speed_px_per_sec, freq_hz, slant_deg) -> float`
   - `generate_debris_shards(pos, count, burst_radius) -> List[DebrisShard]`
   - `generate_chattered_stroke(points, pressures, timestamps, base_width, config) -> Tuple[List[ChatteredSegment], Optional[ChalkBreakEvent]]`
   - `render_chattered_chalk_stroke(canvas, segments, break_event, config) -> np.ndarray`
3. Python Unit Test 65 in `scripts/test_engine.py`:
   - Validates stick-slip chatter frequency and duty cycle skipping.
   - Validates shear downforce snap detection and facet width transition.
   - Validates chalk debris particle burst generation.
   - Validates raster canvas rendering on dark slate.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/chalk-breakage-chatter-ops.ts`:
   - Pure mathematical functions for chatter wavelength, duty skip evaluation, shear breakage detection, facet width expansion, and debris shard generation.
2. Unit Tests: `src/shared/utils/timeline/__tests__/chalk-breakage-chatter-ops.test.ts`:
   - 11 comprehensive unit tests covering stick-slip skips, breakage pressure thresholds, facet widening, debris bursts, and config validation.
3. Schema & Exports:
   - Added `chalkBreakage` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard` in `effects.ts`.
   - Exported from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Added dedicated Chalk Physics & Breakage panel in Card 3 of `SketchPane.tsx`:
  - Toggle switch: "Chalk Breakage & Edge Chatters".
  - Sliders:
    - Slant Grazing Angle [15° to 75°]
    - Chatter Skip Frequency [60 to 240 Hz]
    - Skip Duty Cycle [10% to 70%]
    - Breakage Pressure Threshold [0.60 to 0.98]
    - Broken Wedge Width Multiplier [1.5x to 3.5x]
    - Snap Debris Shard Count [0 to 30]

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 65 added to `scripts/test_engine.py` and passes cleanly (**65/65 tests passing**).
2. VideoStudio:
   - `chalk-breakage-chatter-ops.test.ts` passes 100% (11/11 tests).
   - Full Vitest suite passes (**128/128 files, 1,236/1,236 tests**).
   - `tsc --noEmit` exits with 0 errors.

