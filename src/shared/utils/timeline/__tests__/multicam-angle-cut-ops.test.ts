import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  MULTICAM_LAYOUT_CONFIGS,
  calculateMultiCamWaveformSync,
  calculateTimecodeSyncOffset,
  executeMultiCamAngleCut,
  generateMultiCamCutList,
  resolveAngleTallyState,
} from '../multicam-angle-cut-ops';

describe('multicam-angle-cut-ops (Milestone S187: Multi-Camera Angle Cut Switching & Audio-Follows-Video Alignment)', () => {
  describe('MULTICAM_LAYOUT_CONFIGS', () => {
    it('defines standard multiviewer matrix dimensions', () => {
      expect(MULTICAM_LAYOUT_CONFIGS['2up'].maxAngles).toBe(2);
      expect(MULTICAM_LAYOUT_CONFIGS['2up'].columns).toBe(2);
      expect(MULTICAM_LAYOUT_CONFIGS['2up'].rows).toBe(1);

      expect(MULTICAM_LAYOUT_CONFIGS['4up'].maxAngles).toBe(4);
      expect(MULTICAM_LAYOUT_CONFIGS['4up'].columns).toBe(2);
      expect(MULTICAM_LAYOUT_CONFIGS['4up'].rows).toBe(2);

      expect(MULTICAM_LAYOUT_CONFIGS['9up'].maxAngles).toBe(9);
      expect(MULTICAM_LAYOUT_CONFIGS['9up'].columns).toBe(3);
      expect(MULTICAM_LAYOUT_CONFIGS['9up'].rows).toBe(3);

      expect(MULTICAM_LAYOUT_CONFIGS['hero_1plus3'].maxAngles).toBe(4);
    });
  });

  describe('calculateMultiCamWaveformSync', () => {
    it('detects temporal lag between correlated envelopes with high confidence', () => {
      // 100 sample envelope pattern with an impulse/peak
      const baseEnvelope: number[] = Array(100).fill(0.05);
      baseEnvelope[30] = 0.9;
      baseEnvelope[31] = 0.7;
      baseEnvelope[32] = 0.4;

      // Target envelope delayed by 6 frames (peak at frame 36)
      const targetEnvelope: number[] = Array(100).fill(0.05);
      targetEnvelope[36] = 0.9;
      targetEnvelope[37] = 0.7;
      targetEnvelope[38] = 0.4;

      const sync = calculateMultiCamWaveformSync(baseEnvelope, targetEnvelope, 20);
      expect(sync.offsetFrames).toBe(6);
      expect(sync.confidence).toBeGreaterThan(0.85);
      expect(sync.quality).toBe('high');
    });

    it('returns zero and low quality on empty or unaligned inputs', () => {
      expect(calculateMultiCamWaveformSync([], [])).toEqual({
        offsetFrames: 0,
        confidence: 0,
        quality: 'low',
      });
    });
  });

  describe('calculateTimecodeSyncOffset', () => {
    it('calculates frame difference between SMPTE timecodes', () => {
      // 01:00:00:00 vs 01:00:00:15 at 24fps -> +15 frames
      const offset = calculateTimecodeSyncOffset('01:00:00:00', '01:00:00:15', 24);
      expect(offset).toBe(15);
    });

    it('returns negative offset when target leads reference', () => {
      const offset = calculateTimecodeSyncOffset('01:00:02:00', '01:00:00:00', 24);
      expect(offset).toBe(-48); // 2 seconds = 48 frames at 24fps
    });
  });

  describe('resolveAngleTallyState', () => {
    it('returns program tally for on-air angle', () => {
      expect(resolveAngleTallyState(0, 0, 1)).toBe('program');
      expect(resolveAngleTallyState(2, 2)).toBe('program');
    });

    it('returns preview tally for cued angle', () => {
      expect(resolveAngleTallyState(1, 0, 1)).toBe('preview');
    });

    it('returns idle tally for inactive angles', () => {
      expect(resolveAngleTallyState(2, 0, 1)).toBe('idle');
    });
  });

  describe('executeMultiCamAngleCut', () => {
    function createTestClip(partial: Partial<SequenceClip>): SequenceClip {
      return {
        id: 'test-clip',
        sequenceId: 'seq-1',
        trackId: 'track-v1',
        sourceKind: 'video',
        startFrames: 0,
        durationFrames: 100,
        sourceInFrames: 0,
        filePath: '/media/camA.mp4',
        orderIndex: 0,
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Clip',
        motionPreset: 'none',
        transitionIn: 'cut',
        transitionOut: 'cut',
        transitionFrames: 0,
        overrides: [],
        ...partial,
      };
    }

    const track: SequenceTrack = {
      id: 'track-v1',
      sequenceId: 'seq-1',
      kind: 'video',
      name: 'V1',
      orderIndex: 0,
      muted: false,
      videoEnabled: true,
      locked: false,
      magnetic: false,
      heightPx: 64,
      role: null,
    };

    const multiCamClip = createTestClip({
      id: 'clip-mc1',
      trackId: 'track-v1',
      sourceKind: 'video',
      filePath: 'camA.mp4',
      startFrames: 0,
      durationFrames: 100,
      sourceInFrames: 0,
      effects: {
        multiCam: {
          enabled: true,
          activeAngleIndex: 0,
          audioFollowsVideo: true,
          syncMethod: 'audio_waveform',
          angles: [
            { id: 'ang-1', name: 'Angle 1', cameraLabel: 'Cam A (Wide)', syncOffsetFrames: 0, filePath: 'camA.mp4' },
            { id: 'ang-2', name: 'Angle 2', cameraLabel: 'Cam B (Close-Up)', syncOffsetFrames: 0, filePath: 'camB.mp4' },
          ],
        },
      },
    });

    it('performs mid-clip razor cut and switches trailing angle with anti-pop crossfades in AFV mode', () => {
      const result = executeMultiCamAngleCut(
        [multiCamClip],
        [track],
        'clip-mc1',
        50, // split at frame 50
        1,  // switch to Angle 2
        {
          routingMode: 'audio_follows_video',
          cutMode: 'both_afv',
          crossfadeFrames: 2,
          mintId: () => 'clip-mc1-cut',
        }
      );

      expect(result.cutClipId).toBe('clip-mc1-cut');
      expect(result.switchedAngleIndex).toBe(1);
      expect(result.audioCrossfadeApplied).toBe(true);
      expect(result.clips.length).toBe(2);

      const [firstClip, secondClip] = result.clips;
      expect(firstClip.id).toBe('clip-mc1');
      expect(firstClip.durationFrames).toBe(50);
      expect(firstClip.fadeOutFrames).toBe(2);

      expect(secondClip.id).toBe('clip-mc1-cut');
      expect(secondClip.startFrames).toBe(50);
      expect(secondClip.durationFrames).toBe(50);
      expect(secondClip.fadeInFrames).toBe(2);
      expect(secondClip.filePath).toBe('camB.mp4');
      expect(secondClip.effects?.multiCam?.activeAngleIndex).toBe(1);
    });

    it('switches angle in place when parked at clip start', () => {
      const result = executeMultiCamAngleCut(
        [multiCamClip],
        [track],
        'clip-mc1',
        0, // at start
        1,
        {
          routingMode: 'audio_follows_video',
          cutMode: 'both_afv',
        }
      );

      expect(result.clips.length).toBe(1);
      expect(result.cutClipId).toBe('clip-mc1');
      expect(result.clips[0].filePath).toBe('camB.mp4');
      expect(result.clips[0].effects?.multiCam?.activeAngleIndex).toBe(1);
    });
  });

  describe('generateMultiCamCutList', () => {
    function createTestClip(partial: Partial<SequenceClip>): SequenceClip {
      return {
        id: 'test-clip',
        sequenceId: 'seq-1',
        trackId: 'track-v1',
        sourceKind: 'video',
        startFrames: 0,
        durationFrames: 100,
        sourceInFrames: 0,
        filePath: '/media/camA.mp4',
        orderIndex: 0,
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Clip',
        motionPreset: 'none',
        transitionIn: 'cut',
        transitionOut: 'cut',
        transitionFrames: 0,
        overrides: [],
        ...partial,
      };
    }

    it('extracts sequential angle cut list from timeline clips', () => {
      const clips: SequenceClip[] = [
        createTestClip({
          id: 'c1',
          trackId: 'track-v1',
          startFrames: 0,
          durationFrames: 48,
          effects: {
            multiCam: {
              enabled: true,
              activeAngleIndex: 0,
              audioFollowsVideo: true,
              syncMethod: 'audio_waveform',
              angles: [
                { id: 'a1', name: 'Angle 1', cameraLabel: 'Wide Cam', syncOffsetFrames: 0 },
                { id: 'a2', name: 'Angle 2', cameraLabel: 'Close-Up Cam', syncOffsetFrames: 0 },
              ],
            },
          },
        }),
        createTestClip({
          id: 'c2',
          trackId: 'track-v1',
          startFrames: 48,
          durationFrames: 72,
          effects: {
            multiCam: {
              enabled: true,
              activeAngleIndex: 1,
              audioFollowsVideo: true,
              syncMethod: 'audio_waveform',
              angles: [
                { id: 'a1', name: 'Angle 1', cameraLabel: 'Wide Cam', syncOffsetFrames: 0 },
                { id: 'a2', name: 'Angle 2', cameraLabel: 'Close-Up Cam', syncOffsetFrames: 0 },
              ],
            },
          },
        }),
      ];

      const cutList = generateMultiCamCutList(clips, 'track-v1', 24);
      expect(cutList.length).toBe(2);

      expect(cutList[0].cutIndex).toBe(1);
      expect(cutList[0].cameraLabel).toBe('Wide Cam');
      expect(cutList[0].startFrame).toBe(0);
      expect(cutList[0].endFrame).toBe(48);
      expect(cutList[0].startTimecode).toBe('00:00:00:00');
      expect(cutList[0].endTimecode).toBe('00:00:02:00');

      expect(cutList[1].cutIndex).toBe(2);
      expect(cutList[1].cameraLabel).toBe('Close-Up Cam');
      expect(cutList[1].startFrame).toBe(48);
      expect(cutList[1].endFrame).toBe(120);
      expect(cutList[1].startTimecode).toBe('00:00:02:00');
      expect(cutList[1].endTimecode).toBe('00:00:05:00');
    });
  });
});
