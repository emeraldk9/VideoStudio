import { useState } from 'react';

import type { TrackFolder } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { IconButton } from '../../../shared/ui/IconButton';
import { LANE_LABEL_WIDTH_PX } from './TimelineLane';

export interface TimelineTrackFolderRowProps {
  folder: TrackFolder;
  childTrackCount: number;
}

export function TimelineTrackFolderRow({ folder, childTrackCount }: TimelineTrackFolderRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(folder.name);

  const toggleFolderCollapsed = useSequenceStore((state) => state.toggleFolderCollapsed);
  const toggleFolderMuted = useSequenceStore((state) => state.toggleFolderMuted);
  const toggleFolderLocked = useSequenceStore((state) => state.toggleFolderLocked);
  const toggleFolderVisible = useSequenceStore((state) => state.toggleFolderVisible);
  const updateTrackFolder = useSequenceStore((state) => state.updateTrackFolder);
  const deleteTrackFolder = useSequenceStore((state) => state.deleteTrackFolder);

  const handleRenameCommit = () => {
    setRenaming(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      void updateTrackFolder(folder.id, { name: trimmed });
    } else {
      setNameValue(folder.name);
    }
  };

  const folderColor =
    folder.color || (folder.kind === 'video' ? '#06b6d4' : '#10b981');

  return (
    <div
      className="group/folder relative flex items-stretch border-y border-hairline/80 bg-bg-surface/40 select-none transition-colors"
      style={{ minHeight: 30 }}
    >
      {/* Left Header */}
      <div
        className="sticky left-0 z-[26] flex shrink-0 items-center gap-1 overflow-hidden bg-bg-canvas px-2 border-r border-hairline shadow-xs"
        style={{ width: LANE_LABEL_WIDTH_PX, height: 30 }}
      >
        {/* Collapse / Expand Chevron */}
        <button
          type="button"
          onClick={() => void toggleFolderCollapsed(folder.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
        >
          <span className="material-symbols-outlined text-[18px]">
            {folder.collapsed ? 'chevron_right' : 'expand_more'}
          </span>
        </button>

        {/* Folder Icon */}
        <span
          className="material-symbols-outlined text-[17px] shrink-0"
          style={{ color: folderColor }}
        >
          {folder.collapsed ? 'folder' : 'folder_open'}
        </span>

        {/* Folder Name */}
        {renaming ? (
          <input
            type="text"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameCommit();
              if (e.key === 'Escape') {
                setRenaming(false);
                setNameValue(folder.name);
              }
            }}
            className="w-full min-w-0 rounded border border-hairline bg-bg-app px-1 text-[11px] font-semibold text-text-primary outline-hidden focus:border-accent-ai"
          />
        ) : (
          <span
            onDoubleClick={() => setRenaming(true)}
            className="flex-1 min-w-0 truncate text-[11px] font-semibold text-text-primary cursor-pointer hover:text-accent-ai transition-colors"
            title={`${folder.name} (${childTrackCount} tracks) — double-click to rename`}
          >
            {folder.name}
          </span>
        )}

        {/* Bulk Controls */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover/folder:opacity-100 transition-opacity">
          {folder.kind === 'video' && (
            <IconButton
              size="sm"
              icon={folder.visible ? 'visibility' : 'visibility_off'}
              label={folder.visible ? 'Hide all tracks in folder' : 'Show all tracks in folder'}
              filled={!folder.visible}
              onClick={() => void toggleFolderVisible(folder.id)}
            />
          )}

          <IconButton
            size="sm"
            icon={folder.muted ? 'volume_off' : 'volume_up'}
            label={folder.muted ? 'Unmute folder' : 'Mute all tracks in folder'}
            filled={folder.muted}
            onClick={() => void toggleFolderMuted(folder.id)}
          />

          <IconButton
            size="sm"
            icon={folder.locked ? 'lock' : 'lock_open'}
            label={folder.locked ? 'Unlock folder' : 'Lock all tracks in folder'}
            filled={folder.locked}
            onClick={() => void toggleFolderLocked(folder.id)}
          />

          <IconButton
            size="sm"
            icon="delete"
            label="Delete folder"
            onClick={() => {
              if (window.confirm(`Delete folder "${folder.name}"? Tracks inside will be kept.`)) {
                void deleteTrackFolder(folder.id);
              }
            }}
          />
        </div>
      </div>

      {/* Right Trough Bar */}
      <div
        onDoubleClick={() => void toggleFolderCollapsed(folder.id)}
        className="flex-1 flex items-center px-4 cursor-pointer relative overflow-hidden"
        style={{
          background: `linear-gradient(90deg, ${folderColor}15 0%, transparent 60%)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: folderColor }}
          />
          <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
            Group ({childTrackCount} {childTrackCount === 1 ? 'track' : 'tracks'})
            {folder.collapsed ? ' · Collapsed' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
