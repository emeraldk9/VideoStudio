# Milestone S136: Whiteboard Dry-Erase Felt Eraser Swipe Smear & Ghosting Residuals

> **Status**: COMPLETED & VERIFIED (Python Test 57 passing; 9 Vitest tests in eraser-smear-ghosting-ops.test.ts passing; full Vitest 120/120 suite passing; TypeScript check 0 errors; SketchPane Card 3 UI integrated)

## 1. Context & Motivation
In real-world whiteboard usage, erasing ink leaves physical traces:
1. **Eraser Felt Pad Saturation**:
   - Dry-erase felt pads trap dry pigment dust as they wipe across dark strokes. As the pad becomes saturated, it begins re-depositing a faint hazy residue ($S_{\text{pad}} \in [0, 1]$).
2. **Trailing Wiper Streaks / Smear Bands**:
   - The trailing edges of a moving felt block leave faint directional micro-streaks ($2\% - 10\%$ opacity) aligned with the wiping direction.
3. **Chemical Ghosting Residual Memory**:
   - Pigment binders (especially saturated reds, blues, and blacks) seep into microscopic pores of the whiteboard substrate, leaving faint ghosting silhouettes ($3\% - 6\%$ opacity) of erased text and diagrams.
4. **Multi-Pass Eraser Cleaning**:
   - Re-wiping the same area diminishes ghosting by $\approx 40\%$ per pass, requiring 2 to 3 wiping strokes to completely restore pure white substrate.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/eraser_smear_ghosting_engine.py`)
1. Data Structures:
   - `EraserFootprint`: rectangular wiper dimension $(w, h)$, center $(x, y)$, angle $\theta$.
   - `SmearBandQuad`: trailing smear polygon with opacity proportional to felt saturation.
   - `EraserGhostingConfig`:
     - `enabled: bool = True`
     - `felt_saturation_rate: float = 0.08`
     - `smear_opacity: float = 0.06`
     - `ghost_persistence: float = 0.05`
     - `cleaning_decay_rate: float = 0.40`
2. Core Algorithms:
   - `update_felt_saturation(current_sat, cleared_pixels, sat_rate) -> float`:
     - Accumulates saturation toward 1.0.
   - `generate_wiper_smear_quads(swipe_path, eraser_width, saturation) -> List[SmearBandQuad]`:
     - Generates trailing edge smear polygons.
   - `compute_ghosting_opacity(pass_count, initial_persistence, decay_rate) -> float`:
     - Computes residual memory opacity after $N$ wipe passes.
   - `render_eraser_smear_and_ghosting(canvas, smear_quads, ghost_mask, ghost_opacity) -> np.ndarray`:
     - Renders subtle smear trails and persistent ghost outlines onto whiteboard canvas.
3. Automated Unit Test:
   - **Test 57** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/eraser-smear-ghosting-ops.ts`:
   - Pure functions:
     - `computeFeltSaturation(clearedPixels: number, currentSat?: number, satRate?: number): number`
     - `generateWiperSmearBands(swipePath: Array<{x: number, y: number}>, eraserWidth: number, saturation: number): SmearBandMesh`
     - `calculateGhostingResidualOpacity(passCount: number, basePersistence?: number, decayRate?: number): number`
     - `generateEraserGhostingSvgMarkup(mesh: SmearBandMesh, ghostOpacity: number): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/eraser-smear-ghosting-ops.test.ts`.
3. Schema & Exports:
   - Add `EraserGhostingSettings` to `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts`.
   - Add `eraserGhosting` to `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Dry-Erase Felt Smear & Ghosting Residuals" section:
    - Enabled toggle.
    - Felt Pad Saturation Rate slider ($1\% - 20\%$).
    - Trailing Wiper Smear Opacity slider ($1\% - 15\%$).
    - Ghosting Residual Memory slider ($1\% - 12\%$).
    - Multi-Pass Cleaning Decay slider ($20\% - 80\%$).

---

## 3. Verification & Acceptance Criteria
1. Python engine:
   - Test 57 passes in `scripts/test_engine.py` (**57/57 tests passing**).
2. VideoStudio:
   - `tsc --noEmit` exits 0 with zero errors.
   - `npx vitest run` passes with **120/120 test files** and **1,148+ tests green**.
3. UI Integration:
   - Controls verified in `SketchPane.tsx` Card 3.
4. Documentation:
   - `walkthrough.md` updated with Milestone S136.
