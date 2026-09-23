import { useState, useMemo } from 'react';

import { useModalStore } from '../../shared/model/modalStore';
import { MODAL_IDS } from '../config/modal-ids';

import { Modal } from './Modal';

export interface ShortcutItem {
  keys: string;
  description: string;
  category: 'Timeline Editing' | 'Transport & Work Area' | 'Tools & Selection' | 'Global & Windows';
}

const SHORTCUTS: ShortcutItem[] = [
  // Timeline Editing
  { keys: 'Q', description: 'Ripple trim head (start) to playhead', category: 'Timeline Editing' },
  { keys: 'W', description: 'Ripple trim tail (end) to playhead', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + R', description: 'Clip Speed / Duration Retiming HUD', category: 'Timeline Editing' },
  { keys: 'G', description: 'Audio Gain & Fades HUD modal', category: 'Timeline Editing' },
  { keys: '[ / ]', description: 'Nudge selected clip audio gain ±1 dB', category: 'Timeline Editing' },
  { keys: 'Alt + ← / →', description: 'Slip media inside selected clip (Shift for 10f)', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + C', description: 'Copy selected clip(s)', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + X', description: 'Cut selected clip(s) (leaves gap)', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + Shift + X', description: 'Ripple cut selected clip(s) (closes gap)', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + V', description: 'Paste clipboard clips at playhead', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + Shift + V', description: 'Ripple insert paste at playhead (shifts downstream)', category: 'Timeline Editing' },
  { keys: 'Ctrl / Cmd + D', description: 'Duplicate selected clip', category: 'Timeline Editing' },
  { keys: 'Shift + D', description: 'Apply / toggle default transition (Cross Dissolve)', category: 'Timeline Editing' },
  { keys: 'Shift + S', description: 'Toggle real-time audio scrubbing on scrub / step', category: 'Timeline Editing' },
  { keys: 'Shift + C', description: 'Toggle broadcast video scopes HUD (Waveform, Parade, Vectorscope)', category: 'Timeline Editing' },
  { keys: 'Del / Backspace', description: 'Delete selected clip', category: 'Timeline Editing' },
  { keys: 'Shift + Del', description: 'Ripple delete / Close gap at playhead', category: 'Timeline Editing' },
  { keys: 'Alt + F', description: 'Freeze frame at playhead', category: 'Timeline Editing' },
  { keys: 'Toolbar / Text', description: 'Subtitles & Captions (.srt / .vtt) Ingest & Export modal', category: 'Timeline Editing' },

  // Transport & Work Area
  { keys: 'Space', description: 'Play / Pause toggle', category: 'Transport & Work Area' },
  { keys: 'J / K / L', description: 'Reverse shuttle / Pause / Forward shuttle', category: 'Transport & Work Area' },
  { keys: '← / →', description: 'Step 1 frame backward / forward (Shift for 1s)', category: 'Transport & Work Area' },
  { keys: '↑ / ↓', description: 'Jump to previous / next cut point or marker', category: 'Transport & Work Area' },
  { keys: 'I', description: 'Mark In point at playhead', category: 'Transport & Work Area' },
  { keys: 'O', description: 'Mark Out point at playhead', category: 'Transport & Work Area' },
  { keys: 'Alt + I / Alt + O', description: 'Clear In / Out point', category: 'Transport & Work Area' },
  { keys: 'Alt + X', description: 'Clear both In and Out points', category: 'Transport & Work Area' },
  { keys: ';', description: 'Lift work area (cuts In/Out range, leaves gap)', category: 'Transport & Work Area' },
  { keys: "'", description: 'Extract work area (cuts In/Out range, ripples timeline)', category: 'Transport & Work Area' },
  { keys: 'Ctrl / Cmd + L', description: 'Toggle continuous loop playback', category: 'Transport & Work Area' },
  { keys: 'Home / End', description: 'Jump to sequence start / end (or In / Out)', category: 'Transport & Work Area' },
  { keys: 'M', description: 'Add marker at playhead (or edit existing)', category: 'Transport & Work Area' },
  { keys: 'Shift + M / Alt + M', description: 'Jump to next / previous marker', category: 'Transport & Work Area' },
  { keys: 'Shift + Z', description: 'Fit sequence to timeline viewport', category: 'Transport & Work Area' },

  // Tools & Selection
  { keys: 'V', description: 'Selection tool (default pointer)', category: 'Tools & Selection' },
  { keys: 'C', description: 'Razor / Split blade tool', category: 'Tools & Selection' },
  { keys: 'B', description: 'Ripple Edit tool (trims edge & ripples timeline downstream)', category: 'Tools & Selection' },
  { keys: 'N', description: 'Rolling Edit tool (trims junction between clips, preserves duration)', category: 'Tools & Selection' },
  { keys: 'A / Shift + A', description: 'Select track forward / backward', category: 'Tools & Selection' },
  { keys: 'Ctrl / Cmd + Click', description: 'Toggle clip selection membership', category: 'Tools & Selection' },
  { keys: 'Esc', description: 'Clear selection & return to Select tool', category: 'Tools & Selection' },

  // Global & Windows
  { keys: 'Ctrl / Cmd + 1..5', description: 'Switch screens (Dashboard, Flow, Image, Video, Library)', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + 6', description: 'Open Preferences / Settings', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + 7', description: 'Open / Focus Voice Studio', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + 8', description: 'Focus Timeline Editor', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + N', description: 'Open Image Studio (new prompt batch)', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + B', description: 'Toggle Flow browser dock', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + Z', description: 'Undo edit', category: 'Global & Windows' },
  { keys: 'Ctrl / Cmd + Shift + Z', description: 'Redo edit', category: 'Global & Windows' },
  { keys: '? or Ctrl / Cmd + /', description: 'Open this keyboard shortcuts reference', category: 'Global & Windows' },
];

const CATEGORIES = [
  'All',
  'Timeline Editing',
  'Transport & Work Area',
  'Tools & Selection',
  'Global & Windows',
] as const;

/** Triggered by `?` or `Ctrl/Cmd+/` — see `useGlobalShortcuts.ts`. */
export function KeyboardShortcutsModal() {
  const activeModal = useModalStore((store) => store.activeModal);
  const closeModal = useModalStore((store) => store.closeModal);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const open = activeModal === MODAL_IDS.KEYBOARD_SHORTCUTS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SHORTCUTS.filter((s) => {
      const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        s.keys.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory]);

  return (
    <Modal
      open={open}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">keyboard</span>
          <span>Keyboard Shortcuts</span>
        </div>
      }
      subtitle="Industry-standard NLE and VideoStudio editing keybindings"
      size="lg"
      onClose={closeModal}
    >
      <div className="flex flex-col gap-3 select-none">
        {/* Search & Category Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-b border-hairline pb-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled text-[16px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search shortcuts (e.g. ripple, gain, playhead, Q, G)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-input border border-hairline bg-bg-app pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-primary"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={[
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all whitespace-nowrap',
                    active
                      ? 'bg-accent-ai text-text-on-accent'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary',
                  ].join(' ')}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="col-span-2 py-8 text-center text-xs text-text-disabled">
              No shortcuts found matching "{search}"
            </div>
          ) : (
            filtered.map((shortcut) => (
              <div
                key={shortcut.keys + shortcut.description}
                className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 bg-bg-app/50 p-2 text-xs transition-colors hover:bg-bg-hover"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text-primary">
                    {shortcut.description}
                  </span>
                  <span className="text-[10px] text-text-disabled">{shortcut.category}</span>
                </div>
                <kbd className="shrink-0 rounded-[var(--radius-button)] border border-hairline bg-bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-text-primary shadow-xs">
                  {shortcut.keys}
                </kbd>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
