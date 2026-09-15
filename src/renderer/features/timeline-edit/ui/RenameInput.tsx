import { useEffect, useRef, useState } from 'react';

export interface RenameInputProps {
  /** The current name — the draft seeds from it once, on mount. */
  initialValue: string;
  ariaLabel: string;
  maxLength: number;
  className?: string;
  /** Fired with the trimmed draft when it is non-empty and actually changed. */
  onCommit: (value: string) => void;
  /** Fired on Escape, and on a commit that resolved to a no-op — either way the editor closes. */
  onCancel: () => void;
}

/**
 * Beta S160 (owner item 4) — the one inline-rename input.
 *
 * Exists because both prior copies (the sequence tab's and the track
 * header's) shared the same defect: an **inline ref callback** that called
 * `focus()`/`select()`. A ref callback re-runs on every render, so each
 * keystroke — which re-rendered the parent through its draft state —
 * re-selected the whole draft and the next character replaced everything
 * typed. The field could never hold more than one character.
 *
 * The fix is structural, not a patch:
 *
 * - **Draft state lives here**, so typing re-renders this component only and
 *   the parent cannot re-trigger anything by rendering.
 * - **Focus-and-select runs exactly once, on mount** — the component mounts
 *   when editing begins and unmounts when it ends, so mount *is* entry.
 * - The contract is `InlineEditableText`'s, restated: Enter/blur commit,
 *   Escape cancels, empty is a cancel, unchanged is a no-op. Commit fires
 *   from the event handler directly — never from inside a state updater,
 *   which StrictMode double-invokes (the tab's other latent bug).
 * - Keydown stops propagating so a tablist's arrow-key navigation (or the
 *   timeline's shortcut map) cannot fire while the caret moves in the draft.
 *
 * A component rather than a hook because the tab strip renders one editor
 * *per mapped item* — hooks cannot be conditional inside a map, but a
 * mounted-while-editing component can.
 *
 * Not `InlineEditableText` itself: that primitive owns its display state and
 * renders its own label button, while these two call sites swap a foreign
 * element (a `role="tab"` button, a track header row) for the input — the
 * display half is theirs, only the edit half is shared.
 */
export function RenameInput({
  initialValue,
  ariaLabel,
  maxLength,
  className,
  onCommit,
  onCancel,
}: RenameInputProps) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Blur fires after Enter's commit (the parent unmounts this component,
  // which blurs the input) — the guard keeps that from committing twice.
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== initialValue) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      maxLength={maxLength}
      className={className}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          commit();
        } else if (event.key === 'Escape') {
          settledRef.current = true;
          onCancel();
        }
      }}
    />
  );
}
