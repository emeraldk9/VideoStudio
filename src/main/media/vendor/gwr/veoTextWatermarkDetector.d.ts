/**
 * Beta S235 — typings for the vendored Veo text detector.
 *
 * See `veoTextWatermarkTemplates.d.ts` for why these declarations exist.
 *
 * Beta S495 corrected two claims the original declaration made that the
 * `.js` beside it does not honour: `scoreVeoTextTemplateAt` returns an
 * `{ ncc, confidence }` pair, not a number, and the template it takes is the
 * flat object `getVeoTextWatermarkTemplate` returns (see the templates file).
 * Both were harmless while nothing called the function; S495 is the first
 * caller. `computeRectangularSpatialCorrelation` is declared too, because it
 * is the same normalized cross-correlation and scores the diamond's alpha
 * map as readily as the wordmark's detector map.
 */

import type { VeoTextWatermarkTemplate } from './veoTextWatermarkTemplates';

/** Structurally `ImageData`, without requiring the DOM lib. */
export interface RgbaImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface TemplateScore {
  /** Normalized cross-correlation in -1..1. */
  ncc: number;
  /** `max(0, ncc)`. */
  confidence: number;
}

/**
 * Normalized cross-correlation of `alphaMap` against the luma of `image`
 * inside `region`, over the map's active pixels only (|alpha| above
 * `activeThreshold`, default 0.02). Returns 0 for a region that does not fit.
 */
export function computeRectangularSpatialCorrelation(args: {
  imageData: RgbaImageLike;
  alphaMap: Float32Array | ArrayLike<number>;
  region: { x: number; y: number; width: number; height: number };
  activeThreshold?: number;
}): number;

/**
 * Scores `template.detectorMap` at (`x`, `y`).
 *
 * Compare `ncc` against the template's own `minNcc` rather than a shared
 * constant — the thresholds differ per mark.
 */
export function scoreVeoTextTemplateAt(
  image: RgbaImageLike,
  template: VeoTextWatermarkTemplate,
  x: number,
  y: number,
): TemplateScore;

export interface VeoTextSearchCandidate {
  /** `<templateId>:<x>:<y>`. */
  id: string;
  watermarkKind: 'veo-text';
  template: VeoTextWatermarkTemplate;
  x: number;
  y: number;
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
}

/**
 * Every position each template could sit at on a `width`x`height` frame: the
 * template's own margins plus a search radius around them (default
 * `max(4, round(min(w, h) * 0.35))` px per axis).
 */
export function resolveVeoTextSearchCandidates(args: {
  width: number;
  height: number;
  templates?: VeoTextWatermarkTemplate[];
  marginRadiusX?: number | null;
  marginRadiusY?: number | null;
}): VeoTextSearchCandidate[];
