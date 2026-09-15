export interface PresetChipProps {
  label: string;
  /** Omit to render a plain, non-removable chip. */
  onClear?: () => void;
}

/**
 * One small rounded "active preset" pill with an optional × to clear it.
 *
 * Lives in `shared/ui` rather than inside `style-presets` because a third
 * surface wanted it: Beta Step 52 gave the Story Builder's Look section the
 * same Style-pill-plus-chip-row shape the Studio sidebar has, and
 * `features/story-builder` may not import from `features/style-presets` —
 * they are sibling slices. It has no store or IPC dependency of its own, so
 * `shared/ui` is where the convention puts it.
 *
 * Its three consumers — `PresetSelectorBar` (Studio sidebar),
 * `PresetPickerModal` (modal header) and `Stage0Setup` (Story Builder Look) —
 * all answer the same question, "what is currently active", and must render it
 * identically.
 */
export function PresetChip({ label, onClear }: PresetChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-bg-hover py-0.5 pl-2 pr-1 text-xs font-normal text-text-primary">
      {label}
      {onClear ? (
        <button
          type="button"
          aria-label={`Clear ${label} preset`}
          onClick={onClear}
          className="flex h-4 w-4 items-center justify-center rounded-full text-text-secondary hover:bg-bg-selected hover:text-text-primary"
        >
          <span className="material-symbols-outlined text-xs">close</span>
        </button>
      ) : null}
    </span>
  );
}
