# Implementation Plan: Step S28 — Smart Magnetic Snap Guidelines HUD, Ripple Edit (`B`), and Rolling Edit (`N`) Editorial Tools

Elevate timeline trimming and alignment to industry-standard NLE excellence: visual magnetic snapping guidelines with HUD labels, the **Ripple Edit Tool** (`B`), and the **Rolling Edit Tool** (`N`).

## 1. Background & Architecture
- **Magnetic Snap Visuals**: When dragging or trimming, editors need to see what they are snapping to. A vertical cyan guideline across lanes with a floating label (`Playhead`, `Marker: Review`, `In Point`, `Out Point`, `Clip Edge`) eliminates guesswork.
- **In/Out Snap Targets**: Incorporating `inPointFrame` and `outPointFrame` into `timelineSnapTargets`.
- **Ripple Edit Tool (`B`)**: Trims a clip edge and simultaneously slides all downstream media by the trim delta, maintaining track continuity.
- **Rolling Edit Tool (`N`)**: Drags the cut point between two adjacent clips, modifying the outgoing clip's tail and incoming clip's head symmetrically, maintaining total sequence duration.

## 2. Key Modules & Functions
- **`src/shared/utils/timeline/trim-tools-ops.ts`**:
  - `executeRippleTrim(clips, tracks, clipId, edge, deltaFrames)`
  - `executeRollingEdit(clips, tracks, junctionFrame, deltaFrames)`
  - `findJunctionAtFrame(clips, track, frame)`
- **`src/shared/utils/timeline/layout.ts`**:
  - Extended `timelineSnapTargets` with In/Out points.
  - `snapFrameWithMeta(frame, targetsWithMeta, toleranceFrames)`
- **`useTimelineDrag.ts` & `TimelinePanel.tsx`**:
  - `activeSnapGuide: { frame: number; type: string; label?: string } | null`
  - Visual magnetic guideline overlay and floating badge.
- **`TimelineToolbar.tsx` & `TimelineScreen.tsx`**:
  - Added `Ripple Edit (B)` and `Rolling Edit (N)` tools to `TOOLS` array.

## 3. Verification Plan
- Unit tests in `trim-tools-ops.test.ts`.
- Full test pass (`npm test`).
- Zero typecheck errors (`npm run typecheck`).
- Successful production build.
