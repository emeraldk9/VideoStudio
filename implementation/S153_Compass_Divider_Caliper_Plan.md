# Milestone S153: Whiteboard Drafting Compass & Mechanical Divider Caliper Geometry

> **Status**: COMPLETED (100% Verified)

## 1. Context & Motivation
In geometric construction, architectural sketches, and technical drafting whiteboard animations, artists use a **Drafting Bow Compass & Mechanical Divider Caliper**:
1. **Compass Kinematics & Hinge Mechanics**:
   - Anchor needle leg pinned at center $P_0 = (x_0, y_0)$ and pencil/marker leg at $P_1 = (x_1, y_1)$ with radius $R = \|P_1 - P_0\|$.
   - Hinge aperture angle $\theta = 2 \arcsin(R / (2 L_{\text{arm}}))$.
   - Fine-adjustment center thumbscrew wheel with spindle thread pitch $p_{\text{screw}}$.
2. **Radial Arc & Circle Generation**:
   - Sweeping circular arcs $\vec{r}(\phi) = P_0 + R \begin{pmatrix} \cos \phi \\ \sin \phi \end{pmatrix}$ with continuous angular heading $\phi(t)$ and compass body yaw.
3. **Divider Walking & Chord Stepping**:
   - Stepping divider legs along polylines to divide segments into $N$ equal chords or transfer scale ratios $k_{\text{ratio}} = L_{\text{long}} / L_{\text{short}}$.
4. **Needle Divot & Downforce Torque**:
   - Rotational friction torque $\tau = \mu_{\text{needle}} \cdot F_z$ at the anchor point resisting swift yaw rotation.
5. **Compass Foley Acoustics Telemetry**:
   - Hard needle touchdown prick, knurled thumbscrew adjustment ratcheting clicks, and brass leg hinge creaks during radius resizing.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/compass_divider_caliper_engine.py`)
1. Data Structures:
   - `CompassConfig`:
     - `arm_length_px`: float (default `160.0`)
     - `needle_friction`: float (default `0.30`)
     - `thumbscrew_pitch_px`: float (default `2.0`)
     - `show_compass_overlay`: bool (default `True`)
     - `lead_hardness`: str (default `'2B'`)
     - `foley_ratchet_volume`: float (default `0.70`)
   - `CompassKinematics`:
     - `pivot_xy`: Tuple[float, float]
     - `pencil_xy`: Tuple[float, float]
     - `radius_px`: float
     - `aperture_angle_deg`: float
     - `body_rotation_deg`: float
     - `hinge_xy`: Tuple[float, float]
     - `needle_leg_elbow_xy`: Tuple[float, float]
     - `pencil_leg_elbow_xy`: Tuple[float, float]
2. Core Algorithms:
   - `solve_compass_kinematics(pivot_xy, pencil_xy, arm_length) -> CompassKinematics`
   - `step_divider_chords(curve_points, chord_length) -> List[Tuple[float, float]]`
   - `render_compass_overlay(canvas, kinematics, config) -> np.ndarray`
   - `compute_compass_foley_telemetry(delta_radius_px, sweep_angle_rad, config) -> Dict[str, float]`
3. Test 74 in `scripts/test_engine.py`:
   - Validates forward and inverse compass kinematics (aperture angle, hinge position, arm elbow joints).
   - Validates divider chord stepping along curves.
   - Validates thumbscrew ratchet clicks and rotational friction acoustics.
   - Validates brass drafting compass overlay rasterization.

### Phase 2: VideoStudio TypeScript Engine & Vitest Suites
1. Module: `src/shared/utils/timeline/compass-divider-caliper-ops.ts`:
   - Interfaces: `CompassConfig`, `CompassKinematics`, `CompassFoleyTelemetry`, `CompassSettings`.
   - Pure functions:
     - `validateCompassConfig(config)`
     - `solveCompassKinematics(pivot, pencil, armLength)`
     - `generateCompassArcPoints(pivot, radius, startAngleRad, endAngleRad, steps)`
     - `stepDividerChords(points, chordLength)`
     - `generateCompassSvgMarkup(kinematics, config)`
     - `computeCompassFoleyTelemetry(deltaRadius, sweepAngleRad, config)`
2. Unit Tests: `src/shared/utils/timeline/__tests__/compass-divider-caliper-ops.test.ts`.
3. Schema & Integration:
   - Add `draftingCompass` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` and `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export all types and functions from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Dedicated Drafting Compass & Divider Caliper panel in Card 3 of `SketchPane.tsx`:
  - Toggle: "Drafting Compass & Divider Caliper".
  - Sliders & Toggles:
    - Arm Length [80px to 300px]
    - Needle Pivot Friction [0% to 100%]
    - Thumbscrew Thread Pitch [0.5px to 5.0px]
    - Ratchet Click Foley Volume [0% to 100%]
    - Render Compass Overlay toggle.

---

## 3. Verification & Acceptance Criteria
- Python: `scripts/test_engine.py` passes all 74 tests (**74/74 green**).
- TypeScript: `npx vitest run` passes all test suites (**137/137 files passing**).
- TypeScript Compiler: `npx tsc --noEmit` exits with 0 errors.
