import { MEDIA_IMPORT_EXTENSIONS, type SequenceClip } from '../../types/sequence';
import type { WatermarkCleanedStamp, WatermarkSourceRef } from '../../types/watermark';

/**
 * Beta S353 — which watermark source a timeline clip *is*.
 *
 * The Timeline holds a resolved absolute `filePath` on every clip, so it is the
 * one surface that can point at a file through three different identities at
 * once. Cleaning it through the wrong one is not a cosmetic mistake: a clip
 * prefilled from a storyboard take that gets cleaned as a bare imported file
 * leaves `StoryTakeRef.cleaned` unwritten, and the Story Builder goes on
 * offering to clean a picture that has already been cleaned — the two surfaces
 * disagreeing about one file on disk.
 *
 * So the precedence is fixed here, once, in `@shared`, for the reason
 * `selectWatermarkCleanTargets` gives about its own placement: the number on a
 * row and the work actually done cannot be allowed to diverge, and one function
 * is the only way to guarantee it.
 */

/** One file the Timeline can hand to the cleaner, with what a row needs to name it. */
export interface TimelineWatermarkTarget {
  ref: WatermarkSourceRef;
  /** Basename, for the modal's list. Never shown as a full path. */
  label: string;
  mediaType: 'image' | 'video';
  /** The file itself, so the caller can dedupe and relink against it. */
  filePath: string;
  /**
   * Every clip on the sequence pointing at this file — usually one, and the
   * reason this is a list is the case that matters: three clips of one plate
   * are **one** item of work. Cleaning them as three would run the engine three
   * times and race three writers onto one output path.
   */
  clipIds: string[];
}

/**
 * A clip's watermark identity, or `null` when it has none.
 *
 * `null` for text and effect clips (no file at all) and for audio (a watermark
 * is a picture) — stated by omission rather than by a status, so a caller that
 * forgets to filter cannot queue silence for a 7-second calibration.
 */
export function watermarkSourceForClip(
  clip: Pick<SequenceClip, 'sourceKind' | 'filePath' | 'outputId' | 'sourceTakeId'>,
  mediaIdByPath: ReadonlyMap<string, string>,
): WatermarkSourceRef | null {
  if (clip.sourceKind !== 'still' && clip.sourceKind !== 'video') return null;
  if (!clip.filePath) return null;

  // The take first. A take is the *most specific* thing this file is: it
  // carries its own approval, its own `cleaned` stamp, and a Story Builder
  // surface that reads both. An outputs row for the same file is a downstream
  // record of it; the imported-media row is only "the pool has seen this path".
  if (clip.sourceTakeId) return { kind: 'story-take', sourceId: clip.sourceTakeId };
  if (clip.outputId) return { kind: 'output', sourceId: clip.outputId };

  const mediaId = mediaIdByPath.get(clip.filePath);
  return mediaId ? { kind: 'sequence-media', sourceId: mediaId } : null;
}

/** `MEDIA_IMPORT_EXTENSIONS`' answer, as the two words the batch modal speaks. */
export function watermarkMediaTypeOf(filePath: string): 'image' | 'video' {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_IMPORT_EXTENSIONS.video.includes(extension) ? 'video' : 'image';
}

function basenameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/**
 * The clips, as the deduplicated list of files the cleaner would act on.
 *
 * Ordered by first appearance, so the modal's list reads in cut order rather
 * than in whatever order a multi-select happened to accumulate.
 *
 * A clip whose file the pool has no record of contributes nothing. That is not
 * a silent drop — it is the honest answer to "clean this": the main process
 * refuses a path it has no record of anyway (`bootstrap.ts`'s allowlist), so
 * offering the item would only move the refusal later, into a batch the user
 * has already committed to.
 */
export function selectTimelineWatermarkTargets(
  clips: readonly SequenceClip[],
  mediaIdByPath: ReadonlyMap<string, string>,
): TimelineWatermarkTarget[] {
  const byKey = new Map<string, TimelineWatermarkTarget>();

  for (const clip of clips) {
    const ref = watermarkSourceForClip(clip, mediaIdByPath);
    if (!ref || !clip.filePath) continue;

    // Keyed by the *reference*, not the path: two clips resolving to one take
    // are one item, and a path reached through two different identities would
    // be two — which is the double-clean this dedupe exists to prevent.
    const key = `${ref.kind}:${ref.sourceId}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.clipIds.push(clip.id);
      continue;
    }
    byKey.set(key, {
      ref,
      label: basenameOf(clip.filePath),
      mediaType: watermarkMediaTypeOf(clip.filePath),
      filePath: clip.filePath,
      clipIds: [clip.id],
    });
  }

  return [...byKey.values()];
}

/**
 * Whether a stored stamp still describes the file on disk.
 *
 * The whole reason {@link WatermarkCleanedStamp} carries `size`/`mtimeMs`: a
 * story take is immutable once rendered, but an imported file sits on a path
 * the user can overwrite from outside the app, and a `replace` clean rewrites a
 * Library row's bytes in place. A stamp that no longer matches is **not a
 * stamp** — the answer becomes *unknown*, and every consumer reads unknown as
 * "not known to be clean".
 *
 * `null` identity (the file could not be stat'd) is also unknown. Refusing to
 * answer is the correct move for a file the app cannot currently see; claiming
 * it is clean because it once was is how a marked frame reaches a delivery.
 */
export function isCleanStampCurrent(
  stamp: WatermarkCleanedStamp | null | undefined,
  identity: { size: number; mtimeMs: number } | null | undefined,
): boolean {
  if (!stamp || !identity) return false;
  return stamp.size === identity.size && stamp.mtimeMs === Math.round(identity.mtimeMs);
}
