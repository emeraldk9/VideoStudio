import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent, Ref } from 'react';

import { Input, Textarea, type InputProps, type TextareaProps } from './Input';

/**
 * Beta S208 — a field that tells its owner the *final* value, not every
 * keystroke on the way to it.
 *
 * ## What it is for
 *
 * A controlled field whose `onChange` writes to a store makes every keystroke a
 * store write, and every store write re-runs whatever that store feeds. In the
 * Voice module's Tune table that is: re-derive the plan from the script,
 * re-apply voices, rates and pauses, re-merge the generated takes, re-walk the
 * sequential timeline, and re-render every row — on a 200-line script, for
 * each character typed. The owner reported it as the table lagging behind the
 * keyboard (2026-08-19).
 *
 * It is also a *correctness* fix, not only a speed one. `patchSegment` drops a
 * row's take whenever its text changes, so typing into a generated line
 * destroyed that line's ✓ on the first keystroke — including when the edit was
 * a typo the user immediately undid. Committing once, and only when the value
 * genuinely differs, means a keystroke-and-back-again costs nothing at all.
 *
 * ## The rules (the same five `InlineEditableText` already establishes)
 *
 * - **Blur commits.** Not cancels: a click landing slightly outside must not
 *   throw away what was typed.
 * - **Enter commits** (single-line only — in a textarea Enter is a newline).
 * - **Escape reverts** to the incoming value and leaves the field.
 * - **An unchanged value commits nothing**, so tabbing through a row is free.
 * - **The draft is local**, so the owner only ever hears the final value.
 *
 * `commitDelayMs` adds a sixth for the one case blur cannot serve: the big
 * script box, whose whole promise is that lines appear in the table as you
 * write them. There the draft also commits after that many milliseconds of
 * quiet — live enough to keep the promise, and one derivation per pause
 * instead of one per character.
 *
 * ## Why a draft rather than a debounce around the store write
 *
 * A debounced write leaves the field controlled by a value that lags what was
 * typed, and every echo of the old value fights the cursor — which is exactly
 * how `ParsedPromptCard` ate spaces as they were typed (2026-07-31). Holding
 * the draft locally means the field is never re-rendered from stale state.
 */

interface CommitBehaviour {
  /** The value from the owner. The field shows it whenever it is not being edited. */
  value: string;
  /** Called with the final value, only when it differs from `value`. */
  onCommit: (next: string) => void;
  /** Also commit after this many ms of no typing. Omit for commit-on-exit only. */
  commitDelayMs?: number;
  /**
   * Beta S350 — the uncommitted draft, for the one thing a commit-on-exit
   * field otherwise breaks: a character counter whose whole promise is that it
   * tracks the keyboard. The shot modal's Script box and both prompt boxes
   * carry one (Beta S164 added them so a long field can be trimmed *while*
   * being written, not discovered at enqueue).
   *
   * `null` means "not being edited" — read the committed `value` instead.
   * Reported that way rather than as a string so the owner never has to hold a
   * second copy of the value, and so an incoming update while the field is
   * idle is reflected without a round trip.
   *
   * Never fired during render — the reconcile branch below deliberately does
   * not call it — so an owner may put it straight into `useState`.
   */
  onDraftChange?: (draft: string | null) => void;
}

function useCommittedDraft(
  { value, onCommit, commitDelayMs, onDraftChange }: CommitBehaviour,
  commitOnEnter: boolean,
) {
  const [draft, setDraft] = useState(value);
  /**
   * The last incoming value this field has reconciled against. Adjusting state
   * during render (React's own pattern for "a prop changed") rather than in an
   * effect: an effect would paint one frame of the stale draft first, and in a
   * table that reads as the row flickering back to its old text.
   */
  const [seen, setSeen] = useState(value);
  /**
   * State rather than a ref, because the render below reads it: a ref read
   * during render is both lint-flagged and genuinely wrong here — React would
   * not re-render on the change, and this decision *is* part of rendering.
   */
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (value !== seen) {
    setSeen(value);
    // Never while the user is typing in it. An incoming update mid-edit — the
    // sequential walk restating an offset, a run writing a take back — must not
    // overwrite what is being typed.
    if (!editing) {
      setDraft(value);
    }
  }

  const stopTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  // Unmounting mid-edit (a row deleted, the tab switched) must not fire a
  // commit into a component that is gone.
  useEffect(() => stopTimer, []);

  const commit = (next: string) => {
    stopTimer();
    if (next !== value) {
      onCommit(next);
    }
  };

  return {
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.target.value;
      setDraft(next);
      onDraftChange?.(next);
      if (commitDelayMs !== undefined) {
        stopTimer();
        timer.current = setTimeout(() => commit(next), commitDelayMs);
      }
    },
    onFocus: () => {
      setEditing(true);
      // The draft can already differ from `value` here: an incoming update
      // that arrived mid-edit was suppressed above and is still suppressed.
      onDraftChange?.(draft);
    },
    onBlur: () => {
      setEditing(false);
      commit(draft);
      onDraftChange?.(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (commitOnEnter && event.key === 'Enter') {
        commit(draft);
      } else if (event.key === 'Escape') {
        stopTimer();
        setDraft(value);
        setEditing(false);
        onDraftChange?.(null);
        event.currentTarget.blur();
      }
    },
  };
}

export type CommitInputProps = Omit<InputProps, 'value' | 'onChange' | 'defaultValue'> &
  CommitBehaviour & {
    /** Forwarded to the underlying `input` — the Tune table reads its caret to place a split. */
    ref?: Ref<HTMLInputElement>;
  };

export function CommitInput({
  value,
  onCommit,
  commitDelayMs,
  onDraftChange,
  ref,
  ...rest
}: CommitInputProps) {
  const draft = useCommittedDraft({ value, onCommit, commitDelayMs, onDraftChange }, true);
  return (
    <Input
      ref={ref}
      {...rest}
      value={draft.value}
      onChange={draft.onChange}
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        draft.onFocus();
        rest.onFocus?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLInputElement>) => {
        draft.onBlur();
        rest.onBlur?.(event);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        draft.onKeyDown(event);
        rest.onKeyDown?.(event);
      }}
    />
  );
}

export type CommitTextareaProps = Omit<TextareaProps, 'value' | 'onChange' | 'defaultValue'> &
  CommitBehaviour & {
    /**
     * Beta S408 — grow with the draft. `rows` becomes the draft's line count
     * clamped to `[minRows, maxRows]` (defaults 1 and 12). A prompt field holds
     * prose that reads in lines, and a fixed three-row box hid every line
     * after the third; measuring by line count rather than scroll height keeps
     * the field deterministic, which is what lets a test pin it.
     */
    autoGrow?: { minRows?: number; maxRows?: number };
  };

export function CommitTextarea({
  value,
  onCommit,
  commitDelayMs,
  onDraftChange,
  autoGrow,
  ...rest
}: CommitTextareaProps) {
  // No Enter-commits: in a multi-line box Enter is a newline, and stealing it
  // would make the field unusable for the one thing it exists for.
  const draft = useCommittedDraft({ value, onCommit, commitDelayMs, onDraftChange }, false);
  const rows = autoGrow
    ? Math.min(
        autoGrow.maxRows ?? 12,
        Math.max(autoGrow.minRows ?? 1, draft.value.split('\n').length),
      )
    : rest.rows;
  return (
    <Textarea
      {...rest}
      rows={rows}
      value={draft.value}
      onChange={draft.onChange}
      onFocus={(event: FocusEvent<HTMLTextAreaElement>) => {
        draft.onFocus();
        rest.onFocus?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLTextAreaElement>) => {
        draft.onBlur();
        rest.onBlur?.(event);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        draft.onKeyDown(event);
        rest.onKeyDown?.(event);
      }}
    />
  );
}
