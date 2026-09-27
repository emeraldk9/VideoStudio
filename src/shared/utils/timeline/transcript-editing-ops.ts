/**
 * S163 — AI Text-Based Video Editing & Transcript-Driven Rough Cut Engine.
 *
 * Implements word-level tokenization with proportional timeline framing,
 * multi-track ripple deletion from transcript selection, filler word tagging,
 * and structured transcript export formatting (Markdown, TXT, SRT, WebVTT).
 */

import type { SequenceClip, SequenceDocument } from '../../types/sequence';
import { applySmartJumpCutsToSequence, DEFAULT_FILLER_WORDS, normalizeToken } from './smart-cut-ops';
import { framesToSeconds, formatTimecode } from './frames';

export interface TranscriptWordToken {
  id: string;
  word: string;
  cleanWord: string;
  charStart: number;
  charEnd: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  isFiller: boolean;
}

export interface TranscriptCue {
  clipId: string;
  trackId: string;
  orderIndex: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  text: string;
  speaker?: string;
  words: TranscriptWordToken[];
}

/**
 * Tokenizes cue subtitle text into individual word tokens with estimated
 * proportional frame intervals across the cue's timeline span.
 */
export function tokenizeCueWords(
  cueText: string,
  cueStartFrame: number,
  cueDurationFrames: number,
  fillerWords: string[] = DEFAULT_FILLER_WORDS.filter((f) => f.defaultSelected).map((f) => f.word),
): TranscriptWordToken[] {
  if (!cueText || cueText.trim().length === 0 || cueDurationFrames <= 0) {
    return [];
  }

  const fillerSet = new Set(fillerWords.map((w) => w.toLowerCase().trim()));
  const tokens: TranscriptWordToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  const totalLength = Math.max(1, cueText.length);

  while ((match = regex.exec(cueText)) !== null) {
    const rawWord = match[0];
    const charStart = match.index;
    const charEnd = match.index + rawWord.length;
    const cleanWord = normalizeToken(rawWord);

    // Proportional frame mapping with clamping
    const startProgress = charStart / totalLength;
    const endProgress = charEnd / totalLength;

    const startFrame = Math.round(cueStartFrame + startProgress * cueDurationFrames);
    const endFrame = Math.max(startFrame + 1, Math.round(cueStartFrame + endProgress * cueDurationFrames));
    const durationFrames = endFrame - startFrame;

    const isFiller = fillerSet.has(cleanWord);

    tokens.push({
      id: `word-${startFrame}-${charStart}-${tokens.length}`,
      word: rawWord,
      cleanWord,
      charStart,
      charEnd,
      startFrame,
      endFrame,
      durationFrames,
      isFiller,
    });
  }

  return tokens;
}

/**
 * Extracts structured transcript cues with word-level tokens from timeline clips.
 */
export function extractTranscriptCues(
  clips: readonly SequenceClip[],
  trackId?: string,
  fillerWords?: string[],
): TranscriptCue[] {
  const subtitleClips = clips
    .filter(
      (c) =>
        c.sourceKind === 'text' &&
        (!trackId || trackId === 'all' || c.trackId === trackId),
    )
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  return subtitleClips.map((clip, index) => {
    const startFrame = clip.startFrames ?? 0;
    const durationFrames = clip.durationFrames;
    const endFrame = startFrame + durationFrames;
    const text = clip.effects?.text?.text ?? clip.label;

    const words = tokenizeCueWords(text, startFrame, durationFrames, fillerWords);

    return {
      clipId: clip.id,
      trackId: clip.trackId,
      orderIndex: index,
      startFrame,
      endFrame,
      durationFrames,
      text,
      words,
    };
  });
}

/**
 * Calculates the bounding time frame span [minStart, maxEnd] for a set of word tokens.
 */
export function calculateWordsBoundingSpan(
  tokens: readonly TranscriptWordToken[],
): { startFrame: number; endFrame: number; durationFrames: number } | null {
  if (tokens.length === 0) return null;

  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const t of tokens) {
    if (t.startFrame < minStart) minStart = t.startFrame;
    if (t.endFrame > maxEnd) maxEnd = t.endFrame;
  }

  if (minStart === Infinity || maxEnd === -Infinity || maxEnd <= minStart) {
    return null;
  }

  return {
    startFrame: minStart,
    endFrame: maxEnd,
    durationFrames: maxEnd - minStart,
  };
}

/**
 * Excises a time range [startFrame, endFrame] from the sequence document,
 * performing multi-track ripple deletion and applying audio micro-fades to prevent cut clicks.
 */
export function rippleDeleteTranscriptRange(
  document: SequenceDocument,
  startFrame: number,
  endFrame: number,
  microFadeFrames = 3,
): SequenceDocument {
  if (endFrame <= startFrame || startFrame < 0) {
    return document;
  }

  const durationFrames = endFrame - startFrame;
  const fps = document.sequence.fps ?? 30;

  const cutInterval = {
    id: `transcript-cut-${startFrame}-${endFrame}`,
    startFrame,
    endFrame,
    durationFrames,
    durationSec: Number((durationFrames / fps).toFixed(3)),
    type: 'filler' as const,
    label: `Transcript Cut (${startFrame}f..${endFrame}f)`,
  };

  const result = applySmartJumpCutsToSequence(document, [cutInterval], {
    fps,
    microFadeFrames,
    duplicateSequence: false,
  });

  return result.document;
}

/**
 * Exports sequence transcript cues into a formatted document (Markdown, Plain Text, SRT, WebVTT).
 */
export function formatTranscriptExport(
  cues: readonly TranscriptCue[],
  format: 'markdown' | 'txt' | 'srt' | 'vtt',
  fps = 30,
  sequenceTitle = 'VideoStudio Transcript',
): string {
  if (cues.length === 0) return '';

  if (format === 'markdown') {
    const lines: string[] = [
      `# ${sequenceTitle}`,
      ``,
      `*Exported on ${new Date().toISOString().split('T')[0]} · Total Cues: ${cues.length}*`,
      ``,
      `---`,
      ``,
    ];

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const timecode = `[${formatTimecode(cue.startFrame, fps)} → ${formatTimecode(cue.endFrame, fps)}]`;
      const speakerTag = cue.speaker ? `**${cue.speaker}:** ` : '';
      lines.push(`### ${i + 1}. ${timecode}`);
      lines.push(`${speakerTag}${cue.text}`);
      lines.push(``);
    }

    return lines.join('\n');
  }

  if (format === 'txt') {
    const lines: string[] = [];
    for (const cue of cues) {
      const timecode = `[${formatTimecode(cue.startFrame, fps)}]`;
      lines.push(`${timecode} ${cue.text}`);
    }
    return lines.join('\n');
  }

  if (format === 'vtt') {
    const lines: string[] = ['WEBVTT', ''];
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const startSec = framesToSeconds(cue.startFrame, fps);
      const endSec = framesToSeconds(cue.endFrame, fps);
      lines.push(String(i + 1));
      lines.push(`${formatVttTime(startSec)} --> ${formatVttTime(endSec)}`);
      lines.push(cue.text);
      lines.push('');
    }
    return lines.join('\n');
  }

  // Default: SRT
  const lines: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const startSec = framesToSeconds(cue.startFrame, fps);
    const endSec = framesToSeconds(cue.endFrame, fps);
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}`);
    lines.push(cue.text);
    lines.push('');
  }
  return lines.join('\n');
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function pad(num: number, size: number): string {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}
