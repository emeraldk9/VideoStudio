import {
  spineTrackOf,
  type SequenceClip,
  type SequenceDocument,
  type SequenceMarker,
  type SequenceTrack,
} from '../../types/sequence';
import { framesToSeconds } from './frames';
import { layoutTrack } from './layout';

/**
 * Single clip entry for lightweight setup export (v1).
 */
function setupEntryV1(clip: SequenceClip, fps: number): Record<string, unknown> {
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
  if (clip.effects?.whiteboard) entry.whiteboard = clip.effects.whiteboard;
  if (clip.effects?.filters) entry.filters = clip.effects.filters;
  if ((clip.audioOffsetFrames ?? 0) !== 0) entry.audioOffsetFrames = clip.audioOffsetFrames;
  return entry;
}

/**
 * Rich clip entry for full timeline JSON export (v2) controlling all properties:
 * timestamps, durations, transitions, motions, sketches, and effects.
 */
function setupEntryV2(
  clip: SequenceClip,
  track: SequenceTrack | undefined,
  startFrames: number,
  fps: number,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: clip.id,
    trackId: clip.trackId,
    trackName: track?.name,
    trackKind: track?.kind,
    orderIndex: clip.orderIndex,
    sourceKind: clip.sourceKind,
    label: clip.label,
    startFrames,
    startSeconds: Number(framesToSeconds(startFrames, fps).toFixed(3)),
    durationFrames: clip.durationFrames,
    durationSeconds: Number(framesToSeconds(clip.durationFrames, fps).toFixed(3)),
  };

  if (clip.storyShotId) entry.storyShotId = clip.storyShotId;
  if (clip.sourceTakeId) entry.sourceTakeId = clip.sourceTakeId;
  if (clip.filePath) {
    entry.filePath = clip.filePath;
    entry.file = clip.filePath.replace(/\\/g, '/').split('/').pop();
  }
  if (clip.sourceInFrames != null) entry.sourceInFrames = clip.sourceInFrames;
  if (clip.sourceOutFrames != null) entry.sourceOutFrames = clip.sourceOutFrames;

  const rawClip = clip as unknown as Record<string, unknown>;

  // Transitions
  entry.transitionIn = clip.transitionIn ?? rawClip.transitionType ?? 'cut';
  entry.transitionFrames = clip.transitionFrames ?? rawClip.transitionInDurationFrames ?? 0;
  if (clip.transitionOut && clip.transitionOut !== 'cut') {
    entry.transitionOut = clip.transitionOut;
    entry.transitionOutFrames = clip.transitionOutFrames ?? 0;
  }
  const transition = clip.effects?.transition ?? rawClip.transitionParams ?? rawClip.transition;
  if (transition) {
    entry.transition = transition;
    entry.transitionParams = transition;
  }

  // Motion
  const motionPreset = clip.motionPreset ?? rawClip.motionType;
  if (motionPreset && motionPreset !== 'none') {
    entry.motionPreset = motionPreset;
  }
  const motion = clip.effects?.motion ?? rawClip.motion;
  if (motion) {
    entry.motion = motion;
  }

  // Sketches / Whiteboard
  const whiteboard = clip.effects?.whiteboard ?? rawClip.whiteboard;
  if (whiteboard) {
    entry.whiteboard = whiteboard;
  }

  // All Effects & Filters
  const filters = clip.effects?.filters ?? rawClip.filterPreset;
  if (filters) {
    entry.filters = filters;
  }
  if (clip.effects?.transform) {
    entry.transform = clip.effects.transform;
  }
  if (clip.effects?.speed && clip.effects.speed !== 1) {
    entry.speed = clip.effects.speed;
  }
  if (clip.effects?.text) {
    entry.text = clip.effects.text;
  }
  if (clip.effects?.videoFade) {
    entry.videoFade = clip.effects.videoFade;
  }

  // Audio Controls
  if (clip.gainDb !== 0) entry.gainDb = clip.gainDb;
  if (clip.fadeInFrames > 0) entry.fadeInFrames = clip.fadeInFrames;
  if (clip.fadeOutFrames > 0) entry.fadeOutFrames = clip.fadeOutFrames;
  if (clip.sourceAudioEnabled !== undefined) entry.sourceAudioEnabled = clip.sourceAudioEnabled;
  if (clip.duckExempt) entry.duckExempt = clip.duckExempt;
  if ((clip.audioOffsetFrames ?? 0) !== 0) entry.audioOffsetFrames = clip.audioOffsetFrames;

  // Keyframes
  if (clip.keyframes && clip.keyframes.length > 0) {
    entry.keyframes = clip.keyframes;
  }

  return entry;
}

/** The spine's setup as pretty-printed JSON — what the save dialog writes (v1). */
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
      ...(markers.length > 0
        ? {
            markers: markers.map((marker) => ({
              frame: marker.frame,
              ...(marker.name ? { name: marker.name } : {}),
              color: marker.color,
              ...(marker.locked ? { locked: true } : {}),
              ...(marker.notes ? { notes: marker.notes } : {}),
            })),
          }
        : {}),
      clips: placed.map((item) => setupEntryV1(item.clip, document.sequence.fps)),
    },
    null,
    2,
  );
}

/**
 * Full Studio JSON Export (v2): Comprehensive serialization of all tracks,
 * timestamps, durations, transitions, motions, sketches, and effects.
 */
export function buildTimelineFullJson(
  document: SequenceDocument,
  markers: readonly SequenceMarker[] = [],
): string {
  const fps = document.sequence.fps;
  const tracksById = new Map(document.tracks.map((t) => [t.id, t]));

  // Compute layout and start frames for all tracks
  const placedClips: Record<string, unknown>[] = [];
  let totalSequenceFrames = 0;

  for (const track of document.tracks) {
    const trackClips = layoutTrack(document.clips, track);
    for (const item of trackClips) {
      placedClips.push(setupEntryV2(item.clip, track, item.startFrames, fps));
      const clipEnd = item.startFrames + item.clip.durationFrames;
      if (clipEnd > totalSequenceFrames) {
        totalSequenceFrames = clipEnd;
      }
    }
  }

  return JSON.stringify(
    {
      format: 'videostudio-timeline-full-v2',
      version: 2,
      exportedAt: new Date().toISOString(),
      sequence: {
        id: document.sequence.id,
        name: document.sequence.name,
        fps: document.sequence.fps,
        width: document.sequence.width,
        height: document.sequence.height,
        durationFrames: totalSequenceFrames,
        durationSeconds: Number(framesToSeconds(totalSequenceFrames, fps).toFixed(3)),
        spineTrackId: document.sequence.spineTrackId ?? null,
        storyProjectRoot: document.sequence.storyProjectRoot ?? null,
        storyEpisodeId: document.sequence.storyEpisodeId ?? null,
        stillDurationSource: document.sequence.stillDurationSource ?? 'shot',
      },
      tracks: document.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        kind: track.kind,
        role: track.role ?? null,
        orderIndex: track.orderIndex,
        magnetic: track.magnetic,
        locked: track.locked,
        muted: track.muted,
        videoEnabled: track.videoEnabled,
        heightPx: track.heightPx,
      })),
      markers: Array.isArray(markers)
        ? markers.map((marker) => ({
            frame: marker.frame,
            seconds: Number(framesToSeconds(marker.frame, fps).toFixed(3)),
            name: marker.name,
            color: marker.color,
            locked: marker.locked,
            ...(marker.notes ? { notes: marker.notes } : {}),
          }))
        : [],
      clips: placedClips,
    },
    null,
    2,
  );
}
