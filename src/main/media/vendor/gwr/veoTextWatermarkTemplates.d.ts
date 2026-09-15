/**
 * Beta S235 — typings for the vendored Veo text templates.
 *
 * The `.js` beside this file is upstream code and must not be edited (see
 * `README.md`); declaring its shape here is the supported way to give it real
 * types. Without this, `allowJs` infers `any` throughout and every call site
 * spends `@typescript-eslint/no-unsafe-*` errors against the repo's
 * zero-warning bar.
 *
 * Only the surface this feature actually uses is declared. Adding an export
 * here is a deliberate act — it means we now depend on one more piece of
 * upstream, which the next resync has to keep working.
 *
 * Beta S495 — `VeoTextWatermarkTemplate` is **flat**: the metadata fields sit
 * beside `alphaMap` and `detectorMap` on one object, which is what
 * `getVeoTextWatermarkTemplate` actually returns and what the detector reads
 * (`template.width`, `template.detectorMap`). The earlier declaration nested
 * them under `metadata`, which no upstream function produces.
 */

export type VeoTextTemplateId = 'veo-text-23x10' | 'veo-text-68x30' | 'veo-text-99x43';

export interface VeoTextTemplateMetadata {
  id: VeoTextTemplateId;
  width: number;
  height: number;
  /** Absolute pixels from the right edge — **not** scaled to the frame. */
  marginRight: number;
  /** Absolute pixels from the bottom edge — **not** scaled to the frame. */
  marginBottom: number;
  /** Below this normalized cross-correlation the mark is considered absent. */
  minNcc: number;
  observedSeedScale?: number;
  allenkObservedRegion?: { x: number; y: number; width: number; height: number };
  cleanup?: {
    allenkObservedFdncnnSigma?: number;
    runtimeFdncnnSigma?: number;
    allenkFdncnnPadding?: number;
  };
}

export interface VeoTextWatermarkTemplate extends VeoTextTemplateMetadata {
  /** `width * height` alpha values, row-major, already multiplied by any `alphaGain` asked for. */
  alphaMap: Float32Array;
  /** The map the NCC scorer correlates against; may differ from `alphaMap` in its rim. */
  detectorMap: Float32Array | null;
}

export const VEO_TEXT_TEMPLATE_IDS: readonly VeoTextTemplateId[];

/** Returns `null` for an id this drop does not carry. */
export function getVeoTextTemplateMetadata(id: string): VeoTextTemplateMetadata;

/** `width * height` alpha values, row-major over the template. `null` if unknown. */
export function getVeoTextTemplateAlphaMap(
  id: string,
  options?: { alphaGain?: number },
): Float32Array | null;

export function getVeoTextTemplateDetectorMap(id: string): Float32Array | null;

export function getVeoTextWatermarkTemplate(
  id: string,
  options?: { alphaGain?: number },
): VeoTextWatermarkTemplate | null;

export function getVeoTextWatermarkTemplates(options?: {
  alphaGain?: number;
}): VeoTextWatermarkTemplate[];
