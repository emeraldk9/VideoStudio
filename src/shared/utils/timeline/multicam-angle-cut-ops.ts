/**
 * Pure arithmetic and timeline operations for Multi-Camera Angle Cut Switching
 * & Audio-Follows-Video (AFV) Alignment Engine.
 *
 * Implements:
 * - Multi-Cam layout grid configuration (2-Up, 4-Up, 9-Up, 1+3 Hero)
 * - Audio-Follows-Video (AFV) vs Audio-Locked routing matrix
 * - Dynamic angle cut execution with micro-crossfade anti-pop protection
 * - Waveform cross-correlation sync with Pearson correlation confidence scoring
 * - SMPTE timecode jam-sync offset calculation
 * - Angle tally state machine (Program on-air, Preview next-cut, Idle)
 * - Multi-Cam cut list / EDL event sequence generator
 */

import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { clipAtFrame, layoutTrack } from './layout';
import { splitClipAtFrame } from './edit-ops';
import type { MultiCamAngle, MultiCamClipSettings } from './multi-cam-ops';

/**
 * Formats integer frames into standard SMPTE timecode (HH:MM:SS:FF).
 */
export function formatSmpteTimecode(frames: number, fps: number = 24): string {
  const safeFps = Math.max(1, Math.round(fps));
  const safeFrames = Math.max(0, Math.round(frames));
  const ff = safeFrames % safeFps;
  const totalSeconds = Math.floor(safeFrames / safeFps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return (
    `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:` +
    `${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`
  );
}

/**
 * Parses a standard SMPTE timecode string (HH:MM:SS:FF) into integer frames.
 */
export function parseSmpteTimecode(timecode: string, fps: number = 24): number {
  if (!timecode || typeof timecode !== 'string') return 0;
  const parts = timecode.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.length < 4 || parts.some((p) => isNaN(p))) return 0;
  const [hh, mm, ss, ff] = parts;
  const safeFps = Math.max(1, Math.round(fps));
  return (hh! * 3600 + mm! * 60 + ss!) * safeFps + ff!;
}

export type MultiCamLayoutType = '2up' | '4up' | '9up' | 'hero_1plus3';

export type MultiCamAudioRoutingMode =
  | 'audio_follows_video' // Audio switches to match selected camera angle
  | 'locked_to_primary'   // Audio remains locked to Angle 1 / Master audio
  | 'custom_stem';        // Designated audio angle

export type MultiCamCutMode = 'video_only' | 'audio_only' | 'both_afv';

export interface MultiCamLayoutConfig {
  type: MultiCamLayoutType;
  label: string;
  maxAngles: number;
  columns: number;
  rows: number;
  description: string;
}

export const MULTICAM_LAYOUT_CONFIGS: Record<MultiCamLayoutType, MultiCamLayoutConfig> = {
  '2up': {
    type: '2up',
    label: '2-Up (Dual Angle)',
    maxAngles: 2,
    columns: 2,
    rows: 1,
    description: 'A/B camera two-shot split monitor.',
  },
  '4up': {
    type: '4up',
    label: '4-Up (Quad Matrix)',
    maxAngles: 4,
    columns: 2,
    rows: 2,
    description: 'Broadcast standard 4-camera multiviewer grid.',
  },
  '9up': {
    type: '9up',
    label: '9-Up (Studio Array)',
    maxAngles: 9,
    columns: 3,
    rows: 3,
    description: '9-angle studio live-switching multiviewer.',
  },
  'hero_1plus3': {
    type: 'hero_1plus3',
    label: '1+3 Hero Multiview',
    maxAngles: 4,
    columns: 2,
    rows: 3,
    description: 'Dominant hero program angle with 3 auxiliary preview tiles.',
  },
};

export interface MultiCamCutExecutionResult {
  clips: SequenceClip[];
  cutClipId: string | null;
  switchedAngleIndex: number;
  cutMode: MultiCamCutMode;
  audioCrossfadeApplied: boolean;
}

export interface WaveformSyncResult {
  offsetFrames: number;
  confidence: number;
  quality: 'high' | 'medium' | 'low';
}

export interface MultiCamCutListEntry {
  cutIndex: number;
  clipId: string;
  angleIndex: number;
  angleName: string;
  cameraLabel: string;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startTimecode: string;
  endTimecode: string;
}

/**
 * Calculates normalized Pearson cross-correlation between two audio amplitude envelopes.
 * Returns the optimum frame offset with statistical confidence score in [0, 1].
 */
export function calculateMultiCamWaveformSync(
  envelopeRef: number[],
  envelopeTarget: number[],
  maxSearchFrames: number = 60
): WaveformSyncResult {
  if (
    !envelopeRef ||
    !envelopeTarget ||
    envelopeRef.length === 0 ||
    envelopeTarget.length === 0
  ) {
    return { offsetFrames: 0, confidence: 0, quality: 'low' };
  }

  const searchWindow = Math.min(
    Math.max(1, Math.round(maxSearchFrames)),
    Math.floor(Math.min(envelopeRef.length, envelopeTarget.length) / 2)
  );

  if (searchWindow < 1) {
    return { offsetFrames: 0, confidence: 0, quality: 'low' };
  }

  // Calculate means
  let sumRef = 0;
  let sumTarget = 0;
  for (let i = 0; i < envelopeRef.length; i++) sumRef += envelopeRef[i]!;
  for (let i = 0; i < envelopeTarget.length; i++) sumTarget += envelopeTarget[i]!;
  const meanRef = sumRef / envelopeRef.length;
  const meanTarget = sumTarget / envelopeTarget.length;

  let bestLag = 0;
  let bestCorrelation = -1;

  for (let lag = -searchWindow; lag <= searchWindow; lag++) {
    const startT = Math.max(0, -lag);
    const endT = Math.min(envelopeRef.length, envelopeTarget.length - lag);
    if (endT <= startT) continue;

    let cov = 0;
    let varRef = 0;
    let varTarget = 0;

    for (let t = startT; t < endT; t++) {
      const diffRef = envelopeRef[t]! - meanRef;
      const diffTarget = envelopeTarget[t + lag]! - meanTarget;
      cov += diffRef * diffTarget;
      varRef += diffRef * diffRef;
      varTarget += diffTarget * diffTarget;
    }

    const denom = Math.sqrt(varRef * varTarget);
    if (denom > 1e-9) {
      const r = cov / denom;
      if (r > bestCorrelation) {
        bestCorrelation = r;
        bestLag = lag;
      }
    }
  }

  const confidence = Math.max(0, Math.min(1, Math.round(bestCorrelation * 100) / 100));
  let quality: 'high' | 'medium' | 'low' = 'low';
  if (confidence >= 0.75) {
    quality = 'high';
  } else if (confidence >= 0.45) {
    quality = 'medium';
  }

  return {
    offsetFrames: bestLag,
    confidence,
    quality,
  };
}

/**
 * Calculates temporal sync offset in frames between two SMPTE timecode strings (HH:MM:SS:FF).
 */
export function calculateTimecodeSyncOffset(
  refTimecode: string,
  targetTimecode: string,
  fps: number = 24
): number {
  if (!refTimecode || !targetTimecode) return 0;
  const refFrame = parseSmpteTimecode(refTimecode, fps);
  const targetFrame = parseSmpteTimecode(targetTimecode, fps);
  return targetFrame - refFrame;
}

/**
 * Resolves camera tally display state for a multi-camera angle.
 */
export function resolveAngleTallyState(
  angleIndex: number,
  activeAngleIndex: number,
  previewAngleIndex?: number
): 'program' | 'preview' | 'idle' {
  if (angleIndex === activeAngleIndex) {
    return 'program'; // Red on-air tally
  }
  if (previewAngleIndex !== undefined && angleIndex === previewAngleIndex) {
    return 'preview'; // Green cued tally
  }
  return 'idle';
}

/**
 * Executes a live or parked camera angle cut on a MultiCam clip with Audio-Follows-Video (AFV) support.
 */
export function executeMultiCamAngleCut(
  clips: SequenceClip[],
  tracks: readonly SequenceTrack[],
  activeClipId: string,
  playheadFrame: number,
  targetAngleIndex: number,
  options?: {
    routingMode?: MultiCamAudioRoutingMode;
    cutMode?: MultiCamCutMode;
    crossfadeFrames?: number;
    mintId?: () => string;
  }
): MultiCamCutExecutionResult {
  const routingMode = options?.routingMode ?? 'audio_follows_video';
  const cutMode = options?.cutMode ?? 'both_afv';
  const crossfadeFrames = options?.crossfadeFrames ?? 2;
  const mintId = options?.mintId ?? (() => crypto.randomUUID());

  const safeClips = clips.map((c) => ({
    ...c,
    overrides: c.overrides ?? [],
  }));

  const clip = safeClips.find((c) => c.id === activeClipId);
  if (!clip) {
    return {
      clips,
      cutClipId: null,
      switchedAngleIndex: targetAngleIndex,
      cutMode,
      audioCrossfadeApplied: false,
    };
  }

  const multiCam = clip.effects?.multiCam;
  const track = tracks.find((t) => t.id === clip.trackId);
  if (!track) {
    return {
      clips,
      cutClipId: null,
      switchedAngleIndex: targetAngleIndex,
      cutMode,
      audioCrossfadeApplied: false,
    };
  }

  const placed = clipAtFrame(layoutTrack(safeClips, track), playheadFrame);
  const isInsideClip = placed && placed.clip.id === clip.id;
  const offset = isInsideClip ? Math.round(playheadFrame - placed.startFrames) : 0;

  // Case 1: In-place switch if parked at start/end or playhead outside
  if (!isInsideClip || offset <= 1 || offset >= (placed?.clip.durationFrames ?? 0) - 1) {
    const updatedMultiCam: MultiCamClipSettings = {
      ...(multiCam ?? {
        enabled: true,
        activeAngleIndex: 0,
        angles: [],
        audioFollowsVideo: routingMode === 'audio_follows_video',
        syncMethod: 'audio_waveform',
      }),
      enabled: true,
      activeAngleIndex: targetAngleIndex,
      audioFollowsVideo: routingMode === 'audio_follows_video',
    };

    const targetAngle = updatedMultiCam.angles[targetAngleIndex];
    const updatedClips = clips.map((c) =>
      c.id === clip.id
        ? {
            ...c,
            filePath: targetAngle?.filePath || c.filePath,
            effects: {
              ...c.effects,
              multiCam: updatedMultiCam,
            },
          }
        : c
    );

    return {
      clips: updatedClips,
      cutClipId: clip.id,
      switchedAngleIndex: targetAngleIndex,
      cutMode,
      audioCrossfadeApplied: false,
    };
  }

  // Case 2: Mid-clip razor cut at playheadFrame
  const newClipId = mintId();
  const nextClips = splitClipAtFrame(safeClips, track, playheadFrame, newClipId);
  if (!nextClips) {
    return {
      clips,
      cutClipId: null,
      switchedAngleIndex: targetAngleIndex,
      cutMode,
      audioCrossfadeApplied: false,
    };
  }

  const shouldCrossfadeAudio =
    routingMode === 'audio_follows_video' &&
    (cutMode === 'both_afv' || cutMode === 'audio_only') &&
    crossfadeFrames > 0;

  const updatedClips = nextClips.map((c) => {
    if (c.id === clip.id && shouldCrossfadeAudio) {
      // Apply micro-fadeout to predecessor
      return {
        ...c,
        fadeOutFrames: Math.max(c.fadeOutFrames ?? 0, crossfadeFrames),
      };
    }

    if (c.id === newClipId) {
      const currentMultiCam = c.effects?.multiCam;
      const updatedMultiCam: MultiCamClipSettings = {
        ...(currentMultiCam ?? {
          enabled: true,
          activeAngleIndex: 0,
          angles: [],
          audioFollowsVideo: routingMode === 'audio_follows_video',
          syncMethod: 'audio_waveform',
        }),
        enabled: true,
        activeAngleIndex: targetAngleIndex,
        audioFollowsVideo: routingMode === 'audio_follows_video',
      };

      const targetAngle = updatedMultiCam.angles[targetAngleIndex];
      return {
        ...c,
        filePath: targetAngle?.filePath || c.filePath,
        fadeInFrames: shouldCrossfadeAudio ? Math.max(c.fadeInFrames ?? 0, crossfadeFrames) : c.fadeInFrames,
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
    cutMode,
    audioCrossfadeApplied: shouldCrossfadeAudio,
  };
}

/**
 * Scans a sequence of clips on a track and produces an EDL-compatible MultiCam cut list.
 */
export function generateMultiCamCutList(
  clips: SequenceClip[],
  trackId: string,
  fps: number = 24
): MultiCamCutListEntry[] {
  const trackClips = clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));
  const entries: MultiCamCutListEntry[] = [];

  let cutIndex = 1;
  for (const c of trackClips) {
    const multiCam = c.effects?.multiCam;
    if (!multiCam || !multiCam.enabled) continue;

    const angleIndex = multiCam.activeAngleIndex ?? 0;
    const angle = multiCam.angles[angleIndex];
    const angleName = angle?.name ?? `Angle ${angleIndex + 1}`;
    const cameraLabel = angle?.cameraLabel ?? `Cam ${angleIndex + 1}`;
    const startFrame = c.startFrames ?? 0;
    const duration = c.durationFrames;
    const endFrame = startFrame + duration;

    entries.push({
      cutIndex: cutIndex++,
      clipId: c.id,
      angleIndex,
      angleName,
      cameraLabel,
      startFrame,
      endFrame,
      durationFrames: duration,
      startTimecode: formatSmpteTimecode(startFrame, fps),
      endTimecode: formatSmpteTimecode(endFrame, fps),
    });
  }

  return entries;
}
