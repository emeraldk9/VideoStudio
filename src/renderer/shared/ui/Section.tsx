import type { ReactNode } from 'react';

export interface SectionProps {
  /** Short noun label — "Script", "Tune", "Result". Not a sentence. */
  title: string;
  /** Count shown beside the title, e.g. the number of rows a table holds. */
  count?: number;
  /** Controls that belong to the group (Reset, Clear, an info trigger). */
  action?: ReactNode;
  /**
   * Beta S456 — the group folds away, its header becoming the handle.
   *
   * For a group that is **reference** rather than working surface: read when
   * something came out wrong, not on every pass. `ShotTakesPanel` had already
   * reached for this shape by hand one pane to the left — *Script* open,
   * *Prompt sent to Flow* closed — and the shot rails needed the same for
   * *Final prompt*, whose blocks view has no height ceiling and was the single
   * reason everything below it was unreachable.
   *
   * Uncontrolled on purpose. Which groups a reader has folded open is theirs
   * for as long as the panel is mounted, and no caller has wanted to drive it.
   */
  collapsible?: boolean;
  /** Open on mount, when `collapsible`. Ignored otherwise. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A labelled group inside a workspace column (Beta S137).
 *
 * The Voice panels had grown a dozen hand-rolled copies of
 * `<span className="text-[11px] font-medium uppercase …">` — each with its own
 * explanatory suffix after an em dash. One component makes the label a label:
 * what the group is, and nothing about how to use it. Guidance that only
 * matters once belongs in an `InfoPopover` or a placeholder, not in permanent
 * vertical space above every control.
 */
export function Section({
  title,
  count,
  action,
  collapsible = false,
  defaultOpen = false,
  children,
  className = '',
}: SectionProps) {
  const heading = (
    <h2 className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
      {title}
      {count === undefined ? null : <span className="ml-1 text-text-disabled">{count}</span>}
    </h2>
  );

  if (!collapsible) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex min-h-6 items-center gap-2">
          {heading}
          {action ? <div className="ml-auto flex items-center gap-1.5">{action}</div> : null}
        </div>
        {children}
      </div>
    );
  }

  return (
    // `open` is set once, at mount, and never re-asserted: it is a constant per
    // call site, so React writes it on the first commit and leaves the reader's
    // own toggling alone thereafter. The same uncontrolled `<details>` the
    // takes panel uses for its two disclosures.
    //
    // Left as a block box, deliberately. A `display: flex` `<details>` is the
    // one arrangement where the disclosure itself has been unreliable across
    // Chromium versions, and there is nothing to gain from it: `<summary>` and
    // the content below are both blocks, so they stack on their own, and the
    // group is a flex *item* of the rail either way.
    <details open={defaultOpen} className={`group ${className}`}>
      {/* `list-none` plus the WebKit rule removes the UA triangle; the chevron
          below is the app's own, and rotates with `[open]`. */}
      <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="material-symbols-outlined text-base text-text-disabled transition-transform duration-100 group-open:rotate-90"
        >
          chevron_right
        </span>
        {heading}
        {action ? (
          // Stops the click reaching the `<summary>`, whose activation
          // behaviour would otherwise fold the group every time its Copy or
          // Reset control was pressed.
          <div
            className="ml-auto flex items-center gap-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            {action}
          </div>
        ) : null}
      </summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}
