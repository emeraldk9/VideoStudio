# Step 11: Comprehensive App Audit and Defect Resolution Plan

**Status**: In Progress  
**Author**: VideoStudio Core Engineering  
**Scope**: Full application functional and structural audit covering IPC channels, Preload bridges, Watermark pickers & inpaint engine, Audio playback volume scaling, Story project initialization, and App-level event synchronization.

---

## 1. Executive Summary & Audit Findings

During the full app audit across architecture, IPC, renderer, state management, and media rendering, the following 6 key gaps and defects were discovered:

1. **Watermark Removal External File & Directory Pickers & Clean Status Gaps**:
   - `window.api.watermark.pickExternalFiles` and `pickExportDir` were stubbed to return `[]` and `null` in `src/preload/preload.ts`, making external file additions and custom export folder selection non-functional.
   - `window.api.watermark.cleanStatus` was returning `{}` in `preload.ts`, which caused the Export Preflight check in `ExportModal.tsx` to mark every watermark target as uncleaned even when already cleaned.
   - Main IPC lacked registration and token resolution for external files and export directory paths.

2. **Watermark Inpainting Model Store Disconnection**:
   - `InpaintModelStore` in `src/main/media/watermark-model-store.ts` and `InpaintEngine` in `src/main/media/watermark-inpaint.ts` were fully implemented with SHA-256 verification and DirectML/CPU execution providers, but lacked IPC wiring in `watermark-ipc.ts` and were stubbed out in `preload.ts`.

3. **Audio Mixer & Track Volume Scaling in Preview**:
   - `TimelinePreview.tsx` ignored track-level volume multipliers (`track?.volume ?? 1`) in both `sourceAudioVolume` (video clip audio) and `audioPlaced` (audio tracks), causing slider adjustments in the track headers and `AudioMixerDock` to have no effect on live playback volume.

4. **Project Sequence Creation Race Condition in Veo3Flow Story Import**:
   - When creating a story project in `ProjectModal.tsx`, `placeAllOnTimeline` was invoked before `useSequenceStore` opened or created a sequence document for the new project, causing timeline placement to either throw an error ("No active sequence") or accidentally overwrite the previous project's sequence.

5. **Missing App-Level IPC Event Synchronization**:
   - While `preload.ts` exposed `onSequenceRenderProgress`, `onWatermarkProgress`, and `onVeo3FlowFolderUpdated`, no listener was registered in `src/renderer/` to connect these events to `useSequenceStore.setRenderProgress`, `useWatermarkProgressStore.setProgress`, and `useVeo3FlowStore.handleFolderUpdated`.
   - As a result, render progress bars and watermark progress dialogs did not update in real-time.

6. **Appearance Boot Initialization**:
   - `applyAppearance` was never called on initial mount in `App.tsx`, causing user preferences for themes (Dark, OLED Midnight, Cinema Slate, Light), accent colors, and UI density to not apply upon application restart until settings were re-saved.

---

## 2. Planned Changes

| Component | Target File | Description |
|-----------|-------------|-------------|
| Shared IPC | `src/shared/ipc/ipc-channels.ts` | Add channels for inpaint status, model download/removal/cancel, file & directory pickers, and clean status. Add `WATERMARK_MODEL_DOWNLOAD` event. |
| Shared Schemas | `src/shared/ipc/ipc-schemas.ts` | Add Zod schema validations for the new watermark IPC channels. |
| Main IPC | `src/main/ipc/watermark-ipc.ts` | Implement pickers via `showOpenDialog`, token minting via `ExternalPathTokens`, clean status checks, directory export copies, and inpaint model store handlers. |
| Preload Bridge | `src/preload/preload.ts` | Connect all watermark methods to real IPC invokes and expose `onWatermarkModelDownload`. |
| Timeline Preview | `src/renderer/features/timeline-preview/ui/TimelinePreview.tsx` | Scale video audio and audio tracks by `track?.volume ?? 1`. |
| Project Management | `src/renderer/features/project-management/ui/ProjectModal.tsx` | Ensure sequence is initialized before calling `placeAllOnTimeline`. |
| Renderer App | `src/renderer/app/useIpcSynchronizer.ts` | Create global IPC synchronizer hook for render, watermark, and story sync events. |
| Renderer App | `src/renderer/app/App.tsx` | Mount `useIpcSynchronizer` and apply stored appearance on startup. |
| Test Suite | `src/shared/utils/timeline/__tests__/audit-defects.test.ts` | Add test coverage for all new schemas, volume calculations, and tokens. |

---

- [x] Add IPC channels and schemas in `src/shared/ipc/`
- [x] Implement picker and inpaint handlers in `src/main/ipc/watermark-ipc.ts`
- [x] Connect IPC handlers in `src/preload/preload.ts`
- [x] Fix track volume scaling in `src/renderer/features/timeline-preview/ui/TimelinePreview.tsx`
- [x] Fix project sequence initialization in `src/renderer/features/project-management/ui/ProjectModal.tsx`
- [x] Create `useIpcSynchronizer.ts` and integrate in `src/renderer/app/App.tsx`
- [x] Add unit test suite and run verification (`5 test files, 32 passed; tsc clean`)
