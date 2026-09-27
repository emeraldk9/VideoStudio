# Milestone S98: Intelligent Multi-Path Saliency Clustering & Contour Prioritization Engine

## 1. Context & Motivation
When illustrating complex figures, technical diagrams, or architectural concept art on a whiteboard, human artists naturally establish major structural contours and focal landmarks first before detailing individual components. They also avoid erratic arm jumps by completing all strokes of a single visual entity (e.g. an icon, person, or flowchart block) before transitioning to the next.

### Objectives:
1. **Spatial Proximity & Visual Component Clustering**:
   - Automatically partition hundreds of discrete strokes into cohesive visual sub-assemblies (connected components) based on spatial bounding-box overlap and minimum Euclidean distance between strokes.
2. **Multi-Feature Saliency Scoring**:
   - Rank strokes and clusters by visual prominence:
     $$\text{Saliency}(S) = 0.45 \cdot \frac{\text{length}(S)}{L_{\max}} + 0.35 \cdot \frac{\text{area}(\text{bbox}(S))}{A_{\max}} + 0.20 \cdot \left(1 - \frac{\text{dist}(\text{center}(S), \text{frame\_center})}{D_{\max}}\right)$$
3. **Hierarchical 2-Level Ordering**:
   - Order clusters globally by focal saliency (primary subject $\to$ secondary elements $\to$ background/annotations).
   - Inside each cluster, order strokes greedily with outline-first prioritization, minimizing pen travel distance.
4. **Python Core Engine Implementation (`scripts/core/saliency_clustering.py`)**:
   - Verification in `scripts/test_engine.py` (Test 19).
5. **VideoStudio Timeline & UI Integration**:
   - TypeScript operations in `src/shared/utils/timeline/saliency-clustering-ops.ts`.
   - Update `WhiteboardSettings` and `clipEffectsSchema` with `clusteringMode?: 'none' | 'proximity' | 'saliency' | 'hierarchical'`.
   - UI controls in `src/renderer/features/timeline-media/ui/SketchPane.tsx`.
   - Automated unit tests and verification.

---

## 2. Architecture & Design

### Phase 1: Python Engine Implementation (`scripts/core/saliency_clustering.py`)
1. **Bounding Box & Distance Metrics**:
   - Fast spatial index for strokes.
   - Compute pairwise minimum stroke distance.
2. **Graph Connected Components**:
   - Group strokes with distance $\le \epsilon_{\text{cluster}}$ (default 35 px) into visual clusters.
3. **Saliency Sorting & Intra-Cluster TSP**:
   - Sort clusters by aggregate saliency.
   - Sequence strokes within each cluster using greedy nearest-neighbor with contour bias.
4. **Standalone Verification in `scripts/test_engine.py`**:
   - Add **Test 19**: Test clustering of two distinct spatial objects (e.g., house on left, tree on right), verify no interleaved jumping, and verify outline-first drawing order.

### Phase 2: VideoStudio Operations & Shared Types
1. **`src/shared/utils/timeline/saliency-clustering-ops.ts`**:
   - Zero-dependency TypeScript functions: `computeStrokeBBox`, `clusterStrokesByProximity`, `computeStrokeSaliency`, and `hierarchicalSaliencySort`.
2. **`WhiteboardSettings` & `effects.ts` Schema Extension**:
   - Add `clusteringMode?: 'none' | 'proximity' | 'saliency' | 'hierarchical';` (default `'hierarchical'`).
3. **Unit Tests in `src/shared/utils/timeline/__tests__/saliency-clustering-ops.test.ts`**:
   - Unit tests covering spatial clustering, saliency score calculation, and hierarchical sequencing.

### Phase 3: VideoStudio UI in `SketchPane.tsx`
- Add "Stroke Ordering & Saliency" dropdown in Card 1 trace settings:
  - Options: `Hierarchical Focus` (Recommended), `Entity Proximity`, `Reading Flow`, `Raw Unsorted`.

### Phase 4: Full Validation & Test Suite
- [x] Run `test_engine.py` (19/19 tests passing).
- [x] Run `npx tsc --noEmit` (clean 0 errors).
- [x] Run `npm test` across all 82 test files (982/982 tests passing).

---

## 3. Execution Status: 100% Complete & Verified
- **Python Whiteboard Engine**: `scripts/core/saliency_clustering.py` implemented and verified with Test 19 in `scripts/test_engine.py` (19/19 passing).
- **TypeScript Operations**: `src/shared/utils/timeline/saliency-clustering-ops.ts` built with zero dependencies.
- **Unit Tests**: `src/shared/utils/timeline/__tests__/saliency-clustering-ops.test.ts` (4/4 passing).
- **Data Schemas**: `clusteringMode` added to `WhiteboardSettings` in `whiteboard.ts` and `clipEffectsSchema` in `effects.ts`.
- **UI Controls**: Contour Clustering segmented control integrated into Card 1 of `SketchPane.tsx`.
- **Regression Suite**: 82/82 test files, 982/982 unit tests passing cleanly.
