import { useState } from 'react';

import { toMediaUrl } from '@shared';

import { Badge } from '../../shared/ui/Badge';

/**
 * What a reference thumbnail is a picture *of*, for the corner glyph and the
 * border tint.
 *
 * Beta Step 64 — the three story kinds, not just "is this a character".
 * `undefined` is the fourth case and stays unmarked: a start frame, an end
 * frame, a source image — the Studio's own attachments, which are references
 * without being anything on a board.
 */
export type ReferenceKind = 'character' | 'location' | 'prop';

/**
 * The corner glyph per kind, and what it reads as.
 *
 * Labelled rather than `aria-hidden`: "this one is the location" is the
 * information the glyph exists to add, so it should reach a screen reader too,
 * not only a sighted glance.
 *
 * Exported because `ShotReferenceChips` draws the same three kinds at the same
 * size from its own markup (it needs an initial-letter fallback this component
 * deliberately does not have), and two copies of this map is exactly how the
 * Storyboard and the Breakdown ended up marking the same reference differently.
 */
export const REFERENCE_KIND_MARKER: Record<ReferenceKind, { icon: string; label: string }> = {
  character: { icon: 'person', label: 'Character' },
  location: { icon: 'place', label: 'Location' },
  prop: { icon: 'category', label: 'Prop' },
};

/** Kind colour as a border tint — enough to tell three 24px tiles apart beside the glyph. */
export const REFERENCE_KIND_BORDER: Record<ReferenceKind, string> = {
  character: 'border-accent-ai/50',
  location: 'border-accent-info/50',
  prop: 'border-accent-warning/50',
};

export interface RefThumbProps {
  label: string;
  imagePath?: string | null;
  /**
   * A `blob:` URL for an image still held in page memory — what the dropzone
   * already renders its own previews from. Preferred over the path whenever it
   * exists, since it needs no protocol handler and no filesystem permission.
   * Only ever available pre-submission; a submitted job has nothing but its
   * path.
   */
  previewUrl?: string;
  color?: string;
  /** `sm` (default, 24px) matches every other usage; `lg` (48px) is `VideoLightboxModal`'s detail view, where a chip-sized thumbnail reads as too small to actually identify. */
  size?: 'sm' | 'lg';
  /**
   * Renders the name under the thumbnail instead of only as its tooltip.
   *
   * Off by default: in the dense pre-submission chip rows a caption under every
   * thumbnail is noise. On in the lightbox's References list, where the whole
   * question being asked is "which characters is this?" — and a tooltip cannot
   * answer that without hovering each one in turn (owner request 2026-07-29).
   */
  showLabel?: boolean;
  /**
   * Marks this thumbnail with its kind's glyph in the bottom-left corner and
   * tints its border to match (owner request 2026-07-29, widened 2026-08-02).
   *
   * A reference row mixes kinds — a character sits next to a location, a prop,
   * and in the Studio next to "Start frame", "End frame" and "Source image", all
   * as identically-shaped thumbnails. The only thing telling them apart was the
   * caption, or in the dense rows a tooltip you had to hover one at a time. The
   * glyph answers "which of these is which?" at a glance without spending the
   * space a second caption line would.
   *
   * It was `isCharacter?: boolean` until Beta Step 64, which is why the
   * Breakdown's shot rows marked characters and left locations and props bare
   * while the Storyboard and Handoff cards beside them marked all three
   * (owner-reported 2026-08-02). Omit for a reference that is not one of the
   * three story kinds — it renders unmarked, exactly as `isCharacter={false}`
   * did.
   */
  refKind?: ReferenceKind;
  /**
   * Every image this reference could be drawn with, best first — see
   * `worldAssetThumbCandidates`. Each is tried in turn and a failing one falls
   * through to the next, so a `flow`-origin character (no `imagePath` at all,
   * only Flow's own thumbnail) still renders as a picture.
   *
   * Takes precedence over `imagePath`, which stays for the callers that hold a
   * single path and nothing else. `previewUrl` still wins over both.
   */
  sources?: string[];
}

const IMAGE_SIZE_CLASSES: Record<'sm' | 'lg', string> = {
  sm: 'h-6 w-6',
  lg: 'h-12 w-12',
};

const CHIP_SIZE_CLASSES: Record<'sm' | 'lg', string> = {
  sm: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

/**
 * A reference shown as what it actually is — the picture — with the name as its
 * tooltip rather than its body.
 *
 * Falls back to a labelled chip whenever there is no path or the image fails to
 * load. That is not a rare edge: `media://` is scoped to `userData/projects`, so
 * a reference the user picked from anywhere else on disk cannot be rendered by
 * the sandboxed renderer at all. Degrading to the old chip keeps those cards
 * readable instead of showing a row of broken-image icons.
 *
 * Shared between `ParsedPromptCard` (pre-submission) and `VideoLightboxModal`
 * (submitted) — both show the same kind of reference chip, just from
 * different data (in-memory dropzone state vs. a persisted `JobRecord`).
 */
export function RefThumb({
  label,
  imagePath,
  previewUrl,
  color,
  size = 'sm',
  showLabel = false,
  refKind,
  sources,
}: RefThumbProps) {
  /**
   * Sources that have already failed to load, so the thumbnail advances down
   * the ladder instead of stopping at the first dead one.
   *
   * Keyed by URL rather than by index, which is what makes it self-healing with
   * no reset logic: when the record's images change, the new URLs are simply
   * not in the set, so every thumbnail gets a fresh attempt without an effect
   * that would paint a stale failure for one frame first. Same shape as
   * `WorldAssetCard`'s, which hit this first.
   */
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const candidates = [previewUrl, ...(sources ?? [toMediaUrl(imagePath)])].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const src = candidates.find((candidate) => !failedSources.has(candidate));

  if (!src) {
    // The chip fallback already carries the name in its body, so `showLabel`
    // needs no separate branch here — it would print the name twice.
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${CHIP_SIZE_CLASSES[size]}`}
        style={
          color
            ? { backgroundColor: `${color}26`, color, border: `1px solid ${color}66` }
            : undefined
        }
        title={label}
      >
        {color ? label : <Badge tone="info" label={label} />}
      </span>
    );
  }

  const marker = refKind ? REFERENCE_KIND_MARKER[refKind] : undefined;

  const picture = (
    <img
      // Keyed by the source so a fall-through mounts a fresh <img>. Swapping
      // `src` on the existing element can leave the browser's broken-image
      // state painted until the next load settles.
      key={src}
      src={src}
      alt={label}
      title={label}
      onError={() => setFailedSources((previous) => new Set(previous).add(src))}
      // An explicit `color` still wins the border: it is the caller stating a
      // reference's own colour, which is more specific than its kind.
      className={`shrink-0 rounded-[var(--radius-button)] border object-cover ${IMAGE_SIZE_CLASSES[size]} ${
        !color && refKind ? REFERENCE_KIND_BORDER[refKind] : ''
      }`}
      style={color ? { borderColor: `${color}66` } : refKind ? undefined : { borderColor: 'var(--hairline)' }}
    />
  );

  // Wrapped only when there is a marker to position — an unwrapped <img> is
  // what every existing caller lays out in its flex row, and adding a span
  // around all of them would change spacing for rows that gained nothing.
  const image = marker ? (
    <span className={`relative inline-flex shrink-0 ${IMAGE_SIZE_CLASSES[size]}`}>
      {picture}
      {/* Labelled rather than aria-hidden — see `REFERENCE_KIND_MARKER`. */}
      <span
        role="img"
        aria-label={marker.label}
        className="material-symbols-outlined pointer-events-none absolute bottom-px left-px rounded-[3px] bg-media-scrim leading-none text-media-text"
        // Inline, not a `text-[10px]` utility. `.material-symbols-outlined`
        // (tokens/fonts.css) sets `font-size: var(--icon-size-md)` and is
        // UNLAYERED, while Tailwind's utilities sit in its `utilities` layer —
        // unlayered CSS wins over layered CSS whatever the specificity, so a
        // size class here is silently inert and the glyph rendered at 20px
        // inside a 24px thumbnail, covering the picture it was annotating.
        style={{ fontSize: size === 'lg' ? '13px' : '10px' }}
      >
        {marker.icon}
      </span>
    </span>
  ) : (
    picture
  );

  if (!showLabel) {
    return image;
  }

  return (
    <figure className="flex w-14 shrink-0 flex-col items-center gap-1">
      {image}
      {/* `break-words` rather than truncation: a character's name is the point
          of showing it, and an elided one answers nothing. The title stays for
          the full string when it does wrap awkwardly. */}
      <figcaption
        title={label}
        className="w-full break-words text-center text-[10px] leading-tight text-text-secondary"
        style={color ? { color } : undefined}
      >
        {label}
      </figcaption>
    </figure>
  );
}
