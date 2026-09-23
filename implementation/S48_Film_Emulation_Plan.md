# Step S48: Film Grain, Analog Halation & Mechanical Gate Weave Emulation Engine

## Overview & Background
In cinematic post-production and film emulation (such as Dehancer Pro, FilmConvert Nitrate, and DaVinci Resolve Studio Film Grain & Halation tools), achieving an authentic analog celluloid aesthetic requires three interdependent physical and photochemical components:

1. **Photochemical Silver Halide Film Grain**:
   - Simulates physical emulsion grain structures with customizable grain size, roughness, intensity, and chromatic color dye cloud vs. monochromatic silver halide clumping.
2. **Analog Halation (Red Highlight Bleed)**:
   - Replicates light penetrating through emulsion layers, reflecting off the anti-halation backing, and scattering back into the red-sensitive emulsion layer.
   - Generates warm red/orange glows along high-contrast specular edges with configurable threshold, spread radius, intensity, and hue warmth shift.
3. **Mechanical Gate Weave & Projector Flutter**:
   - Simulates the physical movement of celluloid film passing through camera gate sprockets and projector mechanisms.
   - Compound multi-frequency sinusoidal oscillation plus deterministic frame-consistent pseudo-random micro-jitter.
4. **Curated Physical Stock Presets**:
   - `Kodak Vision3 500T (35mm)`: Modern Hollywood feature stock with fine organic grain, rich red highlight halation, and subtle gate weave.
   - `Kodak Tri-X 400 (B&W)`: Legendary gritty black & white stock with high-contrast silver halide grain, zero halation, and organic weave.
   - `Fuji Eterna 250D`: Soft pastel cinematic palette with chromatic dye cloud grain, delicate peach halation, and stable registration.
   - `Vintage 16mm Documentary`: 1970s reversal stock with prominent grainy texture, strong vermilion halation on tungsten light, and lively projector flutter.
   - `Super 8mm Home Movie`: Heavy coarse grain, broad halation bleeding across highlights, and rhythmic hand-cranked gate weave.
5. **Live Preview & FFmpeg Export Pipeline**:
   - Live hardware-accelerated CSS/SVG filter integration in [`TimelinePreview.tsx`](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-preview/ui/TimelinePreview.tsx) (`drop-shadow` halation, `contrast`/`brightness` grain simulation, and `translate3d` gate weave).
   - FFmpeg filter serialization in [`film-emulation-ops.ts`](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/shared/utils/timeline/film-emulation-ops.ts) emitting `noise=alls=...:allf=...` and `colorbalance` chains for export rendering.

---

## Architectural Changes

### 1. Operations Library (`src/shared/utils/timeline/film-emulation-ops.ts`)
- `FilmGrainSettings`: `{ enabled, intensity, size, chromatic, roughness }`.
- `HalationSettings`: `{ enabled, threshold, radiusPx, intensity, hueShiftDeg }`.
- `GateWeaveSettings`: `{ enabled, amplitudeX, amplitudeY, speedHz, jitterPct }`.
- `FilmEmulationSettings`: Unified configuration combining grain, halation, gate weave, and stock preset key.
- `DEFAULT_FILM_EMULATION_SETTINGS`: Sensible defaults with master switch bypassed.
- `FILM_EMULATION_PRESETS`: 5 physical stock presets.
- `calculateGateWeaveOffset(frame, fps, settings)`: Evaluates $(dx, dy)$ gate weave translation for any frame.
- `buildCssFilmEmulationStyle(settings, frame, fps)`: Generates CSS properties for 60fps canvas preview.
- `buildFfmpegFilmEmulationFilter(settings)`: Emits frame-accurate FFmpeg filter strings for export concatenation.

### 2. Effects Model & Schema (`src/shared/utils/timeline/effects.ts`)
- Added `filmEmulation?: FilmEmulationSettings` to `ClipEffects`.
- Validated via `clipEffectsSchema.filmEmulation` in Zod.
- Integrated into `buildColorFilterChain` and `buildCssFilter`.

### 3. Shared Exports (`src/shared/index.ts`)
- Exported all types and methods from `film-emulation-ops`.

### 4. Live Monitor Preview (`src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`)
- Integrated `buildCssFilmEmulationStyle` into `overlayStyle` for all multi-track clips, applying real-time halation glow, grain tone, and gate weave motion.

### 5. Inspector UI Suite (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Rendered "Film Emulation (Grain, Halation & Weave)" section under the Video, Color, and Basic tabs.
- Added master switch, physical stock preset chips, grain controls, halation sliders, and gate weave knobs.

---

## Verification & Test Results
- **Unit Tests**: `src/shared/utils/timeline/__tests__/film-emulation-ops.test.ts` (12 dedicated tests verifying presets, gate weave calculations, CSS styles, and FFmpeg filter emission).
- **Vitest Full Test Suite**: 42 test files passed, 482 tests passed (100% pass rate).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Builds**: Clean compilation of both `vite.renderer.config.ts` and `vite.main.config.ts`.
