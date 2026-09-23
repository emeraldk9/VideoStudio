import { toThumbUrl, type FilmstripSheet, type SequenceSourceKind } from '@shared';

/**
 * Beta S154 — one tile in the media pool. The generalized form of the bin's
 * tile (Beta S151 G): every draggable tile in the pool — Library output,
 * picked file, storyboard shot — is this component, so the lanes' drop
 * targets see one payload shape from every source.
 *
 * An **unplaceable** tile (a storyboard shot with no approved take) renders
 * dimmed with its reason as a badge, and is not draggable — it exists to say
 * *why* it cannot be placed, which the old panel said only in an aggregate
 * "Skipped" list after the fact, and said nowhere at all before a fill was
 * attempted.
 *
 * Beta S200 — the tile no longer owns selection or the drag payload. It is
 * an `option` in the grid's `listbox`: the grid decides what a click with
 * modifiers means and what a drag carries (the tile, or the whole selection
 * in grid order), and hands the tile the resulting `selected` / handlers.
 * `role="checkbox"` (S180) was right for a removal tick-list and wrong for
 * "what I am about to drag"; `option` + `aria-selected` is the WAI-ARIA
 * pattern for a multi-select collection.
 */

const KIND_ICONS: Record<SequenceSourceKind, string> = {
  still: 'image',
  video: 'movie',
  audio: 'graphic_eq',
  text: 'title',
  effect: 'auto_fix_high',
  compound: 'auto_awesome_motion',
};

export interface MediaTileProps {
  label: string;
  kind: SequenceSourceKind;
  /** Absolute path the drop will reference. `null` makes the tile inert. */
  filePath: string | null;
  /** Poster to paint; audio and posterless videos get the kind's glyph. */
  posterPath?: string | null;
  /**
   * S183 — a video's **first frame**, taken from its S182 filmstrip sheet.
   *
   * A Library video already has a `thumbnailPath` from the download pipeline;
   * an imported one has no such file and nothing to make one from, so its tile
   * sat as the generic movie glyph — a grid of identical rectangles the user
   * could only tell apart by filename. The sheet's tile (0,0) *is* the first
   * frame, so this reuses the cache S182 already fills rather than extracting
   * a second poster per file.
   *
   * `posterPath` wins when both are present: a real poster file is one decode
   * of one image, against cropping a sheet that may be a hundred tiles wide.
   */
  posterSheet?: FilmstripSheet | null;
  /** Measured duration, carried so the drop writes a fact where one exists. */
  durationSeconds?: number;
  /** Short badge over the tile — "No approved take", "Stale". */
  badge?: string | null;
  /** Warning tone for the badge (stale) rather than the neutral scrim. */
  badgeTone?: 'neutral' | 'warning';
  /** Leading ordinal chip — the storyboard's cut order. */
  ordinal?: number;
  /** S157 — true when `durationSeconds` came from a probe, not an intent. */
  durationMeasured?: boolean;
  /** S157 — carried into the drag payload for re-sync identity. */
  storyShotId?: string;
  sourceTakeId?: string;
  /**
   * S180 — removal, offered only by the Imported source (a Library output is
   * removed from the Library, and a storyboard shot is not the pool's to
   * remove). Present means the tile grows a hover `×`; absent leaves the tile
   * exactly as it was.
   *
   * The verb throughout is **remove**, never delete: an import is a reference
   * to a file the app does not own, so this withdraws the reference and never
   * touches disk. A tile labelled "Delete" would promise otherwise.
   */
  onRemove?: () => void;
  /** Hover button to open watermark removal dialog for this file. */
  onCleanWatermark?: () => void;

  /* ── S200 — supplied by the grid, never by a pane ───────────────────── */

  /** Part of the pool selection. */
  selected?: boolean;
  /** The roving-tabindex tile — where the keyboard is. */
  focusable?: boolean;
  /** A click, with its modifiers; the grid decides exclusive / toggle / range. */
  onPointerSelect?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Space — the keyboard toggle. */
  onKeyToggle?: () => void;
  /** Drag begins; the grid builds the payload (this tile, or the selection). */
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  /** Hover `+` — add at the playhead on the kind's primary lane. Absent hides the button. */
  onAdd?: (() => void) | null;
}

function formatTileDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MediaTile({
  label,
  kind,
  filePath,
  posterPath = null,
  posterSheet = null,
  durationSeconds,
  badge = null,
  badgeTone = 'neutral',
  ordinal,
  onRemove,
  onCleanWatermark,
  selected = false,
  focusable = false,
  onPointerSelect,
  onKeyToggle,
  onDragStart,
  onAdd,
}: MediaTileProps) {
  // Beta S313 — a pool tile is an `aspect-video` box a few hundred pixels
  // wide; painting the full source here decoded 4-6 MB per tile.
  const posterUrl = posterPath ? toThumbUrl(posterPath) : null;
  const draggable = filePath !== null && onDragStart !== undefined;
  const selectable = onPointerSelect !== undefined;
  const name = badge ? `${label} — ${badge}` : label;

  return (
    <div
      role={selectable ? 'option' : 'img'}
      aria-selected={selectable ? selected : undefined}
      tabIndex={selectable ? (focusable ? 0 : -1) : undefined}
      aria-label={name}
      title={name}
      draggable={draggable}
      onClick={onPointerSelect}
      onKeyDown={
        selectable
          ? (event) => {
              // Space selects; Enter is left alone because the tile's primary
              // gesture is a drag, and nothing here should look like "open".
              // Arrows and Ctrl+A bubble to the grid.
              if (event.key !== ' ') return;
              event.preventDefault();
              onKeyToggle?.();
            }
          : undefined
      }
      className={[
        'group relative aspect-video overflow-hidden rounded-[var(--radius-button)] bg-bg-hover transition-colors duration-100',
        draggable ? 'cursor-grab hover:bg-bg-selected' : filePath === null ? 'opacity-50' : '',
        selected ? 'outline outline-2 -outline-offset-2 outline-accent-ai' : '',
      ].join(' ')}
      onDragStart={draggable ? onDragStart : undefined}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
        />
      ) : posterSheet ? (
        /*
          S183 — the first frame, cropped out of the S182 filmstrip sheet by
          CSS rather than by a second extraction.

          The sprite technique: scaling the background to `columns × rows`
          times the tile box makes each tile exactly one box wide, so origin
          `0% 0%` lands tile (0,0) — the first frame — filling the tile. No
          canvas, no decode of our own, and the browser shares one cached
          image across every tile that came from the same file.

          `background-size` is percentages, not pixels, so this stays correct
          at every card size the pool offers without recomputing anything.
        */
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("${posterSheet.url}")`,
            backgroundSize: `${posterSheet.columns * 100}% ${posterSheet.rows * 100}%`,
            backgroundPosition: '0% 0%',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-lg text-text-disabled"
        >
          {KIND_ICONS[kind]}
        </span>
      )}

      {ordinal !== undefined ? (
        <span
          className="pointer-events-none absolute left-1 top-1 rounded-[4px] px-1 font-mono text-[10px] leading-4 text-media-text"
          style={{ backgroundColor: 'var(--media-scrim)' }}
        >
          {ordinal}
        </span>
      ) : null}

      {badge ? (
        <span
          className={`pointer-events-none absolute right-1 top-1 rounded-[4px] px-1 text-[10px] leading-4 ${
            badgeTone === 'warning' ? 'text-accent-warning' : 'text-media-text'
          }`}
          style={{ backgroundColor: 'var(--media-scrim)' }}
        >
          {badge}
        </span>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-0.5 text-[10px] leading-4 text-media-text"
        style={{ backgroundColor: 'var(--media-scrim-soft)' }}
      >
        <span className="truncate font-medium">{label}</span>
        {durationSeconds !== undefined && durationSeconds > 0 ? (
          <span className="shrink-0 font-mono text-[9px] font-semibold text-media-text/90">
            {formatTileDuration(durationSeconds)}
          </span>
        ) : null}
      </div>

      {/* S200 — the hover controls: `+` adds at the playhead, `×` removes
          from the pool, and clean watermark opens the cleaner. Both stop the click from reaching the tile. */}
      {onAdd || onRemove || onCleanWatermark ? (
        <span className="absolute right-0.5 top-0.5 flex gap-0.5">
          {onCleanWatermark ? (
            <button
              type="button"
              aria-label={`Remove watermark from ${label}`}
              title="Remove watermark"
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-media-text opacity-0 transition-opacity duration-100 focus-visible:opacity-100 group-hover:opacity-100 hover:text-accent-ai"
              style={{ backgroundColor: 'var(--media-scrim)' }}
              onClick={(event) => {
                event.stopPropagation();
                onCleanWatermark();
              }}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                auto_fix_high
              </span>
            </button>
          ) : null}
          {onAdd ? (
            <button
              type="button"
              aria-label={`Add ${label} to the timeline at the playhead`}
              title="Add at the playhead"
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-media-text opacity-0 transition-opacity duration-100 focus-visible:opacity-100 group-hover:opacity-100"
              style={{ backgroundColor: 'var(--media-scrim)' }}
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">
                add
              </span>
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              // Named with the file, because a grid of `×` buttons is otherwise a
              // grid of identically-named controls to a screen reader.
              aria-label={`Remove ${label} from the project`}
              title="Remove from project — the file on disk is not deleted"
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-media-text opacity-0 transition-opacity duration-100 focus-visible:opacity-100 group-hover:opacity-100"
              style={{ backgroundColor: 'var(--media-scrim)' }}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">
                close
              </span>
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
