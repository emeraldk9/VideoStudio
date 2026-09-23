# Milestone S65: MultiCam Live 4-Up Synchronized Canvas Playback

## Executive Overview
Multi-Camera editing is a cornerstone workflow for event videographers, interviews, music performances, and live productions. In modern NLEs (DaVinci Resolve MultiCam Studio, Adobe Premiere Pro Multi-Camera Monitor, Final Cut Pro Multi-Angle Viewer), editors synchronize multiple camera angles and switch between them dynamically in real time.

In Milestone S65, we implement:
1. **Synchronized 4-Up MultiCam Canvas Display:** A 2x2 multi-angle quad-split canvas mode in `TimelinePreview.tsx` that simultaneously displays up to 4 camera angles in sync with the sequence transport clock.
2. **Live Cut-on-the-Fly Editorial Engine:** While playback is running (or paused), clicking any angle tile or pressing hotkeys (`1`, `2`, `3`, `4`) instantly performs a non-destructive razor cut at the current playhead frame and switches the trailing clip to the selected camera angle.
3. **Studio Tally Borders & Angle HUD:** Live visual indicators showing the on-air Program angle (Red tally border), Preview angle (Green tally border), angle labels ("Cam A - Wide", "Cam B - Close-up"), and sync offset metrics.
4. **Audio Follows Video vs. Master Audio Locking:** Configurable audio switching behavior ensuring production dialogue/lavalier tracks remain uninterrupted during angle cuts or follow camera angles when desired.
5. **MultiCam Control Strip in Preview Toolbar:** Quick toggle between Single Monitor (Program View) and MultiCam 4-Up Quad Split (`Shift+0` shortcut and toolbar button).

---

## Architecture & Data Flow

```
                        Sequence Timeline
                               │
            [ MultiCam Clip 1 ] ────► [ MultiCam Clip 2 ]
                   │ (Angle 1)               │ (Angle 2)
                   ▼                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │         TimelinePreview (4-Up MultiCam Canvas)           │
  │  ┌─────────────────────────┬──────────────────────────┐  │
  │  │  [Angle 1: Cam A - Wide]│  [Angle 2: Cam B - Tight] │  │
  │  │  🔴 ON-AIR (Red Tally)  │  🟢 PREVIEW (Green Tally)│  │
  │  ├─────────────────────────┼──────────────────────────┤  │
  │  │  [Angle 3: Cam C - Side]│  [Angle 4: Cam D - Cam]  │  │
  │  │  Sync: +0f              │  Sync: +12f              │  │
  │  └─────────────────────────┴──────────────────────────┘  │
  └──────────────────────────────────────────────────────────┘
           ▲
           │ User clicks Angle 2 or presses '2' during playback
           ▼
    Razor cut at playhead frame + switch trailing clip to Angle 2
```

---

## Detailed Specifications

### 1. Pure Editorial Math & Operations (`src/shared/utils/timeline/multi-cam-ops.ts`)
- **Cut-on-the-Fly Split & Angle Switch:**
  - `executeLiveMultiCamCut(clips, tracks, activeClipId, playheadFrame, targetAngleIndex, mintId)`:
    - Splits the active multicam clip at `playheadFrame`.
    - Switches the subsequent split clip's `activeAngleIndex` to `targetAngleIndex`.
    - Maintains sourceIn frame offsets, audio follow settings, and keyframes.
- **Synchronized Time Calculation:**
  - `resolveAngleSourceTime(clip, angleIndex, playheadFrame, fps)`:
    - Computes exact video element `currentTime` for each angle, accounting for `syncOffsetFrames` and speed retiming.
- **Unit Tests (`src/shared/utils/timeline/__tests__/multi-cam-ops.test.ts`):**
  - Add comprehensive unit tests covering live cut execution, angle switching during playback, and sync offset frame calculations.

### 2. Preview Canvas 4-Up Grid Component (`MultiCamGrid.tsx`)
- Located in `src/renderer/features/timeline-preview/ui/MultiCamGrid.tsx`.
- Renders a responsive 2x2 grid with:
  - Video elements or image posters for angles 1 through 4.
  - Active Program angle with Red glowing tally border (`ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]`).
  - Angle label badge, camera name, and sync status HUD.
  - Interactive click handler executing live angle switch or cut.

### 3. Canvas Preview Integration (`TimelinePreview.tsx`)
- Add `multiCamViewEnabled` toggle (`Quad Split` icon button in preview transport bar, hotkey `Shift+0`).
- When enabled and the active clip has `effects?.multiCam?.enabled`:
  - Switches canvas from single video viewer to `MultiCamGrid`.
- Number keys `1`, `2`, `3`, `4` trigger live cut switching when MultiCam view is active.

### 4. Inspector & Toolbar Affordances
- In `MultiCamInspectorTab.tsx`:
  - Show 4-Up preview status toggle.
  - Display angle list with color tags and sync offsets.
- In `TimelineToolbar.tsx`:
  - Optional MultiCam mode indicator icon.

---

## Verification Criteria
1. `npm test` passes all test suites (including newly extended `multi-cam-ops.test.ts`) with zero errors.
2. `npx tsc --noEmit` verifies strict TypeScript compilation with 0 errors.
3. Toggling MultiCam Quad Split displays all 4 synchronized camera feeds.
4. Clicking an angle or pressing 1-4 cuts the multicam clip at playhead and switches angles seamlessly.
