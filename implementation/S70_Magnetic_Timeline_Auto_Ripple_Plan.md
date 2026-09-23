# Milestone S70: Magnetic Timeline Auto-Ripple & Smart Collision Avoidance Engine

**Status:** Completed ✅  
**Scope:** Final Cut Pro-style magnetic auto-ripple, smart collision avoidance & bumper snapping, ripple delete with automatic gap collapse, and interactive visual insertion guides during timeline gestures.

---

## 1. Executive Summary & Problem Statement
In modern video editing (Final Cut Pro, DaVinci Resolve, CapCut):
- **Current Behavior in VideoStudio:**
  - Moving a clip on a free track uses simple absolute offset assignment. Dropping a clip on top of an existing clip causes silent overlap/clobbering.
  - Deleting a clip on a free track leaves a dead gap requiring manual gap deletion.
  - Splicing a clip into the timeline requires manually cutting, shifting all downstream clips to the right, pasting, and closing gaps.
- **The Solution (Milestone S70):**
  - **Smart Collision Avoidance & Bumping:** When dragging a clip near an adjacent clip, the clip automatically "bumps" and snags cleanly to the boundary, preventing accidental fractional-frame collisions and overlaps.
  - **Auto-Ripple Insertion:** When dropping a clip in ripple mode (or holding `Shift` or using the Ripple tool), all downstream clips automatically displace rightward by the incoming clip's duration.
  - **Ripple Delete & Auto-Gap Collapse (`Shift+Delete` / `Shift+Backspace`):** Deleting a clip immediately collapses its gap, pulling all subsequent clips leftward.
  - **Visual Ripple Insertion & Collision Guides:** A dynamic insertion guideline with displacement badges (`+48f →`) shows editors the exact ripple impact before releasing the mouse.

---

## 2. Technical Architecture & Component Breakdown

### 2.1 Pure Magnetic & Ripple Operations (`src/shared/utils/timeline/magnetic-ripple-ops.ts`)
- **`detectClipCollisions(clips, targetTrack, clipId, proposedStart, duration)`**:
  Identifies any overlapping clips on the destination track.
- **`resolveCollisionBumping(clips, targetTrack, clipId, proposedStart, duration)`**:
  Calculates magnetic bump snapping to prevent collision overlap, clamping to the nearest free gap or boundary.
- **`applyAutoRippleInsert(clips, track, clipId, insertStart, duration)`**:
  Splices a clip into a track, shifting all clips starting at or after `insertStart` rightward by `duration`.
- **`applyRippleDelete(clips, track, deletedClipId)`**:
  Deletes clip and ripples all subsequent clips on the track to the left by the deleted clip's duration.
- **`calculateRippleShiftPreview(clips, track, clipId, targetFrame, duration)`**:
  Computes live displacement map `{ [clipId]: shiftFrames }` for real-time visual feedback during drag.

### 2.2 Timeline Drag Hook & HUD Integration
- **`useTimelineDrag.ts` & `TimelinePanel.tsx`**:
  - Live preview of displaced clips during drag when Ripple Mode is active or `Shift` is held.
  - Render dynamic insertion indicator line with `→ +{duration}f` badge showing ripple impact.
  - Apply `resolveCollisionBumping` during standard move gestures to eliminate overlapping tracks.
  - Apply `applyAutoRippleInsert` on commit when in ripple mode.
- **Keyboard Shortcuts & Context Menu**:
  - `Shift+Delete` / `Shift+Backspace`: Ripple Delete selected clips and auto-collapse gap.
  - Context menu action: "Ripple Delete (Shift+Del)".

---

## 3. Verification Plan

### Automated Unit Tests
- `src/shared/utils/timeline/__tests__/magnetic-ripple-ops.test.ts`:
  - Collision detection across overlapping, adjacent, and isolated clips.
  - Collision bumping to left and right boundaries without overlap.
  - Auto-ripple insertion with exact frame preservation on downstream clips.
  - Ripple delete and gap collapse across single and multiple clips.
  - Shift preview calculation for live HUD feedback.
- `npm run typecheck`: 0 TypeScript compilation errors.
- `npx vitest run`: 100% test pass rate across all suites.
