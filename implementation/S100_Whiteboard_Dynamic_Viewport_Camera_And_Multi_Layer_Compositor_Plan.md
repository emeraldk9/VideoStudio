# Milestone S100: Whiteboard Dynamic Viewport Camera & Multi-Layer Ink Compositor

## 1. Context & Motivation
In professional whiteboard presentations (e.g., RSA Animate, Kurzgesagt-style technical explainers), the camera does not remain statically fixed in wide view while intricate details are being drawn. Instead:
1. **Dynamic Inertial Pen Follower**:
   - The virtual camera dynamically zooms in on active drawing clusters (e.g. 1.25x – 1.8x zoom) and smoothly tracks the moving stylus with physical inertia ($\text{camera}(t) = \text{camera}(t-1) + \alpha \cdot (\text{pen}(t) - \text{camera}(t-1))$).
   - When a visual cluster finishes or an eraser sweep begins, the camera pulls back out to reveal the full picture.
2. **Multi-Layer Depth & Realistic Hand Stylus Drop Shadow**:
   - The drawing hand casts an anisotropic directional drop shadow onto the board surface:
     $$\text{Shadow}(x, y) = \text{HandAlpha}(x - \delta_x, y - \delta_y) \ast G_{\sigma}$$
     where $(\delta_x, \delta_y)$ is derived from the light source elevation and nib height.
   - Separation of layers: Board Background Grid $\to$ Color Underlay / Hatching $\to$ Primary Ink Linework $\to$ Hand Drop Shadow $\to$ Stylus Arm.

Milestone S100 unites these components into a production-grade camera and compositing engine across both Python and VideoStudio.

---

### Objectives:
1. **Python Core Engine (`scripts/core/viewport_camera.py`)**:
   - `InertialFollowerCamera`: Computes smooth window bounding and $(x, y, \text{zoom})$ trajectories tracking pen tips.
   - `MultiLayerCompositor`: Synthesizes dynamic hand drop-shadows with directional lighting angle and Gaussian blur.
   - Verification in `scripts/test_engine.py`: **Test 21**.
2. **VideoStudio Timeline & UI Operations**:
   - `src/shared/utils/timeline/viewport-camera-ops.ts`: Zero-dependency camera trajectory generator with boundary clamping and easing.
   - Schema updates in `WhiteboardSettings` (`whiteboard.ts`) and `clipEffectsSchema` (`effects.ts`):
     ```ts
     cameraFollower?: {
       enabled?: boolean;
       zoom?: number; // 1.0 to 2.5
       smoothness?: number; // 0.1 to 0.95
       showHandShadow?: boolean;
       shadowAngleDeg?: number;
     }
     ```
   - Expose Camera Follower & Hand Shadow controls in `SketchPane.tsx`.
   - Unit tests in `src/shared/utils/timeline/__tests__/viewport-camera-ops.test.ts`.
3. **Verification**:
   - All 21/21 Python engine tests passing.
   - All 84/84 VideoStudio test files passing with 0 TypeScript errors.

---

## 2. Architecture & Design

### Phase 1: Python Engine Implementation (`scripts/core/viewport_camera.py`)
1. Camera motion equation:
   $$\vec{c}_{t} = \vec{c}_{t-1} + (1 - \lambda) \cdot (\vec{p}_{\text{target}} - \vec{c}_{t-1})$$
   where $\lambda \in [0.70, 0.95]$ provides natural mass and prevents jerky jitter.
2. Viewport clamping:
   Prevents camera viewport from sliding outside the master $W \times H$ canvas boundaries.
3. Hand shadow synthesis:
   Applies directional offset $(d \cdot \cos\theta, d \cdot \sin\theta)$ with exponential distance falloff.
4. Standalone Test 21 in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/viewport-camera-ops.ts`:
   - `calculateFollowerCameraTrajectory(penTrajectory, options)`
   - `generateHandShadowParams(lightAngleDeg, elevationPx)`
2. Add `cameraFollower` to `WhiteboardSettings` and `clipEffectsSchema`.
3. Unit test suite: `src/shared/utils/timeline/__tests__/viewport-camera-ops.test.ts`.

### Phase 3: VideoStudio UI Controls in `SketchPane.tsx`
- Add "Dynamic Camera Follower & Stylus Shadow" toggle, zoom slider, and light angle control in Card 3.

### Phase 4: Full Validation & Test Suite
- [x] Run `test_engine.py` (21/21 tests passing).
- [x] Run `npx tsc --noEmit` (clean 0 errors).
- [x] Run `npm test` across all 84 test files (988/988 tests passing).

---

## 3. Execution Status: 100% Complete & Verified
- **Python Whiteboard Engine**: `scripts/core/viewport_camera.py` with `InertialFollowerCamera`, `CameraState`, and `MultiLayerCompositor`. Verified with Test 21 in `scripts/test_engine.py` (**21/21 passing**).
- **TypeScript Operations**: `src/shared/utils/timeline/viewport-camera-ops.ts` built with zero external dependencies, providing `clampCameraCenter`, `calculateFollowerCameraTrajectory`, and `calculateHandShadowOffset`. Exported via `src/shared/index.ts`.
- **Unit Tests**: `src/shared/utils/timeline/__tests__/viewport-camera-ops.test.ts` (**3/3 passing**).
- **Data Schemas**: `cameraFollower` added to `WhiteboardSettings` in `whiteboard.ts` and `clipEffectsSchema` in `effects.ts`.
- **UI Integration**: Inertial Camera Follower and Hand Drop Shadow controls integrated into Card 3 of `SketchPane.tsx`.
- **Regression Suite**: 84/84 test files, 988/988 unit tests passing cleanly with 0 TypeScript compiler errors.

