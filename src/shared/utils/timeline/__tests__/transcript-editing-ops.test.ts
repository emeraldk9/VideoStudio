import { describe, expect, it } from 'vitest';
import {
  tokenizeCueWords,
  extractTranscriptCues,
  calculateWordsBoundingSpan,
  rippleDeleteTranscriptRange,
  formatTranscriptExport,
  type TranscriptCue,
} from '../transcript-editing-ops';
import type { SequenceClip, SequenceDocument, SequenceTrack } from '../../../types/sequence';

describe('Milestone S163: AI Text-Based Video Editing & Transcript Rough Cut Ops', () => {
  const dummyTrackV1: SequenceTrack = {
    id: 'track-v1',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'V1',
    orderIndex: 0,
    muted: false,
    locked: false,
    volume: 1,
    videoEnabled: true,
    magnetic: true,
    heightPx: 64,
    role: null,
  };

  const dummyTrackA1: SequenceTrack = {
    id: 'track-a1',
    sequenceId: 'seq-1',
    kind: 'audio',
    name: 'A1 Dialogue',
    orderIndex: 0,
    muted: false,
    locked: false,
    volume: 1,
    videoEnabled: true,
    magnetic: false,
    heightPx: 36,
    role: 'narration',
  };

  const dummyTrackSub: SequenceTrack = {
    id: 'track-sub',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'Subtitles',
    orderIndex: 1,
    muted: false,
    locked: false,
    volume: 1,
    videoEnabled: true,
    magnetic: false,
    heightPx: 28,
    role: 'text',
  };

  const videoClip1: SequenceClip = {
    id: 'clip-v1',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'video1.mp4',
    sourceInFrames: 0,
    durationFrames: 90, // 3 seconds at 30fps (0..90)
    startFrames: 0,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Interview Video',
    overrides: [],
  };

  const audioClip1: SequenceClip = {
    id: 'clip-a1',
    sequenceId: 'seq-1',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    filePath: 'audio1.wav',
    sourceInFrames: 0,
    durationFrames: 90, // 0..90
    startFrames: 0,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Host Audio',
    overrides: [],
  };

  const subClip1: SequenceClip = {
    id: 'clip-sub1',
    sequenceId: 'seq-1',
    trackId: 'track-sub',
    orderIndex: 0,
    sourceKind: 'text',
    filePath: null,
    sourceInFrames: null,
    durationFrames: 90, // 0..90
    startFrames: 0,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Subtitle 1',
    effects: {
      text: {
        text: 'Hello um welcome to VideoStudio, like really great!',
        fontSizePx: 24,
        fontFamily: 'Inter',
        colorHex: '#ffffff',
        align: 'center',
        positionPct: { x: 0.5, y: 0.9 },
        preset: 'caption',
      },
    },
    overrides: [],
  };

  const testDoc: SequenceDocument = {
    sequence: {
      id: 'seq-1',
      projectId: 'proj-1',
      name: 'Interview Cut',
      fps: 30,
      width: 1920,
      height: 1080,
      spineTrackId: 'track-v1',
      createdAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    },
    tracks: [dummyTrackV1, dummyTrackA1, dummyTrackSub],
    clips: [videoClip1, audioClip1, subClip1],
  };

  it('tokenizes subtitle text into word tokens with proportional timeline framing', () => {
    const text = 'Hello um welcome to VideoStudio';
    const tokens = tokenizeCueWords(text, 0, 90);

    expect(tokens.length).toBe(5);
    expect(tokens[0].word).toBe('Hello');
    expect(tokens[0].cleanWord).toBe('hello');
    expect(tokens[0].startFrame).toBe(0);
    expect(tokens[0].isFiller).toBe(false);

    // Second word is filler 'um'
    expect(tokens[1].word).toBe('um');
    expect(tokens[1].cleanWord).toBe('um');
    expect(tokens[1].isFiller).toBe(true);

    // Word tokens must stay chronologically ordered
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].startFrame).toBeGreaterThanOrEqual(tokens[i - 1].startFrame);
      expect(tokens[i].endFrame).toBeGreaterThan(tokens[i].startFrame);
    }
  });

  it('identifies multi-lingual and hesitation filler words', () => {
    const text = 'uh you know basically we like made it';
    const tokens = tokenizeCueWords(text, 0, 120, ['uh', 'you know', 'like']);

    const fillerTokens = tokens.filter((t) => t.isFiller);
    expect(fillerTokens.map((t) => t.word)).toEqual(['uh', 'like']);
  });

  it('extracts structured transcript cues from sequence clips', () => {
    const cues = extractTranscriptCues(testDoc.clips, 'track-sub');
    expect(cues.length).toBe(1);
    expect(cues[0].clipId).toBe('clip-sub1');
    expect(cues[0].words.length).toBeGreaterThan(3);
    expect(cues[0].text).toContain('Hello um welcome');
  });

  it('calculates bounding time frame span across multiple selected word tokens', () => {
    const tokens = tokenizeCueWords('first second third fourth', 100, 80);
    expect(tokens.length).toBe(4);

    // Select second and third tokens
    const span = calculateWordsBoundingSpan([tokens[1], tokens[2]]);
    expect(span).not.toBeNull();
    expect(span?.startFrame).toBe(tokens[1].startFrame);
    expect(span?.endFrame).toBe(tokens[2].endFrame);
    expect(span?.durationFrames).toBe(tokens[2].endFrame - tokens[1].startFrame);
  });

  it('ripple-deletes a transcript time range across all synchronized tracks and compacts sequence', () => {
    // Range to excise: frames 30 to 60 (duration 30 frames, 1 second)
    const updatedDoc = rippleDeleteTranscriptRange(testDoc, 30, 60, 3);

    // After excising 30 frames from a 90-frame sequence:
    // Video on magnetic track: slices into two segments (0..30 and 30..60), total 60 frames
    const vClips = updatedDoc.clips.filter((c) => c.trackId === 'track-v1');
    expect(vClips.length).toBe(2);
    expect(vClips[0].durationFrames).toBe(30);
    expect(vClips[1].durationFrames).toBe(30);
    expect(vClips[0].durationFrames + vClips[1].durationFrames).toBe(60);

    // Audio on non-magnetic track: slices into two segments, with second shifted left by 30 frames
    const aClips = updatedDoc.clips.filter((c) => c.trackId === 'track-a1');
    expect(aClips.length).toBe(2);
    expect(aClips[0].startFrames).toBe(0);
    expect(aClips[0].durationFrames).toBe(30);
    expect(aClips[1].startFrames).toBe(30);
    expect(aClips[1].durationFrames).toBe(30);

    // Micro-fades applied to audio to avoid pop/clicks
    expect(aClips[0].fadeOutFrames).toBeGreaterThanOrEqual(3);
    expect(aClips[1].fadeInFrames).toBeGreaterThanOrEqual(3);
  });

  it('exports formatted transcripts in Markdown, Plain Text, SRT, and WebVTT', () => {
    const dummyCues: TranscriptCue[] = [
      {
        clipId: 'cue-1',
        trackId: 'track-sub',
        orderIndex: 0,
        startFrame: 0,
        endFrame: 60,
        durationFrames: 60,
        text: 'Welcome to VideoStudio workstation.',
        speaker: 'Host',
        words: [],
      },
      {
        clipId: 'cue-2',
        trackId: 'track-sub',
        orderIndex: 1,
        startFrame: 60,
        endFrame: 120,
        durationFrames: 60,
        text: 'Now you can edit video directly by editing text.',
        speaker: 'Host',
        words: [],
      },
    ];

    // 1. Markdown Export
    const md = formatTranscriptExport(dummyCues, 'markdown', 30, 'Episode 101');
    expect(md).toContain('# Episode 101');
    expect(md).toContain('**Host:** Welcome to VideoStudio workstation.');
    expect(md).toContain('[0:00 → 0:02]');

    // 2. Plain Text Export
    const txt = formatTranscriptExport(dummyCues, 'txt', 30);
    expect(txt).toContain('[0:00] Welcome to VideoStudio workstation.');

    // 3. SRT Export
    const srt = formatTranscriptExport(dummyCues, 'srt', 30);
    expect(srt).toContain('00:00:00,000 --> 00:00:02,000');
    expect(srt).toContain('Welcome to VideoStudio workstation.');

    // 4. WebVTT Export
    const vtt = formatTranscriptExport(dummyCues, 'vtt', 30);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.000');
  });
});
