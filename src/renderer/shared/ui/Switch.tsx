export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible name — this is an icon-only control with no visible label of its own. */
  label: string;
  disabled?: boolean;
}

/**
 * An iOS-style on/off track-and-knob, for the handful of true binary toggles
 * in the app (currently just Auto-download). Monochrome, matching the rest
 * of the app's post-violet-removal action language: knob stays a constant
 * dark dot in both states, only the track's fill communicates on/off —
 * no color is spent signalling state that a slid position already shows.
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-text-primary' : 'bg-bg-hover'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-bg-app transition-transform duration-150 ease-out ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
