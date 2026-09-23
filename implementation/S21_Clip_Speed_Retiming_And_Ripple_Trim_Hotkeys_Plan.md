# Step S21: Clip Speed Retiming System (0.25x–4x, Presets, Duration Linkage, Ctrl+R) & Ripple Edit Hotkeys (Q/W)

## Status: Complete

## Executive Summary
Professional NLE video editing relies heavily on two core capabilities:
1. **Clip Speed & Duration Retiming (`Ctrl+R`)**:
   - Variable playback speed from `0.25x` (quarter-speed slow motion) to `4.0x` (timelapse fast motion).
   - Quick preset buttons (`0.25x`, `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`, `4.0x`).
   - "Ripple Sequence" linkage: automatically adjusts clip duration on the timeline proportionally to the speed change (`newDuration = round(oldDuration * (oldSpeed / newSpeed))`) and ripples downstream clips, so the complete visual segment plays through at the chosen speed.
   - Dedicated `SpeedModal` modal and inline Inspector controls with `Ctrl+R` / `Cmd+R` shortcut and clip context menu action.
2. **Ripple Trim Hotkeys (`Q` and `W`)**:
   - `Q` (Ripple Trim Start / Head to Playhead): Cuts the segment between clip start and playhead, rippling all downstream media leftward to close the gap.
   - `W` (Ripple Trim End / Tail to Playhead): Cuts the segment between playhead and clip end, rippling all downstream media leftward to close the gap.
   - In standard NLEs (Premiere, DaVinci, Final Cut), `Q` and `W` are the highest-frequency top-level editorial commands for rapid assembling.

---

## Technical Architecture & File Modifications

### 1. Pure Operations Utility (`src/shared/utils/timeline/speed-ops.ts`)
- `applyClipSpeed(clips, tracks, clipId, newSpeed, options: { rippleSequence?: boolean })`:
  - Clamps speed between `MIN_CLIP_SPEED` (0.25) and `MAX_CLIP_SPEED` (4.0).
  - Calculates proportional duration adjustment if `rippleSequence` is true.
  - Ripples downstream clips on the same track if on a free track or magnetic track.
- `rippleTrimToPlayhead(clips, tracks, frame, side: 'head' | 'tail', selectedClipIds: readonly string[])`:
  - Finds the target clip under the playhead (selection-first or active track).
  - Trims head or tail to the playhead frame.
  - Automatically ripples downstream clips to close the resulting gap on the track.

### 2. Speed Modal (`src/renderer/features/timeline-edit/ui/SpeedModal.tsx`)
- Sleek HUD modal opened via `Ctrl+R` / `Cmd+R`, clip context menu, or inspector button.
- Percentage input (`100%`), speed multiplier (`1.0x`), and log-scale slider.
- Instant preset chips: `0.25x`, `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`, `4.0x`.
- "Ripple Sequence" toggle with duration timecode before/after preview.

### 3. Clip Inspector "Speed & Retiming" Card (`src/renderer/features/timeline-edit/ui/ClipInspector.tsx`)
- Inline Speed & Retiming card under Timing & In/Out.
- Speed chips (`0.5x`, `1x`, `1.5x`, `2x`) with custom slider and "Change Duration (Ctrl+R)" button.

### 4. Context Menu & Toolbar (`TimelinePanel.tsx`, `TimelineToolbar.tsx`)
- Clip context menu: "Speed / Duration... (Ctrl+R)".
- Toolbar buttons: "Speed / Duration" in edit commands cluster when clip is selected.
- Toolbar tooltips updated on delete left/right to indicate `Q` and `W`.

### 5. Keyboard Shortcuts (`TimelineScreen.tsx`)
- `Q`: Ripple trim head to playhead (`rippleTrimToPlayhead(..., 'head', ...)`).
- `W`: Ripple trim tail to playhead (`rippleTrimToPlayhead(..., 'tail', ...)`).
- `Ctrl+R` / `Cmd+R`: Open Speed / Duration modal for selected clip.

### 6. Verification & Testing
- Unit test suite: `src/shared/utils/timeline/__tests__/speed-ops.test.ts`.
- Full Vitest suite (`npm test`).
- Typecheck (`npm run typecheck`).
- Production bundle (`npx vite build --config vite.main.config.ts`).
