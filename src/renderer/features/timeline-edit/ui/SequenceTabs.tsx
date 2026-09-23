import { useRef, useState } from 'react';

import type { Sequence } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { IconButton } from '../../../shared/ui/IconButton';

import { RenameInput } from './RenameInput';

/**
 * Beta S154 — the sequence switcher as a tab row above the dock, the CapCut
 * shape the owner asked for. Beta S157 — rename moved *into* the tab (the
 * screen header that used to hold it is gone): double-click (or F2) swaps the
 * `role="tab"` button for an input **in its place** — never an editable label
 * nested inside the button, which would be interactive content inside
 * interactive content with genuinely broken focus behaviour. While the input
 * is up the tab is simply not a tab, which is also how VS Code and Finder
 * model a rename.
 *
 * Not `TypeTabs`: that component is keyed off a static enum and cannot express
 * add or close. The APG wiring here — roving tabindex, arrow keys with
 * automatic activation, `Home`/`End` — is copied from `TypeTabs.tsx:76-92` so
 * the two tab rows feel identical under the keyboard.
 *
 * The close button is `deleteSequence`'s **first UI caller** — the store
 * action shipped in S145 and nothing ever invoked it. Closing the last tab is
 * not offered: the screen guarantees a document (its "always-visible
 * workspace" contract), so deleting the only sequence would immediately mint a
 * fresh "Untitled sequence" and the delete would read as a rename-to-default.
 *
 * Deletion is two-step on the button itself (arm, then confirm) — cheaper than
 * a modal, still impossible to hit by accident, and the armed state disarms
 * when focus leaves the row.
 */
export function SequenceTabs() {
  const sequences = useSequenceStore((state) => state.sequences);
  const document = useSequenceStore((state) => state.document);
  const openSequence = useSequenceStore((state) => state.openSequence);
  const createSequence = useSequenceStore((state) => state.createSequence);
  const deleteSequence = useSequenceStore((state) => state.deleteSequence);
  const renameSequence = useSequenceStore((state) => state.renameSequence);
  const parentSequenceStack = useSequenceStore((state) => state.parentSequenceStack);
  const stepOutOfCompoundClip = useSequenceStore((state) => state.stepOutOfCompoundClip);

  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /**
   * S160 — only *which* tab is editing lives here; the draft belongs to
   * `RenameInput`, which is what fixed the rename (see that component's
   * comment for the ref-callback defect both old copies shared).
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeId = document?.sequence.id ?? null;

  const activate = (sequenceId: string) => {
    if (sequenceId !== activeId) void openSequence(sequenceId);
    tabRefs.current.get(sequenceId)?.focus();
  };

  const startEditing = (sequence: Sequence) => {
    setConfirmingId(null);
    setEditingId(sequence.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const position = sequences.findIndex((item) => item.id === activeId);
    if (position < 0) return;
    let next: Sequence | undefined;
    if (event.key === 'ArrowRight') {
      next = sequences[(position + 1) % sequences.length];
    } else if (event.key === 'ArrowLeft') {
      next = sequences[(position - 1 + sequences.length) % sequences.length];
    } else if (event.key === 'Home') {
      next = sequences[0];
    } else if (event.key === 'End') {
      next = sequences[sequences.length - 1];
    }
    if (next) {
      event.preventDefault();
      activate(next.id);
    }
  };

  const handleClose = (sequenceId: string) => {
    // Two-step: first click arms, second confirms. Cheaper than a modal and
    // still impossible to hit twice by accident, since the armed state is
    // per-tab and disarms on blur of the row.
    if (confirmingId !== sequenceId) {
      setConfirmingId(sequenceId);
      return;
    }
    setConfirmingId(null);
    void (async () => {
      await deleteSequence(sequenceId);
      // Deleting the open sequence nulls the document; reopen the most recent
      // survivor so the workspace stays a workspace.
      const state = useSequenceStore.getState();
      if (!state.document && state.sequences.length > 0) {
        await state.openSequence(state.sequences[0].id);
      }
    })();
  };

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onBlur={(event) => {
        // Leaving the row disarms a pending close — an armed ✕ that survives
        // a wander across the app is a trap, not a confirmation.
        if (!event.currentTarget.contains(event.relatedTarget)) setConfirmingId(null);
      }}
    >
      {parentSequenceStack.length > 0 && (
        <button
          type="button"
          onClick={() => void stepOutOfCompoundClip()}
          title="Step out to parent sequence"
          className="flex items-center gap-1 rounded bg-accent-ai/15 px-2 py-1 text-xs font-semibold text-accent-ai hover:bg-accent-ai/25 transition-colors border border-accent-ai/40 shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          <span>Back to Parent</span>
        </button>
      )}
      <div
        role="tablist"
        aria-label="Sequences"
        onKeyDown={handleKeyDown}
        className="flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {sequences.map((sequence) => {
          const isActive = sequence.id === activeId;
          const confirming = confirmingId === sequence.id;
          const isEditing = editingId === sequence.id;
          return (
            <span
              key={sequence.id}
              className={`group flex shrink-0 items-center gap-1 border-b-2 pl-3 pr-1 py-1.5 transition-colors duration-100 ${
                isActive
                  ? 'border-text-primary'
                  : 'border-transparent hover:bg-bg-hover'
              }`}
            >
              {isEditing ? (
                <RenameInput
                  initialValue={sequence.name}
                  ariaLabel={`Sequence name for “${sequence.name}”`}
                  maxLength={120}
                  className="w-36 min-w-0 rounded-[var(--radius-input)] border border-hairline bg-bg-app px-1 text-sm font-medium outline-none focus:border-text-disabled"
                  onCommit={(name) => {
                    setEditingId(null);
                    void renameSequence(sequence.id, name);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button
                  ref={(node) => {
                    if (node) tabRefs.current.set(sequence.id, node);
                    else tabRefs.current.delete(sequence.id);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  title="Double-click to rename"
                  className={`max-w-48 truncate text-sm font-medium ${
                    isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => activate(sequence.id)}
                  onDoubleClick={() => startEditing(sequence)}
                  onKeyDown={(event) => {
                    if (event.key === 'F2') {
                      event.preventDefault();
                      event.stopPropagation();
                      startEditing(sequence);
                    }
                  }}
                >
                  {sequence.name}
                </button>
              )}
              {sequences.length > 1 && !isEditing ? (
                <IconButton
                  icon={confirming ? 'delete_forever' : 'close'}
                  label={
                    confirming
                      ? `Really delete “${sequence.name}”`
                      : `Delete sequence “${sequence.name}”`
                  }
                  tone={confirming ? 'danger' : 'default'}
                  className={
                    confirming ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                  }
                  onClick={() => handleClose(sequence.id)}
                />
              ) : null}
            </span>
          );
        })}
      </div>
      <IconButton
        icon="add"
        label="New sequence"
        onClick={() => {
          const projectId = document?.sequence.projectId;
          if (!projectId) return;
          void createSequence({
            projectId,
            // Born bound to the episode of the sequence beside it — S154's
            // sibling-adoption default; the assemble panel rebinds at first
            // fill either way.
            storyEpisodeId: document?.sequence.storyEpisodeId ?? null,
            name: 'Untitled sequence',
          });
        }}
      />
    </div>
  );
}
