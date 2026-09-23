# S39: Video Masking, Shape Cropping & Feathering Engine (Rectangle, Circle/Ellipse, Split Screen, Filmstrip Letterbox, Heart, Star, Corner Radius, Feathering & Invert)

## Executive Overview
Step S39 introduces an end-to-end Video Masking, Shape Cropping & Feathering Engine into VideoStudio. Editors can now shape, crop, and mask any video, image, or graphic layer using parametric geometric shapes (Rectangle, Circle/Ellipse, Split Screen, Cinematic Letterbox, Heart, Star) with adjustable corner radius, soft edge feathering via Gaussian blur, rotation, and mask inversion.

---

## Architecture & Mathematical Foundations

### 1. Shape Parameterization & Normalized Geometry
A mask is defined in normalized clip space $(x, y) \in [0.0, 1.0]$:
- **Center**: $(c_x, c_y) \in [0.0, 1.0]$.
- **Dimensions**: $w, h \in [0.05, 1.0]$.
- **Corner Radius**: $r \in [0, 100\text{px}]$ (for rectangular shapes).
- **Feather**: $f \in [0, 100\text{px}]$ soft edge blur radius.
- **Rotation**: $\theta \in [-180^\circ, +180^\circ]$.
- **Invert**: Boolean toggle to reverse the visible and cut-out regions.

### 2. Dual-Engine Preview (CSS clip-path + SVG Feathered Mask)
1. **Sharp Edges ($f = 0$)**:
   - `buildCssClipPath` generates standard CSS `clip-path`:
     - **Rectangle**: `inset(top% right% bottom% left% round radiusPx)`
     - **Circle / Ellipse**: `ellipse(rx% ry% at cx% cy%)`
     - **Split Screen**: `polygon(0% 0%, split% 0%, split% 100%, 0% 100%)`
     - **Cinematic Letterbox**: `inset(barHeight% 0% barHeight% 0%)`
     - **Star / Heart**: Multi-vertex normalized `polygon(...)`
   - Zero DOM overhead and full hardware GPU acceleration.
2. **Feathered Soft Edges ($f > 0$)**:
   - `buildSvgMaskData` produces dynamic SVG `<mask id="mask-...">` elements with embedded `<feGaussianBlur stdDeviation={f / 2}>`.
   - Applied via CSS `mask: url(#mask-...)` and `-webkit-mask: url(#mask-...)` for smooth photographic edge roll-off.
   - For inverted masks, the base rectangle is white and the shape is black, seamlessly punching out the interior.

### 3. FFmpeg Offline Filter Generation
- **Rectangular Box Crop**: `crop=w:h:x:y` using frame pixel dimensions.
- **Cinematic Letterbox**: Top and bottom filled matte bars via `drawbox=x=0:y=0:w=iw:h=barH:color=black@1:t=fill,drawbox=x=0:y=ih-barH:w=iw:h=barH:color=black@1:t=fill`.
- **Split Screen**: Split width crop `crop=splitW:ih:0:0`.

---

## Components Implemented

### 1. Pure Arithmetic & Geometry Engine (`src/shared/utils/timeline/mask-ops.ts`)
- `MaskShapeType`, `ClipMaskSettings`, `MaskShapeDefinition`.
- `MASK_SHAPES`: 7 shape definitions with labels, descriptions, and Material Icons.
- `MASK_PRESETS`: `rectangle`, `rounded_rect`, `circle`, `split_vertical`, `split_horizontal`, `cinematic_235`, `heart`, `star`.
- `buildCssClipPath(settings)`: Mathematical CSS clip-path generator.
- `buildSvgMaskData(settings, clipId)`: Generates SVG mask and Gaussian blur parameters.
- `buildFfmpegMaskFilter(settings, width, height)`: FFmpeg crop and drawbox filter generator.

### 2. Schema & Shared Root Integration (`effects.ts`, `index.ts`)
- Added `mask?: ClipMaskSettings` to `ClipEffects` interface and Zod validation schema.
- Re-exported all mask types and utilities from `src/shared/index.ts`.

### 3. Real-Time Timeline Preview (`TimelinePreview.tsx`)
- In `overlayStyle(placed)`:
  - Dynamically evaluates `clipPath` for sharp masks.
  - Dynamically attaches `mask: url(#mask-${placed.clip.id})` for feathered masks.
- Dynamic SVG `<mask id={`mask-${p.clip.id}`}>` injected into the preview SVG `<defs>` block with `<feGaussianBlur>` for smooth real-time feathering.

### 4. Clip Inspector Mask UI (`ClipInspector.tsx`)
- Added **Mask & Shape Crop** section in the Video and Basic tabs:
  - Master on/off toggle switch.
  - 3-column grid of shape selector buttons with active accent highlighting.
  - Studio presets toolbar.
  - Width and Height percentage sliders.
  - Center X and Center Y position sliders.
  - Corner Radius slider (for rectangle masks).
  - Feather (Softness) slider (0 to 50px).
  - Invert Mask toggle button and Reset Mask action.

---

## Verification & Testing Results

| Test Suite / Build Step | Result |
| :--- | :--- |
| **Mask Ops Test Suite** (`mask-ops.test.ts`) | **15 / 15 tests passed** |
| **Full Vitest Test Suite** (`npm test`) | **33 / 33 test files passed (373 / 373 tests, 100%)** |
| **TypeScript Typecheck** (`tsc --noEmit`) | **0 errors (Exit Code 0)** |
| **Vite Renderer Production Build** (`vite.renderer.config.ts`) | **Built in 9.39s (Exit Code 0)** |
| **Vite Main Production Build** (`vite.main.config.ts`) | **Built in 8.43s (Exit Code 0)** |
