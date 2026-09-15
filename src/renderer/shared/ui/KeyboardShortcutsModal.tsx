import { useModalStore } from '../../shared/model/modalStore';
import { MODAL_IDS } from '../config/modal-ids';

import { Modal } from './Modal';


/** Every entry here must have a real, wired shortcut — see `useGlobalShortcuts.ts`'s doc comment; no fabricated entries. */
const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Ctrl / Cmd + N', description: 'Open Image Studio (start a new prompt batch)' },
  { keys: 'Ctrl / Cmd + B', description: 'Go to the Flow browser / expand it' },
  { keys: 'Ctrl / Cmd + 1..5', description: 'Switch screens (Dashboard, Flow browser, Image Studio, Video Studio, Library)' },
  { keys: 'Ctrl / Cmd + 6', description: 'Open Settings' },
  // Beta S326 — listed because they are wired. This file's standing rule is
  // that it documents only bindings that exist (Beta_S6b's audit note).
  { keys: 'Ctrl / Cmd + 7', description: 'Open the Voice window (or focus it)' },
  { keys: 'Ctrl / Cmd + 8', description: 'Open the Timeline window (or focus it)' },
  { keys: 'Ctrl / Cmd + Enter', description: 'Enqueue the current prompt batch (while a script textarea is focused)' },
  { keys: '? or Ctrl / Cmd + /', description: 'Open this shortcuts reference' },
  { keys: 'Esc', description: 'Close the open dialog' },
];

/** Triggered by `?` or `Ctrl/Cmd+/` — see `useGlobalShortcuts.ts`. */
export function KeyboardShortcutsModal() {
  const activeModal = useModalStore((store) => store.activeModal);
  const closeModal = useModalStore((store) => store.closeModal);

  const open = activeModal === MODAL_IDS.KEYBOARD_SHORTCUTS;

  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={closeModal}>
      <ul className="flex flex-col gap-2">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-text-secondary">{shortcut.description}</span>
            <kbd className="shrink-0 rounded-[var(--radius-button)] bg-bg-hover px-2 py-1 font-mono text-xs text-text-primary">
              {shortcut.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
