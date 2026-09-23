/**
 * Audio Waveform Auto-Sync & Dual-System Sound Alignment Operations (Milestone S76)
 *
 * Professional dual-system sound workflows record reference scratch audio
 * on-camera and high-fidelity dialogue on an external sound recorder (Zoom,
 * Sound Devices, wireless lavaliers). This module provides:
 * 1. Normalized cross-correlation between audio envelopes to compute temporal frame lag.
 * 2. 1-click dual-system alignment, automatic camera scratch muting, and A/V linking.
 * 3. Bidirectional clip linking, unlinking, and drag displacement propagation.
 */

import type { SequenceClip, SequenceTrack } from '../../types/sequence';

export interface AudioSyncResult {
  /** The temporal frame offset by which target audio must shift to align with reference. */
  offsetFrames: number;
  /** Normalized Pearson cross-correlation score between -1.0 and 1.0. */
  correlationScore: number;
  /** Confidence categorization based on correlation peak clarity. */
  confidence: 'high' | 'medium' | 'low';
}

export interface DualSystemSyncOptions {
  /**
   * Whether to mute the video clip's onboard camera scratch audio upon alignment.
   * @default true
   */
  muteScratchAudio?: boolean;
  /**
   * Whether to link the video and audio clips bidirectionally.
   * @default true
   */
  linkClips?: boolean;
}

/**
 * Computes the temporal frame lag (offset) between reference audio peaks and target audio peaks
 * using Pearson normalized cross-correlation over a sliding search window.
 *
 * A positive offset means target audio lags behind reference; shifting target by +offset aligns it.
 */
export function calculateAudioWaveformSync(
  refPeaks: readonly number[],
  targetPeaks: readonly number[],
  maxSearchFrames: number = 120,
): AudioSyncResult {
  if (!refPeaks || !targetPeaks || refPeaks.length === 0 || targetPeaks.length === 0) {
    return { offsetFrames: 0, correlationScore: 0, confidence: 'low' };
  }

  const searchWindow = Math.min(
    Math.max(1, Math.round(maxSearchFrames)),
    Math.floor(Math.min(refPeaks.length, targetPeaks.length) / 2),
  );

  if (searchWindow < 1) {
    return { offsetFrames: 0, correlationScore: 0, confidence: 'low' };
  }

  // Calculate means
  const meanRef = refPeaks.reduce((a, b) => a + b, 0) / refPeaks.length;
  const meanTarget = targetPeaks.reduce((a, b) => a + b, 0) / targetPeaks.length;

  // Zero-mean centered arrays
  const zeroRef = refPeaks.map((val) => val - meanRef);
  const zeroTarget = targetPeaks.map((val) => val - meanTarget);

  let bestLag = 0;
  let maxCorrelation = -Infinity;

  const compareLen = Math.min(zeroRef.length, zeroTarget.length) - searchWindow;
  if (compareLen <= 0) {
    return { offsetFrames: 0, correlationScore: 0, confidence: 'low' };
  }

  for (let lag = -searchWindow; lag <= searchWindow; lag++) {
    let dotProduct = 0;
    let sumSqRef = 0;
    let sumSqTarget = 0;

    for (let i = 0; i < compareLen; i++) {
      const refIdx = i;
      const targetIdx = i + lag;

      if (targetIdx >= 0 && targetIdx < zeroTarget.length) {
        const valRef = zeroRef[refIdx];
        const valTarget = zeroTarget[targetIdx];

        dotProduct += valRef * valTarget;
        sumSqRef += valRef * valRef;
        sumSqTarget += valTarget * valTarget;
      }
    }

    const denominator = Math.sqrt(sumSqRef * sumSqTarget);
    const correlation = denominator > 0.00001 ? dotProduct / denominator : 0;

    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestLag = lag;
    }
  }

  const score = Math.max(-1, Math.min(1, maxCorrelation === -Infinity ? 0 : maxCorrelation));
  const confidence: 'high' | 'medium' | 'low' =
    score >= 0.65 ? 'high' : score >= 0.35 ? 'medium' : 'low';

  return {
    offsetFrames: bestLag,
    correlationScore: Number(score.toFixed(4)),
    confidence,
  };
}

/**
 * Aligns an external audio clip to a video clip based on the computed frame offset.
 * Optionally mutes the camera scratch audio and links both clips for synchronized editing.
 */
export function applyDualSystemAudioSync(
  videoClip: SequenceClip,
  audioClip: SequenceClip,
  offsetFrames: number,
  options: DualSystemSyncOptions = {},
): {
  updatedVideoClip: SequenceClip;
  updatedAudioClip: SequenceClip;
} {
  const muteScratch = options.muteScratchAudio !== false;
  const link = options.linkClips !== false;

  const videoStart = videoClip.startFrames ?? 0;
  const alignedAudioStart = Math.max(0, videoStart + offsetFrames);

  const updatedAudioClip: SequenceClip = {
    ...audioClip,
    startFrames: alignedAudioStart,
    syncOffsetFrames: offsetFrames,
    ...(link ? { linkedClipId: videoClip.id } : {}),
  };

  const updatedVideoClip: SequenceClip = {
    ...videoClip,
    ...(muteScratch ? { sourceAudioEnabled: false } : {}),
    ...(link ? { linkedClipId: audioClip.id } : {}),
  };

  return { updatedVideoClip, updatedAudioClip };
}

/**
 * Links two clips bidirectionally so gestures on one propagate to the other.
 */
export function linkClips(
  clipA: SequenceClip,
  clipB: SequenceClip,
): [SequenceClip, SequenceClip] {
  return [
    { ...clipA, linkedClipId: clipB.id },
    { ...clipB, linkedClipId: clipA.id },
  ];
}

/**
 * Unlinks a clip and its linked sibling across a clips collection.
 */
export function unlinkClips(
  clipId: string,
  clips: readonly SequenceClip[],
): SequenceClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target || !target.linkedClipId) {
    return clips.map((c) => (c.id === clipId ? { ...c, linkedClipId: null } : c));
  }

  const siblingId = target.linkedClipId;
  return clips.map((c) => {
    if (c.id === clipId || c.id === siblingId) {
      return { ...c, linkedClipId: null, syncOffsetFrames: undefined };
    }
    return c;
  });
}

/**
 * Propagates timeline displacement to a linked sibling clip during drag operations on free tracks.
 */
export function propagateLinkedClipMove(
  movedClip: SequenceClip,
  deltaFrames: number,
  allClips: readonly SequenceClip[],
  allTracks: readonly SequenceTrack[],
): SequenceClip[] {
  if (!movedClip.linkedClipId || deltaFrames === 0) {
    return [...allClips];
  }

  const sibling = allClips.find((c) => c.id === movedClip.linkedClipId);
  if (!sibling) {
    return [...allClips];
  }

  const siblingTrack = allTracks.find((t) => t.id === sibling.trackId);
  // Magnetic tracks calculate startFrames dynamically; only free tracks store absolute startFrames
  if (siblingTrack?.magnetic) {
    return [...allClips];
  }

  const newSiblingStart = Math.max(0, (sibling.startFrames ?? 0) + deltaFrames);

  return allClips.map((c) => {
    if (c.id === sibling.id) {
      return { ...c, startFrames: newSiblingStart };
    }
    return c;
  });
}
