import { describe, it, expect } from 'vitest';
import {
  calculateAudioWaveformSync,
  applyDualSystemAudioSync,
  linkClips,
  unlinkClips,
  propagateLinkedClipMove,
} from '../audio-sync-ops';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';

describe('audio-sync-ops (Milestone S76: Dual-System Audio Auto-Sync & A/V Clip Linking)', () => {
  describe('calculateAudioWaveformSync', () => {
    it('returns neutral low-confidence result for empty or invalid envelopes', () => {
      expect(calculateAudioWaveformSync([], [])).toEqual({
        offsetFrames: 0,
        correlationScore: 0,
        confidence: 'low',
      });
      expect(calculateAudioWaveformSync([1, 2, 3], [])).toEqual({
        offsetFrames: 0,
        correlationScore: 0,
        confidence: 'low',
      });
    });

    it('detects 0 frame offset for identical waveform envelopes', () => {
      // Create synthetic speech envelope with distinctive transients
      const envelope: number[] = [];
      for (let i = 0; i < 200; i++) {
        envelope.push(Math.sin(i * 0.1) * Math.cos(i * 0.05) + Math.sin(i * 0.3) * 0.5);
      }

      const result = calculateAudioWaveformSync(envelope, envelope, 30);
      expect(result.offsetFrames).toBe(0);
      expect(result.correlationScore).toBeGreaterThanOrEqual(0.99);
      expect(result.confidence).toBe('high');
    });

    it('detects positive lag when target audio is delayed relative to reference (lag +15 frames)', () => {
      const base: number[] = [];
      for (let i = 0; i < 250; i++) {
        // Distinctive spikes representing words/clapper
        const spike = i === 50 || i === 120 || i === 180 ? 2.5 : 0;
        base.push(Math.sin(i * 0.15) + spike);
      }

      // Target lags by +15 frames (delayed in time)
      const lag = 15;
      const delayedTarget = new Array(lag).fill(0).concat(base.slice(0, base.length - lag));

      const result = calculateAudioWaveformSync(base, delayedTarget, 40);
      expect(result.offsetFrames).toBe(lag);
      expect(result.correlationScore).toBeGreaterThanOrEqual(0.7);
      expect(result.confidence).toBe('high');
    });

    it('detects negative lag when target audio leads reference (lead -10 frames)', () => {
      const base: number[] = [];
      for (let i = 0; i < 250; i++) {
        const transient = i === 80 || i === 140 ? 3.0 : 0;
        base.push(Math.sin(i * 0.12) + transient);
      }

      // Target leads by -10 frames (starts earlier)
      const lead = 10;
      const leadingTarget = base.slice(lead).concat(new Array(lead).fill(0));

      const result = calculateAudioWaveformSync(base, leadingTarget, 30);
      expect(result.offsetFrames).toBe(-lead);
      expect(result.correlationScore).toBeGreaterThanOrEqual(0.7);
      expect(result.confidence).toBe('high');
    });

    it('reports low confidence for uncorrelated signals', () => {
      const envelopeA = Array.from({ length: 150 }, (_, i) => Math.sin(i * 0.5));
      const envelopeB = Array.from({ length: 150 }, (_, i) => Math.cos(i * 1.7) * (i % 2 === 0 ? 1 : -1));

      const result = calculateAudioWaveformSync(envelopeA, envelopeB, 30);
      expect(result.confidence).toBe('low');
      expect(result.correlationScore).toBeLessThan(0.5);
    });
  });

  describe('applyDualSystemAudioSync', () => {
    const mockVideoClip: SequenceClip = {
      id: 'clip-video-1',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'video',
      label: 'Camera Take 1',
      filePath: 'C:/media/camera_take_1.mp4',
      startFrames: 100,
      durationFrames: 300,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      sourceAudioEnabled: true,
      overrides: [],
    };

    const mockAudioClip: SequenceClip = {
      id: 'clip-audio-external',
      sequenceId: 'seq-1',
      trackId: 'track-a1',
      orderIndex: 0,
      sourceKind: 'audio',
      label: 'Zoom Lav 1',
      filePath: 'C:/media/zoom_lav_1.wav',
      startFrames: 50,
      durationFrames: 350,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      overrides: [],
    };

    it('aligns audio startFrames, mutes scratch video audio, and mutually links clips', () => {
      const offsetFrames = 25;
      const { updatedVideoClip, updatedAudioClip } = applyDualSystemAudioSync(
        mockVideoClip,
        mockAudioClip,
        offsetFrames,
      );

      // Audio start aligned to video start (100) + offset (25) = 125
      expect(updatedAudioClip.startFrames).toBe(125);
      expect(updatedAudioClip.syncOffsetFrames).toBe(25);
      expect(updatedAudioClip.linkedClipId).toBe('clip-video-1');

      // Video scratch audio muted and linked to external audio
      expect(updatedVideoClip.sourceAudioEnabled).toBe(false);
      expect(updatedVideoClip.linkedClipId).toBe('clip-audio-external');
    });

    it('supports preserving scratch audio when muteScratchAudio is false', () => {
      const { updatedVideoClip } = applyDualSystemAudioSync(
        mockVideoClip,
        mockAudioClip,
        10,
        { muteScratchAudio: false },
      );

      expect(updatedVideoClip.sourceAudioEnabled).toBe(true);
      expect(updatedVideoClip.linkedClipId).toBe('clip-audio-external');
    });
  });

  describe('linkClips and unlinkClips', () => {
    it('establishes bidirectional linking between two clips', () => {
      const clipA = { id: 'v1' } as SequenceClip;
      const clipB = { id: 'a1' } as SequenceClip;

      const [linkedA, linkedB] = linkClips(clipA, clipB);
      expect(linkedA.linkedClipId).toBe('a1');
      expect(linkedB.linkedClipId).toBe('v1');
    });

    it('unlinks both clips cleanly from an array', () => {
      const clips: SequenceClip[] = [
        { id: 'c1', linkedClipId: 'c2', syncOffsetFrames: 12 } as SequenceClip,
        { id: 'c2', linkedClipId: 'c1', syncOffsetFrames: -12 } as SequenceClip,
        { id: 'c3' } as SequenceClip,
      ];

      const unlinked = unlinkClips('c1', clips);
      expect(unlinked[0].linkedClipId).toBeNull();
      expect(unlinked[0].syncOffsetFrames).toBeUndefined();
      expect(unlinked[1].linkedClipId).toBeNull();
      expect(unlinked[1].syncOffsetFrames).toBeUndefined();
      expect(unlinked[2].id).toBe('c3');
    });
  });

  describe('propagateLinkedClipMove', () => {
    const mockTracks: SequenceTrack[] = [
      { id: 'track-v1', kind: 'video', magnetic: false, locked: false } as SequenceTrack,
      { id: 'track-a1', kind: 'audio', magnetic: false, locked: false } as SequenceTrack,
      { id: 'track-spine', kind: 'video', magnetic: true, locked: false } as SequenceTrack,
    ];

    it('shifts linked sibling clip startFrames on free tracks by deltaFrames', () => {
      const clips: SequenceClip[] = [
        { id: 'video-1', trackId: 'track-v1', startFrames: 100, linkedClipId: 'audio-1' } as SequenceClip,
        { id: 'audio-1', trackId: 'track-a1', startFrames: 115, linkedClipId: 'video-1' } as SequenceClip,
      ];

      // Video moves right by +30 frames (new start: 130)
      const movedVideo: SequenceClip = { ...clips[0], startFrames: 130 };
      const result = propagateLinkedClipMove(movedVideo, 30, clips, mockTracks);

      expect(result[0].startFrames).toBe(100); // untouched in allClips mapping
      expect(result[1].startFrames).toBe(145); // 115 + 30 = 145
    });

    it('clamps linked sibling startFrames to 0 if delta would move it negative', () => {
      const clips: SequenceClip[] = [
        { id: 'video-1', trackId: 'track-v1', startFrames: 50, linkedClipId: 'audio-1' } as SequenceClip,
        { id: 'audio-1', trackId: 'track-a1', startFrames: 20, linkedClipId: 'video-1' } as SequenceClip,
      ];

      const movedVideo: SequenceClip = { ...clips[0], startFrames: 0 };
      const result = propagateLinkedClipMove(movedVideo, -50, clips, mockTracks);

      expect(result[1].startFrames).toBe(0); // 20 - 50 clamped to 0
    });

    it('does not shift linked clip if sibling is on a magnetic track', () => {
      const clips: SequenceClip[] = [
        { id: 'audio-1', trackId: 'track-a1', startFrames: 100, linkedClipId: 'spine-clip' } as SequenceClip,
        { id: 'spine-clip', trackId: 'track-spine', startFrames: null, linkedClipId: 'audio-1' } as SequenceClip,
      ];

      const movedAudio: SequenceClip = { ...clips[0], startFrames: 150 };
      const result = propagateLinkedClipMove(movedAudio, 50, clips, mockTracks);

      expect(result[1].startFrames).toBeNull();
    });
  });
});
