import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, FocusEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Spinner } from './Spinner';

export type IconButtonTone = 'default' | 'primary' | 'danger';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * Material symbol ligature, e.g. `pause` — the form every call site uses.
   *
   * S177 — a node is also accepted, for the rare glyph the Material set does
   * not carry (the timeline's magnet is the first). A node renders verbatim,
   * so it opts out of the `filled` FILL-axis treatment and must carry its
   * own on/off signal; `currentColor` keeps it on the tone classes.
   */
  icon: ReactNode;
  /**
   * The button's accessible name AND its tooltip text. One prop for both on
   * purpose: an icon-only control whose tooltip and accessible name can drift
   * apart is a control that reads differently to a screen reader than to
   * everyone else.
   *
   * Keep it to a few words. It is a label, not documentation — a sentence here
   * produces a tooltip wider than the control it explains.
   */
  label: string;
  tone?: IconButtonTone;
  /**
   * A number shown against the icon — how many items the action would affect.
   * Omitted entirely when the count is not meaningful; `0` renders nothing,
   * since a disabled action does not need to shout zero.
   */
  count?: number;
  /**
   * Beta S247 — a short string in the same corner slot as `count`, for a
   * value that is not a number of items: `42%` while a batch runs. Takes
   * precedence over `count`, because when both could show, the thing that is
   * happening now beats the thing that could be started. Keep it to about
   * four characters — the slot is a badge, not a label.
   */
  badge?: string;
  /**
   * Renders the icon's filled variant (Material Symbols' `FILL 1` axis) for a
   * toggled-on state — e.g. a favorited item's heart. Default (`false`) is the
   * outline every other icon in the app always uses.
   */
  filled?: boolean;
  /**
   * Beta Step 70 — work in flight. Swaps the glyph for `Button`'s own spinner
   * and disables the control, exactly as `Button.loading` does.
   *
   * Added because that step turned the Story Builder's card and modal actions
   * into icon-only controls, and half of them — Render, Approve, Sync, every
   * AI assist — are the app's slowest operations. A `Button` that showed its
   * progress becoming an icon that doesn't would trade the tooltip for the
   * feedback, which is not the trade the owner asked for.
   */
  loading?: boolean;
  /**
   * Beta Step 70 — a filled background, for an icon that is the *primary*
   * action of the row it sits in (a card's Render, a takes panel's Approve).
   *
   * The three tones are foreground colours meant for a cluster of peers; a row
   * where everything is a peer has no primary, which is precisely the
   * information a labelled `Button` used to carry through its `variant`.
   */
  emphasis?: boolean;
  /**
   * Beta S157 — `sm` (24px) for dense chrome: a timeline track header is 36px
   * tall and holds four of these, which the 32px default cannot fit. The
   * default stays `md`; density is opted into, never inherited.
   */
  size?: 'sm' | 'md';
}

const TONE_CLASSES: Record<IconButtonTone, string> = {
  default: 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  primary: 'text-text-primary hover:bg-bg-selected',
  danger: 'text-accent-warning hover:bg-accent-warning/15',
};

/** `emphasis` overrides the tone's foreground entirely — a fill needs its own contrast pair. */
const EMPHASIS_CLASSES: Record<IconButtonTone, string> = {
  default: 'bg-bg-selected text-text-primary hover:bg-bg-hover',
  primary: 'bg-text-primary text-bg-app hover:opacity-90',
  danger: 'bg-accent-danger text-text-on-accent hover:opacity-90',
};

/** Breathing room from the viewport edge, and between the control and its tooltip. */
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

/**
 * An icon-only action with a real tooltip.
 *
 * The tooltip is rendered rather than left to the browser's `title`: the native
 * one waits about a second, cannot be styled, and never appears on keyboard
 * focus — which makes it the wrong mechanism for a row of controls whose entire
 * meaning is the icon. This one shows on hover *and* focus, immediately.
 *
 * The native `title` is deliberately NOT set alongside it. Setting both made
 * the browser's own tooltip appear over this one a second later — two tooltips
 * saying the same thing, one of them unstyled.
 *
 * ## Why the tooltip is a portal (Beta Step 70a)
 *
 * It used to be an absolutely-positioned sibling with `tooltipAlign` /
 * `tooltipSide` props for the caller to steer it away from whichever edge was
 * about to clip it. That could not work, and the owner's screenshots showed all
 * three ways it failed at once:
 *
 * - **A card root carries `overflow-hidden`** (it is what lets a full-bleed
 *   frame take the card's corners). No value of either prop escapes an
 *   ancestor's clip — the Story Builder's project card showed a tooltip sliced
 *   down its left edge, starting mid-word.
 * - **The viewport clips too**, and a prop set at the call site cannot know how
 *   much room the window has: the same header button is fine at 1900px and cut
 *   off at 1200px. Three stage headers lost the tail of every tooltip.
 * - Steering it by hand meant **every new call site had to get it right**, with
 *   a silently invisible tooltip as the cost of forgetting.
 *
 * Rendering into `document.body` at a fixed position, measured against the real
 * viewport, removes all three: it cannot be clipped by an ancestor, it is
 * clamped to stay on screen, and it flips above the control when there is no
 * room below. Both positioning props are gone — the position is derived, so
 * there is nothing left to pass.
 *
 * Shown on `:focus-visible`, not any focus: with plain focus a tooltip stayed
 * up after the button was clicked, so a row of them piled over each other.
 */
export function IconButton({
  icon,
  label,
  tone = 'default',
  count,
  badge,
  filled = false,
  loading = false,
  emphasis = false,
  size = 'md',
  className = '',
  disabled,
  onFocus,
  onBlur,
  ...rest
}: IconButtonProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  /** `null` until measured — the first paint would otherwise flash at the origin. */
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!anchor || !tooltip) return;

      // Below by default; above only when below would run off the bottom. The
      // control's own row is far more often near the window's foot (a card's
      // footer, a modal's action bar) than its head.
      const below = anchor.bottom + ANCHOR_GAP;
      const fitsBelow = below + tooltip.height + VIEWPORT_MARGIN <= window.innerHeight;
      const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - tooltip.height);

      // Centred on the control, then clamped into the viewport. `Math.max` last
      // so a tooltip wider than the window still starts on screen rather than
      // being pushed off the left edge by the right-hand clamp.
      const centred = anchor.left + anchor.width / 2 - tooltip.width / 2;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(centred, window.innerWidth - tooltip.width - VIEWPORT_MARGIN),
      );

      setPosition({ top, left });
    };

    place();

    // A scroll or resize invalidates the measurement, and re-measuring mid-
    // scroll would drag the tooltip around under the cursor. Dismissing is both
    // cheaper and what the user means: they have moved on.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, label, hide]);

  const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
    // `:focus-visible` only — a mouse click must not pin the tooltip open.
    if (event.target.matches(':focus-visible')) setOpen(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    hide();
    // Callers hang two-step delete confirmations off `onBlur`; theirs still runs.
    onBlur?.(event);
  };

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      // On the wrapper, not the button: a disabled button is out of hit-testing
      // (see `disabled:pointer-events-none` below), and "why can't I press this"
      // is the tooltip that matters most.
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={hide}
    >
      <button
        type="button"
        aria-label={label}
        disabled={Boolean(disabled) || loading}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // Chromium does not set `:hover` on a disabled form control or on its
        // ancestors while the pointer is over it, so without this the pointer
        // events above never fire for a disabled button.
        className={`flex ${size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-[var(--radius-button)] transition-colors duration-100 ease-out disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 ${
          emphasis ? EMPHASIS_CLASSES[tone] : `${TONE_CLASSES[tone]} disabled:hover:bg-transparent`
        } ${className}`}
        {...rest}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : typeof icon === 'string' ? (
          <span className={`material-symbols-outlined ${size === 'sm' ? 'text-base' : 'text-lg'}${filled ? ' material-symbols-outlined--filled' : ''}`}>
            {icon}
          </span>
        ) : (
          icon
        )}
      </button>
      {badge ?? (count !== undefined && count > 0 ? String(count) : null) ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-bg-selected px-1 text-center font-mono text-[10px] leading-4 text-text-primary"
        >
          {badge ?? count}
        </span>
      ) : null}
      {open
        ? createPortal(
            <span
              ref={tooltipRef}
              // `aria-hidden`: the button's `aria-label` is this same string, so
              // exposing it twice would have a screen reader say it twice.
              aria-hidden
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                // Hidden until measured, rather than `opacity: 0` — an
                // unmeasured tooltip must not be a transparent obstacle at the
                // top-left corner of the screen.
                visibility: position ? 'visible' : 'hidden',
              }}
              // `max-w` with normal wrapping rather than `whitespace-nowrap`:
              // clamping keeps a long label on screen, but only wrapping keeps
              // it *readable* instead of a single line spanning the window.
              className="pointer-events-none fixed z-[60] max-w-[min(18rem,calc(100vw-1rem))] rounded-[var(--radius-button)] border border-hairline bg-bg-workspace px-2 py-1 text-xs leading-snug text-text-primary shadow-lg"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
