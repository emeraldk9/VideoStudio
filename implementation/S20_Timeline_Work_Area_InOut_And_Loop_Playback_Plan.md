# Step S20: Timeline Work Area In/Out Points (Mark In / Mark Out) & Loop Playback System

## Status: Complete

## Executive Summary
In professional NLEs (Premiere Pro, DaVinci Resolve, Final Cut Pro), the Work Area In/Out marking system and Loop Playback are essential for precision editorial review and export slicing:
1. **Mark In (`I`) & Mark Out (`O`) Points**:
   - Allows editors to mark the active working range directly at the current playhead frame.
   - `Alt+X`: Clears In/Out points. `Alt+I`: Clears In point. `Alt+O`: Clears Out point.
   - Renders visual in/out bracket handles (`[` and `]`) and a highlighted work area span along the timeline ruler in `TimelinePanel`.
   - Casts vertical dashed guideline borders over the entire lane canvas.
   - Double-clicking an In or Out bracket instantly clears that point.
2. **Loop Playback (`looping`)**:
   - When Loop mode is enabled, reaching the Out-Point (or timeline end) automatically wraps the transport playhead back to the In-Point (or 0) without stopping playback.
   - Reverse shuttle (`J`) automatically wraps back to the Out-Point when hitting the In-Point floor.
   - Dedicated Loop toggle button (`repeat` icon) in `TimelinePreview` transport bar with active styling.
   - `Ctrl+L` / `Cmd+L` shortcut toggles Loop playback from anywhere on the timeline.
3. **Export Range Selection in `ExportModal.tsx`**:
   - When an In/Out range is active, `ExportModal` lets users choose between exporting the "Entire Cut" or the "Work Area".
   - Dynamically recomputes the duration and estimated file size based on the active selection.
4. **State Management (`sequenceStore.ts`)**:
   - `inPointFrame: number | null`
   - `outPointFrame: number | null`
   - `looping: boolean`
   - Actions: `setInPoint(frame)`, `setOutPoint(frame)`, `clearInOutPoints()`, `setLooping(looping)`, `toggleLooping()`.

---

## Technical Architecture & File Modifications

### 1. Pure Operations Utility (`src/shared/utils/timeline/in-out-ops.ts`)
- `computeEffectiveWorkArea(range, durationFrames)`: calculates effective start frame, end frame, duration frames, and custom flag.
- `clampInPoint(frame, currentOut, durationFrames)`: clamps frame within sequence bounds; clears outPoint if inPoint >= outPoint.
- `clampOutPoint(frame, currentIn, durationFrames)`: clamps frame within sequence bounds; clears inPoint if outPoint <= inPoint.
- `stepLoopPlayback(currentFrame, playbackRate, workArea, looping)`: computes next frame and determines if playback should terminate or wrap.

### 2. Sequence Store (`src/renderer/entities/sequence/model/sequenceStore.ts`)
- Added `inPointFrame: number | null`, `outPointFrame: number | null`, and `looping: boolean` to `SequenceState`.
- Implemented `setInPoint`, `setOutPoint`, `clearInOutPoints`, `setLooping`, and `toggleLooping`.
- Initialized state to `null` / `false` and cleanly reset state in `openSequence`, `createSequence`, and `closeSequence`.

### 3. Timeline Preview & Transport Loop (`TimelinePreview.tsx`)
- Updated transport tick loop to support work-area boundaries and seamless loop wrapping for forward and reverse playback.
- Added Loop button (`repeat` icon) with active emphasis in the transport controls bar.
- Updated "Go to start" (Home) and "Go to end" (End) buttons to jump to the In-Point and Out-Point when set.

### 4. Timeline Ruler Visual In/Out Work Area (`TimelinePanel.tsx`)
- Rendered In-Point bracket `[` and Out-Point bracket `]` on the timeline ruler with amber/accent glow.
- Rendered semi-transparent highlighted work area band between In and Out points on the ruler.
- Projected vertical dashed accent boundary lines across the lanes canvas.
- Added right-click context menu on the ruler offering "Mark In (I)", "Mark Out (O)", "Clear In/Out (Alt+X)", and "Add marker".
- Added In/Out commands to empty lane space right-click menu.

### 5. Keyboard Shortcuts (`TimelineScreen.tsx`)
- `I`: Mark In point when no clip is selected (preserves clip trim when a clip is selected).
- `O`: Mark Out point when no clip is selected (preserves clip trim when a clip is selected).
- `Alt+I`: Clear In point.
- `Alt+O`: Clear Out point.
- `Alt+X`: Clear both In and Out points.
- `Ctrl+L` / `Cmd+L`: Toggle Loop playback.
- `Home` / `End`: Jump to In-Point and Out-Point when set, or sequence start/end.

### 6. Export Modal Work Area Range (`ExportModal.tsx`)
- When In/Out points exist, displays an "Export Range" segmented control: "Entire Cut" vs "Work Area".
- Recomputes duration and estimated file size based on the selected range.

---

## Verification & Testing
- Unit test suite: `src/shared/utils/timeline/__tests__/in-out-loop.test.ts` (15 tests passed).
- Full Vitest suite: 14 test files, **94 passed tests**.
- TypeScript type check (`tsc --noEmit`): Code 0 (**0 errors**).
- Production build (`npx vite build --config vite.main.config.ts`): Built in 6.77s with 0 errors.
