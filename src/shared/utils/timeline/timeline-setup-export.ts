import {
  spineTrackOf,
  type SequenceClip,
  type SequenceDocument,
  type SequenceMarker,
} from '../../types/sequence';
import { framesToSeconds } from './frames';
import { layoutTrack } from './layout';

/**
 * Beta S231 — the export half of the setup round-trip.
 *
 * Import-only would mean the workflow a sheet-based editor actually wants —
 * export, tune a hundred rows in a spreadsheet, re-import — starts by
 * hand-typing a hundred ids. This writes exactly the JSON shape
 * `parseTimelineSetupFile` reads: `id` is the storyboard shot id when the
 * clip has one (the only key that survives re-layout), the file basename
 * rides for pool clips, and every field is emitted only when it says
 * something — a clip on defaults exports as id + duration, nothing else, so
 * the file stays a document a person can scan.
 */

function setupEntry(clip: SequenceClip, fps: number): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  if (clip.storyShotId) entry.id = clip.storyShotId;
  if (clip.filePath) entry.file = clip.filePath.replace(/\\/g, '/').split('/').pop();
  if (clip.label) entry.heading = clip.label;
  entry.durationSeconds = Number(framesToSeconds(clip.durationFrames, fps).toFixed(3));

  if (clip.transitionIn !== 'cut') {
    entry.transitionIn = clip.transitionIn;
    entry.transitionFrames = clip.transitionFrames;
  }
  if ((clip.transitionOut ?? 'cut') !== 'cut') {
    entry.transitionOut = clip.transitionOut;
    entry.transitionOutFrames = clip.transitionOutFrames ?? 0;
  }
  if (clip.effects?.transition) entry.transitionParams = clip.effects.transition;
  if (clip.effects?.motion) entry.motion = clip.effects.motion;
  if ((clip.audioOffsetFrames ?? 0) !== 0) entry.audioOffsetFrames = clip.audioOffsetFrames;
  return entry;
}

/** The spine's setup as pretty-printed JSON — what the save dialog writes. */
export function buildTimelineSetupJson(
  document: SequenceDocument,
  markers: readonly SequenceMarker[] = [],
): string {
  const spine = spineTrackOf(document);
  const placed = spine ? layoutTrack(document.clips, spine) : [];
  return JSON.stringify(
    {
      version: 1,
      sequence: { fps: document.sequence.fps },
      // S233 — markers ride the same file, locks included, so a cue sheet's
      // sync points can travel with the cut.
      ...(markers.length > 0
        ? {
            markers: markers.map((marker) => ({
              frame: marker.frame,
              ...(marker.name ? { name: marker.name } : {}),
              color: marker.color,
              ...(marker.locked ? { locked: true } : {}),
            })),
          }
        : {}),
      clips: placed.map((item) => setupEntry(item.clip, document.sequence.fps)),
    },
    null,
    2,
  );
}
