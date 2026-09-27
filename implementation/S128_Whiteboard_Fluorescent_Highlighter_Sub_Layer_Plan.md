# Milestone S128: Whiteboard Broad Chisel-Tip Fluorescent Highlighter Sub-Layer

## 1. Context & Motivation
Presenters, educators, and visual storytellers frequently highlight key words, formulas, and structural boundaries using wide fluorescent highlighters:
1. **Physical Optical Properties**:
   - **Subtractive / Multiply Color Blending**: Ink text underneath remains 100% crisp and dark without being fogged or obscured by milky semi-transparency.
   - **Overlapping Dye Accumulation**: Where two highlight strokes overlap, dye density compounds naturally into a richer, slightly darker band.
2. **Anisotropic Flat Chisel Nib**:
   - Rectangular flat contact profile (15px - 35px) tilted at an angle (typically ~15°), producing wide horizontal coverage bands with tapered end-caps.
3. **Fluorescent Color Presets**:
   - Vivid fluorescent stationeries: Neon Yellow (`#FFFA36`), Electric Green (`#59FF59`), Hot Pink (`#FF479C`), Cyan Blue (`#3DE3FF`), Radiant Orange (`#FFA43B`).
4. **Layer Compositing**:
   - Compositing mode choices: `'subtractive_multiply'` (physically accurate paper dye simulation over linework) or `'under_ink'` (composited directly onto substrate prior to line drawing).

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/fluorescent_highlighter_engine.py`)
1. Data structures:
   - `HighlighterConfig`:
     - `enabled: bool = True`
     - `color_preset: str = 'yellow'` # 'yellow' | 'green' | 'pink' | 'cyan' | 'orange'
     - `custom_color_bgr: Optional[Tuple[int, int, int]] = None`
     - `nib_width_px: float = 24.0`
     - `nib_angle_deg: float = 15.0`
     - `opacity: float = 0.45`
     - `composite_mode: str = 'subtractive_multiply'` # 'subtractive_multiply' | 'under_ink'
2. Core algorithms:
   - `resolve_highlighter_color_bgr(preset, custom_bgr)`: Resolves BGR fluorescent color.
   - `generate_highlighter_ribbon(points, nib_width, nib_angle_deg)`:
     - Generates 2D closed polygon ribbon using anisotropic chisel offsets $[-\frac{w}{2}, \frac{w}{2}]$ rotated by `nib_angle_deg`.
   - `blend_subtractive_multiply(canvas, ribbon_mask, color_bgr, opacity)`:
     - Implements optical subtractive dye blending:
       $C_{\text{out}} = C_{\text{in}} \cdot (1.0 - \alpha \cdot (1.0 - C_{\text{hl}} / 255.0))$.
   - `render_highlighter_stroke(canvas, points, config)`:
     - Integrates ribbon generation and subtractive rasterization.
3. Standalone **Test 49** in `scripts/test_engine.py`:
   - Validates color mapping, chisel ribbon geometry, multiply blend dark text preservation, and overlap dye compounding.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/fluorescent-highlighter-ops.ts`:
   - Interfaces: `HighlighterSettings`, `HighlighterColorPreset`.
   - Pure functions:
     - `getHighlighterColor(preset: HighlighterColorPreset, customHex?: string): string`
     - `computeHighlighterRibbon(points: Point2D[], nibWidth: number, nibAngleDeg: number): Point2D[]`
     - `blendSubtractiveColor(baseRgb: number[], hlRgb: number[], opacity: number): number[]`
     - `generateHighlighterSvg(points: Point2D[], settings: HighlighterSettings): string`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/fluorescent-highlighter-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.highlighter` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.highlighter` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Fluorescent Highlighter Sub-Layer" section:
    - Enabled toggle.
    - Color Preset segmented control (`Yellow`, `Green`, `Pink`, `Cyan`, `Orange`).
    - Nib Width slider (10px to 50px).
    - Chisel Angle slider (0° to 90°).
    - Dye Opacity slider (0.15 to 0.85).
    - Multiply Blending mode toggle.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 49/49 passing).
- Run `npx tsc --noEmit` (clean exit 0).
- Run `npx vitest run` (ensure 112/112 test files passing, 1,092+ tests).

---

## 3. Verification & Results (100% COMPLETE)
- **Python Engine (`scripts/core/fluorescent_highlighter_engine.py`)**:
  - Validated fluorescent color preset resolution (`yellow`, `green`, `pink`, `cyan`, `orange`).
  - Validated anisotropic chisel ribbon polygon generation at variable contact angles.
  - Validated physical subtractive multiply blending: dark text/linework underneath remains 100% crisp without fogging, while white substrate is tinted.
  - Standalone Test 49 passing in `scripts/test_engine.py` (**49/49 Python tests passing**).
- **VideoStudio Timeline & UI Operations (`src/shared/utils/timeline/fluorescent-highlighter-ops.ts`)**:
  - `getHighlighterColor`, `computeHighlighterRibbon`, `blendSubtractiveColor`, and `generateHighlighterSvg` implemented and tested.
  - Test suite `fluorescent-highlighter-ops.test.ts` passing (**4/4 tests passing**).
- **TypeScript & Vitest Validation**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npx vitest run` passed (**112/112 test files, 1,092/1,092 tests passing**).

