# Step S77: Subtitle & Captions Left Panel Rail Workspace

## Status: Completed ✅

---

## 1. Executive Summary & Audit of Existing Features

### 1.1 Existing Subtitle Engine Capabilities
In prior milestones (notably S26 and S73), VideoStudio built strong foundational subtitle primitives:
- **`subtitle-ops.ts`**: SubRip (`.srt`), WebVTT (`.vtt`), and Advanced SubStation Alpha (`.ass`) parsers and exporters.
- **Timestamp Precision**: Centisecond and millisecond timestamp converters (`parseTimestampToSeconds`, `formatSecondsToSRTTimestamp`, `formatSecondsToVTTTimestamp`, `formatSecondsToASSTimestamp`).
- **Styling**: `CAPTION_STYLE_PRESETS` (Modern Translucent, Cinema Yellow, High-Contrast White, Minimalist Sans) and `ASS_SUBTITLE_STYLES` for FFmpeg teletext burn-in (`classic_clean`, `cinema_gold`, `yellow_broadcast`, `tiktok_box`, `retro_teletext`).
- **Modal Dialog (`SubtitleModal.tsx`)**: File-based or paste-based import and export.
- **Export Integration (`ExportModal.tsx`)**: Burn-in subtitles during FFmpeg sequence render via `-vf subtitles=...`.

### 1.2 Audit Findings & Limitations (Comparison to CapCut & Premiere Pro)
1. **Modal Separation vs. Persistent Left Panel Rail**: Currently, subtitles are locked behind a modal window (`SubtitleModal.tsx`). In CapCut Desktop, Premiere Pro (Text / Captions Workspace), DaVinci Resolve, and Descript, captions live in a **persistent left navigation rail** (`Subtitles` or `Captions`), allowing editors to inspect the transcript, scrub the timeline, and watch the preview canvas update live without closing a modal.
2. **Lack of Real-Time Playhead Sync & Cue Highlighting**: Editors cannot see which subtitle cue corresponds to the current frame. Industry standard requires the active cue in the left panel to highlight automatically as the playhead advances, with 1-click seeking to any spoken cue.
3. **No In-Place Cue Editing**: Editing a subtitle requires opening the clip inspector tab or double-clicking on the timeline. Editors need an interactive cue list where they can type and correct spelling directly in the left panel.
4. **Missing Batch & Search/Replace Tools**: Proofreading a 30-minute episode requires global search and replace (correcting brand names, homophones, speaker names) and one-click global restyling across all cues.
5. **Character Limit & Auto-Break Helpers**: Long subtitle lines cause visual clutter or overflow on mobile formats (9:16). Industry guidelines prescribe 37–42 CPL for broadcast and 20–25 CPL for mobile reels.

---

## 2. Proposed Architecture & Solutions

### 2.1 Navigation & Rail Integration
- **`mediaPanelStore.ts`**: Extend `MediaPanelCategory` to include `'subtitles'`.
- **`MediaPanel.tsx`**: Add `Subtitles` (icon `closed_caption`) to the top horizontal navigation rail `RAIL` right alongside `Text` and `Transitions`.
- **`SubtitlesPane.tsx`**: A responsive, feature-rich workspace pane rendered when `category === 'subtitles'`.

### 2.2 Core Capabilities of `SubtitlesPane`
1. **Subtitles Header & Action Bar**:
   - **Track Selector**: Choose a target subtitle/text track or view all cues across the timeline.
   - **Quick Actions**: "Add Caption at Playhead" (`+`), "Auto-Break Lines" (37 CPL), "Clear All Cues".
   - **Search & Replace**: Collapsible search bar with live match counter, case sensitivity toggle, and "Replace All" across all timeline captions.
   - **Import & Export Menus**: Instant file import (`.srt`, `.vtt`, `.ass`, `.txt`) and export (`.srt`, `.vtt`, `.ass`, plain text transcript, copy to clipboard).

2. **Synchronized Transcript & Interactive Cue List**:
   - Sorted chronologically by `startFrames`.
   - **Active Cue Indicator**: Automatically detects `currentPlayheadFrame` within `[startFrames, startFrames + durationFrames)` and adds an active highlight state.
   - **Click to Seek**: Clicking any cue jumps the playhead to its start frame and selects the clip.
   - **In-Place Live Editing**: Editable multi-line textarea with auto-commit on blur or `Enter`.
   - **Timecode Badges**: Displays formatted start and end timecodes (`00:01:23.45`).
   - **Cue Tools**: Split cue at playhead, duplicate cue, delete cue.
   - **CPL Warning**: Visual pill indicator if a line exceeds standard character counts (>37 chars).

3. **Global Styling & Typography Quick Bar**:
   - Visual cards for all presets (`Modern Pill`, `Cinema Gold`, `TikTok Box`, `High Contrast`, `Retro Teletext`, `Minimalist`).
   - "Apply Style to All Subtitles" action button.
   - Case conversion tools (UPPERCASE, Title Case, Sentence case, As-is).

4. **Speech-to-Text / Auto-Captions Generator Helper**:
   - "Generate Auto-Captions from Timeline Audio" with cadence estimation from audio segments and markers.

### 2.3 Pure Mathematics & Utility Functions (`subtitle-ops.ts`)
- `splitSubtitleClip(clip, splitFrame, mintId)`: Splits a text clip cleanly into two contiguous segments.
- `mergeSubtitleClips(clipA, clipB)`: Combines two adjacent subtitle clips into one.
- `autoBreakSubtitleLines(text, maxCharsPerLine = 37)`: Intelligently inserts linebreaks at sentence/phrase boundaries.
- `searchAndReplaceSubtitles(clips, search, replace, matchCase = false, trackId?)`: Batch replacement across all subtitle clips.
- `applyStylePresetToClips(clips, presetId, trackId?)`: Re-styles clips while preserving text content.
- `exportTranscriptText(clips, fps, includeTimestamps = true, trackId?)`: Clean text transcript exporter.

---

## 3. Progress Tracking Log

- **[2026-09-23 07:57]** Audit completed. Initialized Milestone S77 plan and created implementation document.
- **[2026-09-23 07:58]** Created implementation plan artifact (`implementation_plan.md`) outlining UI, data model, and pure operations.
- **[2026-09-23 07:59]** Implemented pure operations in `src/shared/utils/timeline/subtitle-ops.ts`:
  - `splitSubtitleClip`: Split cue at frame with proportional word division.
  - `mergeSubtitleClips`: Merge contiguous cues into a single cue card.
  - `autoBreakSubtitleLines`: Format text to conform to 37 CPL broadcast & social standard.
  - `searchAndReplaceSubtitles`: Batch search and replace with case sensitivity support.
  - `applyStylePresetToClips`: Batch restyle clips preserving text content.
  - `exportTranscriptText`: Plain text transcript export with optional timecode headers.
- **[2026-09-23 08:00]** Created unit tests in `src/shared/utils/timeline/__tests__/subtitle-ops.test.ts` (38 tests covering parsing, ASS export, and new operations).
- **[2026-09-23 08:00]** Extended `MediaPanelCategory` with `'subtitles'` in `mediaPanelStore.ts`.
- **[2026-09-23 08:01]** Built `SubtitlesPane.tsx` featuring real-time playhead sync via `transportClock`, in-place editing, search/replace, style presets, auto-break, and SRT/VTT/ASS/TXT import/export.
- **[2026-09-23 08:01]** Integrated `Subtitles` rail into `MediaPanel.tsx` and re-exported in `timeline-media/index.ts`.
- **[2026-09-23 08:02]** Verified with `npx tsc --noEmit` (0 errors) and `npx vitest run` (843/843 tests passing across 68 test files).
