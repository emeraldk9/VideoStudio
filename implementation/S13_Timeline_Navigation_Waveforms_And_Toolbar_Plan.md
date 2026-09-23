# S13: Timeline Cut Navigation, Video Waveforms & Toolbar Quick Actions

## Status: Completed (Verified with Unit Tests, Typecheck, and Production Build)

## Executive Summary
This step elevates timeline workflow speed and visual feedback:
1. **NLE Playhead Cut Navigation (`Up Arrow` / `Down Arrow`)**: Jump playhead to the previous/next edit boundary (clip cut, head, tail, or marker) using industry-standard keyboard ergonomics (Premiere, Resolve, FCP).
2. **Video Track Audio Waveform Overlays**: Display subtle audio waveforms across the lower third of video clips that have embedded audio (`sourceAudioEnabled !== false`), providing visual sync cues for speech and audio transients directly on video lanes.
3. **Timeline Toolbar Editorial Quick Actions**: Add toolbar action buttons in `TimelineToolbar.tsx` for "Duplicate Selection" (`Ctrl+D`), "Insert Freeze Frame" (`Alt+F`), and "Separate Audio" when eligible clips are selected.
4. **Volume Nudge Shortcuts (`[` / `]`)**: Nudge selected clip(s) gain by ±1 dB with single keystrokes, clamped within standard dynamic bounds (-60 dB to +12 dB).

---

## Technical Architecture & File Modifications

### 1. Cut Navigation Utilities (`src/shared/utils/timeline/layout.ts`)
- Pure functions implemented and exported:
  - `findPreviousCut(targets: readonly number[], currentFrame: number): number`: Finds closest cut/marker frame strictly less than current playhead.
  - `findNextCut(targets: readonly number[], currentFrame: number, duration: number): number`: Finds closest cut/marker frame strictly greater than current playhead.

### 2. Video Lane Audio Waveform Visualization (`WaveformCanvas.tsx` & `TimelineLane.tsx`)
- Enhanced `WaveformCanvas`:
  - Added `laneKind?: 'audio' | 'video'` prop.
  - When `laneKind === 'video'`, renders waveform along the bottom 36% of the lane with themed audio opacity so filmstrip posters remain visible above.
  - Filters video clips to only those with `sourceAudioEnabled !== false`.
- Mounted `WaveformCanvas` in `TimelineLane.tsx` for video tracks alongside `FilmstripCanvas`.

### 3. Keyboard Shortcuts in `TimelineScreen.tsx`
- `ArrowUp`: Jump playhead to previous cut point or marker.
- `ArrowDown`: Jump playhead to next cut point or marker.
- `[`: Nudge gain of selected clips down by 1 dB.
- `]`: Nudge gain of selected clips up by 1 dB.

### 4. Toolbar Action Buttons in `TimelineToolbar.tsx`
- Added "Duplicate selection" button (`content_copy`) disabled when no clips selected.
- Added "Separate audio" button (`call_split`) enabled when a video clip with audio is selected.
- Added "Freeze frame at playhead" button (`ac_unit`) enabled when a video clip under playhead is selected.

### 5. Automated Verification & Metrics
- **Unit Test Suite**: `src/shared/utils/timeline/__tests__/navigation-and-waveforms.test.ts` (8 tests passing).
- **Full Test Suite**: `npm test` -> 7 passed test suites, 47 passed unit tests.
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) -> 0 errors.
- **Production Build**: `npx vite build --config vite.main.config.ts` -> Clean build in 7.77s.
