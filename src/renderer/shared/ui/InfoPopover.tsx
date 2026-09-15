import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDismissOnOutside } from './DropdownPanel';

export interface InfoPopoverProps {
  /** Accessible name for the trigger — what the help is *about*, e.g. "About the script box". */
  label: string;
  children: React.ReactNode;
  /** Which side of the trigger the panel opens toward. Defaults to `right`, which suits a trigger sitting at the left of a row. */
  align?: 'left' | 'right';
  /**
   * Beta S183 — `wide` (416px) for reference content rather than a paragraph.
   *
   * The Script box's help became a grammar plus the engine's thirteen inline
   * tags and what each one sounds like; at 288px that is a column of wrapped
   * two-word lines. Opt-in, so every existing hint keeps the narrow measure
   * that suits a sentence.
   */
  width?: 'default' | 'wide';
}

/** Kept beside the Tailwind classes below — the position math needs the real number. */
const PANEL_WIDTHS = { default: 288, wide: 416 } as const;

/** Breathing room from the viewport edge, and between the trigger and the panel. */
const MARGIN = 8;
const ANCHOR_GAP = 4;

/**
 * A small `!` trigger that reveals explanatory text on demand.
 *
 * Exists so guidance that only matters once — how a script is split into
 * prompts, which keys enqueue — does not occupy permanent vertical space above
 * an input the user looks at constantly. The text is still one click away and
 * still in the accessibility tree, rather than deleted.
 *
 * Click-toggled rather than hover-only: hover text is unreachable by touch and
 * by keyboard, and this content is a paragraph rather than a label.
 */
export function InfoPopover({
  label,
  children,
  align = 'right',
  width = 'default',
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, close, containerRef, panelRef);

  /**
   * Rendered into `document.body` at a measured position rather than absolutely
   * inside the trigger.
   *
   * The trigger sits in a scrolling card with `overflow-hidden` ancestors, and
   * an absolutely-positioned panel is clipped by those regardless of z-index —
   * the hint was being cut off mid-sentence at the card's edge. A portal is the
   * only way out of an ancestor's overflow.
   */
  /**
   * `top` or `bottom`, never both — a panel flipped above the trigger has to be
   * pinned by its *bottom* edge, since its height is not known until it renders.
   */
  const [anchor, setAnchor] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open || !containerRef.current) {
      setAnchor(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const panelWidth = PANEL_WIDTHS[width];
    // Clamped to the viewport so a trigger near the right edge does not push
    // the panel off-screen — the same clipping problem in a different place.
    const rawLeft = align === 'right' ? rect.left : rect.right - panelWidth;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - panelWidth - MARGIN));

    // Beta S183 — vertical fit, now that a panel can be reference-length.
    //
    // Below by default, flipped above only when above has materially more room,
    // and bounded either way so the panel scrolls its content instead of
    // running off the bottom of the window. Before this the panel was
    // unbounded and always below: the Script box's help opened near the middle
    // of a tall column and its last third was simply unreachable.
    const below = window.innerHeight - rect.bottom - ANCHOR_GAP - MARGIN;
    const above = rect.top - ANCHOR_GAP - MARGIN;
    const flip = above > below;
    setAnchor({
      ...(flip
        ? { bottom: window.innerHeight - rect.top + ANCHOR_GAP }
        : { top: rect.bottom + ANCHOR_GAP }),
      left,
      // A floor, so a trigger wedged against an edge still opens something
      // readable and scrollable rather than a sliver.
      maxHeight: Math.max(120, flip ? above : below),
    });
  }, [open, align, width]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-100 ease-out ${
          open ? 'bg-bg-selected text-text-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }`}
      >
        <span className="material-symbols-outlined text-base">info</span>
      </button>
      {open && anchor
        ? createPortal(
            <div
              role="note"
              ref={panelRef}
              style={{
                top: anchor.top,
                bottom: anchor.bottom,
                left: anchor.left,
                width: PANEL_WIDTHS[width],
                maxHeight: anchor.maxHeight,
              }}
              className="fixed z-50 overflow-y-auto overscroll-contain rounded-[var(--radius-button)] border border-hairline bg-bg-workspace p-3 text-xs leading-relaxed text-text-secondary shadow-lg"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
