# S12: Timeline Advanced Editorial Features (Audio Detachment, Freeze Frame, Duplicate Clip, and Context Productivity)

## Status: Completed (Verified with Unit Tests, Typecheck, and Production Build)

## Executive Summary
This step introduces professional NLE editorial operations to the timeline workflow:
1. **Audio Separation / Detachment (`separateClipAudio`)**: Right-click a video clip (or shortcut) to extract its embedded audio to an audio track, silencing the video (`sourceAudioEnabled: false`) while keeping perfect sample/frame synchronization.
2. **Freeze Frame at Playhead (`insertFreezeFrame` + `SEQUENCE_CAPTURE_FRAME` IPC)**: Right-click a video clip at the playhead to extract the current frame via native ffmpeg and insert a still frame clip (default 3s) at that timecode, rippling or splitting cleanly.
3. **Duplicate Clip / Duplicate Selection (`duplicateClips`)**: Duplicate selected clips directly on magnetic or free tracks with auto-offsetting and non-colliding order/positioning.
4. **Context Menu & Shortcut Enhancements**: Expose "Separate Audio", "Freeze Frame (Alt+F)", "Duplicate (Ctrl+D)", and "Mute / Unmute Audio" directly in the timeline context menu and global timeline keybindings.

---

## Technical Architecture & File Modifications

### 1. IPC & Main Process Backend Frame Capture
- **`src/shared/ipc/ipc-channels.ts`**:
  - Added `SEQUENCE_CAPTURE_FRAME: 'sequence:captureFrame'`
- **`src/shared/ipc/ipc-schemas.ts`**:
  - Added `sequenceCaptureFrameSchema` with `sourcePath: z.string()`, `atSeconds: z.number().min(0)`, `sequenceId: z.string().optional()`
- **`src/main/ipc/sequence-ipc.ts`**:
  - Implemented handler for `SEQUENCE_CAPTURE_FRAME`: runs ffmpeg `-ss <sec> -i <source> -vframes 1 -q:v 2 <dest.jpg>`, cached in `managedOutputsRoot/freeze-frames/`.
- **`src/preload/preload.ts`**:
  - Exposed `window.api.sequence.captureFrame(request)` returning `{ imagePath: string; url: string }`.

### 2. Timeline Pure Editorial Operations (`src/shared/utils/timeline/edit-ops.ts`)
- **`separateClipAudio(clips: SequenceClip[], tracks: SequenceTrack[], clipId: string, mintId: () => string, targetAudioTrackId?: string)`**:
  - Finds the video clip and its placed start frame (`layoutTrack`).
  - Finds or validates an unlocked audio track in `tracks`.
  - Marks the video clip with `sourceAudioEnabled: false`.
  - Mints an audio clip placed at the exact same startFrames/sourceInFrames with matching duration, gain, and fades.
  - Returns updated clips array and the created audio clip.
- **`duplicateClips(clips: SequenceClip[], tracks: SequenceTrack[], clipIds: string[], mintId: () => string)`**:
  - Duplicates selected clips.
  - For magnetic tracks: inserts immediately after original, incrementing orderIndex for duplicates and downstream clips.
  - For free tracks: offsets by durationFrames to avoid overlapping.
  - Returns updated clips and duplicated clips list.
- **`insertFreezeFrame(clips: SequenceClip[], tracks: SequenceTrack[], videoClipId: string, frame: number, freezeImagePath: string, freezeDurationFrames: number, mintIds: { splitId: string; freezeId: string })`**:
  - Splits video clip at `frame` if within bounds.
  - Inserts still clip of `freezeDurationFrames` between the first and second half.
  - Properly adjusts layout/orderIndex on magnetic tracks or shifts subsequent clips on free tracks.

### 3. Timeline UI & Shortcuts (`TimelinePanel.tsx`, `TimelineScreen.tsx`, `ContextMenu.tsx`)
- **`ContextMenu.tsx`**:
  - Added support for `shortcut?: string` in `ContextMenuItem` and displayed right-aligned shortcut badges with font-mono.
- **`TimelinePanel.tsx`**:
  - Added "Duplicate" (`Ctrl+D`), "Separate audio", "Mute video audio" / "Unmute video audio", and "Insert freeze frame (3s)" (`Alt+F`).
- **`TimelineScreen.tsx`**:
  - Added global timeline keybindings: `Ctrl+D` / `Cmd+D` for instant selection duplication, and `Alt+F` for freeze frame insertion at playhead.

### 4. Verification & Testing
- **Unit Test Suite**: `src/shared/utils/timeline/__tests__/edit-ops.test.ts` (7 tests covering pure arithmetic, track ripples, audio extraction, and IPC schema validation).
- **Full Test Suite**: `npm test` -> 6 passed test suites, 39 passed unit tests.
- **Type Checking**: `npm run typecheck` (`tsc --noEmit`) -> 0 errors.
- **Production Build**: `npx vite build --config vite.main.config.ts` -> Clean build in 7.16s.
