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
  const stepToParentLevel = useSequenceStore((state) => state.stepToParentLevel);

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
    if (sequenceId !== activeId) {
      useSequenceStore.setState({ parentSequenceStack: [] });
      void openSequence(sequenceId);
    }
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
        <nav
          aria-label="Sequence breadcrumb navigation"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-input)] bg-bg-surface border border-hairline text-xs shrink-0 shadow-sm"
        >
          <button
            type="button"
            onClick={() => void stepOutOfCompoundClip()}
            title="Step out to immediate parent sequence"
            className="flex items-center justify-center h-5 w-5 rounded text-text-secondary hover:text-accent-ai hover:bg-bg-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
          </button>
          <span className="h-3 w-px bg-hairline" />
          {parentSequenceStack.map((crumb, idx) => (
            <div key={crumb.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void stepToParentLevel(idx)}
                title={`Jump to ${crumb.name}`}
                className="max-w-[140px] truncate font-medium text-text-secondary hover:text-text-primary transition-colors hover:underline underline-offset-2 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[13px] text-text-disabled">
                  {idx === 0 ? 'movie' : 'auto_awesome_motion'}
                </span>
                <span>{crumb.name}</span>
              </button>
              <span className="material-symbols-outlined text-[13px] text-text-disabled">
                chevron_right
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1 font-semibold text-accent-ai bg-accent-ai/10 px-1.5 py-0.5 rounded border border-accent-ai/20">
            <span className="material-symbols-outlined text-[13px]">auto_awesome_motion</span>
            <span className="max-w-[150px] truncate">{document?.sequence.name ?? 'Compound'}</span>
          </div>
        </nav>
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
