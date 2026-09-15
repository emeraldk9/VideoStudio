import { app } from 'electron';
import { execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WHITEBOARD_TRACE_DEFAULTS,
  buildColorFilterChain,
  applySplitEditOffset,
  buildFlashFilter,
  buildVideoFadeFilter,
  buildWindowedColorFilterChain,
  composeMatchNudge,
  effectiveBoundaryTransition,
  resolveClipMotion,
  clipSpeed,
  framesToSeconds,
  keyframesFor,
  layoutTrack,
  narrationTrackOf,
  spineTrackOf,
  toFfmpegExpression,
  transportDurationFrames,
  type PlacedClip,
  type RenderEncoderInfo,
  type SequenceDocument,
  type SequenceRenderProgress,
  type SequenceRenderStage,
  hasEffectClips,
  overlayTracksOf,
  type SequenceRenderRequest,
  type SequenceRenderResult,
  type SequenceTrack,
} from '@shared';

import type { ChildLogger } from '../logging/logger';

import type { DubSegmentInput } from './audio-layout';
import { buildAudioTimelineArgs } from './audio-timeline';
import { probeClip } from './clip-probe';
import { mapConcurrent } from './concurrency';
import { resolveRenderEncoder, SOFTWARE_ENCODER } from './render-encoder';
import { SegmentCache, sourceIdentity } from './segment-cache';
import {
  buildAlphaSegmentArgs,
  buildCompositeArgs,
  buildDuckMixArgs,
  buildEffectPassArgs,
  buildJoinArgs,
  buildJoinGraph,
  planJoinChunks,
  xfadePlanFor,
  type JoinBoundary,
  buildGifPaletteArgs,
  buildLayerArgs,
  buildMuxArgs,
  buildNormalizeVideoArgs,
  buildTranscodeArgs,
  pngSequenceFirstFrame,
  type LayerSegment,
} from './sequence-normalize';
import { buildStillSegmentArgs } from './still-motion';
import { buildTextSegmentArgs, resolveDrawtextFont } from './text-segment';
import { buildConcatArgs, buildConcatFileList } from './video-editor';
import { probeFfmpegCapabilities } from './watermark-capabilities';
import { writeZoneMasks, zoneMaskPath } from './whiteboard-mask';
import { buildWhiteboardSegmentArgs, resolveHandAsset } from './whiteboard-segment';
import { ensureTraceArtifact, type TraceArtifact } from './whiteboard-trace';

/**
 * Beta S145 — renders a timeline to a file, in four staged passes.
 *
 * **Deliberately not a queue job.** `src/main/queue` is the browser-automation
 * FSM: its retry/backoff, rate-limit handling and dead-letter states exist for
 * a remote, session-bound, rate-limited browser. A local ffmpeg render has
 * none of those failure modes, and putting it under that policy would mean a
 * CPU-bound job inheriting a cooldown designed for Google's rate limiter.
 *
 * One render at a time, app-wide. Two concurrent renders would contend for the
 * same CPU and produce two slow results instead of one fast one, and the UI
 * only ever offers one — so the second call is refused loudly rather than
 * queued invisibly.
 *
 * Progress is pushed, never polled: only this process knows that clip 12 of 40
 * finished normalizing.
 */

export type RenderProgressNotifier = (progress: SequenceRenderProgress) => void;

/**
 * Beta S226 — most segments one join graph opens at once. Not a command-line
 * limit (the graph rides in a `-filter_complex_script` file); it bounds open
 * file handles and decoder instances in a single ffmpeg process. Sequences
 * past it chunk at cut boundaries — see `planJoinChunks`.
 */
const MAX_JOIN_INPUTS = 40;

/**
 * Beta S256 — how many stage-1 clips render at once.
 *
 * A moving still's chain is bound by `perspective`'s per-frame LUT, which is
 * single-threaded; one clip at a time therefore left most of the machine
 * idle, and a 116-still sequence queued up hours of it. The formula is the
 * watermark still pool's, for the same reason it was chosen there: enough to
 * fill the cores that a single process cannot, capped so peak memory and the
 * GPU's concurrent encode sessions stay comfortably bounded. (Consumer NVIDIA
 * cards allow eight NVENC sessions on any driver from late 2023; four leaves
 * room for whatever else the machine is doing.)
 */
const NORMALIZE_POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 2));

/** What stage 1 produces for one clip: a segment, or the label it was skipped under. */
type NormalizeOutcome = { segmentPath: string } | { skipped: string };

interface ActiveRender {
  sequenceId: string;
  /**
   * Every ffmpeg this render has running. A set rather than a single handle
   * since S256, because stage 1 runs several; `cancel()` kills them all.
   */
  children: Set<ChildProcess>;
  cancelled: boolean;
  workDir: string;
  /** When the render began, for the total in the completion log line. */
  startedAt: number;
  /**
   * S253 — the stages this render will run, attached to every progress
   * event so the UI can place each one in the whole.
   */
  plan: readonly SequenceRenderStage[];
  /**
   * The stage the last progress event named, and when it first named it.
   *
   * Every stage boundary is a `report()` call with a different `stage`, so
   * timing them needs no instrumentation at the call sites — which matters,
   * because there are thirteen of them across five methods. Before this an
   * export logged its encoder and then nothing until it finished, so "the
   * render is slow" could not be answered from the logs at all.
   */
  stage: SequenceRenderStage | null;
  stageStartedAt: number;
  /**
   * S248 — resolved once, before stage 1 writes anything, and constant for
   * the render. See `render-encoder.ts` for why this cannot be decided
   * lazily: the all-cuts join path stream-copies its segments, so a render
   * whose encoder changed halfway would concat mismatched SPS/PPS.
   */
  encoder: RenderEncoderInfo;
}

/**
 * S253 — which stages this render will run, in the order it will run them.
 *
 * Every conditional stage asks the same predicate its own guard asks
 * (`overlayTracksOf`, `hasEffectClips`), so the plan and the pipeline cannot
 * disagree. `normalize`, `join`, `audio` and `mux` are unconditional on the
 * video path; `audio` and `mux` alone are the audio-only export.
 *
 * Computed before stage 1 writes anything, for the same reason the encoder
 * is: it must be constant for the render, or the bar it feeds would rescale
 * underneath the user partway through.
 */
export function planStages(
  document: SequenceDocument,
  request: SequenceRenderRequest,
): SequenceRenderStage[] {
  if (request.audioOnly === true) return ['audio', 'mux'];
  const stages: SequenceRenderStage[] = ['normalize', 'join'];
  if (overlayTracksOf(document).length > 0) stages.push('layers', 'composite');
  if (hasEffectClips(document)) stages.push('effects');
  stages.push('audio', 'mux');
  // S286 — the delivery conversion; only when the output is not the master.
  if (request.format !== undefined && request.format !== 'mp4') stages.push('transcode');
  return stages;
}

export class SequenceRenderService {
  private active: ActiveRender | null = null;

  /** The in-flight render's encoder; the software floor when nothing is running. */
  private get encoder(): RenderEncoderInfo {
    return this.active?.encoder ?? SOFTWARE_ENCODER;
  }

  /**
   * Every progress event, with the stage clock kept on the side.
   *
   * A wrapper rather than a `notify` call at each site: the stage boundaries
   * are already expressed as "a progress event whose `stage` differs from the
   * last one", so this is the one place that can time them without asking
   * thirteen call sites to remember to.
   */
  private report(progress: SequenceRenderProgress): void {
    const active = this.active;
    if (active && active.stage !== progress.stage) {
      this.closeStage();
      active.stage = progress.stage;
      active.stageStartedAt = Date.now();
    }
    this.notify(active ? { ...progress, plan: active.plan } : progress);
  }

  /** Logs the stage that just ended, if one had started. */
  private closeStage(): void {
    const active = this.active;
    if (!active?.stage) return;
    this.logger.info('render stage complete', {
      sequenceId: active.sequenceId,
      stage: active.stage,
      ms: Date.now() - active.stageStartedAt,
    });
    active.stage = null;
  }

  constructor(
    private readonly ffmpegPath: string,
    private readonly logger: ChildLogger,
    private readonly notify: RenderProgressNotifier,
    /** S154 phase 7 — the stage-1 segment cache. `null` = always miss, never store (tests, no-userData environments). */
    private readonly cache: SegmentCache | null = null,
  ) {}

  /**
   * One per-clip segment, through the cache when one is wired.
   *
   * `descriptor === null` means "this segment cannot be identified" (a source
   * that would not stat) and disables caching for it alone. A cache hit skips
   * ffmpeg entirely and the *cached* path becomes the segment input — the
   * consumers only read. A store failure degrades to the produced path.
   */
  private async renderSegmentCached(
    args: string[],
    producedPath: string,
    extension: string,
    descriptor: unknown,
  ): Promise<string> {
    if (!this.cache || descriptor === null) {
      await this.runFfmpeg(args);
      return producedPath;
    }
    const key = SegmentCache.keyFor(descriptor);
    const hit = await this.cache.get(key, extension);
    if (hit) return hit;
    await this.runFfmpeg(args);
    return this.cache.put(key, extension, producedPath);
  }

  /**
   * A media segment's identity: the args (volatile paths masked, so two
   * renders' differing work dirs hash alike) plus the source's size+mtime —
   * the same structural convention the probe and peaks caches use.
   */
  private async mediaDescriptor(
    args: string[],
    volatilePaths: string[],
    sourcePath: string,
  ): Promise<unknown> {
    const source = await sourceIdentity(sourcePath);
    if (!source) return null;
    return {
      v: 1,
      args: args.map((argument) => (volatilePaths.includes(argument) ? '<volatile>' : argument)),
      source,
    };
  }

  isRendering(): boolean {
    return this.active !== null;
  }

  /**
   * S255 — the in-flight render's sequence, for a UI that has just mounted.
   *
   * `isRendering` is not enough on its own: with more than one project open
   * over a session, "something is rendering" and "*this* timeline is
   * rendering" are different questions, and answering the first as though it
   * were the second puts another sequence's progress in this one's panel.
   */
  activeRender(): { sequenceId: string } | null {
    return this.active ? { sequenceId: this.active.sequenceId } : null;
  }

  /**
   * Kills the in-flight ffmpeg subprocess.
   *
   * Sets `cancelled` **before** killing so the stage loop sees the flag rather
   * than treating the kill as a genuine ffmpeg failure and reporting a
   * spurious error to a user who just pressed Cancel.
   */
  cancel(): void {
    if (!this.active) return;
    this.active.cancelled = true;
    this.killChildren();
  }

  /** Every ffmpeg this render has running. `cancel()` and the pool's first failure both come here. */
  private killChildren(): void {
    for (const child of this.active?.children ?? []) child.kill();
  }

  async render(document: SequenceDocument, request: SequenceRenderRequest): Promise<SequenceRenderResult> {
    if (this.active) {
      throw new Error('A render is already running. Cancel it before starting another.');
    }

    // The slot is claimed **synchronously** with the guard above, before any
    // await. "One render at a time, app-wide" is only true if the check and
    // the claim cannot be interleaved, and S248 put a capability probe
    // between them — small, and process-cached after the first export, but a
    // gap two clicks can fit through is a gap. `workDir` is filled in a line
    // later; `cancel()` in the meantime sets the flag that the first
    // `throwIfCancelled` reads.
    this.active = {
      sequenceId: document.sequence.id,
      children: new Set(),
      cancelled: false,
      workDir: '',
      encoder: SOFTWARE_ENCODER,
      startedAt: Date.now(),
      plan: planStages(document, request),
      stage: null,
      stageStartedAt: Date.now(),
    };

    let workDir = '';
    try {
      // S248 — the encoder, decided up front. Both calls are process-cached,
      // so this costs a few hundred milliseconds on the first export of a
      // session and nothing after; an audio-only export skips it entirely,
      // having no picture to encode.
      if (request.audioOnly !== true) {
        const encoder = await resolveRenderEncoder(
          this.ffmpegPath,
          await probeFfmpegCapabilities(this.ffmpegPath),
          request.acceleration ?? 'auto',
        );
        this.active.encoder = encoder;
        this.logger.info('render encoder resolved', {
          sequenceId: document.sequence.id,
          encoder: encoder.encoderId,
          hardware: encoder.hardware,
          hwaccel: encoder.hwaccelId ?? 'none',
        });
      }
      this.throwIfCancelled();

      workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'veo3flow-seq-'));
      this.active.workDir = workDir;

      const result = await this.runStages(document, request, workDir);
      this.closeStage();
      this.logger.info('sequence render complete', {
        sequenceId: document.sequence.id,
        ms: Date.now() - (this.active?.startedAt ?? Date.now()),
        encoder: this.encoder.encoderId,
      });
      // Only on success. A failed render's intermediates are the most useful
      // thing anyone has for diagnosing it, and they are in a temp dir the OS
      // reclaims anyway.
      await fs.promises.rm(workDir, { recursive: true, force: true });
      // The render is the cache's only writer, so post-render is the only
      // moment the cap can be newly exceeded.
      await this.cache?.evict();
      return result;
    } catch (error) {
      this.logger.error('sequence render failed', {
        sequenceId: document.sequence.id,
        workDir,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.active = null;
    }
  }

  private async runStages(
    document: SequenceDocument,
    request: SequenceRenderRequest,
    workDir: string,
  ): Promise<SequenceRenderResult> {
    // S157 — the audio-only export: the mixed bed alone, no video stages.
    if (request.audioOnly === true) {
      return this.runAudioOnly(document, request, workDir);
    }
    const { sequence, clips } = document;
    // S154 phase 1 — the picture is the spine track alone; compositing the
    // other video tracks is phase 2 and the preflight blocks a populated one
    // (`track_not_renderable`) until it lands.
    const spineTrack = spineTrackOf(document);
    if (!spineTrack) {
      throw new Error('This sequence has no spine track — re-bind one in the storyboard panel.');
    }
    const video = spineTrack.muted ? [] : layoutTrack(clips, spineTrack);
    if (video.length === 0) {
      throw new Error(
        spineTrack.muted
          ? 'The spine track is muted — there is nothing to render.'
          : 'The video track is empty — there is nothing to render.',
      );
    }

    // --------------------------------------------------- stage 1: normalize
    //
    // S256 — `NORMALIZE_POOL_SIZE` clips at a time. Outcomes are collected
    // by index, so the segment list and the skip list keep clip order
    // whatever order the pool finished in — stage 2 pairs each segment with
    // its own clip's transition, and that pairing is positional.
    let done = 0;
    const progress = (detail: string | undefined): void =>
      this.report({ sequenceId: sequence.id, stage: 'normalize', completed: done, total: video.length, detail });
    progress(video[0].clip.label);
    const outcomes = await mapConcurrent(
      video,
      NORMALIZE_POOL_SIZE,
      async (placed, index): Promise<NormalizeOutcome> => {
        this.throwIfCancelled();
        progress(placed.clip.label);
        const outcome = await this.normalizeOne(placed, index, video.length, document, request, workDir);
        done += 1;
        progress(placed.clip.label);
        return outcome;
      },
      // The first failure ends the render, and the clips still in flight
      // would only be spending the time the user is about to be told was
      // wasted. Not `cancel()`: that would relabel a real ffmpeg error as
      // "Render cancelled."
      () => this.killChildren(),
    );
    const segments: string[] = [];
    const skipped: string[] = [];
    /** Ids, so stage 2 joins exactly the clips stage 1 produced a segment for. */
    const skippedIds = new Set<string>();
    outcomes.forEach((outcome, index) => {
      if ('segmentPath' in outcome) {
        segments.push(outcome.segmentPath);
      } else {
        skipped.push(outcome.skipped);
        skippedIds.add(video[index].clip.id);
      }
    });

    if (segments.length === 0) {
      throw new Error('Every clip in the video lane is missing its source file.');
    }
    this.report({
      sequenceId: sequence.id,
      stage: 'normalize',
      completed: video.length,
      total: video.length,
    });

    // -------------------------------------------------------- stage 2: join
    this.throwIfCancelled();
    this.report({ sequenceId: sequence.id, stage: 'join', completed: 0, total: 100 });
    // Only the clips that actually produced a segment, so `join` pairs each
    // segment with its own clip's transition rather than the next clip along.
    const rendered = video.filter((placed) => !skippedIds.has(placed.clip.id));
    const spine = await this.join(rendered, segments, sequence.fps, workDir, (fraction) =>
      this.report({
        sequenceId: sequence.id,
        stage: 'join',
        completed: Math.round(fraction * 100),
        total: 100,
      }),
    );

    // -------------------------------------- stages `layers` + `composite`
    //
    // S154 phase 2. Skipped entirely when no free video track holds a clip —
    // which is every pre-phase-2 sequence — so the fast path (picture encoded
    // once, `-c:v copy` at the mux) pays nothing for the capability.
    const composite = await this.buildCompositeStage(document, spine, workDir, request, skipped);

    // ------------------------------------------------------ stage: effects
    //
    // S157 — the adjustment-layer pass: every effect clip on a non-muted
    // video track contributes its colour chain, gated to its own time window,
    // applied to the finished picture in one re-encode. Skipped entirely when
    // no effect clip exists — the pre-S157 pipeline byte-for-byte.
    const effected = await this.buildEffectPassStage(document, composite, workDir, request);

    // ------------------------------------------------------- stage: audio
    this.throwIfCancelled();
    // Beta S151 (F7) — **the picture's real length, not the document's.**
    //
    // When stage 1 skips a clip whose source vanished, the picture is shorter
    // than the document says. Sizing the audio bed from `sequenceDurationFrames`
    // (which still counts the skipped clip) and letting the mux's `-shortest`
    // absorb the difference silently cuts the tail off the mix. Phase 2: the
    // composite returns its own frame count for the same reason — there are
    // two ways the picture can differ from the document now.
    const durationSeconds = framesToSeconds(effected.frames, sequence.fps);
    const audioPath = await this.buildAudioStage(
      document,
      durationSeconds,
      workDir,
      request.duckMusicUnderNarration === true,
      (done, total) => this.report({ sequenceId: sequence.id, stage: 'audio', completed: done, total }),
    );

    // --------------------------------------------------------- stage: mux
    this.throwIfCancelled();
    this.report({ sequenceId: sequence.id, stage: 'mux', completed: 0, total: 100 });
    await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
    // S286 — a non-mp4 delivery renders the same mp4 master first (so every
    // export option applies identically), then converts it in a final stage.
    const delivery = request.format !== undefined && request.format !== 'mp4' ? request.format : null;
    const muxTarget = delivery ? path.join(workDir, 'master.mp4') : request.outputPath;
    // S157 — export options land at the final encode. A draft is already
    // half-size, so the resolution ladder is ignored there; a height equal to
    // the sequence's own is a no-op the copy path should keep fast.
    const outputHeight =
      !request.draft && request.outputHeight !== undefined && request.outputHeight !== sequence.height
        ? request.outputHeight
        : undefined;
    // S253 — streamed, because the mux is two very different passes behind
    // one name. With no resolution change and no `high` quality it is
    // `-c:v copy` and takes seconds; with either, it is a full re-encode of
    // the whole timeline and was the last stage that could sit at zero for
    // minutes. Streaming covers both without having to ask which one it is.
    await this.runFfmpegWithProgress(
      buildMuxArgs(effected.path, audioPath, muxTarget, {
        outputHeight,
        quality: request.draft ? undefined : request.quality,
        audioBitrateKbps: request.audioBitrateKbps,
        encoder: this.encoder,
      }),
      durationSeconds,
      (fraction) =>
        this.report({
          sequenceId: sequence.id,
          stage: 'mux',
          completed: Math.round(fraction * 100),
          total: 100,
        }),
    );
    this.report({ sequenceId: sequence.id, stage: 'mux', completed: 100, total: 100 });

    if (!delivery) {
      return { outputPath: request.outputPath, durationSeconds, skipped, encoder: this.encoder };
    }

    // --------------------------------------------------- stage: transcode
    // S286 — master → delivery container. Streamed like the mux (a VP9
    // encode of a long timeline is minutes); GIF is two real passes sharing
    // the one bar — palette first (see `TranscodeOptions.palettePath` for
    // why not the single-command split trick), then the render.
    this.throwIfCancelled();
    this.report({ sequenceId: sequence.id, stage: 'transcode', completed: 0, total: 100 });
    const outputPath =
      delivery === 'png' ? pngSequenceFirstFrame(request.outputPath) : request.outputPath;
    if (delivery === 'gif') {
      const palettePath = path.join(workDir, 'palette.png');
      await this.runFfmpegWithProgress(
        buildGifPaletteArgs(muxTarget, palettePath),
        durationSeconds,
        (fraction) =>
          this.report({
            sequenceId: sequence.id,
            stage: 'transcode',
            completed: Math.round(fraction * 50),
            total: 100,
          }),
      );
      this.throwIfCancelled();
      await this.runFfmpegWithProgress(
        buildTranscodeArgs(muxTarget, request.outputPath, { format: 'gif', palettePath }),
        durationSeconds,
        (fraction) =>
          this.report({
            sequenceId: sequence.id,
            stage: 'transcode',
            completed: 50 + Math.round(fraction * 50),
            total: 100,
          }),
      );
    } else {
      await this.runFfmpegWithProgress(
        buildTranscodeArgs(muxTarget, request.outputPath, {
          format: delivery,
          audioBitrateKbps: request.audioBitrateKbps,
        }),
        durationSeconds,
        (fraction) =>
          this.report({
            sequenceId: sequence.id,
            stage: 'transcode',
            completed: Math.round(fraction * 100),
            total: 100,
          }),
      );
    }
    this.report({ sequenceId: sequence.id, stage: 'transcode', completed: 100, total: 100 });

    return { outputPath, durationSeconds, skipped, encoder: this.encoder };
  }

  /**
   * S157 — "Export audio only": the stage-3 bed (mute, solo-free, optionally
   * ducked — exactly the mix the video export carries) transcoded to AAC at
   * the requested bitrate. Sized to the transport's length, not the
   * picture's: an audio-only export of a music-only sequence must not come
   * out empty because no picture exists.
   */
  private async runAudioOnly(
    document: SequenceDocument,
    request: SequenceRenderRequest,
    workDir: string,
  ): Promise<SequenceRenderResult> {
    const { sequence, tracks, clips } = document;
    const durationSeconds = Math.max(
      0.001,
      framesToSeconds(transportDurationFrames(tracks, clips), sequence.fps),
    );
    const audioPath = await this.buildAudioStage(
      document,
      durationSeconds,
      workDir,
      request.duckMusicUnderNarration === true,
      (done, total) =>
        this.report({ sequenceId: sequence.id, stage: 'audio', completed: done, total }),
    );
    if (!audioPath) {
      throw new Error('There is no audio to export — every audio track is empty or muted.');
    }
    this.throwIfCancelled();
    this.report({ sequenceId: sequence.id, stage: 'mux', completed: 0, total: 0 });
    await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
    await this.runFfmpeg([
      '-y',
      '-i',
      audioPath,
      '-c:a',
      'aac',
      '-b:a',
      `${request.audioBitrateKbps ?? 192}k`,
      request.outputPath,
    ]);
    this.report({ sequenceId: sequence.id, stage: 'mux', completed: 1, total: 1 });
    return { outputPath: request.outputPath, durationSeconds, skipped: [] };
  }

  /**
   * S157 — the adjustment-layer pass.
   *
   * Collects every effect clip on a non-muted video track, turns each into
   * its time-windowed colour chain, and re-encodes the composite once through
   * the joined chain. Neutral clips contribute `''` and drop out; **no effect
   * clips at all returns the input untouched**, so the pre-S157 pipeline is
   * reproduced exactly — a test pins that.
   */
  private async buildEffectPassStage(
    document: SequenceDocument,
    picture: { path: string; frames: number },
    workDir: string,
    request: SequenceRenderRequest,
  ): Promise<{ path: string; frames: number }> {
    const { sequence, tracks, clips } = document;
    const chains = tracks
      // S181 — the eye. `muted` is the speaker on every kind now, so a video
      // track hidden from the composite is `videoEnabled: false`.
      .filter((track) => track.kind === 'video' && track.videoEnabled)
      .flatMap((track) =>
        layoutTrack(clips, track).filter((placed) => placed.clip.sourceKind === 'effect'),
      )
      // Layer order: later (higher) tracks apply after earlier ones, matching
      // the preview's CSS filter concatenation order.
      .map((placed) =>
        buildWindowedColorFilterChain(
          placed.clip.effects,
          framesToSeconds(placed.startFrames, sequence.fps),
          framesToSeconds(placed.endFrames, sequence.fps),
        ),
      )
      .filter((chain) => chain.length > 0);
    if (chains.length === 0) return picture;

    this.throwIfCancelled();
    this.report({ sequenceId: sequence.id, stage: 'effects', completed: 0, total: 0 });
    const effectedPath = path.join(workDir, 'effected.mp4');
    await this.runFfmpeg(
      buildEffectPassArgs(picture.path, effectedPath, chains.join(','), {
        draft: request.draft,
        encoder: this.encoder,
      }),
    );
    this.report({ sequenceId: sequence.id, stage: 'effects', completed: 1, total: 1 });
    return { path: effectedPath, frames: picture.frames };
  }

  /** Segments per layer graph — the same bound the audio graph derives from `MAX_DUB_SEGMENTS`. */
  private static readonly MAX_LAYER_SEGMENTS = 32;

  /**
   * Stages `layers` and `composite` (S154 phase 2).
   *
   * Each populated, non-muted free video track becomes one full-length alpha
   * layer (its clips normalized to qtrle alpha segments, overlaid onto a
   * transparent base at their absolute offsets), and the composite stacks
   * spine + layers bottom-to-top in **one** filter graph — bounded by track
   * count, not clip count, which is why it is one graph where stage 2's
   * crossfade fold is pairwise.
   *
   * A track with more than 32 clips folds in waves: each chunk becomes its
   * own full-length layer, and the composite receives them in order — the
   * audio pipeline's chunk pattern, not a new one.
   *
   * Returns the final picture and its real frame count; with no overlays it
   * returns the spine untouched.
   */
  private async buildCompositeStage(
    document: SequenceDocument,
    spine: { path: string; frames: number },
    workDir: string,
    request: SequenceRenderRequest,
    skipped: string[],
  ): Promise<{ path: string; frames: number }> {
    const { sequence, clips } = document;
    // S253 — the predicate lives in `@shared` so `planStages` asks this exact
    // question rather than a copy of it.
    const overlayTracks = overlayTracksOf(document);
    if (overlayTracks.length === 0) return spine;

    // The composite's length: the spine, or the furthest overlay end —
    // whichever is later. `overlay_past_spine` warned about the tail.
    // Effect clips are excluded (S157): a grade past the last picture must
    // not extend the render with graded black.
    const overlayEndFrames = overlayTracks.reduce(
      (max, track) =>
        layoutTrack(clips, track)
          .filter((placed) => placed.clip.sourceKind !== 'effect')
          .reduce((trackMax, placed) => Math.max(trackMax, placed.endFrames), max),
      0,
    );
    const totalFrames = Math.max(spine.frames, overlayEndFrames);
    const totalSeconds = framesToSeconds(totalFrames, sequence.fps);

    this.report({ sequenceId: sequence.id, stage: 'layers', completed: 0, total: overlayTracks.length });
    const layerPaths: string[] = [];
    let trackIndex = 0;
    for (const track of overlayTracks) {
      this.throwIfCancelled();
      this.report({
        sequenceId: sequence.id,
        stage: 'layers',
        completed: trackIndex,
        total: overlayTracks.length,
        detail: track.name,
      });

      const placedClips = layoutTrack(clips, track);
      const layerSegments: LayerSegment[] = [];
      let segmentIndex = 0;
      for (const placed of placedClips) {
        this.throwIfCancelled();
        const segmentPath = path.join(
          workDir,
          `layer-${trackIndex}-seg-${String(segmentIndex).padStart(4, '0')}.mov`,
        );

        // S157 — an effect clip is not an overlay: it contributes a windowed
        // filter to the pass after the composite, never a pixel layer here.
        if (placed.clip.sourceKind === 'effect') {
          continue;
        }

        // S154 phase 5 — text on an overlay track: drawn transparent, so only
        // the glyphs (and their box) composite over the picture beneath.
        if (placed.clip.sourceKind === 'text') {
          const text = await this.textSegmentArgsFor(placed, sequence, request, segmentPath, workDir, true);
          if (!text) {
            skipped.push(placed.clip.label || placed.clip.id);
            continue;
          }
          layerSegments.push({
            segmentPath: await this.renderSegmentCached(text.args, segmentPath, '.mov', text.descriptor),
            offsetSeconds: framesToSeconds(placed.startFrames, sequence.fps),
            durationSeconds: framesToSeconds(placed.clip.durationFrames, sequence.fps),
          });
          segmentIndex += 1;
          continue;
        }

        if (!placed.clip.filePath || !fs.existsSync(placed.clip.filePath)) {
          // Same rule as the spine: named, not silent, never fatal.
          skipped.push(placed.clip.label || placed.clip.id);
          continue;
        }
        const alphaArgs = buildAlphaSegmentArgs(placed.clip.filePath, segmentPath, {
          width: sequence.width,
          height: sequence.height,
          fps: sequence.fps,
          still: placed.clip.sourceKind === 'still',
          startSeconds: framesToSeconds(placed.clip.sourceInFrames ?? 0, sequence.fps),
          durationSeconds: framesToSeconds(placed.clip.durationFrames, sequence.fps),
          draft: request.draft,
          speed: clipSpeed(placed.clip.effects),
          colorFilter: buildColorFilterChain(placed.clip.effects),
          // S154 phase 6 — the PiP box and static opacity bake into the
          // segment; position is the layer graph's job below.
          transformScale: placed.clip.effects?.transform?.scale,
          opacity: placed.clip.effects?.transform?.opacity,
          // Decode side only — the segment itself stays qtrle for its alpha.
          encoder: this.encoder,
        });
        layerSegments.push({
          segmentPath: await this.renderSegmentCached(
            alphaArgs,
            segmentPath,
            '.mov',
            await this.mediaDescriptor(alphaArgs, [segmentPath], placed.clip.filePath),
          ),
          offsetSeconds: framesToSeconds(placed.startFrames, sequence.fps),
          durationSeconds: framesToSeconds(placed.clip.durationFrames, sequence.fps),
          ...this.positionExpressionsFor(placed, sequence.fps),
        });
        segmentIndex += 1;
      }
      if (layerSegments.length === 0) {
        trackIndex += 1;
        continue;
      }

      // Fold in waves past the input bound; each chunk is its own layer.
      for (let start = 0; start < layerSegments.length; start += SequenceRenderService.MAX_LAYER_SEGMENTS) {
        this.throwIfCancelled();
        const chunk = layerSegments.slice(start, start + SequenceRenderService.MAX_LAYER_SEGMENTS);
        const layerPath = path.join(workDir, `layer-${trackIndex}-${start}.mov`);
        await this.runFfmpeg(
          buildLayerArgs(chunk, layerPath, {
            width: sequence.width,
            height: sequence.height,
            fps: sequence.fps,
            durationSeconds: totalSeconds,
            draft: request.draft,
          }),
        );
        layerPaths.push(layerPath);
      }
      trackIndex += 1;
    }
    this.report({
      sequenceId: sequence.id,
      stage: 'layers',
      completed: overlayTracks.length,
      total: overlayTracks.length,
    });
    if (layerPaths.length === 0) return spine;

    // The composite is a full re-encode of the whole timeline — the one pass
    // where `{completed: 0, total: 0}` would be a lie, so it streams real
    // fractional progress via `-progress pipe:1`.
    this.throwIfCancelled();
    const compositePath = path.join(workDir, 'composite.mp4');
    await this.runFfmpegWithProgress(
      buildCompositeArgs(spine.path, layerPaths, compositePath, {
        fps: sequence.fps,
        draft: request.draft,
        padToSeconds: totalSeconds,
        spineSeconds: framesToSeconds(spine.frames, sequence.fps),
        encoder: this.encoder,
      }),
      totalSeconds,
      (fraction) =>
        this.report({
          sequenceId: sequence.id,
          stage: 'composite',
          completed: Math.round(fraction * 100),
          total: 100,
        }),
    );
    return { path: compositePath, frames: totalFrames };
  }

  /**
   * S154 phase 6 — an overlay clip's centre as fraction expressions, static
   * or keyframed, in **layer time** (the segment is `setpts`-shifted to its
   * absolute offset, so the keyframe ladder shifts with it). Empty when the
   * clip is full-frame and unanimated — the layer graph then emits the exact
   * pre-phase-6 `x=0:y=0`.
   */
  private positionExpressionsFor(
    placed: PlacedClip,
    fps: number,
  ): { xExpression?: string; yExpression?: string } {
    const transform = placed.clip.effects?.transform;
    const hasKeys =
      keyframesFor(placed.clip.keyframes, 'x').length > 0 ||
      keyframesFor(placed.clip.keyframes, 'y').length > 0;
    const hasStatic =
      transform?.x !== undefined || transform?.y !== undefined || (transform?.scale ?? 1) < 0.999;
    if (!hasKeys && !hasStatic) return {};

    const offsetSeconds = framesToSeconds(placed.startFrames, fps);
    const expressionFor = (property: 'x' | 'y'): string => {
      const fallback = transform?.[property] ?? 0.5;
      return keyframesFor(placed.clip.keyframes, property).length > 0
        ? toFfmpegExpression(placed.clip.keyframes, property, { fps, fallback, offsetSeconds })
        : fallback.toFixed(6);
    };
    return { xExpression: expressionFor('x'), yExpression: expressionFor('y') };
  }

  /**
   * Stage 1 for one clip: its normalized segment, or the label to report it
   * skipped under. Nothing here touches shared state, which is what lets the
   * pool run several at once.
   */
  private async normalizeOne(
    placed: PlacedClip,
    index: number,
    count: number,
    document: SequenceDocument,
    request: SequenceRenderRequest,
    workDir: string,
  ): Promise<NormalizeOutcome> {
    const { sequence } = document;
    const segmentPath = path.join(workDir, `seg-${String(index).padStart(4, '0')}.mp4`);

    // S154 phase 5 — a text clip has no source file; its segment is drawn.
    if (placed.clip.sourceKind === 'text') {
      const text = await this.textSegmentArgsFor(placed, sequence, request, segmentPath, workDir, false);
      if (!text) return { skipped: placed.clip.label || placed.clip.id };
      return {
        segmentPath: await this.renderSegmentCached(text.args, segmentPath, '.mp4', text.descriptor),
      };
    }

    if (!placed.clip.filePath || !fs.existsSync(placed.clip.filePath)) {
      // Named, not silent. A clip whose source vanished between preflight
      // and render is a fact the user needs at the end, and dropping the
      // whole render for it would waste everything already normalized.
      return { skipped: placed.clip.label || placed.clip.id };
    }

    const normalizeArgs = await this.normalizeArgsFor(
      placed,
      sequence,
      request,
      segmentPath,
      index === count - 1,
      index === 0,
    );
    // S275 — a zone reveal's polygon geometry lives in mask PNG *content*,
    // and the mask paths are per-render volatile: without naming the settings
    // here, editing a zone would not change the cache key and the render
    // would serve the previous shape. Serpentine/wipe stay args-hashed
    // untouched — their settings are fully spelled out in the graph text.
    const whiteboard =
      placed.clip.sourceKind === 'still' ? placed.clip.effects?.whiteboard : undefined;
    const zoneMasks =
      whiteboard?.pattern === 'zones' && whiteboard.zones?.length
        ? whiteboard.zones.map((_, index) =>
            zoneMaskPath(path.dirname(segmentPath), placed.clip.id, index),
          )
        : [];
    const baseDescriptor = await this.mediaDescriptor(
      normalizeArgs,
      [segmentPath, ...zoneMasks],
      placed.clip.filePath,
    );
    const descriptor =
      zoneMasks.length > 0 && baseDescriptor
        ? { ...(baseDescriptor as Record<string, unknown>), whiteboard }
        : baseDescriptor;
    return {
      segmentPath: await this.renderSegmentCached(normalizeArgs, segmentPath, '.mp4', descriptor),
    };
  }

  /**
   * S154 phase 5 — args for one text clip's segment, or `null` when the clip
   * cannot render (no content, or no system font found — both named in the
   * skip list rather than failing the render). The clip's text is written to
   * the work dir so `drawtext` reads a `textfile=` — never inlined into the
   * filter, which is the escaping trap the builder's comment names.
   */
  private async textSegmentArgsFor(
    placed: PlacedClip,
    sequence: SequenceDocument['sequence'],
    request: SequenceRenderRequest,
    segmentPath: string,
    workDir: string,
    transparent: boolean,
  ): Promise<{ args: string[]; descriptor: unknown } | null> {
    const content = placed.clip.effects?.text;
    if (!content || content.text.trim().length === 0) return null;
    const fontFilePath = resolveDrawtextFont();
    if (!fontFilePath) {
      this.logger.warn('no system font found for burned-in text; clip skipped', {
        clipId: placed.clip.id,
      });
      return null;
    }
    const textFilePath = path.join(workDir, `text-${placed.clip.id}.txt`);
    await fs.promises.writeFile(textFilePath, content.text, 'utf8');
    const args = buildTextSegmentArgs(segmentPath, {
      content,
      width: sequence.width,
      height: sequence.height,
      fps: sequence.fps,
      durationSeconds: framesToSeconds(placed.clip.durationFrames, sequence.fps),
      transparent,
      fontFilePath,
      textFilePath,
      draft: request.draft,
      encoder: this.encoder,
    });
    // A text segment has no source file — its identity IS the content plus
    // the geometry facts. The textfile/output paths are per-render and
    // volatile, so the descriptor names the inputs directly instead.
    const descriptor = {
      v: 1,
      kind: 'text',
      content,
      width: sequence.width,
      height: sequence.height,
      fps: sequence.fps,
      durationFrames: placed.clip.durationFrames,
      transparent,
      fontFilePath,
      draft: request.draft === true,
      // S248 — this descriptor is hand-written rather than args-hashed, so
      // the encoder has to be named explicitly or a GPU segment and a CPU one
      // would share a cache key and the second render would serve the first's
      // file. The args-hashed descriptors get this for free.
      encoder: this.encoder.encoderId,
    };
    return { args, descriptor };
  }

  // Async since S277: a trace-pattern whiteboard resolves (or generates) its
  // cached time-map before the args exist. Every other kind passes through
  // untouched.
  private async normalizeArgsFor(
    placed: PlacedClip,
    sequence: SequenceDocument['sequence'],
    request: SequenceRenderRequest,
    segmentPath: string,
    sequenceTail: boolean,
    sequenceHead: boolean,
  ): Promise<string[]> {
    const { clip } = placed;
    if (!clip.filePath) {
      // Unreachable: the stage dispatches text clips before this and skips
      // null paths — but a thrown name beats a silent `undefined` in ffmpeg.
      throw new Error(`Clip ${clip.id} has no source file to normalize.`);
    }
    // S227 — the last spine clip's `transitionOut` is the sequence's closing
    // treatment: there is no incoming clip to dissolve into, so it renders as
    // a fade inside this clip's own tail, through the same primitive an
    // authored `effects.videoFade` uses.
    const tailType = sequenceTail ? (clip.transitionOut ?? 'cut') : 'cut';
    const tailFrames =
      tailType !== 'cut'
        ? Math.min(Math.max(0, Math.round(clip.transitionOutFrames ?? 0)), clip.durationFrames)
        : 0;
    const authoredFade = clip.effects?.videoFade;
    const fade =
      authoredFade || tailFrames > 0
        ? {
            inFrames: authoredFade?.inFrames,
            outFrames: Math.max(authoredFade?.outFrames ?? 0, tailFrames),
            holdBlackFrames: authoredFade?.holdBlackFrames,
          }
        : undefined;
    const fadeFilter = buildVideoFadeFilter(
      fade,
      clip.durationFrames,
      tailType === 'fade_white' ? 'white' : 'black',
    );
    // S230 — a flash frame paints this clip's own first frames; the boundary
    // stays a hard cut in the join. Never on the first clip of the lane —
    // there is no cut to punctuate.
    const flashFilter =
      clip.transitionIn === 'flash_frame' && !sequenceHead
        ? buildFlashFilter(clip.effects?.transition, clip.transitionFrames)
        : '';
    // S154 phase 3 — one derivation for both kinds; `''`/1 add nothing. The
    // fade rides after the colour chain so a graded clip fades its grade;
    // the flash rides last so it paints over everything.
    const colorFilter = [buildColorFilterChain(clip.effects), fadeFilter, flashFilter]
      .filter(Boolean)
      .join(',');
    // S161 — a still carrying whiteboard settings routes through the reveal
    // producer instead of Ken Burns; the two are mutually exclusive by the
    // inspector's rule, and this branch is the render-side statement of it.
    if (clip.sourceKind === 'still' && clip.effects?.whiteboard) {
      const settings = clip.effects.whiteboard;
      const width = request.draft ? Math.round(sequence.width / 2) : sequence.width;
      const height = request.draft ? Math.round(sequence.height / 2) : sequence.height;
      // S275 — the zone masks rasterize synchronously into the work dir at
      // this render's own geometry (a draft gets halved masks for free).
      // They are per-render scratch; the cache identity comes from the
      // settings object the descriptor carries, not from these files.
      const zoneMaskPaths =
        settings.pattern === 'zones' && settings.zones?.length
          ? writeZoneMasks(settings.zones, width, height, path.dirname(segmentPath), clip.id)
          : undefined;
      // S277 — a trace pattern resolves its content-addressed artifact (the
      // time-map lives under userData keyed by source+params+aspect, so a
      // warm cache costs a stat and the map path itself keys the segment
      // cache). A failed trace degrades to the serpentine reveal — the
      // standing never-fail posture — with the reason in the log.
      let traceArtifact: TraceArtifact | undefined;
      if (settings.pattern === 'trace') {
        try {
          traceArtifact = await ensureTraceArtifact({
            ffmpegPath: this.ffmpegPath,
            filePath: clip.filePath,
            trace: settings.trace ?? WHITEBOARD_TRACE_DEFAULTS,
            frameWidth: sequence.width,
            frameHeight: sequence.height,
            cacheDir: path.join(app.getPath('userData'), 'whiteboard-trace'),
          });
        } catch (error) {
          this.logger.warn('whiteboard trace failed; rendering the serpentine fallback', {
            clipId: clip.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return buildWhiteboardSegmentArgs(clip.filePath, segmentPath, {
        settings,
        width,
        height,
        fps: sequence.fps,
        durationFrames: clip.durationFrames,
        // A missing bundled asset degrades to a hand-less reveal, never a
        // failed render — resolveDrawtextFont's posture.
        handAssetPath: resolveHandAsset(settings.hand),
        colorFilter,
        draft: request.draft,
        encoder: this.encoder,
        zoneMaskPaths,
        traceMapPath: traceArtifact?.mapPath ?? null,
        tracePenPath: traceArtifact?.penPath,
      });
    }
    if (clip.sourceKind === 'still') {
      // S237 — a match dissolve aligns its registration points by nudging
      // the incoming viewport; one shared composer, so the preview cannot
      // disagree about where the maple sits.
      let motion = resolveClipMotion(
        clip.motionPreset,
        clip.effects?.motion,
        clip.durationFrames,
        sequence.fps,
      );
      const match = clip.effects?.transition?.match;
      if (clip.transitionIn === 'match_dissolve' && match && !sequenceHead) {
        motion = composeMatchNudge(motion, match.out, match.in, clip.transitionFrames);
      }
      return buildStillSegmentArgs(clip.filePath, segmentPath, {
        motion,
        // A draft halves the geometry the same way a video clip's does, so the
        // two kinds still concatenate.
        width: request.draft ? Math.round(sequence.width / 2) : sequence.width,
        height: request.draft ? Math.round(sequence.height / 2) : sequence.height,
        durationFrames: clip.durationFrames,
        fps: sequence.fps,
        colorFilter,
        encoder: this.encoder,
      });
    }
    return buildNormalizeVideoArgs(clip.filePath, segmentPath, {
      width: sequence.width,
      height: sequence.height,
      fps: sequence.fps,
      startSeconds: framesToSeconds(clip.sourceInFrames ?? 0, sequence.fps),
      durationSeconds: framesToSeconds(clip.durationFrames, sequence.fps),
      draft: request.draft,
      speed: clipSpeed(clip.effects),
      colorFilter,
      encoder: this.encoder,
    });
  }

  /**
   * Stage 2 — concat for plain cuts, one `filter_complex` graph otherwise.
   *
   * Plain junctions go through the existing `buildConcatFileList` /
   * `buildConcatArgs` with `-c copy`, which is valid **only** because stage 1
   * normalized every segment to identical geometry, fps, pixel format and SAR.
   *
   * Beta S226 — a sequence with any transition renders as **one graph, one
   * encode** (`buildJoinGraph`), replacing the pairwise fold that re-encoded
   * the accumulated spine once per dissolve. Each non-cut boundary holds the
   * outgoing image (`tpad stop_mode=clone`) under the incoming clip's first
   * `effectiveBoundaryTransition().frames` frames, so **the joined length is always the
   * plain sum of durations** — the invariant that keeps the picture aligned
   * with the absolute-offset audio tracks. Above `MAX_JOIN_INPUTS` segments
   * the graph is chunked at cut boundaries (`planJoinChunks`) and the chunk
   * outputs concat with `-c copy`: at most two encode generations, never N.
   */
  private async join(
    video: PlacedClip[],
    segments: string[],
    fps: number,
    workDir: string,
    onProgress: (fraction: number) => void,
  ): Promise<{ path: string; frames: number }> {
    // The joined length, reported so stage 3 can size the audio bed to the
    // picture that actually exists (Beta S151 F7). Under S226's invariant it
    // is the plain sum — the same number `layoutTrack` derives, so the render
    // and the timeline cannot disagree about where anything sits.
    const totalFrames = video.reduce((total, placed) => total + placed.clip.durationFrames, 0);

    // S227 — the boundary arbiter lives in @shared so the preview reads the
    // same answer: incoming `transitionIn` wins, else outgoing `transitionOut`.
    // S230 — the plan decides the token, the linear-light wrap, and the
    // custom expression; `null` (cut, flash) stays a concat.
    const boundaries: JoinBoundary[] = video.slice(1).map((placed, index) => {
      const boundary = effectiveBoundaryTransition(placed.clip, video[index].clip);
      if (boundary.type === 'cut' || boundary.frames <= 0) return { transition: null, frames: 0 };
      const plan = xfadePlanFor(boundary.type, placed.clip.effects?.transition);
      if (!plan) return { transition: null, frames: 0 };
      return {
        transition: plan.token,
        frames: boundary.frames,
        linear: plan.linear,
        customExpr: plan.expr,
      };
    });

    if (boundaries.every((boundary) => boundary.transition === null)) {
      const listPath = path.join(workDir, 'concat.txt');
      await fs.promises.writeFile(listPath, buildConcatFileList(segments), 'utf8');
      const spinePath = path.join(workDir, 'spine.mp4');
      await this.runFfmpeg(buildConcatArgs(listPath, spinePath));
      return { path: spinePath, frames: totalFrames };
    }

    const chunks = planJoinChunks(boundaries, MAX_JOIN_INPUTS);
    const chunkPaths: string[] = [];

    // S253 — join used to report `{0, 0}` for the whole stage, which on a
    // 116-clip sequence is minutes of a bar that does not move. Progress is
    // the fraction of *picture seconds* joined, not of chunks: chunks vary
    // enormously in cost (a cut-only chunk stream-copies, one carrying a
    // dissolve re-encodes), so counting them would move the bar in lurches
    // that misrepresent the time left.
    const chunkSeconds = chunks.map((chunk) =>
      framesToSeconds(
        video
          .slice(chunk.start, chunk.end)
          .reduce((total, placed) => total + placed.clip.durationFrames, 0),
        fps,
      ),
    );
    const joinSeconds = chunkSeconds.reduce((total, seconds) => total + seconds, 0);
    let secondsDone = 0;

    for (const [index, chunk] of chunks.entries()) {
      this.throwIfCancelled();
      const chunkSegments = segments.slice(chunk.start, chunk.end);
      const chunkBoundaries = boundaries.slice(chunk.start, chunk.end - 1);
      const doneBefore = secondsDone;
      const reportChunk = (fraction: number): void => {
        if (joinSeconds <= 0) return;
        onProgress(Math.min(1, (doneBefore + chunkSeconds[index] * fraction) / joinSeconds));
      };
      const chunkPath =
        chunks.length === 1
          ? path.join(workDir, 'spine.mp4')
          : path.join(workDir, `join-${String(index).padStart(4, '0')}.mp4`);

      if (chunkBoundaries.every((boundary) => boundary.transition === null)) {
        // A stream copy: seconds of output per second of wall clock, so
        // there is nothing to stream and the jump to done is honest.
        const listPath = path.join(workDir, `concat-${index}.txt`);
        await fs.promises.writeFile(listPath, buildConcatFileList(chunkSegments), 'utf8');
        await this.runFfmpeg(buildConcatArgs(listPath, chunkPath));
      } else {
        const graph = buildJoinGraph(
          video.slice(chunk.start, chunk.end).map((placed) => placed.clip.durationFrames),
          chunkBoundaries,
          fps,
        );
        const scriptPath = path.join(workDir, `join-graph-${index}.txt`);
        await fs.promises.writeFile(scriptPath, graph, 'utf8');
        // The re-encoding chunk is the slow one, so it is the one that
        // streams. `chunkSeconds` slightly over-counts it (transitions
        // overlap, so the joined chunk is shorter than the sum of its
        // clips), which makes the fraction lag rather than run ahead — the
        // safe direction, and `runFfmpegWithProgress` snaps to 1 on exit.
        await this.runFfmpegWithProgress(
          buildJoinArgs(chunkSegments, scriptPath, chunkPath, this.encoder),
          chunkSeconds[index],
          reportChunk,
        );
      }
      secondsDone += chunkSeconds[index];
      onProgress(joinSeconds > 0 ? Math.min(1, secondsDone / joinSeconds) : 1);
      chunkPaths.push(chunkPath);
    }

    if (chunkPaths.length === 1) {
      return { path: chunkPaths[0], frames: totalFrames };
    }

    const listPath = path.join(workDir, 'concat-chunks.txt');
    await fs.promises.writeFile(listPath, buildConcatFileList(chunkPaths), 'utf8');
    const spinePath = path.join(workDir, 'spine.mp4');
    await this.runFfmpeg(buildConcatArgs(listPath, spinePath));
    return { path: spinePath, frames: totalFrames };
  }

  /**
   * Stage 3 — the audio, honouring per-track mute and the ducking flag.
   *
   * S154 — generalized to N audio tracks with the smallest possible change to
   * the shape S145 shipped: the **key** side of the duck is the lowest-order
   * non-muted audio track (which reproduces A1 exactly for every migrated
   * document), and every other non-muted audio track mixes into the target
   * bed. Both beds still come from `buildAudioTimelineArgs` — the file that
   * carries the measured traps (`normalize=0` on every amix, `afade` before
   * `adelay`) — and **`buildDuckMixArgs` is called unchanged with its two
   * inputs**, so the `[1:a][0:a]` input-order test keeps guarding the real
   * code path. One sidechain, not N.
   *
   * Without ducking (or with only one side populated) everything renders into
   * one flat bed, exactly as before.
   *
   * Returns `null` when there is no audio at all — stage 4 then muxes nothing
   * rather than attaching a silent track.
   */
  private async buildAudioStage(
    document: SequenceDocument,
    durationSeconds: number,
    workDir: string,
    duck: boolean,
    onProgress: (done: number, total: number) => void,
  ): Promise<string | null> {
    const { clips, tracks, sequence } = document;
    const fps = sequence.fps;
    const audioTracks = tracks
      .filter((track) => track.kind === 'audio' && !track.muted)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const placedFor = (track: SequenceTrack): PlacedClip[] =>
      layoutTrack(clips, track).filter(
        (placed) => placed.clip.filePath !== null && fs.existsSync(placed.clip.filePath),
      );

    // S157 — the duck key resolves by **role**, falling back to the pre-role
    // rule (lowest order) via `narrationTrackOf`, which reproduces migration
    // 065's stamping exactly. Every other non-muted audio track is the bed.
    const keyTrack = narrationTrackOf(audioTracks);
    const narration = keyTrack ? placedFor(keyTrack) : [];
    const music = audioTracks.filter((track) => track !== keyTrack).flatMap((track) => placedFor(track));

    // S181 — a video clip's own audio, which never reached this stage before:
    // it collected audio *tracks* only, so the exported file silently dropped
    // sound the monitor was equally silently dropping. Gated on the video
    // track's **speaker** (`muted`), not its eye — hiding a picture and
    // silencing it are now separate decisions.
    const videoAudio = await this.collectSourceAudio(document);
    // Exempt clips join the **key** side rather than bypassing the duck with a
    // third bed. That keeps `buildDuckMixArgs` on its two measured inputs, and
    // it is the musically right answer for what the flag is for: source
    // dialogue should not dip under narration, and it *should* push the bed
    // down the same way narration does.
    const exempt = videoAudio.filter((placed) => placed.clip.duckExempt === true);
    const ducked = videoAudio.filter((placed) => placed.clip.duckExempt !== true);
    narration.push(...exempt);
    music.push(...ducked);

    if (narration.length === 0 && music.length === 0) return null;

    const total = narration.length + music.length;
    onProgress(0, total);

    // Ducking needs both signals; with one lane empty there is nothing to
    // duck under (or nothing to duck), so the flat bed is already correct.
    if (!duck || narration.length === 0 || music.length === 0) {
      const bedPath = path.join(workDir, 'audio.wav');
      await this.runFfmpeg(
        buildAudioTimelineArgs(this.toSegments([...narration, ...music], fps), bedPath, {
          durationSeconds: Math.max(0.001, durationSeconds),
          format: 'wav',
        }),
      );
      onProgress(total, total);
      return bedPath;
    }

    const narrationBed = path.join(workDir, 'audio-narration.wav');
    await this.runFfmpeg(
      buildAudioTimelineArgs(this.toSegments(narration, fps), narrationBed, {
        durationSeconds: Math.max(0.001, durationSeconds),
        format: 'wav',
      }),
    );
    onProgress(narration.length, total);
    this.throwIfCancelled();

    const musicBed = path.join(workDir, 'audio-music.wav');
    await this.runFfmpeg(
      buildAudioTimelineArgs(this.toSegments(music, fps), musicBed, {
        durationSeconds: Math.max(0.001, durationSeconds),
        format: 'wav',
      }),
    );
    onProgress(total, total);
    this.throwIfCancelled();

    const mixedPath = path.join(workDir, 'audio.wav');
    // S251 — the bed's length is pinned here, not left to whatever
    // `sidechaincompress` emits: the mux's `-shortest` cuts the picture to
    // this file, so a short mix is a short export.
    await this.runFfmpeg(
      buildDuckMixArgs(narrationBed, musicBed, mixedPath, { durationSeconds }),
    );
    return mixedPath;
  }

  /**
   * Beta S181 — every video clip whose own audio belongs in the mix.
   *
   * Three gates before a clip qualifies, in increasing cost order so the
   * expensive one runs least:
   *
   * 1. Its track's **speaker** is on (`!track.muted`) — the eye is a separate
   *    question now, and a hidden picture may still be wanted for its sound.
   * 2. The user has not muted the clip. Read as `!== false`, because the field
   *    is optional and absent means audible — that is the default every NLE
   *    ships and the answer migration 071 gives every pre-existing row.
   * 3. The file actually **carries an audio stream**. This one is not
   *    optional politeness: `buildAudioTimelineArgs` maps `[N:a]`, and ffmpeg
   *    fails the whole render with "Stream specifier ':a' matches no streams"
   *    on a silent input rather than contributing nothing. A generated Flow
   *    clip is routinely silent, so this is the common path, not the edge.
   *
   * Probed through a per-render map keyed by path: a sequence usually reuses
   * the same handful of files, and one ffprobe per *distinct* source is
   * negligible beside the render it is part of.
   */
  private async collectSourceAudio(document: SequenceDocument): Promise<PlacedClip[]> {
    const { clips, tracks } = document;
    const candidates = tracks
      .filter((track) => track.kind === 'video' && !track.muted)
      .flatMap((track) => layoutTrack(clips, track))
      .filter(
        (placed) =>
          placed.clip.sourceKind === 'video' &&
          placed.clip.sourceAudioEnabled !== false &&
          placed.clip.filePath !== null &&
          fs.existsSync(placed.clip.filePath),
      );
    if (candidates.length === 0) return [];

    const hasAudio = new Map<string, boolean>();
    const withAudio: PlacedClip[] = [];
    for (const placed of candidates) {
      const filePath = placed.clip.filePath!;
      let answer = hasAudio.get(filePath);
      if (answer === undefined) {
        try {
          answer = (await probeClip(filePath, this.ffmpegPath)).hasAudio;
        } catch (error) {
          // An unreadable source is already the video stage's problem to
          // report; here it just means "contribute no sound", which is the
          // safe answer — the alternative is failing a whole render over a
          // question about audio.
          this.logger.warn('source-audio probe failed; treating the clip as silent', {
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
          answer = false;
        }
        hasAudio.set(filePath, answer);
      }
      if (answer) withAudio.push(placed);
    }
    return withAudio;
  }

  /**
   * `audio-timeline.ts` reuse — the same file that carries the two measured
   * ffmpeg traps (`normalize=0` on every amix, `adelay=MS:all=1`), which is
   * exactly why the beds are built through it rather than re-derived here.
   *
   * S181 — a video clip arrives here exactly like an audio clip: same trim,
   * tempo, fade and volume-curve handling, because `audioPath` is just its
   * `filePath` and ffmpeg reads the audio stream out of a container without
   * caring what else is in it. That reuse is the reason this step needed no
   * new filter-graph code.
   */
  private toSegments(placed: PlacedClip[], fps: number): DubSegmentInput[] {
    return placed.map((item) => {
      // S230 — the split edit: a video clip's own audio may lead (J) or lag
      // (L) its picture cut. Pure arithmetic in @shared; the clamped lead is
      // the preflight's business, not silently re-decided here.
      const window = applySplitEditOffset(
        {
          offsetSeconds: framesToSeconds(item.startFrames, fps),
          sourceInSeconds: framesToSeconds(item.clip.sourceInFrames ?? 0, fps),
          durationSeconds: framesToSeconds(item.clip.durationFrames, fps),
        },
        item.clip.sourceKind === 'video' ? (item.clip.audioOffsetFrames ?? 0) : 0,
        fps,
      );
      return {
        // Non-null by `placedFor`'s filter; audio clips always carry a path.
        audioPath: item.clip.filePath!,
        offsetSeconds: window.offsetSeconds,
        // dB → linear. `audio-timeline.ts` takes a 0-2 multiplier; the document
        // stores dB because that is what a mixer control means to a person.
        volume: Math.min(2, Math.max(0, 10 ** (item.clip.gainDb / 20))),
        // Beta S151 (F3). These columns existed from migration 060 and were
        // round-tripped by the repository, but no render pass had ever read
        // them — `afade` closes that. `durationSeconds` is the clip's *timeline*
        // length (plus any split-edit extension), which is what the fade-out
        // anchors against.
        fadeInSeconds: framesToSeconds(item.clip.fadeInFrames, fps),
        fadeOutSeconds: framesToSeconds(item.clip.fadeOutFrames, fps),
        durationSeconds: window.durationSeconds,
        // S154 phase 3 — the clip's head trim finally reaches the audio graph,
        // and speed rides the same `atrim` window.
        sourceInSeconds: window.sourceInSeconds,
        tempo: clipSpeed(item.clip.effects),
      // S154 phase 6 — a volume curve replaces the static gain when keys
      // exist. Values are authored in dB and converted per key: the curve
      // interpolates in linear gain, which is what `volume` multiplies.
      volumeExpression:
        keyframesFor(item.clip.keyframes, 'volume').length > 0
          ? toFfmpegExpression(
              (item.clip.keyframes ?? []).map((keyframe) =>
                keyframe.property === 'volume'
                  ? { ...keyframe, value: Math.min(2, Math.max(0, 10 ** (keyframe.value / 20))) }
                  : keyframe,
              ),
              'volume',
              { fps, fallback: Math.min(2, Math.max(0, 10 ** (item.clip.gainDb / 20))) },
            )
          : undefined,
      };
    });
  }

  private throwIfCancelled(): void {
    if (this.active?.cancelled) {
      throw new Error('Render cancelled.');
    }
  }

  /**
   * Runs one ffmpeg pass, holding the child so `cancel()` can kill it.
   *
   * `execFile` (no shell) is what makes interpolated file paths safe here, the
   * same reasoning `video-editor.ts` records. The generous `maxBuffer` is for
   * ffmpeg's progress chatter on stderr, which accumulates across a long
   * normalize pass.
   */
  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.ffmpegPath,
        args,
        { maxBuffer: 16 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          this.active?.children.delete(child);
          if (error) {
            if (this.active?.cancelled) {
              reject(new Error('Render cancelled.'));
              return;
            }
            // ffmpeg's own last words are far more useful than execFile's
            // "Command failed", and they are at the end of stderr.
            const tail = String(stderr).trim().split('\n').slice(-4).join(' ');
            reject(new Error(tail || error.message));
            return;
          }
          resolve();
        },
      );
      this.active?.children.add(child);
    });
  }

  /**
   * S154 phase 2 — one ffmpeg pass with **real streamed progress**.
   *
   * `-progress pipe:1 -nostats` makes ffmpeg emit `out_time_us=` key/value
   * lines on stdout, which this parses against the known total duration into
   * a 0..1 fraction. Used by the composite pass alone: it is the one
   * full-length re-encode whose `{0, 0}` progress would be a lie. Everything
   * else keeps `runFfmpeg`'s `execFile` shape and its `maxBuffer`/stderr-tail
   * error reporting; `cancel()`'s `child.kill()` contract is identical here.
   */
  private runFfmpegWithProgress(
    args: string[],
    totalSeconds: number,
    onProgress: (fraction: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.ffmpegPath,
        ['-progress', 'pipe:1', '-nostats', ...args],
        { maxBuffer: 16 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          this.active?.children.delete(child);
          if (error) {
            if (this.active?.cancelled) {
              reject(new Error('Render cancelled.'));
              return;
            }
            const tail = String(stderr).trim().split('\n').slice(-4).join(' ');
            reject(new Error(tail || error.message));
            return;
          }
          onProgress(1);
          resolve();
        },
      );
      child.stdout?.on('data', (chunk: Buffer | string) => {
        const match = /out_time_us=(\d+)/.exec(String(chunk));
        if (!match || totalSeconds <= 0) return;
        onProgress(Math.min(1, Number(match[1]) / 1_000_000 / totalSeconds));
      });
      this.active?.children.add(child);
    });
  }
}
