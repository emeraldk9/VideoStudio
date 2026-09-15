import { parentPort } from 'node:worker_threads';

import { removeWatermarkFromImageDataSync } from '@pilio/gemini-watermark-remover/image-data';

import type { PixelRect } from '../../shared/types/watermark';

import { edgeBandMask, fillEdgeBand } from './watermark-edge-band';
import { unblendRegion } from './watermark-unblend';
import type { WatermarkStillRequest, WatermarkStillResponse } from './watermark-worker-protocol';

/**
 * Beta S235 — one still, cleaned, off the main thread.
 *
 * This runs in a plain `node:worker_threads` context with no Electron `app`
 * module, so — exactly as `post-processor-worker.ts` documents — it cannot use
 * the file-backed `Logger`. All logging for this worker lives in its owner,
 * `watermark-still.ts`, which has the item id and the timings in hand.
 *
 * The worker is **one-shot**: its owner terminates it after a single item, both
 * to enforce the per-item time budget (see the protocol file) and because the
 * upstream harness caches template state internally in ways we would rather not
 * carry between unrelated images.
 */

/**
 * The DOM type the upstream core expects, minted here because Node has no
 * `ImageData` global.
 *
 * Two call sites inside the harness construct one directly
 * (`watermarkProcessor.js:558`, `restorationMetrics.js:129`), so a plain object
 * is not enough — the constructor has to exist. Both of its real signatures are
 * honoured because the library uses both. Verified in Phase 0 against real Flow
 * output; without this the harness throws `ImageData is not defined` partway
 * through, after having already spent seconds searching.
 *
 * Note that `watermarkEngine.js` also reaches for `OffscreenCanvas`/`document`,
 * but only on the *async* `createWatermarkEngine()` path. Importing the sync
 * entry point never loads it, which is why no canvas shim is needed here.
 */
class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb';

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight ?? 0;
    }
  }
}

interface GlobalWithImageData {
  ImageData?: unknown;
}
const globals = globalThis as GlobalWithImageData;
globals.ImageData ??= NodeImageData;

/** Narrow view of the harness result — the library's own `.d.ts` types the rest. */
interface HarnessMeta {
  applied?: boolean;
  position?: PixelRect | null;
  alphaGain?: number;
  decisionTier?: string | null;
  detection?: { residualVisibility?: { visible?: boolean } | null } | null;
}

function countChanged(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) n++;
  }
  return n;
}

function handle(req: WatermarkStillRequest): WatermarkStillResponse {
  const pixels = new Uint8ClampedArray(req.pixels);
  const original = new Uint8ClampedArray(pixels);

  // The cheap path: geometry already known, so skip the search entirely and
  // take the ~300us arithmetic instead of the ~3s one.
  if (req.known) {
    const expected = Math.round(req.known.rect.width) * Math.round(req.known.rect.height);
    const alphaMap = new Float32Array(req.known.alphaMap);
    // Beta S495 — refused, not improvised. The flat mask this used to fall
    // back on turned the whole rect black (see the protocol file); a rect
    // without its template is a caller bug, and a loud one is cheaper than a
    // picture with a black box in the corner.
    if (alphaMap.length !== expected) {
      throw new Error(
        `a known rect needs its alpha template: got ${alphaMap.length} values for a ${expected}-pixel rect`,
      );
    }
    const frame = { data: pixels, width: req.width, height: req.height };
    const touched = unblendRegion(frame, alphaMap, req.known.rect, { alphaGain: req.known.alphaGain });
    // Beta S495 — the same edge cleanup the video loop applies, so a preview
    // of a clip frame shows what the batch will produce.
    if (touched > 0) {
      fillEdgeBand(
        frame,
        req.known.rect,
        edgeBandMask(alphaMap, Math.round(req.known.rect.width), Math.round(req.known.rect.height)),
      );
    }
    return {
      itemId: req.itemId,
      ok: true,
      pixels: pixels.buffer,
      rect: req.known.rect,
      alphaGain: req.known.alphaGain ?? 1,
      engine: 'alpha-unblend',
      decisionTier: 'known-geometry',
      residualVisible: false,
      touched,
    };
  }

  const image = new NodeImageData(pixels, req.width, req.height);
  const result = removeWatermarkFromImageDataSync(image);
  const meta = (result?.meta ?? {}) as HarnessMeta;
  const out = (result?.imageData?.data ?? pixels);

  return {
    itemId: req.itemId,
    ok: meta.applied !== false,
    pixels: out.buffer as ArrayBuffer,
    rect: meta.position ?? null,
    alphaGain: Number.isFinite(meta.alphaGain) ? (meta.alphaGain!) : null,
    engine: 'alpha-unblend',
    decisionTier: meta.decisionTier ?? null,
    residualVisible: meta.detection?.residualVisibility?.visible === true,
    touched: countChanged(original, out),
  };
}

parentPort?.on('message', (req: WatermarkStillRequest) => {
  let response: WatermarkStillResponse;
  try {
    response = handle(req);
  } catch (error) {
    response = {
      itemId: req.itemId,
      ok: false,
      rect: null,
      alphaGain: null,
      engine: null,
      decisionTier: null,
      residualVisible: false,
      touched: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  // The pixel buffer is transferred rather than copied — a 4K frame is 33 MB,
  // and structured-cloning that per item would dominate a batch.
  parentPort?.postMessage(response, response.pixels ? [response.pixels] : []);
});
