export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, dimmed — e.g. how many rows the pane holds. */
  count?: number;
  /**
   * Beta S184 — a Material Symbols ligature shown *before* the label, for a
   * state the label itself does not carry (a shared frame, a lock).
   *
   * Ahead of the label rather than after it so the `count` keeps the same
   * trailing position on every segment whether or not an icon is present.
   * Decorative by construction: it is `aria-hidden`, so a segment using one
   * must say what it means in `srLabel`.
   */
  icon?: string;
  /**
   * Overrides the accessible name when the visible label is not the whole
   * story — "End frame, shared with Shot 8".
   */
  srLabel?: string;
  /**
   * Beta S494 — one segment unavailable while its peers stay live.
   *
   * The watermark dialog's *Replace* is refused for imported pool files and
   * its *After* has nothing to show until a preview exists. Greying the whole
   * group (`disabled` below) would also take away the choice that still works.
   */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers — "Right panel view", "Dub scope". */
  ariaLabel: string;
  /** Greys out and blocks every segment — for a control whose parent setting is off. */
  disabled?: boolean;
}

/**
 * The segmented control (Beta S137): two or three peers, one selected.
 *
 * For choosing *which view is in front* when both are the same kind of thing —
 * Tune vs History, single clip vs sequence. Not for actions (that is a button)
 * and not for a setting with more than a handful of values (that is a
 * `Select`). Tabs were the other candidate and are wrong here: the module
 * already uses a tab bar for its workspaces, and a second tab strip inside one
 * would read as navigation rather than a view switch.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex w-fit items-center gap-0.5 rounded-[var(--radius-button)] bg-bg-hover p-0.5 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.srLabel}
            title={option.srLabel}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 rounded-[var(--radius-button)] px-3 py-1 text-xs font-medium transition-colors duration-100 ease-out disabled:cursor-not-allowed ${
              option.disabled && !disabled ? 'disabled:opacity-40' : ''
            } ${
              active
                ? 'bg-bg-app text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {option.icon ? (
              <span aria-hidden className="material-symbols-outlined text-[14px] leading-none">
                {option.icon}
              </span>
            ) : null}
            {option.label}
            {option.count === undefined ? null : (
              <span className="ml-1.5 text-text-disabled">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
