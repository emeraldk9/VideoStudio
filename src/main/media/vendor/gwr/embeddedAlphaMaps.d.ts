/**
 * Beta S235 — typings for the vendored Gemini/Veo alpha masks.
 *
 * See `veoTextWatermarkTemplates.d.ts` for why these declarations exist rather
 * than relying on `allowJs` inference.
 *
 * These are *captures*, not renders: the watermark composited over pure black,
 * read back so that each pixel's brightness is its alpha. That is also why the
 * removal applies a noise floor — the captures carry the source's own JPEG
 * quantization noise, which the division would otherwise amplify.
 */

/**
 * Known mask keys.
 *
 * The plain numbers are logo sizes in pixels. `'36-v2'` is the Gemini 3.5+ small
 * badge; `'96-20260520'` is a geometry revision; the two `outline-*` maps carry
 * **signed** values, where a negative entry marks a dark-polarity mark — the
 * same opacity over black rather than white.
 */
export type EmbeddedAlphaMapKey =
  | 48
  | 96
  | '36-v2'
  | '96-20260520'
  | '96-outline-light'
  | '96-outline-dark';

/**
 * `size * size` alpha values, row-major. `null` for a key this drop does not
 * carry, which a caller must treat as "no template" rather than as an error.
 *
 * Typed as the loose `number | string` the implementation really accepts rather
 * than as {@link EmbeddedAlphaMapKey}: callers pass a computed logo size, and
 * narrowing the parameter would force a cast at every call site while adding no
 * safety — an unknown key is already answered with `null` rather than a throw.
 * {@link EmbeddedAlphaMapKey} documents which keys actually resolve.
 */
export function getEmbeddedAlphaMap(size: number | string): Float32Array | null;
