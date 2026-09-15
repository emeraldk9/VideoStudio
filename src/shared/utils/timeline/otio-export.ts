import { tracksInDisplayOrder, type SequenceClip, type SequenceDocument, type SequenceTrack } from '../../types/sequence';

import { clipSpeed } from './effects';
import { layoutTrack } from './layout';

/**
 * Beta S145 phase E — the sequence as an OpenTimelineIO document.
 *
 * This is the payoff of shaping the schema after OTIO from day one: the
 * export is a pure translation, not a re-derivation. The output targets the
 * stable `.otio` JSON schema (Timeline.1 / Stack.1 / Track.1 / Clip.2 /
 * Gap.1), which Resolve, Premiere (via extension) and `otiotool` all ingest.
 *
 * Decisions a reader will want stated:
 *
 * - **RationalTime rates are the sequence fps**, and every value is a frame
 *   count the document already holds — no seconds anywhere, so the exported
 *   cut is exact, not rounded.
 * - **Crossfade overlaps flatten to hard cuts.** OTIO models transitions as
 *   `Transition` items between clips, but an importing NLE re-applies its own
 *   dissolve anyway, and exporting the overlap arithmetic wrongly is worse
 *   than exporting a clean cut list. The transition's *intent* is preserved in
 *   each clip's metadata for a tool that wants it.
 * - **Audio gaps are explicit `Gap.1` items.** OTIO tracks are sequential —
 *   there is no `start_time` on a clip — so the absolute offsets of A1/A2
 *   become gaps between clips, computed from the same layout the render uses.
 * - **`target_url` is an absolute file path**, not a `media://` URL: the
 *   consumer is an external editor on this machine, and this app's private
 *   scheme means nothing to it.
 */

interface RationalTime {
  OTIO_SCHEMA: 'RationalTime.1';
  rate: number;
  value: number;
}

interface TimeRange {
  OTIO_SCHEMA: 'TimeRange.1';
  start_time: RationalTime;
  duration: RationalTime;
}

function rational(value: number, rate: number): RationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', rate, value };
}

function range(startFrames: number, durationFrames: number, rate: number): TimeRange {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: rational(startFrames, rate),
    duration: rational(durationFrames, rate),
  };
}

function otioClip(clip: SequenceClip, rate: number): Record<string, unknown> {
  // S154 phase 7 — speed exports as the effect OTIO actually models
  // (`LinearTimeWarp.1`, `time_scalar` = the consumption rate), so Resolve
  // and friends re-time the clip instead of reading a mystery metadata key.
  // Everything OTIO has no schema for (colour, transform, curves, text
  // content) rides the metadata blob below, which is what it is for.
  const speed = clipSpeed(clip.effects);
  const effects =
    Math.abs(speed - 1) > 0.001
      ? [
          {
            OTIO_SCHEMA: 'LinearTimeWarp.1',
            name: 'Speed',
            effect_name: 'LinearTimeWarp',
            time_scalar: speed,
          },
        ]
      : undefined;
  return {
    OTIO_SCHEMA: 'Clip.2',
    name: clip.label || 'Clip',
    ...(effects ? { effects } : {}),
    source_range: range(clip.sourceInFrames ?? 0, clip.durationFrames, rate),
    media_references: {
      // S154 phase 5 — a text clip has no file; `MissingReference.1` is the
      // valid OTIO way to say so, and its content rides in the metadata blob
      // so the timing survives interchange even though the render does not.
      DEFAULT_MEDIA: clip.filePath
        ? {
            OTIO_SCHEMA: 'ExternalReference.1',
            // Forward slashes even on Windows: `file://` URLs use them, and
            // every OTIO consumer normalizes the same way.
            target_url: `file:///${clip.filePath.replace(/\\/g, '/').replace(/^\//, '')}`,
          }
        : { OTIO_SCHEMA: 'MissingReference.1' },
    },
    active_media_reference_key: 'DEFAULT_MEDIA',
    metadata: {
      // The app's own identifiers ride along, so a round-trip (or a human
      // reading the file) can trace a clip back to its shot and take.
      'ai-video-studio': {
        sourceKind: clip.sourceKind,
        storyShotId: clip.storyShotId ?? null,
        sourceTakeId: clip.sourceTakeId ?? null,
        motionPreset: clip.motionPreset,
        transitionIn: clip.transitionIn,
        transitionFrames: clip.transitionFrames,
        gainDb: clip.gainDb,
        // S154 phase 7 — the whole effects object and every curve, verbatim.
        // Not lossy-mapped onto foreign schemas: a tool that understands this
        // app reads them back exactly; one that doesn't ignores metadata.
        ...(clip.effects ? { effects: clip.effects } : {}),
        ...(clip.keyframes && clip.keyframes.length > 0 ? { keyframes: clip.keyframes } : {}),
      },
    },
  };
}

function otioGap(durationFrames: number, rate: number): Record<string, unknown> {
  return {
    OTIO_SCHEMA: 'Gap.1',
    name: '',
    source_range: range(0, durationFrames, rate),
  };
}

/**
 * One track → one OTIO track.
 *
 * A magnetic track's clips are already contiguous; a free track's absolute
 * offsets become explicit gaps. Both go through `layoutTrack`, so the
 * exported positions are byte-for-byte the ones the render uses. The gap
 * insertion is offset-driven, which is why it needed no change for free
 * video tracks — S154 only mapped it over the document's own track list.
 */
function otioTrack(clips: SequenceClip[], track: SequenceTrack, rate: number): Record<string, unknown> {
  const placed = layoutTrack(clips, track);
  const children: Record<string, unknown>[] = [];
  let cursor = 0;
  for (const item of placed) {
    if (item.startFrames > cursor) {
      children.push(otioGap(item.startFrames - cursor, rate));
    }
    children.push(otioClip(item.clip, rate));
    cursor = Math.max(cursor, item.endFrames);
  }
  return {
    OTIO_SCHEMA: 'Track.1',
    name: track.name,
    kind: track.kind === 'video' ? 'Video' : 'Audio',
    children,
  };
}

/** The whole document, ready for `JSON.stringify(_, null, 2)`. */
export function buildOtioDocument(document: SequenceDocument): Record<string, unknown> {
  const { sequence, tracks, clips } = document;
  const rate = sequence.fps;
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: sequence.name,
    global_start_time: rational(0, rate),
    metadata: {
      'ai-video-studio': {
        sequenceId: sequence.id,
        projectId: sequence.projectId,
        storyEpisodeId: sequence.storyEpisodeId ?? null,
        width: sequence.width,
        height: sequence.height,
      },
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      // Display order — the arrangement an importing NLE shows.
      children: tracksInDisplayOrder(tracks).map((track) => otioTrack(clips, track, rate)),
    },
  };
}
