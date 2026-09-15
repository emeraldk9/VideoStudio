import { useMemo, type ReactNode } from 'react';

import { useSequenceStore } from '../../../entities/sequence';
import { selectTileKeys, useTileSelectionStore } from '../../../shared/model/tileSelectionStore';
import { Button } from '../../../shared/ui/Button';
import { addSourcesAtPlayhead, primaryTrackFor } from '../lib/add-to-timeline';

import { placeableSources, type MediaGridItem } from './MediaGrid';

/**
 * Beta S200 — the pool footer's selection cluster, shared by every source.
 *
 * "N selected" · **Add N at playhead** · pane-specific verbs (`children` —
 * the Imported source's Remove N) · Clear. Rendered only while something is
 * selected under this pane's scope, so the footer stays quiet otherwise and
 * the panes' own idle controls (Add files…, Remove unused) keep their place.
 *
 * "Add N at playhead" is the keyboard-reachable multi-add — the footer button
 * CapCut puts on a selection — and runs the same `addSourcesAtPlayhead` the
 * tile's hover `+` runs, on the selection in **grid order** (never click
 * order), so the button and a drop at the playhead's frame produce the same
 * cut. Disabled, with the reason in its tooltip, when the kind has no lane to
 * land on.
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

  const selected = useMemo(() => {
    const keys = new Set(selectedKeys);
    return items.filter((item) => keys.has(item.key));
  }, [items, selectedKeys]);
  const sources = useMemo(() => placeableSources(selected), [selected]);
  const target = document && sources.length > 0 ? primaryTrackFor(sources[0].kind, document) : null;

  if (selected.length === 0) return null;

  return (
    <>
      <span className="text-xs text-text-secondary">
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
      {children}
      <Button variant="ghost" size="sm" onClick={() => setSelection(scope, [])}>
        Clear
      </Button>
    </>
  );
}
