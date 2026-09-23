import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MULTICAM_SETTINGS,
  calculateCrossCorrelationOffset,
  switchActiveAngle,
  createMultiCamGroup,
  executeLiveMultiCamCut,
  resolveAngleSourceTime,
  buildMultiCamGridTiles,
  type MultiCamClipSettings,
} from '../multi-cam-ops';

describe('multi-cam-ops', () => {
  it('has default multi-camera settings disabled with 2 angles', () => {
    expect(DEFAULT_MULTICAM_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_MULTICAM_SETTINGS.activeAngleIndex).toBe(0);
    expect(DEFAULT_MULTICAM_SETTINGS.angles.length).toBe(2);
    expect(DEFAULT_MULTICAM_SETTINGS.audioFollowsVideo).toBe(false);
    expect(DEFAULT_MULTICAM_SETTINGS.syncMethod).toBe('audio_waveform');
  });

  describe('calculateCrossCorrelationOffset', () => {
    it('returns 0 when either envelope is empty', () => {
      expect(calculateCrossCorrelationOffset([], [1, 2, 3])).toBe(0);
      expect(calculateCrossCorrelationOffset([1, 2, 3], [])).toBe(0);
    });

    it('returns 0 for identical in-phase waveforms', () => {
      const envelope = [0.1, 0.2, 0.8, 0.9, 0.3, 0.1, 0.0, 0.0];
      const offset = calculateCrossCorrelationOffset(envelope, envelope, 3);
      expect(offset).toBe(0);
    });

    it('accurately detects a positive lag when envelope B is shifted right', () => {
      // Base envelope with sharp pulse
      const length = 50;
      const envelopeA = new Array(length).fill(0.05);
      envelopeA[20] = 1.0; // spike at frame 20

      const envelopeB = new Array(length).fill(0.05);
      envelopeB[25] = 1.0; // spike at frame 25 (lag of 5 frames relative to A)

      const offset = calculateCrossCorrelationOffset(envelopeA, envelopeB, 10);
      // In B, peak is at t=25. A[20] * B[20 + lag] -> lag = 5
      expect(offset).toBe(5);
    });

    it('accurately detects a negative lag when envelope B is shifted left', () => {
      const length = 50;
      const envelopeA = new Array(length).fill(0.05);
      envelopeA[25] = 1.0; // spike at frame 25

      const envelopeB = new Array(length).fill(0.05);
      envelopeB[20] = 1.0; // spike at frame 20 (leads A by 5 frames)

      const offset = calculateCrossCorrelationOffset(envelopeA, envelopeB, 10);
      expect(offset).toBe(-5);
    });
  });

  describe('switchActiveAngle', () => {
    it('switches angle index and enables multiCam', () => {
      const switched = switchActiveAngle(DEFAULT_MULTICAM_SETTINGS, 1);
      expect(switched.enabled).toBe(true);
      expect(switched.activeAngleIndex).toBe(1);
    });

    it('clamps targetIndex within valid bounds [0, angles.length - 1]', () => {
      const clampedHigh = switchActiveAngle(DEFAULT_MULTICAM_SETTINGS, 99);
      expect(clampedHigh.activeAngleIndex).toBe(1); // 2 angles: max index is 1

      const clampedLow = switchActiveAngle(DEFAULT_MULTICAM_SETTINGS, -5);
      expect(clampedLow.activeAngleIndex).toBe(0);
    });

    it('handles undefined settings safely by defaulting to DEFAULT_MULTICAM_SETTINGS', () => {
      const result = switchActiveAngle(undefined, 1);
      expect(result.activeAngleIndex).toBe(1);
      expect(result.enabled).toBe(true);
    });
  });

  describe('createMultiCamGroup', () => {
    it('creates multi-camera group with custom camera labels', () => {
      const names = ['Host - Cam A', 'Guest 1 - Cam B', 'Guest 2 - Cam C'];
      const group = createMultiCamGroup(names);

      expect(group.enabled).toBe(true);
      expect(group.activeAngleIndex).toBe(0);
      expect(group.angles.length).toBe(3);
      expect(group.angles[0]!.cameraLabel).toBe('Host - Cam A');
      expect(group.angles[1]!.cameraLabel).toBe('Guest 1 - Cam B');
      expect(group.angles[2]!.cameraLabel).toBe('Guest 2 - Cam C');
      expect(group.angles.every((a) => a.syncOffsetFrames === 0)).toBe(true);
    });

    it('falls back to default camera names when empty array provided', () => {
      const group = createMultiCamGroup([]);
      expect(group.angles.length).toBe(2);
      expect(group.angles[0]!.cameraLabel).toBe('Cam A');
      expect(group.angles[1]!.cameraLabel).toBe('Cam B');
    });
  });

  describe('resolveAngleSourceTime and buildMultiCamGridTiles', () => {
    const mockClip = {
      id: 'clip-mc-1',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'video' as const,
      label: 'MultiCam Interview',
      filePath: '/media/cam_a.mp4',
      startFrames: 100,
      durationFrames: 240,
      sourceInFrames: 50,
      transitionIn: 'cut' as const,
      transitionFrames: 0,
      motionPreset: 'none' as const,
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      overrides: [],
      effects: {
        multiCam: {
          enabled: true,
          activeAngleIndex: 0,
          angles: [
            { id: 'a1', name: 'Angle 1', cameraLabel: 'Wide Master', syncOffsetFrames: 0, filePath: '/media/cam_a.mp4' },
            { id: 'a2', name: 'Angle 2', cameraLabel: 'Close-Up Host', syncOffsetFrames: 12, filePath: '/media/cam_b.mp4' },
          ],
          audioFollowsVideo: false,
          syncMethod: 'audio_waveform' as const,
        },
      },
    };

    it('calculates accurate source playback times with sync offsets', () => {
      // At playhead frame 150 (elapsed 50 frames into clip)
      const resA1 = resolveAngleSourceTime(mockClip, 0, 150, 24);
      expect(resA1.syncOffsetFrames).toBe(0);
      expect(resA1.isActive).toBe(true);
      expect(resA1.sourceTimeSeconds).toBeCloseTo(100 / 24, 4);

      const resA2 = resolveAngleSourceTime(mockClip, 1, 150, 24);
      expect(resA2.syncOffsetFrames).toBe(12);
      expect(resA2.isActive).toBe(false);
      expect(resA2.sourceTimeSeconds).toBeCloseTo(112 / 24, 4);
    });

    it('builds 4-up grid tiles with program tally marker', () => {
      const tiles = buildMultiCamGridTiles(mockClip, 150, 24);
      expect(tiles.length).toBe(2);
      expect(tiles[0]!.isOnAir).toBe(true);
      expect(tiles[0]!.tallyColor).toBe('program');
      expect(tiles[1]!.isOnAir).toBe(false);
      expect(tiles[1]!.tallyColor).toBe('idle');
    });
  });

  describe('executeLiveMultiCamCut', () => {
    const mockTrack = {
      id: 'track-v1',
      sequenceId: 'seq-1',
      kind: 'video' as const,
      name: 'V1',
      orderIndex: 0,
      muted: false,
      videoEnabled: true,
      locked: false,
      magnetic: false,
      role: null,
      heightPx: 64,
    };

    const mockClip = {
      id: 'clip-mc-1',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'video' as const,
      label: 'MultiCam Interview',
      filePath: '/media/cam_a.mp4',
      startFrames: 0,
      durationFrames: 200,
      sourceInFrames: 0,
      transitionIn: 'cut' as const,
      transitionFrames: 0,
      motionPreset: 'none' as const,
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      overrides: [],
      effects: {
        multiCam: {
          enabled: true,
          activeAngleIndex: 0,
          angles: [
            { id: 'a1', name: 'Angle 1', cameraLabel: 'Wide Master', syncOffsetFrames: 0, filePath: '/media/cam_a.mp4' },
            { id: 'a2', name: 'Angle 2', cameraLabel: 'Close-Up Host', syncOffsetFrames: 0, filePath: '/media/cam_b.mp4' },
          ],
          audioFollowsVideo: false,
          syncMethod: 'audio_waveform' as const,
        },
      },
    };

    it('splits clip at playhead and sets target angle on the trailing segment', () => {
      const result = executeLiveMultiCamCut(
        [mockClip],
        [mockTrack],
        'clip-mc-1',
        80,
        1,
        () => 'clip-cut-split-1',
      );

      expect(result.clips.length).toBe(2);
      expect(result.cutClipId).toBe('clip-cut-split-1');
      expect(result.switchedAngleIndex).toBe(1);

      const firstHalf = result.clips.find((c) => c.id === 'clip-mc-1')!;
      expect(firstHalf.durationFrames).toBe(80);
      expect(firstHalf.effects?.multiCam?.activeAngleIndex).toBe(0);

      const secondHalf = result.clips.find((c) => c.id === 'clip-cut-split-1')!;
      expect(secondHalf.startFrames).toBe(80);
      expect(secondHalf.durationFrames).toBe(120);
      expect(secondHalf.sourceInFrames).toBe(80);
      expect(secondHalf.filePath).toBe('/media/cam_b.mp4');
      expect(secondHalf.effects?.multiCam?.activeAngleIndex).toBe(1);
    });

    it('switches angle in-place without splitting if playhead is at clip start', () => {
      const result = executeLiveMultiCamCut(
        [mockClip],
        [mockTrack],
        'clip-mc-1',
        0,
        1,
        () => 'clip-cut-split-2',
      );

      expect(result.clips.length).toBe(1);
      expect(result.cutClipId).toBe('clip-mc-1');
      expect(result.clips[0]!.effects?.multiCam?.activeAngleIndex).toBe(1);
      expect(result.clips[0]!.filePath).toBe('/media/cam_b.mp4');
    });
  });
});
