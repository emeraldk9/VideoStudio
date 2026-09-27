# Milestone S142: Hand Palm Occlusion & Natural Smudging Physics

> **Status**: COMPLETED & VERIFIED (Python Test 63 passing; 12 Vitest tests in palm-smudge-occlusion-ops.test.ts passing; full Vitest 126/126 suite passing; TypeScript check 0 errors; SketchPane UI integrated)

## 1. Context & Motivation
When artists and lecturers sketch on physical whiteboards or paper, the heel of the drawing hand (hypothenar eminence) periodically rests against the board surface. As the hand moves across newly laid ink strokes that have not completely dried, the skin picks up wet pigment and drags it across the substrate, producing characteristic directional smudges.

Milestone S142 models these natural hand biomechanics:
1. **Palm Heel Kinematics & Touchdown**:
   - The palm heel position $\vec{P}_{\text{palm}}$ is derived from pen tip position $\vec{P}_{\text{tip}}$, wrist elevation $Z_{\text{hand}}$, and pen travel angle $\theta_{\text{wrist}}$.
   - Contact occurs when $Z_{\text{hand}} \le Z_{\text{contact}}$ (typically $\le 8\text{ mm}$).
2. **Wet Stroke Intersection & Ink Pickup**:
   - Checks spatial overlap between the elliptical palm contact footprint and strokes drawn within the wet window ($t_{\text{now}} - t_{\text{stroke}} < \tau_{\text{dry}}$).
   - Pigment transfers onto palm skin proportional to contact pressure and remaining ink wetness.
3. **Directional Smear Trails & Exponential Depletion**:
   - Deposited pigment is smeared along the palm drag velocity vector $\vec{v}_{\text{palm}}$:
     $$S(d) = S_0 \cdot \exp\left(-\frac{d}{\lambda_{\text{decay}}}\right)$$
4. **Palm Heel Occlusion Shadow**:
   - Casts a soft ambient contact shadow directly underneath the resting palm heel.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/palm_smudge_occlusion_engine.py`)
1. Data Structures:
   - `PalmSmudgeConfig`: elevation threshold, palm footprint radius, wrist offsets, smudge intensity, decay length, wet threshold, shadow opacity.
   - `PalmFootprint`: center $(x, y)$, semi-major/minor axes, contact pressure, is_touching.
   - `SmudgeTrail`: origin, direction, length, intensity, color.
2. Core Algorithms:
   - `calculate_palm_contact(tip_pos, wrist_angle_deg, elevation_mm, config) -> PalmFootprint`
   - `extract_wet_stroke_intersections(palm, strokes, current_time, config) -> List[dict]`
   - `generate_directional_smears(intersections, velocity, config) -> List[SmudgeTrail]`
   - `render_palm_smudge_layer(canvas, trails, palm, config) -> np.ndarray`
3. Python Unit Test 63 in `scripts/test_engine.py`:
   - Validates palm elevation touchdown / liftoff thresholding.
   - Validates wet window stroke intersection detection.
   - Validates exponential smudge drag decay.
   - Validates canvas compositing and occlusion shadow.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/palm-smudge-occlusion-ops.ts`:
   - Parity implementations of palm kinematics, wet intersection detection, smudge trail generation, and config validation.
2. Unit Tests: `src/shared/utils/timeline/__tests__/palm-smudge-occlusion-ops.test.ts`:
   - At least 8 comprehensive test cases covering palm touchdown, wet stroke picking, trail decay, and edge cases.
3. Schema & Exports:
   - Add `palmSmudge` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard` in `effects.ts`.
   - Export from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Add dedicated Palm Occlusion & Smudging panel in Card 3 of `SketchPane.tsx`:
  - Toggle switch: "Hand Palm Occlusion & Smudging".
  - Sliders:
    - Smudge Pick-up Intensity [0.05 - 1.0]
    - Smudge Trail Decay Length [10 - 150 px]
    - Palm Contact Radius [15 - 80 px]
    - Hand Elevation Touchdown [2 - 20 mm]
    - Palm Contact Shadow Opacity [0.0 - 0.8]

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 63 added to `scripts/test_engine.py` and passes cleanly (**63/63 tests passing**).
2. VideoStudio:
   - `palm-smudge-occlusion-ops.test.ts` passes 100%.
   - Full Vitest suite passes (**126/126 files, 1,209+ tests**).
   - `tsc --noEmit` exits with 0 errors.
