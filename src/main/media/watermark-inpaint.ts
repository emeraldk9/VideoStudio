import type { InferenceSession, Tensor as OrtTensor } from 'onnxruntime-node';

import type { PixelRect, WatermarkAccelerator } from '../../shared/types/watermark';
import { Logger } from '../logging/logger';

import { decodeFrameRgba, encodeFrameRgba } from './watermark-frame-io';
import type { InpaintModelStore } from './watermark-model-store';

const logger = Logger.createChildLogger('watermark-inpaint');

/**
 * Beta S235 Phase 4 — the LaMa fill engine (`WATERMARK_ENGINES` slot `lama`).
 *
 * ## Where it sits in the ladder
 *
 * *Below* the exact alpha unblend, *above* `delogo`. The unblend inverts the
 * blend and is exact wherever a template applies; this invents plausible
 * pixels and only earns its place where there is no template (`manual`) or the
 * unblend declined — a hand-drawn box over an arbitrary logo, which `delogo`
 * can only smear inward from the border. It is opt-in per Phase 4's gate: the
 * 208 MB model is downloaded on request, not shipped.
 *
 * ## Why a 512 window rather than the whole frame
 *
 * The model's input is a fixed 512x512 (Carve's `torch.onnx.export` of
 * big-lama). Resizing a 4K frame down to 512 to fill a 50px corner mark would
 * throw away almost all of the resolution the repair has to blend into; worse,
 * the fill would be computed at 1/8 scale and upsampled, which is visible.
 * Instead a 512 window is cropped *around* the mark (clamped to stay inside
 * the frame), the fill is computed at native scale inside that window, and
 * only the masked pixels are pasted back. The rest of the frame is untouched
 * byte-for-byte — the same "region-only" promise the other still engines make.
 *
 * ## Providers, and why the ladder falls back on *inference* rather than setup
 *
 * DirectML on Windows (which is how an NVIDIA card is driven there too),
 * CoreML on macOS, CPU everywhere as the floor.
 *
 * The obvious ladder — try each provider until one constructs a session — is
 * **wrong for this model**, which the Phase 4 spike found the hard way.
 * DirectML builds a LaMa session happily and then fails partway through the
 * first `run()`:
 *
 * > Non-zero status code returned while running MatMul node
 * > `/generator/model/model.5/conv1/ffc/convg2g/fu/rttn/MatMul_5` …
 * > The parameter is incorrect.
 *
 * That is LaMa's Fast Fourier Convolution — the part of the architecture that
 * makes it good at large masks — hitting an operator shape DirectML will not
 * take. A create-only ladder would therefore have picked DML on every Windows
 * GPU and failed every single fill. So a provider is only *proven* by a
 * successful inference: a run failure demotes it, the session is rebuilt on
 * the next provider down, and the frame is retried. The demotion is permanent
 * for the process, so the cost is paid once rather than per item.
 */

const MODEL_INPUT = 512;

/** The window edge, in pixels of *padding* the model is given around the mask on each side. */
const WINDOW_MARGIN = 24;

export interface InpaintResult {
  ok: boolean;
  accelerator: WatermarkAccelerator | null;
  error?: string;
}

interface Ort {
  InferenceSession: typeof InferenceSession;
  Tensor: typeof OrtTensor;
}

/** The EP ladder per platform. CUDA is Linux-only in onnxruntime-node and this app is Win/macOS. */
function providerLadder(): WatermarkAccelerator[] {
  if (process.platform === 'win32') return ['dml', 'cpu'];
  if (process.platform === 'darwin') return ['coreml', 'cpu'];
  return ['cpu'];
}

export class WatermarkInpainter {
  private ort: Ort | null = null;
  private ortLoadFailed = false;
  private session: InferenceSession | null = null;
  private accelerator: WatermarkAccelerator | null = null;
  private loading: Promise<void> | null = null;
  /** Providers still worth trying. A provider that fails an inference is dropped from the front. */
  private remaining: WatermarkAccelerator[] = providerLadder();

  constructor(
    private readonly ffmpegPath: () => string,
    private readonly models: InpaintModelStore,
  ) {}

  /** Which provider a session is on, once one exists. Null before the first clean. */
  currentAccelerator(): WatermarkAccelerator | null {
    return this.accelerator;
  }

  /**
   * True when the native runtime is present. False on a platform onnxruntime-
   * node has no binary for (e.g. Intel macOS), where the ladder simply never
   * offers this engine rather than crashing.
   */
  runtimeAvailable(): boolean {
    return this.loadOrt() !== null;
  }

  /**
   * Loads `onnxruntime-node` lazily, and only once. It is a 250 MB optional
   * dependency behind a `require` the bundler leaves external, so importing it
   * at module load would tax every startup for a feature most runs never use.
   */
  private loadOrt(): Ort | null {
    if (this.ort) return this.ort;
    if (this.ortLoadFailed) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.ort = require('onnxruntime-node') as Ort;
      return this.ort;
    } catch (error) {
      this.ortLoadFailed = true;
      logger.warn('onnxruntime-node is not available; the inpainting engine is disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Builds the session on the best provider that works, once. */
  private ensureSession(modelPath: string): Promise<void> {
    this.loading ??= this.buildSession(modelPath).catch((error) => {
      // A failed build must not be memoised as success; clear it so a later
      // call (e.g. after a driver fix) can try again.
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async buildSession(modelPath: string): Promise<void> {
    const ort = this.loadOrt();
    if (!ort) throw new Error('onnxruntime-node is not available on this platform');

    let lastError: unknown;
    while (this.remaining.length > 0) {
      const provider = this.remaining[0];
      try {
        this.session = await ort.InferenceSession.create(modelPath, {
          executionProviders: [provider],
          graphOptimizationLevel: 'all',
        });
        this.accelerator = provider;
        logger.info('inpainting session ready', { provider });
        return;
      } catch (error) {
        lastError = error;
        logger.warn('inpainting provider could not build a session, falling back', {
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
        this.remaining.shift();
      }
    }
    throw new Error(
      `no inpainting provider could be created: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /**
   * Drops the provider that just failed an inference and discards its session,
   * so the next attempt rebuilds one rung down. Returns false when the floor
   * has been reached and there is nothing left to demote to.
   */
  private demoteProvider(reason: string): boolean {
    const failed = this.remaining.shift();
    logger.warn('inpainting provider failed at inference, demoting it', { provider: failed, reason });
    this.session = null;
    this.accelerator = null;
    this.loading = null;
    return this.remaining.length > 0;
  }

  /**
   * Cleans one still by inpainting `rect`, writing `outputPath` only on success.
   *
   * `alphaMap` (when present, from a templated preset) selects *which* pixels
   * inside the rect are erased, feathered rim included; without one the whole
   * rect is erased, which is the manual-box case.
   */
  async clean(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    rect: PixelRect,
    alphaMap: Float32Array | null,
  ): Promise<InpaintResult> {
    const modelPath = await this.models.installedPath();
    if (!modelPath) {
      return { ok: false, accelerator: null, error: 'the inpainting model is not installed' };
    }
    const ort = this.loadOrt();
    if (!ort) {
      return { ok: false, accelerator: null, error: 'onnxruntime-node is not available' };
    }

    try {
      const pixels = Buffer.from(await decodeFrameRgba(this.ffmpegPath(), inputPath, width, height));
      const window = windowAround(rect, width, height);
      const { image, mask } = buildInputs(pixels, width, window, rect, alphaMap);

      // The decode is done once; only the inference is retried, and only for
      // as many rungs as the ladder has left.
      const filled = await this.infer(modelPath, ort, image, mask);

      pasteMaskedRegion(pixels, width, window, rect, alphaMap, filled);
      await encodeFrameRgba(this.ffmpegPath(), outputPath, pixels, width, height);
      return { ok: true, accelerator: this.accelerator };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('inpaint failed', { error: message });
      return { ok: false, accelerator: this.accelerator, error: message };
    }
  }

  /**
   * Runs the model, demoting a provider that fails mid-inference and retrying
   * on the next one down. See the class comment: DirectML builds a LaMa
   * session and then throws on its Fourier MatMul, so a provider is only
   * trustworthy once an inference has actually come back.
   */
  private async infer(
    modelPath: string,
    ort: Ort,
    image: Float32Array,
    mask: Float32Array,
  ): Promise<Float32Array> {
    for (;;) {
      await this.ensureSession(modelPath);
      const session = this.session;
      if (!session) throw new Error('inpainting session was not created');
      try {
        const output = await session.run({
          [session.inputNames[0]]: new ort.Tensor('float32', image, [1, 3, MODEL_INPUT, MODEL_INPUT]),
          [session.inputNames[1]]: new ort.Tensor('float32', mask, [1, 1, MODEL_INPUT, MODEL_INPUT]),
        } satisfies Record<string, OrtTensor>);
        return output[session.outputNames[0]].data as Float32Array;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.demoteProvider(message)) throw error;
      }
    }
  }
}

/** A 512-side square containing `rect` plus a margin, shifted to stay inside the frame. */
export function windowAround(rect: PixelRect, width: number, height: number): PixelRect {
  const side = MODEL_INPUT;
  // Centre the window on the rect, then clamp the origin so the whole 512
  // square stays in-frame. A frame smaller than 512 pins the origin at 0 and
  // the window simply covers all of it (the sampler handles the short axis).
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const maxX = Math.max(0, width - side);
  const maxY = Math.max(0, height - side);
  const x = Math.max(0, Math.min(maxX, Math.round(cx - side / 2)));
  const y = Math.max(0, Math.min(maxY, Math.round(cy - side / 2)));
  return { x, y, width: Math.min(side, width), height: Math.min(side, height) };
}

/** Where the mask covers, inside the 512 window, honouring the alpha template if any. */
function maskCoverage(
  window: PixelRect,
  rect: PixelRect,
  alphaMap: Float32Array | null,
): (wx: number, wy: number) => number {
  const marginX0 = rect.x - WINDOW_MARGIN;
  const marginY0 = rect.y - WINDOW_MARGIN;
  return (wx, wy) => {
    const px = window.x + wx;
    const py = window.y + wy;
    if (px < rect.x || px >= rect.x + rect.width || py < rect.y || py >= rect.y + rect.height) {
      // Outside the rect: erased only if it fell in the margin band a caller
      // asked for — but the current callers erase strictly the rect, so this
      // stays 0. Kept explicit so the intent is legible.
      void marginX0;
      void marginY0;
      return 0;
    }
    if (!alphaMap) return 1;
    const ax = px - rect.x;
    const ay = py - rect.y;
    // Any non-trivial alpha marks the pixel as watermarked; LaMa's mask is
    // binary, so the feathered rim is included rather than partially kept.
    return alphaMap[ay * rect.width + ax] > 0.02 ? 1 : 0;
  };
}

/** The model's two input planes, built from the window. Image is [0,1] CHW, mask is 1=erase. */
export function buildInputs(
  pixels: Buffer,
  frameWidth: number,
  window: PixelRect,
  rect: PixelRect,
  alphaMap: Float32Array | null,
): { image: Float32Array; mask: Float32Array } {
  const n = MODEL_INPUT * MODEL_INPUT;
  const image = new Float32Array(3 * n);
  const mask = new Float32Array(n);
  const covers = maskCoverage(window, rect, alphaMap);

  for (let wy = 0; wy < MODEL_INPUT; wy++) {
    for (let wx = 0; wx < MODEL_INPUT; wx++) {
      // Clamp-to-edge sampling for a window that runs past a frame smaller
      // than 512, so the border replicates rather than reading zeros.
      const sx = Math.min(window.width - 1, wx);
      const sy = Math.min(window.height - 1, wy);
      const src = ((window.y + sy) * frameWidth + (window.x + sx)) * 4;
      const dst = wy * MODEL_INPUT + wx;
      image[dst] = pixels[src] / 255;
      image[n + dst] = pixels[src + 1] / 255;
      image[2 * n + dst] = pixels[src + 2] / 255;
      mask[dst] = covers(wx, wy);
    }
  }
  return { image, mask };
}

/**
 * Writes the model's fill back over the masked pixels only.
 *
 * The output is already in [0,255] RGB (Carve's export bakes the ×255 in), so
 * it is clamped and rounded straight into the RGBA buffer. Alpha is left as it
 * was — the fill changes colour, not transparency.
 */
export function pasteMaskedRegion(
  pixels: Buffer,
  frameWidth: number,
  window: PixelRect,
  rect: PixelRect,
  alphaMap: Float32Array | null,
  filled: Float32Array,
): void {
  const n = MODEL_INPUT * MODEL_INPUT;
  const covers = maskCoverage(window, rect, alphaMap);
  for (let wy = 0; wy < Math.min(MODEL_INPUT, window.height); wy++) {
    for (let wx = 0; wx < Math.min(MODEL_INPUT, window.width); wx++) {
      if (covers(wx, wy) < 0.5) continue;
      const dst = ((window.y + wy) * frameWidth + (window.x + wx)) * 4;
      const s = wy * MODEL_INPUT + wx;
      pixels[dst] = clampByte(filled[s]);
      pixels[dst + 1] = clampByte(filled[n + s]);
      pixels[dst + 2] = clampByte(filled[2 * n + s]);
    }
  }
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
