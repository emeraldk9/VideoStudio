import { useCallback, useEffect, useMemo, useState } from 'react';

import { type ImportedMediaFile, type MediaSourceKind } from '@shared';

import { useProjectStore } from '../../../entities/project';
import { selectUnusedMedia, useImportedMediaStore, useSequenceStore } from '../../../entities/sequence';
import { useVeo3FlowStore } from '../../../entities/veo3flow/model/veo3flowStore';
import { useModalStore, type WatermarkBatchSource } from '../../../shared/model/modalStore';
import { selectTileKeys, useTileSelectionStore } from '../../../shared/model/tileSelectionStore';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { MenuButton } from '../../../shared/ui/MenuButton';
import { Modal } from '../../../shared/ui/Modal';
import { usePosterSheets } from '../lib/usePosterSheets';

import { MediaGrid, type MediaGridItem } from './MediaGrid';
import { PoolSelectionBar } from './PoolSelectionBar';

function pathOfKeyIn(media: readonly ImportedMediaFile[], key: string): string | null {
  if (!key.startsWith('imported-')) return null;
  const id = key.slice('imported-'.length);
  return media.find((file) => file.id === id)?.path ?? null;
}

function labelFor(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? 'Clip';
  return base.replace(/\.[^.]+$/, '');
}

export type MediaCategory = 'all' | 'story' | 'video' | 'audio' | 'still' | 'unused';

const MEDIA_CATEGORIES: { id: MediaCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'All Media', icon: 'perm_media' },
  { id: 'story', label: 'Story Shots', icon: 'auto_stories' },
  { id: 'video', label: 'Videos', icon: 'movie' },
  { id: 'audio', label: 'Audio', icon: 'graphic_eq' },
  { id: 'still', label: 'Photos', icon: 'image' },
  { id: 'unused', label: 'Unused', icon: 'pending_actions' },
];

export interface FilesPaneProps {
  sourceKind?: MediaSourceKind | 'all';
}

export function FilesPane({ sourceKind: initialKind = 'all' }: FilesPaneProps = {}) {
  const projectId = useProjectStore((state) => state.activeProjectId);
  const media = useImportedMediaStore((state) => state.media);
  const busy = useImportedMediaStore((state) => state.busy);
  const load = useImportedMediaStore((state) => state.load);
  const pick = useImportedMediaStore((state) => state.pick);
  const importDropped = useImportedMediaStore((state) => state.importDropped);
  const removeMedia = useImportedMediaStore((state) => state.remove);
  const openWatermarkBatchModal = useModalStore((store) => store.openWatermarkBatchModal);
  const pushToast = useToastStore((state) => state.pushToast);

  const document = useSequenceStore((state) => state.document);
  const projectData = useVeo3FlowStore((state) => state.projectData);
  const veo3flowBusy = useVeo3FlowStore((state) => state.busy);
  const isLiveSyncing = useVeo3FlowStore((state) => state.isLiveSyncing);
  const openStoryFolder = useVeo3FlowStore((state) => state.openFolder);
  const loadFolder = useVeo3FlowStore((state) => state.loadFolder);
  const syncWithActiveProject = useVeo3FlowStore((state) => state.syncWithActiveProject);
  const handleFolderUpdated = useVeo3FlowStore((state) => state.handleFolderUpdated);
  const unbindProjectFolder = useVeo3FlowStore((state) => state.unbindProjectFolder);
  const placeAllOnTimeline = useVeo3FlowStore((state) => state.placeAllOnTimeline);
  const placeSingleShot = useVeo3FlowStore((state) => state.placeSingleShot);
  const ingestToActiveProject = useVeo3FlowStore((state) => state.ingestToActiveProject);

  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>(
    initialKind as MediaCategory,
  );

  const scope = `imported:${selectedCategory}`;
  const selectedKeys = useTileSelectionStore((state) => selectTileKeys(state, scope));

  const [dropActive, setDropActive] = useState(false);
  const [blocked, setBlocked] = useState<ImportedMediaFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const unused = useMemo(() => selectUnusedMedia(media), [media]);
  const unusedSet = useMemo(() => new Set(unused.map((f) => f.path)), [unused]);

  const posterPaths = useMemo(
    () => media.filter((file) => file.kind === 'video').map((file) => file.path),
    [media],
  );
  const posterSheets = usePosterSheets(posterPaths);

  useEffect(() => {
    if (projectId) {
      void load(projectId);
    }
  }, [load, projectId]);

  // Re-hydrate story folder association across app lifecycles and sequence updates
  useEffect(() => {
    if (projectId) {
      void syncWithActiveProject(projectId, document?.sequence.storyProjectRoot);
    }
  }, [projectId, document?.sequence.storyProjectRoot, syncWithActiveProject]);

  // Subscribe to real-time folder updates from electron main process
  useEffect(() => {
    if (!window.api?.events?.onVeo3FlowFolderUpdated) return;
    const unsubscribe = window.api.events.onVeo3FlowFolderUpdated((updatedData) => {
      handleFolderUpdated(updatedData);
      if (projectId) {
        void load(projectId);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [handleFolderUpdated, load, projectId]);

  const requestRemove = useCallback(
    async (paths: string[]) => {
      if (!projectId) return;
      const result = await removeMedia(projectId, paths);
      if (result.blocked.length > 0) {
        setBlocked(result.blocked);
      } else if (result.removed.length > 0) {
        pushToast({
          variant: 'success',
          message: `Removed ${result.removed.length} item(s) from media bin`,
        });
      }
    },
    [projectId, removeMedia, pushToast],
  );

  const items: MediaGridItem[] = useMemo(() => {
    if (selectedCategory === 'story' && projectData) {
      return projectData.shots.flatMap((shot) => {
        const shotItems: MediaGridItem[] = [];

        if (shot.stillPath) {
          shotItems.push({
            key: `story-shot-still-${shot.shotId}`,
            label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Still)`,
            kind: 'still',
            filePath: shot.stillPath,
            posterPath: shot.stillPath,
            durationSeconds: shot.durationSeconds,
            badge: shot.isApproved ? 'Approved Still' : 'Still',
            storyShotId: shot.shotId,
            sourceTakeId: shot.stillTakeId || undefined,
            onCleanWatermark: () => {
              const item: WatermarkBatchSource = {
                kind: 'story-take',
                sourceId: shot.stillTakeId || shot.shotId,
                sourcePath: shot.stillPath || undefined,
                label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Still)`,
                mediaType: 'image',
              };
              openWatermarkBatchModal([item]);
            },
          });
        }

        if (shot.videoPath) {
          shotItems.push({
            key: `story-shot-video-${shot.shotId}`,
            label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Vid)`,
            kind: 'video',
            filePath: shot.videoPath,
            posterPath: null,
            durationSeconds: shot.durationSeconds,
            badge: 'Approved Video',
            storyShotId: shot.shotId,
            sourceTakeId: shot.videoTakeId || undefined,
            onCleanWatermark: () => {
              const item: WatermarkBatchSource = {
                kind: 'story-take',
                sourceId: shot.videoTakeId || shot.shotId,
                sourcePath: shot.videoPath || undefined,
                label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Vid)`,
                mediaType: 'video',
              };
              openWatermarkBatchModal([item]);
            },
          });
        }

        return shotItems;
      });
    }

    let matching = media;
    if (selectedCategory === 'video') matching = media.filter((file) => file.kind === 'video');
    else if (selectedCategory === 'audio') matching = media.filter((file) => file.kind === 'audio');
    else if (selectedCategory === 'still') matching = media.filter((file) => file.kind === 'still');
    else if (selectedCategory === 'unused') matching = media.filter((file) => unusedSet.has(file.path));

    return matching.map((file) => {
      const poster = posterSheets[file.path];
      return {
        key: `imported-${file.id}`,
        label: file.label || labelFor(file.path),
        kind: file.kind,
        filePath: file.path,
        posterPath: file.kind === 'still' ? file.path : null,
        durationSeconds: file.durationSec ?? undefined,
        posterSheet: poster ?? null,
        badge: unusedSet.has(file.path) ? null : 'In use',
        onRemove: () => void requestRemove([file.path]),
        onCleanWatermark: () => {
          const item: WatermarkBatchSource = {
            kind: 'sequence-media',
            sourceId: file.id,
            sourcePath: file.path,
            label: file.label || labelFor(file.path),
            mediaType: file.kind === 'video' ? 'video' : 'image',
          };
          openWatermarkBatchModal([item]);
        },
      };
    });
  }, [
    media,
    openWatermarkBatchModal,
    placeSingleShot,
    posterSheets,
    projectData,
    requestRemove,
    selectedCategory,
    unusedSet,
  ]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDropActive(false);
      const droppedPaths = Array.from(event.dataTransfer.files)
        .map((file) => {
          try {
            return window.api?.webUtils?.getPathForFile?.(file) || (file as any).path;
          } catch {
            return (file as any).path;
          }
        })
        .filter((p): p is string => Boolean(p));

      if (droppedPaths.length > 0 && projectId) {
        void importDropped(projectId, droppedPaths)
          .then(() => {
            pushToast({
              variant: 'success',
              message: `Imported ${droppedPaths.length} item(s) into media bin`,
            });
          })
          .catch((err) => {
            pushToast({
              variant: 'error',
              message: `Failed to import media: ${err?.message || 'Unknown error'}`,
            });
          });
      }
    },
    [importDropped, projectId, pushToast],
  );

  const handleImport = async () => {
    if (!projectId) return;
    try {
      const kindToPick: MediaSourceKind =
        selectedCategory === 'audio' ? 'audio' : selectedCategory === 'still' ? 'still' : 'video';
      await pick(projectId, kindToPick);
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full overflow-hidden"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Visual drag-over cue */}
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-bg-app/90 backdrop-blur-xs border-2 border-dashed border-accent-ai animate-fadeIn">
          <span className="material-symbols-outlined text-4xl text-accent-ai animate-bounce">
            file_download
          </span>
          <p className="text-sm font-semibold text-text-primary">
            Drop files or folders to import
          </p>
          <p className="text-xs text-text-secondary">
            Video, audio, images, or footage directories
          </p>
        </div>
      )}

      {/* Left Vertical Sub-Sidebar (CapCut style) */}
      <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        {/* Import Action Button */}
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !projectId}
          className="mb-1.5 flex w-full items-center justify-center gap-1.5"
          onClick={handleImport}
        >
          <span className={`material-symbols-outlined text-[16px] ${busy ? 'animate-spin' : ''}`}>
            {busy ? 'progress_activity' : 'add'}
          </span>
          <span>{busy ? 'Importing' : 'Import'}</span>
        </Button>

        {/* Open Story Folder Button */}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || veo3flowBusy}
          className="mb-2 flex w-full items-center justify-center gap-1.5"
          onClick={async () => {
            const res = await openStoryFolder(projectId ?? undefined);
            if (res && projectId) {
              void ingestToActiveProject(projectId);
              setSelectedCategory('story');
            }
          }}
          title="Open a story production folder to load approved stills, shot videos, and timeline durations"
        >
          <span className="material-symbols-outlined text-[16px] text-accent-ai">auto_stories</span>
          <span>Story Folder</span>
        </Button>

        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Project Media
        </span>

        {MEDIA_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          const count =
            cat.id === 'all'
              ? media.length
              : cat.id === 'story'
                ? (projectData?.shots.filter((s) => s.stillPath || s.videoPath).length ?? 0)
                : cat.id === 'unused'
                  ? unused.length
                  : media.filter((f) => f.kind === cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center justify-between rounded-button px-2 py-1.5 text-xs transition-all text-left ${
                active
                  ? 'bg-accent-ai/15 font-semibold text-accent-ai'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className={`material-symbols-outlined text-[16px] ${active ? 'text-accent-ai' : ''}`}
                >
                  {cat.icon}
                </span>
                <span className="truncate">{cat.label}</span>
              </div>
              <span className="font-mono text-[10px] text-text-disabled ml-1 shrink-0">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right Content Area */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-bg-canvas">
        {/* Story Project Banner (always visible across lifecycles when loaded) */}
        {projectData && (
          <div className="flex items-center justify-between gap-2 border-b border-hairline/80 bg-accent-ai/10 px-3 py-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-accent-ai text-[18px]">auto_stories</span>
              <div className="truncate">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {projectData.episodeTitle || projectData.title}
                  </span>
                  {isLiveSyncing && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 border border-emerald-500/30 shrink-0"
                      title="Live synced with story production folder on disk"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live Sync
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-secondary font-mono">
                  {projectData.totalApprovedStills} Stills · {projectData.totalApprovedVideos} Videos · {projectData.totalDurationSeconds}s exact cut
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Quick Refresh Icon */}
              <button
                type="button"
                onClick={() => {
                  if (projectData?.folderPath) {
                    void loadFolder(projectData.folderPath, projectId ?? undefined);
                  }
                }}
                disabled={busy || veo3flowBusy}
                className="flex h-7 w-7 items-center justify-center rounded-button text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                title="Force re-sync with story folder on disk"
              >
                <span className={`material-symbols-outlined text-[15px] ${veo3flowBusy ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>

              {/* Place Approved Stills */}
              <Button
                size="sm"
                variant="primary"
                disabled={busy || veo3flowBusy || projectData.totalApprovedStills === 0}
                onClick={() => void placeAllOnTimeline({ replace: true, mode: 'stills_only' })}
                className="flex items-center gap-1 font-semibold text-xs"
                title={`Place all ${projectData.totalApprovedStills} approved stills onto timeline spine with exact durations in 1 click`}
              >
                <span className="material-symbols-outlined text-[15px]">image</span>
                <span>Stills ({projectData.totalApprovedStills})</span>
              </Button>

              {/* Place Approved Videos */}
              <Button
                size="sm"
                variant={projectData.totalApprovedVideos > 0 ? 'secondary' : 'ghost'}
                disabled={busy || veo3flowBusy || projectData.totalApprovedVideos === 0}
                onClick={() => void placeAllOnTimeline({ replace: true, mode: 'videos_only' })}
                className="flex items-center gap-1 font-semibold text-xs"
                title={
                  projectData.totalApprovedVideos > 0
                    ? `Place all ${projectData.totalApprovedVideos} approved shot videos onto timeline in 1 click`
                    : 'No approved shot videos found yet'
                }
              >
                <span className="material-symbols-outlined text-[15px]">movie</span>
                <span>Videos ({projectData.totalApprovedVideos})</span>
              </Button>

              {/* Advanced Options Menu */}
              <MenuButton
                label="Options"
                icon="more_vert"
                align="right"
                title="More placement modes and folder settings"
                disabled={busy || veo3flowBusy}
                items={[
                  {
                    label: '⚡ Hybrid Cut (Video + Still Fallback)',
                    onSelect: () => void placeAllOnTimeline({ replace: true, mode: 'hybrid' }),
                    title: 'Places approved videos where available, and fills remaining shots with approved stills',
                  },
                  {
                    label: '⚡ Dual Tracks (V1 Stills + V2 Videos)',
                    onSelect: () => void placeAllOnTimeline({ replace: true, mode: 'dual_track' }),
                    title: 'Places all stills on V1 Spine and overlays videos on V2 in exact sync',
                  },
                  {
                    label: 'Append Stills to Timeline',
                    onSelect: () => void placeAllOnTimeline({ replace: false, mode: 'stills_only' }),
                    title: 'Appends stills without removing existing timeline clips',
                  },
                  {
                    label: 'Append Videos to Timeline',
                    disabled: projectData.totalApprovedVideos === 0,
                    onSelect: () => void placeAllOnTimeline({ replace: false, mode: 'videos_only' }),
                    title: 'Appends videos without removing existing timeline clips',
                  },
                  {
                    label: '↻ Re-sync Story Folder',
                    onSelect: () => {
                      if (projectData?.folderPath) {
                        void loadFolder(projectData.folderPath, projectId ?? undefined);
                      }
                    },
                    title: 'Force re-read story folder from disk',
                  },
                  {
                    label: 'Unlink Story Folder',
                    onSelect: () => {
                      if (projectId) {
                        void unbindProjectFolder(projectId);
                      }
                    },
                    title: 'Disconnect this story folder from the current project',
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* Header Search and Stats */}
        <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-secondary">
              {filteredItems.length} {selectedCategory === 'all' ? 'total' : selectedCategory} asset
              {filteredItems.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Filter input */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-text-disabled pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project media..."
              className="w-full rounded-md border border-hairline bg-bg-app py-1 pl-7 pr-7 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-text-disabled hover:text-text-primary"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {busy && (
          <div className="relative h-0.5 w-full overflow-hidden bg-hairline/20">
            <div className="absolute inset-y-0 w-1/3 animate-pulse bg-accent-ai" />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          {filteredItems.length === 0 && !searchQuery ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-hairline/60 bg-bg-surface/20 p-4 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-ai/10 text-accent-ai">
                <span className="material-symbols-outlined text-xl">
                  {selectedCategory === 'video'
                    ? 'movie'
                    : selectedCategory === 'audio'
                      ? 'graphic_eq'
                      : selectedCategory === 'still'
                        ? 'image'
                        : 'perm_media'}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-text-primary">
                No {selectedCategory} assets in project
              </h4>
              <p className="mt-1 max-w-[200px] text-[10px] text-text-secondary leading-relaxed">
                Click "Import" in the sidebar or drag files directly here.
              </p>
            </div>
          ) : (
            <MediaGrid
              items={filteredItems}
              scope={scope}
              empty={`No media matches "${searchQuery}".`}
            />
          )}
        </div>

        {selectedKeys.length > 0 && (
          <PoolSelectionBar scope={scope} items={items}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const paths = selectedKeys
                  .map((key) => pathOfKeyIn(media, key))
                  .filter((p): p is string => Boolean(p));
                if (paths.length > 0) void requestRemove(paths);
              }}
            >
              Remove ({selectedKeys.length})
            </Button>
          </PoolSelectionBar>
        )}
      </div>

      {blocked.length > 0 && (
        <Modal title="Assets in use" size="sm" open={true} onClose={() => setBlocked([])}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              {blocked.length} asset{blocked.length === 1 ? '' : 's'} are currently placed on the
              timeline. Removing them will also delete the timeline clips referencing these files.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <Button variant="secondary" onClick={() => setBlocked([])}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!projectId) return;
                  const paths = blocked.map((f) => f.path);
                  const result = await removeMedia(projectId, paths, true);
                  setBlocked([]);
                  if (result.removed.length > 0) {
                    pushToast({
                      variant: 'success',
                      message: `Removed ${result.removed.length} asset(s) and deleted ${result.deletedClipCount} timeline clip(s)`,
                    });
                  }
                }}
              >
                Delete from Timeline & Remove
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
