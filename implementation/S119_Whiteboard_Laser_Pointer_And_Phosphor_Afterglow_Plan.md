# Milestone S119: Whiteboard Laser Pointer Tracker, Optical Phosphor Persistence & Luminescent Afterglow Trails

## 1. Context & Motivation
In academic lectures, STEM video tutorials (e.g. physics/math derivations), and live presentations, presenters frequently use laser pointers or optical pens to highlight terms, circle equations, and guide viewer gaze without leaving permanent marks on the canvas:
1. **Physical Laser Beam Optical Emission**:
   - Ultra-intense monochromatic core with sub-millimeter specular sharpness and wider optical dispersion halo.
   - Standard wavelength presets: Emerald Green ($532\text{nm}$ `#00ff66`), Ruby Red ($650\text{nm}$ `#ff2233`), and Ultraviolet/Violet ($405\text{nm}$ `#9933ff`).
2. **Phosphor Persistence & Afterglow Decay Physics**:
   - As the pointer sweeps across the surface, excited phosphor or board optics undergo exponential decay:
     $$I(t) = I_0 \cdot \exp\left(-\frac{\Delta t}{\tau}\right)$$
     where $\tau$ is the characteristic half-life decay constant ($0.2\text{s} - 2.5\text{s}$).
3. **Transient Gestural Trails & Kinetic Puddles**:
   - Fast sweeps leave luminous fading tails that direct the eye along derivation steps, while pausing/hovering creates concentrated attention puddles.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/laser_pointer_afterglow_engine.py`)
1. Data structures:
   - `LaserPointerConfig`:
     - `enabled: bool = True`
     - `laser_color_bgr: Tuple[int, int, int] = (100, 255, 0)` (Emerald Green in BGR)
     - `core_radius_px: float = 3.5`
     - `halo_radius_px: float = 16.0`
     - `persistence_sec: float = 0.8` (decay constant)
     - `trail_intensity: float = 0.90`
2. Core optical rendering algorithms:
   - `render_laser_spot(canvas_bgr, center, config)`:
     - Multi-layer render: ultra-saturated white-hot core ($255, 255, 255$) overlaid on a wider saturated chromatic Gaussian halo.
   - `render_phosphor_trail(canvas_bgr, trajectory_pts, timestamps, current_time, config)`:
     - Traverses historical path within `current_time - persistence_sec`.
     - Calculates exponential fade weight $\alpha(t) = \exp(-(t_{curr} - t) / \tau)$.
     - Accumulates optical energy into a float32 light map and adds to canvas via screen/additive composite.
3. Standalone **Test 40** in `scripts/test_engine.py`:
   - Validates laser spot luminance peak, chromatic halo falloff, and exponential temporal decay of afterglow trail points.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/laser-pointer-ops.ts`:
   - Interfaces: `LaserPointerSettings`, `LaserColorPreset` (`'emerald' | 'ruby' | 'violet'`).
   - Pure functions:
     - `resolveLaserColor(preset?: LaserColorPreset, customHex?: string): string`
     - `evaluatePhosphorDecay(elapsedSec: number, halfLifeSec: number): number`
     - `generateLaserPointerSvgFilterMarkup(filterId: string, colorHex: string, haloRadiusPx: number): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/laser-pointer-ops.test.ts`.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Update `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Laser Pointer & Phosphor Afterglow" section:
    - Enabled toggle.
    - Laser Color preset selector (`Emerald`, `Ruby`, `Violet`).
    - Pointer Core Radius slider (2px – 8px).
    - Afterglow Persistence Duration slider (0.2s – 2.5s).
    - Trail Halo Intensity slider (30% – 100%).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (40/40 passing) - **Verified [PASS]**
- Run `npx tsc --noEmit` (clean exit code 0) - **Verified [PASS]**
- Run `npx vitest run` (103/103 test files passing, 1,052/1,052 tests passing) - **Verified [PASS]**

## 3. Status: 100% Complete & Verified
- Python engine: `scripts/core/laser_pointer_afterglow_engine.py`
- Python Test 40: Passing in `scripts/test_engine.py`
- TypeScript operations: `src/shared/utils/timeline/laser-pointer-ops.ts`
- Vitest suite: `src/shared/utils/timeline/__tests__/laser-pointer-ops.test.ts` (3/3 passing)
- Schema & Exports: `whiteboard.ts`, `effects.ts`, `src/shared/index.ts`
- UI controls: `SketchPane.tsx` Card 3 with interactive wavelength color selector (Emerald 532nm, Ruby 650nm, Violet 405nm), pointer core radius slider, afterglow persistence duration slider, and trail halo intensity slider.

---

## 4. Horizon Roadmap: Subsequent Milestones
- **Milestone S120**: Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective.
