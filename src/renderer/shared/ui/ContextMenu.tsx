import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useDismissOnOutside } from './DropdownPanel';

export interface ContextMenuItem {
  /** Stable key and visible text — short verbs, the `MenuButton` vocabulary. */
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Warning tone for destructive entries (delete, ripple delete). */
  danger?: boolean;
  /** Visual shortcut hint (e.g., 'Ctrl+D', 'Alt+F'). */
  shortcut?: string;
  /** Material Symbols icon glyph */
  icon?: string;
  /** Color dot class for color labels (e.g., 'bg-rose-500') */
  dotColor?: string;
}

export interface ContextMenuProps {
  /** Viewport coordinates of the invoking right-click, or `null` when closed. */
  position: { x: number; y: number } | null;
  items: readonly ContextMenuItem[];
  onClose: () => void;
  'aria-label': string;
}

/**
 * Beta S160 (owner item 7) — the app's first right-click menu.
 *
 * Portalled to `document.body` at a fixed position, exactly the escape route
 * the track-header options menu and `InfoPopover` already use: the invoking
 * surfaces live inside `overflow-hidden` scroll containers, and an absolutely
 * positioned panel would clip into invisibility regardless of z-index.
 *
 * Controlled from outside (`position` + `onClose`) rather than owning its
 * open state: a context menu belongs to whatever was clicked, and the caller
 * knows what that was — this component only knows how to be a menu. Scroll
 * and resize dismiss it, the track-header menu's rule: the measured anchor is
 * stale the moment the surface moves, and dismissing matches what the user
 * means by scrolling away.
 *
 * In `shared/ui` deliberately: store-free, and right-click is a grammar other
 * surfaces (library grid, queue table) are expected to adopt.
 */
export function ContextMenu({ position, items, onClose, 'aria-label': ariaLabel }: ContextMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(position !== null, onClose, panelRef);

  useEffect(() => {
    if (!position) return;
    const hide = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  // Clamped on-screen; flipped above/left of the pointer when the viewport
  // edge would clip it. Estimated panel metrics — a menu this small does not
  // warrant a measure-then-position double render.
  const PANEL_WIDTH = 270;
  const itemHeight = 30;
  const panelHeight = items.length * itemHeight + 8;
  const left = Math.min(position.x, window.innerWidth - PANEL_WIDTH - 8);
  const top =
    position.y + panelHeight > window.innerHeight - 8
      ? Math.max(8, position.y - panelHeight)
      : position.y;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={ariaLabel}
      style={{ top, left }}
      className="fixed z-[60] flex w-[270px] min-w-[260px] flex-col gap-0.5 rounded-[var(--radius-button)] border border-hairline bg-bg-workspace p-1 shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-button)] px-2.5 py-1.5 text-left text-xs transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${
            item.danger
              ? 'text-accent-warning hover:bg-accent-warning/15'
              : 'text-text-primary hover:bg-bg-hover'
          }`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <span className="flex items-center gap-2 truncate">
            {item.dotColor ? (
              <span className={`h-2 w-2 rounded-full shrink-0 ${item.dotColor}`} />
            ) : item.icon ? (
              <span className="material-symbols-outlined text-[15px] shrink-0 text-text-secondary">
                {item.icon}
              </span>
            ) : null}
            <span className="truncate">{item.label}</span>
          </span>
          {item.shortcut ? (
            <span className="shrink-0 rounded bg-bg-hover/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-secondary">
              {item.shortcut}
            </span>
          ) : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
