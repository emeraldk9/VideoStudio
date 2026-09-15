import { useCallback, useEffect, useMemo, useState } from 'react';

import { type ImportedMediaFile, type MediaSourceKind } from '@shared';

import { useProjectStore } from '../../../entities/project';
import { selectUnusedMedia, useImportedMediaStore } from '../../../entities/sequence';
import { useModalStore, type WatermarkBatchSource } from '../../../shared/model/modalStore';
import { selectTileKeys, useTileSelectionStore } from '../../../shared/model/tileSelectionStore';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
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

export interface FilesPaneProps {
  sourceKind: MediaSourceKind;
}

export function FilesPane({ sourceKind }: FilesPaneProps) {
  const projectId = useProjectStore((state) => state.activeProjectId);
  const media = useImportedMediaStore((state) => state.media);
  const busy = useImportedMediaStore((state) => state.busy);
  const load = useImportedMediaStore((state) => state.load);
  const pick = useImportedMediaStore((state) => state.pick);
  const importDropped = useImportedMediaStore((state) => state.importDropped);
  const removeMedia = useImportedMediaStore((state) => state.remove);
  const openWatermarkBatchModal = useModalStore((store) => store.openWatermarkBatchModal);
  const pushToast = useToastStore((state) => state.pushToast);

  const scope = `imported:${sourceKind}`;
  const selectedKeys = useTileSelectionStore((state) => selectTileKeys(state, scope));

  const [dropActive, setDropActive] = useState(false);
  const [blocked, setBlocked] = useState<ImportedMediaFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const unused = useMemo(() => selectUnusedMedia(media), [media]);
  const unusedSet = useMemo(() => new Set(unused.map((f) => f.path)), [unused]);

  const posterPaths = useMemo(
    () =>
      sourceKind === 'video'
        ? media.filter((file) => file.kind === 'video').map((file) => file.path)
        : [],
    [media, sourceKind],
  );
  const posterSheets = usePosterSheets(posterPaths);

  useEffect(() => {
    if (projectId) {
      void load(projectId);
    }
  }, [load, projectId]);

  const requestRemove = useCallback(
    async (paths: string[]) => {
      if (!projectId) return;
      const result = await removeMedia(projectId, paths);
      if (result.blocked.length > 0) {
        setBlocked(result.blocked);
      } else if (result.removed.length > 0) {
        pushToast({
          variant: 'success',
          message: `Removed ${result.removed.length} asset(s) from media bin`,
        });
      }
    },
    [projectId, removeMedia, pushToast],
  );

  const items: MediaGridItem[] = useMemo(() => {
    const matching = media.filter((file) => file.kind === sourceKind);
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
  }, [media, openWatermarkBatchModal, posterSheets, requestRemove, sourceKind, unusedSet]);

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
        void importDropped(projectId, droppedPaths).then(() => {
          pushToast({
            variant: 'success',
            message: `Imported ${droppedPaths.length} item(s) into media bin`,
          });
        });
      }
    },
    [importDropped, projectId, pushToast],
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
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
      <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {filteredItems.length} {sourceKind} asset{filteredItems.length === 1 ? '' : 's'}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !projectId}
            className="flex items-center gap-1"
            onClick={() => {
              if (projectId) void pick(projectId, sourceKind);
            }}
          >
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            <span>Import</span>
          </Button>
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
            placeholder={`Filter ${sourceKind}s...`}
            className="w-full rounded-md border border-hairline bg-bg-app py-1 pl-7 pr-7 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai/50 focus:outline-none transition-colors"
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

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <MediaGrid
          items={filteredItems}
          scope={scope}
          empty={
            searchQuery
              ? `No ${sourceKind} assets match "${searchQuery}".`
              : `No ${sourceKind} assets in media bin. Drag and drop files here or click Import.`
          }
        />
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

      {blocked.length > 0 && (
        <Modal
          title="Assets in use"
          open={true}
          onClose={() => setBlocked([])}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              {blocked.length} asset{blocked.length === 1 ? '' : 's'} are currently placed on the timeline.
              Removing them will also delete the timeline clips referencing these files.
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
