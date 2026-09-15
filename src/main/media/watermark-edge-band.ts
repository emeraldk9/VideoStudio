import type { PixelRect } from '../../shared/types/watermark';

import type { RgbaFrame } from './watermark-unblend';

/**
 * Beta S495 — the cleanup after an exact removal: the glyph's edge.
 *
 * ## What is left after the blend is inverted, and why
 *
 * The unblend is exact for the blend. It is not exact for what the encoder
 * did to the blend afterwards. A translucent glyph is a sharp, high-contrast
 * edge, and H.264 (4:2:0, deblocking, quantisation) does not carry a sharp
 * edge faithfully: it leaves a one-pixel bright fringe just outside and a
 * dark one just inside. Inverting the blend removes the glyph and leaves the
 * fringe, which reads as a thin outline of the diamond — exactly the "blur
 * logo" the owner kept seeing on the water clip after the S495 detection
 * landed.
 *
 * Measured before this module existed, on the region's temporal mean (where
 * the background averages out and anything static remains): the residual
 * after the exact unblend was a double line along the glyph's outline and
 * nothing else. Three fixes that treat it as a *shape* error were tried and
 * rejected with numbers: blurring the template (worse at every sigma above
 * 0.5), registering it to sub-pixel shift and scale (best fit was zero shift,
 * unit scale), and measuring the alpha per clip from the temporal mean
 * (removed the line but flattened whatever background structure sat under
 * the glyph, which was the ghost the owner circled next). The fringe is not
 * the mark's shape; it is the codec's, and it is only ever where the edge is.
 *
 * ## What this does
 *
 * Every pixel in the edge band — where the template's alpha is in transition,
 * plus one pixel outward — is replaced by an inverse-distance average of its
 * non-band neighbours within three pixels. The band is two to three pixels
 * wide, so the interpolation spans a few pixels of already-correct picture on
 * each side: it is `delogo`'s idea confined to a thin ring, and on the two
 * real clips it took the residual from 3.71 to 2.85 and 2.17 to 1.76 (RMS of
 * the high-passed temporal mean) with the outline gone from the residual
 * image. The core of the glyph and everything outside the band are left
 * byte-for-byte as the unblend produced them.
 */

/** Normalised template alpha inside this open interval is "in transition". */
const BAND_LOW = 0.02;
const BAND_HIGH = 0.98;

/** How far outside the transition the band reaches, in pixels — the encoder's outer fringe. */
const BAND_DILATION = 1;

/** Neighbourhood radius the band is interpolated from. */
const FILL_RADIUS = 3;

/**
 * The band mask over `alphaMap`, row-major over the rect: 1 where the pixel
 * is to be interpolated. The template's *shape* decides it, so it is the same
 * for every frame of a clip and is computed once.
 */
export function edgeBandMask(alphaMap: Float32Array, width: number, height: number): Uint8Array {
  const n = width * height;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(alphaMap[i] ?? 0));
  let mask = new Uint8Array(n);
  if (peak <= 0) return mask;
  for (let i = 0; i < n; i++) {
    const t = Math.abs(alphaMap[i] ?? 0) / peak;
    mask[i] = t > BAND_LOW && t < BAND_HIGH ? 1 : 0;
  }
  for (let pass = 0; pass < BAND_DILATION; pass++) {
    const next = new Uint8Array(mask);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) continue;
        if (
          (x > 0 && mask[i - 1]) ||
          (x < width - 1 && mask[i + 1]) ||
          (y > 0 && mask[i - width]) ||
          (y < height - 1 && mask[i + width])
        ) {
          next[i] = 1;
        }
      }
    }
    mask = next;
  }
  return mask;
}

/**
 * Replaces every band pixel of `rect` in `frame` with the inverse-distance
 * average of its non-band neighbours, in place. Reads from a copy, so the
 * fill never feeds on itself. Pixels outside `rect` are neither read nor
 * written — the region-only promise the other engines make.
 */
export function fillEdgeBand(frame: RgbaFrame, rect: PixelRect, mask: Uint8Array): number {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const w = Math.min(frame.width - x0, Math.round(rect.width));
  const h = Math.min(frame.height - y0, Math.round(rect.height));
  if (w <= 0 || h <= 0 || mask.length < Math.round(rect.width) * Math.round(rect.height)) return 0;
  const stride = Math.round(rect.width);

  // The region as it was before any band pixel changed.
  const src = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y0 + row) * frame.width + x0) * 4;
    src.set(frame.data.subarray(from, from + w * 4), row * w * 4);
  }

  let filled = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!mask[row * stride + col]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let dy = -FILL_RADIUS; dy <= FILL_RADIUS; dy++) {
        const rr = row + dy;
        if (rr < 0 || rr >= h) continue;
        for (let dx = -FILL_RADIUS; dx <= FILL_RADIUS; dx++) {
          const cc = col + dx;
          if (cc < 0 || cc >= w || (dx === 0 && dy === 0)) continue;
          if (mask[rr * stride + cc]) continue;
          const k = 1 / (dx * dx + dy * dy);
          const j = (rr * w + cc) * 4;
          r += src[j] * k;
          g += src[j + 1] * k;
          b += src[j + 2] * k;
          weight += k;
        }
      }
      if (weight === 0) continue;
      const out = ((y0 + row) * frame.width + (x0 + col)) * 4;
      frame.data[out] = Math.round(r / weight);
      frame.data[out + 1] = Math.round(g / weight);
      frame.data[out + 2] = Math.round(b / weight);
      filled++;
    }
  }
  return filled;
}
