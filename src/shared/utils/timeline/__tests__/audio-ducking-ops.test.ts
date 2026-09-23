import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceDocument, SequenceTrack } from '../../../types/sequence';
import {
  buildFfmpegSidechainCompressFilter,
  calculateDuckingEnvelopeGain,
  DEFAULT_DUCKING_SETTINGS,
  isClipDuckKey,
  isClipDuckTarget,
  isDialogueActiveAtFrame,
  isTrackDuckKey,
  isTrackDuckTarget,
} from '../audio-ducking-ops';

describe('audio-ducking-ops (Beta S154 Phase 6 / S33)', () => {
  const trackNarration: SequenceTrack = {
    id: 'track-narration',
    sequenceId: 'seq-1',
    kind: 'audio',
    role: 'narration',
    name: 'Voiceover',
    orderIndex: 0,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: false,
    heightPx: 48,
    volume: 1,
  };

  const trackMusic: SequenceTrack = {
    id: 'track-music',
    sequenceId: 'seq-1',
    kind: 'audio',
    role: 'music',
    name: 'Background Music',
    orderIndex: 1,
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: false,
    heightPx: 48,
    volume: 1,
  };

  const trackSpine: SequenceTrack = {
    id: 'track-spine',
    sequenceId: 'seq-1',
    kind: 'video',
    role: null,
    name: 'Video Spine',
    orderIndex: 2,
    magnetic: true,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 64,
    volume: 1,
  };

  const clipNarration: SequenceClip = {
    id: 'clip-narration-1',
    sequenceId: 'seq-1',
    trackId: 'track-narration',
    orderIndex: 0,
    sourceKind: 'audio',
    filePath: 'C:/audio/narration.mp3',
    startFrames: null,
    durationFrames: 60, // 2s at 30fps
    sourceInFrames: 0,
    sourceOutFrames: 60,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Narration',
    overrides: [],
  };

  const clipMusic: SequenceClip = {
    id: 'clip-music-1',
    sequenceId: 'seq-1',
    trackId: 'track-music',
    orderIndex: 0,
    sourceKind: 'audio',
    filePath: 'C:/audio/music.mp3',
    startFrames: null,
    durationFrames: 300, // 10s at 30fps
    sourceInFrames: 0,
    sourceOutFrames: 300,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Music',
    overrides: [],
  };

  const clipVideoWithDialogue: SequenceClip = {
    id: 'clip-video-dialogue',
    sequenceId: 'seq-1',
    trackId: 'track-spine',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'C:/video/dialogue.mp4',
    startFrames: null,
    durationFrames: 90,
    sourceInFrames: 0,
    sourceOutFrames: 90,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    sourceAudioEnabled: true,
    duckExempt: true,
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Video Dialogue',
    overrides: [],
  };

  const clipVideoDucked: SequenceClip = {
    id: 'clip-video-ducked',
    sequenceId: 'seq-1',
    trackId: 'track-spine',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'C:/video/ambient.mp4',
    startFrames: null,
    durationFrames: 90,
    sourceInFrames: 0,
    sourceOutFrames: 90,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    sourceAudioEnabled: true,
    duckExempt: false,
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Video Ambient',
    overrides: [],
  };

  const testDoc: SequenceDocument = {
    sequence: {
      id: 'seq-1',
      projectId: 'proj-1',
      name: 'Test Sequence',
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
      fps: 30,
      width: 1920,
      height: 1080,
      spineTrackId: 'track-spine',
    },
    tracks: [trackNarration, trackMusic, trackSpine],
    clips: [clipNarration, clipMusic],
  };

  describe('Track & Clip Classification', () => {
    it('classifies narration and music track roles correctly', () => {
      expect(isTrackDuckKey(trackNarration)).toBe(true);
      expect(isTrackDuckTarget(trackNarration)).toBe(false);

      expect(isTrackDuckTarget(trackMusic)).toBe(true);
      expect(isTrackDuckKey(trackMusic)).toBe(false);

      expect(isTrackDuckKey(trackSpine)).toBe(false);
      expect(isTrackDuckTarget(trackSpine)).toBe(false);
    });

    it('classifies clips by track and duckExempt flag', () => {
      expect(isClipDuckKey(clipNarration, trackNarration)).toBe(true);
      expect(isClipDuckTarget(clipMusic, trackMusic)).toBe(true);

      // Video clips: duckExempt === true acts as duck key (dialogue)
      expect(isClipDuckKey(clipVideoWithDialogue, trackSpine)).toBe(true);
      expect(isClipDuckTarget(clipVideoWithDialogue, trackSpine)).toBe(false);

      // Video clips: duckExempt === false acts as duck target (background bed)
      expect(isClipDuckTarget(clipVideoDucked, trackSpine)).toBe(true);
      expect(isClipDuckKey(clipVideoDucked, trackSpine)).toBe(false);
    });
  });

  describe('isDialogueActiveAtFrame', () => {
    it('detects active dialogue on narration track within clip bounds', () => {
      // clipNarration is on trackNarration from frame 0 to 60
      expect(isDialogueActiveAtFrame({ document: testDoc, frame: 10 })).toBe(true);
      expect(isDialogueActiveAtFrame({ document: testDoc, frame: 59 })).toBe(true);
      expect(isDialogueActiveAtFrame({ document: testDoc, frame: 60 })).toBe(false);
      expect(isDialogueActiveAtFrame({ document: testDoc, frame: 100 })).toBe(false);
    });

    it('ignores muted narration tracks', () => {
      const mutedDoc: SequenceDocument = {
        ...testDoc,
        tracks: [{ ...trackNarration, muted: true }, trackMusic, trackSpine],
      };
      expect(isDialogueActiveAtFrame({ document: mutedDoc, frame: 10 })).toBe(false);
    });

    it('detects active video dialogue when duckExempt is true', () => {
      const docWithVideoDialogue: SequenceDocument = {
        ...testDoc,
        clips: [clipVideoWithDialogue, clipMusic],
      };
      expect(isDialogueActiveAtFrame({ document: docWithVideoDialogue, frame: 30 })).toBe(true);
      expect(isDialogueActiveAtFrame({ document: docWithVideoDialogue, frame: 95 })).toBe(false);
    });
  });

  describe('calculateDuckingEnvelopeGain', () => {
    const fps = 30;
    // Settings: depth -12 dB, attack 33ms (1 frame), hold 100ms (3 frames), release 200ms (6 frames)
    const settings = {
      ...DEFAULT_DUCKING_SETTINGS,
      duckingDepthDb: -12,
      attackMs: 33,
      holdMs: 100,
      releaseMs: 200,
    };

    it('returns unity 1.0 (0 dB) when ducking is disabled', () => {
      const res = calculateDuckingEnvelopeGain(testDoc, 10, fps, {
        ...settings,
        enabled: false,
      });
      expect(res.gainMultiplier).toBe(1.0);
      expect(res.gainDb).toBe(0);
      expect(res.isDuckingActive).toBe(false);
    });

    it('returns fully attenuated depth during continuous dialogue', () => {
      // clipNarration is active 0..60. At frame 20, dialogue has been continuous for > attackMs
      const res = calculateDuckingEnvelopeGain(testDoc, 20, fps, settings);
      expect(res.gainDb).toBeCloseTo(-12, 1);
      expect(res.gainMultiplier).toBeCloseTo(10 ** (-12 / 20), 3);
      expect(res.isDuckingActive).toBe(true);
    });

    it('holds attenuation during the hold phase after dialogue ends', () => {
      // Dialogue ends at frame 60.
      // Hold is 100ms = 3 frames (frames 61, 62, 63)
      const resHeld = calculateDuckingEnvelopeGain(testDoc, 62, fps, settings);
      expect(resHeld.gainDb).toBeCloseTo(-12, 1);
      expect(resHeld.isDuckingActive).toBe(true);
    });

    it('smoothly recovers during the release phase', () => {
      // Release is 200ms = 6 frames after hold (frames 64 to 70)
      // At frame 66, release is halfway through: gainDb should be around -6 dB
      const resMidRelease = calculateDuckingEnvelopeGain(testDoc, 66, fps, settings);
      expect(resMidRelease.gainDb).toBeGreaterThan(-12);
      expect(resMidRelease.gainDb).toBeLessThan(0);
      expect(resMidRelease.gainMultiplier).toBeGreaterThan(10 ** (-12 / 20));
      expect(resMidRelease.gainMultiplier).toBeLessThan(1.0);
    });

    it('returns full unity 1.0 after release finishes', () => {
      // Past frame 72, ducking has completely released
      const resReleased = calculateDuckingEnvelopeGain(testDoc, 100, fps, settings);
      expect(resReleased.gainMultiplier).toBe(1.0);
      expect(resReleased.gainDb).toBe(0);
      expect(resReleased.isDuckingActive).toBe(false);
    });
  });

  describe('buildFfmpegSidechainCompressFilter', () => {
    it('produces expected FFmpeg sidechaincompress filter syntax', () => {
      const filter = buildFfmpegSidechainCompressFilter({
        ...DEFAULT_DUCKING_SETTINGS,
        duckingDepthDb: -15,
        thresholdDb: -26,
        attackMs: 25,
        releaseMs: 350,
      });

      expect(filter).toContain('sidechaincompress=');
      expect(filter).toContain('threshold=');
      expect(filter).toContain('ratio=10'); // -15 / 1.5 = 10
      expect(filter).toContain('attack=25');
      expect(filter).toContain('release=350');
    });
  });
});
