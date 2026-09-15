import { useCallback, useState } from 'react';

export interface InlineEditableTextProps {
  value: string;
  /** Called only when the value actually changed and is non-empty after trimming. */
  onCommit: (next: string) => void;
  /** Accessible name for the input, e.g. "Project name". */
  label: string;
  /** Classes for the static text. The input takes its own, so pass matching type styles to both. */
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}

/**
 * Text that becomes an input in place — Beta Step 49.
 *
 * The interaction is the one Finder, VS Code's explorer, Notion, Linear and
 * Drive all share, and each rule below is load-bearing rather than taste:
 *
 * - **Double-click or F2 to enter**, never single click. In a list, single
 *   click already selects the row; on a heading it would fight text selection.
 * - **The value is pre-selected** on entry, so typing replaces rather than
 *   appends. A rename that makes you clear the field first is a rename you
 *   stop using.
 * - **Enter or blur commits, Escape reverts.** Blur-commits is what all five
 *   of those apps do; blur-cancels loses work whenever a click lands slightly
 *   outside.
 * - **Empty or whitespace-only is a cancel, not an error.** An empty name is a
 *   mis-key, and a validation message for it would be scolding the user for a
 *   slip they can already see.
 * - **An unchanged value commits nothing**, so opening the editor and pressing
 *   Enter costs no write and no optimistic-update churn.
 *
 * The draft is local and the owner only ever hears the final value, so a
 * rename cannot fire a store write per keystroke. `ParsedPromptCard` kept its
 * own older click-to-edit, which did fire per keystroke and had no Escape;
 * that was not just untidy — its parent re-parses the whole script on every
 * write and trims each line, so the echo ate every space as it was typed
 * (owner report 2026-07-31). It now holds a draft of its own with the same
 * commit/revert rules. Consolidating the two is still worth doing and still
 * its own change: this component is an `input`, the card needs an
 * auto-growing `textarea`, so sharing them means a shape parameter rather
 * than a swap.
 *
 * Focus and select happen in the input's ref callback rather than an effect:
 * the input only mounts when editing begins, so its mount *is* the event, and
 * routing it through `useEffect` would mean setting state from an effect for
 * no gain.
 */
export function InlineEditableText({
  value,
  onCommit,
  label,
  className = '',
  inputClassName = '',
  maxLength = 100,
}: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const focusAndSelect = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);

  const startEditing = () => {
    // Seeded here, not from a `value` effect: an incoming update mid-edit
    // (another surface renaming the same project) must not overwrite what is
    // being typed.
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== value) {
      onCommit(trimmed);
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="Double-click to rename"
        onDoubleClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            startEditing();
          }
        }}
        className={`cursor-text ${className}`}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      ref={focusAndSelect}
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Stopped so a rename inside a list row cannot also trigger the row's
        // own key handling (selection, delete shortcuts).
        event.stopPropagation();
        if (event.key === 'Enter') {
          commit();
        } else if (event.key === 'Escape') {
          setEditing(false);
        }
      }}
      // Stopped for the same reason: the static text usually sits inside a
      // button that selects the row.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`min-w-0 rounded-[var(--radius-input)] border border-hairline bg-bg-app px-1 outline-none focus:border-text-disabled ${inputClassName}`}
    />
  );
}
