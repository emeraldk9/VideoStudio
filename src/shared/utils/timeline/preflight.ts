import {
  LONG_STILL_WARNING_SECONDS,
  SYNC_LOCK_GUARD_FRAMES,
  type PreflightFinding,
  type Sequence,
  type SequenceClip,
  type SequenceMarker,
  type SequenceTrack,
} from '../../types/sequence';
import { normalizeHeading } from './scene-breakdown';

import { framesToSeconds } from './frames';
import {
  audioDurationFrames,
  effectiveBoundaryTransition,
  layoutTrack,
  sequenceDurationFrames,
} from './layout';
import {
  MAX_MOTION_RATE_PCT_PER_SEC,
  motionEdgeTravelFraction,
  motionPeakScale,
  resolveClipMotion,
} from './motion';

/**
 * Beta S145 — everything wrong with a sequence, named in one pass.
 *
 * The module's standing rule: **report, never silently fix.** A still that
 * holds 40 seconds is honest if narration plays under it and dead air if not,
 * and only the person editing knows which — so this describes and the UI
 * shows, and nothing here mutates a clip.
 *
 * Pure and synchronous. Anything needing the filesystem (does this path still
 * exist) or a probe (does this clip's geometry match) is passed in by the
 * caller, so the whole check is unit-testable without ffmpeg or a disk.
 */

export interface PreflightInput {
  sequence: Sequence;
  /** S154 — the document's tracks; the checks that used to name lanes read these. */
  tracks: SequenceTrack[];
  clips: SequenceClip[];
  /** Clip ids whose `filePath` no longer resolves. The caller stats them. */
  missingClipIds?: string[];
  /** Clip ids whose measured geometry differs from the sequence's. */
  geometryMismatchClipIds?: string[];
  /**
   * S229 — measured source pixel sizes by clip id, from the same probe pass
   * that feeds the two lists above. Only clips present here are checked by
   * the motion-resolution guard; an unprobed clip is silence, not a pass.
   */
  sourceSizeByClipId?: Record<string, { width: number; height: number }>;
  /** S233 — the sequence's markers; only the locked ones guard anything. */
  markers?: readonly Pick<SequenceMarker, 'frame' | 'name' | 'locked'>[];
  /**
   * Shot ids whose approved take predates the shot's last prompt-affecting
   * edit — `StoryTakeRef.approvedAt` vs `StoryShot.promptUpdatedAt`, the exact
   * test Beta S65 built. Comes free; the caller just compares two timestamps.
   */
  staleShotIds?: string[];
  /** Headings by shot id, so messages name the shot rather than a uuid. */
  headingByShotId?: Record<string, string>;
  /**
   * Beta S353 — clip ids whose picture the app has **no record** of cleaning.
   *
   * Supplied, not computed, for the reason every other filesystem-shaped input
   * here is: the answer lives in three different stores and needs each file's
   * current size and mtime to validate a stamp against. The caller asks
   * `watermark.cleanStatus` once for the whole cut and hands the shortfall in.
   *
   * Absence is silence, not a pass — a caller that never asked reports nothing,
   * exactly as an unprobed cut reports no geometry. The alternative would be a
   * clean cut warning about itself on every open.
   */
  uncleanedClipIds?: string[];
}

function nameFor(clip: SequenceClip): string {
  return clip.label || 'Untitled clip';
}

/**
 * S234 — what "moves the same way" means for the stutter guard: preset plus
 * direction, over the stored motion (authored wins, legacy maps to its new
 * name). Hold, breathe and float state no direction and never repeat-offend.
 */
function motionRepeatSignature(clip: SequenceClip): string | null {
  if (clip.sourceKind !== 'still') return null;
  const motion = clip.effects?.motion;
  if (motion) {
    if (motion.preset === 'push_in' || motion.preset === 'pull_out') return motion.preset;
    if (motion.preset === 'drift') return `drift:${motion.direction ?? 'right'}`;
    if (motion.preset === 'push_to_point' || motion.preset === 'settle' || motion.preset === 'arrive') {
      return motion.preset;
    }
    return null;
  }
  switch (clip.motionPreset) {
    case 'zoom_in':
      return 'push_in';
    case 'zoom_out':
      return 'pull_out';
    case 'pan_lr':
      return 'drift:right';
    case 'pan_rl':
      return 'drift:left';
    default:
      return null;
  }
}

export function runPreflight(input: PreflightInput): PreflightFinding[] {
  const { sequence, tracks, clips } = input;
  const findings: PreflightFinding[] = [];

  const videoTracks = tracks.filter((track) => track.kind === 'video');
  const video = videoTracks.flatMap((track) => layoutTrack(clips, track));
  if (video.length === 0) {
    findings.push({
      code: 'empty_sequence',
      severity: 'blocking',
      message: 'No video track holds a clip — there is nothing to render.',
    });
    // Everything below reads against the picture, so stop here rather than
    // emit a cascade of findings that all restate this one.
    return findings;
  }

  // S154 phase 2 — an overlay running past the spine forces the composite to
  // extend the spine with black. Maybe intended (a title outliving the last
  // shot); named either way, never silently produced.
  const spineId = sequence.spineTrackId ?? videoTracks[0]?.id;
  const spineTrack = videoTracks.find((track) => track.id === spineId);
  if (spineTrack && (spineTrack.muted || spineTrack.videoEnabled === false)) {
    findings.push({
      code: 'spine_track_hidden_or_muted',
      severity: 'blocking',
      message: `The spine video track "${spineTrack.name}" is ${
        spineTrack.muted && spineTrack.videoEnabled === false
          ? 'hidden and muted'
          : spineTrack.muted
            ? 'muted'
            : 'hidden'
      }. Unhide or unmute it before exporting.`,
    });
  }
  const spineEnd = spineTrack
    ? layoutTrack(clips, spineTrack).reduce((max, placed) => Math.max(max, placed.endFrames), 0)
    : 0;
  for (const track of videoTracks) {
    if (track.id === spineId || track.muted) continue;
    const trackEnd = layoutTrack(clips, track).reduce(
      (max, placed) => Math.max(max, placed.endFrames),
      0,
    );
    if (trackEnd > spineEnd) {
      findings.push({
        code: 'overlay_past_spine',
        severity: 'warning',
        message: `"${track.name}" runs ${framesToSeconds(trackEnd - spineEnd, sequence.fps).toFixed(1)}s past the last spine clip — the export gains a black-backed tail.`,
      });
    }
  }

  const missing = new Set(input.missingClipIds ?? []);
  const mismatched = new Set(input.geometryMismatchClipIds ?? []);
  const stale = new Set(input.staleShotIds ?? []);

  for (const clip of clips) {
    if (missing.has(clip.id)) {
      findings.push({
        code: 'source_missing',
        severity: 'blocking',
        message: `"${nameFor(clip)}" could not be read — the file is missing, or not usable media.`,
        clipId: clip.id,
        storyShotId: clip.storyShotId ?? undefined,
      });
    }
    if (mismatched.has(clip.id)) {
      findings.push({
        code: 'geometry_mismatch',
        severity: 'warning',
        message: `"${nameFor(clip)}" is a different size than the sequence — it will be scaled and padded.`,
        clipId: clip.id,
      });
    }
    if (clip.storyShotId && stale.has(clip.storyShotId)) {
      findings.push({
        code: 'stale_approval',
        severity: 'warning',
        message: `"${nameFor(clip)}" was approved before the shot was last rewritten.`,
        clipId: clip.id,
        storyShotId: clip.storyShotId,
      });
    }
  }

  // A still holding far longer than a reader's patience, with nothing playing
  // under it. Reported per clip, because the fix is per clip. S154 — "does
  // *any* audio track overlap", so the check survives a renamed or added
  // narration track without guessing a track's meaning from its name.
  const narration = tracks
    .filter((track) => track.kind === 'audio')
    .flatMap((track) => layoutTrack(clips, track));
  const hasNarrationOver = (startFrames: number, endFrames: number): boolean =>
    narration.some((item) => item.startFrames < endFrames && item.endFrames > startFrames);

  for (const placed of video) {
    if (placed.clip.sourceKind !== 'still') continue;
    const seconds = framesToSeconds(placed.clip.durationFrames, sequence.fps);
    if (seconds > LONG_STILL_WARNING_SECONDS && !hasNarrationOver(placed.startFrames, placed.endFrames)) {
      findings.push({
        code: 'long_still_no_narration',
        severity: 'warning',
        message: `"${nameFor(placed.clip)}" holds for ${seconds.toFixed(1)}s with no narration under it.`,
        clipId: placed.clip.id,
        storyShotId: placed.clip.storyShotId ?? undefined,
      });
    }
  }

  // Audio running past the last picture. `sequenceDurationFrames` deliberately
  // takes its length from the video tracks alone, so this audio would simply
  // be cut — worth saying out loud rather than discovering in the export.
  const videoEnd = sequenceDurationFrames(tracks, clips);
  const audioEnd = audioDurationFrames(tracks, clips);
  if (audioEnd > videoEnd) {
    const overrun = framesToSeconds(audioEnd - videoEnd, sequence.fps);
    findings.push({
      code: 'narration_overruns_still',
      severity: 'warning',
      message: `Audio runs ${overrun.toFixed(1)}s past the last picture and will be cut at the end of the video.`,
    });
  }

  // S154 phase 4 — a transition on a track with no joins renders as nothing.
  const magneticTrackIds = new Set(tracks.filter((track) => track.magnetic).map((track) => track.id));
  for (const clip of clips) {
    if (clip.transitionIn !== 'cut' && clip.transitionFrames > 0 && !magneticTrackIds.has(clip.trackId)) {
      findings.push({
        code: 'transition_without_overlap',
        severity: 'warning',
        message: `"${nameFor(clip)}" has a transition, but its track has no junction to play it at — it will render as a cut.`,
        clipId: clip.id,
      });
    }
  }

  // S237 — the comfort cap, as a warning rather than a clamp: only an
  // authored reframe can resolve faster than 2 %/s (every rate-driven
  // preset is capped at resolve time), and a reframe is a deliberate
  // composition — so the preflight names the speed and leaves the choice.
  for (const clip of clips) {
    if (clip.sourceKind !== 'still') continue;
    const curve = resolveClipMotion(
      clip.motionPreset,
      clip.effects?.motion,
      clip.durationFrames,
      sequence.fps,
    );
    if (!curve) continue;
    const seconds = framesToSeconds(clip.durationFrames, sequence.fps);
    if (seconds <= 0) continue;
    const ratePctPerSec = (motionEdgeTravelFraction(curve) * 100) / seconds;
    if (ratePctPerSec > MAX_MOTION_RATE_PCT_PER_SEC + 1e-6) {
      findings.push({
        code: 'motion_rate_exceeded',
        severity: 'warning',
        message: `"${nameFor(clip)}" moves at ${ratePctPerSec.toFixed(1)} %/s — past the ${MAX_MOTION_RATE_PCT_PER_SEC} %/s comfort cap. A move this fast reads as the camera, not the story.`,
        clipId: clip.id,
      });
    }
  }

  // S229 — §3.5's resolution guard, split in two by S239 because it was two
  // conditions wearing one name.
  //
  // Cover-fit's effective resolution is the smaller of the two axis ratios.
  // Below 1 the still is enlarged *at rest*: a property of the source, true
  // of every clip using it, and untouched by softening the move. At or above
  // 1 but below the move's peak scale, the source is fine and the move is
  // too ambitious for its headroom — which is the only case the per-clip
  // wording ever described correctly.
  //
  // The first is aggregated into one sequence-level finding (S239) and counts
  // held stills, which neither the old guard (`hold` resolves to no curve)
  // nor `geometry_mismatch` (videos only) could see.
  const belowCanvas: { name: string; ratio: number; width: number; height: number }[] = [];
  for (const clip of clips) {
    if (clip.sourceKind !== 'still') continue;
    const size = input.sourceSizeByClipId?.[clip.id];
    if (!size || size.width <= 0 || size.height <= 0) continue;
    const minRatio = Math.min(size.width / sequence.width, size.height / sequence.height);
    if (minRatio < 1) {
      belowCanvas.push({
        name: nameFor(clip),
        ratio: minRatio,
        width: size.width,
        height: size.height,
      });
      // Its move is not the problem and must not be reported as one.
      continue;
    }
    const curve = resolveClipMotion(
      clip.motionPreset,
      clip.effects?.motion,
      clip.durationFrames,
      sequence.fps,
    );
    if (!curve) continue;
    const peak = motionPeakScale(curve);
    if (minRatio < peak) {
      const achievable = Math.max(0, (minRatio - 1) * 100);
      findings.push({
        code: 'motion_source_too_small',
        severity: 'warning',
        message:
          `"${nameFor(clip)}" is ${size.width}×${size.height} — too small for its motion at ` +
          `${sequence.width}×${sequence.height}. The deepest zoom would upscale; ` +
          (achievable >= 0.5
            ? `about ${achievable.toFixed(1)}% of travel is available.`
            : `this source affords no travel at all.`),
        clipId: clip.id,
      });
    }
  }

  if (belowCanvas.length > 0) {
    // The worst offender carries the headline number: it is the one that
    // decides how soft the export looks, and naming it gives the user
    // something to search the pool for.
    const worst = belowCanvas.reduce((low, next) => (next.ratio < low.ratio ? next : low));
    const upscale = 1 / worst.ratio;
    const count =
      belowCanvas.length === 1 ? '1 still is' : `${belowCanvas.length} stills are`;
    findings.push({
      code: 'source_below_canvas',
      severity: 'warning',
      message:
        `${count} smaller than the ${sequence.width}×${sequence.height} canvas and will be ` +
        `enlarged — moving or held. The smallest is "${worst.name}" at ${worst.width}×${worst.height}, ` +
        `upscaled ${upscale.toFixed(2)}×. This is the source resolution, not the motion: ` +
        `softening the moves would not change it. Either accept the upscale, or set the ` +
        `canvas to match the sources (Aspect → Match sources).`,
    });
  }

  // S353 — the last useful moment to say a source may still carry the Flow
  // watermark. Aggregated like the finding above, and counted by **file**
  // rather than by clip: three clips of one plate are one thing to clean, and
  // saying "3" would send someone looking for two files that do not exist.
  if (input.uncleanedClipIds && input.uncleanedClipIds.length > 0) {
    const uncleaned = new Set(input.uncleanedClipIds);
    const files = new Map<string, string>();
    for (const clip of clips) {
      if (!uncleaned.has(clip.id) || !clip.filePath) continue;
      if (!files.has(clip.filePath)) files.set(clip.filePath, nameFor(clip));
    }
    if (files.size > 0) {
      const noun = files.size === 1 ? 'source has' : 'sources have';
      const names = [...files.values()].slice(0, 3).join(', ');
      const more = files.size > 3 ? `, +${files.size - 3} more` : '';
      findings.push({
        code: 'source_watermarked',
        severity: 'warning',
        message:
          `${files.size} ${noun} no record of watermark removal (${names}${more}). ` +
          `This is what the app remembers doing, not what it can see: a file it never ` +
          `cleaned may or may not carry a mark, and checking costs seconds per still. ` +
          `Clean them from the media pool's Remove watermark if they are Flow output — ` +
          `the timeline is re-pointed at the cleaned files automatically.`,
      });
    }
  }

  // S234 — §5.4's stutter guard: three or more consecutive spine clips
  // moving the same way read as a hiccup in the operator's hand. The
  // signature is preset + direction over the *resolved* motion, so a legacy
  // zoom_in and an authored push_in count as the same move; hold and
  // breathe state no direction and never repeat-offend.
  const spinePlaced = spineTrack ? layoutTrack(clips, spineTrack) : [];
  {
    let runStart: SequenceClip | null = null;
    let runLength = 0;
    let previousSignature: string | null = null;
    let reported = false;
    for (const placed of spinePlaced) {
      const signature = motionRepeatSignature(placed.clip);
      if (signature !== null && signature === previousSignature) {
        runLength += 1;
        if (runLength >= 3 && !reported) {
          findings.push({
            code: 'repeated_motion_run',
            severity: 'warning',
            message: `Three consecutive clips starting at "${nameFor(runStart ?? placed.clip)}" move the same way (${signature.replace(':', ' ')}) — alternate a direction so the hand doesn't stutter.`,
            clipId: (runStart ?? placed.clip).id,
          });
          reported = true;
        }
      } else {
        runStart = placed.clip;
        runLength = signature === null ? 0 : 1;
        previousSignature = signature;
        reported = false;
      }
    }
  }

  // S234 — part 8's run rule: a dissolve past 24f belongs *inside* a scene
  // run. In this grammar a scene change is a cut; a long dissolve across one
  // says "time passed" at exactly the moment the location already said it.
  for (let position = 1; position < spinePlaced.length; position += 1) {
    const outgoing = spinePlaced[position - 1].clip;
    const incoming = spinePlaced[position].clip;
    const boundary = effectiveBoundaryTransition(incoming, outgoing);
    if (boundary.type === 'cut' || boundary.frames <= 24) continue;
    const from = normalizeHeading(outgoing.label ?? '').toLowerCase();
    const to = normalizeHeading(incoming.label ?? '').toLowerCase();
    if (from && to && from !== to) {
      findings.push({
        code: 'dissolve_crosses_scene_run',
        severity: 'warning',
        message: `A ${boundary.frames}f dissolve into "${nameFor(incoming)}" crosses a scene change — long dissolves belong inside a run; cut the scene change instead.`,
        clipId: incoming.id,
      });
    }
  }

  // S233 — R5's sync locks: a locked marker names a frame the sound design
  // was built to hit, and a dissolve smeared across it destroys exactly that
  // frame. Warn about any transition whose window touches the ±8f guard
  // around one — the boundary starts at the incoming clip's first frame and
  // occupies its first `frames` (the S226 invariant), so the window is
  // [start, start + frames].
  const lockedMarkers = (input.markers ?? []).filter((marker) => marker.locked);
  if (lockedMarkers.length > 0) {
    for (const track of tracks) {
      if (!track.magnetic) continue;
      const placedClips = layoutTrack(clips, track);
      for (let position = 1; position < placedClips.length; position += 1) {
        const incoming = placedClips[position];
        const boundary = effectiveBoundaryTransition(incoming.clip, placedClips[position - 1].clip);
        if (boundary.type === 'cut' || boundary.frames <= 0) continue;
        const windowStart = incoming.startFrames;
        const windowEnd = incoming.startFrames + boundary.frames;
        for (const marker of lockedMarkers) {
          if (
            marker.frame >= windowStart - SYNC_LOCK_GUARD_FRAMES &&
            marker.frame <= windowEnd + SYNC_LOCK_GUARD_FRAMES
          ) {
            findings.push({
              code: 'transition_near_locked_marker',
              severity: 'warning',
              message: `"${nameFor(incoming.clip)}" arrives with a transition within ${SYNC_LOCK_GUARD_FRAMES} frames of the locked marker${marker.name ? ` “${marker.name}”` : ''} — the sync point will smear. Use a cut here.`,
              clipId: incoming.clip.id,
            });
            break;
          }
        }
      }
    }
  }

  // S230 — a J-cut lead that cannot be fully honoured: the audio window
  // stops at the source's first sample and the sequence's first frame
  // (`applySplitEditOffset`'s two clamps), so an over-deep lead plays
  // shorter than authored. Named here, mirroring the same arithmetic.
  for (const track of tracks) {
    const placedClips = layoutTrack(clips, track);
    for (const placed of placedClips) {
      const offset = placed.clip.audioOffsetFrames ?? 0;
      if (placed.clip.sourceKind !== 'video' || offset >= 0) continue;
      const wanted = -offset;
      const available = Math.min(wanted, placed.clip.sourceInFrames ?? 0, placed.startFrames);
      if (available < wanted) {
        findings.push({
          code: 'audio_lead_clipped',
          severity: 'warning',
          message: `"${nameFor(placed.clip)}" asks its audio to lead by ${wanted} frames, but only ${available} are available before it — the J cut plays shorter than authored.`,
          clipId: placed.clip.id,
        });
      }
    }
  }

  // S227 — both sides of one junction authored a transition. The incoming
  // clip wins (`effectiveBoundaryTransition`); name the loser rather than
  // letting two intentions silently become one.
  for (const track of tracks) {
    if (!track.magnetic) continue;
    const placed = layoutTrack(clips, track);
    for (let position = 1; position < placed.length; position += 1) {
      const outgoing = placed[position - 1].clip;
      const incoming = placed[position].clip;
      const outSpeaks = (outgoing.transitionOut ?? 'cut') !== 'cut' && (outgoing.transitionOutFrames ?? 0) > 0;
      const inSpeaks = incoming.transitionIn !== 'cut' && incoming.transitionFrames > 0;
      if (outSpeaks && inSpeaks) {
        findings.push({
          code: 'conflicting_boundary_transition',
          severity: 'warning',
          message: `"${nameFor(outgoing)}" sets an out-transition, but "${nameFor(incoming)}" sets its own in-transition — the in-transition plays and the out is ignored.`,
          clipId: outgoing.id,
        });
      }
    }
  }

  // Shots the prefill could not place. Blocking: an export missing a shot is
  // an export the user has to redo, and the reason is knowable now.
  for (const [shotId, heading] of Object.entries(input.headingByShotId ?? {})) {
    const placed = clips.some((clip) => clip.storyShotId === shotId);
    if (!placed) {
      findings.push({
        code: 'shot_not_approved',
        severity: 'blocking',
        message: `"${heading}" has no approved take and is not in the timeline.`,
        storyShotId: shotId,
      });
    }
  }

  return findings;
}

export function hasBlockingFindings(findings: PreflightFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'blocking');
}
