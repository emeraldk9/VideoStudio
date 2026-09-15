import { create } from 'zustand';

import type {
  NormalizedRect,
  WatermarkBatchRecord,
  WatermarkEngine,
  WatermarkItemRecord,
  WatermarkOutputMode,
  WatermarkPresetId,
  WatermarkPresetSummary,
  WatermarkFrameResult,
  WatermarkPreviewResult,
  WatermarkInpaintStatus,
  WatermarkModelDownloadProgress,
} from '@shared/types/watermark';

import type { WatermarkBatchSource } from '../../../shared/model/modalStore';

/**
 * Beta S235 — the batch modal's own state.
 *
 * Its own store rather than a slice of `uiStore`, for the reason the update
 * banner gives: a batch outlives the modal. Someone starts 400 items, closes
 * the dialog and goes back to the Library, and the progress has to still be
 * there when they reopen it — and still be there to warn them when they try to
 * start a second one.
 */

/**
 * A source chosen for the batch, with a label the modal can show. The shape
 * is `modalStore`'s, because that is where every opener hands its list over —
 * the Library widget may import this slice, but the Story Builder slices that
 * also open the dialog may not.
 */
export type WatermarkChosenSource = WatermarkBatchSource;

/** Sensible starting box: a small rectangle in the bottom-right, where marks live. */
const DEFAULT_MANUAL_RECT: NormalizedRect = { x: 0.82, y: 0.86, w: 0.14, h: 0.09 };

export interface WatermarkStoreState {
  presets: WatermarkPresetSummary[];
  sources: WatermarkChosenSource[];
  presetId: WatermarkPresetId;
  manualRect: NormalizedRect;
  outputMode: WatermarkOutputMode;
  engineOverride: WatermarkEngine | null;
  lossless: boolean;
  exportDir: { token: string; label: string } | null;

  preview: WatermarkPreviewResult | null;
  /**
   * Beta S494 — the first item's frame, which the manual box is drawn over.
   *
   * Taken from the last preview's `beforePath`, and deliberately *not* dropped
   * with the preview. Moving the box invalidates the before/after (the rule
   * above), but not the picture underneath it: before this was split out, the
   * first drag cleared the frame too, and the box was left floating over an
   * empty canvas that asked for an item the batch already had.
   *
   * Cleared when the first item changes, because then it is a picture of the
   * wrong file.
   */
  previewFrame: string | null;
  previewing: boolean;
  previewError: string | null;

  /**
   * Beta S495 — the frame the picker draws over, independent of any preview.
   *
   * Fetched when the first item changes or the time is scrubbed, and kept
   * while the box is moved. Before this the picker showed a picture only
   * after a preview had succeeded and lost it again on the first drag, which
   * is a picker that is blank exactly when it is being used.
   */
  frame: WatermarkFrameResult | null;
  /** Where in a clip the frame is taken, in seconds. Zero for a still. */
  frameAt: number;

  lastBatch: WatermarkBatchRecord | null;
  lastItems: WatermarkItemRecord[];
  startError: string | null;

  /**
   * Beta S235 Phase 4 — the inpainting engine's state. `null` until the modal
   * asks for it, which it does on open; a build without the runtime reports
   * `runtimeAvailable: false` rather than being absent, so the section can say
   * *why* it is unavailable instead of silently vanishing.
   */
  inpaint: WatermarkInpaintStatus | null;
  /** True while `downloadModel` is in flight, so the button can't be pressed twice. */
  modelBusy: boolean;
  modelError: string | null;

  setPresets: (presets: WatermarkPresetSummary[]) => void;
  setSources: (sources: WatermarkChosenSource[]) => void;
  addSources: (sources: WatermarkChosenSource[]) => void;
  removeSource: (sourceId: string) => void;
  setPresetId: (presetId: WatermarkPresetId) => void;
  setManualRect: (rect: NormalizedRect) => void;
  setOutputMode: (mode: WatermarkOutputMode) => void;
  setEngineOverride: (engine: WatermarkEngine | null) => void;
  setLossless: (lossless: boolean) => void;
  setExportDir: (dir: { token: string; label: string } | null) => void;
  setPreview: (preview: WatermarkPreviewResult | null) => void;
  setPreviewing: (previewing: boolean) => void;
  setPreviewError: (error: string | null) => void;
  setFrame: (frame: WatermarkFrameResult | null) => void;
  /** Moves the scrub point. Drops the preview, which was of a different frame. */
  setFrameAt: (seconds: number) => void;
  setResult: (batch: WatermarkBatchRecord | null, items: WatermarkItemRecord[]) => void;
  setStartError: (error: string | null) => void;
  setInpaint: (status: WatermarkInpaintStatus | null) => void;
  /** Folds a pushed download tick into the status the section renders. */
  setModelDownload: (download: WatermarkModelDownloadProgress) => void;
  setModelBusy: (busy: boolean) => void;
  setModelError: (error: string | null) => void;
  /** Clears everything a *new* batch should not inherit, keeping the preset choice. */
  resetForNewBatch: () => void;
}

/**
 * Beta S494 — what a change to the item list invalidates.
 *
 * The preview and the frame under the manual box are both pictures of
 * `sources[0]`. Drop or replace that item and they describe a file this batch
 * may no longer contain — but *adding* a second item leaves the first one's
 * preview exactly as true as it was, so only a change of head clears them.
 */
function headPatch(
  before: WatermarkChosenSource[],
  after: WatermarkChosenSource[],
): Partial<WatermarkStoreState> {
  if (before[0]?.sourceId === after[0]?.sourceId) return {};
  return { preview: null, previewFrame: null, previewError: null };
}

export const useWatermarkStore = create<WatermarkStoreState>((set) => ({
  presets: [],
  sources: [],
  // Beta S495 — detect by default. S235 §2.5 found the mark family varies
  // clip by clip, and the 2026-09-11 audit found every clip in the Library
  // carrying the diamond while the default here named the text mark.
  presetId: 'auto',
  manualRect: DEFAULT_MANUAL_RECT,
  outputMode: 'derive',
  engineOverride: null,
  lossless: false,
  exportDir: null,

  preview: null,
  previewFrame: null,
  previewing: false,
  previewError: null,
  frame: null,
  frameAt: 0,

  lastBatch: null,
  lastItems: [],
  startError: null,

  inpaint: null,
  modelBusy: false,
  modelError: null,

  setPresets: (presets) => set({ presets }),
  setSources: (sources) => set((state) => ({ sources, ...headPatch(state.sources, sources) })),

  // Deduplicated by `sourceId`: the Library selection and the external picker
  // can both contribute, and adding the same file twice would clean it twice
  // and race two writers onto one output path.
  addSources: (incoming) =>
    set((state) => {
      const seen = new Set(state.sources.map((s) => s.sourceId));
      const sources = [...state.sources, ...incoming.filter((s) => !seen.has(s.sourceId))];
      return { sources, ...headPatch(state.sources, sources) };
    }),

  removeSource: (sourceId) =>
    set((state) => {
      const sources = state.sources.filter((s) => s.sourceId !== sourceId);
      return { sources, ...headPatch(state.sources, sources) };
    }),

  // Changing the region invalidates the preview: showing a before/after from
  // the previous settings next to the new ones is worse than showing nothing.
  setPresetId: (presetId) => set({ presetId, preview: null, previewError: null }),
  // The frame is deliberately *not* dropped here: it is the thing the box is
  // being drawn over, and it does not change when the box does.
  setManualRect: (manualRect) => set({ manualRect, preview: null, previewError: null }),
  setFrame: (frame) => set({ frame }),
  setFrameAt: (frameAt) => set({ frameAt, preview: null, previewError: null }),

  setOutputMode: (outputMode) => set({ outputMode }),
  setEngineOverride: (engineOverride) => set({ engineOverride, preview: null }),
  setLossless: (lossless) => set({ lossless }),
  setExportDir: (exportDir) => set({ exportDir }),

  // The frame is taken from the same answer but outlives it — see `previewFrame`.
  setPreview: (preview) =>
    set((state) => ({
      preview,
      previewFrame: preview ? preview.beforePath : state.previewFrame,
      previewing: false,
      previewError: null,
    })),
  setPreviewing: (previewing) => set({ previewing }),
  setPreviewError: (previewError) => set({ previewError, previewing: false, preview: null }),

  setResult: (lastBatch, lastItems) => set({ lastBatch, lastItems }),
  setStartError: (startError) => set({ startError }),

  setInpaint: (inpaint) => set({ inpaint }),

  // A pushed tick updates only the download half, so a status fetched on open
  // is not thrown away by the first progress event of a download.
  setModelDownload: (download) =>
    set((state) => (state.inpaint ? { inpaint: { ...state.inpaint, download } } : {})),

  setModelBusy: (modelBusy) => set({ modelBusy }),
  setModelError: (modelError) => set({ modelError }),

  resetForNewBatch: () =>
    set({
      sources: [],
      preview: null,
      previewFrame: null,
      previewError: null,
      previewing: false,
      frame: null,
      frameAt: 0,
      lastBatch: null,
      lastItems: [],
      startError: null,
    }),
}));
