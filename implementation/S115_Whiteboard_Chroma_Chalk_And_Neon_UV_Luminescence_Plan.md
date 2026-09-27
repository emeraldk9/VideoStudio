# Milestone S115: Whiteboard Chroma Chalk & Neon UV Blacklight Luminescence Shader

## 1. Context & Motivation
Dark mode blackboard presentations, cybernetic explainer diagrams, and STEM animations increasingly rely on vivid luminescent aesthetics:
1. **Electroluminescent Neon Chalk**:
   - High-chroma saturated pigments (cyan `#00f3ff`, magenta `#ff007f`, electric green `#39ff14`, neon yellow `#ffe600`) contrast intensely against deep charcoal/slate backgrounds.
2. **UV Phosphor Emission Bloom**:
   - High-luminance stroke cores emit soft optical bloom halos into the surrounding dark substrate, reproducing authentic blacklight fluorescent glow.
3. **Subtle Chromatic Aberration Fringe**:
   - High-energy emission edges exhibit gentle prism dispersion (red/blue sub-pixel separation) across lens margins, creating cinematic depth.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/chroma_chalk_neon_engine.py`)
1. Data models:
   - `NeonChromaConfig`: `bloom_radius`, `bloom_intensity`, `chromatic_aberration_px`, `dark_slate_tint`.
2. Optical glow algorithms:
   - `extract_high_luminance_emission(img_bgr, threshold)`: isolates glowing strokes.
   - `apply_neon_uv_bloom(canvas_bgr, config)`: multi-scale blur pyramid additive bloom.
   - `apply_chromatic_aberration(img_bgr, shift_px)`: sub-pixel channel offset.
3. Standalone **Test 36** in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/chroma-chalk-ops.ts`:
   - Data models: `ChromaChalkNeonSettings`, `NeonPalettePreset`.
   - Pure functions:
     - `computeNeonBloomLayer(colorHex, intensity, radiusPx)`
     - `generateChromaticAberrationOffsets(shiftPx)`
     - `generateNeonSvgFilterMarkup(filterId, bloomRadius, intensity, shiftPx)`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/chroma-chalk-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings` & `clipEffectsSchema` with `chromaChalk`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Neon UV Chalk & Luminescence" controls:
    - Enabled toggle.
    - Glow Bloom Radius slider (4px – 30px).
    - Bloom Intensity slider (10% – 100%).
    - Chromatic Aberration slider (0px – 4px).
    - Palette selector: `cyber` | `pastels` | `arcade`.

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (36/36 passing) - **Verified [PASS]**
- Run `npx tsc --noEmit` (clean) - **Verified exit code 0**
- Run `npx vitest run` (99/99 test files passing, 1040/1040 tests passing) - **Verified [PASS]**

## 3. Status: 100% Complete & Verified
- Python engine: `scripts/core/chroma_chalk_neon_engine.py`
- Python Test 36: Passing in `scripts/test_engine.py`
- TypeScript operations: `src/shared/utils/timeline/chroma-chalk-ops.ts`
- Vitest suite: `src/shared/utils/timeline/__tests__/chroma-chalk-ops.test.ts` (3/3 passing)
- Schema & Exports: `whiteboard.ts`, `effects.ts`, `src/shared/index.ts`
- UI controls: `SketchPane.tsx` Card 3 with interactive palette presets, bloom radius, emission intensity, chromatic aberration, and dark slate blackboard toggle.
