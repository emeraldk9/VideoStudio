import { useState, useEffect } from 'react';
import type { MarkerColor, SequenceMarker } from '@shared';
import { formatTimecode } from '@shared';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { Switch } from '../../../shared/ui/Switch';

export interface MarkerModalProps {
  marker: SequenceMarker | null;
  fps: number;
  open: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; notes: string; color: MarkerColor; locked: boolean }) => void;
  onDelete: (markerId: string) => void;
}

const COLOR_OPTIONS: { id: MarkerColor; label: string; bgClass: string; textClass: string; ringClass: string }[] = [
  { id: 'ai', label: 'Indigo (AI)', bgClass: 'bg-accent-ai', textClass: 'text-accent-ai', ringClass: 'ring-accent-ai' },
  { id: 'success', label: 'Green (Ready)', bgClass: 'bg-accent-success', textClass: 'text-accent-success', ringClass: 'ring-accent-success' },
  { id: 'warning', label: 'Amber (Review)', bgClass: 'bg-accent-warning', textClass: 'text-accent-warning', ringClass: 'ring-accent-warning' },
  { id: 'info', label: 'Sky (Info)', bgClass: 'bg-accent-info', textClass: 'text-accent-info', ringClass: 'ring-accent-info' },
];

export function MarkerModal({ marker, fps, open, onClose, onSave, onDelete }: MarkerModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<MarkerColor>('ai');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (marker) {
      setName(marker.name ?? '');
      setNotes(marker.notes ?? '');
      setColor(marker.color ?? 'ai');
      setLocked(Boolean(marker.locked));
    }
  }, [marker]);

  if (!marker) return null;

  const handleSave = () => {
    onSave({
      name: name.trim(),
      notes: notes.trim(),
      color,
      locked,
    });
    onClose();
  };

  const handleDelete = () => {
    if (locked) return;
    onDelete(marker.id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">
            {locked ? 'lock' : 'bookmark'}
          </span>
          <span>Edit Marker</span>
        </div>
      }
      subtitle={`Frame ${marker.frame} · ${formatTimecode(marker.frame, fps)}`}
      size="md"
    >
      <div className="flex flex-col gap-4 text-sm text-text-primary">
        {/* Marker Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="marker-name-input" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Marker Name
          </label>
          <input
            id="marker-name-input"
            type="text"
            value={name}
            maxLength={120}
            placeholder="e.g., Intro hook, B-roll cue, Voiceover cut"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            className="w-full rounded-[var(--radius-input)] border border-hairline bg-bg-app px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-text-secondary transition-colors"
          />
        </div>

        {/* Color Palette Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Color Tag</span>
          <div className="flex items-center gap-3 pt-1">
            {COLOR_OPTIONS.map((opt) => {
              const isSelected = color === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  onClick={() => setColor(opt.id)}
                  className={`group relative flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 ${opt.bgClass} ${
                    isSelected ? 'ring-2 ring-offset-2 ring-offset-bg-app ' + opt.ringClass : 'opacity-70 hover:opacity-100 hover:scale-110'
                  }`}
                >
                  {isSelected && (
                    <span className="material-symbols-outlined text-[16px] text-white">
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes (Multi-line) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="marker-notes-textarea" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Notes & Instructions
            </label>
            <span className="text-[11px] text-text-disabled">
              {notes.length} / 4000
            </span>
          </div>
          <textarea
            id="marker-notes-textarea"
            rows={4}
            maxLength={4000}
            value={notes}
            placeholder="Add detailed production notes, script cues, edit notes, or timestamp notes..."
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            className="w-full resize-none rounded-[var(--radius-input)] border border-hairline bg-bg-app px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-text-secondary transition-colors leading-relaxed"
          />
          <span className="text-[11px] text-text-disabled">
            Tip: Press <kbd className="font-mono text-[10px] bg-bg-hover px-1 rounded">Ctrl+Enter</kbd> to save.
          </span>
        </div>

        {/* Lock Sync Point Toggle */}
        <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-hairline bg-bg-surface p-3">
          <div className="flex flex-col gap-0.5 pr-4">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-text-secondary">
                {locked ? 'lock' : 'lock_open'}
              </span>
              Lock Sync Point
            </span>
            <span className="text-[11px] text-text-secondary leading-normal">
              Protect this marker from accidental deletion or repositioning.
            </span>
          </div>
          <Switch
            checked={locked}
            onChange={() => setLocked(!locked)}
            label="Lock marker"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline mt-1">
          <Button
            variant="danger"
            size="sm"
            disabled={locked}
            title={locked ? 'Unlock marker to delete' : 'Delete this marker'}
            onClick={handleDelete}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Delete
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
