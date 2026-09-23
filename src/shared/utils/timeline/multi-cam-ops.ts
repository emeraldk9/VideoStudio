import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { formatTimecode } from './frames';
import { clipAtFrame, layoutTrack } from './layout';
import { splitClipAtFrame } from './edit-ops';

export type MultiCamSyncMethod = 'audio_waveform' | 'in_point' | 'timecode';

export interface MultiCamAngle {
  id: string;
  name: string;
  cameraLabel: string;        // e.g. "Cam A - Wide", "Cam B - Close-Up"
  sourceMediaId?: string;
  filePath?: string;          // Direct media file path for this angle
  syncOffsetFrames: number;   // Relative frame offset compared to primary angle
  colorTag?: string;          // Hex or color identifier
}

export interface MultiCamClipSettings {
  enabled: boolean;
  activeAngleIndex: number;   // 0 to (angles.length - 1)
  angles: MultiCamAngle[];
  audioFollowsVideo: boolean; // If false, audio is locked to master track/angle 0
  syncMethod: MultiCamSyncMethod;
}

export const DEFAULT_MULTICAM_SETTINGS: MultiCamClipSettings = {
  enabled: false,
  activeAngleIndex: 0,
  angles: [
    { id: 'angle-1', name: 'Angle 1', cameraLabel: 'Cam A (Master)', syncOffsetFrames: 0, colorTag: '#3b82f6' },
    { id: 'angle-2', name: 'Angle 2', cameraLabel: 'Cam B (Close-up)', syncOffsetFrames: 0, colorTag: '#10b981' },
  ],
  audioFollowsVideo: false,
  syncMethod: 'audio_waveform',
};

/**
 * Calculates the temporal frame lag (offset) between two audio amplitude envelopes using cross-correlation.
 * Returns the frame offset by which envelopeB must be shifted to align with envelopeA.
 * A positive offset means envelopeB lags envelopeA; negative means envelopeB leads envelopeA.
 */
export function calculateCrossCorrelationOffset(
  envelopeA: number[],
  envelopeB: number[],
  maxSearchFrames: number = 60,
): number {
  if (!envelopeA || !envelopeB || envelopeA.length === 0 || envelopeB.length === 0) {
    return 0;
  }

  const searchWindow = Math.min(
    Math.max(1, Math.round(maxSearchFrames)),
    Math.floor(Math.min(envelopeA.length, envelopeB.length) / 2),
  );

  if (searchWindow < 1) {
    return 0;
  }

  let bestLag = 0;
  let maxCorrelation = -Infinity;

  for (let lag = -searchWindow; lag <= searchWindow; lag++) {
    let sum = 0;
    let count = 0;

    const startT = Math.max(0, -lag);
    const endT = Math.min(envelopeA.length, envelopeB.length - lag);

    for (let t = startT; t < endT; t++) {
      const sampleA = envelopeA[t]!;
      const sampleB = envelopeB[t + lag]!;
      sum += sampleA * sampleB;
      count++;
    }

    if (count > 0) {
      const normalized = sum / count;
      if (normalized > maxCorrelation) {
        maxCorrelation = normalized;
        bestLag = lag;
      }
    }
  }

  return bestLag;
}

/**
 * Non-destructively switches the active camera angle of a multi-camera clip.
 * Clamps targetIndex within valid angle range.
 */
export function switchActiveAngle(
  settings: MultiCamClipSettings | undefined,
  targetIndex: number,
): MultiCamClipSettings {
  const current = settings ?? DEFAULT_MULTICAM_SETTINGS;
  if (!current.angles || current.angles.length === 0) {
    return { ...current, activeAngleIndex: 0 };
  }

  const clampedIndex = Math.max(0, Math.min(current.angles.length - 1, Math.round(targetIndex)));
  return {
    ...current,
    enabled: true,
    activeAngleIndex: clampedIndex,
  };
}

/**
 * Creates a configured multi-camera group settings object from a list of camera names or labels.
 */
export function createMultiCamGroup(
  cameraNames: string[] = ['Cam A - Wide', 'Cam B - Close-up'],
): MultiCamClipSettings {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  const safeNames = cameraNames.length > 0 ? cameraNames : ['Cam A', 'Cam B'];

  const angles: MultiCamAngle[] = safeNames.map((name, idx) => ({
    id: `angle-${idx + 1}`,
    name: `Angle ${idx + 1}`,
    cameraLabel: name,
    syncOffsetFrames: 0,
    colorTag: colors[idx % colors.length]!,
  }));

  return {
    enabled: true,
    activeAngleIndex: 0,
    angles,
    audioFollowsVideo: false,
    syncMethod: 'audio_waveform',
  };
}

export interface LiveMultiCamCutResult {
  clips: SequenceClip[];
  cutClipId: string | null;
  switchedAngleIndex: number;
}

/**
 * Executes a dynamic, live cut on a multi-camera clip at the playhead position.
 * If playback is active, splits the clip at the playhead and switches the trailing clip
 * to the target angle. If the playhead is right at clip start/outside, switches angle in place.
 */
export function executeLiveMultiCamCut(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  activeClipId: string,
  playheadFrame: number,
  targetAngleIndex: number,
  mintId: () => string = () => crypto.randomUUID(),
): LiveMultiCamCutResult {
  const clip = clips.find((c) => c.id === activeClipId);
  if (!clip) {
    return { clips, cutClipId: null, switchedAngleIndex: targetAngleIndex };
  }

  const multiCam = clip.effects?.multiCam;
  const track = tracks.find((t) => t.id === clip.trackId);
  if (!track) {
    return { clips, cutClipId: null, switchedAngleIndex: targetAngleIndex };
  }

  const placed = clipAtFrame(layoutTrack(clips, track), playheadFrame);
  if (!placed || placed.clip.id !== clip.id) {
    // Playhead outside clip: switch angle directly without cutting
    const updated = switchActiveAngle(multiCam, targetAngleIndex);
    const targetAngle = updated.angles[updated.activeAngleIndex];
    const updatedClips = clips.map((c) =>
      c.id === clip.id
        ? {
            ...c,
            filePath: targetAngle?.filePath || c.filePath,
            effects: {
              ...c.effects,
              multiCam: updated,
            },
          }
        : c,
    );
    return { clips: updatedClips, cutClipId: clip.id, switchedAngleIndex: targetAngleIndex };
  }

  const offset = Math.round(playheadFrame - placed.startFrames);
  // If playhead is right at or before the start of the clip, switch angle directly
  if (offset <= 1) {
    const updated = switchActiveAngle(multiCam, targetAngleIndex);
    const targetAngle = updated.angles[updated.activeAngleIndex];
    const updatedClips = clips.map((c) =>
      c.id === clip.id
        ? {
            ...c,
            filePath: targetAngle?.filePath || c.filePath,
            effects: {
              ...c.effects,
              multiCam: updated,
            },
          }
        : c,
    );
    return { clips: updatedClips, cutClipId: clip.id, switchedAngleIndex: targetAngleIndex };
  }

  // If playhead is at the very end of the clip, no split needed
  if (offset >= placed.clip.durationFrames - 1) {
    return { clips, cutClipId: null, switchedAngleIndex: targetAngleIndex };
  }

  // Razor split at playheadFrame
  const newClipId = mintId();
  const nextClips = splitClipAtFrame(clips, track, playheadFrame, newClipId);
  if (!nextClips) {
    return { clips, cutClipId: null, switchedAngleIndex: targetAngleIndex };
  }

  // Update trailing split clip to the newly selected angle
  const updatedClips = nextClips.map((c) => {
    if (c.id === newClipId) {
      const updatedMultiCam = switchActiveAngle(c.effects?.multiCam, targetAngleIndex);
      const targetAngle = updatedMultiCam.angles[updatedMultiCam.activeAngleIndex];
      return {
        ...c,
        filePath: targetAngle?.filePath || c.filePath,
        effects: {
          ...c.effects,
          multiCam: updatedMultiCam,
        },
      };
    }
    return c;
  });

  return {
    clips: updatedClips,
    cutClipId: newClipId,
    switchedAngleIndex: targetAngleIndex,
  };
}

/**
 * Resolves the precise source playback time in seconds for a specific angle of a MultiCam clip.
 */
export function resolveAngleSourceTime(
  clip: SequenceClip,
  angleIndex: number,
  playheadFrame: number,
  fps: number = 24,
): {
  sourceTimeSeconds: number;
  syncOffsetFrames: number;
  angle: MultiCamAngle | null;
  isActive: boolean;
} {
  const multiCam = clip.effects?.multiCam;
  const angles = multiCam?.angles ?? [];
  const safeIndex = Math.max(0, Math.min(angles.length - 1, angleIndex));
  const angle = angles[safeIndex] ?? null;
  const syncOffset = angle?.syncOffsetFrames ?? 0;

  const clipStart = clip.startFrames ?? 0;
  const sourceIn = clip.sourceInFrames ?? 0;
  const elapsedFrames = Math.max(0, playheadFrame - clipStart);

  // Time in angle source = sourceIn + elapsedFrames + syncOffset
  const effectiveFrame = Math.max(0, sourceIn + elapsedFrames + syncOffset);
  const sourceTimeSeconds = effectiveFrame / Math.max(1, fps);

  return {
    sourceTimeSeconds,
    syncOffsetFrames: syncOffset,
    angle,
    isActive: multiCam ? multiCam.activeAngleIndex === angleIndex : angleIndex === 0,
  };
}

export interface MultiCamGridTileInfo {
  angleIndex: number;
  angle: MultiCamAngle;
  isOnAir: boolean;
  timeSeconds: number;
  timecode: string;
  tallyColor: 'program' | 'preview' | 'idle';
}

/**
 * Prepares the 4-up quad layout tiles with synchronized timecode, tally state, and angle metadata.
 */
export function buildMultiCamGridTiles(
  clip: SequenceClip,
  playheadFrame: number,
  fps: number = 24,
): MultiCamGridTileInfo[] {
  const multiCam = clip.effects?.multiCam ?? DEFAULT_MULTICAM_SETTINGS;
  const angles = multiCam.angles.length > 0 ? multiCam.angles : DEFAULT_MULTICAM_SETTINGS.angles;

  return angles.map((angle, index) => {
    const { sourceTimeSeconds } = resolveAngleSourceTime(clip, index, playheadFrame, fps);
    const isOnAir = multiCam.enabled && multiCam.activeAngleIndex === index;

    return {
      angleIndex: index,
      angle,
      isOnAir,
      timeSeconds: sourceTimeSeconds,
      timecode: formatTimecode(Math.round(sourceTimeSeconds * fps), fps),
      tallyColor: isOnAir ? 'program' : 'idle',
    };
  });
}
