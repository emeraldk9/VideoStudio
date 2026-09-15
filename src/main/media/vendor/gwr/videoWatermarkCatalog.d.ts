/**
 * Beta S235 — typings for the vendored Veo diamond catalogue.
 *
 * See `veoTextWatermarkTemplates.d.ts` for why these declarations exist rather
 * than relying on `allowJs` inference.
 */

export interface VideoWatermarkCandidate {
  id: string;
  label: string;
  /** The mark is square, so `size === width === height`. */
  size: number;
  marginRight: number;
  marginBottom: number;
  width: number;
  height: number;
  /** Resolved pixel origin for the frame this candidate was asked about. */
  x: number;
  y: number;
  /** Lower is tried first. The catalogue's own ranking, not ours. */
  sourcePriority: number;
  referenceSize: boolean;
  scaledFromReference: boolean;
  sourceCandidateId: string | null;
  sourceResolution?: string;
  sourceScale?: number;
  /**
   * `reference-exact` | `reference-projected` | `exact-size-exception`.
   *
   * The last one is why this catalogue is vendored rather than reimplemented:
   * 720p carries a 44px "compact" variant at margin 29/40 that is not 1080p's
   * 72px scaled by anything, so pure projection would miss it.
   */
  sourceFamily: string;
  /** `required` means this candidate needs pixel evidence before it is trusted. */
  evidenceGate: string;
  exactSizeVariant?: boolean;
  videoWidth: number;
  videoHeight: number;
}

export function isReferenceGeminiVideoSize(width: number, height: number): boolean;

/** Candidates for one frame size, best first. Empty when the catalogue has nothing. */
export function resolveVideoWatermarkCandidates(
  width: number,
  height: number,
): VideoWatermarkCandidate[];

export function getReferenceVideoWatermarkCatalog(): {
  referenceSize: { width: number; height: number };
  candidates: { id: string; label: string; size: number; marginRight: number; marginBottom: number }[];
};
