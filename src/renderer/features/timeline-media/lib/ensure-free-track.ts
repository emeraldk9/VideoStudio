import { isOverlayTrack, isTextTrack, type SequenceTrack } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';

/**
 * Beta S157 — the topmost free (non-spine) video track, created on demand:
 * a text or effect clip has to composite *over* the picture, so its home is a
 * free video track, and the first add mints one — the CapCut move that saves
 * the capability from being discovered through the track menu.
 *
 * Beta S165 — split into typed doors. S157's single pool made Text and
 * Effects share (and fight over) whatever free lane sat on top; now a text
 * clip's home is a **text lane** (`role: 'text'`, minted as "Text") and an
 * effect clip's home is an **overlay lane** (`role: 'overlay'`, minted as
 * "Overlay" — fix 2; plain role-null video lanes are PiP media lanes and are
 * no longer claimed), each found topmost-first among its own type. `name`
 * labels the minted track only; an existing lane of the right type is reused
 * whatever it is called.
 */

async function ensureLane(
  matches: (track: SequenceTrack, spineTrackId: string | null) => boolean,
  mint: () => Promise<void>,
): Promise<string | null> {
  const state = useSequenceStore.getState();
  if (!state.document) return null;
  const topmost = (document: NonNullable<typeof state.document>) =>
    document.tracks
      .filter((track) => matches(track, document.sequence.spineTrackId ?? null))
      .sort((a, b) => b.orderIndex - a.orderIndex)[0];
  const existing = topmost(state.document);
  if (existing) return existing.id;
  await mint();
  const next = useSequenceStore.getState().document;
  return next ? (topmost(next)?.id ?? null) : null;
}

/** The topmost text lane, minting "Text" when the sequence has none (S165). */
export function ensureTextTrack(): Promise<string | null> {
  return ensureLane(
    (track) => isTextTrack(track),
    () => useSequenceStore.getState().addTrack('video', 'Text', 'text'),
  );
}

/** The topmost overlay lane (`role: 'overlay'`), finding a collision-free lane for the span or minting `name`. */
export function ensureOverlayTrack(
  name: string,
  startFrames?: number,
  durationFrames?: number,
): Promise<string | null> {
  return ensureLane(
    (track) => {
      if (!isOverlayTrack(track)) return false;
      if (startFrames === undefined || durationFrames === undefined) return true;
      const state = useSequenceStore.getState();
      const clips = state.document?.clips ?? [];
      const trackClips = clips.filter((c) => c.trackId === track.id);
      const overlaps = trackClips.some((c) => {
        const start = c.startFrames ?? 0;
        const end = start + c.durationFrames;
        return startFrames < end && startFrames + durationFrames > start;
      });
      return !overlaps;
    },
    () => useSequenceStore.getState().addTrack('video', name, 'overlay'),
  );
}
