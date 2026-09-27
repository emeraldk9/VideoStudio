# Milestone S122: Whiteboard Marker Ink Depletion, Dry-Out Streaking & Chalk Micro-Chatter Physics

## 1. Context & Motivation
In physical whiteboard drawing and chalkboard demonstrations, writing implements experience realistic micro-wear and solvent depletion dynamics:
1. **Solvent Depletion & Dry-Out Striations (Felt-Tip Markers)**:
   - As a continuous marker stroke progresses over large distances ($L > 400\text{px}$), solvent evaporates and ink delivery drops, revealing internal felt fiber gaps (dry-out striations).
   - When the pen is lifted or paused, capillary action recharges the nib reservoir with solvent and pigment.
2. **Chalk Micro-Chatter & Skipping (Chalkboard Slates)**:
   - On toothy slate backgrounds, brittle chalk micro-fractures under friction, producing rhythmic micro-gaps (chatter skips) and irregular pigment density.
3. **Parametric Control**:
   - Customizable depletion rate ($k_{deplete}$), capillary recharge speed ($k_{recharge}$), and streak roughness.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/ink_depletion_engine.py`)
1. Data structures:
   - `InkDepletionConfig`:
     - `enabled: bool = True`
     - `depletion_rate: float = 0.002`      # Ink reservoir drain per pixel of stroke travel
     - `min_saturation: float = 0.35`       # Minimum pigment opacity when dry
     - `streak_count: int = 5`              # Number of parallel felt-fiber striations
     - `recharge_rate: float = 0.25`        # Capillary reservoir refill per second of rest
     - `chatter_frequency: float = 0.15`    # Chalk micro-skip frequency along path
2. Core algorithms:
   - `simulate_stroke_depletion(stroke_points, current_reservoir_level, config)`:
     - Accumulates arc-length travel $s$.
     - Computes dynamic reservoir level $R(s) = \max(R_{min}, R_0 - k \cdot s)$.
     - Generates multi-fiber alpha striation masks for dry-erase strokes.
   - `apply_chalk_micro_chatter(stroke_points, config)`:
     - Applies high-frequency micro-amplitude modulation to simulate stick-slip chalk skips.
3. Standalone **Test 43** in `scripts/test_engine.py`:
   - Validates depletion curve, reservoir recharge, striation rendering, and chalk micro-chatter.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/ink-depletion-ops.ts`:
   - Interfaces: `InkDepletionSettings`.
   - Pure functions:
     - `calculateStrokeDepletion(lengthPx: number, initialLevel: number, depletionRate: number): number`
     - `generateStriationMaskSvg(width: number, height: number, streakCount: number, dryness: number): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/ink-depletion-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.inkDepletion` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.inkDepletion` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Ink Depletion & Chalk Micro-Chatter" section:
    - Enabled toggle.
    - Depletion Sensitivity slider.
    - Fiber Striation Count slider.
    - Capillary Recharge Speed slider.
    - Chalk Chatter Skipping toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 43/43 passing) -> **VERIFIED (43/43 passing)**.
- Run `npx tsc --noEmit` (clean exit 0) -> **VERIFIED (clean exit 0)**.
- Run `npx vitest run` (ensure 106/106 test files passing, 1,065+ tests) -> **VERIFIED (106/106 test files, 1,066/1,066 tests passing)**.

---

## 3. Status: 100% COMPLETE & VERIFIED
- **Python**: `scripts/core/ink_depletion_engine.py` created with continuous arc-length solvent drain, resting capillary reservoir recharge, stick-slip chalk micro-chatter skipping, and striated felt fiber rendering.
- **Python Test**: Standalone Test 43 in `scripts/test_engine.py` (**43/43 passing**).
- **TypeScript**: `src/shared/utils/timeline/ink-depletion-ops.ts` with `calculateStrokeDepletion`, `rechargeReservoirLevel`, `applyChalkMicroChatter`, and `generateStriationMaskSvg`.
- **TypeScript Test**: `src/shared/utils/timeline/__tests__/ink-depletion-ops.test.ts` (**4/4 passing**).
- **Schema & Types**: `WhiteboardSettings.inkDepletion` in `whiteboard.ts` and `clipEffectsSchema.whiteboard.inkDepletion` in `effects.ts`.
- **UI**: Added Ink Depletion & Chalk Chatter section in `src/renderer/features/timeline-media/ui/SketchPane.tsx` Card 3 with depletion rate, min saturation, felt fiber count, and chalk chatter toggle.
- **Module Exports**: Exported in `src/shared/index.ts`.

