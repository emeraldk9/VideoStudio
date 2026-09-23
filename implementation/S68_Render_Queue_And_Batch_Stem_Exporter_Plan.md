# Milestone S68: Render Queue & Multi-Format Batch Stem Exporter

**Status:** Completed & Verified ✅  
**Scope:** Background render queue manager, broadcast codecs (ProRes 422 HQ, DNxHD, HEVC 10-bit, 24-bit WAV), audio stems delivery (DIA / MUS / SFX / MST), and two-pass encoding.

---

## 1. Executive Summary
In broadcast television, Hollywood film post-production, and commercial advertising delivery, editors rarely export a single video manually and wait. Instead:
1. **Deliverables require separated Audio Stems:**
   - **DIA**: Dialogue, sync production audio, voiceover, and narration.
   - **MUS**: Music beds and background tracks.
   - **SFX**: Sound effects, foley, and ambient sound design.
   - **MST**: Full master stereo mix.
   These stems allow international localization (dubbing), trailer re-mixing, and broadcast compliance.
2. **Deliverables require professional Broadcast Codecs:**
   - **Apple ProRes 422 HQ** (`.mov`): Industry standard for Apple/broadcast post-production master delivery.
   - **Avid DNxHD / DNxHR** (`.mov`/`.mxf`): Standard offline/online interchange codec for Avid Media Composer workflows.
   - **HEVC / H.265 10-bit HDR** (`.mp4`): Next-gen web and HDR distribution with 50% bitrate efficiency over H.264.
   - **Uncompressed Broadcast WAV** (`.wav`): 24-bit 48kHz lossless master audio.
3. **Background Render Queue:**
   - Editors queue multiple sequence exports, format variations, and stem packages, letting them render sequentially or overnight while keeping track of progress, errors, and output artifacts.

---

## 2. Technical Architecture & Component Breakdown

### 2.1 Pure Stem Operations (`src/shared/utils/timeline/audio-stem-ops.ts`)
- `AudioStemType`: `'master' | 'dialogue' | 'music' | 'sfx'`.
- `AUDIO_STEM_CONFIGS`: Metadata including stem label, suffix (`_DIA`, `_MUS`, `_SFX`, `_FULLMIX`), color badge, and role/bus mappings.
- `filterClipsForStem(clips, tracks, stemType, routingMap)`: Isolates audio clips belonging to the requested stem.
- `generateStemOutputPaths(baseOutputPath, selectedStems, format)`: Creates standardized deliverable file paths.
- `buildStemExportBatch(request, selectedStems)`: Converts a single export request into a multi-job stem export package.

### 2.2 Broadcast Codecs & Delivery Presets (`src/shared/utils/timeline/export-presets.ts`)
- Extended `RenderDeliveryFormat` / `RenderVideoCodec`:
  - `mp4` (H.264 / AAC)
  - `hevc` (H.265 10-bit / AAC)
  - `prores` (ProRes 422 HQ 10-bit / PCM 24-bit)
  - `dnxhd` (DNxHD / DNxHR / PCM 16-bit)
  - `webm` (VP9 / Opus)
  - `wav` (Uncompressed 24-bit 48kHz audio)
  - `gif` (Looping animated GIF)
- Two-Pass encoding parameter (`twoPass?: boolean`).
- Extended preset ladder:
  - `Apple ProRes 422 HQ Master`
  - `Avid DNxHD Broadcast Master`
  - `HEVC 10-bit HDR Stream`
  - `YouTube 4K Ultra 60Mbps`
  - `TikTok / Reels 9:16 Vertical`
  - `Broadcast Audio Stems (WAV 24-bit 48kHz)`

### 2.3 Render Queue State Management (`src/renderer/features/timeline-render/model/useRenderQueueStore.ts`)
- Zustand store tracking:
  - `jobs: RenderQueueJob[]`
  - `activeJobId: string | null`
  - `isProcessing: boolean`
  - `isPaused: boolean`
- Actions:
  - `enqueue(job)` / `enqueueBatch(jobs)`
  - `remove(jobId)`
  - `clearCompleted()`
  - `startQueue()` / `pauseQueue()`
  - `cancel(jobId)`
  - `retry(jobId)`
- Automatic sequential runner that invokes `window.api.sequence.render` for each queued job and tracks real-time progress.

### 2.4 Render Queue Drawer UI (`src/renderer/features/timeline-render/ui/RenderQueueDock.tsx`)
- Sleek floating/docked modal displaying:
  - Queue summary header: Status pills (`Active`, `Paused`, `Idle`), job counter, Start/Pause, Clear buttons.
  - Job card list with sequence name, preset badge, output file path, progress bar with step breakdown, duration, time elapsed, and controls (Cancel, Reveal in Folder, Delete, Retry).

### 2.5 ExportModal Integration (`src/renderer/features/timeline-render/ui/ExportModal.tsx`)
- "Add to Render Queue" secondary action beside "Export Now".
- Audio Stem Multi-Select checkboxes (`DIA`, `MUS`, `SFX`, `MST`).
- Broadcast Codec dropdown selector (`H.264`, `HEVC 10-bit`, `ProRes 422 HQ`, `DNxHD`).
- Two-Pass encoding toggle switch.
- "View Render Queue" button with badge indicator showing queued jobs count.

### 2.6 Backend Synthesis (`src/main/media/sequence-render-service.ts` & `src/main/media/sequence-normalize.ts`)
- Support `stemType` in `SequenceRenderRequest`: filters placed audio clips in `toSegments` by stem category (`dialogue`, `music`, `sfx`) or bus routing.
- Support `prores`, `dnxhd`, `hevc`, `wav` in `buildTranscodeArgs`.

---

## 3. Verification Plan
- Unit tests:
  - `src/shared/utils/timeline/__tests__/audio-stem-ops.test.ts` (all stem isolation, naming, and batch generation logic).
  - `src/shared/utils/timeline/__tests__/export-presets.test.ts` (broadcast presets, transcode arguments, codec flags).
- TypeScript static typecheck: `npm run typecheck` (`tsc --noEmit`) with 0 errors.
- Vitest suite: `npx vitest run` with 100% pass rate.
