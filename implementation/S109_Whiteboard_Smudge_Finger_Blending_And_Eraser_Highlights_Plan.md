# Milestone S109: Whiteboard Procedural Smudge, Finger-Blending & Graphite Eraser Highlights
**Status: Complete (100% Verified)**
- Python tests: **30/30 passed** (including Test 30 for smudge advection and kneaded eraser lifting)
- VideoStudio tests: **93/93 test files passed, 1,019/1,019 tests passed**
- TypeScript type-checking: **0 errors (`tsc --noEmit` clean)**
- UI: Smudge & Finger Blending controls integrated into `SketchPane.tsx` Card 3.
Traditional sketch artists, chalk illustrators, and whiteboard lecturers frequently use finger smudging, blending stumps (tortillons), paper towels, and kneaded erasers:
1. **Directional Pigment Advection (Smudging)**:
   - Rubbing across dark linework drags a soft gradient tail in the direction of the finger motion.
   - The finger picks up pigment at the start of the gesture and redeposits it with exponential falloff.
2. **Kneaded Eraser Highlights (Subtractive Dabbing)**:
   - Dabbing with a kneaded eraser partially lifts charcoal/graphite pigment, creating soft clouds, reflections, and specular volume highlights.
3. **Paper Towel / Soft Felt Swipes**:
   - Broad sweeping gestures produce diffuse atmospheric fog and soft shadow fills between solid outlines.

Milestone S109 implements procedural smudge advection and subtractive eraser lifting across Python and TypeScript.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/smudge_blending_engine.py`)
1. Directional Smudge Advection:
   - Along a polyline gesture path $\mathbf{p}_0 \dots \mathbf{p}_k$, sample existing pigment density, accumulate carried pigment $C$, and deposit $C \cdot \alpha$ with spatial Gaussian spread $\sigma$.
2. Subtractive Eraser Dabbing:
   - Mask subtraction with soft radial falloff:
     $$I_{\text{new}}(x, y) = I_{\text{old}}(x, y) \cdot \left(1 - \beta \cdot e^{-\frac{d^2}{2\sigma^2}}\right)$$
3. Standalone **Test 30** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/smudge-blending-ops.ts`:
   - Data models: `SmudgeBlendSettings`, `SmudgeMode`, `SmudgeStroke`.
   - Pure functions:
     - `computeSmudgeTrail(trailPoints, radiusPx, strength)`
     - `applySubtractiveLifting(densityGrid, dabXy, radius, liftFraction)`
     - `generateSmudgeSvgOverlay(trail, radius, opacity)`
2. Unit Tests:
   - `src/shared/utils/timeline/__tests__/smudge-blending-ops.test.ts`.
3. Schema & Settings:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `smudgeBlend`.
   - Export through `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- Add "Smudge & Finger Blending" into Card 3 (Board Look & Hand Stylus) of `SketchPane.tsx`:
  - Blending Tool: Finger Rub / Blending Stump / Paper Towel / Kneaded Eraser.
  - Smudge Radius slider.
  - Blend Strength slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 30/30 pass).
- Run `npx tsc --noEmit` (ensure exit code 0).
- Run `npm test` across all 93 test files (ensure 1020+ tests pass).
