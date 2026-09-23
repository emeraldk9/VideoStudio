# Step S34: Transform Animation Keyframing (Opacity, Scale & Rotation Bézier Curves with Live Preview Interpolation)

## Executive Summary
Step S34 builds directly upon the Bézier Curve Graph Editor (Step S32) and Real-Time Audio Ducking Pipeline (Step S33) by unlocking multi-property transform animation keyframing across the entire application stack:
1. **Full Keyframe Property Spectrum**: Expanded `KEYFRAME_PROPERTIES` to include `scale`, `opacity`, and `rotation` alongside existing `x`, `y`, and `volume`.
2. **Unified Interpolation & Curve Evaluation**: Real-time evaluation of cubic Bézier curves, ease presets (`ease_in`, `ease_out`, `bezier`), hold steps, and linear ramps for transform channels via `valueAtFrame`.
3. **Multi-Property Visual Curve Graph Editor**: Added dedicated unit metrics, dynamic ranges, and formatting helpers to `KeyframeCurveEditor` (scale `0.1x–2.5x`, opacity `0%–100%`, rotation `-180°..+180°`), enabling fluid interactive tangent-handle manipulation for any transform property.
4. **Live Stage Rendering Interpolation**: Updated `TimelinePreview`'s `overlayStyle` to sample `scale`, `opacity`, and `rotation` on every frame tick, rendering hardware-accelerated animated rotations and opacity fades simultaneously with position curves.
5. **Clip Inspector Dual Mode**: Expanded both Graph View and List View in `ClipInspector` so editors can manage and keyframe scale, opacity, and rotation at the playhead with one click.
6. **Robust Schema & Database Compatibility**: Updated IPC Zod schemas (`sequenceClipSchema`) with handle support and unconstrained finite numeric ranges; maintained seamless SQLite sequence repository schema compliance without requiring database migrations.

---

## Technical Architecture & Implementation

### 1. Keyframe Definition & Typing (`src/shared/utils/timeline/keyframes.ts`)
- Updated `KEYFRAME_PROPERTIES`:
  ```typescript
  export const KEYFRAME_PROPERTIES = ['x', 'y', 'volume', 'scale', 'opacity', 'rotation'] as const;
  export type KeyframeProperty = (typeof KEYFRAME_PROPERTIES)[number];
  ```
- Clip keyframes continue to be stored clip-relative, guaranteeing timeline ripple and trim immutability.
- `toFfmpegExpression` evaluates piecewise ladder segments for any property with time offsets.

### 2. Clip Transform Interface (`src/shared/utils/timeline/effects.ts`)
- Added `rotation?: number` to `ClipTransform`:
  ```typescript
  export interface ClipTransform {
    scale?: number;
    x?: number;
    y?: number;
    opacity?: number;
    rotation?: number;
  }
  ```

### 3. IPC Schema Validation (`src/shared/ipc/ipc-schemas.ts`)
- Relaxed keyframe values from `min(-40).max(40)` to `z.number().finite()` to support arbitrary rotation degrees (`-360°..+360°`) and zoom scales.
- Added optional `handleIn` and `handleOut` (`frameOffset`, `valueOffset`) validation to `sequenceClipSchema`.

### 4. Interactive Bézier Curve Graph Editor (`KeyframeCurveEditor.tsx`)
- Configured dynamic bounds, steps, and units:
  - `scale`: unit `'x'`, min `0.1`, max `2.5`, step `0.05`
  - `opacity`: unit `'%'`, min `0.0`, max `1.0`, step `0.05`
  - `rotation`: unit `'°'`, min `-180`, max `180`, step `1`
- Added `getDefaultPropertyValue` helper for playhead insertion defaults:
  - `scale`: `1.0`
  - `opacity`: `1.0`
  - `rotation`: `0.0`
  - `volume`: `0.0`
  - `x` / `y`: `0.5`
- Added `formatPropertyValue` helper for clean tick markers and inspector readout.

### 5. Live Canvas Preview Interpolation (`TimelinePreview.tsx`)
- `overlayStyle` samples all active transform channels at `frame = playheadFrame - placed.startFrames`:
  ```typescript
  const scaleBox = valueAtFrame(placed.clip.keyframes, 'scale', frame, transform?.scale ?? 1);
  const opacity = valueAtFrame(placed.clip.keyframes, 'opacity', frame, transform?.opacity ?? 1);
  const rotation = valueAtFrame(placed.clip.keyframes, 'rotation', frame, transform?.rotation ?? 0);
  const cx = valueAtFrame(placed.clip.keyframes, 'x', frame, transform?.x ?? 0.5);
  const cy = valueAtFrame(placed.clip.keyframes, 'y', frame, transform?.y ?? 0.5);
  ```
- Applies computed CSS:
  - `width` & `height`: `scaleBox * 100%`
  - `left` & `top`: centered relative to `cx`, `cy`, and `scaleBox`
  - `opacity`: clamped `[0, 1]`
  - `transform`: `rotate(${rotation}deg)`

### 6. Clip Inspector Integration (`ClipInspector.tsx`)
- Exposed all 5 visual properties (`x`, `y`, `scale`, `opacity`, `rotation`) in `animationProperties` for overlay clips.
- Provided dual-view editing:
  - **Graph View**: Full interactive SVG curve editor with tangent handles and velocity profiles.
  - **List View**: Dedicated sections with `+ Add Key` buttons and list rows for Position, Scale, Opacity, and Rotation.

---

## Verification & Validation

### Automated Tests
- Created test suite: `src/shared/utils/timeline/__tests__/keyframes-transform.test.ts` (17 tests covering fallbacks, boundaries, linear interpolation, cubic Bézier ease-in/out, hold steps, multi-revolution rotation, FFmpeg expressions, trim shift/split, and IPC schemas).
- Ran full test suite across entire project: **28 test files passed, 294/294 tests passed (100% pass rate)**.
- Ran typecheck: `tsc --noEmit` exited with **0 errors**.
- Ran production builds: Both `vite.renderer.config.ts` and `vite.main.config.ts` completed with clean builds in ~8.4s–8.9s.
