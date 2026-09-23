# S5: Timeline Sketch Keyframe In/Out Lane Implementation Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S5_Sketch_Keyframe_Timeline_Lane_Plan.md`  
**Status**: 🟢 Complete & Verified  
**Feature**: Dedicated Timeline Lane for Sketch In/Out Keyframes (Conditional on Spine Image/Video Sketch Status)  

---

## Progress Checklist & Tracker

- [x] **Phase 1: Shared Data Model & In/Out Keyframe Calculation Engine**
  - [x] Extend `WhiteboardSettings` in `src/shared/utils/timeline/whiteboard.ts` to support `inFraction?: number` and `inSeconds?: number` (defaulting to 0) alongside existing `drawFraction` and `drawSeconds`.
  - [x] Implement pure helper functions in `whiteboard.ts`:
    - [x] `resolveWhiteboardInSeconds(settings, durationFrames, fps): number`
    - [x] `resolveWhiteboardOutSeconds(settings, durationFrames, fps): number`
    - [x] `resolveWhiteboardInFrame(settings, durationFrames, fps): number`
    - [x] `resolveWhiteboardOutFrame(settings, durationFrames, fps): number`
    - [x] `whiteboardProgressAtFrame(frame, inFrame, outFrame): number` (supports pre-in delay, in-to-out drawing ramp, post-out hold).
  - [x] Export new helpers in `src/shared/index.ts`.

- [x] **Phase 2: Spine Image and Video Sketch Enablement**
  - [x] Update `SketchPane.tsx` to permit both `still` (image) and `video` clips on the spine:
    - [x] Broaden clip selection check from `clip?.sourceKind === 'still'` to `clip?.sourceKind === 'still' || clip?.sourceKind === 'video'`.
    - [x] Enable sketch toggle, style presets (Sketch, Pencil, Comic), drawing cadence, and timing controls for spine video clips.
    - [x] Add explicit In-point and Out-point keyframe timing controls into the `timing` sub-category of `SketchPane.tsx`.
  - [x] Update `TimelinePreview.tsx` to respect `inFrame` / `inSeconds` delay before commencing the reveal animation.
  - [x] Update `sequence-render-service.ts` to handle whiteboard settings on video clips as well as stills.

- [x] **Phase 3: Interactive Sketch Keyframe Lane Component (`SketchKeyframeLane.tsx`)**
  - [x] Create `src/renderer/features/timeline-edit/ui/SketchKeyframeLane.tsx`:
    - [x] **Sticky Track Header (152px)**:
      - Icon: `draw` (accent-ai color)
      - Label: `Sketch FX` with subtle font styling
      - Active clip badge: pill showing count of clips with active sketches
      - Quick shortcut button to toggle the Sketch inspector pane.
    - [x] **Trough Surface**:
      - Height: 28px (`DEFAULT_CHIP_TRACK_HEIGHT_PX`), aligned with standard timeline grid.
      - Aligned with the timeline zoom level (`pixelsPerFrame`, `pixelsPerSecond`, `fps`).
    - [x] **Keyframe Representation per Spine Clip**:
      - **In Keyframe (◆)**: Amber/Gold diamond handle at `clipStart + inFrames`.
      - **Out Keyframe (◆)**: Cyan/AI-accent diamond handle at `clipStart + outFrames`.
      - **Active Draw Bar**: Styled region connecting In and Out with animated/diagonal hatch styling and pattern glyph.
      - **Hold Span**: Solid subtle accent bar extending from Out keyframe to clip tail.
    - [x] **Interactive Gestures & Dragging**:
      - Drag In Diamond: updates `inFraction` / `inSeconds` with snap-to-frame grid.
      - Drag Out Diamond: updates `drawFraction` / `drawSeconds` with snap-to-frame grid.
      - Single Click Keyframe: seeks playhead (`setPlayhead`) to exact keyframe frame.
      - Double Click: selects spine clip and opens Sketch media pane.
      - Tooltip on Hover: timecode, frame index, duration, and progress percentage.

- [x] **Phase 4: Timeline Panel Integration & Conditional Visibility**
  - [x] In `TimelinePanel.tsx`:
    - [x] Compute `hasSpineSketches`:
      ```ts
      const spineTrack = tracks.find((t) => t.id === spineTrackId);
      const spineClips = spineTrack ? clips.filter((c) => c.trackId === spineTrack.id) : [];
      const hasSpineSketches = spineClips.some((c) => Boolean(c.effects?.whiteboard));
      ```
    - [x] Render `<SketchKeyframeLane />` directly below the Spine track row.
    - [x] Ensure lane smoothly mounts/unmounts or collapses with zero layout jump.
    - [x] Ensure playhead scrubbing, split blade, ripple delete, and timeline zoom track the sketch lane synchronously.

- [x] **Phase 5: Full Timeline JSON Export/Import & Data Persistence**
  - [x] Verify `timeline-setup-export.ts` serializes `inFraction` and `inSeconds` in `clip.effects.whiteboard`.
  - [x] Verify `timeline-setup-import.ts` parses and validates `inFraction` and `inSeconds`.
  - [x] Ensure 100% backward compatibility with existing project files and v1/v2 schema.

- [x] **Phase 6: Verification & Automated Tests**
  - [x] Run `npm run typecheck` to confirm 0 TypeScript errors.
  - [x] Unit tests for `resolveWhiteboardInFrame`, `resolveWhiteboardOutFrame`, and `whiteboardProgressAtFrame`.
  - [x] Unit tests for `SketchKeyframeLane` layout math and keyframe dragging boundaries (`0 <= inFrame < outFrame <= durationFrames`).
  - [x] Verify manual workflow: enable sketch on image/video spine clip -> lane appears -> drag In/Out keyframes -> preview updates -> disable sketch -> lane cleanly hides.

---

## 1. Architectural Design & Proposed Solution

### 1.1 The Requirement
The user requested:
> "Introduce the new lane in the timeline editor to show the key frame in out for the sketches. It is visible only when sketches is enable for image/video spine."

### 1.2 Key Challenges & Best Solutions

| Aspect | Challenge | Best Solution |
| :--- | :--- | :--- |
| **Visibility Rule** | Must only be visible when sketches are enabled for image/video on the spine. | Compute `hasSpineSketches = spineClips.some(c => Boolean(c.effects?.whiteboard))` dynamically in `TimelinePanel`. When false, the lane is completely hidden (0px / unrendered), keeping the timeline completely clean. When true, it displays directly beneath the spine track. |
| **In / Out Keyframes** | Whiteboard previously only tracked duration (`drawFraction`/`drawSeconds`) starting at frame 0. | Add `inFraction` (0..1, default 0) to `WhiteboardSettings`. The "In" keyframe marks when sketch reveal starts; the "Out" keyframe marks when sketch finishes drawing and transitions to full frame hold. |
| **Image & Video Spine** | Existing sketch UI was restricted to `sourceKind === 'still'`. | Extend `SketchPane` and preview/render pipelines to also accept `video` clips on the spine track. A video spine clip can now feature the sketch look (Sketch, Pencil, Comic line-art) and sketch reveal. |
| **NLE Interaction Standards** | Keyframes in NLEs (CapCut, Premiere, DaVinci) need immediate tactile manipulation. | Render precision diamond handles (◆) for In and Out points. Dragging either handle recalculates the exact frame offset, clamps to clip boundaries (`0 <= In < Out <= duration`), snaps to frame grid, and triggers real-time preview sync. |
| **Design Aesthetics** | Timeline lanes must feel cohesive with dark workspace styling. | Header uses sticky 152px gutter with `draw` icon and `DEFAULT_CHIP_TRACK_HEIGHT_PX` (28px). Trough features amber In diamond, cyan Out diamond, hatched active-draw bar, and hold bar. |

---

## 2. Component Breakdown

### 2.1 `src/shared/utils/timeline/whiteboard.ts`
```typescript
export interface WhiteboardSettings {
  pattern: 'serpentine' | 'wipe' | 'zones' | 'trace';
  rows: number;
  /** S279 — share of the clip spent drawing (0.1..1); the rest holds the finished frame. */
  drawFraction?: number;
  drawSeconds?: number;
  /** S5 — fractional start time of drawing (0..drawFraction, default 0). */
  inFraction?: number;
  inSeconds?: number;
  hand: 'pen' | 'marker' | 'none';
  cadenceFps?: number;
  look: 'none' | 'sketch' | 'pencil' | 'comic';
  zones?: WhiteboardZone[];
  trace?: WhiteboardTraceSettings;
}
```

### 2.2 `src/renderer/features/timeline-edit/ui/SketchKeyframeLane.tsx`
Provides:
- **`SketchKeyframeLane`**:
  - Props: `spineTrack`, `spineClips`, `fps`, `pixelsPerSecond`, `widthPx`, `selectedClipIds`.
  - Maps through all spine clips with `clip.effects?.whiteboard`.
  - Computes:
    - `clipStartFrames = item.startFrames`
    - `inFrames = resolveWhiteboardInFrame(settings, clip.durationFrames, fps)`
    - `outFrames = resolveWhiteboardOutFrame(settings, clip.durationFrames, fps)`
    - `leftPx = (clipStartFrames + inFrames) * pixelsPerFrame`
    - `widthPx = (outFrames - inFrames) * pixelsPerFrame`
    - `holdWidthPx = (clip.durationFrames - outFrames) * pixelsPerFrame`
  - Interactive pointer drag listeners on In Diamond and Out Diamond.
  - Updates clip via `patchClip(clip.id, { effects: { ...clip.effects, whiteboard: nextSettings } })`.

### 2.3 `src/renderer/features/timeline-edit/ui/TimelinePanel.tsx`
Conditionally renders `<SketchKeyframeLane />` immediately below the spine `TimelineTrackRow`:
```tsx
{hasSpineSketches && spineTrack && (
  <SketchKeyframeLane
    spineTrack={spineTrack}
    spineClips={spineClips}
    fps={fps}
    pixelsPerSecond={pixelsPerSecond}
    widthPx={widthPx}
    selectedClipIds={selectedClipIds}
  />
)}
```

---

## 3. Verification Plan
1. **TypeScript Typecheck**: `npm run typecheck` (0 errors).
2. **Automated Unit Tests**: Vitest test suite testing keyframe math and bounds.
3. **Manual Verification**:
   - Open studio with stills and videos on spine.
   - Observe that the Sketch Keyframe lane is hidden.
   - Select a still or video clip on Spine, switch to Sketch tab in Media Panel, click "Toggle Whiteboard Reveal".
   - The Sketch Keyframe lane immediately appears below the Spine track.
   - Drag Out diamond left/right -> observe duration change in Sketch pane and preview scrub.
   - Drag In diamond -> observe start delay.
   - Click keyframe -> playhead jumps to that frame.
   - Turn off Sketch -> lane cleanly collapses.
