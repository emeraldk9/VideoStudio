import { useEffect, useMemo, useState } from 'react';

import {
  ALL_NLE_PROFILES,
  formatKeyBinding,
  KEYMAP_CATEGORIES,
  matchesKeyBinding,
  TIMELINE_ACTIONS,
  type KeyBinding,
  type KeymapCategory,
  type NleProfileId,
  type TimelineActionId,
} from '@shared';

import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';
import { useKeymapStore } from '../model/keymapStore';

export interface KeymapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<KeymapCategory, { label: string; icon: string }> = {
  playback: { label: 'Playback & Shuttle', icon: 'play_circle' },
  tools: { label: 'Editorial Tools', icon: 'handyman' },
  editing: { label: 'Clip & Timeline Editing', icon: 'content_cut' },
  marking: { label: 'Markers & In/Out Points', icon: 'bookmark' },
  audio_fx: { label: 'Audio & Visual Effects', icon: 'graphic_eq' },
  view: { label: 'View & Navigation', icon: 'zoom_in' },
  history: { label: 'History & Document', icon: 'history' },
};

const PROFILE_OPTIONS: { value: NleProfileId; label: string }[] = [
  { value: 'videostudio', label: 'VideoStudio Default' },
  { value: 'premiere', label: 'Adobe Premiere Pro' },
  { value: 'resolve', label: 'DaVinci Resolve' },
  { value: 'finalcut', label: 'Apple Final Cut Pro' },
  { value: 'capcut', label: 'CapCut' },
];

export function KeymapModal({ isOpen, onClose }: KeymapModalProps) {
  const activeProfile = useKeymapStore((state) => state.activeProfile);
  const customOverrides = useKeymapStore((state) => state.customOverrides);
  const effectiveBindings = useKeymapStore((state) => state.effectiveBindings);
  const conflicts = useKeymapStore((state) => state.conflicts);
  const setProfile = useKeymapStore((state) => state.setProfile);
  const rebindAction = useKeymapStore((state) => state.rebindAction);
  const resetAction = useKeymapStore((state) => state.resetAction);
  const resetToProfileDefaults = useKeymapStore((state) => state.resetToProfileDefaults);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KeymapCategory | 'all'>('all');
  const [recordingActionId, setRecordingActionId] = useState<TimelineActionId | null>(null);

  // Keyboard capture for rebinding
  useEffect(() => {
    if (!recordingActionId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't capture bare modifier keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const newBinding: KeyBinding = {
        key: e.key,
        ctrlOrMeta: e.ctrlKey || e.metaKey || undefined,
        alt: e.altKey || undefined,
        shift: e.shiftKey || undefined,
      };

      rebindAction(recordingActionId, [newBinding]);
      setRecordingActionId(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingActionId, rebindAction]);

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TIMELINE_ACTIONS.filter((action) => {
      if (selectedCategory !== 'all' && action.category !== selectedCategory) return false;
      if (!q) return true;

      const matchesText =
        action.name.toLowerCase().includes(q) ||
        action.description.toLowerCase().includes(q) ||
        action.id.toLowerCase().includes(q);

      const bindings = effectiveBindings[action.id] ?? [];
      const matchesBinding = bindings.some((b) => formatKeyBinding(b).toLowerCase().includes(q));

      return matchesText || matchesBinding;
    });
  }, [search, selectedCategory, effectiveBindings]);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={() => {
        setRecordingActionId(null);
        onClose();
      }}
      title="Keyboard Shortcuts & NLE Profiles"
      size="xl"
    >
      <div className="flex flex-col gap-4 p-4 min-h-[460px] max-h-[75vh]">
        {/* Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Keymap Profile:
            </span>
            <div className="w-56">
              <Select
                value={activeProfile}
                onChange={(val) => setProfile(val as NleProfileId)}
                options={PROFILE_OPTIONS}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-disabled">
                search
              </span>
              <input
                type="text"
                placeholder="Search shortcuts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-60 rounded-md border border-hairline bg-bg-surface pl-8 pr-7 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai focus:outline-hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-disabled hover:text-text-primary"
                >
                  ✕
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={resetToProfileDefaults}
              title="Reset all bindings to active profile defaults"
            >
              Reset to Defaults
            </Button>
          </div>
        </div>

        {/* Conflicts Warning Banner */}
        {conflicts.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <span className="material-symbols-outlined text-base shrink-0">warning</span>
            <div className="flex-1">
              <div className="font-semibold">Keymap Shortcut Conflict Detected:</div>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    <span className="font-mono font-bold text-text-primary">{c.keyString}</span> is mapped
                    to both <span className="font-medium text-text-primary">{c.actionA}</span> and{' '}
                    <span className="font-medium text-text-primary">{c.actionB}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Main Content: Categories & Action List */}
        <div className="grid grid-cols-4 gap-4 flex-1 overflow-hidden">
          {/* Category Sidebar */}
          <div className="col-span-1 flex flex-col gap-1 border-r border-hairline pr-2 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-accent-ai text-white'
                  : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-sm">apps</span>
              All Categories
            </button>
            {KEYMAP_CATEGORIES.map((cat) => {
              const meta = CATEGORY_LABELS[cat];
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left font-medium transition-colors ${
                    isSelected
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Shortcuts Table */}
          <div className="col-span-3 flex flex-col overflow-y-auto pr-1">
            {recordingActionId && (
              <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-md border border-accent-ai bg-accent-ai/20 p-2.5 text-xs text-accent-ai animate-pulse">
                <span>
                  Press any key combination to rebind{' '}
                  <strong>{TIMELINE_ACTIONS.find((a) => a.id === recordingActionId)?.name}</strong>...
                </span>
                <Button size="sm" variant="secondary" onClick={() => setRecordingActionId(null)}>
                  Cancel
                </Button>
              </div>
            )}

            <div className="divide-y divide-hairline">
              {filteredActions.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-disabled">
                  No keyboard shortcuts match your search filter.
                </div>
              ) : (
                filteredActions.map((action) => {
                  const bindings = effectiveBindings[action.id] ?? [];
                  const isCustom = Boolean(customOverrides[action.id]);
                  const isRecording = recordingActionId === action.id;

                  return (
                    <div
                      key={action.id}
                      className="flex items-center justify-between py-2.5 px-2 hover:bg-bg-surface/50 rounded transition-colors group"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-text-primary truncate">
                            {action.name}
                          </span>
                          {isCustom && (
                            <span className="rounded bg-accent-ai/20 px-1.5 py-0.2 text-[10px] font-mono text-accent-ai">
                              custom
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-secondary truncate">{action.description}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Key badges */}
                        <div className="flex items-center gap-1.5">
                          {bindings.length === 0 ? (
                            <span className="text-[11px] italic text-text-disabled font-mono">None</span>
                          ) : (
                            bindings.map((b, idx) => (
                              <kbd
                                key={idx}
                                className="min-w-6 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-text-primary bg-bg-surface border border-hairline rounded shadow-xs"
                              >
                                {formatKeyBinding(b)}
                              </kbd>
                            ))
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <Button
                            size="sm"
                            variant={isRecording ? 'primary' : 'secondary'}
                            onClick={() =>
                              setRecordingActionId(isRecording ? null : action.id)
                            }
                          >
                            {isRecording ? 'Listening...' : 'Rebind'}
                          </Button>
                          {isCustom && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resetAction(action.id)}
                              title="Reset action to preset default"
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center border-t border-hairline px-4 py-2.5 bg-bg-app">
        <span className="text-[11px] text-text-secondary">
          Profile: <strong>{ALL_NLE_PROFILES[activeProfile]?.name}</strong> · Active Actions:{' '}
          {TIMELINE_ACTIONS.length}
        </span>
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
