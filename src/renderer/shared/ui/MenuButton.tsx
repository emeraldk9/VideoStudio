import { useCallback, useRef, useState } from 'react';

import { Button } from './Button';
import { DropdownPanel, useDismissOnOutside } from './DropdownPanel';
import { IconButton } from './IconButton';

export interface MenuButtonItem {
  /** Stable key and visible text — menu items are short verbs or formats. */
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
}

export interface MenuButtonProps {
  label: string;
  items: readonly MenuButtonItem[];
  disabled?: boolean;
  align?: 'left' | 'right';
  title?: string;
  /**
   * Beta S508 — an icon-only trigger (`more_horiz`), with `label` as its
   * accessible name and tooltip. For a menu that sits in a header beside
   * Close, where a worded button would outweigh the title it belongs to.
   */
  icon?: string;
}

/**
 * A button that opens a short list of one-shot actions (Beta S137).
 *
 * Built for the export row, which was four sibling buttons — `Export SRT`,
 * `Export VTT`, `Export TXT`, `Export JSON` — repeated in two workspaces. Four
 * buttons for one decision reads as four features; a menu reads as one, and the
 * formats stay named rather than hidden behind a generic "Export…" dialog.
 *
 * Actions, not state: this is a `menu`, never a `listbox`. A choice that
 * persists is a `Select`.
 */
export function MenuButton({
  label,
  items,
  disabled = false,
  align = 'left',
  title,
  icon,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, close, containerRef);

  return (
    <div ref={containerRef} className="relative">
      {icon ? (
        <IconButton
          icon={icon}
          label={label}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      ) : (
      <Button
        variant="secondary"
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <span aria-hidden="true" className="material-symbols-outlined text-base">
          expand_more
        </span>
      </Button>
      )}
      {open ? (
        <DropdownPanel role="menu" align={align} aria-label={label} width="w-48">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className="flex w-full items-center rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-primary transition-colors duration-100 ease-out hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </DropdownPanel>
      ) : null}
    </div>
  );
}
