# Step 10: Media Panel Audit & Watermark Removal Resolution

## Executive Summary
This step addresses two fundamental usability and functionality defects in VideoStudio:
1. **Media Panel Vertical Scrolling Failure**: Assets in the media pool / `FilesPane` could not be scrolled vertically because TanStack Virtual's row virtualizer expanded unbounded inside an unconstrained block container whose outer wrapper had `overflow-hidden`.
2. **Watermark Removal Not Working**: The watermark cleaning system was incomplete end-to-end:
   - `MediaTile` did not expose any UI action or prop for watermark removal.
   - `PoolSelectionBar` had no batch watermark removal button.
   - Story shots had no watermark removal triggers.
   - `preload.ts` returned empty stubs for `listPresets`, `frame`, `preview`, `getBatch`.
   - `watermark-ipc.ts` had mock handlers that never executed `StillWatermarkRemover` or `VideoWatermarkRemover`.
   - Missing IPC channels and Zod schemas for watermark frame preview and preset listings.

---

## Progress Tracking

- [x] **Phase 1: Media Panel Layout & Vertical Scrolling Audit & Fixes**
  - [x] Fixed flex container hierarchy in `FilesPane.tsx` (`flex min-h-0 flex-1 flex-col overflow-hidden p-2`) so `MediaGrid` has explicit bounded height.
  - [x] Ensured `MediaGrid.tsx` scroll container has `h-full w-full min-h-0 flex-1 overflow-y-auto`.
  - [x] Ensured `SketchPane.tsx` settings column has `min-h-0 flex-1 overflow-y-auto`.
  - [x] Wrapped `PoolSelectionBar.tsx` in a dedicated, styled footer bar (`border-t border-hairline/80 bg-bg-sidebar/90 px-3 py-2 shrink-0`) so it doesn't break flex layout.

- [x] **Phase 2: MediaTile & Pool Selection Watermark Action Integration**
  - [x] Added `onCleanWatermark` prop to `MediaTileProps` and rendered hover button (`auto_fix_high` icon).
  - [x] Passed `onCleanWatermark` in `FilesPane.tsx` for both imported media files and story shots (stills and videos).
  - [x] Added "Clean Watermark" button to `PoolSelectionBar.tsx` when media items are selected.

- [x] **Phase 3: IPC Protocol, Schemas & Preload Bridge**
  - [x] Registered channels in `ipc-channels.ts` (`WATERMARK_LIST_PRESETS`, `WATERMARK_FRAME`, `WATERMARK_PREVIEW`, `WATERMARK_GET_BATCH`).
  - [x] Updated `WATERMARK_START_BATCH` schema in `ipc-schemas.ts` to match real payload (`sources`, `region`, `outputMode`, `lossless`, etc.).
  - [x] Added schemas in `ipc-schemas.ts` for presets, frame, preview, getBatch.
  - [x] Connected `preload.ts` to invoke these IPC channels.

- [x] **Phase 4: Main Process Watermark Engine Implementation**
  - [x] Implemented `watermark-ipc.ts` handlers:
    - `listPresets`: Returns `WATERMARK_PRESETS`.
    - `frame`: Extracts frame using ffmpeg, probes dimensions, writes preview cache PNG, returns `WatermarkFrameResult`.
    - `preview`: Detects mark / rect, cleans preview frame using `StillWatermarkRemover` or unblend, returns `WatermarkPreviewResult`.
    - `startBatch`: Processes items using `StillWatermarkRemover` (stills) and `VideoWatermarkRemover` (videos), writes derive/replace files, updates database with `markMediaCleaned`, relinks clips with `relinkClipSources`, broadcasts progress via `IPC_EVENTS.WATERMARK_PROGRESS`.
    - `getBatch`: Returns batch status and processed items.
  - [x] Passed `sequences` and `windowManager` into `registerWatermarkIpc` in `bootstrap.ts`.
  - [x] Added resilient in-process fallback in `watermark-still.ts` / `watermark-worker.ts`.

- [x] **Phase 5: Verification & Testing**
  - [x] Created and executed unit tests in `watermark-audit.test.ts` (all 29 vitest tests passing).
  - [x] Ran `npm run typecheck` (`tsc --noEmit`) with 0 errors.
  - [x] Documented walkthrough.
