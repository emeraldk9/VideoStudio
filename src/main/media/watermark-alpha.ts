import type { PixelRect, WatermarkPresetId } from '../../shared/types/watermark';

import { getEmbeddedAlphaMap } from './vendor/gwr/embeddedAlphaMaps.js';
import { getVeoTextTemplateAlphaMap } from './vendor/gwr/veoTextWatermarkTemplates.js';

/**
 * Beta S235 — which mask inverts which mark.
 *
 * A mask is only meaningful at the size it was captured, so anything that is
 * not a captured size has to be resampled. The one preset with **no** mask is
 * `manual`: a hand-drawn box has no template by definition, which is precisely
 * why it cannot use the exact engine and must be filled instead. That is a
 * property of the situation, not a gap to be patched — inventing a mask for an
 * unknown mark would produce a confident, wrong subtraction.
 */

/** The size every square mask is captured at. */
const REFERENCE_SIZE = 96;

/**
 * Area-average resample of a square mask.
 *
 * Written here rather than vendored: upstream's equivalent lives inside a
 * 1,597-line detector module that pulls in most of its core, and this is twenty
 * lines of arithmetic we can test directly.
 *
 * Area averaging rather than bilinear sampling, deliberately. A mask is a
 * *coverage* field, and downscaling it by point-sampling drops whole thin
 * strokes — the Veo glyph has several — which would leave those strokes
 * un-subtracted while their neighbours were cleaned. Averaging over the source
 * footprint preserves total coverage, so a stroke that becomes narrower than a
 * pixel survives as a fainter one instead of disappearing.
 */
export function resizeAlphaSquare(
  source: Float32Array,
  sourceSize: number,
  targetSize: number,
): Float32Array {
  const target = Math.max(0, Math.round(targetSize));
  if (target === 0) return new Float32Array(0);
  if (sourceSize === target) return new Float32Array(source);

  const out = new Float32Array(target * target);
  const scale = sourceSize / target;

  for (let y = 0; y < target; y++) {
    const yStart = y * scale;
    const yEnd = (y + 1) * scale;
    const y0 = Math.floor(yStart);
    const y1 = Math.min(sourceSize, Math.ceil(yEnd));

    for (let x = 0; x < target; x++) {
      const xStart = x * scale;
      const xEnd = (x + 1) * scale;
      const x0 = Math.floor(xStart);
      const x1 = Math.min(sourceSize, Math.ceil(xEnd));

      let sum = 0;
      let weight = 0;
      for (let sy = y0; sy < y1; sy++) {
        // How much of this source row falls inside the target pixel.
        const wy = Math.min(yEnd, sy + 1) - Math.max(yStart, sy);
        if (wy <= 0) continue;
        for (let sx = x0; sx < x1; sx++) {
          const wx = Math.min(xEnd, sx + 1) - Math.max(xStart, sx);
          if (wx <= 0) continue;
          sum += source[sy * sourceSize + sx] * wy * wx;
          weight += wy * wx;
        }
      }
      out[y * target + x] = weight > 0 ? sum / weight : 0;
    }
  }
  return out;
}

/**
 * The mask for one preset at one resolved rect, or `null` when there is none.
 *
 * `null` is a real answer and the caller must honour it by falling back to a
 * fill engine — never by substituting a different mask. Subtracting the wrong
 * glyph is worse than filling: a fill is a visible approximation, whereas a
 * wrong subtraction is a confident smear that looks like the tool working.
 */
export function alphaMapFor(presetId: WatermarkPresetId, rect: PixelRect): Float32Array | null {
  switch (presetId) {
    case 'veo-text-23x10':
    case 'veo-text-68x30':
    case 'veo-text-99x43':
      // The text marks are captured at their exact size and are not square, so
      // they are never resampled.
      return getVeoTextTemplateAlphaMap(presetId);

    case 'veo-diamond-auto':
    case 'gemini-auto': {
      // Both are the same square glyph; the catalogue only changes where it
      // sits and how big it is. `getEmbeddedAlphaMap` has exact captures at 48
      // and 96 and nothing in between, so anything else is projected from 96.
      const size = Math.round(rect.width);
      const exact = getEmbeddedAlphaMap(size);
      if (exact?.length === size * size) return exact;
      const base = getEmbeddedAlphaMap(REFERENCE_SIZE);
      return base ? resizeAlphaSquare(base, REFERENCE_SIZE, size) : null;
    }

    case 'manual':
    default:
      return null;
  }
}
