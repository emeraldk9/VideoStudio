export type CardSize = 'small' | 'medium' | 'large';

/**
 * The grid class each size maps to — full literal strings, never interpolated.
 *
 * Tailwind's JIT scans source text for complete class names, so a template
 * like `minmax(${px}px,1fr)` would compile to nothing and the grid would
 * silently fall back to one column. Written out per size for that reason.
 *
 * Sizes are minimum column widths, not column counts: `auto-fill` then fits as
 * many as the pane can hold, so density changes without breaking reflow the
 * way fixed `grid-cols-N` breakpoints do.
 */
export const CARD_SIZE_GRID_CLASSES: Record<CardSize, string> = {
  small: 'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]',
  medium: 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
  large: 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
};

const OPTIONS: { size: CardSize; icon: string; label: string }[] = [
  // Material's density ligatures read as "more items"/"fewer items", which is
  // exactly what the control does — a magnifier would imply zooming one image.
  { size: 'small', icon: 'grid_on', label: 'Small cards' },
  { size: 'medium', icon: 'grid_view', label: 'Medium cards' },
  { size: 'large', icon: 'square', label: 'Large cards' },
];

export interface CardSizeToggleProps {
  value: CardSize;
  onChange: (size: CardSize) => void;
}

/**
 * Three-step card density control — the segmented switch Finder, Lightroom and
 * Dropbox all use for the same job, rather than a slider (no meaningful
 * intermediate values) or a dropdown (hides the current state behind a click).
 *
 * `role="radiogroup"` rather than a set of toggle buttons: the options are
 * mutually exclusive and exactly one is always active, which is what a radio
 * group means to a screen reader. Icon-only, so each option carries its own
 * `aria-label` and `title`.
 */
export function CardSizeToggle({ value, onChange }: CardSizeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Card size"
      className="flex items-center gap-0.5 rounded-[var(--radius-button)] border border-hairline bg-bg-canvas p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = option.size === value;
        return (
          <button
            key={option.size}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.size)}
            className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-button)] transition-colors duration-100 ease-out ${
              active
                ? 'bg-bg-selected text-text-primary'
                : 'text-text-disabled hover:bg-bg-hover hover:text-text-secondary'
            }`}
          >
            <span className="material-symbols-outlined text-base">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
