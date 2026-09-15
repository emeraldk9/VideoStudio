import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { useDismissOnOutside } from './DropdownPanel';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional compact label for the closed trigger; the menu keeps the full label. */
  selectedLabel?: string;
  /**
   * Rendered but not selectable (Beta Step 15 — a tier-gated download quality
   * is offered disabled, never hidden, so the user sees what upgrading buys).
   */
  disabled?: boolean;
  /** Short right-aligned annotation on the option row (e.g. "Ultra only"). */
  hint?: string;
  /** Right-aligned count badge on the option row (e.g. how many items fall in this category). Hidden entirely at `0`/`undefined` rather than shown as an empty or zero badge. */
  count?: number;
  /**
   * Beta S133 — a small poster image at the left of the option row (and the
   * closed trigger). Tri-state on purpose: a URL renders the image, `null`
   * renders a placeholder box so rows in a thumbnail-bearing list stay
   * aligned when one item has no poster, and `undefined` renders nothing —
   * the shape every existing text-only Select keeps.
   */
  thumbnailUrl?: string | null;
  /**
   * Beta S351 — the glyph the `null` placeholder shows. Defaults to `movie`,
   * which is what a posterless *video* is; an audio render is offered by the
   * Voice tab's reference picker and a film clapper is simply the wrong
   * picture of it. Ignored when `thumbnailUrl` is a URL.
   */
  thumbnailIcon?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  /** The chosen option's `value` — there is no real `<select>` underneath, so this is not a change event. */
  onChange: (value: string) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  /** `sm` for dense toolbar rows, `md` (default) for forms — same density switch the old native select offered. */
  size?: 'sm' | 'md';
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
};

/**
 * Beta S133 — the option-row poster. 16:9 and fixed-size so a mixed list (some
 * clips have posters, some never got one) stays a grid rather than a ragged
 * stack; the placeholder shows a glyph instead of collapsing.
 */
function OptionThumb({
  url,
  compact,
  icon = 'movie',
}: {
  url: string | null;
  compact?: boolean;
  icon?: string;
}) {
  const box = compact ? 'h-5 w-9' : 'h-8 w-14';
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={`${box} shrink-0 rounded-[3px] bg-bg-hover object-cover`}
    />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-[3px] bg-bg-hover`}>
      <span aria-hidden="true" className="material-symbols-outlined text-sm text-text-disabled">
        {icon}
      </span>
    </span>
  );
}

/**
 * Popup listbox replacing the app's former native `<select>`.
 *
 * The option list is portalled to `document.body` at a measured position
 * (the same trick `InfoPopover` already uses) rather than positioned via
 * `DropdownPanel`'s normal `absolute` relative-to-trigger placement. A plain
 * `absolute` panel is clipped by the first `overflow-hidden`/scrolling
 * ancestor regardless of z-index — and every `Select` here lives inside one
 * (a Card, a Drawer body, a scrolling toolbar), which is exactly what cut the
 * Model picker's own menu off mid-list. Every other `DropdownPanel` consumer
 * (`AccountMenu`, `ProjectSelector`) sits directly in the TopBar with no such
 * ancestor, so they keep the simpler relative positioning — only this one
 * needed the portal.
 */
export function Select({
  options,
  value,
  onChange,
  id,
  'aria-label': ariaLabel,
  disabled = false,
  className = '',
  size = 'md',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedOption = options[selectedIndex];
  const selectedLabel = selectedOption?.selectedLabel ?? selectedOption?.label ?? '';

  const close = () => setOpen(false);
  // The second ref matters here: the panel is portalled outside this
  // container's DOM subtree, so without it a click inside the panel reads as
  // an outside click and closes the very option list being clicked.
  useDismissOnOutside(open, close, containerRef, panelRef);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) {
      setPanelRect(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setPanelRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open]);

  const openAt = (index: number) => {
    setHighlightedIndex(index);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option?.disabled) {
      // A disabled option is visible but inert — the list stays open, matching
      // what clicking a disabled control anywhere else does (nothing).
      return;
    }
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp'
      ) {
        event.preventDefault();
        openAt(selectedIndex);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(highlightedIndex);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedOption?.label}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-input)] bg-bg-hover ${SIZE_CLASSES[size]} text-text-primary outline-none transition-colors duration-100 ease-out focus:ring-2 focus:ring-inset focus:ring-text-primary/40 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {selectedOption?.thumbnailUrl !== undefined ? (
          <OptionThumb
            url={selectedOption.thumbnailUrl}
            compact
            icon={selectedOption.thumbnailIcon}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        {selectedOption?.count ? (
          <span className="shrink-0 rounded-full bg-bg-selected px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
            {selectedOption.count}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="material-symbols-outlined shrink-0 text-base text-text-secondary"
        >
          expand_more
        </span>
      </button>

      {open && panelRect
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: 'fixed',
                top: panelRect.top,
                left: panelRect.left,
                width: Math.max(panelRect.width, 160),
              }}
              className="z-50 max-h-64 overflow-y-auto rounded-[var(--radius-dialog)] border border-hairline bg-bg-workspace p-1 shadow-lg"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled ? true : undefined}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => commit(index)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-button)] px-2 py-1.5 text-left text-sm ${
                      isHighlighted && !option.disabled ? 'bg-bg-hover' : ''
                    } ${isSelected ? 'text-text-primary' : 'text-text-secondary'} ${
                      option.disabled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  >
                    {option.thumbnailUrl !== undefined ? (
                      <OptionThumb url={option.thumbnailUrl} icon={option.thumbnailIcon} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {option.count ? (
                        <span className="rounded-full bg-bg-selected px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                          {option.count}
                        </span>
                      ) : null}
                      {option.hint ? (
                        <span className="text-[10px] uppercase tracking-wide text-text-disabled">
                          {option.hint}
                        </span>
                      ) : isSelected ? (
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">
                          check
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
