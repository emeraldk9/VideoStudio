# S32: Keyframe Bezier Curve Graph Editor (Visual Easing Handles, Velocity Curves & Smooth Interpolation)

## Overview
Step S32 delivers an interactive visual 2D Bezier curve graph editor and easing engine for animation keyframes in VideoStudio. Users can visually sculpt value curves over time with interactive tangent handles, switch between value and velocity curve modes, and apply professional easing presets (Linear, Ease In, Ease Out, Smooth Bezier, Hold) for position overlay animation and audio volume ducking.

## Architecture & Math Engine

### 1. High-Precision Cubic Bézier Math (`src/shared/utils/timeline/keyframe-curve-ops.ts`)
- **1D Cubic Bézier Evaluation**:
  $$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$
- **1D Cubic Bézier First Derivative**:
  $$B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t) t (P_2 - P_1) + 3 t^2 (P_3 - P_2)$$
- **Newton-Raphson Monotonic Root Solver (`solveBezierTForX`)**:
  Inverts monotonic time Bézier $X(t) = \text{targetFrame}$ with bracketed bisection fallback to ensure rapid convergence ($< 10^{-6}$ error within 4-6 iterations).
- **Velocity Curve Calculation (`getVelocityAtFrame`)**:
  Instantaneous rate of value change per second:
  $$v(t) = \frac{Y'(t)}{X'(t)} \times \text{fps}$$

### 2. Tangent Handles & Presets
- Extended `KEYFRAME_INTERPOLATIONS` to `['linear', 'hold', 'bezier', 'ease_in', 'ease_out']`.
- Keyframes carry optional `handleIn?: BezierTangentHandle` and `handleOut?: BezierTangentHandle`.
- Presets:
  - `linear`: Direct linear interpolation.
  - `ease_in`: Flat start handle ($0.42 \Delta F$), accelerates into destination.
  - `ease_out`: Decelerates into destination with flat arrival handle ($-0.58 \Delta F$).
  - `bezier`: Smooth S-curve with symmetric handles ($0.35 \Delta F$) or custom user-dragged handles.
  - `hold`: Constant step value until destination frame.

### 3. Dual Pipeline Evaluation (`keyframes.ts`)
- **Real-Time Preview**: `valueAtFrame` continuously evaluates `interpolateKeyframePair` per animation frame.
- **FFmpeg Expression Generator**: `toFfmpegExpression` emits right-folded `if(lt(t, ...))` expressions, subdividing Bézier segments into micro-linear intervals for bit-accurate offline rendering.

### 4. Interactive 2D SVG Graph Editor (`KeyframeCurveEditor.tsx`)
- High-performance responsive SVG graph rendering with background grid lines, playhead indicator, and gradient fill under the active curve.
- Interactive diamond keyframe nodes draggable in time ($X$) and value ($Y$).
- Interactive tangent handle pucks on selected nodes for custom curve sculpting.
- Dual view modes:
  - **Value Curve**: Graphs property value (%) or volume level (dB) over time.
  - **Velocity Curve**: Graphs instantaneous rate of change ($d\text{Value}/dt$) to visualize acceleration and deceleration.
- Easing preset toolbar: One-click application of Linear, Ease In, Ease Out, Smooth Bezier, and Hold.
- Mode toggle in `ClipInspector.tsx`: Switch between interactive Graph View and compact List View.

## Verification
- **Vitest**: 26/26 test suites passed (266 unit tests, 100% pass rate).
- **TypeScript**: `tsc --noEmit` completed with 0 errors.
- **Vite Production Bundling**: `vite.renderer.config.ts` and `vite.main.config.ts` both built cleanly in ~8s.
