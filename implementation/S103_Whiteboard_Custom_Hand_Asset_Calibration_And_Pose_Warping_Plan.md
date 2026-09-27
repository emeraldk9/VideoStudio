# Milestone S103: Whiteboard Custom Hand Asset Calibration & Dynamic Pose Warping Engine

## 1. Context & Motivation
While built-in styluses (`pen`, `marker`, `pencil`, `chalk`) provide solid defaults, high-end commercial whiteboard productions require:
1. **Custom Hand & Stylus Sprite Import**:
   - Support for custom transparent PNG/WebP sprites (e.g. branded mascot hands, robotic styluses, tablet styluses, or photo-realistic creator arms).
2. **Contact Anchor & Invariant Pen-Tip Pivot**:
   - Accurate calibration of the pen tip contact coordinate $(x_{\text{nib}}, y_{\text{nib}})$ as a fraction of the sprite dimensions.
   - When the hand sprite rotates or tilts, the pen tip must remain strictly invariant in screen space:
     $$\mathbf{M}_{\text{world}} = \mathbf{T}(p_{\text{pen}}) \cdot \mathbf{R}(\theta) \cdot \mathbf{T}(-p_{\text{nib}})$$
3. **Dynamic Forearm Directional Tilt & Perspective Velocity Warping**:
   - In real-life drawing, an artist's wrist and forearm tilt in response to stroke direction (pulling down vs. pushing up).
   - Simulating subtle rotational leaning ($\Delta \theta = k_{\text{tilt}} \cdot \sin(\theta_{\text{stroke}} - \theta_{\text{rest}})$) creates organic vitality and prevents rigid mannequin-like sliding.

Milestone S103 introduces custom hand asset calibration and dynamic pose warping across both repositories.

---

### Objectives:
1. **Python Core Engine (`scripts/core/hand_pose_engine.py`)**:
   - `HandCalibration`: Stores sprite dimensions, nib anchor, wrist anchor, and rest angle.
   - `compute_dynamic_hand_pose(stroke_tangent, calibration, tilt_intensity)`: Calculates world transform matrix keeping nib anchored.
   - `render_hand_at_pose(canvas, hand_rgba, pose, screen_nib_xy)`: Affine warps and alpha-composites hand onto canvas.
   - Verification in `scripts/test_engine.py`: **Test 24** (verifies nib-point anchor invariance under full $360^\circ$ rotation).
2. **VideoStudio Timeline & UI Operations**:
   - `src/shared/utils/timeline/hand-pose-ops.ts`: Zero-dependency TypeScript module for nib-anchored 2D affine transforms and dynamic tilt angles.
   - Update `WhiteboardSettings` (`whiteboard.ts`) and `clipEffectsSchema` (`effects.ts`) with:
     ```ts
     customHand?: {
       assetUri?: string;
       nibAnchorPct?: { x: number; y: number };
       wristAnchorPct?: { x: number; y: number };
       dynamicTilt?: boolean;
       tiltIntensity?: number;
     }
     ```
   - Add Custom Stylus Calibration & Dynamic Tilt controls in Card 3 of `SketchPane.tsx`.
   - Unit tests: `src/shared/utils/timeline/__tests__/hand-pose-ops.test.ts`.
3. **Verification**:
   - All 24/24 Python engine tests passing.
   - All 87/87 VideoStudio test files passing with clean `tsc --noEmit`.

---

## 2. Architecture & Design

### Phase 1: Python Engine Implementation (`scripts/core/hand_pose_engine.py`)
1. Anchor matrix formula:
   Given nib anchor in sprite coordinates $(x_0, y_0)$ and target canvas position $(X, Y)$:
   $$\begin{bmatrix} x' \\ y' \\ 1 \end{bmatrix} = \begin{bmatrix} \cos\theta & -\sin\theta & X - x_0\cos\theta + y_0\sin\theta \\ \sin\theta & \cos\theta & Y - x_0\sin\theta - y_0\cos\theta \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$$
2. Dynamic tilt calculation:
   $$\theta_t = \theta_{\text{rest}} + k_{\text{tilt}} \cdot \text{clamp}\left(\sin(\theta_{\text{vel}} - \theta_{\text{rest}}), -0.35, 0.35\right)$$
3. Add Test 24 to `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Schema
1. `src/shared/utils/timeline/hand-pose-ops.ts`:
   - `computeNibAnchoredTransform`
   - `calculateDynamicHandTilt`
2. Update `WhiteboardSettings` and `clipEffectsSchema`.
3. Unit tests: `src/shared/utils/timeline/__tests__/hand-pose-ops.test.ts`.

### Phase 3: VideoStudio UI in `SketchPane.tsx`
- Add Custom Hand Stylus Calibration & Dynamic Tilt controls in Card 3.

### Phase 4: Full Validation & Test Suite
- [x] Run `test_engine.py` (24/24 tests passing).
- [x] Run `npx tsc --noEmit` (clean 0 errors).
- [x] Run `npm test` across all 87 test files (996/996 tests passing).

---

## 3. Execution Status: 100% Complete & Verified
- **Python Whiteboard Engine**: `scripts/core/hand_pose_engine.py` with `HandCalibration`, `compute_nib_anchored_affine`, `calculate_dynamic_hand_tilt`, and `render_hand_sprite`. Verified with Test 24 in `scripts/test_engine.py` (**24/24 passing**).
- **TypeScript Operations**: `src/shared/utils/timeline/hand-pose-ops.ts` built with zero external dependencies, providing `computeNibAnchoredTransform`, `applyAffineToPoint`, and `calculateDynamicHandTilt`. Exported via `src/shared/index.ts`.
- **Unit Tests**: `src/shared/utils/timeline/__tests__/hand-pose-ops.test.ts` (**2/2 passing**).
- **Data Schemas**: `customHand` added to `WhiteboardSettings` in `whiteboard.ts` and `clipEffectsSchema` in `effects.ts`.
- **UI Integration**: Dynamic Stylus Pose & Tilt toggle and Tilt Intensity slider integrated into Card 3 of `SketchPane.tsx`.
- **Regression Suite**: 87/87 test files, 996/996 unit tests passing cleanly with 0 TypeScript compiler errors.

