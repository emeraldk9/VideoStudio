export type SceneCutAction = 'split_clips' | 'create_markers' | 'both';

export interface SceneCutDetectionSettings {
  threshold: number;             // 0.05 to 0.95 (default 0.40)
  minShotDurationFrames: number; // 6 to 120 frames (default 24 frames ~ 1 sec at 24fps)
  ignoreFlashes: boolean;        // Suppresses single-frame flash spikes (default true)
  action: SceneCutAction;        // Default 'split_clips'
}

export interface DetectedCutPoint {
  frame: number;
  confidence: number;            // 0.0 to 1.0
  type: 'hard_cut' | 'dissolve_transition';
}

export const DEFAULT_SCENE_CUT_DETECTION_SETTINGS: SceneCutDetectionSettings = {
  threshold: 0.40,
  minShotDurationFrames: 24,
  ignoreFlashes: true,
  action: 'split_clips',
};

/**
 * Computes the normalized Manhattan difference between two 256-bin or arbitrary-bin histograms (0.0 to 1.0).
 */
export function calculateHistogramDelta(
  histA: Uint8Array | number[],
  histB: Uint8Array | number[],
): number {
  if (histA.length === 0 || histB.length === 0 || histA.length !== histB.length) {
    return 0;
  }

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < histA.length; i++) {
    sumA += histA[i]!;
    sumB += histB[i]!;
  }

  if (sumA === 0 && sumB === 0) return 0;
  if (sumA === 0 || sumB === 0) return 1.0;

  let delta = 0;
  for (let i = 0; i < histA.length; i++) {
    const normA = histA[i]! / sumA;
    const normB = histB[i]! / sumB;
    delta += Math.abs(normA - normB);
  }

  // Manhattan distance between two normalized probability distributions is in [0, 2];
  // divide by 2 to normalize to [0, 1].
  return Math.min(1.0, Math.max(0.0, delta / 2));
}

/**
 * Detects scene cut points given an array of inter-frame delta scores (0.0 to 1.0).
 * `frameDeltas[i]` represents difference between frame i and frame i+1.
 */
export function detectSceneCuts(
  frameDeltas: number[],
  settings: SceneCutDetectionSettings = DEFAULT_SCENE_CUT_DETECTION_SETTINGS,
): DetectedCutPoint[] {
  if (!frameDeltas || frameDeltas.length === 0) {
    return [];
  }

  const threshold = Math.max(0.05, Math.min(0.95, settings.threshold));
  const minDuration = Math.max(1, Math.round(settings.minShotDurationFrames));
  const candidates: DetectedCutPoint[] = [];

  for (let i = 0; i < frameDeltas.length; i++) {
    const delta = frameDeltas[i]!;
    if (delta < threshold) {
      continue;
    }

    // Flash rejection: if current delta is high, but next frame drops back low,
    // and the previous was low, it's often a camera flash / strobe.
    if (settings.ignoreFlashes) {
      const prevDelta = i > 0 ? frameDeltas[i - 1]! : 0;
      const nextDelta = i + 1 < frameDeltas.length ? frameDeltas[i + 1]! : 0;
      // If single spike surrounded by low values, and subsequent delta is also high (flash ending),
      // check if it's a 1-frame strobe flash:
      if (prevDelta < threshold * 0.5 && nextDelta > threshold && i + 2 < frameDeltas.length && frameDeltas[i + 2]! < threshold * 0.5) {
        // 1-frame flash: frame i spikes (flash starts), frame i+1 spikes (flash ends), frame i+2 normal.
        // Skip both flash start and return.
        i++; // skip next delta as well
        continue;
      }
    }

    // Determine if it's a hard cut or a dissolve transition
    const isDissolve = (i + 1 < frameDeltas.length && frameDeltas[i + 1]! >= threshold * 0.6) ||
                       (i > 0 && frameDeltas[i - 1]! >= threshold * 0.6);

    candidates.push({
      frame: i + 1, // Cut occurs at start of incoming frame (i + 1)
      confidence: Math.min(1.0, Math.max(0.0, Math.round(delta * 100) / 100)),
      type: isDissolve ? 'dissolve_transition' : 'hard_cut',
    });
  }

  // Filter candidates by minimum shot duration:
  // If multiple cuts occur within minDuration, keep the one with higher confidence.
  return filterCutsByMinDuration(candidates, minDuration);
}

/**
 * Prunes cut points that violate minimum shot duration by keeping the highest confidence cut in each cluster.
 */
export function filterCutsByMinDuration(
  cuts: DetectedCutPoint[],
  minDurationFrames: number,
): DetectedCutPoint[] {
  if (cuts.length <= 1) {
    return cuts;
  }

  const result: DetectedCutPoint[] = [];
  let currentGroup: DetectedCutPoint[] = [cuts[0]!];

  for (let i = 1; i < cuts.length; i++) {
    const cut = cuts[i]!;
    const lastInGroup = currentGroup[currentGroup.length - 1]!;

    if (cut.frame - lastInGroup.frame < minDurationFrames) {
      currentGroup.push(cut);
    } else {
      // Pick best candidate from current group
      currentGroup.sort((a, b) => b.confidence - a.confidence);
      result.push(currentGroup[0]!);
      currentGroup = [cut];
    }
  }

  if (currentGroup.length > 0) {
    currentGroup.sort((a, b) => b.confidence - a.confidence);
    result.push(currentGroup[0]!);
  }

  // Ensure chronological order
  return result.sort((a, b) => a.frame - b.frame);
}

/**
 * Generates an FFmpeg command to detect scene changes and log cut timestamps.
 */
export function buildFfmpegSceneDetectionCommand(
  inputPath: string,
  threshold: number = 0.40,
): string {
  const safeThreshold = Math.max(0.05, Math.min(0.95, threshold)).toFixed(2);
  return `ffmpeg -i "${inputPath}" -filter:v "select='gt(scene,${safeThreshold})',showinfo" -f null -`;
}
