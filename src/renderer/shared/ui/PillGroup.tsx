export interface PillGroupProps<T extends string | number> {
  /** The group's accessible name. Never rendered as a caption — see below. */
  label: string;
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
  formatLabel?: (value: T) => string;
}

/**
 * A segmented single-choice control — Flow's own aspect-ratio / duration /
 * batch-count pills, and the app's answer for any short list of self-describing
 * values.
 *
 * **No visible caption.** Every option in these groups says what it is —
 * "16:9", "x4", "8s" — so a word above them labels the obvious and costs a line
 * per group. Nothing is lost to assistive tech: `aria-label` on the radiogroup
 * is the accessible name (a caption span was never associated with the group
 * anyway), and `title` keeps the word one hover away.
 *
 * Wraps rather than overflowing, so the same component fits both the Studio's
 * wide settings footer and the Story Builder's narrow popovers — image mode
 * offers five aspect ratios, which is more than a 288px popover fits on one
 * line.
 *
 * Beta Step 64 lifted this out of `ModelSettingsPanel`, which had the only
 * copy, so the Story Builder's render-settings menus pick a ratio and a
 * variation count the same way the Studio does instead of through a `Select`
 * (owner ask 2026-08-02). Deliberately stateless and store-free: it is a
 * `shared/ui` primitive, and the persistence rules differ per caller — the
 * Studio's settings are a global `localStorage` preference, the Story Builder's
 * belong to the project and travel with its folder.
 */
export function PillGroup<T extends string | number>({
  label,
  options,
  value,
  onSelect,
  formatLabel,
}: PillGroupProps<T>) {
  return (
    // Beta S508 — the same track, chip and tints as `SegmentedControl`, so the
    // two single-choice controls read as one control across the app. The
    // semantics deliberately stay different: this is a `radiogroup` of `radio`s
    // with `aria-checked`, the pattern ARIA defines for one-of-many, where
    // `SegmentedControl` is toggle buttons. `flex-wrap` stays too — five image
    // ratios do not fit a 288px popover on one line.
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-[var(--radius-button)] bg-bg-hover p-0.5"
      role="radiogroup"
      aria-label={label}
      title={label}
    >
      {options.map((option) => {
        const isActive = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(option)}
            className={`rounded-[var(--radius-button)] px-3 py-1 text-xs font-medium transition-colors duration-100 ease-out ${
              isActive ? 'bg-bg-app text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {formatLabel ? formatLabel(option) : option}
          </button>
        );
      })}
    </div>
  );
}
