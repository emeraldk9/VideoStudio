import { useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';

/**
 * Beta S121 — how a card frames the render inside it.
 *
 * A card that shows generated media has two separate problems, and conflating
 * them is what produced the defect this exists to fix:
 *
 * 1. **Never crop.** That is `object-contain`'s job at the call site, and it is
 *    an absolute — the frame below can be wrong (a take rendered before the
 *    project's ratio was last changed carries no record of its own dimensions),
 *    and `contain` still shows the whole picture.
 * 2. **Waste as little space as possible.** That is this module's job. Framing
 *    the box in the ratio the media was actually rendered at means the common
 *    case has no letterbox bars at all, instead of a portrait floating in a
 *    square between two bands of card colour.
 *
 * Before this, `EntityCard` framed square and painted `object-cover`: a 9:16
 * character reference lost ~22% off the top and ~22% off the bottom, which on a
 * board of full-body turnarounds is the head and the feet (owner-reported
 * 2026-08-11 with a screenshot — two of six characters were cropped at the
 * neck).
 */

/**
 * The tallest a frame may get, as a width/height ratio — 3:4.
 *
 * The cost of showing a portrait whole is vertical space, and it is not small:
 * at the boards' six-column breakpoint a card is about 230px wide, so an
 * uncapped 9:16 frame is ~409px tall where a square was 230px, and a 29-shot
 * board grows by nearly four fifths. 3:4 (~307px) still shows a standing figure
 * head to toe. A render taller than this keeps its full height inside the cap
 * and takes narrow side bars — the one place bars are accepted deliberately.
 */
export const TALLEST_FRAME_ASPECT = 3 / 4;

/**
 * `"16:9"` → `1.777…`. Tolerates `16/9` and a bare decimal, since the registry
 * states ratios one way and CSS another.
 *
 * `null` rather than a default when the value cannot be read: the caller knows
 * what its own fallback is, and silently substituting one here would hide a
 * ratio string that has drifted from what the registry offers.
 */
export function parseAspectRatio(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const trimmed = value.trim();

  const pair = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (pair) {
    const width = Number(pair[1]);
    const height = Number(pair[2]);
    if (width > 0 && height > 0) return width / height;
    return null;
  }

  const single = Number(trimmed);
  return Number.isFinite(single) && single > 0 ? single : null;
}

export interface MediaFrameOptions {
  /** Used when `ratio` cannot be parsed — the shape the card assumed before it knew better. */
  fallback: number;
  /** Override the 3:4 cap. Pass `0` for a frame that follows the media however tall it is. */
  tallest?: number;
}

/**
 * The inline style for a media frame.
 *
 * Inline rather than a Tailwind class, and this is load-bearing: `aspect-[9/16]`
 * only works when the JIT can see that exact string in the source, so a computed
 * class name emits no CSS whatsoever and the frame collapses to zero height —
 * a failure that looks like a missing image rather than a missing style.
 */
export function mediaFrameStyle(
  ratio: string | number | null | undefined,
  { fallback, tallest = TALLEST_FRAME_ASPECT }: MediaFrameOptions,
): CSSProperties {
  const parsed = parseAspectRatio(ratio) ?? fallback;
  // `max`, because these are width/height: the *smaller* number is the taller
  // box, so the cap is a floor on the ratio.
  return { aspectRatio: String(Math.max(parsed, tallest)) };
}

/**
 * The ratio of the picture that actually loaded, measured from the file.
 *
 * Added the moment the settings-derived frame met real data (owner screenshot,
 * 2026-08-11): a board whose stills are portrait resolved to a 16:9 frame,
 * because the resolved ratio describes what the app *would render now* and the
 * takes on screen were made under a different setting. Nothing is cropped —
 * `object-contain` saw to that — but each card spent more than half its width
 * on empty bars either side of the character.
 *
 * The file is the only witness to its own shape (`StoryTakeRef` stores no
 * dimensions), so the frame follows the image once the browser has it and uses
 * the resolved ratio until then. The settings value is still worth keeping as
 * the opener: it is right far more often than a square is, so the pre-load
 * frame is close and the snap on load is small.
 *
 * Reset on `source` so a card that swaps takes re-measures instead of keeping
 * the previous picture's shape.
 */
export function useNaturalAspectRatio(source: string | null | undefined): {
  ratio: number | null;
  /**
   * Beta S265 — the same measurement, undivided.
   *
   * The dimensions were always here and were being thrown away the moment the
   * ratio came out of them; the resolution pill needs them whole. Additive on
   * purpose — every existing caller reads `ratio` and is untouched.
   *
   * It describes **the file that was painted**, which on a card showing a
   * thumbnail is the thumbnail. That is the same file for every producer this
   * app has (poster frames are extracted at full size), with one exception the
   * callers must handle rather than this hook: S240 keeps the old thumbnail
   * when an upscale replaces a take, so an upgraded take measures as the file
   * it replaced.
   */
  size: { width: number; height: number } | null;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
} {
  /**
   * The measurement is stored *with* the file it came from, and the stale one
   * is discarded during render rather than cleared in an effect. An effect
   * would paint one frame of the previous picture's shape before correcting
   * itself — visible as a flicker when a card swaps takes — and is the pattern
   * `react-hooks/set-state-in-effect` exists to prevent.
   */
  const [measured, setMeasured] = useState<{
    source: string;
    width: number;
    height: number;
  } | null>(null);
  const current = measured && measured.source === source ? measured : null;

  return {
    ratio: current ? current.width / current.height : null,
    size: current ? { width: current.width, height: current.height } : null,
    onLoad: (event) => {
      const { naturalWidth, naturalHeight, currentSrc, src } = event.currentTarget;
      // A decoded image with no dimensions is a broken one; leaving the ratio
      // null keeps the frame the caller's fallback rather than dividing by zero.
      if (naturalWidth <= 0 || naturalHeight <= 0) return;
      setMeasured({
        // Keyed by what the caller passed, not by the element's resolved URL —
        // the browser absolutises `src`, so comparing against `currentSrc`
        // would never match `source` and the measurement would be discarded on
        // every render.
        source: source ?? currentSrc ?? src,
        width: naturalWidth,
        height: naturalHeight,
      });
    },
  };
}
