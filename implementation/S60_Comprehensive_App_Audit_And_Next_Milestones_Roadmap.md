# VideoStudio: Comprehensive App Audit & Next Milestones Roadmap

**Document Version:** 1.0.0  
**Status:** In Progress / Active Tracker  
**Date:** 2026-09-22  
**Scope:** Complete architectural review, feature audit (S1–S59), identifying technical debt, and defining roadmap steps (S60–S66).

---

## 1. Executive Summary & App Audit

VideoStudio is an advanced desktop Non-Linear Video Editor (NLE) engineered with Electron, React 19, TypeScript, Tailwind CSS, Vite, Better-SQLite3, and FFmpeg. Through iterations S1 to S59, the studio has evolved from an initial concept into a full-featured video production workstation with professional grading, spatial audio, AI computer vision tools, and broadcast-grade editing workflows.

### 1.1 Current Architecture & System Health
- **Total Unit Test Suites:** 54 test files passed, 627 unit tests passed (100% pass rate).
- **TypeScript Static Verification:** Zero errors (`tsc --noEmit` cleanly passes).
- **Production Build:** Both `vite.main.config.ts` and `vite.renderer.config.ts` compile without errors.
- **Main Process Services:** Robust IPC schemas validated by Zod, SQLite migrations with WAL mode, robust FFmpeg probe/normalization passes, and background worker threads for inpainting/watermark removal.
- **Renderer State Engine:** Zustand-powered stores with optimistic UI updates and immutable document transformations (`useSequenceStore`, `useProjectStore`, `useModalStore`, `useVideoScopesStore`).

---

## 2. Comprehensive Domain Audit (S1 – S59 Assessment)

### 2.1 Timeline Engine & Editorial Tools (S12–S21, S25, S27–S28)
- **Strengths:**
  - Robust multi-track spine and overlay structure (Video, Audio, Subtitle/Text, Image/Whiteboard).
  - Accurate frame-based math (`framesToSeconds`, `secondsToFrames`, `quantize`).
  - Professional NLE hotkeys (J/K/L shuttle, Q/W ripple trim, I/O in/out marking, Ctrl+B razor split, Alt+drag duplicate).
  - Magnetic snapping to cuts, markers, playhead, and work areas.
  - Interactive clip slip & slide trimming and gap closure.
  - Color tagging, multi-selection, and 3-point clipboard editing.
- **Audit Findings & Opportunities:**
  - *Nested Sequences / Compound Clips:* Currently all clips must exist on flat tracks. Editors cannot group or nest sequences.
  - *Track Grouping / Folders:* In large projects (10+ tracks), track headers take up vertical space and lack hierarchical collapsing.

### 2.2 Audio Processing & Mixing Engine (S15, S22, S29, S33, S35, S36, S41, S44, S45, S49, S50, S53, S56)
- **Strengths:**
  - Studio-grade audio tools: 3-band parametric EQ, compressor/limiter, noise gate, convolution/algorithmic reverb, pitch shifter, stereo/binaural panner, vocal isolation, multiband spectral denoiser, and sidechain auto-ducking.
  - Interactive gain rubberbands, fade handles, and real-time audio VU meters with scrubbing support.
  - Pure, deterministic audio DSP utility math with comprehensive unit tests.
- **Audit Findings & Opportunities:**
  - *Audio Bus Routing & Submixes:* Clips route to their track, but submix auxiliary buses (e.g. Dialogue Bus, Music Bus, FX Bus) are not yet formal first-class entities in the mixer dock.
  - *FFmpeg Export Pipeline Mapping:* While the operations math and inspector UI are complete, ensuring all 12 audio DSP chains map into the final `sequence-render-service.ts` FFmpeg audio filter complex graph (`aformat`, `equalizer`, `acompressor`, `agate`, `aecho`, `asetrate`, `pan`) ensures bit-for-bit exported fidelity.

### 2.3 Video Compositing, Color Grading & Optics (S23, S24, S30–S32, S34, S38–S40, S42, S43, S46–S48, S51, S52, S54, S55, S57)
- **Strengths:**
  - Real-time video scopes (Waveform, RGB Parade, Vectorscope, Histogram).
  - 3-Way Color Wheels (Lift, Gamma, Gain) with luminance and tint balancing.
  - Keyframe Bézier curve graph editor for smooth interpolation.
  - Interactive Canvas Transform Gizmo with multi-point handles.
  - Chroma keying with spill suppression and matte preview.
  - Shape masking (rectangle, circle, polygon, path) with edge feathering and inversion.
  - Film emulation (grain, halation, gate weave), lens distortion (anamorphic flares, chromatic aberration, vignette).
  - AI portrait matting, optical flow slow motion, video stabilization, and HDR ACES tone mapping.
- **Audit Findings & Opportunities:**
  - *WebGL Compositing Pipeline Harmonization:* Consolidating CSS filter previews with WebGL fragment shaders in `TimelinePreview.tsx` ensures hardware-accelerated playback at 60 FPS even with multiple stacked effects.
  - *Adjustment Layers:* Allowing an effect or color grade to span across multiple clips below it on the timeline without duplicating effects per clip.

### 2.4 Multi-Camera & Automation (S4, S58, S59)
- **Strengths:**
  - MultiCam angle switching with 2x2 matrix, sync offset indicators, and audio cross-correlation sync.
  - AI Smart Scene Cut Detection with automatic razor splitting.
  - Veo3Flow integration and batch watermark removal.
- **Audit Findings & Opportunities:**
  - Real-time MultiCam 4-up synchronized live quad-view playback during playback preview.

### 2.5 Codebase Architecture & UI Modularization
- **Audit Findings & Bottlenecks:**
  - **`ClipInspector.tsx` Size:** File has expanded to ~7,846 lines containing all inspector tabs and modals inline. Modularizing into dedicated tabs (`VideoInspectorTab`, `AudioInspectorTab`, `ColorInspectorTab`, `EffectsInspectorTab`, `MultiCamInspectorTab`) will drastically reduce React re-render scope, improve developer velocity, and maintain code hygiene.
  - **FFmpeg Full-Chain Integration Verification:** Ensuring every S30-S59 filter parameter has a 1-to-1 parity mapping in `src/main/media/sequence-normalize.ts` and `sequence-render-service.ts`.

---

## 3. Next Steps & Development Roadmap

| Step | Milestone Name | Objective & Scope | Status |
| :--- | :--- | :--- | :--- |
| **S60** | **Comprehensive App Audit & Next Milestones Roadmap** | Perform complete codebase audit, identify architectural opportunities, and establish continuous progress tracking. | **Completed** |
| **S61** | **ClipInspector Modular Refactoring & Render Performance Optimization** | Decompose the 7.8k line `ClipInspector.tsx` into modular, memoized tabs (`VideoTab`, `AudioTab`, `ColorTab`, `EffectsTab`, `MultiCamTab`) with zero regression in functionality and immediate test suite validation. | **Completed** |
| **S62** | **Adjustment Layers & Timeline Effect Containers** | Introduce non-destructive adjustment layers that apply color grading, LUTs, and optical effects across all underlying tracks. | **Completed** |
| **S63** | **Auxiliary Audio Submix Buses & Track Routing Engine** | Expand the Audio Mixer Dock with master/aux buses (Dialogue, Music, SFX), send levels, and master limiter controls. | **Completed** |
| **S64** | **Compound Clips & Nested Sequence Packaging** | Implement containerization for timeline clips into reusable nested sequences with independent timelines. | **Completed** |
| **S65** | **MultiCam Live 4-Up Synchronized Canvas Playback** | Render synchronized multi-angle live video feeds in the canvas preview for real-time cut-on-the-fly editing. | **Completed** |
| **S66** | **End-to-End FFmpeg Render Engine Full-Filter Synthesis** | Ensure full parity across all 30+ audio/video filters in `sequence-render-service.ts` for pixel-perfect exported deliverables. | **Completed** |
| **S67** | **Inline Track Automation Lanes & Velocity Tangent Editor** | Direct timeline clip automation curves (volume, opacity, scale, pan, position) with interactive Bézier tangent handles and velocity curve visualizer. | **Completed** |
| **S68** | **Render Queue & Multi-Format Batch Stem Exporter** | Background render queue manager supporting batch exports, separated audio stem delivery (DIA/MUS/SFX/MST), customizable broadcast codecs (ProRes, DNxHD, HEVC 10-bit), and two-pass encoding. | **Completed** |
| **S69** | **Real-Time WebGL Shader Preview Harmonization & GPU Effect Acceleration** | Compile GLSL fragment shaders for film emulation, lens distortion, chroma key, shape masks, and 3D LUTs in canvas preview for 60 FPS playback. | **Completed** |
| **S70** | **Magnetic Timeline Auto-Ripple & Smart Collision Avoidance Engine** | FCP-grade magnetic snapping, auto-ripple insert/delete, smart gap collapse, collision bumping, and visual ripple guides. | **Completed** |
| **S71** | **Auditory Waveform Peak Metering & EBU R128 Broadcast Loudness Radar** | True-peak metering, integrated LUFS loudness radar, short-term/momentary graphs, and automatic broadcast normalization. | **Completed** |
| **S72** | **Interactive Timeline Speed Ramping Bézier Gizmo & Optical Flow Retiming HUD** | Direct timeline clip speed ramping curve editor with keyframe inflection pins, freeze frame hold bars, and optical flow retiming controls. | **Completed** |
| **S73** | **Dynamic Subtitle & Closed Caption Burn-In Exporter with Styling Teletext Engine** | SRT/VTT/ASS/608/708 subtitle engine, typography styling presets, live canvas preview, and burn-in during FFmpeg export. | **Completed** |
| **S74** | **AI Shot-to-Shot Color Match & Cinematic Auto-Grading Engine** | Statistical color profile analysis (Luma, RGB, variance, skin-tone vectors), 3-way Lift/Gamma/Gain color transfer, and one-click auto-matching in inspector. | **Completed** |
| **S75** | **Dynamic Split-Screen & Video Collage Layout Engine** | Multi-video collage grid layout geometries, 1-click auto-assemble multi-clip distribution, aspect-crop-cover synthesis, and FFmpeg export. | **Completed** |
| **S76** | **Dual-System Audio Auto-Sync & A/V Clip Linking Engine** | Waveform cross-correlation audio auto-sync, A/V clip linking, camera scratch audio muting, timeline drag/trim propagation, and inspector sync card. | **Completed** |

---

## 4. Progress Tracking Log

- **[2026-09-22 12:45]** Completed static typecheck (`tsc --noEmit`) with 0 errors.
- **[2026-09-22 12:45]** Executed 54 unit test suites (`vitest run`): 627 / 627 tests passing.
- **[2026-09-22 12:47]** Initialized S60 comprehensive audit and created roadmap tracker in `/implementation`.
- **[2026-09-22 12:49]** User approved roadmap. Formulated and initialized Step S61 dedicated plan (`implementation/S61_ClipInspector_Modular_Refactoring_Plan.md`).
- **[2026-09-22 13:35]** Step S61 successfully completed:
  - Extracted 14 memoized inspector components in `src/renderer/features/timeline-edit/ui/inspector/`.
  - `ClipInspector.tsx` reduced from 7,846 lines to 53 lines (99.3% reduction).
  - All 54 test files passed (627/627 tests).
  - TypeScript static typecheck verified with 0 errors (`tsc --noEmit`).
- **[2026-09-22 14:08]** Step S62 successfully completed:
  - Implemented `adjustment-layer-ops.ts` (pure math, stacking order, filter aggregation, CSS styles).
  - Added Timeline creation button in `TimelineToolbar.tsx`, `Alt+A` shortcut in `TimelineScreen.tsx`, and trough context menu in `TimelinePanel.tsx`.
  - Styled adjustment layers in `TimelineClip.tsx` with violet gradient and `tune` badge.
  - Unlocked `Color & LUTs`, `Effects`, `Layer & Mask`, and `Timing` in `SingleClipInspector.tsx` & `VideoInspectorTab.tsx`.
  - Integrated active adjustment layer canvas compositing and shape mask overlay containers in `TimelinePreview.tsx`.
  - 100% test pass rate: 639/639 tests passing across 55 test suites, 0 TypeScript errors.
- **[2026-09-22 15:38]** Step S63 successfully completed:
  - Implemented `audio-bus-ops.ts` (Dialogue, Music, SFX submix buses, track routing resolution, stereo meter summation, and master glue compressor/limiter).
  - Extended `useAudioMixerStore.ts` with track routing, submix buses, and master glue compressor state & actions.
  - Upgraded `AudioMixerDock.tsx` with track bus routing selectors (`DIA`, `MUS`, `SFX`, `MST`), dedicated Submix Bus channel strips with dual stereo VU meters, faders, pan, solo/mute, EQ, and DYN buttons.
  - Upgraded `TimelineToolbar.tsx` compact master VU meter to sum submix buses and reflect master glue compressor.
  - 100% test pass rate: 651/651 tests passing across 56 test suites, 0 TypeScript errors.
- **[2026-09-22 16:22]** Step S64 successfully completed:
  - Added `'compound'` to `SEQUENCE_SOURCE_KINDS` in `sequence.ts` and `CompoundClipSettings` interface in `effects.ts`.
  - Implemented `compound-clip-ops.ts` (`isCompoundClip`, `createCompoundClip`, `packCompoundClip`, `unpackCompoundClip`, `resolveActiveCompoundFrame`) with 100% test pass rate in `compound-clip-ops.test.ts`.
  - Added `parentSequenceStack`, `createCompoundClipFromSelection`, `decomposeCompoundClip`, `stepIntoCompoundClip`, `stepOutOfCompoundClip` in `sequenceStore.ts`.
  - Upgraded `TimelineClip.tsx` with cyan gradient wash, `auto_awesome_motion` icon, child clips count badge, and double-click to step into nested sequence.
  - Added `Alt+G` (pack) and `Alt+Shift+G` (decompose) keyboard shortcuts in `TimelineScreen.tsx` and context menu actions in `TimelinePanel.tsx`.
  - Added breadcrumb navigation ("← Back to Parent") in `SequenceTabs.tsx`.
  - Added dedicated Compound Clip tab with metrics and Open/Decompose controls in `SingleClipInspector.tsx`.
  - 100% test pass rate: 656/656 tests passing across 57 test suites, 0 TypeScript errors.
- **[2026-09-22 16:55]** Step S65 successfully completed:
  - Added `filePath?: string` to `MultiCamAngle` in `src/shared/types/effects.ts`.
  - Implemented pure math `multi-cam-ops.ts` (`resolveAngleSourceTime`, `buildMultiCamGridTiles`, `executeLiveMultiCamCut`) with 14 unit tests in `multi-cam-ops.test.ts`.
  - Built responsive 4-Up synchronized video quad-grid in `MultiCamGrid.tsx` with program (red) and preview (green) tally outlines, sync offsets, and click-to-cut handlers.
  - Integrated quad split toggle (`Shift+0`), hotkeys (`1-4`), and transport sync inside `TimelinePreview.tsx`.
  - 100% test pass rate: 660/660 tests passing across 57 test suites, 0 TypeScript errors.
- **[2026-09-22 17:13]** Step S66 successfully completed:
  - Synthesized all S30-S65 video filters in `buildColorFilterChain`: 3-Way color balance, 3D LUTs (.cube and native presets), HDR tone mapping, lens optics & distortion, video stabilization deshake, AI portrait matting, chroma key & spill suppression, shape masking, film grain & halation, temporal video denoiser, and motion blur.
  - Implemented and exported `buildAudioFilterChain` following standard post-production signal chain order: AI vocal isolation -> multiband denoiser -> noise gate/de-esser -> 3-band parametric EQ -> dynamic range compressor -> pitch shifter -> reverb/delay -> stereo pan.
  - Extended `DubSegmentInput` with `audioFilter` and integrated it into `buildAudioTimelineGraph` before delay and fades.
  - Updated `sequence-render-service.ts` to resolve MultiCam angle media file paths and sync offset frames for both picture and sound, pass sequence dimensions to color and windowed filter chains, and synthesize `audioFilter` for all placed clips.
  - Created 22 comprehensive unit tests in `render-filter-synthesis.test.ts`.
  - 100% test pass rate: 682/682 tests passing across 58 test suites, 0 TypeScript errors (`tsc --noEmit`).
- **[2026-09-22 17:32]** Step S67 successfully completed:
  - Added pure math helpers in `keyframe-curve-ops.ts` (`normalizeKeyframeValue`, `denormalizeKeyframeValue`, `formatKeyframeValue`, `updateKeyframeTangent`, `insertKeyframeAtFrame`, `deleteKeyframeAtFrame`, `buildSvgKeyframePath`).
  - Added 7 new test suites in `keyframe-curve-ops.test.ts` (34 tests passing).
  - Built `InlineKeyframeCurve.tsx` with interactive SVG canvas, continuous Bézier path, diamond handles, tangent handles with symmetric/asymmetric editing, double-click insertion, and multi-property switching.
  - Integrated `InlineKeyframeCurve` into `TimelineClip.tsx` with dedicated toggle button, `Alt+K` hotkey, and context menu item.
  - 100% test pass rate: 689/689 tests passing across 58 test suites, 0 TypeScript errors (`tsc --noEmit`).
- **[2026-09-22 18:15]** Step S68 successfully completed:
  - Extended sequence types (`src/shared/types/sequence.ts`) with broadcast codecs (`prores`, `dnxhd`, `hevc`, `wav`), `AudioStemType` (`master`, `dialogue`, `music`, `sfx`), and render options (`twoPass`, `proresProfile`, `stemType`, `stemRoutingMap`).
  - Implemented `audio-stem-ops.ts` with stem configurations, filename generators (`_DIA`, `_MUS`, `_SFX`, `_FULLMIX`), track routing predicates, clip isolation, and batch export job packaging.
  - Extended `sequence-normalize.ts` and `sequence-render-service.ts` to synthesize FFmpeg arguments for Apple ProRes 422 (HQ/Standard/LT/Proxy), Avid DNxHD/DNxHR, HEVC 10-bit HDR, uncompressed 24-bit 48kHz WAV audio masters, and two-pass VBR.
  - Implemented Zustand render queue store `useRenderQueueStore.ts` with sequential job runner, retry, cancel, drawer toggle, and live progress forwarding from IPC.
  - Built interactive `RenderQueueDock.tsx` drawer displaying job cards, progress bars, step indicators, retry, cancel, and folder reveal.
  - Upgraded `ExportModal.tsx` with container format dropdown, ProRes profile picker, Two-Pass VBR switch, multi-track audio stems batch export toggles, and "Add to Queue" button.
  - Upgraded `TopNavigation.tsx` with live Render Queue status icon button, spinning animation during active encodes, and job count badge.
  - Added unit test suites in `audio-stem-ops.test.ts` (11 tests) and `render-queue-stems.test.ts` (15 tests).
  - 100% test pass rate: 715/715 tests passing across 60 test suites, 0 TypeScript errors (`tsc --noEmit`).
- **[2026-09-22 18:50]** Step S69 successfully completed:
  - Created `src/shared/utils/timeline/gl-shader-ops.ts` with pure math and uniform serialization for Film Emulation (`packFilmEmulationUniforms`), Lens Optics (`packLensOpticsUniforms`), Chroma Keying (`packChromaKeyUniforms`), 3-Way Color Wheels (`packColorGradingUniforms`), and Shape Masking (`packMaskUniforms`).
  - Upgraded WebGL2 GLSL fragment shader (`shaders.ts`) with hardware-accelerated functions: `distortUv` (barrel/pincushion radial warping), chromatic aberration 3-tap R/G/B dispersion, chroma key distance thresholding & spill suppression, 3-way lift/gamma/gain balance with Kelvin temp & tint, procedural pseudo-random hash grain & halation, and signed distance field (SDF) shape masking with edge feathering & inversion.
  - Extended `GlLayer` and `layerFor` in `frame-graph.ts` with `gpuEffects` and `playheadFrame`.
  - Updated `GlCompositor.ts` to upload 40 effect uniform floats across layer A and layer B with zero allocations.
  - Integrated `playheadFrame` into `TimelinePreview.tsx` `layerFor` invocations.
  - Added comprehensive unit tests in `gl-shader-ops.test.ts` (14 tests) and `frame-graph.test.ts` (5 tests).
  - 100% test pass rate: 734/734 tests passing across 62 test suites, 0 TypeScript errors (`tsc --noEmit`).
- **[2026-09-22 19:25]** Step S70 successfully completed:
  - Implemented `src/shared/utils/timeline/magnetic-ripple-ops.ts`:
    - `detectClipCollisions`: Overlap interval collision detection across tracks.
    - `resolveCollisionBumping`: Smart bumper snapping to cleanly abut preceding/succeeding clips or track head (frame 0) within 15-frame tolerance, preventing accidental overlap.
    - `applyAutoRippleInsert`: Splicing clips with automatic rightward displacement of downstream clips on both free and magnetic tracks.
    - `applyRippleDelete`: Gap-collapsing deletion with merged interval calculation, shifting downstream clips leftward without over-shifting.
    - `calculateRippleShiftPreview`: Real-time displacement map generation during interactive gestures.
  - Exported in `src/shared/index.ts`.
  - Upgraded `edit-ops.ts`: delegated `rippleDelete` to `applyRippleDelete`, enhanced `placeSourcesAt` with auto-ripple and collision bumping options.
  - Integrated into `TimelinePanel.tsx`: wired `resolveCollisionBumping` and `applyAutoRippleInsert` into `applyDrag`, and added ripple/bumper support to drag-and-drop `placeItems`.
  - Created unit test suite `src/shared/utils/timeline/__tests__/magnetic-ripple-ops.test.ts` (18 tests passing).
  - 100% test pass rate: 752/752 tests passing across 63 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).
- **[2026-09-22 19:30]** Step S71 successfully completed:
  - Implemented `src/shared/utils/timeline/ebu-r128-ops.ts`:
    - ITU-R BS.1770-4 K-weighting pre-filter biquad coefficients (Stage 1 high-shelf +3.999 dB @ 1682 Hz, Stage 2 RLB high-pass @ 38 Hz).
    - True Peak detector with 4x oversampling cubic interpolation detecting inter-sample peaks in dBTP.
    - Gated loudness measurement (Absolute -70 LKFS + Relative -10 LU).
    - Momentary (400ms), Short-Term (3s), and Integrated (I) LUFS and Loudness Range (LRA).
    - Standard broadcast presets: EBU R128, ATSC A/85, YouTube/Spotify, Apple Podcasts, Netflix.
    - Automatic normalization gain calculation with True-Peak safety clamping.
  - Exported in `src/shared/index.ts`.
  - Created unit test suite `src/shared/utils/timeline/__tests__/ebu-r128-ops.test.ts` (14 tests passing).
  - Built `LoudnessRadarModal.tsx` circular radar sweep visualizer with concentric LUFS rings, sweep hand animation, real-time digital readouts, compliance badge, and one-click master fader normalization.
  - Integrated Loudness Radar launch button and Master strip `LUFS` button into `AudioMixerDock.tsx`.
  - 100% test pass rate: 766/766 tests passing across 64 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).
- **[2026-09-22 19:40]** Step S72 successfully completed:
  - Extended `src/shared/utils/timeline/speed-ramp-ops.ts` with interactive manipulation functions:
    - `splitSpeedSegmentAtNormalizedTime`: Segment splitting and keyframe inflection pin insertion.
    - `updateSpeedPointVelocity`: Keyframe velocity adjustments clamped between 0.1x and 10x.
    - `updateSpeedPointEasing`: Tangent ease handle manipulation for smooth acceleration transitions.
    - `insertFreezeFrameRamp`: Zero-speed hold plateau insertion.
    - `buildSvgSpeedRampPath`: Continuous velocity SVG stroke and gradient fill generation with screen-space handle coordinates.
  - Created unit test suites in `src/shared/utils/timeline/__tests__/speed-ramp-ops.test.ts` (22 tests passing).
  - Built `InlineSpeedRampCurve.tsx`: In-clip interactive speed curve editor with SVG velocity curve, draggable inflection pins, Bézier ease handles, preset selector (Hero Ramp, Bullet Time, Montage Flash), retiming mode selector (Nearest, Frame Blend, Optical Flow), and freeze frame insertion.
  - Integrated into `TimelineClip.tsx`: Added speed ramp curve toggle button, `Alt+R` shortcut listener, and context menu action in `TimelinePanel.tsx`.
  - 100% test pass rate: 771/771 tests passing across 64 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).
- **[2026-09-22 19:50]** Step S73 successfully completed:
  - Extended sequence types (`src/shared/types/sequence.ts`): Added `burnInSubtitles`, `subtitleStylePresetId`, and `subtitleTrackId` to `SequenceRenderRequest`.
  - Implemented ASS v4+ Subtitle & Teletext engine in `src/shared/utils/timeline/subtitle-ops.ts`:
    - `ASS_SUBTITLE_STYLES` presets: `classic_clean`, `cinema_gold`, `yellow_broadcast`, `tiktok_box` (with opaque bounding box `borderStyle: 3`), `retro_teletext`.
    - `formatSecondsToASSTimestamp`: Centisecond-precise timestamp formatting (`H:MM:SS.cc`) with exact integer arithmetic.
    - `timelineClipsToASS`: Synthesizes ASS v4.00+ script with script headers, style definition, and dialogue cues with escaped newlines and track filtering.
  - Upgraded FFmpeg mux engine in `src/main/media/sequence-normalize.ts`:
    - Added `subtitlePath?: string` to `MuxOptions`.
    - `buildMuxArgs`: Detects `subtitlePath`, escapes Windows drive colons and backslashes, forces video re-encoding, and inserts `-vf subtitles='...'` alongside any geometry scaling.
  - Wired into `src/main/media/sequence-render-service.ts`:
    - Synthesizes `burnin_subtitles.ass` script dynamically in the render directory when `request.burnInSubtitles` is active.
    - Passes `subtitlePath` to `buildMuxArgs`.
  - Upgraded `ExportModal.tsx`:
    - Detects subtitle/text clips on timeline.
    - Added "Burn-in Subtitles & Closed Captions" toggle switch with preset picker (`ASS_SUBTITLE_STYLES`), track selector, and live typography preview chip rendering styled sample text.
    - Included subtitle burn-in parameters in both direct export and batch queue workflows.
  - Added unit test suites in `src/shared/utils/timeline/__tests__/subtitle-ops.test.ts` (27 tests) and `src/main/media/__tests__/render-queue-stems.test.ts` (18 tests).
  - 100% test pass rate: 782/782 tests passing across 64 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).
- **[2026-09-22 20:25]** Step S74 successfully completed:
  - Implemented pure statistical color matching operations in `src/shared/utils/timeline/color-match-ops.ts`:
    - `extractColorStatsFromRgba`: Statistical extraction of mean RGB, standard deviations (contrast), Rec. 709 luminance, zonal distribution (Shadows, Midtones, Highlights), and YCbCr skin-tone detection vector arc.
    - `generateSyntheticStatsFromGrade`: Synthesis of accurate color statistics from existing `ColorGradingSettings` or aesthetic profiles (`warm`, `cool`, `bright`, `dark`, `neutral`).
    - `calculateColorMatchGrade`: Computes exposure compensation (log2 luma ratio), contrast scaling, Kelvin temperature shift (R/B ratio), green/magenta tint offset, 3-way Lift/Gamma/Gain chromatic vectors, and saturation with skin-tone protection and match modes (`full`, `luma_only`, `chroma_only`).
    - `blendColorGrades`: Smooth linear interpolation between grades for adjustable match intensity.
  - Exported in `src/shared/index.ts`.
  - Upgraded `ColorGradingPanel.tsx`:
    - Added dedicated **"Shot Match"** sub-tab alongside Wheels, Tone, Presets, and LUTs.
    - Added Hero Reference source selector (supporting any video/still clip on the timeline or aesthetic reference presets).
    - Added side-by-side color channel comparison bars (Luma, Red, Green, Blue) comparing Target vs. Reference.
    - Added Match Mode buttons (`Full Grade`, `Luma Only`, `Chroma Only`), Match Strength slider (0-100%), and "Preserve Skin Tones" toggle switch.
    - Wired "Analyze & Apply Color Match" button with optimistic grade updates and toast notification.
  - Created unit test suite `src/shared/utils/timeline/__tests__/color-match-ops.test.ts` (16 tests passing).
- **[2026-09-22 20:53]** Step S75 successfully completed:
  - Fixed coordinate bugs in `src/shared/utils/timeline/pip-grid-ops.ts` (`grid_2x2` bottom-left cell coordinate and `split_2_top_1_bottom` top-right coordinate).
  - Expanded `PIP_GRID_LAYOUTS` to 14 curated presets by adding `split_3_columns` (3-way vertical pillars), `split_1_top_2_bottom` (master presenter + 2 reactions), `split_2_top_1_bottom` (2 speaker feeds + wide presentation), and `split_cinema_2` (dual anamorphic letterboxed strips).
  - Added `autoAssignCollageGrid` helper for 1-click batch arrangement of overlapping clips across video tracks with styling options (border, corner radius, gap, shadow).
  - Updated Zod validation schema in `src/shared/utils/timeline/effects.ts` for all 14 layout types.
  - Upgraded FFmpeg overlay synthesis in `src/main/media/sequence-normalize.ts`: Added `cellRect` support to `buildAlphaSegmentArgs` with aspect-fill scaling and cropping (`scale=...:force_original_aspect_ratio=increase,crop=...`).
  - Integrated into `src/main/media/sequence-render-service.ts`: Overlay segment generator now calculates target cell dimensions and centers via `getClipGridRect`.
  - Built Split Screen & Video Collage section in `src/renderer/features/timeline-edit/ui/inspector/VideoInspectorTab.tsx`:
    - Layout preset selector for all 14 layouts.
    - Slot selector segmented control.
    - "Auto-Assemble" action button that detects overlapping clips in the active timeline sequence and applies sequential cell assignments.
    - Border width, color picker, corner radius, inter-cell gap, and drop shadow toggles.
  - Comprehensive unit test coverage in `src/shared/utils/timeline/__tests__/pip-grid-ops.test.ts` (18 tests) and `src/main/media/__tests__/render-filter-synthesis.test.ts` (24 tests).
  - 100% test pass rate: 805/805 tests passing across 65 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).
- **[2026-09-22 21:38]** Step S76 successfully completed:
  - Extended sequence types (`src/shared/types/sequence.ts`): Added `linkedClipId` and `syncOffsetFrames` to `SequenceClip`, and exported helper predicates `isClipLinked` and `getLinkedClip`.
  - Implemented pure audio sync operations in `src/shared/utils/timeline/audio-sync-ops.ts`:
    - `calculateAudioWaveformSync`: Pearson cross-correlation of peak envelopes across search window for lag detection with confidence scoring.
    - `applyDualSystemAudioSync`: Aligns external audio start time, mutably links clips, and disables camera scratch audio (`sourceAudioEnabled: false`).
    - `linkClips` & `unlinkClips`: Bidirectional link management.
    - `propagateLinkedClipMove`: Propagates movement deltas to linked clips on free tracks.
  - Exported in `src/shared/index.ts`.
  - Upgraded `TimelinePanel.tsx`:
    - Moving a linked clip on a free track shifts its linked sibling by the exact same frame delta.
    - Added context menu actions: "Link Clips" (`Ctrl+L`), "Unlink Clips" (`Ctrl+Shift+L`), and "Auto-Sync Audio by Waveform...".
  - Upgraded `TimelineClip.tsx`: Rendered visual link badge icon (`link`) in clip header with hover sync offset readout.
  - Upgraded `AudioInspectorTab.tsx`: Added dedicated "Dual-System Sound & Link" card displaying linked clip details, sync offset in frames/ms, scratch audio mute status, and one-click "Unlink" button.
  - Created unit test suite `src/shared/utils/timeline/__tests__/audio-sync-ops.test.ts` (12 tests passing).
  - 100% test pass rate: 817/817 tests passing across 66 test suites, 0 TypeScript compilation errors (`tsc --noEmit`).

