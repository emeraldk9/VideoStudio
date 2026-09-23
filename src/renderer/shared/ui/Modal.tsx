import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  /** Usually a string. Accepts any node so a caller can put supplementary content (e.g. status chips) inline with the title — `PresetPickerModal` is the first to use this. */
  title: ReactNode;
  children: ReactNode;
  /** Blocks Escape/backdrop dismissal — used for the non-dismissible session re-auth overlay. */
  dismissible?: boolean;
  /** Custom overlay CSS classes (e.g. left-14 to offset backdrop from vertical NavRail). */
  overlayClassName?: string;
  /** Custom CSS classes for the inner dialog panel (e.g. override max-w or padding). */
  className?: string;
  /**
   * Dialog panel size:
   * - `'sm'` (`max-w-[420px]`): For confirmations and short prompt alerts.
   * - `'md'` (`max-w-[540px]`): Standard HUD, gain/speed retiming, marker editing.
   * - `'lg'` (`max-w-[720px]`): Multi-column layouts, project selector, shortcuts.
   * - `'xl'` (`max-w-[920px]`): Preferences, JSON code editor, timeline setup.
   * - `'2xl'` (`max-w-[1140px]`): Heavy multi-column dashboards (Export sequence).
   * - `'media'` (`max-w-[1180px] h-[85vh]`): Full canvas media editing.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'media';
  /**
   * Beta Step 72 — hands the body's scrolling to the caller.
   *
   * The default is right for a form: one scroll container holding everything.
   * A dialog with a tab bar needs the opposite, because the tabs are the one
   * thing that must not scroll away — `ShotModal` keeps them pinned and scrolls
   * only the panel below. Setting this leaves the body a plain
   * `min-h-0 flex-1`, so a caller that never grows past `max-h` still shows no
   * scrollbar at all.
   */
  bodyScroll?: boolean;
  /**
   * Beta S508 — one line of meta under the title (`141 shots · checked 08:47`).
   *
   * A report dialog used to put its status into the body as a sentence that
   * did four jobs at once; the title row is where a reader looks for "what is
   * this and how fresh is it", and the body is left for the findings.
   */
  subtitle?: ReactNode;
  /**
   * Beta S508 — actions that act on the whole dialog (Copy report, Re-run),
   * placed left of Close. Row-level actions stay in the body.
   */
  headerActions?: ReactNode;
}

/**
 * Width, and — for `media` only — height.
 *
 * The other two are content-sized under a `max-h-[85vh]` ceiling, which is
 * right for a form: it is as tall as it needs to be and scrolls past that.
 * A player is the opposite case. Its frame wants *whatever height is going*,
 * and under a `max-h` it gets only what its own aspect ratio asks for — so the
 * animatic sat in the middle of a 4xl dialog as a 470px strip with the
 * remaining vertical space given to the backdrop, and on a short window the
 * controls under it scrolled out of reach (Beta Step 70). `h-[85vh]` makes the
 * height a number the panel can divide, which is what lets the frame flex.
 */
const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-[420px] max-h-[85vh]',
  md: 'max-w-[540px] max-h-[85vh]',
  lg: 'max-w-[720px] max-h-[85vh]',
  xl: 'max-w-[920px] max-h-[85vh]',
  '2xl': 'max-w-[1140px] max-h-[85vh]',
  media: 'max-w-[1180px] h-[85vh]',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  overlayClassName = '',
  className = '',
  size = 'md',
  bodyScroll = true,
  subtitle,
  headerActions,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  /**
   * Latest callback/flag, read by the keydown handler without being effect
   * dependencies.
   *
   * This is the whole point of the split below. The focus effect used to depend
   * on `onClose`, and every caller passes an inline arrow — so a parent
   * re-render produced a new function identity, tore the effect down (running
   * its cleanup, which restores focus to whatever was focused before the modal
   * opened) and immediately re-ran it (focusing the dialog container). Typing
   * one character into any field inside a modal re-rendered the parent and
   * therefore stole focus mid-keystroke: the reported "lose focus after typing
   * a single character" in the New Project dialog.
   */
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  // Synced in an effect rather than assigned during render: both are only ever
  // read from the keydown handler below, which runs long after paint, so the
  // effect timing is equivalent — and mutating a ref mid-render is exactly what
  // React's rules forbid.
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    // Captured once per open, not once per render — restoring it on every
    // render is what pulled focus out of the input.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
    // `open` only. See `onCloseRef` above for why the other two must not be here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    // Anchored near the top, not vertically centred.
    //
    // Centring re-centres on every content-height change, so a dialog whose
    // body varies — the preset picker switching between a 40-card Style tab and
    // a 6-card Movement tab is the clearest case — slid up and down under the
    // cursor, taking its tab bar with it. The tabs you are aiming at should not
    // move because of what is below them.
    //
    // `pt-[6vh]` rather than a fixed offset so short dialogs still sit in a
    // comfortable optical position rather than jammed against the window edge,
    // and `items-start` with `max-h-[85vh]` on the dialog keeps a tall one from
    // running off the bottom.
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/80 backdrop-blur-xs pt-[6vh] pb-8 px-4 ${overlayClassName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) {
          onClose?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`relative flex w-full ${SIZE_CLASSES[size]} flex-col rounded-[var(--radius-dialog)] border border-hairline bg-bg-workspace p-6 outline-none shadow-2xl transition-all ${className}`}
        style={{ boxShadow: 'var(--shadow-elevated)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="modal-title" className="text-lg font-bold text-text-primary">
              {title}
            </h2>
            {subtitle ? <p className="text-xs text-text-secondary">{subtitle}</p> : null}
          </div>
          {headerActions || (dismissible && onClose) ? (
            <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center gap-1">
              {headerActions}
              {/* Only when the caller allows dismissal at all — the non-dismissible
                  session re-auth overlay must not offer a way out that contradicts
                  why it's non-dismissible in the first place. */}
              {dismissible && onClose ? (
                <IconButton icon="close" label="Close" onClick={onClose} className="shrink-0" />
              ) : null}
            </div>
          ) : null}
        </div>
        {/* `min-h-0` is required for a flex child to actually shrink below its
            content size — without it this never scrolls, it just grows the
            dialog until `max-h-[85vh]` clips it. Harmless for every existing
            `size="md"` caller: short form content never reaches 85vh, so
            nothing here changes for them.

            The horizontal axis is never offered. A dialog that scrolls sideways
            is a layout that overflowed, not a dialog that needed the room, so
            the fix belongs in the content — `overflow-x` here would only hide
            it. */}
        <div className={`mt-4 min-h-0 flex-1 ${bodyScroll ? 'overflow-y-auto' : 'flex flex-col'}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
