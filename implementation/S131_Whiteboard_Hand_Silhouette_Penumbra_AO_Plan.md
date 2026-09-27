# Milestone S131: Whiteboard Hand Shadow Soft-Penumbra Contact Ambient Occlusion with Hand Geometry Silhouette Tracing

## 1. Context & Motivation
In physical whiteboard video production, the shadow cast by the presenter's hand and arm onto the board is not a flat translated silhouette. Real shadows exhibit depth-dependent geometric and optical behavior:
1. **Geometric Silhouette Extraction & Contour Tracing**:
   - The boundary contour of the active hand asset (pen tip, fingers, knuckles, palm, wrist, and forearm) must be extracted and polygon-vectorized from the hand sprite alpha channel.
2. **Perspective Ray Projection & Convex Hull Extrusion**:
   - The hand exists in a 3D coordinate space relative to the board:
     - Stylus contact tip: $z_{\text{tip}} \approx 0$ mm (when touching) to $5$ mm (micro-hover).
     - Knuckles & palm: $z \approx 15 - 30$ mm.
     - Wrist & forearm: $z \approx 40 - 90$ mm extending off-frame.
   - For an overhead light source at $(L_x, L_y, L_z)$, shadow vertices project along rays:
     $$P'_i = P_i + \frac{z_i}{L_z - z_i} (P_i - L_{xy})$$
   - This creates natural perspective elongation and widening along the forearm axis while anchoring tightly at the pen tip.
3. **Height-Weighted Penumbra Diffusion (Contact Umbra -> Distal Penumbra)**:
   - According to penumbra optics, the blur radius of the shadow is proportional to elevation $z$:
     $$w_{\text{penumbra}}(z) \propto \frac{z}{L_z} \cdot D_{\text{luminaire}}$$
   - At the pen tip ($z \approx 0$), the shadow is razor-sharp and dense (contact umbra + micro AO).
   - As distance along the forearm increases ($z \to 80$ mm), the shadow softens progressively into a wide, diffuse penumbra.
4. **Dynamic Nib-Anchor Invariance**:
   - The perspective shadow maintains absolute spatial alignment with the pen tip position and dynamic wrist tilt angle during fast drawing.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/hand_silhouette_penumbra_engine.py`)
1. Data Structures:
   - `HandSilhouetteGeometry`:
     - `contour_pts: np.ndarray` (2D boundary vertices in sprite coordinates)
     - `elevation_map: np.ndarray` (Z-height profile along hand longitudinal axis from tip to wrist)
     - `tip_pt: Tuple[float, float]`
     - `wrist_pt: Tuple[float, float]`
   - `HandShadowPenumbraConfig`:
     - `enabled: bool = True`
     - `light_pos_3d: Tuple[float, float, float] = (-200.0, -300.0, 600.0)` # Overhead key light (X, Y, Z mm)
     - `tip_contact_z_mm: float = 0.0` # 0 when touching board, >0 when pen lifted
     - `wrist_elevation_mm: float = 65.0`
     - `umbra_opacity: float = 0.55`
     - `max_penumbra_blur_px: float = 24.0`
     - `ao_radius_px: float = 8.0`
2. Core Algorithms:
   - `extract_hand_silhouette_contour(hand_rgba, nib_xy, wrist_xy)`:
     - Extracts external contour polygon from alpha channel.
     - Computes longitudinal axis and height gradient $z(P_i) = z_{\text{tip}} + \frac{\text{dist}(P_i, \text{nib})}{\text{dist}(\text{wrist}, \text{nib})} (z_{\text{wrist}} - z_{\text{tip}})$.
   - `project_perspective_shadow_polygon(contour_pts, z_profile, light_pos_3d, affine_transform)`:
     - Projects 3D vertices onto board surface $z = 0$.
     - Computes perspective shear and elongation.
   - `render_graduated_penumbra_shadow(canvas_bgr, projected_poly, z_profile, config)`:
     - Applies distance-weighted multi-pass graduated blur (sharp at nib, diffuse at wrist).
     - Renders tight contact ambient occlusion directly beneath the pen tip.
     - Blends onto canvas using optical subtractive multiply compositing.
3. Standalone Unit Test:
   - **Test 52** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/hand-silhouette-penumbra-ops.ts`:
   - Interfaces: `HandSilhouettePoint3D`, `HandShadowPenumbraSettings`, `PerspectiveShadowPolygon`.
   - Pure functions:
     - `projectPoint3DToBoard(p: [number, number, number], light: [number, number, number]): [number, number]`
     - `calculateGraduatedBlurRadius(elevationMm: number, lightZMm: number, maxBlurPx: number): number`
     - `generatePerspectiveShadowSvgPath(vertices: Array<[number, number]>, isLifting?: boolean): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/hand-silhouette-penumbra-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.handSilhouettePenumbra` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.handSilhouettePenumbra` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Perspective Hand Silhouette Shadow & Penumbra AO" section:
    - Enabled toggle.
    - Key Light 3D Elevation / Distance slider (300mm to 1200mm).
    - Forearm Wrist Elevation slider (20mm to 120mm).
    - Max Penumbra Diffusion slider (8px to 48px).
    - Contact Umbra Density slider (20% to 80%).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Standalone Test 52 passes in `scripts/test_engine.py` (52/52 tests passing).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with 115/115 test files and 1,104+ tests green.
3. Documentation:
   - Artifact `walkthrough.md` updated with Milestone S131 details.

---

## 4. Status: 100% COMPLETE & VERIFIED
- **Python Engine**: Test 52 passed in `scripts/test_engine.py` (52/52 tests passing).
- **VideoStudio Unit Tests**: 4/4 tests passed in `src/shared/utils/timeline/__tests__/hand-silhouette-penumbra-ops.test.ts`.
- **TypeScript**: `tsc --noEmit` clean exit code 0.
- **UI Integration**: Complete in `SketchPane.tsx` Card 3 with Key Light 3D Elevation, Forearm Wrist Elevation, Penumbra Diffusion, Umbra Density, and Contact AO controls.
