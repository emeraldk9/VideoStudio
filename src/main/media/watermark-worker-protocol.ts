import type { PixelRect, WatermarkEngine } from '../../shared/types/watermark';

/**
 * Beta S235 — the message pair between `watermark-still.ts` and its worker.
 *
 * ## Why only stills go to a worker
 *
 * Phase 0 measured both halves of this feature, and they came out four orders
 * of magnitude apart:
 *
 * - A **still** runs the adaptive search harness: 2,700-7,900 ms on real Flow
 *   output, degenerating to ~17,000 ms on flat content. That is far too much
 *   for the main thread, and a 500-item batch needs it parallelised.
 * - A **video frame** runs the arithmetic primitive against an already-known
 *   rect: ~55-380 us. Across a whole 8-second clip that totalled **10.5 ms —
 *   0.91% of wall time**, with ffmpeg's decode and encode accounting for the
 *   rest.
 *
 * So stills go to workers and video frames do not. Marshalling 192 frames
 * across a thread boundary to save 10 ms would cost more than it saved, and it
 * would put the ffmpeg pipes on the wrong side of the boundary.
 *
 * ## Why one worker per item rather than a pool
 *
 * The budget in `WatermarkBatchOptions.perItemBudgetMs` has to be enforceable,
 * and `removeWatermarkFromImageDataSync` is a *synchronous* call. Once it
 * starts, nothing inside the worker can interrupt it — no timer fires, no
 * message is read. The only way to cap it is `worker.terminate()`, which means
 * the worker must be disposable. That is the same one-shot shape
 * `post-processor.ts` uses, for a related reason.
 */

export interface WatermarkStillRequest {
  itemId: string;
  /** Raw RGBA pixels, transferred rather than copied. */
  pixels: ArrayBuffer;
  width: number;
  height: number;
  /**
   * When set, the exact rect, template and strength to apply — skipping the
   * search entirely and taking the ~300 us path. Used for a preset whose
   * geometry has been **detected** on this item (Beta S495).
   *
   * `alphaMap` is mandatory. Before S495 a known rect without a template was
   * inverted against a flat mask of 1.0, which at the 0.99 alpha clamp turns
   * every real pixel into `(p - 252) / 0.01` — a solid black box. That is what
   * the manual preview showed, and what a text or diamond preset did to a
   * still. A hand-drawn box has no template and must go to a fill engine; the
   * worker refuses rather than inventing one.
   */
  known?: { rect: PixelRect; alphaMap: ArrayBuffer; alphaGain?: number };
}

export interface WatermarkStillResponse {
  itemId: string;
  ok: boolean;
  /** Present only on success; the same buffer, transferred back. */
  pixels?: ArrayBuffer;
  /** Where the mark actually was — from the search, not from the catalogue. */
  rect: PixelRect | null;
  /** The per-image calibration the search settled on. Phase 0 saw 0.45-1.0. */
  alphaGain: number | null;
  engine: WatermarkEngine | null;
  /** The library's own confidence label, e.g. `validated-match`. */
  decisionTier: string | null;
  /** True when the remover's own detector can still see a residual. */
  residualVisible: boolean;
  /** How many pixels changed. Zero means "there was no watermark here". */
  touched: number;
  error?: string;
}
