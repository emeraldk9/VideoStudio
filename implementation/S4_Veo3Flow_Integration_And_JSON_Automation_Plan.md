# S4: Veo3Flow Studio Integration & Full Timeline JSON Automation Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S4_Veo3Flow_Integration_And_JSON_Automation_Plan.md`  
**Status**: 🟢 Complete & Verified  
**Standard**: High-Precision Editorial Timeline & Story Studio Ingestion  

---

## Progress Checklist & Tracker

- [x] **Phase 1: Veo3Flow Studio Folder Scanner & Ingestion Engine**
  - [x] Implement `src/main/media/veo3flow-service.ts` to inspect target directory, parse `project.json`, `shots.json`, `episodes.json`.
  - [x] Extract 141 shots with exact captured durations (`durationSeconds`, `estimatedDurationSeconds`).
  - [x] Resolve approved hero still paths (`selectedHeroTakeId`, `approvedAt`, `localPath`) and video takes (`videoTakes`).
  - [x] Implement `VEO3FLOW_OPEN_FOLDER` and `VEO3FLOW_PARSE_FOLDER` IPC channels and register media with `sequence_media`.
  - [x] Expose in `preload.ts` and `ipc-schemas.ts`.

- [x] **Phase 2: UI Project Ingestion & Separate 1-Click Timeline Placement**
  - [x] Add "Open Veo3Flow Project" tab in `ProjectModal.tsx` with folder picker, shot preview metrics, and placement mode selector (`stills_only`, `videos_only`, `hybrid`, `dual_track`).
  - [x] Add "Open Veo3Flow Folder" button in `TopNavigation.tsx`.
  - [x] In `FilesPane.tsx`, create Veo3Flow Story section displaying total approved stills count, approved videos count, and cut duration.
  - [x] Implement **Separate 1-Click Actions**:
    - [x] Dedicated **`[🖼️ Place Stills]`** button for 1-click approved stills placement on Spine (Track V1) with exact durations.
    - [x] Dedicated **`[🎬 Place Videos]`** button for 1-click approved shot videos placement.
    - [x] Advanced Options menu: **⚡ Hybrid Cut (Video + Still Fallback)** and **⚡ Dual Tracks (V1 Stills + V2 Videos)**.
    - [x] Partition MediaGrid cards into separate `(Still)` and `(Vid)` tiles with 1-click `+` placement for individual takes.

- [x] **Phase 3: Comprehensive Timeline JSON Export & Import (All Effects, Sketches, Transitions, Motions, Timestamps)**
  - [x] Upgrade `timeline-setup-export.ts` to schema v2:
    - [x] Multi-track hierarchy (tracks, roles, visibility, mutes).
    - [x] Timestamps (`startFrames`, `startSeconds`, `audioOffsetFrames`).
    - [x] Durations (`durationFrames`, `durationSeconds`).
    - [x] Transitions (all types: asymmetric, luma, dip, flash frames, match dissolve coords).
    - [x] Motions (motion presets, rate, direction, register).
    - [x] Sketches (whiteboard hand style, drawSeconds, cadenceFps, zones, pen points).
    - [x] Color filters (brightness, contrast, saturation, gamma, hue, sharpen, vignette).
    - [x] Transforms, speed multipliers, video/audio fades, markers with locked sync.
  - [x] Upgrade `timeline-setup-import.ts` to parse all v2 fields and maintain 100% v1 backward compatibility.
  - [x] Wire main IPC `SEQUENCE_EXPORT_FULL_JSON` and `SEQUENCE_IMPORT_FULL_JSON`.

- [x] **Phase 4: Timeline JSON Management UI**
  - [x] Create `TimelineJsonModal.tsx` for importing and inspecting JSON files before applying.
  - [x] Add "Export JSON" and "Import JSON" actions in `TopNavigation.tsx` / timeline toolbar.
  - [x] Support both "Patch Existing Clips" and "Full Timeline Reconstruction" modes.

- [x] **Phase 5: Verification & Regression Testing**
  - [x] Run `npm run typecheck` (0 errors across entire repo).
  - [x] Automated test verifying `G:\My Drive\HSB\EP03\Storage V.1` (141 approved stills, exact durations).
  - [x] Automated test verifying 1-click timeline placement and exact frame calculations.
  - [x] Automated test verifying import/export round-trip of `Untitled sequence.setup.json` and v2 files.

---

## 1. Requirement 1: Veo3Flow Project Folder Ingestion & 1-Click Placement

### 1.1 Data Schema in `Storage V.1`
In real projects like `G:\My Drive\HSB\EP03\Storage V.1`:
- `project.json`: Defines `id`, `title`, `aspectRatio` (`16:9`, `9:16`, etc.).
- `shots.json`: Contains 141 shots.
  - Key fields per shot:
    - `id`: e.g. `scene_qe5ignmw`
    - `order`: cut order index (0..140)
    - `heading`: e.g. `INT. KEEPER'S COTTAGE BACK ROOM - NIGHT`
    - `scriptText`: narrative prose / dialogue
    - `durationSeconds`: exact float seconds (e.g. `7.35`)
    - `estimatedDurationSeconds`: estimated seconds (e.g. `13`)
    - `selectedHeroTakeId`: e.g. `take_mtz80kj7_ensrv`
    - `heroTakes`: array of take objects with `takeId`, `approvedAt`, `localPath`
    - `videoTakes`: array of video takes (for Veo3-generated videos)
- Local media files live at `path.join(storageFolder, take.localPath)`.

### 1.2 Proposed Architecture
1. **Veo3Flow Ingestion Engine (`veo3flow-service.ts`)**:
   - Opens folder via native dialog or directory path.
   - Parses `project.json` and `shots.json`.
   - Iterates through all shots, resolving approved hero still (`heroTakes.find(t => t.takeId === shot.selectedHeroTakeId || t.approvedAt)`) and approved video takes (`videoTakes.find(t => t.approvedAt)`).
   - Captures exact duration `durationSeconds`.
   - Records media files into SQLite `sequence_media` so thumbnails and preview are instant.
2. **1-Click Placement (`FilesPane.tsx` / `add-to-timeline.ts`)**:
   - Computes exact duration frames: `durationFrames = Math.round(durationSeconds * sequence.fps)`.
   - Clears or appends onto the Spine video track.
   - Populates `storyShotId`, `sourceTakeId`, `filePath`, `label`.

---

## 2. Requirement 2: Comprehensive Timeline JSON Export & Import

### 2.1 Complete Studio JSON Schema (v2)
Controls every aspect of the project and timeline:
- **Timestamps**: `startFrames`, `startSeconds`, `audioOffsetFrames`
- **Durations**: `durationFrames`, `durationSeconds`
- **Tracks**: Full multi-track hierarchy (kind, role, magnetic, muted, videoEnabled, heightPx)
- **Transitions**: `transitionIn`, `transitionFrames`, `transitionOut`, `transitionOutFrames`, `transitionParams`
- **Motions**: `motionPreset`, `motion` (preset, rate, register, direction)
- **Sketches**: `whiteboard` (`WhiteboardSettings`: `drawSeconds`, `cadenceFps`, `strokeFraction`, `zones`, `penPath`)
- **Effects & Filters**:
  - `filters`: brightness, contrast, saturation, gamma, hue, sharpen, vignette
  - `transform`: scale, x, y, opacity
  - `speed`: playback speed multiplier
  - `text`: typography, position, align, box
  - `videoFade`: inFrames, outFrames, holdBlackFrames
- **Audio Controls**: `gainDb`, `fadeInFrames`, `fadeOutFrames`, `sourceAudioEnabled`, `duckExempt`
- **Markers**: cue markers with locked sync status and editorial notes

### 2.2 Dual-Mode Import
- **Mode A: Sync & Patch**: Keeps existing tracks and placement; matches clips by shot ID, file name, or ordinal and applies durations, transitions, motions, and sketches.
- **Mode B: Full Reconstruction**: Recreates the entire multi-track timeline, clips, timestamps, and effects from scratch based on the JSON file.
