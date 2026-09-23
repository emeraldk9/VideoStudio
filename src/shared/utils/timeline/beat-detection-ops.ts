/**
 * S44 — Audio Beat & Rhythm Transient Detection Engine.
 *
 * Implements onset energy flux analysis, adaptive dynamic thresholding,
 * peak picking with refractory lockout, IOI-histogram BPM estimation,
 * rhythmic SequenceMarker generation, and automated montage cutting.
 */

import type { MarkerColor, SequenceClip, SequenceMarker } from '../../types/sequence';

export interface OnsetDetectionParams {
  /**
   * Detection sensitivity factor (0.2 to 3.0, default 1.0).
   * Higher values lower the adaptive threshold, catching subtle percussive transients.
   */
  sensitivity: number;
  /**
   * Number of frames for moving local mean & standard deviation window (default 10).
   */
  windowSize: number;
  /**
   * Minimum distance in frames between adjacent onsets to suppress double-triggering (default 8).
   */
  minDistanceFrames: number;
  /**
   * Absolute minimum energy flux delta required to register a transient (default 0.04).
   */
  thresholdOffset: number;
}

export const DEFAULT_ONSET_PARAMS: OnsetDetectionParams = {
  sensitivity: 1.0,
  windowSize: 10,
  minDistanceFrames: 8,
  thresholdOffset: 0.04,
};

export interface BpmEstimationResult {
  /** Estimated musical tempo in beats per minute (e.g. 120). */
  bpm: number;
  /** Confidence score between 0 (low/random) and 1 (highly periodic). */
  confidence: number;
  /** Average period between beats in video frames. */
  intervalFrames: number;
}

export interface BeatMarkerOptions {
  bpm?: number;
  color?: MarkerColor;
  prefix?: string;
  startFrame?: number;
  beatsPerMeasure?: number;
}

/**
 * Computes root-mean-square (RMS) energy envelope over a sliding window.
 */
export function computeRmsEnvelope(
  amplitudes: ArrayLike<number>,
  windowSize = 4,
): number[] {
  const n = amplitudes.length;
  if (n === 0) return [];
  const result: number[] = new Array(n);
  const half = Math.max(1, Math.floor(windowSize / 2));

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n, i + half + 1);
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const v = amplitudes[j];
      sumSq += v * v;
    }
    result[i] = Math.sqrt(sumSq / (end - start));
  }
  return result;
}

/**
 * Detects rhythmic transient onsets using half-wave rectified forward energy flux
 * and adaptive dynamic thresholding with local mean and variance.
 *
 * @param amplitudes Array of audio frame energy or sample levels [0..1]
 * @param fps Sequence frame rate
 * @param customParams Optional override parameters for sensitivity and lockout
 * @returns Array of sorted frame indices where transient onsets occur
 */
export function detectTransients(
  amplitudes: ArrayLike<number>,
  fps: number,
  customParams?: Partial<OnsetDetectionParams>,
): number[] {
  const params: OnsetDetectionParams = { ...DEFAULT_ONSET_PARAMS, ...customParams };
  const len = amplitudes.length;
  if (len < 3) return [];

  // Compute half-wave rectified forward energy flux: D(t) = max(0, A(t) - A(t-1))
  const flux: number[] = new Array(len).fill(0);
  for (let t = 1; t < len; t++) {
    const diff = amplitudes[t] - amplitudes[t - 1];
    flux[t] = diff > 0 ? diff : 0;
  }

  // Compute adaptive dynamic threshold T(t) = mu(t) + lambda * sigma(t) + offset
  const w = Math.max(3, params.windowSize);
  const halfW = Math.floor(w / 2);
  const lambda = Math.max(0.2, 1.8 / Math.max(0.1, params.sensitivity));

  const onsets: number[] = [];
  let lastOnsetFrame = -Infinity;

  for (let t = 1; t < len - 1; t++) {
    // Window bounds
    const wStart = Math.max(0, t - halfW);
    const wEnd = Math.min(len, t + halfW + 1);
    const count = wEnd - wStart;

    let sum = 0;
    for (let k = wStart; k < wEnd; k++) {
      sum += flux[k];
    }
    const mean = sum / count;

    let varSum = 0;
    for (let k = wStart; k < wEnd; k++) {
      const diff = flux[k] - mean;
      varSum += diff * diff;
    }
    const stdDev = Math.sqrt(varSum / count);
    const threshold = mean + lambda * stdDev + params.thresholdOffset;

    // Peak picking with lockout
    const val = flux[t];
    if (
      val >= threshold &&
      val >= flux[t - 1] &&
      val >= flux[t + 1] &&
      t - lastOnsetFrame >= params.minDistanceFrames
    ) {
      onsets.push(t);
      lastOnsetFrame = t;
    }
  }

  return onsets;
}

/**
 * Estimates musical tempo (BPM) from an array of detected onset frames
 * using Inter-Onset Interval (IOI) histogram clustering and harmonic folding.
 */
export function estimateBpmFromOnsets(
  onsetFrames: number[],
  fps: number,
): BpmEstimationResult {
  const defaultInterval = Math.round((fps * 60) / 120);
  if (!onsetFrames || onsetFrames.length < 2 || fps <= 0) {
    return {
      bpm: 120,
      confidence: 0,
      intervalFrames: defaultInterval,
    };
  }

  // Compute inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < onsetFrames.length; i++) {
    const delta = onsetFrames[i] - onsetFrames[i - 1];
    if (delta > 0) {
      intervals.push(delta);
    }
  }

  if (intervals.length === 0) {
    return { bpm: 120, confidence: 0, intervalFrames: defaultInterval };
  }

  // Group into tolerance clusters (within 15% distance)
  interface Cluster {
    representative: number;
    count: number;
    sum: number;
  }
  const clusters: Cluster[] = [];

  for (const interval of intervals) {
    let matched = false;
    for (const cluster of clusters) {
      const diff = Math.abs(cluster.representative - interval);
      if (diff <= Math.max(2, cluster.representative * 0.15)) {
        cluster.count++;
        cluster.sum += interval;
        cluster.representative = cluster.sum / cluster.count;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ representative: interval, count: 1, sum: interval });
    }
  }

  // Find dominant cluster
  clusters.sort((a, b) => b.count - a.count);
  const dominant = clusters[0];
  const dominantIntervalFrames = dominant.representative;

  // Convert to raw BPM
  let rawBpm = (60 * fps) / dominantIntervalFrames;

  // Harmonic folding to bring into standard musical window [65, 185]
  while (rawBpm < 65) {
    rawBpm *= 2;
  }
  while (rawBpm > 185) {
    rawBpm /= 2;
  }

  const normalizedBpm = Math.round(rawBpm);
  const intervalFrames = Math.max(1, Math.round((fps * 60) / normalizedBpm));

  // Compute confidence score based on ratio of intervals aligned with the dominant period
  let alignedCount = 0;
  for (const interval of intervals) {
    // Check fundamental, half-time, or double-time match
    const diff1 = Math.abs(interval - intervalFrames);
    const diff2 = Math.abs(interval - intervalFrames * 2);
    const diffHalf = Math.abs(interval - Math.round(intervalFrames / 2));
    if (
      diff1 <= Math.max(2, intervalFrames * 0.15) ||
      diff2 <= Math.max(3, intervalFrames * 0.3) ||
      diffHalf <= Math.max(2, intervalFrames * 0.15)
    ) {
      alignedCount++;
    }
  }

  const confidence = Math.min(1.0, Number((alignedCount / intervals.length).toFixed(2)));

  return {
    bpm: normalizedBpm,
    confidence,
    intervalFrames,
  };
}

/**
 * Generates an array of timeline SequenceMarkers from detected beat onset frames.
 */
export function generateBeatGridMarkers(
  sequenceId: string,
  onsetFrames: number[],
  fps: number,
  options?: BeatMarkerOptions,
): SequenceMarker[] {
  const color: MarkerColor = options?.color ?? 'ai';
  const prefix = options?.prefix ?? 'Beat';
  const beatsPerMeasure = Math.max(1, options?.beatsPerMeasure ?? 4);

  return onsetFrames.map((frame, index) => {
    const measure = Math.floor(index / beatsPerMeasure) + 1;
    const beatInMeasure = (index % beatsPerMeasure) + 1;
    const label = `${prefix} ${measure}.${beatInMeasure}`;

    return {
      id: `marker_beat_${frame}_${index}`,
      sequenceId,
      frame,
      name: label,
      color,
      locked: false,
      notes: `Rhythmic beat onset #${index + 1} at frame ${frame}`,
    };
  });
}

/**
 * Automatically splits/cuts video clips on target track at every valid beat frame,
 * transforming a continuous clip into a rhythmic montage synchronous with the music.
 *
 * @param clips All sequence clips
 * @param beatFrames Sorted frame numbers where cuts should be made
 * @param targetTrackId ID of the track whose clips will be split
 * @param minSegmentFrames Minimum length of any split slice (default 6 frames)
 * @returns New array of clips with cuts applied and valid orderIndexes
 */
export function autoCutClipsOnBeats(
  clips: readonly SequenceClip[],
  beatFrames: readonly number[],
  targetTrackId: string,
  minSegmentFrames = 6,
): SequenceClip[] {
  if (!clips || clips.length === 0 || !beatFrames || beatFrames.length === 0) {
    return [...clips];
  }

  // Filter clips belonging to target track
  const targetClips = clips.filter((c) => c.trackId === targetTrackId);
  const otherClips = clips.filter((c) => c.trackId !== targetTrackId);

  if (targetClips.length === 0) {
    return [...clips];
  }

  // Sort target clips by timeline position
  const sortedTargetClips = [...targetClips].sort((a, b) => {
    const aStart = a.startFrames ?? 0;
    const bStart = b.startFrames ?? 0;
    return aStart - bStart || a.orderIndex - b.orderIndex;
  });

  const resultingTrackClips: SequenceClip[] = [];

  for (const clip of sortedTargetClips) {
    const clipStart = clip.startFrames ?? 0;
    const clipEnd = clipStart + clip.durationFrames;

    // Find all beats that fall inside the clip with adequate margin
    const interiorBeats = beatFrames.filter(
      (b) => b >= clipStart + minSegmentFrames && b <= clipEnd - minSegmentFrames,
    );

    if (interiorBeats.length === 0) {
      resultingTrackClips.push(clip);
      continue;
    }

    // Split clip across cut boundaries
    const cutBoundaries = [clipStart, ...interiorBeats, clipEnd];

    for (let i = 0; i < cutBoundaries.length - 1; i++) {
      const segStart = cutBoundaries[i];
      const segEnd = cutBoundaries[i + 1];
      const segDuration = segEnd - segStart;
      const offsetFromOriginal = segStart - clipStart;

      const newSourceIn =
        clip.sourceInFrames !== undefined && clip.sourceInFrames !== null
          ? clip.sourceInFrames + offsetFromOriginal
          : undefined;

      const newSourceOut =
        clip.sourceOutFrames !== undefined && clip.sourceOutFrames !== null
          ? (newSourceIn !== undefined ? newSourceIn + segDuration : clip.sourceInFrames! + offsetFromOriginal + segDuration)
          : undefined;

      const segmentClip: SequenceClip = {
        ...clip,
        id: i === 0 ? clip.id : `${clip.id}_cut_${segStart}`,
        startFrames: clip.startFrames !== null && clip.startFrames !== undefined ? segStart : null,
        durationFrames: segDuration,
        sourceInFrames: newSourceIn,
        sourceOutFrames: newSourceOut,
        // Transitions: first keeps in-transition; last keeps out-transition
        transitionIn: i === 0 ? clip.transitionIn : 'cut',
        transitionFrames: i === 0 ? clip.transitionFrames : 0,
        transitionOut: i === cutBoundaries.length - 2 ? clip.transitionOut : 'cut',
        transitionOutFrames: i === cutBoundaries.length - 2 ? clip.transitionOutFrames : 0,
      };

      resultingTrackClips.push(segmentClip);
    }
  }

  // Re-index orderIndex for target track clips
  const indexedTrackClips = resultingTrackClips.map((clip, index) => ({
    ...clip,
    orderIndex: index,
  }));

  return [...otherClips, ...indexedTrackClips];
}

/**
 * Utility generating synthetic rhythmic pulse trains for unit tests,
 * metronome calibration, and audio synthesis demonstrations.
 */
export function generateSyntheticBeatWaveform(
  bpm: number,
  durationSeconds: number,
  fps = 30,
): number[] {
  const totalFrames = Math.round(durationSeconds * fps);
  const intervalFrames = (fps * 60) / bpm;
  const waveform = new Array(totalFrames).fill(0.02);

  let nextBeatFrame = 0;
  while (nextBeatFrame < totalFrames) {
    const idx = Math.round(nextBeatFrame);
    if (idx < totalFrames) {
      waveform[idx] = 1.0;
      if (idx + 1 < totalFrames) waveform[idx + 1] = 0.5;
      if (idx + 2 < totalFrames) waveform[idx + 2] = 0.2;
    }
    nextBeatFrame += intervalFrames;
  }

  return waveform;
}
