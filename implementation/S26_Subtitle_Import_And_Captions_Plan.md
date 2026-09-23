# Implementation Plan: Step S26 — Subtitle / Caption Import & Export Engine (.SRT / .VTT Auto-Ingest onto Text Track)

Provide video editors with professional caption workflows: auto-ingesting SubRip (`.srt`) and WebVTT (`.vtt`) subtitle files into frame-accurate, styled text clips on dedicated timeline text lanes, alongside two-way export back out to `.srt` / `.vtt`.

## 1. Background & Architecture
Modern video workflows frequently rely on external transcriptions (Whisper, YouTube auto-captions, Premiere transcripts, WhisperX, Deepgram). VideoStudio's timeline model already supports text clips (`sourceKind: 'text'`, `effects.text: TextContent`) and dedicated text lanes (`SequenceTrack.role === 'text'`), but currently requires creating and timing text clips manually.

Step S26 delivers:
1. Pure utility functions in `src/shared/utils/timeline/subtitle-ops.ts` for parsing, normalizing, timing, styling, and serializing subtitles.
2. Full round-trip fidelity between SRT/VTT caption files and timeline text clips.
3. Interactive Subtitle Import & Export Modal (`SubtitleModal.tsx`) with live cue preview, track routing, playhead sync, and creator style presets.
4. Toolbar and TextPane integration with 1-click access.

## 2. Key Modules & Interfaces
- **`SubtitleCue`**:
  ```ts
  export interface SubtitleCue {
    index: number;
    startSeconds: number;
    endSeconds: number;
    text: string;
  }
  ```
- **`SubtitleImportOptions`**:
  ```ts
  export interface SubtitleImportOptions {
    targetTrackId: string;
    sequenceId: string;
    fps: number;
    offsetFrames?: number;
    stylePreset?: 'modern' | 'cinema' | 'bold_white' | 'minimal';
    textCasing?: 'as-is' | 'uppercase' | 'titlecase' | 'sentencecase';
    colorLabel?: ClipColorLabel;
    mintId?: () => string;
  }
  ```
- **Parsing logic**:
  - Handles BOM, Windows CRLF, Mac CR, and Unix LF.
  - Formats: SRT (`00:01:23,456 --> 00:01:26,789`), WebVTT (`00:01:23.456 --> 00:01:26.789` or `01:23.456 --> 01:26.789`).
  - Strips HTML markup (`<i>`, `<b>`, `<font>`, etc.).
- **Serialization logic**:
  - `timelineClipsToSRT(clips, fps, trackId?)`
  - `timelineClipsToWebVTT(clips, fps, trackId?)`
- **Modal UI**:
  - Drag-and-drop & file picker, raw text paste editor, interactive preview table, style presets, export preview with 1-click Copy & Download.

## 3. Verification Plan
- 100% test coverage across `subtitle-ops.test.ts`.
- 100% clean `npm run typecheck`.
- Clean production bundle build via `npx vite build --config vite.main.config.ts`.
