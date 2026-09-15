import type { SequenceClip, SequenceSourceKind, SequenceTrack } from '../../types/sequence';
import type { TtsHistoryLine } from '../../types/tts';

import type { TimelineDragItem } from './drag-payload';
import { effectPresetById } from './effect-presets';
import { TEXT_PRESETS, type TextContent } from './effects';
import { secondsToFrames } from './frames';
import { shiftKeyframes, splitKeyframes } from './keyframes';
import { clipAtFrame, layoutTrack } from './layout';
import { clipAllowedOnTrack } from './move-clip';

/**
 * Beta S145 phase D — structural edits, pure.
 *
 * Both operations here return a **new clip list** (with caller-supplied ids
 * for anything they mint) and never touch the input. The store commits the
 * result through its normal undo path, so each is one undoable step.
 */

/**
 * Splits the given track's clip under `frame` into two clips at that frame.
 *
 * S154 — takes the track rather than hardcoding `'V1'`, which makes splitting
 * an audio or overlay clip free. The blade rules below are unchanged.
 *
 * The industry-standard `S`/blade behaviour, and the rules that make it feel
 * right are all edge cases:
 *
 * - A cut **at** a clip boundary is a no-op — there is nothing to split, and
 *   minting a zero-frame clip would corrupt the lane.
 * - A **video** keeps its source mapping: the second half's `sourceInFrames`
 *   advances by the first half's length, so both halves play the footage they
 *   played before the cut, just as two clips.
 * - A **still** simply divides its hold time; both halves show the same image.
 * - The second half is born with a hard cut and no motion preset carried over
 *   half-finished: a Ken Burns that ran 60% of its travel cannot resume
 *   mid-curve in a clip that re-derives progress from its own length, so the
 *   first half keeps the preset and the second holds still. Reported honestly
 *   by the inspector rather than silently misbehaving.
 * - Overrides carry to both halves **except** `durationFrames`: the split
 *   itself authored both durations, so both are user-owned now.
 */
export function splitClipAtFrame(
  clips: SequenceClip[],
  track: SequenceTrack,
  frame: number,
  newClipId: string,
): SequenceClip[] | null {
  const placed = clipAtFrame(layoutTrack(clips, track), frame);
  if (!placed) return null;
  const offset = Math.round(frame - placed.startFrames);
  if (offset <= 0 || offset >= placed.clip.durationFrames) return null;

  const first: SequenceClip = {
    ...placed.clip,
    durationFrames: offset,
    overrides: placed.clip.overrides.includes('durationFrames')
      ? placed.clip.overrides
      : [...placed.clip.overrides, 'durationFrames'],
  };
  // S154 phase 6 (trap 15) — the curve splits with the media: the first half
  // keeps keys before the cut, the second half's re-base to its new zero.
  const halves = splitKeyframes(placed.clip.keyframes, offset);
  const second: SequenceClip = {
    ...placed.clip,
    id: newClipId,
    orderIndex: placed.clip.orderIndex + 1,
    durationFrames: placed.clip.durationFrames - offset,
    sourceInFrames:
      placed.clip.sourceKind === 'video' ? (placed.clip.sourceInFrames ?? 0) + offset : placed.clip.sourceInFrames,
    // A free-track second half starts where the cut fell — its own absolute
    // offset, not the first half's. On a magnetic track the layout derives it.
    startFrames: track.magnetic ? null : Math.round(frame),
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    overrides: first.overrides,
    keyframes: halves.second,
  };
  first.keyframes = halves.first;

  return clips.map((clip) => {
    if (clip.id === placed.clip.id) return first;
    // Later clips on the same track shift one position to make room.
    if (clip.trackId === track.id && clip.orderIndex > placed.clip.orderIndex) {
      return { ...clip, orderIndex: clip.orderIndex + 1 };
    }
    return clip;
  }).concat(second);
}

/**
 * Beta S151 (F1) — trims one edge of a clip by a frame delta.
 *
 * Extracted so the trim **handle** and the `I`/`O` keys are one implementation
 * rather than two that drift. Both express the same intent: move this edge to
 * here, keeping the source mapping honest.
 *
 * The sign convention is absolute-position, not "amount to remove": a positive
 * delta moves the edge later on the timeline, whichever edge it is. So a
 * positive delta on the **head** shortens the clip (its start moves right) and
 * a positive delta on the **tail** lengthens it. This is what makes the drag
 * gesture a straight subtraction of two absolute frames, which is exactly the
 * coordinate error S145 shipped: the gesture began at frame 0 rather than at
 * the edge being dragged, so `Math.max(0, …)` clamped every leftward drag to
 * nothing and the whole shortening-from-the-tail / extending-from-the-head half
 * of trimming was inert.
 *
 * Three clamps, each for a reason:
 *
 * - A clip cannot shrink below one frame — a zero-frame clip is invisible and
 *   corrupts the lane's ordering.
 * - A clip **with a source range** cannot extend its head past the start of its
 *   source: `sourceInFrames` floors at 0, and letting the duration grow past
 *   that point would show frames the file does not contain.
 * - A **still** has no source range, so its head extends freely. A picture has
 *   no beginning to run out of.
 *
 * The tail is deliberately *not* clamped against the source's measured length:
 * the document does not carry one (`sourceOutFrames` is unset in practice), and
 * inventing a limit from an unmeasured value would be worse than the render's
 * own honest behaviour of ending the segment when the file does.
 *
 * Returns the input list untouched when the trim resolves to no change, so a
 * caller can commit unconditionally without pushing an empty undo entry.
 */
export function trimClipEdge(
  clips: SequenceClip[],
  clipId: string,
  edge: 'start' | 'end',
  deltaFrames: number,
): SequenceClip[] {
  const clip = clips.find((item) => item.id === clipId);
  if (!clip) return clips;
  const delta = Math.round(deltaFrames);
  if (delta === 0) return clips;

  if (edge === 'end') {
    const duration = Math.max(1, clip.durationFrames + delta);
    if (duration === clip.durationFrames) return clips;
    return clips.map((item) => (item.id === clipId ? { ...item, durationFrames: duration } : item));
  }

  // A source range exists only for video and audio; a still's is null and stays
  // null, which is what lets it extend without bound.
  const hasSourceRange = clip.sourceInFrames !== null;
  const lowerBound = hasSourceRange ? -(clip.sourceInFrames ?? 0) : -Number.MAX_SAFE_INTEGER;
  const applied = Math.max(lowerBound, Math.min(delta, clip.durationFrames - 1));
  if (applied === 0) return clips;

  return clips.map((item) =>
    item.id === clipId
      ? {
          ...item,
          sourceInFrames: hasSourceRange ? Math.max(0, (item.sourceInFrames ?? 0) + applied) : null,
          durationFrames: Math.max(1, item.durationFrames - applied),
          // S154 phase 6 (trap 15) — clip-relative keyframes slide with the
          // head: what was at frame 30 of the old head is at 30−applied now,
          // and a key trimmed past zero is gone with the media it annotated.
          keyframes: shiftKeyframes(item.keyframes, applied),
        }
      : item,
  );
}

/**
 * Beta S160 (owner item 7) — the blade, widened from the spine to the cut.
 *
 * `S` had only ever split the spine clip; an overlay or a narration clip
 * could not be bladed at all. The targeting rule is the standard one:
 *
 * - **Selection first.** A non-empty selection blades exactly the selected
 *   clips the playhead passes through — cutting an unrelated track because
 *   the playhead happened to cross it would make the selection meaningless.
 * - **No selection = every unlocked track.** The clip under `frame` on each
 *   unlocked track splits — CapCut's split button, Premiere's Ctrl+K.
 * - Locked tracks never split, whatever the selection says.
 *
 * One returned list, so the whole blade is one undoable commit. `null` when
 * nothing was under the playhead (or every cut fell on a boundary), so the
 * caller can skip the commit entirely — `splitClipAtFrame`'s own contract.
 */
export function splitAtFrame(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  frame: number,
  selectedIds: readonly string[],
  makeId: () => string,
): SequenceClip[] | null {
  const selected = new Set(selectedIds);
  let current = clips;
  let changed = false;
  for (const track of tracks) {
    if (track.locked) continue;
    const placed = clipAtFrame(layoutTrack(current, track), frame);
    if (!placed) continue;
    if (selected.size > 0 && !selected.has(placed.clip.id)) continue;
    const next = splitClipAtFrame(current, track, frame, makeId());
    if (next) {
      current = next;
      changed = true;
    }
  }
  return changed ? current : null;
}

/**
 * S160 — "Delete left" / "Delete right": trim the clip under the playhead
 * *to* the playhead, discarding the named side.
 *
 * Deliberately the per-clip trim (Resolve's Trim Start/End), not CapCut's
 * whole-timeline sweep: this document model has no ripple-across-tracks
 * notion for free tracks, and a sweep that moved narration the user placed
 * would violate the module's "A2 is never moved" rule. Same targeting as
 * {@link splitAtFrame}, same one-commit contract. The maths is
 * `trimClipEdge` — the function the `I`/`O` keys and the trim handles
 * already share, so all four surfaces clamp identically.
 */
export function deleteToPlayhead(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  frame: number,
  selectedIds: readonly string[],
  side: 'left' | 'right',
): SequenceClip[] {
  const selected = new Set(selectedIds);
  let current = clips;
  for (const track of tracks) {
    if (track.locked) continue;
    const placed = clipAtFrame(layoutTrack(current, track), frame);
    if (!placed) continue;
    if (selected.size > 0 && !selected.has(placed.clip.id)) continue;
    const delta =
      side === 'left'
        ? Math.round(frame - placed.startFrames) // move the head edge to here
        : Math.round(frame - placed.endFrames); // move the tail edge to here (negative)
    current = trimClipEdge(current, placed.clip.id, side === 'left' ? 'start' : 'end', delta);
  }
  return current;
}

/**
 * S160 — ripple delete: remove the clips *and* the time they occupied.
 *
 * A magnetic track ripples by construction — the layout derives every start,
 * so removal closes the gap with no arithmetic here. A **free** track keeps
 * explicit offsets, so each remaining clip slides left by the total length
 * of removed clips that began at-or-before it. Per track, on purpose: ripple
 * on V2 must not re-time narration on A1 that the user placed by hand.
 */
export function rippleDelete(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  clipIds: readonly string[],
): SequenceClip[] {
  const removing = new Set(clipIds);
  const kept = clips.filter((clip) => !removing.has(clip.id));

  const shiftByClipId = new Map<string, number>();
  for (const track of tracks) {
    if (track.magnetic) continue;
    // Spans measured in the pre-delete layout — the shift each survivor
    // needs is defined by where the removed clips *were*.
    const placed = layoutTrack(clips, track);
    const removed = placed.filter((item) => removing.has(item.clip.id));
    if (removed.length === 0) continue;
    for (const survivor of placed) {
      if (removing.has(survivor.clip.id)) continue;
      const shift = removed
        .filter((item) => item.startFrames <= survivor.startFrames)
        .reduce((total, item) => total + item.clip.durationFrames, 0);
      if (shift > 0) shiftByClipId.set(survivor.clip.id, shift);
    }
  }

  if (shiftByClipId.size === 0) return kept;
  return kept.map((clip) => {
    const shift = shiftByClipId.get(clip.id);
    if (shift === undefined) return clip;
    return { ...clip, startFrames: Math.max(0, (clip.startFrames ?? 0) - shift) };
  });
}

/**
 * S160 (owner item 3) — group move: every selected clip shifts by one delta.
 *
 * Free tracks are arithmetic: each selected clip's offset moves, floored at
 * zero. A **magnetic** track has no offsets to move, so its selected clips
 * splice as a *block*: they leave the order, and re-enter (relative order
 * kept) at the position the block's leading edge lands in — the group form
 * of the single-clip centre-splice rule. Per track, so a selection spanning
 * V1+A1 moves coherently without inventing cross-track coupling.
 *
 * Horizontal only, by design: a cross-track landing for N clips on M tracks
 * has no single well-defined answer, and every NLE keeps group drags on
 * their own rows for the same reason.
 */
export function moveSelectionBy(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  selectedIds: readonly string[],
  deltaFrames: number,
): SequenceClip[] {
  const selected = new Set(selectedIds);
  const delta = Math.round(deltaFrames);
  if (delta === 0) return clips;

  let next = clips.map((clip) => {
    if (!selected.has(clip.id)) return clip;
    const track = tracks.find((item) => item.id === clip.trackId);
    if (!track || track.locked || track.magnetic) return clip;
    return { ...clip, startFrames: Math.max(0, (clip.startFrames ?? 0) + delta) };
  });

  for (const track of tracks) {
    if (!track.magnetic || track.locked) continue;
    const placed = layoutTrack(next, track);
    const group = placed.filter((item) => selected.has(item.clip.id));
    if (group.length === 0) continue;
    const rest = placed.filter((item) => !selected.has(item.clip.id));
    // Centre-vs-centre: the block lands after every remaining clip whose
    // midpoint it has passed. Comparing the block's leading clip's centre to
    // the survivors' centres keeps both sides in the same (pre-move)
    // coordinate space — mixing the block's new position against old edges
    // biases the splice a slot early, which reads as "it didn't move".
    const centre = group[0].startFrames + delta + group[0].clip.durationFrames / 2;
    const insertAt = rest.filter(
      (item) => item.startFrames + item.clip.durationFrames / 2 < centre,
    ).length;
    const ordered = [
      ...rest.slice(0, insertAt).map((item) => item.clip),
      ...group.map((item) => item.clip),
      ...rest.slice(insertAt).map((item) => item.clip),
    ].map((clip, index) => ({ ...clip, orderIndex: index }));
    next = [...next.filter((clip) => clip.trackId !== track.id), ...ordered];
  }
  return next;
}

/** Why one narration line could not be placed. Reported, never silently fixed. */
export type LineSkipReason = 'no_audio_file' | 'no_duration' | 'no_shot';

export interface SkippedLine {
  /** 0-based index into the take's line list — the order the script had. */
  lineIndex: number;
  text: string;
  reason: LineSkipReason;
}

export interface PlaceLinesResult {
  clips: SequenceClip[];
  placed: number;
  skipped: SkippedLine[];
}

/**
 * Beta S153 — S145 §6.6 item 7's per-line form: each narration line lands on
 * the target audio track at its shot's start. (S154: the spine and target
 * tracks are parameters; the rules are unchanged.)
 *
 * **Line *i* maps to storyboard clip *i*, by order.** Lines carry no shot id
 * (they are script lines from the Speak workspace) and the storyteller flow
 * writes one line per shot, so position is the only honest join. Only
 * storyboard-born spine clips (`storyShotId` set) anchor lines — a
 * hand-dropped filler clip has no line, and letting it consume one would
 * shift every later line onto the wrong shot, the positional-matching
 * failure `Beta_S43` exists to warn about.
 *
 * The offset each line had *inside the take* is discarded deliberately:
 * landing at the shot's start is the feature. The Speak workspace's timing
 * was authored against a blank timeline; the shot boundaries are the timing
 * the cut actually has. (`fitStillsToNarration` remains the inverse, for
 * when the read should win instead.)
 *
 * A line with no surviving audio file, no measured duration, or no shot to
 * land on is skipped **and named with its reason** — the module's standing
 * report-never-fix rule. Placement appends to A1; clearing an existing bed
 * is the user's call, and the whole operation is one undoable commit.
 *
 * `makeId` is injected (as `splitClipAtFrame` takes its id) so this stays
 * pure and deterministic under test.
 */
export function placeLinesAtShotBoundaries(
  clips: SequenceClip[],
  spineTrack: SequenceTrack,
  targetTrackId: string,
  lines: readonly TtsHistoryLine[],
  fps: number,
  makeId: () => string,
): PlaceLinesResult {
  const shots = layoutTrack(clips, spineTrack).filter((placed) => placed.clip.storyShotId);
  const skipped: SkippedLine[] = [];
  const added: SequenceClip[] = [];
  let orderIndex = clips.filter((clip) => clip.trackId === targetTrackId).length;

  lines.forEach((line, lineIndex) => {
    const shot = shots[lineIndex];
    if (!shot) {
      skipped.push({ lineIndex, text: line.text, reason: 'no_shot' });
      return;
    }
    if (!line.audioPath) {
      skipped.push({ lineIndex, text: line.text, reason: 'no_audio_file' });
      return;
    }
    if (!line.durationSec || line.durationSec <= 0) {
      skipped.push({ lineIndex, text: line.text, reason: 'no_duration' });
      return;
    }
    added.push({
      id: makeId(),
      // Overwritten by the store on commit; carried so the draft is complete.
      sequenceId: shots[0].clip.sequenceId,
      trackId: targetTrackId,
      orderIndex: orderIndex++,
      sourceKind: 'audio',
      outputId: null,
      storyShotId: shot.clip.storyShotId,
      sourceTakeId: null,
      filePath: line.audioPath,
      startFrames: shot.startFrames,
      durationFrames: Math.max(1, secondsToFrames(line.durationSec, fps)),
      sourceInFrames: 0,
      sourceOutFrames: null,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: line.text,
      overrides: [],
    });
  });

  return {
    clips: added.length > 0 ? [...clips, ...added] : clips,
    placed: added.length,
    skipped,
  };
}

/**
 * S154 phase 5 — captions from a Voice take: one **text clip** per line, at
 * the line's own offset inside the take.
 *
 * Not a caption model — a caption is a text clip on a video track, and this
 * is the same import shape S153 established for narration audio, aimed at
 * text. Offsets are the take's own (`Add to A1` keeps a take's timing from
 * 0:00, so captions placed the same way land under their audio); a line with
 * no measured duration gets a reading-speed fallback rather than being
 * dropped — a caption is text, and its length is knowable from the text.
 *
 * The WebVTT sidecar (Beta S115) remains the non-burn-in route.
 */
export function placeCaptionsFromLines(
  clips: SequenceClip[],
  targetTrackId: string,
  lines: readonly TtsHistoryLine[],
  fps: number,
  makeId: () => string,
  captionBase: Omit<TextContent, 'text'>,
): PlaceLinesResult {
  const skipped: SkippedLine[] = [];
  const added: SequenceClip[] = [];
  let orderIndex = clips.filter((clip) => clip.trackId === targetTrackId).length;

  lines.forEach((line, lineIndex) => {
    const text = line.text.trim();
    if (!text) {
      skipped.push({ lineIndex, text: line.text, reason: 'no_duration' });
      return;
    }
    // Measured when the take has it; ~2.8 words/sec reading speed otherwise,
    // floored at 1s so a one-word caption is still readable.
    const seconds =
      line.durationSec && line.durationSec > 0
        ? line.durationSec
        : Math.max(1, text.split(/\s+/).length / 2.8);
    added.push({
      id: makeId(),
      sequenceId: clips[0]?.sequenceId ?? '',
      trackId: targetTrackId,
      orderIndex: orderIndex++,
      sourceKind: 'text',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: null,
      startFrames: Math.max(0, secondsToFrames(line.offsetSeconds, fps)),
      durationFrames: Math.max(1, secondsToFrames(seconds, fps)),
      sourceInFrames: null,
      sourceOutFrames: null,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      overrides: [],
      effects: { text: { ...captionBase, text } },
    });
  });

  return {
    clips: added.length > 0 ? [...clips, ...added] : clips,
    placed: added.length,
    skipped,
  };
}

/** §6.6 item 8's handles: a beat of air before the line, a longer one after. */
export const FIT_HEAD_SECONDS = 0.4;
export const FIT_TAIL_SECONDS = 0.6;

export interface FitResult {
  clips: SequenceClip[];
  /** How many stills actually changed. Zero means every still either had no narration or already fit. */
  changed: number;
}

/**
 * Sets each V1 still's duration to the narration under it, plus handles —
 * **and re-anchors that narration to its still**, because resizing stills
 * shifts every later one, and narration left at its old absolute offset would
 * end up under the wrong picture after the first resize.
 *
 * The *inverse* of the storyboard prefill's duration rule, offered as an
 * explicit action rather than a default — the storyboard's intent is the
 * default because the owner said so; this is for when the read runs long.
 *
 * The algorithm, in three passes over one consistent snapshot:
 *
 * 1. **Assign** each A1 line to the still whose window its start falls inside,
 *    in the layout *before* any resizing. Assigning against the shifting
 *    layout would make the result depend on iteration order.
 * 2. **Resize** each assigned still to `head + narration span + tail`, where
 *    the span runs from its first line's start to its last line's end —
 *    multiple lines on one still keep their spacing.
 * 3. **Re-anchor**: relayout V1 with the new durations, then move each still's
 *    lines as one block so the first line starts `head` after its still.
 *
 * Stills with no narration keep their duration untouched — a cutaway that
 * holds 2 seconds on purpose should not collapse to the handles alone. S154:
 * only the **named narration tracks** are re-anchored — every other audio
 * track (music, SFX) is continuous and belongs where the user put it, which
 * is S145's "A2 is never moved" rule stated per track.
 */
export function fitStillsToNarration(
  clips: SequenceClip[],
  spineTrack: SequenceTrack,
  narrationTracks: readonly SequenceTrack[],
  fps: number,
): FitResult {
  const video = layoutTrack(clips, spineTrack);
  const narration = narrationTracks
    .flatMap((track) => layoutTrack(clips, track))
    .sort((a, b) => a.startFrames - b.startFrames);
  if (video.length === 0 || narration.length === 0) return { clips, changed: 0 };

  const headFrames = secondsToFrames(FIT_HEAD_SECONDS, fps);
  const tailFrames = secondsToFrames(FIT_TAIL_SECONDS, fps);

  // Pass 1 — assignment, in the pre-fit layout.
  interface Assignment {
    lineIds: string[];
    firstRelStart: number;
    lastRelEnd: number;
  }
  const byStillId = new Map<string, Assignment>();
  for (const line of narration) {
    const under = video.find(
      (placed) => line.startFrames >= placed.startFrames && line.startFrames < placed.endFrames,
    );
    if (!under) continue;
    const relStart = line.startFrames - under.startFrames;
    const relEnd = line.endFrames - under.startFrames;
    const entry = byStillId.get(under.clip.id);
    if (!entry) {
      byStillId.set(under.clip.id, { lineIds: [line.clip.id], firstRelStart: relStart, lastRelEnd: relEnd });
    } else {
      entry.lineIds.push(line.clip.id);
      entry.firstRelStart = Math.min(entry.firstRelStart, relStart);
      entry.lastRelEnd = Math.max(entry.lastRelEnd, relEnd);
    }
  }
  if (byStillId.size === 0) return { clips, changed: 0 };

  // Pass 2 — resize.
  let changed = 0;
  const resized = clips.map((clip) => {
    if (clip.trackId !== spineTrack.id || clip.sourceKind !== 'still') return clip;
    const assignment = byStillId.get(clip.id);
    if (!assignment) return clip;
    const span = assignment.lastRelEnd - assignment.firstRelStart;
    const fitted = Math.max(1, headFrames + span + tailFrames);
    if (fitted === clip.durationFrames) return clip;
    changed += 1;
    return {
      ...clip,
      durationFrames: fitted,
      // Fitted is a deliberate choice about this clip's length; re-sync must
      // not quietly restore the storyboard's estimate over it.
      overrides: clip.overrides.includes('durationFrames')
        ? clip.overrides
        : [...clip.overrides, 'durationFrames' as const],
    };
  });

  // Pass 3 — re-anchor each still's lines as one block in the new layout.
  const newVideo = layoutTrack(resized, spineTrack);
  const shiftByLineId = new Map<string, number>();
  for (const placed of newVideo) {
    const assignment = byStillId.get(placed.clip.id);
    if (!assignment) continue;
    const oldStill = video.find((item) => item.clip.id === placed.clip.id);
    if (!oldStill) continue;
    // First line lands at `head` past the still's (new) start; every other
    // line of the same still shifts by the same amount, keeping their spacing.
    const oldFirstAbs = oldStill.startFrames + assignment.firstRelStart;
    const newFirstAbs = placed.startFrames + headFrames;
    const shift = newFirstAbs - oldFirstAbs;
    for (const lineId of assignment.lineIds) shiftByLineId.set(lineId, shift);
  }

  const next = resized.map((clip) => {
    const shift = shiftByLineId.get(clip.id);
    if (shift === undefined || shift === 0) return clip;
    return { ...clip, startFrames: Math.max(0, (clip.startFrames ?? 0) + shift) };
  });

  return { clips: next, changed };
}

/**
 * Beta S200 — what a drop (or an "Add at playhead") does to a track, pure.
 *
 * N dragged items become N clips on one track, in the order dragged (visual
 * grid order — the bin-sort rule Premiere and Resolve share). Two lane kinds,
 * two placements:
 *
 * - A **free** track lays them end-to-end from `atFrame`, each starting where
 *   the previous ends — a hand-dropped run of stills reads as a cut, not a
 *   pile at one offset.
 * - A **magnetic** track has no offsets to write, so the run splices as a
 *   contiguous block at the slot `atFrame` resolves to — after every existing
 *   clip whose *midpoint* it has passed, the same centre rule the single-clip
 *   move (`moveClipToTrack`) and the group move (`moveSelectionBy`) use, so a
 *   drop and a drag can never disagree about where "between these two" is.
 *
 * Legality is `clipAllowedOnTrack`, with one carried-over widening: an
 * **audio lane accepts a video item as its sound** (the clip becomes an
 * audio clip over the video's file — what S151's drop already did, and a
 * standard NLE gesture). A still on an audio lane, media on a text lane, an
 * effect on a magnetic lane and anything on a locked lane are refused: the
 * input comes back untouched with no ids placed, which callers read as
 * "nothing happened".
 *
 * Durations are the item's own — the shot's intent, a probe's measurement,
 * or the 3 s default — and the caller runs the S151 probe correction for
 * unmeasured media afterwards, as one batch. `sourceInFrames` is `0` for
 * media with a source range and `null` for a still (nothing to trim into),
 * matching every other clip-construction site.
 */
export interface PlacedSource {
  clipId: string;
  /** The item the clip was minted from — the caller's probe correction reads `measured` off it. */
  item: TimelineDragItem;
}

export interface PlaceSourcesResult {
  clips: SequenceClip[];
  /** Ids of the clips minted, in placement order. Empty when the drop was refused. */
  placedIds: string[];
  /** The same clips paired with their source items, in placement order. */
  placed: PlacedSource[];
}

export function placeSourcesAt(
  clips: SequenceClip[],
  track: SequenceTrack,
  items: readonly TimelineDragItem[],
  atFrame: number,
  fps: number,
  sequenceId: string,
  mintId: () => string,
): PlaceSourcesResult {
  if (track.locked || items.length === 0) return { clips, placedIds: [], placed: [] };

  const drafts: SequenceClip[] = [];
  const placedSources: PlacedSource[] = [];
  for (const item of items) {
    const sourceKind = resolveDroppedKind(item.kind, track);
    if (sourceKind === null) continue;
    const draft = draftClip(item, sourceKind, track.id, sequenceId, fps, mintId());
    if (!draft) continue;
    drafts.push(draft);
    placedSources.push({ clipId: draft.id, item });
  }
  if (drafts.length === 0) return { clips, placedIds: [], placed: [] };

  const placedIds = drafts.map((clip) => clip.id);
  const start = Math.max(0, Math.round(atFrame));

  if (!track.magnetic) {
    const count = clips.filter((clip) => clip.trackId === track.id).length;
    let cursor = start;
    const laid = drafts.map((clip, index) => {
      const placedClip: SequenceClip = { ...clip, startFrames: cursor, orderIndex: count + index };
      cursor += clip.durationFrames;
      return placedClip;
    });
    return { clips: [...clips, ...laid], placedIds, placed: placedSources };
  }

  // Magnetic — splice as a block at the slot under the frame (centre rule).
  const placed = layoutTrack(clips, track);
  const insertAt = placed.filter(
    (item) => item.startFrames + item.clip.durationFrames / 2 < start,
  ).length;
  const ordered = [
    ...placed.slice(0, insertAt).map((item) => item.clip),
    ...drafts.map((clip) => ({ ...clip, startFrames: null })),
    ...placed.slice(insertAt).map((item) => item.clip),
  ].map((clip, index) => ({ ...clip, orderIndex: index }));
  return {
    clips: [...clips.filter((clip) => clip.trackId !== track.id), ...ordered],
    placedIds,
    placed: placedSources,
  };
}

/**
 * Whether a drag of `items` may land on `track` at all — the lane's
 * mid-drag answer (highlight, drop effect, ghost), running the same rule the
 * drop runs so what lights up is what a release does. True when *any* item
 * can land: one unplaceable tile in a selection dims nothing.
 */
export function droppableOnTrack(
  items: readonly Pick<TimelineDragItem, 'kind'>[],
  track: SequenceTrack,
): boolean {
  if (track.locked) return false;
  return items.some((item) => resolveDroppedKind(item.kind, track) !== null);
}

/** The clip kind a dropped item becomes on this track, or `null` when the track refuses it. */
function resolveDroppedKind(
  kind: SequenceSourceKind,
  track: SequenceTrack,
): SequenceSourceKind | null {
  if (track.kind === 'audio') {
    // A video's sound onto an audio lane is the one widening over the
    // move rule; a still has no sound to give.
    return kind === 'audio' || kind === 'video' ? 'audio' : null;
  }
  return clipAllowedOnTrack({ sourceKind: kind }, track) ? kind : null;
}

/** One item as a clip draft — everything but its position, which the placement decides. */
function draftClip(
  item: TimelineDragItem,
  sourceKind: SequenceSourceKind,
  trackId: string,
  sequenceId: string,
  fps: number,
  id: string,
): SequenceClip | null {
  const base: SequenceClip = {
    id,
    sequenceId,
    trackId,
    orderIndex: 0,
    sourceKind,
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: null,
    startFrames: null,
    durationFrames: Math.max(1, secondsToFrames(item.durationSeconds, fps)),
    sourceInFrames: null,
    sourceOutFrames: null,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: item.label,
    overrides: [],
  };

  if (sourceKind === 'text' || sourceKind === 'effect') {
    if (!item.presetId) return null;
    if (sourceKind === 'effect') {
      const preset = effectPresetById(item.presetId);
      if (!preset) return null;
      return { ...base, effects: { filters: { ...preset.filters } } };
    }
    if (!(item.presetId in TEXT_PRESETS)) return null;
    const textPreset = TEXT_PRESETS[item.presetId as TextContent['preset']];
    return { ...base, effects: { text: { ...textPreset, text: item.label } } };
  }

  if (!item.filePath) return null;
  return {
    ...base,
    // S157 — a dragged storyboard tile keeps its shot identity, so re-sync
    // can match it the way it matches a laid-out clip. Hand-placed, so
    // nothing about it is storyboard-owned: `overrides` stays empty.
    storyShotId: item.storyShotId,
    sourceTakeId: item.sourceTakeId,
    filePath: item.filePath,
    sourceInFrames: sourceKind === 'still' ? null : 0,
  };
}
