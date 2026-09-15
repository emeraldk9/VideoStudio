import type { PixelRect } from '../../shared/types/watermark';

/**
 * Beta S235 — reverse alpha blending, the exact removal.
 *
 * A watermark is composited onto the picture as
 *
 *     watermarked = alpha * logo + (1 - alpha) * original
 *
 * which, given the alpha mask that was used, solves exactly:
 *
 *     original = (watermarked - alpha * logo) / (1 - alpha)
 *
 * That is the whole algorithm. It **inverts** the blend rather than inventing
 * plausible pixels, which is why it outranks every fill engine wherever a
 * template exists: an inpaint is a guess that looks right, this is the actual
 * picture back. Phase 0 measured the recovery at a maximum error of 1-3 per
 * channel out of 255 — the residue of two uint8 truncations, nothing more.
 *
 * ## Why this is ours rather than imported
 *
 * The upstream project (MIT, see `vendor/gwr/`) has this same arithmetic in
 * `src/core/blendModes.js`, but its npm package does not export it: the
 * `exports` map exposes only the high-level search harness, and the raw
 * primitive is unreachable. It is ~30 lines, we hold a round-trip oracle test
 * for it, and the four constants below are load-bearing enough to deserve
 * being visible. The upstream constants are reproduced exactly; the derivation
 * and the credit are theirs.
 *
 * ## Why the primitive and the harness both exist
 *
 * Phase 0 (step file §2.4) measured the upstream *search harness* at 2.7-7.9 s
 * on real stills, degenerating to ~17 s on flat content where it cannot
 * discriminate candidates. This primitive is 53-380 us — 300x to 300,000x
 * cheaper — because it does no searching: it is told exactly where the mark is
 * and how strong. That is the right trade for **video**, where a per-frame
 * search is impossible (1440 frames x 3 s is 72 minutes) and the geometry is
 * fixed for the whole clip anyway. For **stills** the harness still runs, since
 * it calibrates a per-image `alphaGain` that genuinely varies (0.45-1.0 across
 * six real samples) and that a fixed gain gets visibly wrong.
 */

/** A raw RGBA frame. Structurally what `ImageData` is, without needing a DOM. */
export interface RgbaFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Alpha values below this are treated as zero.
 *
 * The alpha maps are *captures* — the watermark rendered over black and read
 * back — so they carry the source's JPEG quantization noise. Without this floor
 * that noise is amplified by the division and sprayed across the region as
 * faint blotches. Upstream's value, reproduced deliberately.
 */
const ALPHA_NOISE_FLOOR = 3 / 255;

/** Below this post-floor signal there is nothing to remove; skip the pixel untouched. */
const ALPHA_THRESHOLD = 0.002;

/**
 * The division's guard rail.
 *
 * At alpha = 1 the original pixel contributed nothing to the blend and is
 * unrecoverable — `(w - logo) / 0`. Clamping just below keeps the arithmetic
 * finite and degrades to "very nearly the logo colour" instead of `Infinity`.
 */
const MAX_ALPHA = 0.99;

/** Watermarks are white unless the alpha map says otherwise — see `logoValue` below. */
const LOGO_VALUE = 255;

export interface UnblendOptions {
  /**
   * Multiplies the mask's strength.
   *
   * Needed because the *same* mark is composited at different opacities
   * depending on the generator's output path. Phase 0 measured 0.45, 0.49,
   * 0.53, 0.55 and 1.0 across six real Flow stills, so this is not a tuning
   * knob to leave at its default — it is per-image, and getting it wrong shows
   * up as a visible halo (up to 111/255 in the region).
   */
  alphaGain?: number;
  /**
   * Overrides the logo colour. Normally inferred per pixel: a **negative** entry
   * in the alpha map marks a dark-polarity watermark, meaning the same opacity
   * mask over black rather than white.
   */
  logoValue?: number;
}

/**
 * Removes the watermark from `rect`, in place.
 *
 * `alphaMap` is `rect.width * rect.height` long and indexed row-major over the
 * rect — not over the frame. Pixels outside the rect are never read or written,
 * which is the property the "region-only" promise rests on and which the tests
 * assert byte-for-byte.
 *
 * Returns the number of pixels actually modified, so a caller can tell "there
 * was no watermark here" from "removed it" without a second scan.
 */
export function unblendRegion(
  frame: RgbaFrame,
  alphaMap: Float32Array | readonly number[],
  rect: PixelRect,
  options: UnblendOptions = {},
): number {
  const gain = Number.isFinite(options.alphaGain) && (options.alphaGain!) > 0
    ? (options.alphaGain!)
    : 1;
  const overrideLogo = Number.isFinite(options.logoValue) ? (options.logoValue!) : null;

  // Clamped here as well as by the caller: this function indexes a raw typed
  // array, where an out-of-range row silently reads its neighbour rather than
  // throwing, so a wrong rect would corrupt the picture quietly.
  const x0 = Math.max(0, Math.min(frame.width - 1, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(frame.height - 1, Math.round(rect.y)));
  const w = Math.max(0, Math.min(frame.width - x0, Math.round(rect.width)));
  const h = Math.max(0, Math.min(frame.height - y0, Math.round(rect.height)));
  if (w === 0 || h === 0) return 0;

  let touched = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const rawAlpha = alphaMap[row * Math.round(rect.width) + col] ?? 0;
      const magnitude = Math.abs(rawAlpha);

      const signal = Math.max(0, magnitude - ALPHA_NOISE_FLOOR) * gain;
      if (signal < ALPHA_THRESHOLD) continue;

      const logoValue = overrideLogo ?? (rawAlpha < 0 ? 0 : LOGO_VALUE);
      const alpha = Math.min(magnitude * gain, MAX_ALPHA);
      const oneMinusAlpha = 1 - alpha;

      const idx = ((y0 + row) * frame.width + (x0 + col)) * 4;
      for (let c = 0; c < 3; c++) {
        const watermarked = frame.data[idx + c];
        const original = (watermarked - alpha * logoValue) / oneMinusAlpha;
        // Uint8ClampedArray clamps on assignment, but rounding explicitly keeps
        // the result identical to the reference implementation rather than
        // relying on the platform's rounding of the implicit conversion.
        frame.data[idx + c] = Math.round(Math.max(0, Math.min(255, original)));
      }
      touched++;
    }
  }
  return touched;
}

/**
 * The forward operation: composites a watermark *on*.
 *
 * This exists only for tests, and it is the single most valuable thing taken
 * from the C++ upstream (`watermark_engine.cpp:288`), which the JavaScript port
 * dropped. It gives the removal a **ground truth** no real-world sample can:
 * take a clean picture, apply a known mask, remove it, and the result must come
 * back to the original within uint8 truncation. Without it the only available
 * check is "does the output look better", which cannot catch an alpha map that
 * is subtly wrong.
 */
export function blendRegion(
  frame: RgbaFrame,
  alphaMap: Float32Array | readonly number[],
  rect: PixelRect,
  logoValue = LOGO_VALUE,
): void {
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const alpha = Math.abs(alphaMap[row * w + col] ?? 0);
      if (!(alpha > 0)) continue;
      const px = Math.round(rect.x) + col;
      const py = Math.round(rect.y) + row;
      if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) continue;
      const idx = (py * frame.width + px) * 4;
      for (let c = 0; c < 3; c++) {
        frame.data[idx + c] = Math.round(alpha * logoValue + (1 - alpha) * frame.data[idx + c]);
      }
    }
  }
}
