# Milestone S121: Procedural Whiteboard Hand Contact Shadows & Dynamic Ambient Occlusion

## 1. Context & Motivation
In live-action whiteboard presentations, the presenter's hand and writing implement (stylus, marker, chalk) cast subtle, soft contact shadows and ambient occlusion (AO) onto the board substrate:
1. **Contact Umbra vs. Penumbra**:
   - Right at the point of pen-tip contact ($z \approx 0$), the umbra is compact, dark, and sharply defined.
   - Further along the hand, wrist, and forearm, the shadow diffuses into a soft penumbra due to the extended area light source (ceiling fluorescents / studio softbox).
2. **Dynamic Pen-Lift Dissipation (Z-Elevation Dynamics)**:
   - When the hand lifts during travel between words or strokes ($z > 0$), the contact shadow smoothly expands, drops in opacity, and blurs outward.
   - When pressing down firmly, the shadow contracts tightly under the nib.
3. **Directional Light Angle & Anisotropic Projection**:
   - Customizable lighting angle $\theta_{light}$ (e.g. top-left overhead key light at $-45^\circ$, or diffuse ambient ceiling light at $90^\circ$).
   - Shadow shear/skew offset vector $(dx, dy) = (\cos \theta, \sin \theta) \cdot d_{offset}$.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/contact_shadow_engine.py`)
1. Data structures:
   - `ContactShadowConfig`:
     - `enabled: bool = True`
     - `light_angle_deg: float = 315.0` # Key light from top-left (315°)
     - `shadow_opacity: float = 0.35`    # Umbra max opacity (0.1..0.8)
     - `blur_radius_px: float = 14.0`    # Penumbra diffusion kernel size
     - `lift_dissipation: float = 0.60`  # Fade rate when pen tip lifts from board
     - `wrist_skew_factor: float = 1.8`  # Forearm shadow elongation ratio
2. Core algorithms:
   - `compute_contact_shadow_mask(hand_mask, tip_pos, is_touching, config)`:
     - Generates directional projection offset based on `light_angle_deg`.
     - Applies distance-weighted Gaussian penumbra diffusion (sharper near tip, blurrier near wrist).
     - Modulates alpha based on pen contact state and lift height.
   - `composite_contact_shadow(canvas_bgr, shadow_mask, config)`:
     - Multiplies shadow into whiteboard substrate preserving ink and background texture.
3. Python unit test:
   - Standalone **Test 42** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/contact-shadow-ops.ts`:
   - Interfaces: `ContactShadowSettings`.
   - Pure functions:
     - `computeShadowOffsetVector(angleDeg: number, distancePx: number): [number, number]`
     - `calculatePenumbraBlur(distanceFromTipPx: number, baseBlurPx: number, isLifting: boolean): number`
     - `generateShadowFilterCss(settings: ContactShadowSettings): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/contact-shadow-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.contactShadow` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.contactShadow` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Hand Contact Shadow & Ambient Occlusion" section:
    - Enabled toggle.
    - Key Light Angle selector / slider (0° to 360°).
    - Shadow Opacity slider (10% to 70%).
    - Penumbra Softness slider (4px to 32px).
    - Tip-Lift Dissipation toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 42/42 passing) -> **VERIFIED (42/42 passing)**.
- Run `npx tsc --noEmit` (clean exit 0) -> **VERIFIED (clean exit 0)**.
- Run `npx vitest run` (ensure 105/105 test files passing, 1,060+ tests) -> **VERIFIED (105/105 test files, 1,062/1,062 tests passing)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- **Python**: `scripts/core/contact_shadow_engine.py` created with directional light compass projection, distance-modulated umbra/penumbra blur, tip-lift dissipation, and canvas alpha composite.
- **Python Test**: Standalone Test 42 in `scripts/test_engine.py` (**42/42 passing**).
- **TypeScript**: `src/shared/utils/timeline/contact-shadow-ops.ts` with `computeShadowOffsetVector`, `calculatePenumbraBlur`, and `generateContactShadowCssFilter`.
- **TypeScript Test**: `src/shared/utils/timeline/__tests__/contact-shadow-ops.test.ts` (**4/4 passing**).
- **Schema & Types**: `WhiteboardSettings.contactShadow` in `whiteboard.ts` and `clipEffectsSchema.whiteboard.contactShadow` in `effects.ts`.
- **UI**: Added Hand Contact Shadows (AO) section in `src/renderer/features/timeline-media/ui/SketchPane.tsx` Card 3 with light angle, opacity, softness, and tip-lift sliders.
- **Module Exports**: Exported in `src/shared/index.ts`.

