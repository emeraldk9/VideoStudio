import {
  encodeTimelineDrag,
  isTextTrack,
  narrationTrackOf,
  parseTimelineDrag,
  placeSourcesAt,
  spineTrackOf,
  type SequenceDocument,
  type SequenceTrack,
  type TimelineDragSource,
} from '@shared';

import {
  correctDroppedDurations,
  currentPlayheadFrame,
  useSequenceStore,
} from '../../../entities/sequence';

/**
 * Beta S200 — the non-drag route onto the timeline: the tile's hover `+` and
 * the footer's "Add N at playhead" (CapCut's idiom; Premiere's Insert).
 *
 * The lane is chosen by the item's kind, never asked: stills and videos go to
 * the **spine** (the cut — the storyboard's own track, by the sequence's
 * explicit binding), audio to the **narration-role** track (the same target
 * the storyboard pane's "Place lines" uses, and the render's duck key). A
 * user wanting anything else drags — that is what the pointer-frame drop is
 * for. `null` when the sequence has no such lane, or it is locked; the
 * button disables on the same answer, so it never offers what it cannot do.
 *
 * Placement is `placeSourcesAt` at the playhead — the same pure function the
 * drop runs, so an "Add" and a drop at the playhead's frame produce the same
 * document — followed by the same batched probe correction and the same
 * "select what you just placed".
 */
export function primaryTrackFor(
  kind: TimelineDragSource['kind'],
  document: SequenceDocument,
): SequenceTrack | null {
  let track: SequenceTrack | null;
  if (kind === 'audio') {
    track = narrationTrackOf(document.tracks);
  } else if (kind === 'still' || kind === 'video') {
    track =
      spineTrackOf(document) ??
      document.tracks
        .filter((item) => item.kind === 'video' && !isTextTrack(item))
        .sort((a, b) => a.orderIndex - b.orderIndex)[0] ??
      null;
  } else {
    // Text and effect cards have their own typed doors (`ensure-free-track`).
    return null;
  }
  return track && !track.locked ? track : null;
}

/** Places `sources` at the playhead on their kind's primary lane. Returns how many landed. */
export function addSourcesAtPlayhead(sources: readonly TimelineDragSource[]): number {
  const state = useSequenceStore.getState();
  const document = state.document;
  if (!document || sources.length === 0) return 0;
  const items = parseTimelineDrag(encodeTimelineDrag(sources));
  if (items.length === 0) return 0;
  const track = primaryTrackFor(items[0].kind, document);
  if (!track) return 0;

  const result = placeSourcesAt(
    document.clips,
    track,
    items,
    currentPlayheadFrame(),
    document.sequence.fps,
    document.sequence.id,
    () => crypto.randomUUID(),
  );
  if (result.placedIds.length === 0) return 0;
  state.commitClips(result.clips);
  state.select(result.placedIds);
  correctDroppedDurations(result.placed, document.sequence.id);
  return result.placedIds.length;
}
