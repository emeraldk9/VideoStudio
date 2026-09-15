import { secondsToFrames, type PlacedSource } from '@shared';

import { useSequenceStore } from '../model/sequenceStore';

/**
 * Beta S151 (G), generalised for S200 — media durations are measurements.
 *
 * A video or audio clip placed from a payload that carried no measurement (a
 * Library item, or a storyboard video's *intended* length) gets its real
 * length as soon as the probe returns. Through `setClips`, not `commitClips`:
 * the correction is the system keeping its own promise, not an edit the user
 * should have to undo in two steps.
 *
 * S200 — **one batch** for the whole placement, however many clips it minted:
 * one `probeSources` round trip and one `setClips`, where the per-drop
 * version made N of each. Stills never probe (nothing to measure), and a
 * clip that already carries a measurement is left alone.
 *
 * Silent when the sequence changed under the probe — a correction aimed at
 * a document that is no longer open would land on the wrong clips.
 */
export function correctDroppedDurations(placed: readonly PlacedSource[], sequenceId: string): void {
  const pending = placed.filter(
    (entry) => entry.item.kind !== 'still' && !entry.item.measured && entry.item.filePath,
  );
  if (pending.length === 0) return;
  const paths = [...new Set(pending.map((entry) => entry.item.filePath!))];

  void window.api.sequence.probeSources(paths).then((probes) => {
    const state = useSequenceStore.getState();
    if (state.document?.sequence.id !== sequenceId) return;
    const fps = state.document.sequence.fps;
    const byClipId = new Map<string, number>();
    for (const entry of pending) {
      const probe = probes[entry.item.filePath!];
      if (!probe?.durationSec) continue;
      byClipId.set(entry.clipId, Math.max(1, secondsToFrames(probe.durationSec, fps)));
    }
    if (byClipId.size === 0) return;
    state.setClips(
      state.document.clips.map((clip) => {
        const durationFrames = byClipId.get(clip.id);
        return durationFrames === undefined ? clip : { ...clip, durationFrames };
      }),
    );
  });
}
