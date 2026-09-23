import { useMemo, type ReactNode } from 'react';

import { useSequenceStore } from '../../../entities/sequence';
import { useModalStore, type WatermarkBatchSource } from '../../../shared/model/modalStore';
import { selectTileKeys, useTileSelectionStore } from '../../../shared/model/tileSelectionStore';
import { Button } from '../../../shared/ui/Button';
import { addSourcesAtPlayhead, primaryTrackFor } from '../lib/add-to-timeline';

import { placeableSources, type MediaGridItem } from './MediaGrid';

/**
 * Beta S200 / S10 — the pool footer's selection cluster, shared by every source.
 *
 * "N selected" · **Add N at playhead** · Clean Watermark (N) · pane-specific verbs (`children` —
 * the Imported source's Remove N) · Clear. Rendered only while something is
 * selected under this pane's scope in a pinned footer container.
 */
export function PoolSelectionBar({
  scope,
  items,
  children,
}: {
  scope: string;
  /** The grid's items, in grid order — the selection is resolved against these. */
  items: readonly MediaGridItem[];
  children?: ReactNode;
}) {
  const selectedKeys = useTileSelectionStore((state) => selectTileKeys(state, scope));
  const setSelection = useTileSelectionStore((state) => state.setSelection);
  const document = useSequenceStore((state) => state.document);
  const openWatermarkBatchModal = useModalStore((store) => store.openWatermarkBatchModal);

  const selected = useMemo(() => {
    const keys = new Set(selectedKeys);
    return items.filter((item) => keys.has(item.key));
  }, [items, selectedKeys]);
  const sources = useMemo(() => placeableSources(selected), [selected]);
  const target = document && sources.length > 0 ? primaryTrackFor(sources[0].kind, document) : null;

  const cleanable = useMemo(() => {
    return selected.filter((item) => (item.kind === 'still' || item.kind === 'video') && item.filePath);
  }, [selected]);

  if (selected.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-hairline/80 bg-bg-sidebar/90 px-3 py-2 shrink-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-text-primary mr-1">
          {selected.length} selected
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={target === null}
          title={
            target === null
              ? sources.length === 0
                ? 'Nothing in the selection can be placed'
                : 'No lane to add to — the target lane is missing or locked'
              : `Add to ${target.name} at the playhead`
          }
          onClick={() => addSourcesAtPlayhead(sources)}
        >
          Add {sources.length} at playhead
        </Button>
        {cleanable.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const batchSources: WatermarkBatchSource[] = cleanable.map((item) => ({
                kind: item.storyShotId ? 'story-take' : 'sequence-media',
                sourceId: item.sourceTakeId || item.key.replace(/^imported-/, ''),
                sourcePath: item.filePath ?? undefined,
                label: item.label,
                mediaType: item.kind === 'video' ? 'video' : 'image',
              }));
              openWatermarkBatchModal(batchSources);
            }}
            title="Batch remove watermark from selected media files"
            className="flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px] text-accent-ai">auto_fix_high</span>
            <span>Clean Watermark ({cleanable.length})</span>
          </Button>
        )}
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setSelection(scope, [])}>
        Clear
      </Button>
    </div>
  );
}

