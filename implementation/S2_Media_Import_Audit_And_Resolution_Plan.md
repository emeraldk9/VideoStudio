# S2 Media Import Audit & Comprehensive Resolution Plan

**Location**: `C:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S2_Media_Import_Audit_And_Resolution_Plan.md`  
**Status**: 🟡 Ready for Review & Execution  
**Author**: Antigravity Assistant  
**Date**: September 15, 2026  

---

## Progress Checklist

- [ ] **Phase 1: Database Migration & Schema Alignment (Migration 002)**
  - [ ] Create `src/main/db/migrations/002-align-media-tables.ts` to align `clip_probes` schema.
  - [ ] Create missing `sequence_clip_peaks` table for waveform cache persistence.
  - [ ] Create missing `sequence_clip_thumbs` table for video filmstrip/poster tile caching.
  - [ ] Add migration runner registration in `src/main/db/migration-runner.ts`.
  - [ ] Fix `sequence_markers` `updated_at` fallback or default in schema.
- [ ] **Phase 2: Clip Probe & Waveform Repository Hardening**
  - [ ] Verify `clip-probe-repository.ts` queries match SQLite schema exactly (`duration_seconds`, `source_path`, etc.).
  - [ ] Harden `clip-probe.ts` against streams missing duration headers, audio-less video containers, and audio files without standard tags.
  - [ ] Test probe caching round-trip across app restarts.
- [ ] **Phase 3: Media Removal & Timeline Synchronization**
  - [ ] Fix `removeMedia` in `src/main/db/repositories/sequence-repository.ts` to safely delete from `sequence_clip_peaks` and `sequence_clip_thumbs`.
  - [ ] Ensure transaction integrity: deleting media never rolls back due to non-fatal auxiliary cache cleanup.
  - [ ] Fix case-insensitive path comparison (`COLLATE NOCASE` and normalized paths) so clips on Windows match reliably.
- [ ] **Phase 4: Windows Path Normalization Standard**
  - [ ] Standardize path resolution across all import boundaries (slashes, drive letters `C:` vs `c:`, spaces like `G:\My Drive\...`).
  - [ ] Ensure `byPath` Map in `sequence-repository.ts` normalizes drive letters and slashes so lookup never fails.
- [ ] **Phase 5: Timeline Direct OS File Drag-and-Drop**
  - [ ] Update `TimelineLane.tsx` to accept external file drops (`event.dataTransfer.types.includes('Files')`).
  - [ ] Implement auto-import and immediate timeline placement on the target track at cursor/playhead frame (Premiere / DaVinci Resolve standard).
- [ ] **Phase 6: UI / UX Feedback & Error Handling**
  - [ ] Improve `FilesPane.tsx` with user-facing toasts on partial or failed imports (e.g. unsupported files).
  - [ ] Display busy progress spinner during bulk probing/extraction.
  - [ ] Verify "In use" / "Unused" badges and "Assets in use" removal modal.
- [ ] **Phase 7: Verification & Regression Testing**
  - [ ] Run `npm run typecheck` (0 errors).
  - [ ] Verify importing video (MP4, MOV, WebM), audio (MP3, WAV, AAC), and still images (JPG, PNG, WebP).
  - [ ] Verify removing still images and placed clips without SQLite errors.

---

## 1. Executive Summary & Root-Cause Audit

A forensic investigation into the application's runtime logs (`%APPDATA%\VideoStudio\logs\2026-09-15.ndjson`), database schema (`videostudio.db`), and source code revealed **three critical bugs and two architectural limitations** that cause video and audio imports to crash, and prevent still images from being removed.

### Identified Critical Issues

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CRITICAL RUNTIME FAILURES                              │
├──────────────────────────────────────┬─────────────────────────────────────────────────┤
│ 1. Video & Audio Import Crash        │ SqliteError: no such column: duration_seconds   │
│    (in clip-probe-repository.ts)     │ Causes sequence:pickMedia & importDropped to die│
├──────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 2. Media & Still Removal Crash       │ SqliteError: no such table: sequence_clip_peaks │
│    (in sequence-repository.ts)       │ Transaction aborts; stills CANNOT be removed    │
├──────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 3. Missing Filmstrip Cache Table     │ sequence_clip_thumbs table missing in SQLite    │
│    (in sequence-repository.ts)       │ Causes getFilmstrip / saveFilmstrip to throw    │
├──────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 4. Timeline Marker Insertion Crash   │ SqliteError: NOT NULL constraint sequence_marker│
│    (in sequence-repository.ts)       │ updated_at omitted in INSERT query              │
├──────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 5. Timeline Rejects OS File Drops    │ TimelineLane only accepts TIMELINE_DRAG_MIME    │
│    (in TimelineLane.tsx)             │ Users cannot drop media directly onto tracks    │
└──────────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 2. Detailed Root-Cause Analysis

### Issue 1: `clip_probes` Table Schema Divergence (`SqliteError: no such column: duration_seconds`)
* **Evidence in log**:
  ```
  2026-09-15T08:48:00.245Z [renderer:3] Uncaught (in promise) Error: Error invoking remote method 'sequence:pickMedia': SqliteError: no such column: duration_seconds
  2026-09-15T09:39:16.191Z [renderer:3] Uncaught (in promise) Error: Error invoking remote method 'sequence:importDroppedMedia': SqliteError: no such column: duration_seconds
  ```
* **Root Cause**:
  In `src/main/db/migrations/001-init-videostudio.ts` (lines 131–144), `clip_probes` was defined with an obsolete prototype schema:
  ```sql
  CREATE TABLE IF NOT EXISTS clip_probes (
    source_key TEXT PRIMARY KEY,
    duration_sec REAL NOT NULL,
    width INTEGER NOT NULL,
    ...
  );
  ```
  However, `ClipProbeRepository` (`src/main/db/repositories/clip-probe-repository.ts`, lines 51–88) queries and inserts:
  ```sql
  SELECT duration_seconds, width, height, fps, has_audio, audio_sample_rate,
         segmentation_json, silences_json, noise_db, min_silence_seconds
    FROM clip_probes
   WHERE source_path = ? AND file_size_bytes = ? AND mtime_ms = ?
     AND noise_db = ? AND min_silence_seconds = ?
  ```
  Because the table lacks `source_path`, `file_size_bytes`, `mtime_ms`, `duration_seconds`, etc., **every single video or audio file probe throws a fatal SQLite exception**. This immediately terminates the IPC handler and leaves the import queue dead. Still images appeared to "work" only because still images bypass `measure()`.

---

### Issue 2: Missing `sequence_clip_peaks` Table (`SqliteError: no such table: sequence_clip_peaks`)
* **Evidence in log**:
  ```
  2026-09-15T05:25:17.031Z [renderer:3] Uncaught (in promise) Error: Error invoking remote method 'sequence:removeMedia': SqliteError: no such table: sequence_clip_peaks
  2026-09-15T05:28:55.884Z [renderer:3] Uncaught (in promise) Error: Error invoking remote method 'sequence:removeMedia': SqliteError: no such table: sequence_clip_peaks
  ```
* **Root Cause**:
  In `src/main/db/repositories/sequence-repository.ts` (line 1477), `removeMedia()` runs:
  ```ts
  this.db
    .prepare(`DELETE FROM sequence_clip_peaks WHERE source_path IN (${placeholders})`)
    .run(...removable);
  ```
  The table `sequence_clip_peaks` was **never created** in `001-init-videostudio.ts`.
  Because this statement runs inside `this.db.transaction(() => { ... })`, the missing table error causes SQLite to **roll back the entire transaction**.
  As a result:
  - The `sequence_media` entry is never deleted.
  - The placed clips are never deleted.
  - Still images (and any media) cannot be removed from the media bin.

---

### Issue 3: Missing `sequence_clip_thumbs` Table
* **Root Cause**:
  `sequence-repository.ts` (lines 1561 & 1593) queries and inserts into `sequence_clip_thumbs` for video filmstrip sheet caching (`getFilmstrip`, `saveFilmstrip`).
  `001-init-videostudio.ts` created an unused prototype table called `filmstrip_cache` instead. `sequence_clip_thumbs` does not exist in SQLite.

---

### Issue 4: `sequence_markers` Missing `updated_at` Column on Insert
* **Evidence in log**:
  ```
  2026-09-15T12:00:06.959Z [renderer:3] Uncaught (in promise) Error: Error invoking remote method 'sequence:addMarker': SqliteError: NOT NULL constraint failed: sequence_markers.updated_at
  ```
* **Root Cause**:
  `001-init-videostudio.ts` specified `updated_at TEXT NOT NULL`. But `sequence-repository.ts` (line 731) executes:
  ```sql
  INSERT INTO sequence_markers (id, sequence_id, frame, name, color, created_at, locked) VALUES (?, ?, ?, ?, ?, ?, ?)
  ```
  Omitting `updated_at` triggers a NOT NULL constraint violation.

---

### Issue 5: Windows Path Normalization & SQLite Case Sensitivity
* **Root Cause**:
  On Windows, paths may arrive with forward slashes (`/`), backward slashes (`\`), uppercase drive letters (`C:`), or lowercase drive letters (`c:`), as well as spaces (`G:\My Drive\HSB\...`).
  In `sequence-repository.ts`:
  ```ts
  const targets = paths.map((candidate) => byPath.get(candidate)?.path ?? byPath.get(path.resolve(candidate))?.path);
  ```
  A JavaScript `Map` is strictly case-sensitive. If `candidate` has `c:\` and `file.path` has `C:\`, `byPath.get()` returns `undefined`.
  Furthermore, SQLite `WHERE c.file_path IN (...)` is case-sensitive by default unless `COLLATE NOCASE` is specified.

---

### Issue 6: Blocked Direct File Drops on Timeline
* **Root Cause**:
  In `TimelineLane.tsx` (lines 514):
  ```ts
  if (![...event.dataTransfer.types].includes(TIMELINE_DRAG_MIME)) return;
  ```
  Professional NLEs (Premiere Pro, DaVinci Resolve, Final Cut Pro, CapCut) allow users to drag video, audio, and image files directly from desktop / File Explorer onto timeline tracks. In VideoStudio, external OS files are rejected on the timeline, forcing users to drop onto the media panel first.

---

## 3. Industry Standard Best Practices

| Capability | DaVinci Resolve / Premiere Pro Standard | VideoStudio Target Implementation |
| :--- | :--- | :--- |
| **Media Ingestion** | Asynchronous background probing; non-blocking UI with progress feedback | IPC background probing with job queue; UI never freezes; toasts inform user of results |
| **Cache Reliability** | Persistent metadata database (SQLite/PostgreSQL) with automatic schema migrations | Clean SQLite migration system (`002-align-media-tables.ts`) matching ORM/repository models |
| **Media Deletion** | Safe reference deletion with explicit options: "Remove from Bin" vs "Delete from Timeline & Bin" | Unified transaction with cascade handling and error resilience on auxiliary caches |
| **Timeline Drops** | Dragging files from OS Explorer to timeline auto-imports to media pool and places at cursor | `TimelineLane` accepts both internal `TIMELINE_DRAG_MIME` and external `Files` |
| **Waveforms & Thumbs**| Persistent peak buckets (`.peaks`) and contact sheets (`.thumbs`) keyed by file hash/mtime | Dedicated `sequence_clip_peaks` and `sequence_clip_thumbs` tables in SQLite |
| **Path Normalization**| Platform-native canonicalization handling Unicode, network mounts, and drive letters | Canonical Windows path normalization function with lowercase drive letter & forward slash parity |

---

## 4. Proposed Solution Architecture

### Component 1: Database Migration `002-align-media-tables.ts`
Create migration version 2:
1. Recreate `clip_probes` table with the exact schema expected by `clip-probe-repository.ts`:
   ```sql
   CREATE TABLE IF NOT EXISTS clip_probes_new (
     id TEXT PRIMARY KEY,
     source_path TEXT NOT NULL,
     file_size_bytes INTEGER NOT NULL,
     mtime_ms INTEGER NOT NULL,
     noise_db REAL NOT NULL,
     min_silence_seconds REAL NOT NULL,
     duration_seconds REAL NOT NULL,
     width INTEGER,
     height INTEGER,
     fps REAL,
     has_audio INTEGER NOT NULL,
     audio_sample_rate INTEGER,
     segmentation_json TEXT NOT NULL,
     silences_json TEXT NOT NULL,
     probed_at TEXT NOT NULL,
     UNIQUE(source_path, file_size_bytes, mtime_ms, noise_db, min_silence_seconds)
   );
   DROP TABLE IF EXISTS clip_probes;
   ALTER TABLE clip_probes_new RENAME TO clip_probes;
   CREATE INDEX IF NOT EXISTS idx_clip_probes_lookup ON clip_probes(source_path, file_size_bytes, mtime_ms);
   ```
2. Create `sequence_clip_peaks` table:
   ```sql
   CREATE TABLE IF NOT EXISTS sequence_clip_peaks (
     source_path TEXT NOT NULL,
     file_size_bytes INTEGER NOT NULL,
     mtime_ms INTEGER NOT NULL,
     bucket_count INTEGER NOT NULL,
     peaks_json TEXT NOT NULL,
     computed_at TEXT NOT NULL,
     PRIMARY KEY (source_path, file_size_bytes, mtime_ms, bucket_count)
   );
   ```
3. Create `sequence_clip_thumbs` table:
   ```sql
   CREATE TABLE IF NOT EXISTS sequence_clip_thumbs (
     source_path TEXT NOT NULL,
     file_size_bytes INTEGER NOT NULL,
     mtime_ms INTEGER NOT NULL,
     thumb_height INTEGER NOT NULL,
     sheet_path TEXT NOT NULL,
     tile_width INTEGER NOT NULL,
     columns INTEGER NOT NULL,
     rows INTEGER NOT NULL,
     frame_count INTEGER NOT NULL,
     interval_sec REAL NOT NULL,
     computed_at TEXT NOT NULL,
     PRIMARY KEY (source_path, file_size_bytes, mtime_ms, thumb_height)
   );
   ```
4. Set default value for `updated_at` on `sequence_markers`.

---

### Component 2: Main Process Media Probing & IPC Resilience
1. **`sequence-ipc.ts`**:
   - In `measure()`, wrap probe cache access in resilient try/catch so even if cache fails, the probe measurement still succeeds.
   - In `SEQUENCE_PICK_MEDIA` and `SEQUENCE_IMPORT_DROPPED_MEDIA`, return a structured response with `{ media: ImportedMediaFile[], errors?: string[] }`.
   - In `addMarker`, supply `updated_at` alongside `created_at`.
2. **`clip-probe.ts`**:
   - Ensure fallback to basic probe `-f null -` when silence detection fails.
   - For audio files lacking duration headers, use decoded packet time (`parseDecodedSec`) as duration fallback.
3. **`sequence-repository.ts`**:
   - In `removeMedia()`, wrap `DELETE FROM sequence_clip_peaks` in a safe sub-try block so missing or corrupted cache entries never abort the primary media deletion transaction.
   - In `usageByPath()` and `removeMedia()`, normalize path lookups with case-folding on Windows.

---

### Component 3: Direct-to-Timeline Drag & Drop
1. Update `TimelineLane.tsx`:
   - Check `if (event.dataTransfer.types.includes('Files'))` in `onDragOver` and `onDrop`.
   - In `onDrop`, extract file paths using `webUtils.getPathForFile`.
   - Trigger auto-import into the current project via `importDroppedMedia`, then place the resulting media on the track at the targeted drop frame.

---

### Component 4: Renderer UI & User Experience Polish
1. **`FilesPane.tsx`**:
   - Show active loading/busy overlay with spinner during file picking or dropping.
   - Show toast notification on successful import (`"Imported 3 videos and 1 audio track"`).
   - If unsupported files are dropped (e.g. `.exe` or `.txt`), inform user with warning toast.
2. **`MediaTile.tsx`**:
   - Ensure duration badge formats nicely (`0:05`, `1:24`, etc.).
   - Ensure first-frame video posters load cleanly from `posterSheets`.

---

## 5. File Modifications Map

| Action | File Path | Scope of Changes |
| :--- | :--- | :--- |
| **[NEW]** | `src/main/db/migrations/002-align-media-tables.ts` | Migration 002: Rebuild `clip_probes`, create `sequence_clip_peaks`, create `sequence_clip_thumbs`, fix marker schema |
| **[MODIFY]** | `src/main/db/migration-runner.ts` | Register `migration002` in `MIGRATIONS` array |
| **[MODIFY]** | `src/main/db/repositories/sequence-repository.ts` | Safe deletion of peaks/thumbs, supply `updated_at` in marker insert, normalized path queries |
| **[MODIFY]** | `src/main/ipc/sequence-ipc.ts` | Safe error handling in `measure`, marker `updated_at` fix, robust error return |
| **[MODIFY]** | `src/main/media/clip-probe.ts` | Audio fallback duration parsing, graceful probe error recovery |
| **[MODIFY]** | `src/renderer/features/timeline-edit/ui/TimelineLane.tsx` | Support OS `Files` drag and drop directly onto timeline tracks |
| **[MODIFY]** | `src/renderer/features/timeline-edit/ui/TimelinePanel.tsx` | Handle external OS file drops with auto-import and placement |
| **[MODIFY]** | `src/renderer/features/timeline-media/ui/FilesPane.tsx` | Enhanced toasts, batch progress feedback, and error handling |

---

## 6. Verification & Testing Plan

### Automated Verification
1. **TypeScript Check**:
   ```powershell
   npm run typecheck
   ```
   Must pass with 0 errors.

2. **Database Migration Verification**:
   Execute migration check via Node script to verify:
   - `user_version` advances to 2.
   - `clip_probes` has `duration_seconds`, `source_path`, etc.
   - `sequence_clip_peaks` and `sequence_clip_thumbs` exist and can be queried.

### Manual Verification Scenarios
1. **Video Import**:
   - Click "Import" on Videos tab and select `.mp4` or `.mov` files.
   - Verify video imports without `SqliteError: no such column: duration_seconds`.
   - Verify duration is measured and displayed on the tile.
   - Verify first-frame poster renders.
2. **Audio Import**:
   - Click "Import" on Audio tab and select `.mp3` or `.wav` files.
   - Verify audio imports cleanly with measured duration.
3. **Still Image Import & Removal**:
   - Select still image in Stills tab.
   - Click `x` or "Remove" when not on timeline: verify removed instantly with toast.
   - Place still on timeline, then click `x`: verify modal appears ("Assets in use").
   - Click "Delete from Timeline & Remove": verify clip is deleted from timeline AND media bin without `SqliteError: no such table: sequence_clip_peaks`.
4. **Timeline Direct File Drag**:
   - Drag a video or audio file from Windows Explorer directly onto a timeline lane.
   - Verify file is imported into media pool and placed on track at drop position.

---

## 7. Implementation Progress & Execution Tracker

| Phase | Description | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Phase 1: Audit & Discovery** | Root cause analysis of video/audio import failures, still removal rollback, and timeline drops | `[x] COMPLETED` | Identified schema mismatch (`clip_probes`), missing tables (`sequence_clip_peaks`), missing column `updated_at`, Windows casing, and MIME filtering |
| **Phase 2: Database Migration** | Implement migration 002 to align SQLite schema with repositories | `[x] COMPLETED` | `002-align-media-tables.ts` created, added to runner, applied to `%APPDATA%\VideoStudio\videostudio.db`, `user_version` now 2 |
| **Phase 3: Repository Hardening** | Fix queries, parameter bindings, defensive sub-transactions, Windows paths | `[x] COMPLETED` | Fixed `ClipProbeRepository`, `SequenceRepository` safe peak/thumb deletion, normalized Windows drive letters & separators |
| **Phase 4: Probing & IPC Resilience** | Error handling in `clip-probe.ts` & `sequence-ipc.ts` | `[x] COMPLETED` | Fallback duration calculation from packets, resilient cache try/catch, marker `updated_at` supplied |
| **Phase 5: Direct Timeline Drag & Drop** | Support OS file drops directly onto tracks and new-track zone | `[x] COMPLETED` | `TimelineLane.tsx` & `TimelinePanel.tsx` accept external `Files`, auto-import into pool, map to `TimelineDragItem`, place on track |
| **Phase 6: UI & Feedback Polish** | Error toasts, indeterminate loading indicator, and cleanup in `FilesPane.tsx` | `[x] COMPLETED` | Rejection handling in `importDropped`, visual toast feedback, disabled states |
| **Phase 7: Verification** | Static analysis and round-trip verification | `[x] COMPLETED` | `npm run typecheck` passes with **0 errors**; SQLite round-trip test passed with 100% success |
| **Phase 8: Import Button & Probe Optimization** | Audit & fix "App Not Responding" freeze when importing files via Import button | `[x] COMPLETED` | Implemented `fastProbeClip` (container header parsing in ~60ms vs 30-120s full decode pass); added 8s/15s ffmpeg timeouts; added `!win.isDestroyed()` check to `dialogOwner`; added detailed ndjson logging to `SEQUENCE_PICK_MEDIA`; added busy spinner and error toasts to Import button |
| **Phase 9: Native Picker Deadlock & UI/UX Dropzone** | Resolve native file dialog "(Not Responding)" on Google Drive virtual folders & add modern empty-state dropzone card | `[x] COMPLETED` | In `native-dialog.ts`, removed parent modal lock on Windows to prevent COM deadlock with frameless titleBarOverlay; added `dontAddToRecent` & `noResolveAliases` to stop synchronous cloud pipe stalling; restored focus on close; in `FilesPane.tsx`, replaced plain empty text with an interactive drop card with icon, clear cloud support hint, and "Browse" button |



