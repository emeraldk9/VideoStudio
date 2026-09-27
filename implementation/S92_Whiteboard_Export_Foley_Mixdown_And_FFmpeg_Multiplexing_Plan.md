# Milestone S92: Whiteboard Export Foley Mixdown & FFmpeg Audio Multiplexing Plan

## Overview
Milestone S92 bridges procedural whiteboard foley synthesis (built in S91) into the final export pipelines of both the standalone Python whiteboard engine (`srt-whiteboard-animation-main`) and the desktop NLE (`VideoStudio`).
When users render whiteboard animations—either via CLI batch workflow or in VideoStudio's timeline export—the synthesized drawing sounds (pen nib scratching, marker squeaks, chalk grit & taps, pencil tooth) are dynamically multiplexed with the video and balanced alongside voiceover narration audio.

---

## Architecture & Workflow

### 1. Python Whiteboard Engine (`srt-whiteboard-animation-main`)
```
[RegionStreamRenderer / Annotation]
            │
            ├─► Video Frames ──► raw_video.mp4 ──┐
            │                                    ▼
            └─► Pen Trajectory (t, x, y) ──► audio_foley.export_foley_to_wav()
                                                 │
                                                 ▼
                                            scene_foley.wav
                                                 │
                                                 ▼
               FFmpeg Multiplex [raw_video + scene_foley]
                                 │
                                 ▼
                          scene-whiteboard.mp4
                                 │
                     (Multiple Scenes Concatenation)
                                 │
                                 ▼
                         merged_video.mp4 (with Foley Audio)
                                 │
                    FFmpeg amix (Foley + SRT Voiceover)
                                 │
                                 ▼
                     final_whiteboard.mp4 (Perfect Sync)
```

1. **`scripts/render_stream_whiteboard.py`**:
   - Record frame-by-frame pen tip coordinates and timestamps during `RegionStreamRenderer.render_to()`.
   - Add CLI options `--foley` (boolean default True), `--foley-volume` (float default 0.6), `--foley-wav`.
   - Synthesize scene foley WAV using `export_foley_to_wav()` from `core/audio_foley.py`.
   - In `transcode_h264()`, multiplex the foley audio stream into the output MP4 with AAC 192kbps.

2. **`scripts/batch_pipeline.py`**:
   - Add `--foley` (default True), `--foley-volume` (default 0.6), `--stylus` (default 'pen') flags.
   - Forward foley settings to `render_stream_whiteboard.py`.
   - Enhance `mix_audio()`: detect if `video_path` contains an audio stream. If voiceover audio is supplied, use FFmpeg `amix=inputs=2:duration=first:dropout_transition=2` with volume attenuation `[0:a]volume={foley_vol}[f];[1:a]volume=1.0[v];[f][v]amix`.
   - If no voiceover audio is passed, the foley audio stream remains the primary audio track.

3. **`scripts/test_engine.py`**:
   - Add Test 13: `test_batch_pipeline_foley_mixdown` validating foley audio stream multiplexing and `mix_audio` amix filtergraph execution.

---

### 2. VideoStudio Desktop NLE (`src/main/media`)
```
[Timeline Still Clip with Whiteboard Effect]
            │
            ├─► whiteboard.foleyEnabled !== false
            ├─► whiteboard.stylus (pen/marker/pencil/chalk)
            ├─► whiteboard.foleyVolume (default 0.6)
            ├─► whiteboard.drawDuration / clip.durationFrames
            │
            ▼
[src/main/media/whiteboard-foley-node.ts]
            │ Pure TS 16-bit PCM WAV synthesizer (2-pole IIR filter + velocity envelope)
            ▼
workDir/whiteboard-foley-<clipId>.wav
            │
            ▼
[sequence-render-service.ts: buildAudioStage]
            │
            ▼
Added to Audio Timeline Dub Segments at `startSeconds = framesToSeconds(clip.startFrame)`
            │
            ▼
FFmpeg audio timeline mixdown (`audio.wav` / `audio-music.wav` / `amix`)
            │
            ▼
Final Muxed Master Deliverable (`master.mp4` / delivery formats)
```

1. **`src/main/media/whiteboard-foley-node.ts`**:
   - Zero-dependency Node.js implementation of procedural foley sound synthesis.
   - Generates 16-bit PCM stereo WAV buffer with valid RIFF header.
   - Implements identical 2-pole IIR bandpass DSP difference equations and material resonant profiles (`pen`, `marker`, `pencil`, `chalk`, `eraser`).
   - Supports velocity envelope modulation from pen points or synthetic drawing envelope based on `drawSeconds`.

2. **`src/main/media/sequence-render-service.ts`**:
   - In `buildAudioStage`, detect video/still clips on active video tracks carrying `effects.whiteboard` with `foleyEnabled !== false`.
   - Synthesize procedural foley WAV into render work directory.
   - Insert as dub segment into audio bed at the clip's timeline offset.
   - Modulate segment volume by `whiteboard.foleyVolume` (default 0.6) and track volume.

3. **Automated Unit & Integration Tests**:
   - Create `src/main/media/__tests__/whiteboard-foley-node.test.ts`.
   - Verify RIFF header, sample rate (44100), stereo channel layout, non-zero RMS energy, volume scaling, and stylus frequency response.
   - Run Vitest suite (`npm test`) and typecheck (`tsc --noEmit`).

---

## Execution Plan & Milestones

- [x] **Phase 1: Standalone Python Engine Foley Multiplexing**
  - [x] Update `scripts/render_stream_whiteboard.py`: record pen trajectory timestamps, add `--foley`/`--foley-volume`, multiplex foley WAV in `transcode_h264()`.
  - [x] Update `scripts/batch_pipeline.py`: support `--foley`, `--foley-volume`, `--stylus`, and implement two-input `amix` in `mix_audio()`.
  - [x] Add Test 13 to `scripts/test_engine.py` and verify all 13 tests pass.

- [x] **Phase 2: VideoStudio Node Procedural Foley Synthesizer**
  - [x] Create `src/main/media/whiteboard-foley-node.ts` with pure TS 16-bit PCM WAV generation and 2-pole IIR bandpass filtering.
  - [x] Create `src/main/media/__tests__/whiteboard-foley-node.test.ts` and verify unit test passes (6/6 tests passing).

- [x] **Phase 3: VideoStudio Timeline Export Mixdown Integration**
  - [x] Update `src/main/media/sequence-render-service.ts` in `buildAudioStage` to detect whiteboard clips and include foley dub segments.
  - [x] Verify timeline audio mix tests and sequence render tests.

- [x] **Phase 4: Full Verification & Validation**
  - [x] Run Python test suite (`scripts/test_engine.py` -> 13/13 passing).
  - [x] Run VideoStudio full test suite (`npm test` -> 77/77 test files, 958/958 tests passing).
  - [x] Verify `npm run typecheck` (`tsc --noEmit` -> clean exit code 0).
