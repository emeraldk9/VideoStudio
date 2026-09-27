import { describe, it, expect, beforeEach } from 'vitest';
import type { SequenceClip, SequenceMarker, SequenceTrack } from '../../../types/sequence';
import {
  generateBeatGridMarkers,
  estimateBpmFromOnsets,
  detectTransients,
  generateSyntheticBeatWaveform,
} from '../beat-detection-ops';
import {
  detectSceneCuts,
  generateSceneCutMarkers,
  applySceneCutDetectionToClip,
  calculateHistogramDelta,
  DEFAULT_SCENE_CUT_DETECTION_SETTINGS,
} from '../scene-cut-detection-ops';
import {
  buildSnapTargetsWithMeta,
  snapFrameWithMeta,
} from '../trim-tools-ops';

describe('Milestone S170: AI Scene Cut & Smart Beat Detection with Audio Transient Markers', () => {
  const sequenceId = 'seq-test-170';

  describe('Audio Transient & Beat Detection Engine', () => {
    it('generates color-coded downbeats and beat markers with musical measure numbering', () => {
      // 8 beats: 2 full 4/4 bars
      const onsetFrames = [0, 15, 30, 45, 60, 75, 90, 105];
      const markers = generateBeatGridMarkers(sequenceId, onsetFrames, 30, {
        beatsPerMeasure: 4,
        color: 'info',
        downbeatColor: 'warning',
        highlightDownbeats: true,
      });

      expect(markers).toHaveLength(8);

      // Downbeat 1.1
      expect(markers[0].name).toBe('Beat 1.1');
      expect(markers[0].markerKind).toBe('downbeat');
      expect(markers[0].color).toBe('warning');

      // Beat 1.2
      expect(markers[1].name).toBe('Beat 1.2');
      expect(markers[1].markerKind).toBe('beat');
      expect(markers[1].color).toBe('info');

      // Downbeat 2.1 (bar 2 onset)
      expect(markers[4].name).toBe('Beat 2.1');
      expect(markers[4].markerKind).toBe('downbeat');
      expect(markers[4].color).toBe('warning');
    });

    it('estimates musical tempo (BPM) and confidence from rhythmic transients', () => {
      // 120 BPM at 30 fps -> beat every 15 frames
      const synthetic = generateSyntheticBeatWaveform(120, 3, 30);
      const onsets = detectTransients(synthetic, 30, {
        sensitivity: 1.2,
        minDistanceFrames: 10,
      });

      expect(onsets.length).toBeGreaterThanOrEqual(4);
      const bpmResult = estimateBpmFromOnsets(onsets, 30);
      expect(bpmResult.bpm).toBe(120);
      expect(bpmResult.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('AI Scene Cut Detection Engine', () => {
    it('detects camera shot changes and discriminates hard cuts from dissolves', () => {
      // Frame deltas where index 10 has a sharp spike and index 20 has a gradual dissolve
      const deltas = new Array(35).fill(0.05);
      deltas[10] = 0.85; // Hard cut spike
      deltas[20] = 0.55; // Dissolve window
      deltas[21] = 0.60;

      const cuts = detectSceneCuts(deltas, {
        threshold: 0.40,
        minShotDurationFrames: 5,
        ignoreFlashes: false,
        action: 'both',
      });

      expect(cuts.length).toBeGreaterThanOrEqual(2);
      expect(cuts.some((c) => c.frame === 11 && c.type === 'hard_cut')).toBe(true);
      expect(cuts.some((c) => (c.frame === 21 || c.frame === 22) && c.type === 'dissolve_transition')).toBe(true);
    });

    it('generates structured SequenceMarkers with markerKind: scene_cut and confidence notes', () => {
      const cuts = [
        { frame: 12, confidence: 0.92, type: 'hard_cut' as const },
        { frame: 48, confidence: 0.76, type: 'dissolve_transition' as const },
      ];

      const markers = generateSceneCutMarkers(sequenceId, cuts, 100);
      expect(markers).toHaveLength(2);

      expect(markers[0]).toMatchObject({
        sequenceId,
        frame: 112,
        markerKind: 'scene_cut',
        color: 'ai',
        name: 'Scene Cut 1 (Hard)',
      });
      expect(markers[0].notes).toContain('92% confidence');

      expect(markers[1]).toMatchObject({
        sequenceId,
        frame: 148,
        markerKind: 'scene_cut',
        color: 'ai',
        name: 'Scene Cut 2 (Dissolve)',
      });
      expect(markers[1].notes).toContain('76% confidence');
    });

    it('applies scene cut detection to split clip at detected cut frames', () => {
      const clip: SequenceClip = {
        id: 'clip-video-long',
        sequenceId,
        trackId: 'track-v1',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'Raw B-Roll Shot',
        filePath: '/media/raw_broll.mp4',
        startFrames: 0,
        durationFrames: 100,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
      };

      const deltas = new Array(99).fill(0.04);
      deltas[30] = 0.88; // Cut at frame 31
      deltas[65] = 0.91; // Cut at frame 66

      const result = applySceneCutDetectionToClip({
        clips: [clip],
        targetClipId: clip.id,
        frameDeltas: deltas,
        settings: {
          ...DEFAULT_SCENE_CUT_DETECTION_SETTINGS,
          minShotDurationFrames: 10,
          action: 'split_clips',
        },
      });

      expect(result.cuts).toHaveLength(2);
      expect(result.updatedClips.length).toBe(3); // Split into 3 segments
      expect(result.updatedClips[0].durationFrames).toBe(31);
      expect(result.updatedClips[1].durationFrames).toBe(35);
      expect(result.updatedClips[2].durationFrames).toBe(34);
    });
  });

  describe('Smart Beat Snapping (Snap to Beat & Semantic HUD)', () => {
    const tracks: SequenceTrack[] = [
      {
        id: 'track-v1',
        sequenceId,
        kind: 'video',
        name: 'V1',
        orderIndex: 0,
        magnetic: false,
        locked: false,
        muted: false,
        videoEnabled: true,
        heightPx: 64,
        role: null,
      },
    ];

    const clips: SequenceClip[] = [
      {
        id: 'clip-1',
        sequenceId,
        trackId: 'track-v1',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'Interview',
        filePath: '/media/interview.mp4',
        startFrames: 0,
        durationFrames: 60,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
      },
    ];

    const markers: SequenceMarker[] = [
      {
        id: 'm1',
        sequenceId,
        frame: 28,
        name: 'Downbeat 1.1',
        color: 'warning',
        locked: false,
        markerKind: 'downbeat',
      },
      {
        id: 'm2',
        sequenceId,
        frame: 32,
        name: 'Beat 1.2',
        color: 'info',
        locked: false,
        markerKind: 'beat',
      },
      {
        id: 'm3',
        sequenceId,
        frame: 70,
        name: 'Scene Cut 1 (Hard)',
        color: 'ai',
        locked: false,
        markerKind: 'scene_cut',
      },
    ];

    it('builds enriched snap targets distinguishing downbeats, beats, and scene cuts', () => {
      const snapTargets = buildSnapTargetsWithMeta({
        tracks,
        clips,
        markers,
        sequenceEndFrame: 100,
      });

      const downbeatTarget = snapTargets.find((t) => t.type === 'downbeat');
      expect(downbeatTarget).toBeDefined();
      expect(downbeatTarget?.frame).toBe(28);
      expect(downbeatTarget?.label).toContain('Downbeat');

      const beatTarget = snapTargets.find((t) => t.type === 'beat');
      expect(beatTarget).toBeDefined();
      expect(beatTarget?.frame).toBe(32);
      expect(beatTarget?.label).toContain('Beat');

      const sceneCutTarget = snapTargets.find((t) => t.type === 'scene_cut');
      expect(sceneCutTarget).toBeDefined();
      expect(sceneCutTarget?.frame).toBe(70);
      expect(sceneCutTarget?.label).toContain('Scene Cut');
    });

    it('prioritizes musical beats when snapToBeats is active', () => {
      const snapTargets = buildSnapTargetsWithMeta({
        tracks,
        clips,
        markers,
      });

      // Frame 29 is 1 frame from Downbeat (frame 28) and 3 frames from Beat (frame 32)
      // When tolerance is 5 frames:
      const snapNormal = snapFrameWithMeta(29, snapTargets, 5, { snapToBeats: false });
      expect(snapNormal.didSnap).toBe(true);
      expect(snapNormal.snappedFrame).toBe(28);

      // Suppose we have a clip boundary at 30 and a beat at 28
      // At frame 29.5: normal snap without beat priority would snap to frame 30 (closer by 0.5f)
      // But with snapToBeats enabled, it prioritizes the beat target at 28!
      const snapBeatPriority = snapFrameWithMeta(29.8, snapTargets, 5, { snapToBeats: true });
      expect(snapBeatPriority.didSnap).toBe(true);
      expect(snapBeatPriority.target?.type === 'downbeat' || snapBeatPriority.target?.type === 'beat').toBe(true);
    });
  });
});
