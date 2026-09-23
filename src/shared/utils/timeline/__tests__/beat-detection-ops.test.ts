import { describe, expect, it } from 'vitest';
import type { SequenceClip } from '../../../types/sequence';
import {
  autoCutClipsOnBeats,
  computeRmsEnvelope,
  detectTransients,
  estimateBpmFromOnsets,
  generateBeatGridMarkers,
  generateSyntheticBeatWaveform,
} from '../beat-detection-ops';

describe('beat-detection-ops (Step S44: Audio Beat & Rhythm Transient Detection)', () => {
  describe('computeRmsEnvelope', () => {
    it('returns empty array for empty inputs', () => {
      expect(computeRmsEnvelope([])).toEqual([]);
    });

    it('computes moving RMS energy envelope', () => {
      const signal = [0, 0, 1, 1, 0, 0];
      const env = computeRmsEnvelope(signal, 3);
      expect(env.length).toBe(6);
      expect(env[2]).toBeGreaterThan(0);
      expect(env[0]).toBeLessThan(env[2]);
    });
  });

  describe('detectTransients', () => {
    it('returns empty array when amplitude array has fewer than 3 samples', () => {
      expect(detectTransients([], 30)).toEqual([]);
      expect(detectTransients([0.5, 0.2], 30)).toEqual([]);
    });

    it('accurately detects periodic pulse transients in synthetic audio', () => {
      // 120 BPM at 30 fps = beat every 15 frames
      const waveform = generateSyntheticBeatWaveform(120, 2, 30); // 60 frames
      const onsets = detectTransients(waveform, 30, {
        minDistanceFrames: 10,
        sensitivity: 1.2,
      });

      // Expected onsets near frames 15, 30, 45
      expect(onsets.length).toBeGreaterThanOrEqual(3);
      expect(onsets.some((f) => Math.abs(f - 15) <= 1)).toBe(true);
      expect(onsets.some((f) => Math.abs(f - 30) <= 1)).toBe(true);
      expect(onsets.some((f) => Math.abs(f - 45) <= 1)).toBe(true);
    });

    it('enforces minDistanceFrames to suppress double-triggering', () => {
      // Multiple spikes spaced 2 frames apart
      const waveform = new Array(30).fill(0.01);
      waveform[5] = 1.0;
      waveform[7] = 0.9;
      waveform[9] = 0.8;

      const onsets = detectTransients(waveform, 30, {
        minDistanceFrames: 8,
        sensitivity: 1.5,
      });

      // Should only detect the first transient at frame 5
      expect(onsets.length).toBe(1);
      expect(onsets[0]).toBe(5);
    });
  });

  describe('estimateBpmFromOnsets', () => {
    it('returns fallback 120 BPM for empty or single-onset inputs', () => {
      const resEmpty = estimateBpmFromOnsets([], 30);
      expect(resEmpty.bpm).toBe(120);
      expect(resEmpty.confidence).toBe(0);

      const resSingle = estimateBpmFromOnsets([15], 30);
      expect(resSingle.bpm).toBe(120);
      expect(resSingle.confidence).toBe(0);
    });

    it('accurately estimates 120 BPM from 15-frame periodic onsets at 30 fps', () => {
      const onsets = [15, 30, 45, 60, 75, 90, 105, 120];
      const res = estimateBpmFromOnsets(onsets, 30);
      expect(res.bpm).toBe(120);
      expect(res.intervalFrames).toBe(15);
      expect(res.confidence).toBe(1.0);
    });

    it('accurately estimates 90 BPM from 20-frame periodic onsets at 30 fps', () => {
      const onsets = [20, 40, 60, 80, 100, 120];
      const res = estimateBpmFromOnsets(onsets, 30);
      expect(res.bpm).toBe(90);
      expect(res.intervalFrames).toBe(20);
      expect(res.confidence).toBe(1.0);
    });

    it('folds extreme tempos into standard musical window [65, 185]', () => {
      // 300 BPM (6 frames at 30 fps) -> folded to 150 BPM
      const onsetsFast = [6, 12, 18, 24, 30, 36, 42];
      const resFast = estimateBpmFromOnsets(onsetsFast, 30);
      expect(resFast.bpm).toBe(150);

      // 40 BPM (45 frames at 30 fps) -> folded to 80 BPM
      const onsetsSlow = [45, 90, 135, 180];
      const resSlow = estimateBpmFromOnsets(onsetsSlow, 30);
      expect(resSlow.bpm).toBe(80);
    });
  });

  describe('generateBeatGridMarkers', () => {
    it('generates properly formatted SequenceMarkers with musical measure numbering', () => {
      const onsets = [15, 30, 45, 60, 75];
      const markers = generateBeatGridMarkers('seq_main', onsets, 30, {
        color: 'ai',
        beatsPerMeasure: 4,
      });

      expect(markers.length).toBe(5);
      expect(markers[0]).toMatchObject({
        sequenceId: 'seq_main',
        frame: 15,
        name: 'Beat 1.1',
        color: 'ai',
        locked: false,
      });
      expect(markers[1].name).toBe('Beat 1.2');
      expect(markers[2].name).toBe('Beat 1.3');
      expect(markers[3].name).toBe('Beat 1.4');
      expect(markers[4].name).toBe('Beat 2.1');
    });
  });

  describe('autoCutClipsOnBeats', () => {
    const mockAudioClip: SequenceClip = {
      id: 'clip_audio',
      sequenceId: 'seq1',
      trackId: 'track_audio',
      orderIndex: 0,
      sourceKind: 'audio',
      filePath: '/music.mp3',
      startFrames: 0,
      durationFrames: 120,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Music Bed',
      overrides: [],
    };

    const mockVideoClip: SequenceClip = {
      id: 'clip_video_hero',
      sequenceId: 'seq1',
      trackId: 'track_video_v1',
      orderIndex: 0,
      sourceKind: 'video',
      filePath: '/hero.mp4',
      startFrames: 0,
      durationFrames: 100,
      sourceInFrames: 30,
      sourceOutFrames: 60,
      transitionIn: 'crossfade',
      transitionFrames: 10,
      transitionOut: 'fade_black',
      transitionOutFrames: 8,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Hero Footage',
      overrides: [],
    };

    it('returns unmodified clips if no beat frames or clips are passed', () => {
      expect(autoCutClipsOnBeats([], [30], 'track_video_v1')).toEqual([]);
      expect(autoCutClipsOnBeats([mockVideoClip], [], 'track_video_v1')).toEqual([mockVideoClip]);
    });

    it('leaves other tracks completely unmodified', () => {
      const initial = [mockAudioClip, mockVideoClip];
      const result = autoCutClipsOnBeats(initial, [30, 60], 'track_video_v1');
      const audioResult = result.find((c) => c.id === 'clip_audio');
      expect(audioResult).toEqual(mockAudioClip);
    });

    it('splits target video clip on beat frames with correct timing and source offsets', () => {
      // Split at frame 30 and frame 70 (leaving segment 1: 0..30, segment 2: 30..70, segment 3: 70..100)
      const beats = [30, 70];
      const result = autoCutClipsOnBeats([mockVideoClip], beats, 'track_video_v1', 6);

      const splitClips = result.filter((c) => c.trackId === 'track_video_v1');
      expect(splitClips.length).toBe(3);

      // Segment 1 (0..30)
      expect(splitClips[0].id).toBe('clip_video_hero');
      expect(splitClips[0].startFrames).toBe(0);
      expect(splitClips[0].durationFrames).toBe(30);
      expect(splitClips[0].sourceInFrames).toBe(30);
      expect(splitClips[0].sourceOutFrames).toBe(60);
      expect(splitClips[0].transitionIn).toBe('crossfade'); // preserved on first segment
      expect(splitClips[0].transitionOut).toBe('cut');
      expect(splitClips[0].orderIndex).toBe(0);

      // Segment 2 (30..70)
      expect(splitClips[1].id).toBe('clip_video_hero_cut_30');
      expect(splitClips[1].startFrames).toBe(30);
      expect(splitClips[1].durationFrames).toBe(40);
      expect(splitClips[1].sourceInFrames).toBe(60); // 30 + (30 - 0)
      expect(splitClips[1].sourceOutFrames).toBe(100);
      expect(splitClips[1].transitionIn).toBe('cut');
      expect(splitClips[1].transitionOut).toBe('cut');
      expect(splitClips[1].orderIndex).toBe(1);

      // Segment 3 (70..100)
      expect(splitClips[2].id).toBe('clip_video_hero_cut_70');
      expect(splitClips[2].startFrames).toBe(70);
      expect(splitClips[2].durationFrames).toBe(30);
      expect(splitClips[2].sourceInFrames).toBe(100); // 30 + (70 - 0)
      expect(splitClips[2].sourceOutFrames).toBe(130);
      expect(splitClips[2].transitionIn).toBe('cut');
      expect(splitClips[2].transitionOut).toBe('fade_black'); // preserved on last segment
      expect(splitClips[2].orderIndex).toBe(2);
    });

    it('ignores beats within the minSegmentFrames margin of clip edges', () => {
      // Beat at frame 2 is < 6 frames from start, beat at frame 98 is < 6 frames from end
      const beats = [2, 98];
      const result = autoCutClipsOnBeats([mockVideoClip], beats, 'track_video_v1', 6);
      expect(result.length).toBe(1);
      expect(result[0].durationFrames).toBe(100);
    });
  });
});
