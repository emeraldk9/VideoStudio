import { describe, expect, it } from 'vitest';

import type { SequenceClip } from '../../../types/sequence';
import {
  applySubtitleCasing,
  applyStylePresetToClips,
  autoBreakSubtitleLines,
  CAPTION_STYLE_PRESETS,
  cuesToSequenceClips,
  exportTranscriptText,
  formatSecondsToSRTTimestamp,
  formatSecondsToVTTTimestamp,
  formatSecondsToASSTimestamp,
  mergeSubtitleClips,
  parseSubtitleContent,
  parseTimestampToSeconds,
  searchAndReplaceSubtitles,
  splitSubtitleClip,
  stripSubtitleMarkup,
  timelineClipsToSRT,
  timelineClipsToWebVTT,
  timelineClipsToASS,
  ASS_SUBTITLE_STYLES,
} from '../subtitle-ops';

describe('subtitle-ops', () => {
  describe('parseTimestampToSeconds', () => {
    it('parses standard SRT timestamps with comma separator', () => {
      expect(parseTimestampToSeconds('00:01:23,456')).toBeCloseTo(83.456, 3);
      expect(parseTimestampToSeconds('01:00:00,000')).toBe(3600);
      expect(parseTimestampToSeconds('00:00:05,250')).toBeCloseTo(5.25, 3);
    });

    it('parses WebVTT timestamps with period separator', () => {
      expect(parseTimestampToSeconds('00:01:23.456')).toBeCloseTo(83.456, 3);
      expect(parseTimestampToSeconds('01:23.456')).toBeCloseTo(83.456, 3);
    });

    it('handles malformed inputs safely', () => {
      expect(parseTimestampToSeconds('')).toBe(0);
      expect(parseTimestampToSeconds('invalid')).toBe(0);
    });
  });

  describe('formatSecondsToSRTTimestamp and formatSecondsToVTTTimestamp', () => {
    it('formats seconds to SRT timestamp with comma', () => {
      expect(formatSecondsToSRTTimestamp(83.456)).toBe('00:01:23,456');
      expect(formatSecondsToSRTTimestamp(3665.12)).toBe('01:01:05,120');
    });

    it('formats seconds to WebVTT timestamp with dot', () => {
      expect(formatSecondsToVTTTimestamp(83.456)).toBe('00:01:23.456');
      expect(formatSecondsToVTTTimestamp(3665.12)).toBe('01:01:05.120');
    });
  });

  describe('stripSubtitleMarkup', () => {
    it('removes HTML tags and entities', () => {
      const input = '<i>Hello</i>, <b>world</b>! &amp; &quot;quotes&quot;';
      expect(stripSubtitleMarkup(input)).toBe('Hello, world! & "quotes"');
    });

    it('removes WebVTT voice tags', () => {
      const input = '<v Roger>Here is dialogue</v>';
      expect(stripSubtitleMarkup(input)).toBe('Here is dialogue');
    });
  });

  describe('applySubtitleCasing', () => {
    const sample = 'hello world. this is video studio!';

    it('leaves text as-is', () => {
      expect(applySubtitleCasing(sample, 'as-is')).toBe(sample);
    });

    it('converts to UPPERCASE', () => {
      expect(applySubtitleCasing(sample, 'uppercase')).toBe(
        'HELLO WORLD. THIS IS VIDEO STUDIO!',
      );
    });

    it('converts to Title Case', () => {
      expect(applySubtitleCasing(sample, 'titlecase')).toBe(
        'Hello World. This Is Video Studio!',
      );
    });

    it('converts to Sentence case', () => {
      expect(applySubtitleCasing(sample, 'sentencecase')).toBe(
        'Hello world. This is video studio!',
      );
    });
  });

  describe('parseSubtitleContent', () => {
    it('parses standard SRT file content with multiline text and CRLF', () => {
      const srtRaw =
        '1\r\n00:00:01,000 --> 00:00:03,500\r\nWelcome to VideoStudio.\r\nNext-gen video editing.\r\n\r\n' +
        '2\r\n00:00:04,200 --> 00:00:06,800\r\nNow supporting subtitles!\r\n';

      const cues = parseSubtitleContent(srtRaw);
      expect(cues).toHaveLength(2);
      expect(cues[0].index).toBe(1);
      expect(cues[0].startSeconds).toBeCloseTo(1.0, 3);
      expect(cues[0].endSeconds).toBeCloseTo(3.5, 3);
      expect(cues[0].text).toBe('Welcome to VideoStudio.\nNext-gen video editing.');

      expect(cues[1].index).toBe(2);
      expect(cues[1].startSeconds).toBeCloseTo(4.2, 3);
      expect(cues[1].endSeconds).toBeCloseTo(6.8, 3);
      expect(cues[1].text).toBe('Now supporting subtitles!');
    });

    it('parses WebVTT file content with headers and NOTE blocks', () => {
      const vttRaw = `WEBVTT - Video Captions
NOTE This is an editorial note

00:00:02.000 --> 00:00:04.500
First WebVTT subtitle cue.

00:00:05.100 --> 00:00:08.000
Second WebVTT subtitle cue.`;

      const cues = parseSubtitleContent(vttRaw);
      expect(cues).toHaveLength(2);
      expect(cues[0].startSeconds).toBeCloseTo(2.0, 3);
      expect(cues[0].endSeconds).toBeCloseTo(4.5, 3);
      expect(cues[0].text).toBe('First WebVTT subtitle cue.');
      expect(cues[1].startSeconds).toBeCloseTo(5.1, 3);
      expect(cues[1].endSeconds).toBeCloseTo(8.0, 3);
      expect(cues[1].text).toBe('Second WebVTT subtitle cue.');
    });

    it('tolerates UTF-8 BOM', () => {
      const srtWithBom =
        '\uFEFF1\n00:00:01,000 --> 00:00:02,000\nBOM test passed\n';
      const cues = parseSubtitleContent(srtWithBom);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('BOM test passed');
    });

    it('returns empty array on empty or invalid text', () => {
      expect(parseSubtitleContent('')).toEqual([]);
      expect(parseSubtitleContent('Just random non-subtitle text')).toEqual([]);
    });
  });

  describe('cuesToSequenceClips', () => {
    it('converts cues into accurately timed SequenceClips with presets and offset', () => {
      const cues = [
        { index: 1, startSeconds: 1.0, endSeconds: 3.0, text: 'First caption' },
        { index: 2, startSeconds: 4.5, endSeconds: 6.0, text: 'Second caption' },
      ];

      let idCounter = 1;
      const { clips, skipped } = cuesToSequenceClips(cues, {
        targetTrackId: 'track-text-1',
        sequenceId: 'seq-1',
        fps: 24,
        offsetFrames: 24, // 1 second playhead offset
        stylePreset: 'cinema',
        textCasing: 'uppercase',
        colorLabel: 'violet',
        mintId: () => `clip-${idCounter++}`,
      });

      expect(skipped).toBe(0);
      expect(clips).toHaveLength(2);

      // Cue 1: 1.0s = 24 frames + 24 offset = 48 frames. Duration 2.0s = 48 frames.
      expect(clips[0].id).toBe('clip-1');
      expect(clips[0].trackId).toBe('track-text-1');
      expect(clips[0].sourceKind).toBe('text');
      expect(clips[0].startFrames).toBe(48);
      expect(clips[0].durationFrames).toBe(48);
      expect(clips[0].colorLabel).toBe('violet');
      expect(clips[0].effects?.text?.text).toBe('FIRST CAPTION');
      expect(clips[0].effects?.text?.colorHex).toBe(CAPTION_STYLE_PRESETS.cinema.effects.colorHex);

      // Cue 2: 4.5s = 108 frames + 24 offset = 132 frames. Duration 1.5s = 36 frames.
      expect(clips[1].id).toBe('clip-2');
      expect(clips[1].startFrames).toBe(132);
      expect(clips[1].durationFrames).toBe(36);
      expect(clips[1].effects?.text?.text).toBe('SECOND CAPTION');
    });
  });

  describe('timelineClipsToSRT and timelineClipsToWebVTT', () => {
    const mockClips: SequenceClip[] = [
      {
        id: 'clip-1',
        sequenceId: 'seq-1',
        trackId: 'track-text-1',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        startFrames: 24, // 1s at 24fps
        durationFrames: 48, // 2s at 24fps -> ends at 3s
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'First subtitle',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'First subtitle line',
          },
        },
      },
      {
        id: 'clip-2',
        sequenceId: 'seq-1',
        trackId: 'track-text-1',
        orderIndex: 1,
        sourceKind: 'text',
        filePath: null,
        startFrames: 96, // 4s at 24fps
        durationFrames: 36, // 1.5s -> ends at 5.5s
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Second subtitle',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'Second subtitle line',
          },
        },
      },
      // Video clip that should be ignored
      {
        id: 'clip-video-1',
        sequenceId: 'seq-1',
        trackId: 'track-v1',
        orderIndex: 0,
        sourceKind: 'video',
        filePath: 'video.mp4',
        startFrames: 0,
        durationFrames: 200,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Video Clip',
        overrides: [],
      },
    ];

    it('exports text clips to standard SubRip (.srt) format', () => {
      const srt = timelineClipsToSRT(mockClips, 24, 'track-text-1');
      expect(srt).toContain('1\n00:00:01,000 --> 00:00:03,000\nFirst subtitle line');
      expect(srt).toContain('2\n00:00:04,000 --> 00:00:05,500\nSecond subtitle line');
      expect(srt).not.toContain('Video Clip');
    });

    it('exports text clips to standard WebVTT (.vtt) format', () => {
      const vtt = timelineClipsToWebVTT(mockClips, 24, 'track-text-1');
      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('1\n00:00:01.000 --> 00:00:03.000\nFirst subtitle line');
      expect(vtt).toContain('2\n00:00:04.000 --> 00:00:05.500\nSecond subtitle line');
    });

    it('demonstrates round-trip fidelity: SRT -> parse -> clips -> SRT', () => {
      const originalSRT =
        '1\n00:00:02,000 --> 00:00:04,500\nHello round-trip!\n\n' +
        '2\n00:00:05,000 --> 00:00:07,000\nWorks seamlessly.';

      const parsed = parseSubtitleContent(originalSRT);
      const { clips } = cuesToSequenceClips(parsed, {
        targetTrackId: 'track-roundtrip',
        sequenceId: 'seq-rt',
        fps: 25,
      });

      const generatedSRT = timelineClipsToSRT(clips, 25, 'track-roundtrip');
      const reParsed = parseSubtitleContent(generatedSRT);

      expect(reParsed).toHaveLength(2);
      expect(reParsed[0].text).toBe('Hello round-trip!');
      expect(reParsed[0].startSeconds).toBeCloseTo(2.0, 1);
      expect(reParsed[0].endSeconds).toBeCloseTo(4.5, 1);
      expect(reParsed[1].text).toBe('Works seamlessly.');
    });

    describe('formatSecondsToASSTimestamp', () => {
      it('formats zero seconds accurately', () => {
        expect(formatSecondsToASSTimestamp(0)).toBe('0:00:00.00');
      });

      it('formats sub-second centiseconds accurately', () => {
        expect(formatSecondsToASSTimestamp(1.234)).toBe('0:00:01.23');
        expect(formatSecondsToASSTimestamp(83.456)).toBe('0:01:23.46');
      });

      it('formats hours, minutes, seconds and centiseconds', () => {
        expect(formatSecondsToASSTimestamp(3665.12)).toBe('1:01:05.12');
      });
    });

    describe('ASS Subtitle Styles Presets', () => {
      it('defines all standard broadcast & social style presets', () => {
        expect(ASS_SUBTITLE_STYLES.classic_clean).toBeDefined();
        expect(ASS_SUBTITLE_STYLES.cinema_gold).toBeDefined();
        expect(ASS_SUBTITLE_STYLES.yellow_broadcast).toBeDefined();
        expect(ASS_SUBTITLE_STYLES.tiktok_box).toBeDefined();
        expect(ASS_SUBTITLE_STYLES.retro_teletext).toBeDefined();

        expect(ASS_SUBTITLE_STYLES.tiktok_box.borderStyle).toBe(3); // opaque bounding box
        expect(ASS_SUBTITLE_STYLES.cinema_gold.fontName).toBe('Georgia');
        expect(ASS_SUBTITLE_STYLES.retro_teletext.fontName).toBe('Courier New');
      });
    });

    describe('timelineClipsToASS', () => {
      it('generates a valid ASS v4+ script with script info, styles, and dialogue events', () => {
        const ass = timelineClipsToASS(mockClips, 24);

        expect(ass).toContain('[Script Info]');
        expect(ass).toContain('ScriptType: v4.00+');
        expect(ass).toContain('PlayResX: 1920');
        expect(ass).toContain('PlayResY: 1080');
        expect(ass).toContain('[V4+ Styles]');
        expect(ass).toContain('Style: Default,Arial');
        expect(ass).toContain('[Events]');
        expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,First subtitle line');
        expect(ass).toContain('Dialogue: 0,0:00:04.00,0:00:05.50,Default,,0,0,0,,Second subtitle line');
        expect(ass).not.toContain('Video Clip');
      });

      it('applies the selected subtitle style preset (e.g. tiktok_box)', () => {
        const ass = timelineClipsToASS(mockClips, 24, {
          styleId: 'tiktok_box',
          videoWidth: 1080,
          videoHeight: 1920,
        });

        expect(ass).toContain('PlayResX: 1080');
        expect(ass).toContain('PlayResY: 1920');
        expect(ass).toContain('Style: Default,Trebuchet MS,30');
      });

      it('escapes multiline subtitles to ASS \\N notation', () => {
        const multilineClip: SequenceClip = {
          ...mockClips[0],
          id: 'clip-multi',
          effects: {
            text: {
              ...CAPTION_STYLE_PRESETS.modern.effects,
              text: 'Line 1\nLine 2\r\nLine 3',
            },
          },
        };

        const ass = timelineClipsToASS([multilineClip], 24);
        expect(ass).toContain('Line 1\\NLine 2\\NLine 3');
      });

      it('filters dialogue by specific track ID when provided', () => {
        const otherTrackClip: SequenceClip = {
          ...mockClips[1],
          id: 'clip-other-track',
          trackId: 'track-text-other',
          effects: {
            text: {
              ...CAPTION_STYLE_PRESETS.modern.effects,
              text: 'Other track caption',
            },
          },
        };

        const ass = timelineClipsToASS([...mockClips, otherTrackClip], 24, {
          trackId: 'track-text-1',
        });

        expect(ass).toContain('First subtitle line');
        expect(ass).toContain('Second subtitle line');
        expect(ass).not.toContain('Other track caption');
      });
    });
  });

  describe('splitSubtitleClip', () => {
    const mockClip: SequenceClip = {
      id: 'sub-split-1',
      sequenceId: 'seq-1',
      trackId: 'track-text-1',
      orderIndex: 0,
      sourceKind: 'text',
      filePath: null,
      startFrames: 100,
      durationFrames: 60,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'The quick brown fox jumps over the dog',
      overrides: [],
      effects: {
        text: {
          ...CAPTION_STYLE_PRESETS.modern.effects,
          text: 'The quick brown fox jumps over the dog',
        },
      },
    };

    it('splits a clip into two contiguous parts with words distributed proportionally', () => {
      const split = splitSubtitleClip(mockClip, 130, () => 'new-sub-id');
      expect(split).not.toBeNull();
      if (!split) return;

      const [c1, c2] = split;
      expect(c1.id).toBe('sub-split-1');
      expect(c1.startFrames).toBe(100);
      expect(c1.durationFrames).toBe(30);

      expect(c2.id).toBe('new-sub-id');
      expect(c2.startFrames).toBe(130);
      expect(c2.durationFrames).toBe(30);

      expect(c1.effects?.text?.text).toBeDefined();
      expect(c2.effects?.text?.text).toBeDefined();
      expect(`${c1.effects?.text?.text} ${c2.effects?.text?.text}`).toBe(
        'The quick brown fox jumps over the dog',
      );
    });

    it('returns null if split frame is out of bounds', () => {
      expect(splitSubtitleClip(mockClip, 100)).toBeNull();
      expect(splitSubtitleClip(mockClip, 90)).toBeNull();
      expect(splitSubtitleClip(mockClip, 160)).toBeNull();
      expect(splitSubtitleClip(mockClip, 200)).toBeNull();
    });
  });

  describe('mergeSubtitleClips', () => {
    const clipA: SequenceClip = {
      id: 'sub-a',
      sequenceId: 'seq-1',
      trackId: 'track-text-1',
      orderIndex: 0,
      sourceKind: 'text',
      filePath: null,
      startFrames: 0,
      durationFrames: 30,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Hello',
      overrides: [],
      effects: {
        text: {
          ...CAPTION_STYLE_PRESETS.modern.effects,
          text: 'Hello',
        },
      },
    };

    const clipB: SequenceClip = {
      id: 'sub-b',
      sequenceId: 'seq-1',
      trackId: 'track-text-1',
      orderIndex: 1,
      sourceKind: 'text',
      filePath: null,
      startFrames: 35,
      durationFrames: 25,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'World',
      overrides: [],
      effects: {
        text: {
          ...CAPTION_STYLE_PRESETS.modern.effects,
          text: 'World',
        },
      },
    };

    it('merges two clips into a single continuous clip spanning both', () => {
      const merged = mergeSubtitleClips(clipA, clipB);
      expect(merged).not.toBeNull();
      if (!merged) return;

      expect(merged.startFrames).toBe(0);
      expect(merged.durationFrames).toBe(60); // 35 + 25 = 60
      expect(merged.effects?.text?.text).toBe('Hello World');
    });

    it('returns null if clips are on different tracks', () => {
      const diffTrackClip: SequenceClip = { ...clipB, trackId: 'track-other' };
      expect(mergeSubtitleClips(clipA, diffTrackClip)).toBeNull();
    });
  });

  describe('autoBreakSubtitleLines', () => {
    it('returns short text unchanged', () => {
      const short = 'Hello world';
      expect(autoBreakSubtitleLines(short, 37)).toBe(short);
    });

    it('breaks long line at natural word boundaries conforming to max chars', () => {
      const longText =
        'This is a rather long subtitle cue that definitely exceeds standard broadcast character limit';
      const broken = autoBreakSubtitleLines(longText, 37);
      const lines = broken.split('\n');

      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(37);
      }
      expect(lines.join(' ')).toBe(longText);
    });
  });

  describe('searchAndReplaceSubtitles', () => {
    const clips: SequenceClip[] = [
      {
        id: 'clip-1',
        sequenceId: 'seq-1',
        trackId: 'track-1',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        startFrames: 0,
        durationFrames: 30,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Welcome to Google AI',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'Welcome to Google AI studio',
          },
        },
      },
      {
        id: 'clip-2',
        sequenceId: 'seq-1',
        trackId: 'track-1',
        orderIndex: 1,
        sourceKind: 'text',
        filePath: null,
        startFrames: 30,
        durationFrames: 30,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Google makes great models',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'Google makes great models',
          },
        },
      },
    ];

    it('replaces all occurrences across clips', () => {
      const result = searchAndReplaceSubtitles(clips, 'Google', 'DeepMind');
      expect(result.matchCount).toBe(2);
      expect(result.clips[0].effects?.text?.text).toBe('Welcome to DeepMind AI studio');
      expect(result.clips[1].effects?.text?.text).toBe('DeepMind makes great models');
    });

    it('honors case sensitivity option', () => {
      const result = searchAndReplaceSubtitles(clips, 'google', 'DeepMind', { matchCase: true });
      expect(result.matchCount).toBe(0);
    });
  });

  describe('applyStylePresetToClips', () => {
    const mockClip: SequenceClip = {
      id: 'clip-style-1',
      sequenceId: 'seq-1',
      trackId: 'track-1',
      orderIndex: 0,
      sourceKind: 'text',
      filePath: null,
      startFrames: 0,
      durationFrames: 30,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Cinema dialog',
      overrides: [],
      effects: {
        text: {
          ...CAPTION_STYLE_PRESETS.modern.effects,
          text: 'Cinema dialog',
        },
      },
    };

    it('applies cinema preset styling while preserving existing text', () => {
      const styled = applyStylePresetToClips([mockClip], 'cinema');
      expect(styled[0].effects?.text?.colorHex).toBe('#fef08a');
      expect(styled[0].effects?.text?.text).toBe('Cinema dialog');
    });
  });

  describe('exportTranscriptText', () => {
    const clips: SequenceClip[] = [
      {
        id: 'clip-tr-1',
        sequenceId: 'seq-1',
        trackId: 'track-1',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        startFrames: 0,
        durationFrames: 48,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Hello world',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'Hello world',
          },
        },
      },
      {
        id: 'clip-tr-2',
        sequenceId: 'seq-1',
        trackId: 'track-1',
        orderIndex: 1,
        sourceKind: 'text',
        filePath: null,
        startFrames: 48,
        durationFrames: 48,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Second sentence',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS.modern.effects,
            text: 'Second sentence',
          },
        },
      },
    ];

    it('exports clean transcript text with timecodes', () => {
      const transcript = exportTranscriptText(clips, 24, { includeTimestamps: true });
      expect(transcript).toContain('[00:00:00 - 00:00:02] Hello world');
      expect(transcript).toContain('[00:00:02 - 00:00:04] Second sentence');
    });

    it('exports text-only transcript without timestamps', () => {
      const transcript = exportTranscriptText(clips, 24, { includeTimestamps: false });
      expect(transcript).toBe('Hello world\n\nSecond sentence');
    });
  });
});
