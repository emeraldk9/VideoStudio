import { useCallback } from 'react';

import {
  REGION_HANDLES,
  regionHandleStyle,
  useRegionDrag,
  type NormalizedRect,
} from '../../../shared/lib/useRegionDrag';

/**
 * How large a frame may draw in the dialog's canvas, shared by the picker and
 * by the plain before/after images beside it so all three are the same size.
 *
 * A viewport cap rather than `max-h-full`: these are replaced elements, so a
 * resolvable maximum is all they need to size themselves *and keep their own
 * aspect ratio*, whereas a percentage against an auto-height ancestor resolves
 * to `none` and lets a tall frame push the dialog past its own ceiling.
 */
export const FRAME_CLASSES = 'block max-h-[52vh] max-w-full';

interface RegionPickerProps {
  /** A `media://` URL for the frame the box is drawn over. */
  imageSrc: string;
  /** The frame's accessible name; the box is described separately. */
  alt?: string;
  /** The box, or `null` for none — a preset that has not been previewed yet. */
  rect: NormalizedRect | null;
  onChange: (rect: NormalizedRect) => void;
  /** Disables editing while a preview or batch is running. */
  disabled?: boolean;
  /**
   * Beta S495 — false shows the box without handles or dragging: a mark the
   * detector found, drawn where it found it, for the user to check rather
   * than move.
   */
  editable?: boolean;
}

/**
 * Beta S235 — drawing the watermark box over a real frame.
 *
 * The box is normalized rather than in pixels because a batch mixes
 * resolutions freely: the same drag has to mean the same *region* on a 720p
 * clip and a 4K still, and a pixel rect would mean neither.
 *
 * Editable only for the `manual` preset. Every catalogued mark has geometry
 * the main process finds on the item itself (Beta S495), and letting someone
 * hand-place a box the detector could place exactly would invite a worse
 * answer than the one available for free — but the box it found is drawn
 * here read-only, so a wrong detection is visible before a batch acts on it.
 *
 * ## Beta S494 — the container is the picture
 *
 * This element used to be a 16:9 box with the frame letterboxed inside it by
 * `object-contain`, which was a correctness bug and not only a layout one. The
 * rect is normalized against **this container** and resolved by the main
 * process against **the image**; those agreed only when the frame happened to
 * be 16:9. On a portrait clip — which this app exports — a box dragged onto
 * the mark resolved to a band of dead space beside it, and the clean removed
 * nothing.
 *
 * So the frame is now an ordinary block image that sizes itself, and this
 * container shrink-wraps it. Container and picture are the same rectangle by
 * construction, which is the only arrangement in which a normalized rect means
 * one thing. The empty state moved out to the canvas with it: `imageSrc` is
 * required now, because a picker with nothing to pick over is not a state this
 * component should have to describe.
 */
export function RegionPicker({
  imageSrc,
  alt = '',
  rect,
  onChange,
  disabled = false,
  editable = true,
}: RegionPickerProps) {
  const { containerRef, startDrag, dragging } = useRegionDrag({ onChange });
  const locked = disabled || !editable;

  const begin = useCallback(
    (event: React.PointerEvent, handle: Parameters<typeof startDrag>[2]) => {
      if (locked || !rect) return;
      startDrag(event, rect, handle);
    },
    [locked, rect, startDrag],
  );

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ cursor: dragging ? 'grabbing' : 'default' }}
    >
      <img src={imageSrc} alt={alt} className={FRAME_CLASSES} draggable={false} />

      {rect ? (
        <div
          role={editable ? 'button' : 'img'}
          tabIndex={locked ? -1 : 0}
          aria-label={
            editable ? 'Watermark region — drag to move, edges to resize' : 'Detected watermark region'
          }
          // The `--media-*` family, not the themed accents: this sits on a
          // picture rather than on a surface, and a themed outline disappears
          // into whichever frame happens to be under it. White edge, dark ring —
          // one of the two always reads, on a night exterior or a white wall.
          className="absolute border-2 border-media-text bg-media-text/10 ring-1 ring-media-ink/50"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
            cursor: locked ? (editable ? 'not-allowed' : 'default') : 'move',
          }}
          onPointerDown={(event) => begin(event, 'move')}
        >
          {locked
            ? null
            : REGION_HANDLES.map((handle) => (
                <span
                  key={handle}
                  // Presentational: the whole rect above is the single focusable,
                  // labelled control, so eight more tab stops would be noise for
                  // a keyboard user without giving them a way to resize anyway.
                  aria-hidden="true"
                  className="absolute rounded-[2px] bg-media-text ring-1 ring-media-ink/50"
                  style={regionHandleStyle(handle)}
                  onPointerDown={(event) => begin(event, handle)}
                />
              ))}
        </div>
      ) : null}
    </div>
  );
}
