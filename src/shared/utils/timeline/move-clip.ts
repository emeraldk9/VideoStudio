import {
  isOverlayTrack,
  isTextTrack,
  type SequenceClip,
  type SequenceTrack,
} from '../../types/sequence';

import { layoutTrack } from './layout';

/**
 * S165 — whether a clip may live on a track at all: the typed-lane rule, one
 * predicate shared by the move gate below, the panel's drop handler and its
 * mid-drag landing highlight, so what lights up, what a release does and what
 * a drop creates can never disagree.
 *
 * - Audio tracks carry audio clips; nothing else mixes.
 * - Text lanes (`role: 'text'`) carry text clips **only**, and text clips
 *   live **only** there — the S165 decoupling. (Pre-S165 text clips left on
 *   mixed lanes by migration 067 keep rendering; this rule governs where
 *   gestures may *put* clips, not what may exist.)
 * - Effect clips live **only** on overlay lanes (`role: 'overlay'`) — fix 2's
 *   symmetric rule, which also carries S157's magnetic refusal: an effect
 *   grades what is beneath it and has no place *in* the cut.
 * - The remaining picture kinds (still, video) go on any video lane that is
 *   not a text lane — the spine, plain video lanes, and overlays alike.
 */
export function clipAllowedOnTrack(
  clip: Pick<SequenceClip, 'sourceKind'>,
  track: Pick<SequenceTrack, 'kind' | 'role' | 'magnetic'>,
): boolean {
  if (track.kind === 'audio') return clip.sourceKind === 'audio';
  if (isTextTrack(track)) return clip.sourceKind === 'text';
  if (clip.sourceKind === 'audio' || clip.sourceKind === 'text') return false;
  if (clip.sourceKind === 'effect') return isOverlayTrack(track) && !track.magnetic;
  return true;
}

/**
 * Beta S157 — moving a clip onto another track, as a pure function.
 *
 * Extracted from the panel so the legality rules and the magnetic/free
 * asymmetry are testable without a pointer:
 *
 * - **Same kind only.** An audio clip has no meaning in the composite and a
 *   picture none in the mix; the caller's UI should never have offered the
 *   drop, and this refuses it anyway (`null`).
 * - **Never onto a locked track**, which refuses every gesture.
 * - **Onto a magnetic track the clip is spliced**, into the position its
 *   centre lands in — `orderIndex` takes a half-step and the caller's
 *   normalize pass renumbers, so no neighbour is hand-shifted here.
 *   `startFrames` becomes `null`: on a magnetic track a stored offset is a
 *   lie waiting to be believed.
 * - **Onto a free track it lands where the drag left it** — the source-track
 *   position plus the dragged delta, clamped to 0.
 *
 * Returns the full clip list with the one clip rewritten, or `null` when the
 * move is illegal (callers treat `null` as "nothing happened").
 */
export function moveClipToTrack(
  clips: SequenceClip[],
  clipId: string,
  sourceTrack: SequenceTrack,
  targetTrack: SequenceTrack,
  deltaFrames: number,
): SequenceClip[] | null {
  if (targetTrack.id === sourceTrack.id) return null;
  if (targetTrack.locked || targetTrack.kind !== sourceTrack.kind) return null;
  const clip = clips.find((item) => item.id === clipId);
  if (clip?.trackId !== sourceTrack.id) return null;
  // S165 — the typed-lane rule (which also carries S157's effect-on-magnetic
  // refusal): see `clipAllowedOnTrack`.
  if (!clipAllowedOnTrack(clip, targetTrack)) return null;
  const placed = layoutTrack(clips, sourceTrack).find((item) => item.clip.id === clipId);
  if (!placed) return null;
  const startFrames = Math.max(0, placed.startFrames + deltaFrames);

  if (targetTrack.magnetic) {
    const targetPlaced = layoutTrack(clips, targetTrack);
    const centre = startFrames + clip.durationFrames / 2;
    let index = targetPlaced.findIndex((item) => centre < item.endFrames);
    if (index < 0) index = targetPlaced.length;
    return clips.map((item) =>
      item.id === clipId
        ? { ...item, trackId: targetTrack.id, startFrames: null, orderIndex: index - 0.5 }
        : item,
    );
  }

  const count = clips.filter((item) => item.trackId === targetTrack.id).length;
  return clips.map((item) =>
    item.id === clipId
      ? { ...item, trackId: targetTrack.id, startFrames, orderIndex: count }
      : item,
  );
}
