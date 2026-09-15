/**
 * Beta S235 — local batch watermark removal.
 *
 * These types cross the IPC boundary, so they carry no pixel data and no file
 * handles: a batch is described by *what to do*, and the main process resolves
 * every path itself against the S213 allowlist.
 */

/**
 * A rectangle normalized to its image (0..1, origin top-left).
 *
 * Same shape as `SheetPanelRegion` (`story.ts`) sans the panel id, and the same
 * shape `sheet-crop.ts`'s `RegionRect` uses — deliberately, because it is the
 * house convention for "a rect that survives an unknown resolution". A batch
 * mixes resolutions freely, so a hand-drawn box has to be normalized or it
 * would mean a different region on every item.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rect in real pixels, resolved against one image's dimensions. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which watermark family a preset belongs to.
 *
 * This is not cosmetic grouping — it selects the removal engine. Only the three
 * templated families can use the exact alpha-unblend path (`WATERMARK_ENGINES.
 * ALPHA_UNBLEND`); `manual` has no alpha template by definition and must fill.
 */
export type WatermarkFamily = 'auto' | 'gemini-still' | 'veo-diamond' | 'veo-text' | 'manual';

/**
 * Phase 0 (§2.5) found real Flow clips carry the Veo **text** mark far more
 * often than the diamond — 3 of 4 samples scored 0.79–0.98 NCC on
 * `veo-text-23x10` while the diamond scored 0.06–0.36. Both families ship, and
 * detection picks per item rather than assuming from resolution.
 */
export type WatermarkPresetId =
  /**
   * Beta S495 — detect the mark per item before cleaning it. Every catalogued
   * family is scored on sampled frames and the winner is cleaned; nothing is
   * cleaned when none passes its threshold. The default, because S235 §2.5
   * found the family varies clip by clip and cannot be assumed from anything.
   */
  | 'auto'
  | 'gemini-auto'
  | 'veo-diamond-auto'
  | 'veo-text-23x10'
  | 'veo-text-68x30'
  | 'veo-text-99x43'
  | 'manual';

/**
 * One entry in the preset catalogue, as the region picker sees it.
 *
 * Lives here rather than beside the catalogue itself because it crosses IPC:
 * `@shared` cannot import from `@main`, and the renderer needs the shape to
 * render the list.
 */
export interface WatermarkPresetSummary {
  id: WatermarkPresetId;
  label: string;
  family: WatermarkFamily;
  /** Only these can use the exact alpha-unblend path; `manual` must fill. */
  hasAlphaTemplate: boolean;
  /** Shown under the label, so the text mark is distinguishable from the diamond. */
  hint: string;
}

/**
 * How a region is specified for a batch.
 *
 * `preset` defers geometry to the catalogue, which knows each family's anchor
 * and projection rules. `manual` carries the box itself.
 */
export type WatermarkRegionSpec =
  | { kind: 'preset'; presetId: Exclude<WatermarkPresetId, 'manual'> }
  | { kind: 'manual'; rect: NormalizedRect };

/**
 * The removal engines, in the order the ladder prefers them.
 *
 * `alpha-unblend` is *exact* — it inverts the blend rather than inventing
 * pixels — so it always wins where a template applies. The fills below it are
 * approximations, and `delogo`/`removelogo` run inside the ffmpeg graph, which
 * is why the video fast path needs no JS in the loop at all.
 */
export const WATERMARK_ENGINES = ['alpha-unblend', 'lama', 'removelogo', 'delogo'] as const;
export type WatermarkEngine = (typeof WATERMARK_ENGINES)[number];

/**
 * Where cleaned files land.
 *
 * Export is deliberately *not* a third mode: it is a modifier
 * (`WatermarkBatchOptions.exportDirToken`), because copying to a folder is
 * orthogonal to whether the library row is new or replaced. Making it a mode
 * would force a false choice between "reusable in the app" and "delivered".
 */
export const WATERMARK_OUTPUT_MODES = ['derive', 'replace'] as const;
export type WatermarkOutputMode = (typeof WATERMARK_OUTPUT_MODES)[number];

/**
 * Where an item came from. Determines how its path is authorized.
 *
 * Beta S353 added `sequence-media` — a row in migration 070's `sequence_media`,
 * the media pool's imported files. It is deliberately its own kind rather than
 * being folded into `external`: an imported file is a *reference the project
 * owns a record of*, which is what lets `media://` serve it, what lets a clean
 * relink the clips pointing at it, and what lets the row carry a cleanliness
 * stamp. An `external` token carries none of that — it is authorization for one
 * file, in one session, and forgetting the difference is how a cleaned file
 * ends up unservable beside a timeline that still points at the marked one.
 */
export const WATERMARK_SOURCE_KINDS = [
  'output',
  'story-take',
  'entity',
  'external',
  'sequence-media',
] as const;
export type WatermarkSourceKind = (typeof WATERMARK_SOURCE_KINDS)[number];

/**
 * Beta S353 — "this file has been cleaned", as a fact stored beside the file's
 * own record.
 *
 * **Stamped, not derived**, for `StoryTakeRef.cleaned`'s reason: asking a file
 * whether it still carries a mark means running the detector, which Phase 0
 * measured at 2.7-7.9 s per still. A count built by inspection would cost
 * minutes to render a label.
 *
 * What this adds over the story-side stamp is `size`/`mtimeMs` — the identity
 * the file carried *when it was cleaned*, the same `size + mtime` convention
 * `segment-cache.ts` and `tts_clip_probes` use. A story take is immutable once
 * rendered, so its stamp cannot go stale; an imported file sits on the user's
 * own disk under a path they can overwrite, and a Library row cleaned in
 * `replace` mode is rewritten in place. Without the identity, a re-exported
 * file at the same path would keep claiming to be clean. With it, a stamp that
 * no longer matches the file is simply **not a stamp** — the honest answer
 * being "unknown", which reads as "not known to be clean".
 */
export interface WatermarkCleanedStamp {
  at: string;
  engine: WatermarkEngine;
  /** The cleaned file's size in bytes. A mismatch invalidates the stamp. */
  size: number;
  /** The cleaned file's mtime, rounded to whole ms. A mismatch invalidates the stamp. */
  mtimeMs: number;
}

export const WATERMARK_ITEM_STATUSES = [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'cancelled',
] as const;
export type WatermarkItemStatus = (typeof WATERMARK_ITEM_STATUSES)[number];

export const WATERMARK_BATCH_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type WatermarkBatchStatus = (typeof WATERMARK_BATCH_STATUSES)[number];

/** One item the renderer asks to clean. Never a bare path — see the file header. */
export interface WatermarkSourceRef {
  kind: WatermarkSourceKind;
  /**
   * Identifies the row to resolve: an `outputs.id`, a `takeId`, an entity id, or
   * — for `external` only — the token a prior `watermark:pickExternalFiles`
   * dialog handed back. A renderer-supplied filesystem path is never accepted.
   */
  sourceId: string;
}

export interface WatermarkBatchOptions {
  region: WatermarkRegionSpec;
  outputMode: WatermarkOutputMode;
  /** Additionally copy every cleaned file into this directory. Main-process dialog only. */
  exportDirToken?: string;
  /** Force one engine instead of letting the ladder choose. */
  engineOverride?: WatermarkEngine;
  /**
   * Phase 0 (§2.4a): the search harness costs 2.7–7.9 s on real stills and
   * degenerates to ~17 s on flat content, where it cannot discriminate
   * candidates. Past this budget the item falls back to a fill engine rather
   * than stalling a 500-item batch on one flat sky.
   */
  perItemBudgetMs?: number;
  /** Re-encode losslessly instead of visually-lossless. Archival; much larger files. */
  lossless?: boolean;
}

export interface WatermarkItemRecord {
  id: string;
  batchId: string;
  sourceKind: WatermarkSourceKind;
  sourceId: string;
  inputPath: string;
  outputPath: string | null;
  /** Where the original was moved for `replace`, so the item can be reverted. */
  backupPath: string | null;
  /** The pixel rect actually used, for display and for revert-time auditing. */
  appliedRect: PixelRect | null;
  engine: WatermarkEngine | null;
  status: WatermarkItemStatus;
  error: string | null;
  durationMs: number | null;
}

export interface WatermarkBatchRecord {
  id: string;
  createdAt: string;
  completedAt: string | null;
  status: WatermarkBatchStatus;
  options: WatermarkBatchOptions;
  itemCount: number;
  doneCount: number;
  failedCount: number;
}

/** Pushed on `IPC_EVENTS.WATERMARK_PROGRESS` while a batch runs. */
export interface WatermarkProgress {
  batchId: string;
  status: WatermarkBatchStatus;
  itemCount: number;
  doneCount: number;
  failedCount: number;
  /** 0..1 across the whole batch, including partial progress on the current item. */
  progress: number;
  /** What is on screen right now — a filename, not a path. */
  currentLabel: string | null;
}

/**
 * Beta S495 — a concrete mark, found on the item's own pixels.
 *
 * The rect is where the template scored, not where the catalogue guessed;
 * `ncc` is the median normalized cross-correlation over the sampled frames
 * and `gain` the opacity multiplier calibrated on them. This is what the
 * batch actually cleans, so it is what the preview reports.
 */
export interface WatermarkDetection {
  presetId: Exclude<WatermarkPresetId, 'auto' | 'manual'>;
  rect: PixelRect;
  ncc: number;
  gain: number;
  /** How many sampled frames were scored, and how many chose this mark. */
  frames: number;
  votes: number;
}

/**
 * Beta S495 — one frame of a source, rendered for the region picker.
 *
 * The picker draws the box over this rather than over a preview result, so
 * the picture is there before any cleaning has been asked for and stays there
 * while the box is moved. `width`/`height` let the picker take the media's
 * own aspect ratio, so a normalized box means the same pixels the batch will
 * touch.
 */
export interface WatermarkFrameResult {
  /** A `media://`-servable PNG in the preview cache. */
  path: string;
  width: number;
  height: number;
  /** Zero for a still. */
  durationSec: number;
  /** The time the frame was taken at, in seconds. */
  atSeconds: number;
  mediaType: 'image' | 'video';
}

/**
 * What a single-item preview returns, so the Region step can show the user what
 * the batch is about to do before committing to hundreds of items.
 */
export interface WatermarkPreviewResult {
  /** `media://`-servable paths to a before/after pair rendered into the cache. */
  beforePath: string;
  afterPath: string;
  rect: PixelRect;
  engine: WatermarkEngine;
  /** Beta S495 — the mark that was found, when a preset was detected rather than searched. */
  detection?: WatermarkDetection | null;
  /**
   * The library's own confidence signal. `validated-match` means detection and
   * removal agreed; anything else is worth showing the user before a batch run.
   */
  decisionTier: string | null;
  /**
   * True when the removal left a residual its own detector can still see —
   * surfaced rather than hidden, because the honest answer on a hard frame is
   * "this one needs a manual box".
   */
  residualVisible: boolean;
}

/**
 * Why a revert could not happen.
 *
 * Beta S247 — the handler used to answer `null` for all of these, which made
 * "nothing to put back" and "the file it named is gone" indistinguishable.
 * They are very different facts: the second means the only copy of what the
 * file used to be has been lost.
 */
export const WATERMARK_REVERT_REFUSALS = [
  'no-backup',
  'backup-missing',
  'not-allowed',
  'failed',
] as const;
export type WatermarkRevertRefusal = (typeof WATERMARK_REVERT_REFUSALS)[number];

/**
 * What a revert did, or why it did nothing.
 *
 * `restored` is the **filename that was put back**, deliberately — not a claim
 * that it is the pristine original. A backup is whatever the file was
 * immediately before that clean, and when a take has been upscaled first that
 * is a `_2K` derivative. Measured on a real project: of 256 cleaned items, 104
 * had a backup that was itself a derivative and only 6 were plausibly
 * pristine. Naming the file lets the UI say what it actually restored instead
 * of calling all of them "the original".
 */
export type WatermarkRevertResult =
  | { ok: true; item: WatermarkItemRecord; restored: string }
  | { ok: false; reason: WatermarkRevertRefusal; detail?: string };

// ------------------------------------------------------------ Phase 4 — Engine C

/**
 * Which execution provider the inference runtime ended up on.
 *
 * Windows drives every GPU — NVIDIA included — through DirectML; macOS through
 * CoreML. CUDA is Linux-only in `onnxruntime-node` and this app ships for
 * Windows and macOS, so it never enters the ladder.
 */
export type WatermarkAccelerator = 'dml' | 'coreml' | 'cpu';

export const WATERMARK_MODEL_DOWNLOAD_STATES = [
  'idle',
  'downloading',
  'verifying',
  'failed',
] as const;
export type WatermarkModelDownloadState = (typeof WATERMARK_MODEL_DOWNLOAD_STATES)[number];

/** Pushed on `IPC_EVENTS.WATERMARK_MODEL_DOWNLOAD` while the model downloads. */
export interface WatermarkModelDownloadProgress {
  state: WatermarkModelDownloadState;
  receivedBytes: number;
  totalBytes: number;
  error: string | null;
}

/**
 * Everything the dialog needs to say about the inpainting engine, and nothing
 * it could misuse: the model's size, source host, license and hash are stated
 * so the download is an informed choice, and no filesystem path crosses.
 */
export interface WatermarkInpaintStatus {
  /** The native runtime loaded. False on an unsupported platform (e.g. Intel macOS). */
  runtimeAvailable: boolean;
  /** Which provider a session would use, once one has been created. `null` before that. */
  accelerator: WatermarkAccelerator | null;
  model: {
    installed: boolean;
    fileName: string;
    sizeBytes: number;
    sha256: string;
    license: string;
    /** Host only — stated so the user knows where the bytes come from. */
    sourceHost: string;
  };
  download: WatermarkModelDownloadProgress;
}
