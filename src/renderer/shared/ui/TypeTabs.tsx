import { useRef } from 'react';
import type { ReactNode } from 'react';

export interface TypeTabsProps<T extends string> {
  order: readonly T[];
  labels: Record<T, string>;
  icons: Record<T, string>;
  active: T;
  onChange: (type: T) => void;
  ariaLabel: string;
  /**
   * Status or controls parked at the far end of the tab row, outside the
   * `tablist`.
   *
   * Outside deliberately: a `tablist` may contain tabs and nothing else, so a
   * chip dropped in among them would be announced as a tab that cannot be
   * activated. The wrapper row below is what the two share — the border and the
   * baseline — while only the tabs are in the tab sequence.
   */
  trailing?: ReactNode;
  /**
   * Beta S122 — opt-in id base for full APG tabs wiring. When present, each tab
   * gets `id={typeTabId(idBase, type)}` and `aria-controls={typeTabPanelId(idBase, type)}`;
   * the caller wraps each workspace in a matching
   * `<div role="tabpanel" id={typeTabPanelId(...)} aria-labelledby={typeTabId(...)}>`.
   * Optional so the existing list-filter call sites (presets, entity boards)
   * stay valid without panels — they filter content in place rather than
   * switching panels.
   */
  idBase?: string;
  /**
   * Beta S508 — a count after a tab's label (`Setups 72`).
   *
   * Rendered `aria-hidden`, deliberately: the count changes as the user works,
   * and a tab whose accessible name changed with it could not be found by name
   * — by a screen reader's tab list or by a test. The number is for the eye.
   */
  counts?: Partial<Record<T, number>>;
}

/** Deterministic tab/panel ids, so the tab bar and the panels agree without threading refs. */
export function typeTabId(idBase: string, type: string): string {
  return `${idBase}-tab-${type}`;
}

export function typeTabPanelId(idBase: string, type: string): string {
  return `${idBase}-panel-${type}`;
}

/**
 * Generic type/kind tab bar — the Style/Camera/Lighting/Color Grading/
 * Environment bar (`PresetTypeTabs`) and the Character/Location/Prop bar
 * (Beta Step 31) are the same visual pattern over a different enum, and
 * `shared/ui` is where FSD's own rule ("if two slices need the same thing,
 * it belongs one layer down") puts a component two sibling `features/`
 * slices both need — `features/style-presets` and `features/character-refs`
 * may not import from each other directly.
 *
 * Beta S122 — upgraded to the WAI-ARIA APG tabs pattern for the Voice screen,
 * which switches whole workspaces rather than filtering a list: roving
 * tabindex (only the active tab is in the tab sequence) and arrow-key
 * navigation with automatic activation (selection follows focus). Home/End
 * jump to the first/last tab.
 */
export function TypeTabs<T extends string>({
  order,
  labels,
  icons,
  active,
  onChange,
  ariaLabel,
  idBase,
  trailing,
  counts,
}: TypeTabsProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  const activate = (type: T) => {
    onChange(type);
    // Focus travels with activation so a keyboard user is never focused on a
    // tab that is no longer selected.
    tabRefs.current.get(type)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const position = order.indexOf(active);
    let next: T | null = null;
    if (event.key === 'ArrowRight') {
      next = order[(position + 1) % order.length];
    } else if (event.key === 'ArrowLeft') {
      next = order[(position - 1 + order.length) % order.length];
    } else if (event.key === 'Home') {
      next = order[0];
    } else if (event.key === 'End') {
      next = order[order.length - 1];
    }
    if (next !== null) {
      event.preventDefault();
      activate(next);
    }
  };

  return (
    // The rule lives on the row, not on the tablist, so anything `trailing`
    // puts at the far end sits on the same baseline as the tabs instead of
    // floating above its own gap.
    <div className="flex flex-wrap items-center gap-x-3 border-b border-hairline">
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className="flex flex-wrap items-center gap-1"
      >
        {order.map((type) => {
          const isActive = type === active;
          return (
            <button
              key={type}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(type, node);
                } else {
                  tabRefs.current.delete(type);
                }
              }}
              type="button"
              role="tab"
              id={idBase ? typeTabId(idBase, type) : undefined}
              aria-controls={idBase ? typeTabPanelId(idBase, type) : undefined}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(type)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-100 ease-out ${
                isActive
                  ? 'border-text-primary text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {/* The ligature text is decorative — without `aria-hidden` it joins
                  the label in the accessible name ("location_on Location"
                  instead of "Location"), which is both unreadable to a screen
                  reader and unmatchable by an exact-name query. */}
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                {icons[type]}
              </span>
              {labels[type]}
              {counts?.[type] === undefined ? null : (
                <span aria-hidden="true" className="font-mono text-xs text-text-disabled">
                  {counts[type]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {trailing ? <div className="ml-auto flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}
