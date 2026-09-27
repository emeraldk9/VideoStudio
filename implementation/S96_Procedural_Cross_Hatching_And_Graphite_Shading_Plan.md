# Milestone S96: Procedural Cross-Hatching, Pressure-Sensitive Graphite Shading & Editorial Texture Engine

## 1. Context & Motivation
Currently, whiteboard and sketch reveals fill interior regions via solid color bloom or directional wipes. In authentic editorial hand-drawn sketches, chalkboards, and architectural concept art, shaded regions and shadows are produced by **procedural cross-hatching**—dense, rhythmic, angled parallel strokes whose spacing and angle convey volume and depth, with the drawing stylus performing continuous back-and-forth shading.

### Objectives:
1. **Procedural Angled Scanline Clipping**:
   - Generate parallel scanlines rotated by an authored angle $\theta$ (default $45^\circ$) across any bounding polygon or luminance threshold mask.
   - Clip scanlines to polygon boundaries, producing valid internal line segments.
2. **Continuous Stroke Chaining (Serpentine Turnarounds)**:
   - Connect adjacent scanline endpoints $(P_k^{\text{end}}, P_{k+1}^{\text{end}})$ with smooth turnaround loops, avoiding erratic pen-lifts and mirroring natural human wrist movement.
3. **Multi-Pass Cross-Hatching**:
   - Support secondary cross-pass rotated by $90^\circ$ ($\theta + 90^\circ$) for darker shadow regions, producing classic architectural cross-hatch shading.
4. **Python Engine Implementation (`scripts/core/hatching_engine.py`)**:
   - `CrossHatchEngine` with polygon clipping, serpentine chaining, and pen tip trajectory synthesis.
   - Verification in `scripts/test_engine.py` (Test 17).
5. **VideoStudio Timeline & UI Integration**:
   - TypeScript operations in `src/shared/utils/timeline/hatching-ops.ts`.
   - Update `WhiteboardSettings`, `WhiteboardZone`, and `clipEffectsSchema` with `shadingStyle`, `hatchAngle`, `hatchSpacingPx`, and `crossHatch`.
   - UI controls in `src/renderer/features/timeline-media/ui/SketchPane.tsx`.
   - Automated unit tests and verification.

---

## 2. Architecture & Design

### Phase 1: Python Engine (`scripts/core/hatching_engine.py`) [COMPLETE]
1. **Mathematical Hatch Line Generation**: [DONE]
   - Built `generate_single_pass_hatch` with inverse-rotation polygon alignment, scanline edge intersection, and intersection pairing.
2. **Serpentine Trajectory Chaining**: [DONE]
   - Built `chain_serpentine_strokes` alternating forward and backward sweeps to simulate human hand shading.
3. **Multi-Pass Cross-Hatch**: [DONE]
   - Built `generate_hatch_strokes` supporting orthogonal multi-pass cross-hatching ($\theta + 90^\circ$).
4. **Standalone Verification in `scripts/test_engine.py`**: [DONE]
   - Added **Test 17**: Verified polygon scanline clipping, serpentine chaining, and cross-hatch mask rendering (**17/17 tests passing**).

### Phase 2: VideoStudio TypeScript Engine & Shared Types [COMPLETE]
1. **`src/shared/utils/timeline/hatching-ops.ts`**: [DONE]
   - Pure TypeScript, zero-dependency polygon scanline intersection, sorting, and continuous stroke generator.
2. **`WhiteboardSettings` & `WhiteboardZone` in `whiteboard.ts` & `effects.ts`**: [DONE]
   - Added `shadingStyle?: 'bloom' | 'hatch' | 'crosshatch';`, `crossHatch?: boolean;`, `hatchAngle?: number;`, and `hatchSpacingPx?: number;`.
   - Updated `clipEffectsSchema` with defensive validation.
3. **Unit Tests in `src/shared/utils/timeline/__tests__/hatching-ops.test.ts`**: [DONE]
   - Unit tests verifying rotation, polygon scanline clipping, serpentine chaining, and multi-pass cross-hatching (**4/4 passing**).

### Phase 3: VideoStudio UI in `SketchPane.tsx` [COMPLETE]
- In Card 1, added Shading Style segmented control (`Bloom`, `Hatch`, `Cross`), and in zone scribbles added angle slider (0–180°) and `✕ Cross` toggle button.

### Phase 4: Full Validation & Test Suite [COMPLETE]
- Python test suite: `scripts/test_engine.py` (**17/17 pass**).
- VideoStudio typecheck: `npx tsc --noEmit` (**0 errors**).
- VideoStudio unit test suite: `npx vitest run` (**80/80 test files, 974/974 tests passing**).

---

### Milestone Completion Summary
- **Status**: **100% COMPLETE & VERIFIED**
- **Artifacts**:
  - `scripts/core/hatching_engine.py`
  - `scripts/test_engine.py` (Test 17)
  - `src/shared/utils/timeline/hatching-ops.ts`
  - `src/shared/utils/timeline/__tests__/hatching-ops.test.ts`
  - `src/shared/utils/timeline/whiteboard.ts`
  - `src/shared/utils/timeline/effects.ts`
  - `src/renderer/features/timeline-media/ui/SketchPane.tsx`

