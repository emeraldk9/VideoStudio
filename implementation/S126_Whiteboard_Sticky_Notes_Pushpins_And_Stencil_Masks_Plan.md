# Milestone S126: Whiteboard Sticky Notes, Board Magnets & Paper Stencil Masking

## 1. Context & Motivation
Modern whiteboard presentations and agile visual brainstorming (Miro, FigJam, Lean Canvas, classroom instruction) extensively utilize sticky notes, paper cards pinned with magnets/pushpins, and stencil cutouts:
1. **Procedural Sticky Notes & Index Cards**:
   - Square or rectangular paper notes in classic stationery tones (Canary Yellow, Pastel Pink, Soft Cyan, Mint Green, Coral Orange).
   - Dynamic corner peeling curvature ($k_{\text{peel}} \in [0, 1]$) casting non-uniform soft contact and ambient occlusion shadows beneath the lifted corner.
2. **Board Magnets & Pushpins**:
   - Optional circular ferrite magnets or pushpin tack anchors holding notes to the whiteboard, casting micro-specular glints and directional pin shadows.
3. **Paper Stencil Masking (Aperture Negative Space Drawing)**:
   - Stencil polygons (e.g., speech bubble, circular spotlight aperture, rounded card) that clip or mask drawing strokes, allowing selective reveal or framed linework.

---

## 2. Architecture & Design

### Phase 1: Python Core Engine (`scripts/core/sticky_note_stencil_engine.py`)
1. Data structures:
   - `StickyNoteConfig`:
     - `enabled: bool = True`
     - `color_preset: str = 'canary'` # 'canary' | 'pink' | 'cyan' | 'mint' | 'orange'
     - `custom_color_hex: Optional[str] = None`
     - `position: Tuple[float, float] = (150.0, 150.0)` # x, y center or top-left
     - `size: Tuple[float, float] = (240.0, 240.0)` # width, height
     - `rotation_deg: float = -3.5` # natural hand-placed tilt
     - `peel_corner: str = 'bottom-right'` # 'bottom-right' | 'bottom-left' | 'top-right' | 'none'
     - `peel_elevation_px: float = 12.0`
     - `pin_style: str = 'magnet'` # 'magnet' | 'pushpin' | 'tape' | 'none'
     - `pin_color_bgr: Tuple[int, int, int] = (40, 40, 220)` # vibrant red magnet
   - `StencilMaskConfig`:
     - `enabled: bool = False`
     - `shape: str = 'rectangle'` # 'rectangle' | 'circle' | 'speech_bubble'
     - `invert_mask: bool = False`
2. Core algorithms:
   - `resolve_sticky_color_bgr(preset, custom_hex)`: Returns BGR tuple for sticky note.
   - `render_sticky_note_substrate(canvas, note_config)`:
     - Calculates rotated bounding quad.
     - Projects peel corner displacement with non-uniform ambient occlusion shadow.
     - Blends note surface and renders magnet/pushpin anchor.
   - `clip_stroke_to_stencil(points, stencil_polygon, invert=False)`:
     - Point-in-polygon clipping separating interior segments from exterior segments.
3. Standalone **Test 47** in `scripts/test_engine.py`:
   - Validates sticky note quad rotation, corner peel shadow gradient, and polygon stencil clipping.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/sticky-stencil-ops.ts`:
   - Interfaces: `StickyNoteSettings`, `StencilMaskSettings`, `Point2D`.
   - Pure functions:
     - `getStickyNoteColor(preset: string, customHex?: string): string`
     - `computeNoteTransform(x: number, y: number, width: number, height: number, rotDeg: number): string`
     - `generateStickyNoteSvg(settings: StickyNoteSettings): string`
     - `isPointInsidePolygon(point: Point2D, polygon: Point2D[]): boolean`
     - `clipPolylineToStencil(points: Point2D[], stencilPoly: Point2D[], invert?: boolean): Point2D[][]`
2. Unit tests:
   - `src/shared/utils/timeline/__tests__/sticky-stencil-ops.test.ts`.
3. Schema & Exports:
   - Extend `WhiteboardSettings.stickyNote` and `WhiteboardSettings.stencilMask` in `src/shared/utils/timeline/whiteboard.ts`.
   - Extend `clipEffectsSchema.whiteboard.stickyNote` and `stencilMask` in `src/shared/utils/timeline/effects.ts`.
   - Export in `src/shared/index.ts`.

### Phase 3: VideoStudio UI Integration
- In `SketchPane.tsx` Card 3:
  - Add "Whiteboard Sticky Notes & Stencil Masking" section:
    - Enabled toggle for Sticky Note.
    - Color preset selector (`Canary`, `Pink`, `Cyan`, `Mint`, `Orange`).
    - Note Tilt Rotation slider (-15° to +15°).
    - Corner Peel Elevation slider (0 to 30px).
    - Anchor Pin Style segmented control (`Magnet`, `Pushpin`, `Tape`, `None`).
    - Stencil Mask enabled toggle & Shape selector (`Rectangle`, `Circle`, `Speech Bubble`).

### Phase 4: Full Validation & Test Suite
- Run `test_engine.py` (ensure 47/47 passing).
- Run `npx tsc --noEmit` (clean exit 0).
- Run `npx vitest run` (ensure 110/110 test files passing, 1,084+ tests).

---

## 3. Verification & Results (100% COMPLETE)
- **Python Engine (`scripts/core/sticky_note_stencil_engine.py`)**:
  - Validated stationery color presets (`canary`, `pink`, `cyan`, `mint`, `orange`).
  - Validated rotated bounding quad computation with tilt angle.
  - Validated ray-casting polygon containment and polyline stencil clipping (inner vs negative space).
  - Validated sticky note canvas rasterization with corner peel drop shadow and magnet pin.
  - Standalone Test 47 passing in `scripts/test_engine.py` (**47/47 Python tests passing**).
- **VideoStudio Timeline & UI Operations (`src/shared/utils/timeline/sticky-stencil-ops.ts`)**:
  - `getStickyNoteColor`, `computeRotatedQuad`, `isPointInsideStencilPolygon`, `clipPolylineToStencil`, and `generateStickyNoteSvg` implemented and tested.
  - Test suite `sticky-stencil-ops.test.ts` passing (**5/5 tests passing**).
- **TypeScript & Vitest Validation**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npx vitest run` passed (**110/110 test files, 1,084/1,084 tests passing**).

