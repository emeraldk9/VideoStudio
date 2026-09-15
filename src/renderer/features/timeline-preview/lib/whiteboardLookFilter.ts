import { buildCssFilter, type ClipEffects, type WhiteboardSettings } from '@shared';

/**
 * Beta S303 — board looks, in the preview.
 *
 * S295 shipped the looks as export-only and disclosed it, which is why the
 * Look control appeared to do nothing: selecting Sketch/Pencil/Comic changed a
 * value the preview never read. This renders them.
 *
 * **This is deliberately NOT the two-consumer pattern**, and the difference
 * matters. `whiteboardRevealAt` / `whiteboardZoneStateAt` / `whiteboardTraceMaskAlpha`
 * are one function read twice — the preview and the export cannot disagree
 * about reveal geometry because there is only one derivation. A look has no
 * such shared derivation available: the export is ffmpeg's canny/sobel/lut
 * chain, and the browser has no edge-detect primitive to compile that into.
 * The nearest honest thing is an SVG filter built from convolution kernels,
 * which lands in the same *family* as the export without being the same
 * operation. So these approximate, they do not mirror — and the ⓘ copy says
 * approximation rather than claiming parity. Do not "unify" this with
 * `lookFilter` in `whiteboard-segment.ts`; there is nothing to unify.
 *
 * Ordering matches the export: the look runs on the source, then the grade
 * (`post = [look, colorFilter]` in `buildWhiteboardFilterGraph`). CSS applies a
 * filter list left to right, so the `url()` reference goes first.
 */

/** The `<filter>` ids `WhiteboardLookDefs` mounts. `'none'` has no filter. */
export const WHITEBOARD_LOOK_FILTER_IDS: Record<
  Exclude<WhiteboardSettings['look'], 'none'>,
  string
> = {
  sketch: 'wb-look-sketch',
  pencil: 'wb-look-pencil',
  comic: 'wb-look-comic',
};

/** The CSS `filter` token for a look, or `''` for Original. */
export function whiteboardLookFilterRef(look: WhiteboardSettings['look']): string {
  if (look === 'none') return '';
  return `url(#${WHITEBOARD_LOOK_FILTER_IDS[look]})`;
}

/**
 * The whiteboard still's full CSS `filter`: the board look, then the clip's
 * grade — the export's order. `undefined` when neither applies, so the style
 * property is omitted rather than set to an empty string.
 */
export function whiteboardStillFilter(
  effects: ClipEffects | undefined,
  look: WhiteboardSettings['look'],
): string | undefined {
  const parts = [whiteboardLookFilterRef(look), buildCssFilter(effects)].filter(
    (part) => part.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}
