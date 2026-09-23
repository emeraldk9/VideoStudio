import type {
  ClipColorLabel,
  SequenceClip,
} from '../../types/sequence';
import type { TextContent } from './effects';
import { framesToSeconds, secondsToFrames } from './frames';

/**
 * Parsed representation of a single subtitle cue.
 */
export interface SubtitleCue {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export type CaptionPresetId = 'modern' | 'cinema' | 'bold_white' | 'minimal';
export type SubtitleCasing = 'as-is' | 'uppercase' | 'titlecase' | 'sentencecase';

export interface CaptionStylePreset {
  id: CaptionPresetId;
  label: string;
  description: string;
  effects: Omit<TextContent, 'text'>;
}

export const CAPTION_STYLE_PRESETS: Record<CaptionPresetId, CaptionStylePreset> = {
  modern: {
    id: 'modern',
    label: 'Modern Translucent',
    description: 'Crisp white text with a sleek translucent dark rounded pill',
    effects: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.88 },
      anchor: 'bottom',
      box: { colorHex: '#090d16', opacity: 0.75, paddingPx: 14 },
      preset: 'caption',
    },
  },
  cinema: {
    id: 'cinema',
    label: 'Cinema Yellow',
    description: 'Classic motion-picture yellow with dark contrast backing',
    effects: {
      fontSizePx: 42,
      colorHex: '#fef08a',
      align: 'center',
      positionPct: { x: 0.5, y: 0.9 },
      anchor: 'bottom',
      box: { colorHex: '#000000', opacity: 0.85, paddingPx: 12 },
      preset: 'caption',
    },
  },
  bold_white: {
    id: 'bold_white',
    label: 'High-Contrast White',
    description: 'Heavy bold white type with high-opacity box for maximum readability',
    effects: {
      fontSizePx: 48,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.86 },
      anchor: 'bottom',
      box: { colorHex: '#020617', opacity: 0.92, paddingPx: 16 },
      preset: 'caption',
    },
  },
  minimal: {
    id: 'minimal',
    label: 'Minimalist Sans',
    description: 'Clean borderless subtitles for minimalist vlogs and documentaries',
    effects: {
      fontSizePx: 40,
      colorHex: '#f8fafc',
      align: 'center',
      positionPct: { x: 0.5, y: 0.88 },
      anchor: 'bottom',
      preset: 'caption',
    },
  },
};

export interface SubtitleImportOptions {
  targetTrackId: string;
  sequenceId: string;
  fps: number;
  offsetFrames?: number;
  stylePreset?: CaptionPresetId;
  textCasing?: SubtitleCasing;
  colorLabel?: ClipColorLabel;
  mintId?: () => string;
}

/**
 * Parses timestamp string from SRT (00:01:23,456) or WebVTT (00:01:23.456 or 01:23.456) to seconds.
 */
export function parseTimestampToSeconds(timestamp: string): number {
  const trimmed = timestamp.trim();
  // Normalize comma decimal separator to dot
  const normalized = trimmed.replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return 0;
    return Math.max(0, hours * 3600 + minutes * 60 + seconds);
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return 0;
    return Math.max(0, minutes * 60 + seconds);
  }

  const bareSeconds = parseFloat(normalized);
  return isNaN(bareSeconds) ? 0 : Math.max(0, bareSeconds);
}

/**
 * Formats seconds into SRT timestamp string: HH:MM:SS,mmm
 */
export function formatSecondsToSRTTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const totalMillis = Math.round(safeSec * 1000);
  const millis = totalMillis % 1000;
  const totalSec = Math.floor(totalMillis / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)},${pad3(millis)}`;
}

/**
 * Formats seconds into WebVTT timestamp string: HH:MM:SS.mmm
 */
export function formatSecondsToVTTTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const totalMillis = Math.round(safeSec * 1000);
  const millis = totalMillis % 1000;
  const totalSec = Math.floor(totalMillis / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}.${pad3(millis)}`;
}

/**
 * Strips HTML and WebVTT markup tags (e.g. <i>, <b>, <font color="...">, <v Speaker>).
 */
export function stripSubtitleMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // remove HTML/XML tags
    .replace(/\{[^}]+\}/g, '') // remove ASS/SSA override tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Transforms subtitle text casing according to selection.
 */
export function applySubtitleCasing(text: string, casing: SubtitleCasing = 'as-is'): string {
  if (!text || casing === 'as-is') return text;

  if (casing === 'uppercase') {
    return text.toUpperCase();
  }

  if (casing === 'titlecase') {
    return text.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
    );
  }

  if (casing === 'sentencecase') {
    // Capitalize first letter after sentence terminators (. ? !) or beginning
    return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
  }

  return text;
}

/**
 * Parses raw subtitle content (.srt or .vtt) into an array of structured SubtitleCue objects.
 * Tolerant to BOM, CRLF, missing index numbers, and multiline text.
 */
export function parseSubtitleContent(rawContent: string): SubtitleCue[] {
  if (!rawContent || typeof rawContent !== 'string') return [];

  // Strip BOM if present and normalize line endings
  const cleaned = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = cleaned.split('\n');
  const cues: SubtitleCue[] = [];

  let currentCueIndex = 1;
  let currentStart = -1;
  let currentEnd = -1;
  const currentTextLines: string[] = [];

  // Regex to match timestamp line: e.g. "00:01:20.000 --> 00:01:23.500" or with comma
  const timestampRegex =
    /((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;

  const flushCue = () => {
    if (currentStart >= 0 && currentEnd > currentStart && currentTextLines.length > 0) {
      const combinedText = stripSubtitleMarkup(currentTextLines.join('\n'));
      if (combinedText.trim()) {
        cues.push({
          index: currentCueIndex++,
          startSeconds: currentStart,
          endSeconds: currentEnd,
          text: combinedText,
        });
      }
    }
    currentStart = -1;
    currentEnd = -1;
    currentTextLines.length = 0;
  };

  let inHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WebVTT header block
    if (inHeader) {
      if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) {
        continue;
      }
      if (line === '') {
        inHeader = false;
        continue;
      }
      // If we encounter a timestamp line directly, exit header mode
      if (timestampRegex.test(line)) {
        inHeader = false;
      }
    }

    // Check if line contains timestamp arrow "-->"
    const match = line.match(timestampRegex);
    if (match) {
      // Flush any previous cue
      flushCue();

      currentStart = parseTimestampToSeconds(match[1]);
      currentEnd = parseTimestampToSeconds(match[2]);
      continue;
    }

    // Blank line indicates separator between cues
    if (line === '') {
      flushCue();
      continue;
    }

    // If we have an active timestamp, any non-blank line is text
    if (currentStart >= 0) {
      currentTextLines.push(lines[i]); // Keep original whitespace per line
    }
  }

  // Flush remaining cue if file ended without blank line
  flushCue();

  return cues;
}

/**
 * Converts parsed SubtitleCue items into timeline SequenceClip objects ready to insert.
 */
export function cuesToSequenceClips(
  cues: readonly SubtitleCue[],
  options: SubtitleImportOptions,
): { clips: SequenceClip[]; skipped: number } {
  const {
    targetTrackId,
    sequenceId,
    fps,
    offsetFrames = 0,
    stylePreset = 'modern',
    textCasing = 'as-is',
    colorLabel = 'violet',
    mintId = () => crypto.randomUUID(),
  } = options;

  const preset = CAPTION_STYLE_PRESETS[stylePreset] ?? CAPTION_STYLE_PRESETS.modern;
  const clips: SequenceClip[] = [];
  let skipped = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const text = applySubtitleCasing(cue.text, textCasing);
    if (!text.trim()) {
      skipped++;
      continue;
    }

    const startSec = cue.startSeconds;
    const endSec = cue.endSeconds;
    const durationSec = Math.max(0.1, endSec - startSec);

    const startFrames = Math.max(0, Math.round(secondsToFrames(startSec, fps) + offsetFrames));
    const durationFrames = Math.max(1, Math.round(secondsToFrames(durationSec, fps)));

    const label = text.length > 36 ? `${text.slice(0, 36)}…` : text;

    const clip: SequenceClip = {
      id: mintId(),
      sequenceId,
      trackId: targetTrackId,
      orderIndex: i,
      sourceKind: 'text',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: null,
      startFrames,
      durationFrames,
      sourceInFrames: null,
      sourceOutFrames: null,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label,
      colorLabel,
      overrides: [],
      effects: {
        text: {
          ...preset.effects,
          text,
        },
      },
    };

    clips.push(clip);
  }

  return { clips, skipped };
}

/**
 * Generates SubRip (.srt) subtitle content from timeline clips on a target track or all text clips.
 */
export function timelineClipsToSRT(
  clips: readonly SequenceClip[],
  fps: number,
  trackId?: string,
): string {
  const textClips = clips
    .filter(
      (clip) =>
        clip.sourceKind === 'text' &&
        (!trackId || clip.trackId === trackId) &&
        clip.startFrames !== null &&
        clip.startFrames !== undefined &&
        Boolean(clip.effects?.text?.text?.trim()),
    )
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  if (textClips.length === 0) return '';

  const blocks: string[] = [];

  textClips.forEach((clip, index) => {
    const startFrames = clip.startFrames ?? 0;
    const durationFrames = clip.durationFrames;
    const startSec = framesToSeconds(startFrames, fps);
    const endSec = framesToSeconds(startFrames + durationFrames, fps);

    const startTs = formatSecondsToSRTTimestamp(startSec);
    const endTs = formatSecondsToSRTTimestamp(endSec);
    const text = clip.effects?.text?.text?.trim() ?? clip.label;

    blocks.push(`${index + 1}\n${startTs} --> ${endTs}\n${text}`);
  });

  return blocks.join('\n\n') + '\n';
}

/**
 * Generates WebVTT (.vtt) subtitle content from timeline clips on a target track or all text clips.
 */
export function timelineClipsToWebVTT(
  clips: readonly SequenceClip[],
  fps: number,
  trackId?: string,
): string {
  const textClips = clips
    .filter(
      (clip) =>
        clip.sourceKind === 'text' &&
        (!trackId || clip.trackId === trackId) &&
        clip.startFrames !== null &&
        clip.startFrames !== undefined &&
        Boolean(clip.effects?.text?.text?.trim()),
    )
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  let output = 'WEBVTT - Exported from VideoStudio\n\n';

  textClips.forEach((clip, index) => {
    const startFrames = clip.startFrames ?? 0;
    const durationFrames = clip.durationFrames;
    const startSec = framesToSeconds(startFrames, fps);
    const endSec = framesToSeconds(startFrames + durationFrames, fps);

    const startTs = formatSecondsToVTTTimestamp(startSec);
    const endTs = formatSecondsToVTTTimestamp(endSec);
    const text = clip.effects?.text?.text?.trim() ?? clip.label;

    output += `${index + 1}\n${startTs} --> ${endTs}\n${text}\n\n`;
  });

  return output.trimEnd() + '\n';
}

export interface AssSubtitleStyle {
  id: string;
  name: string;
  fontName: string;
  fontSize: number;
  primaryColor: string; // &H00BBGGRR&
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: number;
  italic: number;
  borderStyle: number; // 1 = outline + shadow, 3 = opaque bounding box
  outline: number;
  shadow: number;
  alignment: number; // 2 = bottom center, 8 = top center, 5 = middle center
  marginV: number;
  description: string;
}

export const ASS_SUBTITLE_STYLES: Record<string, AssSubtitleStyle> = {
  classic_clean: {
    id: 'classic_clean',
    name: 'Classic Clean',
    fontName: 'Arial',
    fontSize: 24,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H000000FF',
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    bold: -1,
    italic: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 1,
    alignment: 2,
    marginV: 30,
    description: 'Crisp white font with subtle black outline and drop shadow',
  },
  cinema_gold: {
    id: 'cinema_gold',
    name: 'Cinema Gold',
    fontName: 'Georgia',
    fontSize: 26,
    primaryColor: '&H008AF0FE', // Gold #fef08a in BGR
    secondaryColor: '&H000000FF',
    outlineColor: '&H00101010',
    backColor: '&H80000000',
    bold: 0,
    italic: -1,
    borderStyle: 1,
    outline: 2,
    shadow: 2,
    alignment: 2,
    marginV: 35,
    description: 'Warm theatrical golden serif with soft drop shadow',
  },
  yellow_broadcast: {
    id: 'yellow_broadcast',
    name: 'Yellow Broadcast',
    fontName: 'Arial',
    fontSize: 28,
    primaryColor: '&H0000FFFF', // Pure yellow in BGR
    secondaryColor: '&H000000FF',
    outlineColor: '&H00000000',
    backColor: '&H00000000',
    bold: -1,
    italic: 0,
    borderStyle: 1,
    outline: 3,
    shadow: 1,
    alignment: 2,
    marginV: 30,
    description: 'High-visibility broadcast yellow with bold black outline',
  },
  tiktok_box: {
    id: 'tiktok_box',
    name: 'TikTok Pill Box',
    fontName: 'Trebuchet MS',
    fontSize: 30,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H000000FF',
    outlineColor: '&H00000000',
    backColor: '&HB0000000', // semi-transparent black pill box
    bold: -1,
    italic: 0,
    borderStyle: 3, // Opaque/translucent bounding box
    outline: 3,
    shadow: 0,
    alignment: 2,
    marginV: 40,
    description: 'Viral social-media bold white text with opaque dark bounding box',
  },
  retro_teletext: {
    id: 'retro_teletext',
    name: 'Retro Teletext',
    fontName: 'Courier New',
    fontSize: 22,
    primaryColor: '&H00FFFF00', // Cyan in BGR
    secondaryColor: '&H000000FF',
    outlineColor: '&H00000000',
    backColor: '&H00000000',
    bold: -1,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginV: 25,
    description: 'Monospaced retro teletext / closed-caption terminal styling',
  },
};

/**
 * Formats seconds to ASS timestamp format: H:MM:SS.cc (centisecond precision).
 */
export function formatSecondsToASSTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const totalCentis = Math.round(s * 100);
  const centis = totalCentis % 100;
  const totalSecs = Math.floor(totalCentis / 100);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const cc = String(centis).padStart(2, '0');
  return `${hours}:${mm}:${ss}.${cc}`;
}

/**
 * Generates an Advanced SubStation Alpha v4+ (.ass) script file content
 * from timeline text/subtitle clips, styled for FFmpeg `-vf subtitles` burn-in.
 */
export function timelineClipsToASS(
  clips: readonly SequenceClip[],
  fps: number,
  options?: {
    styleId?: string;
    videoWidth?: number;
    videoHeight?: number;
    trackId?: string;
  },
): string {
  const styleId = options?.styleId ?? 'classic_clean';
  const style = ASS_SUBTITLE_STYLES[styleId] ?? ASS_SUBTITLE_STYLES.classic_clean;
  const playResX = options?.videoWidth ?? 1920;
  const playResY = options?.videoHeight ?? 1080;

  const textClips = clips
    .filter(
      (clip) =>
        clip.sourceKind === 'text' &&
        (!options?.trackId || clip.trackId === options?.trackId) &&
        clip.startFrames !== null &&
        clip.startFrames !== undefined &&
        Boolean(clip.effects?.text?.text?.trim()),
    )
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  let script = `[Script Info]
Title: VideoStudio Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${style.primaryColor},${style.secondaryColor},${style.outlineColor},${style.backColor},${style.bold},${style.italic},0,0,100,100,0,0,${style.borderStyle},${style.outline},${style.shadow},${style.alignment},20,20,${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  textClips.forEach((clip) => {
    const startFrames = clip.startFrames ?? 0;
    const durationFrames = clip.durationFrames;
    const startSec = framesToSeconds(startFrames, fps);
    const endSec = framesToSeconds(startFrames + durationFrames, fps);

    const startTs = formatSecondsToASSTimestamp(startSec);
    const endTs = formatSecondsToASSTimestamp(endSec);
    const rawText = clip.effects?.text?.text?.trim() ?? clip.label;
    // ASS linebreaks are escaped as \N
    const assText = rawText.replace(/\r?\n/g, '\\N');

    script += `Dialogue: 0,${startTs},${endTs},Default,,0,0,0,,${assText}\n`;
  });

  return script;
}

/**
 * Splits a subtitle clip into two contiguous clips at a specified timeline frame.
 * The original text is split across the two parts based on natural word boundaries or midpoint.
 */
export function splitSubtitleClip(
  clip: SequenceClip,
  splitFrame: number,
  mintId: () => string = () => crypto.randomUUID(),
): [SequenceClip, SequenceClip] | null {
  const start = clip.startFrames ?? 0;
  const duration = clip.durationFrames;
  const end = start + duration;

  if (splitFrame <= start || splitFrame >= end) {
    return null;
  }

  const firstDuration = splitFrame - start;
  const secondDuration = end - splitFrame;

  const rawText = clip.effects?.text?.text ?? clip.label;
  const words = rawText.trim().split(/\s+/);

  let text1 = rawText;
  let text2 = rawText;

  if (words.length > 1) {
    const ratio = firstDuration / duration;
    const splitIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
    text1 = words.slice(0, splitIndex).join(' ');
    text2 = words.slice(splitIndex).join(' ');
  }

  const clip1: SequenceClip = {
    ...clip,
    durationFrames: firstDuration,
    label: text1.length > 36 ? `${text1.slice(0, 36)}…` : text1,
    effects: clip.effects
      ? {
          ...clip.effects,
          text: clip.effects.text ? { ...clip.effects.text, text: text1 } : undefined,
        }
      : undefined,
  };

  const clip2: SequenceClip = {
    ...clip,
    id: mintId(),
    startFrames: splitFrame,
    durationFrames: secondDuration,
    label: text2.length > 36 ? `${text2.slice(0, 36)}…` : text2,
    effects: clip.effects
      ? {
          ...clip.effects,
          text: clip.effects.text ? { ...clip.effects.text, text: text2 } : undefined,
        }
      : undefined,
  };

  return [clip1, clip2];
}

/**
 * Merges two adjacent subtitle clips on the same track into a single continuous clip.
 */
export function mergeSubtitleClips(
  clipA: SequenceClip,
  clipB: SequenceClip,
): SequenceClip | null {
  if (clipA.trackId !== clipB.trackId) return null;

  const startA = clipA.startFrames ?? 0;
  const startB = clipB.startFrames ?? 0;
  const endA = startA + clipA.durationFrames;
  const endB = startB + clipB.durationFrames;

  const earliestStart = Math.min(startA, startB);
  const latestEnd = Math.max(endA, endB);

  const textA = clipA.effects?.text?.text ?? clipA.label;
  const textB = clipB.effects?.text?.text ?? clipB.label;

  const mergedText = startA <= startB ? `${textA} ${textB}`.trim() : `${textB} ${textA}`.trim();

  return {
    ...clipA,
    startFrames: earliestStart,
    durationFrames: Math.max(1, latestEnd - earliestStart),
    label: mergedText.length > 36 ? `${mergedText.slice(0, 36)}…` : mergedText,
    effects: clipA.effects
      ? {
          ...clipA.effects,
          text: clipA.effects.text ? { ...clipA.effects.text, text: mergedText } : undefined,
        }
      : undefined,
  };
}

/**
 * Automatically breaks text into balanced lines conforming to maximum characters per line (CPL).
 * Industry standard: 37 for broadcast / 20 for mobile 9:16 vertical video.
 */
export function autoBreakSubtitleLines(text: string, maxCharsPerLine = 37): string {
  if (!text || text.length <= maxCharsPerLine) return text;

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

/**
 * Performs search and replace across all subtitle/text clips.
 */
export function searchAndReplaceSubtitles(
  clips: readonly SequenceClip[],
  searchTerm: string,
  replaceTerm: string,
  options?: {
    matchCase?: boolean;
    trackId?: string;
  },
): { clips: SequenceClip[]; matchCount: number } {
  if (!searchTerm) {
    return { clips: [...clips], matchCount: 0 };
  }

  const matchCase = options?.matchCase ?? false;
  const regex = new RegExp(
    searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    matchCase ? 'g' : 'gi',
  );

  let matchCount = 0;
  const updatedClips = clips.map((clip) => {
    if (clip.sourceKind !== 'text') return clip;
    if (options?.trackId && clip.trackId !== options.trackId) return clip;

    const originalText = clip.effects?.text?.text ?? clip.label ?? '';
    const occurrences = (originalText.match(regex) || []).length;
    if (occurrences === 0) return clip;

    matchCount += occurrences;
    const newText = originalText.replace(regex, replaceTerm);

    return {
      ...clip,
      label: newText.length > 36 ? `${newText.slice(0, 36)}…` : newText,
      effects: clip.effects
        ? {
            ...clip.effects,
            text: clip.effects.text ? { ...clip.effects.text, text: newText } : undefined,
          }
        : undefined,
    };
  });

  return { clips: updatedClips, matchCount };
}

/**
 * Applies a visual caption style preset to all target text clips while preserving individual cue text.
 */
export function applyStylePresetToClips(
  clips: readonly SequenceClip[],
  presetId: CaptionPresetId,
  trackId?: string,
): SequenceClip[] {
  const preset = CAPTION_STYLE_PRESETS[presetId] ?? CAPTION_STYLE_PRESETS.modern;

  return clips.map((clip) => {
    if (clip.sourceKind !== 'text') return clip;
    if (trackId && clip.trackId !== trackId) return clip;

    const existingText = clip.effects?.text?.text ?? clip.label;

    return {
      ...clip,
      effects: {
        ...clip.effects,
        text: {
          ...preset.effects,
          text: existingText,
        },
      },
    };
  });
}

/**
 * Exports clean plain text transcript from timeline subtitle clips.
 */
export function exportTranscriptText(
  clips: readonly SequenceClip[],
  fps: number,
  options?: {
    includeTimestamps?: boolean;
    trackId?: string;
  },
): string {
  const includeTimestamps = options?.includeTimestamps ?? true;
  const textClips = clips
    .filter(
      (clip) =>
        clip.sourceKind === 'text' &&
        (!options?.trackId || clip.trackId === options?.trackId) &&
        clip.startFrames !== null &&
        clip.startFrames !== undefined &&
        Boolean(clip.effects?.text?.text?.trim()),
    )
    .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));

  if (textClips.length === 0) return '';

  return textClips
    .map((clip) => {
      const text = (clip.effects?.text?.text?.trim() ?? clip.label).replace(/\r?\n/g, ' ');
      if (!includeTimestamps) return text;
      const startSec = framesToSeconds(clip.startFrames ?? 0, fps);
      const endSec = framesToSeconds((clip.startFrames ?? 0) + clip.durationFrames, fps);
      const startTs = formatSecondsToSRTTimestamp(startSec).slice(0, 8);
      const endTs = formatSecondsToSRTTimestamp(endSec).slice(0, 8);
      return `[${startTs} - ${endTs}] ${text}`;
    })
    .join('\n\n');
}


