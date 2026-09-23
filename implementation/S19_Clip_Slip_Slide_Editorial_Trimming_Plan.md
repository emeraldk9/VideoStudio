# Step S19: Interactive Clip Slip & Slide Editorial Trimming

## Status: Completed (Verified with Unit Tests, Full Vitest Suite, Typecheck, and Production Build)

## Executive Summary
In professional NLEs (Premiere Pro, DaVinci Resolve, Final Cut Pro), trimming consists of more than just dragging the left or right edges of a clip:
1. **Slip Editing (`slipClipMedia`)**: Shifts the media contents (`sourceInFrames`, `sourceOutFrames`) inside the clip boundaries *without* changing the clip's timeline position (`startFrames`) or duration (`durationFrames`).
2. **Slide Editing (`slideClipPosition`)**: Moves a clip along the timeline while adjusting the adjacent head clip's tail and tail clip's head to keep overall sequence duration constant.
3. **Slip Keyboard Ergonomics**: With a video or audio clip selected, pressing `Alt+Left` / `Alt+Right` slips the media by -1 / +1 frame (-10 / +10 with `Shift`).
4. **Slip & Source In/Out Inspector Controls**: Displays exact Source In / Source Out timecode in `ClipInspector` with interactive nudge controls (-10f, -1f, +1f, +10f) and a reset to source start button.

---

## Technical Architecture & File Modifications

### 1. Pure Operations in `src/shared/utils/timeline/edit-ops.ts`
- `slipClipMedia(clip: SequenceClip, deltaFrames: number, maxSourceFrames?: number): SequenceClip`:
  - Adjusts `sourceInFrames` by `deltaFrames`.
  - Clamps `sourceInFrames` to `Math.max(0, ...)`. If `maxSourceFrames` provided, clamps so `sourceIn + durationFrames <= maxSourceFrames`.
  - Updates `sourceOutFrames` proportionally if defined.
- `slideClipPosition(clips: readonly SequenceClip[], track: SequenceTrack, clipId: string, deltaFrames: number): SequenceClip[]`:
  - For free tracks, shifts the clip by `deltaFrames` while trimming the preceding clip's tail and succeeding clip's head to maintain total sequence duration.

### 2. Keyboard Shortcuts in `TimelineScreen.tsx`
- Registered `Alt+ArrowLeft` / `Alt+ArrowRight` (and `Alt+Shift+ArrowLeft` / `Alt+Shift+ArrowRight`) when a single video/audio clip is selected:
  - Invokes `slipClipMedia` with -1 / +1 (or -10 / +10) frames.
  - Smoothly updates `sourceInFrames` and `sourceOutFrames` in real time.

### 3. Inspector Slip Controls in `ClipInspector.tsx`
- In `SingleClipInspector`, added a dedicated "Media Slip & In/Out" section for video/audio clips with underlying media:
  - Displays Source In timecode and Source Out timecode with frame numbers.
  - Interactive stepper buttons: `-10f`, `-1f`, `+1f`, `+10f`.
  - "Reset to Source Start (0f)" button when offset > 0.

### 4. Verification & Testing
- Unit test suite: `src/shared/utils/timeline/__tests__/slip-slide.test.ts` (7 tests passing).
- Full test suite: `npm test` -> 13 passed test files, 79 passed unit tests.
- Typecheck: `npm run typecheck` (`tsc --noEmit`) -> 0 errors.
- Production bundle build: `npx vite build --config vite.main.config.ts` -> Clean build in 7.67s.
