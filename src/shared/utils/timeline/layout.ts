import type { SequenceClip, SequenceTrack } from '../../types/sequence';

/**
 * Beta S145 — where each clip sits, derived rather than stored.
 * Beta S154 — generalized from three fixed lanes to dynamic tracks.
 *
 * **A magnetic track derives; a free track stores.** A clip on a magnetic
 * track has no `startFrames`: its start is the cumulative duration of
 * everything before it. Deriving it on read (instead of persisting and
 * recomputing after every edit) keeps one source of truth and makes a gap
 * structurally impossible — there is no field in which a gap could be
 * expressed, so an accidental black frame cannot happen. That was V1's
 * identity in S145; it is a per-track *property* now, and the storyboard
 * spine keeps it.
 *
 * Beta S226 — **a transition never changes a clip's start or the sequence's
 * length.** S154's arithmetic subtracted the transition's frames from the
 * joint, which shortened the picture by every dissolve while the audio
 * tracks (absolute offsets, non-magnetic by migration 062's CHECK) stayed
 * put — a cumulative picture/narration desync that only appeared in the
 * export. Now a transition renders *inside* the incoming clip's first
 * {@link boundaryTransitionFrames} frames, with the outgoing image held one
 * extra beat underneath (`tpad stop_mode=clone` in the render), so the sum
 * of durations is the sequence length, always.
 *
 * Free tracks (every audio track, and every video track above the spine)
 * carry an explicit offset, because narration has to land at a *time* and an
 * overlay title at 00:12 has no meaning "after whatever precedes it".
 */

export interface PlacedClip {
  clip: SequenceClip;
  startFrames: number;
  endFrames: number;
}

/** One track and its resolved clips — the unit the compositor stacks in z-order. */
export interface TrackLayout {
  track: SequenceTrack;
  placed: PlacedClip[];
}

/**
 * Beta S226 — how many frames of the *incoming* clip a boundary's transition
 * occupies. Zero for the first clip (there is nothing before it to dissolve
 * from) and for a cut; otherwise the authored `transitionFrames`, clamped to
 * the incoming clip's own length — the transition lives entirely inside it,
 * so the outgoing clip's length no longer bounds anything (the render clones
 * its last frame for the duration instead).
 *
 * One function on purpose: the render's `join()` and the preview's boundary
 * pass must agree about this number, and both import it from here.
 */
export function boundaryTransitionFrames(
  clip: SequenceClip,
  previous: SequenceClip | undefined,
): number {
  if (!previous || clip.transitionIn === 'cut') return 0;
  const requested = Math.max(0, Math.round(clip.transitionFrames));
  return Math.min(requested, clip.durationFrames);
}

/**
 * Beta S227 — what one junction actually plays, with both sides heard.
 *
 * Precedence: the incoming clip's `transitionIn` if non-cut, else the
 * outgoing clip's `transitionOut` if non-cut, else a cut. Both non-cut is a
 * contradiction the preflight names (`conflicting_boundary_transition`);
 * here the incoming side simply wins, because "how do I arrive" is the claim
 * the S154 model has always made and every existing document was authored
 * against it.
 *
 * Frames are clamped to the **incoming** clip either way — under S226's
 * invariant a boundary transition renders inside the incoming clip's head,
 * whichever side asked for it. One function on purpose: the render's
 * `join()` and the preview's boundary pass both import this, so they cannot
 * disagree about what a junction shows.
 */
export interface BoundaryTransition {
  type: SequenceClip['transitionIn'];
  frames: number;
}

/**
 * Beta S230 — the split edit's audio window, as pure arithmetic.
 *
 * A J cut (negative offset) extends the audio's **head**: it starts earlier
 * on the timeline and pulls earlier source material, clamped twice — the
 * source has nothing before 0, and the timeline has nothing before 0. An L
 * cut (positive) extends the **tail** past the picture cut; `atrim` past the
 * source's end yields silence harmlessly, so no clamp is needed there. The
 * clamped lead is returned so the preflight can name it rather than let the
 * render silently shorten an authored J.
 */
export interface SplitEditWindow {
  /** Timeline start of the audio, seconds. */
  offsetSeconds: number;
  /** Read position into the source, seconds. */
  sourceInSeconds: number;
  /** Length of the audio window, seconds. */
  durationSeconds: number;
}

export function applySplitEditOffset(
  window: SplitEditWindow,
  audioOffsetFrames: number,
  fps: number,
): SplitEditWindow & { clippedLeadSeconds: number } {
  const offset = Math.round(audioOffsetFrames) / Math.max(1, fps);
  if (offset === 0) return { ...window, clippedLeadSeconds: 0 };
  if (offset > 0) {
    return { ...window, durationSeconds: window.durationSeconds + offset, clippedLeadSeconds: 0 };
  }
  const wanted = -offset;
  const lead = Math.min(wanted, window.sourceInSeconds, window.offsetSeconds);
  return {
    offsetSeconds: window.offsetSeconds - lead,
    sourceInSeconds: window.sourceInSeconds - lead,
    durationSeconds: window.durationSeconds + lead,
    clippedLeadSeconds: wanted - lead,
  };
}

export function effectiveBoundaryTransition(
  incoming: SequenceClip,
  outgoing: SequenceClip | undefined,
): BoundaryTransition {
  if (!outgoing) return { type: 'cut', frames: 0 };
  const inFrames = boundaryTransitionFrames(incoming, outgoing);
  if (incoming.transitionIn !== 'cut' && inFrames > 0) {
    return { type: incoming.transitionIn, frames: inFrames };
  }
  const outType = outgoing.transitionOut ?? 'cut';
  const outRequested = Math.max(0, Math.round(outgoing.transitionOutFrames ?? 0));
  if (outType !== 'cut' && outRequested > 0) {
    return { type: outType, frames: Math.min(outRequested, incoming.durationFrames) };
  }
  return { type: 'cut', frames: 0 };
}

/**
 * Clips of one track in position order, each with its resolved start and end.
 *
 * `layoutTrack` ignores a stored `startFrames` on a magnetic track regardless
 * of what the row holds — one of the three guards (with the repository's
 * write normalization and the zod refinement) against a clip whose position
 * two code paths could disagree about.
 */
export function layoutTrack(clips: SequenceClip[], track: SequenceTrack): PlacedClip[] {
  const trackClips = clips
    .filter((clip) => clip.trackId === track.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (!track.magnetic) {
    return trackClips.map((clip) => {
      const startFrames = Math.max(0, Math.round(clip.startFrames ?? 0));
      return { clip, startFrames, endFrames: startFrames + clip.durationFrames };
    });
  }

  // S226 — plain accumulation. A transition renders inside the incoming
  // clip's frames and moves nothing; see boundaryTransitionFrames above.
  const placed: PlacedClip[] = [];
  let cursor = 0;
  for (const clip of trackClips) {
    placed.push({ clip, startFrames: cursor, endFrames: cursor + clip.durationFrames });
    cursor += clip.durationFrames;
  }
  return placed;
}

/**
 * Every track laid out at once, in `(kind, orderIndex)` order.
 *
 * **An array, not a Record** — the phase-2 compositor consumes this bottom-up
 * in z-order, and a Record loses the order the overlay stack depends on.
 */
export function layoutSequence(tracks: SequenceTrack[], clips: SequenceClip[]): TrackLayout[] {
  return tracks
    .slice()
    .sort((a, b) => (a.kind === b.kind ? a.orderIndex - b.orderIndex : a.kind === 'video' ? -1 : 1))
    .map((track) => ({ track, placed: layoutTrack(clips, track) }));
}

/**
 * The sequence's length: the furthest end across **all video tracks**.
 *
 * S145 took it from V1 alone; with N video tracks the same rule widens to the
 * kind — an overlay title running past the spine must extend the render, or it
 * would be silently cut (the same silent-truncation class S151 F7 exists to
 * prevent). Audio still never extends it: audio past the last picture is
 * trailing sound over nothing, and the preflight reports the overrun instead.
 */
export function sequenceDurationFrames(tracks: SequenceTrack[], clips: SequenceClip[]): number {
  return tracks
    .filter((track) => track.kind === 'video')
    .reduce(
      (max, track) =>
        layoutTrack(clips, track).reduce((trackMax, placed) => Math.max(trackMax, placed.endFrames), max),
      0,
    );
}

/**
 * S157 (owner item 12) — how far the *transport* runs: the furthest end
 * across every track, audio included.
 *
 * The render's length stays {@link sequenceDurationFrames} (audio never
 * extends the picture; the preflight names the overrun) — but playback is not
 * a render. A music-only sequence must play to the end of its music, not
 * refuse to move because no picture exists yet.
 */
export function transportDurationFrames(tracks: SequenceTrack[], clips: SequenceClip[]): number {
  return Math.max(sequenceDurationFrames(tracks, clips), audioDurationFrames(tracks, clips));
}

/** How far the audio tracks run, for the preflight's overrun check. */
export function audioDurationFrames(tracks: SequenceTrack[], clips: SequenceClip[]): number {
  return tracks
    .filter((track) => track.kind === 'audio')
    .reduce(
      (max, track) =>
        layoutTrack(clips, track).reduce((trackMax, placed) => Math.max(trackMax, placed.endFrames), max),
      0,
    );
}

/** Which clip the playhead is inside, for the preview's switcher. `null` past the end. */
export function clipAtFrame(placed: PlacedClip[], frame: number): PlacedClip | null {
  return placed.find((item) => frame >= item.startFrames && frame < item.endFrames) ?? null;
}

/**
 * S154 phase 2 — everything under the playhead, bottom-to-top, one entry per
 * video track that has a clip there. What the preview stacks and the shape
 * the compositor mirrors: index 0 paints first, the last entry paints on top.
 */
export function clipsAtFrame(
  layout: TrackLayout[],
  frame: number,
): { track: SequenceTrack; placed: PlacedClip }[] {
  const stack: { track: SequenceTrack; placed: PlacedClip }[] = [];
  for (const entry of layout) {
    if (entry.track.kind !== 'video') continue;
    const placed = clipAtFrame(entry.placed, frame);
    if (placed) stack.push({ track: entry.track, placed });
  }
  return stack;
}

/**
 * Renumbers a track so `orderIndex` runs 0..n-1 with no holes.
 *
 * Called after every insert, move and delete. Holes are not merely untidy: the
 * render's `join()` walks the sorted array pairwise to resolve each
 * boundary's transition, and a duplicate index makes that pairing ambiguous.
 */
export function renumberTrack(clips: SequenceClip[], trackId: string): SequenceClip[] {
  let next = 0;
  return clips
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((clip) => (clip.trackId === trackId ? { ...clip, orderIndex: next++ } : clip));
}

/**
 * Snap targets in *frames*: every clip edge on every track, plus 0.
 *
 * The threshold that consumes these is in **pixels**, not frames — a snap
 * distance fixed in frames would feel sticky when zoomed out and unreachable
 * when zoomed in. Screen-space is the only constant that reads right at all
 * zoom levels.
 */
export function snapTargets(tracks: SequenceTrack[], clips: SequenceClip[]): number[] {
  const targets = new Set<number>([0]);
  for (const track of tracks) {
    for (const placed of layoutTrack(clips, track)) {
      targets.add(placed.startFrames);
      targets.add(placed.endFrames);
    }
  }
  return [...targets].sort((a, b) => a - b);
}

/**
 * S175 — the full editing-time snap target set, composed from the clip-edge
 * primitive above plus the session facts `snapTargets` deliberately does not
 * know about: markers, the playhead, and the sequence end. A separate
 * function (rather than widening `snapTargets`) because clip edges are a
 * pure document fact while these are session state, and because the two have
 * different stability: the caller memoizes the clip edges once per document
 * and re-composes this cheaply when the playhead parks somewhere new.
 *
 * `playheadFrame: null` omits it — a scrub must not snap to where the
 * playhead already stands.
 */
export function timelineSnapTargets(input: {
  /** Usually `snapTargets(tracks, clips)`, precomputed and memoized. */
  base: readonly number[];
  markerFrames: readonly number[];
  playheadFrame: number | null;
  sequenceEndFrame: number;
}): number[] {
  const targets = new Set<number>(input.base);
  for (const frame of input.markerFrames) targets.add(Math.max(0, Math.round(frame)));
  if (input.playheadFrame !== null) targets.add(Math.max(0, Math.round(input.playheadFrame)));
  targets.add(Math.max(0, Math.round(input.sequenceEndFrame)));
  return [...targets].sort((a, b) => a - b);
}

/** The nearest snap target within `toleranceFrames`, or the original value. */
export function snapFrame(frame: number, targets: number[], toleranceFrames: number): number {
  let best = frame;
  let bestDistance = toleranceFrames;
  for (const target of targets) {
    const distance = Math.abs(target - frame);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
