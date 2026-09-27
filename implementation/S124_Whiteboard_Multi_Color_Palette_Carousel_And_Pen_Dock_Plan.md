# Milestone S124: Whiteboard Multi-Color Palette Carousel, Ring Dock & Click-Pen Dynamics

## 1. Context & Motivation
In professional whiteboard instruction, presenters frequently alternate between 4 core ink colors:
- Black: Primary linework, structural geometry, writing body.
- Red: Critical warnings, error highlights, key formulas.
- Blue: Supporting notes, secondary diagrams, subheadings.
- Green: Positive checks, validation steps, success criteria.

To elevate presentation realism:
1. **Multi-Pen Desk Caddy / Rotating Ring Dock**:
   - Styluses are stored in a visual carousel / ring dock that rotates when selecting a new color.
2. **Multi-Color 4-in-1 Click-Pen Mechanism**:
   - Presenter uses a 4-in-1 multi-pen: selecting a new color triggers an internal plunger slide animation with an audible dual-click foley SFX (retract old nib, deploy new color nib).
3. **Parametric Orchestration**:
   - Palette presets (`standard_quad`, `neon_quad`, `pastel_quad`), dock rotation speed ($t_{rot} \in [0.1\text{s}, 0.6\text{s}]$), and mechanical click foley audio volume.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/color_palette_dock_engine.py`)
1. Data structures:
   - `PaletteDockConfig`:
     - `enabled: bool = True`
     - `dock_style: str = 'caddy'`        # 'caddy' | 'ring_dock' | 'multipen_click'
     - `active_color_idx: int = 0`        # 0: Black, 1: Red, 2: Blue, 3: Green
     - `palette_preset: str = 'standard'` # 'standard' | 'neon' | 'earth'
     - `rotation_duration_sec: float = 0.20`
     - `click_foley_volume: float = 0.70`
2. Core algorithms:
   - `compute_dock_carousel_state(active_color_idx, transition_progress, config)`:
     - Returns angular rotation and individual pen elevation offsets.
   - `resolve_color_hex(color_idx, palette_preset)`:
     - Maps color index and preset to RGB/BGR hex values.
3. Standalone **Test 45** in `scripts/test_engine.py`:
   - Validates color palette resolution, carousel rotation angle math, and multipen plunger elevation dynamics.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/palette-dock-ops.ts`:
   - Interfaces: `PaletteDockSettings`, `PaletteColorPreset`.
   - Pure functions:
     - `getPaletteColors(preset: string): string[]`
     - `computeCarouselRotationDeg(activeIdx: number, totalSlots: number): number`
     - `generatePaletteDockSvg(activeIdx: number, progress: number, preset: string): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/palette-dock-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.paletteDock` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.paletteDock` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Multi-Color Palette Carousel & Pen Dock" section:
    - Enabled toggle.
    - Dock Style segmented control (`Caddy`, `Ring Dock`, `Multi-Pen`).
    - Palette Preset segmented control (`Standard`, `Neon`, `Earth`).
    - Active Color Selector (Black, Red, Blue, Green).
    - Mechanical Click Foley Volume slider.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 45/45 passing).
- Run `npx tsc --noEmit` (clean exit 0).
- Run `npx vitest run` (ensure 108/108 test files passing, 1,075+ tests).

---

## 3. Verification & Results (100% COMPLETE)
- **Python Engine (`scripts/core/color_palette_dock_engine.py`)**:
  - Validated palette preset mapping (`standard`, `neon`, `earth`).
  - Validated caddy, ring dock rotation angle interpolation and click-pen plunger elevation dynamics.
  - Test 45 passing in `scripts/test_engine.py` (**45/45 Python tests passed**).
- **VideoStudio Timeline & UI Operations (`src/shared/utils/timeline/palette-dock-ops.ts`)**:
  - `resolvePaletteColor`, `computeCarouselRotation`, `computeSlotElevations`, `generatePaletteDockSvg` implemented and tested.
  - Test suite `palette-dock-ops.test.ts` passing (**4/4 tests passed**).
- **TypeScript & Vitest Validation**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npx vitest run` passed (**108/108 test files, 1,075/1,075 tests passed**).

