# Milestone S139: Whiteboard Solvent Vapor Shimmer & Ambient Thermal Convection

> **Status**: COMPLETED & VERIFIED (Python Test 60 passing; 8 Vitest tests in solvent-vapor-shimmer-ops.test.ts passing; full Vitest 123/123 suite passing; TypeScript check 0 errors; SketchPane Card 3 UI integrated)

## 1. Context & Motivation
Dry-erase markers and permanent pens rely on volatile organic solvent carriers (ethanol, isopropanol, methyl ethyl ketone). When drawn on a whiteboard:
1. **Solvent Evaporation Dynamics**:
   - Freshly deposited liquid ink releases volatile solvent vapor that evaporates over $0.5 - 2.5\text{ s}$.
2. **Upward Thermal & Buoyant Convective Plumes**:
   - Low-density vapor rises upward ($\vec{v}_{\text{buoyant}} = (0, -v_y)$), forming turbulent micro-convection cells above fresh strokes.
3. **Optical Micro-Refractive Heat Shimmer Distortion**:
   - Differential refractive index between ambient air ($n \approx 1.00029$) and volatile solvent vapor ($n \approx 1.0014$) refracts background light, producing an undulating shimmering mirage above recently completed strokes before stabilizing into permanent dry pigment.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/solvent_vapor_shimmer_engine.py`)
1. Data Structures:
   - `VaporPlumeConfig`:
     - `enabled: bool = True`
     - `shimmer_amplitude_px: float = 2.5` (max distortion amplitude in pixels)
     - `shimmer_wavelength_px: float = 20.0` (ripple wavelength)
     - `convection_speed: float = 40.0` (upward drift in pixels/sec)
     - `solvent_evap_half_life: float = 1.0` (exponential decay half-life in seconds)
     - `buoyancy_plume_height_px: float = 35.0` (vertical extent above stroke)
2. Core Algorithms:
   - `compute_shimmer_amplitude(elapsed_sec, max_amplitude, half_life) -> float`:
     $$A(t) = A_0 \cdot 2^{-t / \tau_{\text{half}}}$$
   - `generate_vapor_displacement_field(width, height, stroke_points, stroke_times, current_time, config) -> Tuple[np.ndarray, np.ndarray]`:
     Computes 2D vector field $(dx, dy)$ for `cv2.remap`.
   - `apply_solvent_vapor_shimmer(canvas, displacement_field) -> np.ndarray`:
     Applies high-order bicubic optical warping.
3. Python Unit Test 60:
   - Validates that shimmer amplitude decays to $< 5\%$ after 4 half-lives.
   - Validates that buoyant plume is concentrated vertically above the stroke $(y < y_0)$.
   - Validates that `cv2.remap` smoothly distorts fresh strokes without clipping or artifacts.

### Phase 2: VideoStudio Operations & Tests
1. Module: `src/shared/utils/timeline/solvent-vapor-shimmer-ops.ts`
   - `computeShimmerAmplitude(elapsedSec: number, maxAmplitude?: number, halfLifeSec?: number): number`
   - `computeConvectiveFlutter(timeSec: number, y: number, wavelength?: number, speed?: number): number`
   - `generateVaporShimmerSvgFilter(amplitudePx: number, wavelengthPx: number, elapsedSec: number, id?: string): string`
2. Unit Tests: `src/shared/utils/timeline/__tests__/solvent-vapor-shimmer-ops.test.ts`
3. Schema & Exports:
   - Add `vaporShimmer?: VaporShimmerSettings` to `WhiteboardSettings` in `whiteboard.ts`.
   - Add `vaporShimmer` to `clipEffectsSchema` in `effects.ts`.
   - Export from `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Solvent Vapor Shimmer & Convection" section:
    - Enabled toggle.
    - Shimmer Amplitude slider ($0.5\text{ px} - 6.0\text{ px}$).
    - Evaporation Half-Life slider ($0.3\text{ s} - 3.0\text{ s}$).
    - Convection Drift Velocity slider ($10\text{ px/s} - 80\text{ px/s}$).
    - Plume Height slider ($15\text{ px} - 80\text{ px}$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 60 passes in `scripts/test_engine.py` (**60/60 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with all test files green.
3. UI Integration:
   - Controls verified in `SketchPane.tsx` Card 3.
4. Documentation:
   - `walkthrough.md` updated with Milestone S139.
