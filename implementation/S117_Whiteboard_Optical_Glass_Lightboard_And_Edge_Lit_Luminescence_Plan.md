# Milestone S117: Whiteboard Optical Glass Lightboard & Internal Edge-Lit Luminescence Mode

## 1. Context & Motivation
In modern STEM education and technical presentation video production (e.g. 3Blue1Brown, MIT OpenCourseWare, Khan Academy), illuminated glass boards (**Lightboards** / **Learning Glass**) provide unparalleled presenter connection and visual clarity:
1. **Total Internal Reflection (TIR) & Fluorescent Edge-Lit Scattering**:
   - High-intensity LEDs line the perimeter of an architectural glass pane ($n \approx 1.52$). Light remains trapped inside the glass via total internal reflection until it strikes dry-erase neon or liquid-chalk ink, intensely illuminating the writing toward the camera while keeping the background dark.
2. **Camera Inversion / Horizontal Mirroring**:
   - The presenter writes from behind the glass pane facing the audience. Writing from the presenter's perspective is mirrored, so the camera feed must apply a lossless horizontal mirror flip ($X' = W - X$) so linework reads correctly left-to-right for viewers.
3. **Glass Substrate Double-Surface Ghosting**:
   - Tempered glass thickness ($6\text{mm} - 10\text{mm}$) causes internal light refraction, casting a soft, subtle secondary ghost reflection of strokes offset along the optical perspective vector ($I_{ghost} \approx 6\% - 12\%$ intensity).
4. **Perimeter LED Edge Glow & Studio Low-Key Tint**:
   - Characteristic subtle gradient tint near the frame perimeter where LED strip light enters the glass pane (cyan, emerald, neon yellow, or clean daylight white).

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/lightboard_glass_engine.py`)
1. Data structures:
   - `LightboardConfig`:
     - `enabled: bool = True`
     - `mirror_horizontal: bool = True`
     - `edge_led_color_bgr: Tuple[int, int, int] = (255, 230, 0)` (Neon Cyan)
     - `led_intensity: float = 1.2` (0.5 to 2.5)
     - `glass_thickness_px: float = 5.0` (2.0 to 14.0 px)
     - `ghost_reflection_opacity: float = 0.08` (0.0 to 0.20)
     - `edge_glow_falloff_px: int = 80`
2. Core optical algorithms:
   - `apply_glass_double_reflection(canvas_bgr, thickness_px, ghost_opacity)`:
     - Generates soft offset secondary internal reflection of emissive strokes.
   - `apply_edge_lit_perimeter_glow(canvas_bgr, led_color_bgr, intensity, falloff_px)`:
     - Simulates LED strip injection along top and bottom glass borders.
   - `render_lightboard_composite(canvas_bgr, config)`:
     - Fuses double reflection, edge illumination, and horizontal flip ($X' = W - X$).
3. Standalone **Test 38** in `scripts/test_engine.py`:
   - Validates horizontal mirror flip geometry, secondary ghost reflection offset & intensity, and perimeter LED illumination.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/lightboard-glass-ops.ts`:
   - Interfaces: `LightboardGlassSettings`, `LightboardLedPreset`.
   - Pure functions:
     - `resolveLightboardLedColor(presetOrHex)`
     - `computeLightboardGhostOffset(thicknessPx, tiltDeg)`
     - `generateLightboardSvgFilterMarkup(filterId, thicknessPx, ghostOpacity)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/lightboard-glass-ops.test.ts`.
3. Schema & Exports:
   - Update `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Update `clipEffectsSchema.whiteboard` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Optical Glass Lightboard" section:
    - Enabled toggle.
    - Horizontal Mirroring toggle.
    - Edge-Lit LED Color selector (`cyan` | `emerald` | `amber` | `white`).
    - LED Illumination Intensity slider (50% – 200%).
    - Glass Pane Thickness (Ghosting) slider (2px – 12px).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (38/38 passing) - **Verified [PASS]**
- Run `npx tsc --noEmit` (clean exit code 0) - **Verified [PASS]**
- Run `npx vitest run` (101/101 test files passing, 1,046/1,046 tests passing) - **Verified [PASS]**

## 3. Status: 100% Complete & Verified
- Python engine: `scripts/core/lightboard_glass_engine.py`
- Python Test 38: Passing in `scripts/test_engine.py`
- TypeScript operations: `src/shared/utils/timeline/lightboard-glass-ops.ts`
- Vitest suite: `src/shared/utils/timeline/__tests__/lightboard-glass-ops.test.ts` (3/3 passing)
- Schema & Exports: `whiteboard.ts`, `effects.ts`, `src/shared/index.ts`
- UI controls: `SketchPane.tsx` Card 3 with interactive audience mirror flip toggle, edge-lit LED color presets (Cyan, Emerald, Amber, White), LED illumination intensity slider, glass pane thickness slider, and internal ghost reflection opacity slider.

---

## 4. Horizon Roadmap: Subsequent Milestones
- **Milestone S118**: Smart Geometric Shape Recognition & Snap-to-Vector Primitive Engine (Auto-Square, Circle, Ellipse, Polygon & Bézier Arc Regularization).
- **Milestone S119**: Whiteboard Laser Pointer Tracker, Optical Phosphor Persistence & Luminescent Afterglow Trails.
- **Milestone S120**: Magnetic Isometric & Cartesian Grid Snapping with Dynamic 3D Horizon Perspective.
