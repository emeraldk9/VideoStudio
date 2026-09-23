/**
 * S83 — AI Smart Silence & Filler Word Removal (Smart Jump-Cut Engine).
 *
 * Implements automated pause detection, multi-lingual filler word recognition,
 * multi-track ripple jump-cut splicing with audio micro-fades, and sequence compaction.
 */

import type { SequenceClip, SequenceDocument } from '../../types/sequence';

export interface CutInterval {
  id: string;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  durationSec: number;
  type: 'silence' | 'filler';
  label: string;
}

export interface FillerWordDefinition {
  word: string;
  language: string;
  category: 'hesitation' | 'crutch' | 'pause';
  defaultSelected: boolean;
}

export const DEFAULT_FILLER_WORDS: FillerWordDefinition[] = [
  // English
  { word: 'um', language: 'en', category: 'hesitation', defaultSelected: true },
  { word: 'uh', language: 'en', category: 'hesitation', defaultSelected: true },
  { word: 'like', language: 'en', category: 'crutch', defaultSelected: true },
  { word: 'you know', language: 'en', category: 'crutch', defaultSelected: true },
  { word: 'ah', language: 'en', category: 'hesitation', defaultSelected: true },
  { word: 'er', language: 'en', category: 'hesitation', defaultSelected: true },
  { word: 'hmm', language: 'en', category: 'hesitation', defaultSelected: false },
  { word: 'basically', language: 'en', category: 'crutch', defaultSelected: false },
  { word: 'literally', language: 'en', category: 'crutch', defaultSelected: false },
  { word: 'actually', language: 'en', category: 'crutch', defaultSelected: false },
  // Spanish
  { word: 'eh', language: 'es', category: 'hesitation', defaultSelected: true },
  { word: 'este', language: 'es', category: 'crutch', defaultSelected: true },
  { word: 'bueno', language: 'es', category: 'crutch', defaultSelected: false },
  { word: 'o sea', language: 'es', category: 'crutch', defaultSelected: true },
  // French
  { word: 'euh', language: 'fr', category: 'hesitation', defaultSelected: true },
  { word: 'genre', language: 'fr', category: 'crutch', defaultSelected: true },
  { word: 'en fait', language: 'fr', category: 'crutch', defaultSelected: false },
  // German
  { word: 'äh', language: 'de', category: 'hesitation', defaultSelected: true },
  { word: 'ähm', language: 'de', category: 'hesitation', defaultSelected: true },
  { word: 'halt', language: 'de', category: 'crutch', defaultSelected: false },
  // Vietnamese
  { word: 'ờ', language: 'vi', category: 'hesitation', defaultSelected: true },
  { word: 'à', language: 'vi', category: 'hesitation', defaultSelected: true },
  { word: 'kiểu như', language: 'vi', category: 'crutch', defaultSelected: true },
];

export interface SmartCutScanOptions {
  fps?: number;
  minSilenceDurationSec?: number; // e.g. 0.4s
  silencePaddingSec?: number; // natural breath margin, e.g. 0.08s
  enableSilenceRemoval?: boolean;
  enableFillerRemoval?: boolean;
  selectedFillerWords?: string[];
}

export interface SmartCutResult {
  document: SequenceDocument;
  cutCount: number;
  savedDurationFrames: number;
  savedDurationSec: number;
  silencesRemovedCount: number;
  fillersRemovedCount: number;
  cuts: CutInterval[];
}

/**
 * Normalizes text for word matching by lowercasing and stripping punctuation.
 */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[.,/#!$%^&*;:{}=\-_`~()?"']+|[.,/#!$%^&*;:{}=\-_`~()?"']+$/g, '').trim();
}

/**
 * Detects dead air / silence intervals across timeline audio clips.
 * Returns non-overlapping CutInterval items.
 */
export function detectTimelineSilences(
  audioClips: readonly SequenceClip[],
  totalTimelineFrames: number,
  fps = 30,
  minSilenceDurationSec = 0.4,
  silencePaddingSec = 0.08,
): CutInterval[] {
  if (totalTimelineFrames <= 0) return [];

  const minSilenceFrames = Math.max(1, Math.round(minSilenceDurationSec * fps));
  const paddingFrames = Math.max(0, Math.round(silencePaddingSec * fps));

  // If no audio clips exist, the entire timeline is silence
  if (audioClips.length === 0) {
    if (totalTimelineFrames >= minSilenceFrames) {
      return [
        {
          id: `silence-${crypto.randomUUID().slice(0, 8)}`,
          startFrame: 0,
          endFrame: totalTimelineFrames,
          durationFrames: totalTimelineFrames,
          durationSec: Number((totalTimelineFrames / fps).toFixed(3)),
          type: 'silence',
          label: `Silence (${(totalTimelineFrames / fps).toFixed(1)}s)`,
        },
      ];
    }
    return [];
  }

  // 1. Collect all occupied audio ranges and merge overlapping ranges
  interface Span {
    start: number;
    end: number;
  }
  const occupiedSpans: Span[] = [];

  for (const clip of audioClips) {
    const start = clip.startFrames ?? 0;
    const end = start + clip.durationFrames;
    if (end > start) {
      occupiedSpans.push({ start, end });
    }
  }

  occupiedSpans.sort((a, b) => a.start - b.start);

  const mergedOccupied: Span[] = [];
  for (const span of occupiedSpans) {
    if (mergedOccupied.length === 0) {
      mergedOccupied.push({ ...span });
    } else {
      const prev = mergedOccupied[mergedOccupied.length - 1];
      if (span.start <= prev.end) {
        prev.end = Math.max(prev.end, span.end);
      } else {
        mergedOccupied.push({ ...span });
      }
    }
  }

  // 2. Identify gaps between occupied spans
  const gaps: Span[] = [];

  // Gap before first audio
  if (mergedOccupied.length > 0 && mergedOccupied[0].start > 0) {
    gaps.push({ start: 0, end: mergedOccupied[0].start });
  }

  // Gaps between consecutive spans
  for (let i = 0; i < mergedOccupied.length - 1; i++) {
    const gapStart = mergedOccupied[i].end;
    const gapEnd = mergedOccupied[i + 1].start;
    if (gapEnd > gapStart) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }

  // Gap after last audio up to timeline end
  if (mergedOccupied.length > 0) {
    const lastEnd = mergedOccupied[mergedOccupied.length - 1].end;
    if (lastEnd < totalTimelineFrames) {
      gaps.push({ start: lastEnd, end: totalTimelineFrames });
    }
  }

  // 3. Filter gaps by minimum duration and apply speech safety padding
  const silenceCuts: CutInterval[] = [];

  for (const gap of gaps) {
    const rawDuration = gap.end - gap.start;
    if (rawDuration < minSilenceFrames) continue;

    // Apply padding (shrink the cut so words are not truncated)
    // Only apply head padding if not at timeline start
    const cutStart = gap.start === 0 ? 0 : Math.min(gap.end, gap.start + paddingFrames);
    // Only apply tail padding if not at timeline end
    const cutEnd = gap.end >= totalTimelineFrames ? gap.end : Math.max(cutStart, gap.end - paddingFrames);

    const effectiveDuration = cutEnd - cutStart;
    if (effectiveDuration >= Math.max(1, Math.round(minSilenceFrames * 0.5))) {
      silenceCuts.push({
        id: `silence-${crypto.randomUUID().slice(0, 8)}`,
        startFrame: cutStart,
        endFrame: cutEnd,
        durationFrames: effectiveDuration,
        durationSec: Number((effectiveDuration / fps).toFixed(3)),
        type: 'silence',
        label: `Silence (${(effectiveDuration / fps).toFixed(2)}s)`,
      });
    }
  }

  return silenceCuts;
}

/**
 * Scans subtitle/transcript clips to detect occurrences of selected filler words.
 * Returns frame-accurate CutInterval items.
 */
export function detectFillerWordsInClips(
  subtitleClips: readonly SequenceClip[],
  selectedFillerWords: readonly string[],
  fps = 30,
): CutInterval[] {
  if (subtitleClips.length === 0 || selectedFillerWords.length === 0) return [];

  const targetWordsSet = new Set(selectedFillerWords.map((w) => normalizeToken(w)));
  const fillerCuts: CutInterval[] = [];

  for (const clip of subtitleClips) {
    const textEffect = clip.effects?.text;
    if (!textEffect || !textEffect.text) continue;

    const clipStartFrame = clip.startFrames ?? 0;
    const clipDurFrames = clip.durationFrames;
    if (clipDurFrames <= 0) continue;

    // Split text into words
    const words = textEffect.text.trim().split(/\s+/);
    if (words.length === 0) continue;

    const approxWordFrames = clipDurFrames / words.length;

    words.forEach((rawWord, idx) => {
      const clean = normalizeToken(rawWord);
      if (targetWordsSet.has(clean)) {
        const startFrame = Math.round(clipStartFrame + idx * approxWordFrames);
        const endFrame = Math.round(clipStartFrame + (idx + 1) * approxWordFrames);
        const durFrames = Math.max(1, endFrame - startFrame);

        fillerCuts.push({
          id: `filler-${crypto.randomUUID().slice(0, 8)}`,
          startFrame,
          endFrame,
          durationFrames: durFrames,
          durationSec: Number((durFrames / fps).toFixed(3)),
          type: 'filler',
          label: `Filler: "${rawWord}"`,
        });
      }
    });
  }

  return fillerCuts;
}

/**
 * Consolidates and merges overlapping or adjacent cut intervals.
 */
export function mergeCutIntervals(intervals: readonly CutInterval[]): CutInterval[] {
  if (intervals.length <= 1) return [...intervals];

  const sorted = [...intervals].sort((a, b) => a.startFrame - b.startFrame);
  const merged: CutInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.startFrame <= prev.endFrame) {
      // Overlap or adjacency: expand previous cut
      const newEndFrame = Math.max(prev.endFrame, curr.endFrame);
      const newDuration = newEndFrame - prev.startFrame;
      prev.endFrame = newEndFrame;
      prev.durationFrames = newDuration;
      prev.durationSec = Number((newDuration / 30).toFixed(3));
      prev.label = `${prev.label} + ${curr.label}`;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Scans a sequence document for all silences and filler words according to options.
 */
export function scanSequenceForSmartCuts(
  document: SequenceDocument,
  options: SmartCutScanOptions = {},
): CutInterval[] {
  const fps = options.fps ?? document.sequence.fps ?? 30;
  const cuts: CutInterval[] = [];

  // 1. Silences
  if (options.enableSilenceRemoval !== false) {
    const audioClips = document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && (track.kind === 'audio' || (track.kind === 'video' && c.sourceKind === 'video'));
    });

    const maxTimelineFrame = document.clips.reduce(
      (max, c) => Math.max(max, (c.startFrames ?? 0) + c.durationFrames),
      0,
    );

    const silenceCuts = detectTimelineSilences(
      audioClips,
      maxTimelineFrame,
      fps,
      options.minSilenceDurationSec ?? 0.4,
      options.silencePaddingSec ?? 0.08,
    );
    cuts.push(...silenceCuts);
  }

  // 2. Filler words
  if (options.enableFillerRemoval) {
    const selectedWords = options.selectedFillerWords ??
      DEFAULT_FILLER_WORDS.filter((w) => w.defaultSelected).map((w) => w.word);

    const subtitleClips = document.clips.filter((c) => {
      const track = document.tracks.find((t) => t.id === c.trackId);
      return track && (track.role === 'text' || Boolean(c.effects?.text));
    });

    const fillerCuts = detectFillerWordsInClips(subtitleClips, selectedWords, fps);
    cuts.push(...fillerCuts);
  }

  return mergeCutIntervals(cuts);
}

/**
 * Pure Factory: Slices across all synchronized tracks, excises cut intervals,
 * collapses timeline gaps (magnetic ripple), and applies de-clicking micro-fades.
 */
export function applySmartJumpCutsToSequence(
  document: SequenceDocument,
  cuts: readonly CutInterval[],
  options: {
    microFadeFrames?: number;
    duplicateSequence?: boolean;
    newSequenceName?: string;
    fps?: number;
  } = {},
): SmartCutResult {
  const fps = options.fps ?? document.sequence.fps ?? 30;
  const microFade = options.microFadeFrames ?? 3; // ~5ms at 60fps, ~10ms at 30fps

  if (cuts.length === 0) {
    return {
      document,
      cutCount: 0,
      savedDurationFrames: 0,
      savedDurationSec: 0,
      silencesRemovedCount: 0,
      fillersRemovedCount: 0,
      cuts: [],
    };
  }

  // Sort merged cuts chronologically
  const mergedCuts = mergeCutIntervals(cuts);

  let silencesCount = 0;
  let fillersCount = 0;
  for (const c of mergedCuts) {
    if (c.type === 'silence') silencesCount++;
    else fillersCount++;
  }

  const totalSavedFrames = mergedCuts.reduce((acc, c) => acc + c.durationFrames, 0);

  // Helper: map a frame before cuts to its new frame after cuts
  function mapFrame(originalFrame: number): number {
    let shifted = originalFrame;
    for (const cut of mergedCuts) {
      if (originalFrame <= cut.startFrame) {
        break;
      } else if (originalFrame >= cut.endFrame) {
        shifted -= cut.durationFrames;
      } else {
        // Inside a cut
        shifted -= (originalFrame - cut.startFrame);
        break;
      }
    }
    return Math.max(0, shifted);
  }

  const updatedClips: SequenceClip[] = [];

  for (const clip of document.clips) {
    const clipStart = clip.startFrames ?? 0;
    const clipEnd = clipStart + clip.durationFrames;

    // Find all cuts that intersect this clip
    const intersectingCuts = mergedCuts.filter(
      (cut) => cut.startFrame < clipEnd && cut.endFrame > clipStart,
    );

    if (intersectingCuts.length === 0) {
      // Clip has no cuts intersecting it: just shift startFrame leftward
      const newStart = mapFrame(clipStart);
      updatedClips.push({
        ...clip,
        startFrames: newStart,
      });
      continue;
    }

    // Clip intersects one or more cuts: slice it into surviving sub-segments
    interface Segment {
      origStart: number;
      origEnd: number;
    }

    let survivingSegments: Segment[] = [{ origStart: clipStart, origEnd: clipEnd }];

    for (const cut of intersectingCuts) {
      const nextSurviving: Segment[] = [];
      for (const seg of survivingSegments) {
        // Cut completely covers segment: deleted
        if (cut.startFrame <= seg.origStart && cut.endFrame >= seg.origEnd) {
          continue;
        }
        // Cut is completely outside segment
        if (cut.endFrame <= seg.origStart || cut.startFrame >= seg.origEnd) {
          nextSurviving.push(seg);
          continue;
        }
        // Cut cuts head of segment
        if (cut.startFrame <= seg.origStart && cut.endFrame < seg.origEnd) {
          nextSurviving.push({ origStart: cut.endFrame, origEnd: seg.origEnd });
          continue;
        }
        // Cut cuts tail of segment
        if (cut.startFrame > seg.origStart && cut.endFrame >= seg.origEnd) {
          nextSurviving.push({ origStart: seg.origStart, origEnd: cut.startFrame });
          continue;
        }
        // Cut splits segment into head and tail
        if (cut.startFrame > seg.origStart && cut.endFrame < seg.origEnd) {
          nextSurviving.push({ origStart: seg.origStart, origEnd: cut.startFrame });
          nextSurviving.push({ origStart: cut.endFrame, origEnd: seg.origEnd });
        }
      }
      survivingSegments = nextSurviving;
    }

    // Now turn each surviving segment into a SequenceClip
    survivingSegments.forEach((seg, idx) => {
      const duration = seg.origEnd - seg.origStart;
      if (duration <= 0) return;

      const newStart = mapFrame(seg.origStart);
      const isSplit = survivingSegments.length > 1;

      // Adjust sourceInFrames / trimOffset if video/audio
      const headOffset = seg.origStart - clipStart;
      const originalSourceIn = clip.sourceInFrames ?? 0;
      const nextSourceIn = originalSourceIn + headOffset;

      // Apply micro-fades to audio clips at cut points to prevent click/pop artifacts
      let nextFadeIn = clip.fadeInFrames ?? 0;
      let nextFadeOut = clip.fadeOutFrames ?? 0;
      if (clip.sourceKind === 'audio') {
        if (idx > 0 || headOffset > 0) {
          nextFadeIn = Math.max(nextFadeIn, microFade);
        }
        if (idx < survivingSegments.length - 1 || seg.origEnd < clipEnd) {
          nextFadeOut = Math.max(nextFadeOut, microFade);
        }
      }

      updatedClips.push({
        ...clip,
        id: isSplit ? `${clip.id}-cut${idx + 1}` : clip.id,
        startFrames: newStart,
        durationFrames: duration,
        sourceInFrames: nextSourceIn,
        sourceOutFrames: nextSourceIn + duration,
        fadeInFrames: nextFadeIn,
        fadeOutFrames: nextFadeOut,
      });
    });
  }

  // Update sequence metadata
  const nextSeqId = options.duplicateSequence ? crypto.randomUUID() : document.sequence.id;
  const nextName = options.duplicateSequence
    ? options.newSequenceName || `${document.sequence.name} [Smart Cut]`
    : document.sequence.name;

  const resultDoc: SequenceDocument = {
    ...document,
    sequence: {
      ...document.sequence,
      id: nextSeqId,
      name: nextName,
    },
    clips: updatedClips.map((c) => ({
      ...c,
      sequenceId: nextSeqId,
    })),
  };

  return {
    document: resultDoc,
    cutCount: mergedCuts.length,
    savedDurationFrames: totalSavedFrames,
    savedDurationSec: Number((totalSavedFrames / fps).toFixed(3)),
    silencesRemovedCount: silencesCount,
    fillersRemovedCount: fillersCount,
    cuts: mergedCuts,
  };
}
