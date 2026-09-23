# S37: Variable Speed Ramping & Bézier Velocity Curve Engine

## Executive Overview
Step S37 introduces dynamic time-warping curves and variable speed ramping into VideoStudio's timeline engine, preview playback pipeline, clip inspector, and retiming modal. Editors can now transition smoothly from high-speed action rushes to dramatic slow-motion freezes with continuity and smooth Bézier acceleration curves, or apply industry-standard studio retime presets (Hero Ramp, Bullet Time, Montage Flash, Slow In Fast Out, Fast In Slow Out).

---

## Architecture & Mathematical Foundations

### 1. Velocity Curve Model $v(t)$
A speed ramp is defined as a series of key points on normalized timeline time $t \in [0.0, 1.0]$:
$$P_i = (t_i, v_i, \mathbf{h}_{in}, \mathbf{h}_{out})$$
where:
- $t_i \in [0.0, 1.0]$: Normalized timeline position within the clip.
- $v_i \in [0.1, 10.0]$: Velocity multiplier ($1.0\times$ = real-time, $0.2\times$ = 5x slow-motion, $4.0\times$ = 4x fast-forward).
- $\mathbf{h}_{in}, \mathbf{h}_{out}$: Tangent offsets $(\Delta t, \Delta v)$ for cubic Bézier curvature interpolation.

Between consecutive points $P_A$ and $P_B$:
- If tangent handles exist, instantaneous velocity $v(t)$ is evaluated using cubic Bézier polynomials:
  $$v(u) = (1-u)^3 v_A + 3(1-u)^2 u (v_A + \Delta v_{out}) + 3(1-u) u^2 (v_B + \Delta v_{in}) + u^3 v_B$$
  where $u = \frac{t - t_A}{t_B - t_A}$.
- Otherwise, linear interpolation fallback is applied.

### 2. Time-Warping Integration & Source Frame Mapping
To determine which source media frame corresponds to timeline frame $f \in [0, \text{durationFrames}]$:
1. Normalized timeline progress: $t = f / \text{durationFrames}$.
2. Source media progress is the cumulative integral of velocity:
   $$\tau(t) = \int_{0}^{t} v(\tilde{t}) \, d\tilde{t}$$
3. Numerical integration is calculated using the composite trapezoidal rule over precomputed lookup tables (LUTs with 60–100 steps) for sub-millisecond evaluation in continuous 60fps playback loops.
4. Total source media span consumed:
   $$\text{TotalSourceConsumed} = \tau(1) \cdot \text{durationFrames} = \bar{v} \cdot \text{durationFrames}$$
5. Source frame calculation:
   $$\text{sourceFrame}(f) = \text{sourceIn} + \tau(t) \cdot \text{durationFrames}$$
   When rippling is enabled with a fixed source duration:
   $$\text{sourceFrame}(f) = \text{sourceIn} + \frac{\tau(t)}{\tau(1)} \cdot \text{sourceDurationFrames}$$

### 3. Sequence Rippling Calculus
- **Average Velocity**: $\bar{v} = \tau(1) = \int_0^1 v(t) \, dt$.
- **Ramped Timeline Duration**: $\text{duration}_{\text{ramped}} = \text{round}\left(\frac{\text{duration}_{\text{original}}}{\bar{v}}\right)$.
- **Downstream Displacement**: On non-magnetic tracks, subsequent clips are displaced by $\Delta = \text{duration}_{\text{ramped}} - \text{duration}_{\text{original}}$.

---

## Components Implemented

### 1. Pure Arithmetic Engine (`src/shared/utils/timeline/speed-ramp-ops.ts`)
- `SpeedRampPoint`, `SpeedRampSettings`, `SpeedRampPresetKey`.
- `SPEED_RAMP_PRESETS`:
  - `constant` ($1.0\times$)
  - `hero_ramp` ($2.5\times \to 0.3\times \to 2.0\times$)
  - `bullet_time` ($1.0\times \to 3.5\times \to 0.2\times \to 1.0\times$)
  - `montage_flash` (rhythmic beat pulses $3.0\times \leftrightarrow 0.5\times$)
  - `slow_in_fast_out` ($0.4\times \to 3.0\times$)
  - `fast_in_slow_out` ($3.0\times \to 0.3\times$)
- `normalizeSpeedRampPoints(points)`: Chronological sorting and boundary clamping.
- `evaluateSpeedAtNormalizedTime(settings, t)`: Piecewise cubic Bézier velocity evaluation.
- `integrateSpeedRamp(settings, steps)`: Numerical trapezoidal integration with cumulative LUT.
- `calculateRampSourceFrame(settings, frameInClip, durationFrames, sourceDurationFrames)`: Real-time source frame coordinate mapper.
- `calculateRampAverageSpeed(settings)` & `calculateRampedDuration(originalFrames, settings)`.
- `sampleSpeedRampSvgPoints(settings, width, height)`: Coordinate projector for SVG curve rendering.
- `buildFfmpegSpeedRampFilter(settings, durationFrames, fps)`: High-precision FFmpeg `setpts` filter string generator.
- `applyClipSpeedRamp(clips, tracks, clipId, speedRamp)`: Clip retiming and sequence ripple handler.

### 2. Effects Schema Integration (`src/shared/utils/timeline/effects.ts` & `src/shared/index.ts`)
- Added `speedRamp?: SpeedRampSettings` to `ClipEffects` interface and Zod schema validation.
- Exported all speed ramp types and utilities from `src/shared/index.ts`.

### 3. Interactive Retime Graph & Modal (`src/renderer/features/timeline-edit/ui/SpeedModal.tsx`)
- Tabbed mode switch: **Constant Speed** vs. **Speed Curve (Ramping)**.
- Interactive SVG velocity graph:
  - Coordinate grid (0.5x, 1.0x baseline, 2.0x, 3.0x, 4.0x guide lines).
  - Shaded gradient under curve (`url(#speedRampGradient)`).
  - Draggable key points with real-time velocity clamping $[0.1\times, 10.0\times]$.
  - Add point on graph click / double-click.
  - Delete point button for non-anchor points.
  - Tangent smoothing toggle (`Smooth Handles`).
- Preset buttons bar with instant visual preset preview.
- Average Velocity HUD and Duration projection badge.
- Ripple Sequence checkbox for ripple retiming.

### 4. Continuous Playback Engine (`src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`)
- Connected `calculateRampSourceFrame` and `evaluateSpeedAtNormalizedTime` in the playback loop.
- Dynamic `videoRef.current.playbackRate` adaptation clamped to $[0.1, 4.0]$ for smooth browser decoding.
- Dynamic audio `playbackRate` synchronization.

### 5. Clip Inspector Speed HUD (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Speed & Retiming section expanded with Variable Speed Ramp status badge.
- Live mini SVG velocity profile curve embedded directly in the inspector panel.
- Instant "Edit Velocity Curve" modal launcher and reset button.

---

## Verification & Test Results
1. **Vitest Unit Test Suite** (`src/shared/utils/timeline/__tests__/speed-ramp-ops.test.ts`):
   - 17 unit tests passed covering normalization, presets, Bézier interpolation, numerical integration monotonicity, source frame mapping, ripple duration, SVG sampling, FFmpeg filter generation, and clip mutations.
2. **Full Vitest Suite**:
   - **31 test files passed** (338/338 tests, 100% pass rate).
3. **TypeScript Typecheck**:
   - `tsc --noEmit` exited with 0 errors.
4. **Vite Production Builds**:
   - `vite.renderer.config.ts`: Built cleanly in 8.56s (`dist/assets/index-BLWs6b7s.js`).
   - `vite.main.config.ts`: Built cleanly in 8.03s (`dist/assets/index-RembA93W.js`).
