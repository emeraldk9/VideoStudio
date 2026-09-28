import { describe, expect, it } from 'vitest';
import {
  buildRhythmicSnapTargetEntries,
  calculateBeatsPerSubdivision,
  calculateFramesPerBeat,
  calculateSubdivisionFrames,
  clampRhythmicGridConfig,
  DEFAULT_RHYTHMIC_GRID_CONFIG,
  frameToMusicalPosition,
  generateRhythmicGridPoints,
  musicalPositionToFrame,
  RHYTHMIC_PRESETS,
  RHYTHMIC_RESOLUTION_LABELS,
  snapToRhythmicGrid,
  type RhythmicGridConfig,
} from '../rhythmic-beat-grid-ops';

describe('rhythmic-beat-grid-ops (Milestone S184: Audio Transient Beat Snap & Rhythmic Grid Engine)', () => {
  const standardConfig: RhythmicGridConfig = {
    ...DEFAULT_RHYTHMIC_GRID_CONFIG,
    enabled: true,
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    resolution: '1_4', // Quarter notes
    startOffsetFrame: 0,
    snapToleranceFrames: 4,
  };

  describe('parameter clamping & sanitization', () => {
    it('clamps BPM, time signature, and tolerance into safe engineering ranges', () => {
      const clamped = clampRhythmicGridConfig({
        bpm: 10, // too low
        timeSignature: { numerator: 32, denominator: 5 as unknown as 4 }, // invalid
        snapToleranceFrames: 50, // too high
        startOffsetFrame: -10, // negative
      });

      expect(clamped.bpm).toBe(20);
      expect(clamped.timeSignature.numerator).toBe(16);
      expect(clamped.timeSignature.denominator).toBe(4);
      expect(clamped.snapToleranceFrames).toBe(30);
      expect(clamped.startOffsetFrame).toBe(0);
    });

    it('preserves valid configurations', () => {
      const clamped = clampRhythmicGridConfig({
        bpm: 140,
        timeSignature: { numerator: 3, denominator: 4 },
        resolution: '1_8',
        startOffsetFrame: 15,
        snapToleranceFrames: 6,
      });

      expect(clamped.bpm).toBe(140);
      expect(clamped.timeSignature.numerator).toBe(3);
      expect(clamped.resolution).toBe('1_8');
      expect(clamped.startOffsetFrame).toBe(15);
      expect(clamped.snapToleranceFrames).toBe(6);
    });
  });

  describe('musical timing calculations', () => {
    it('computes exact frames per beat at various tempos and frame rates', () => {
      // 120 BPM at 30 fps -> 60*30 / 120 = 15 frames/beat
      expect(calculateFramesPerBeat(120, 30)).toBe(15);

      // 60 BPM at 60 fps -> 60*60 / 60 = 60 frames/beat
      expect(calculateFramesPerBeat(60, 60)).toBe(60);

      // 140 BPM at 24 fps -> 60*24 / 140 = 10.2857 frames/beat
      expect(calculateFramesPerBeat(140, 24)).toBeCloseTo(10.2857, 3);
    });

    it('calculates beats per subdivision accurately', () => {
      expect(calculateBeatsPerSubdivision('1_bar', { numerator: 4, denominator: 4 })).toBe(4);
      expect(calculateBeatsPerSubdivision('1_bar', { numerator: 3, denominator: 4 })).toBe(3);
      expect(calculateBeatsPerSubdivision('1_2')).toBe(2.0);
      expect(calculateBeatsPerSubdivision('1_4')).toBe(1.0);
      expect(calculateBeatsPerSubdivision('1_8')).toBe(0.5);
      expect(calculateBeatsPerSubdivision('1_16')).toBe(0.25);
      expect(calculateBeatsPerSubdivision('1_32')).toBe(0.125);
      expect(calculateBeatsPerSubdivision('1_8_triplet')).toBeCloseTo(1 / 3, 5);
      expect(calculateBeatsPerSubdivision('1_16_triplet')).toBeCloseTo(1 / 6, 5);
    });

    it('computes subdivision frame interval correctly', () => {
      // 120 BPM, 30 fps (15 frames/beat)
      // 1/4 note = 15 frames
      expect(calculateSubdivisionFrames(standardConfig, 30)).toBe(15);

      // 1/8 note = 7.5 frames
      const eighthConfig: RhythmicGridConfig = { ...standardConfig, resolution: '1_8' };
      expect(calculateSubdivisionFrames(eighthConfig, 30)).toBe(7.5);

      // 1/8 triplet = 5 frames
      const tripletConfig: RhythmicGridConfig = { ...standardConfig, resolution: '1_8_triplet' };
      expect(calculateSubdivisionFrames(tripletConfig, 30)).toBe(5);
    });
  });

  describe('musical position formatting & round-trip conversion', () => {
    it('formats frame 0 as Bar 1, Beat 1, 16th 1, Tick 0', () => {
      const pos = frameToMusicalPosition(0, standardConfig, 30);
      expect(pos.bar).toBe(1);
      expect(pos.beat).toBe(1);
      expect(pos.sixteenth).toBe(1);
      expect(pos.formatted).toBe('1.1.1.00');
    });

    it('identifies downbeat of Bar 2 (frame 60 at 120 BPM 30fps)', () => {
      // 4 beats * 15 frames = 60 frames
      const pos = frameToMusicalPosition(60, standardConfig, 30);
      expect(pos.bar).toBe(2);
      expect(pos.beat).toBe(1);
      expect(pos.sixteenth).toBe(1);
      expect(pos.formatted).toBe('2.1.1.00');
    });

    it('faithfully converts musical position back to frame number', () => {
      // Bar 3, Beat 2 in 4/4 at 120 BPM 30fps:
      // Total beats = 2 bars * 4 + 1 beat = 9 beats
      // 9 beats * 15 frames = 135 frames
      const frame = musicalPositionToFrame(3, 2, 1, standardConfig, 30);
      expect(frame).toBe(135);

      const roundTripPos = frameToMusicalPosition(frame, standardConfig, 30);
      expect(roundTripPos.bar).toBe(3);
      expect(roundTripPos.beat).toBe(2);
    });
  });

  describe('snapToRhythmicGrid', () => {
    it('returns didSnap = false when disabled', () => {
      const disabled = { ...standardConfig, enabled: false };
      const res = snapToRhythmicGrid(14, disabled, 30, 4);
      expect(res.didSnap).toBe(false);
      expect(res.snappedFrame).toBe(14);
    });

    it('snaps frame 14 to nearest beat at frame 15 within tolerance', () => {
      // 120 BPM, 30 fps: beats are at 0, 15, 30, 45, 60...
      const res = snapToRhythmicGrid(14, standardConfig, 30, 4);
      expect(res.didSnap).toBe(true);
      expect(res.snappedFrame).toBe(15);
      expect(res.deltaFrames).toBe(1);
      expect(res.gridPoint?.bar).toBe(1);
      expect(res.gridPoint?.beat).toBe(2);
    });

    it('does not snap if frame is outside tolerance window', () => {
      // Distance between frame 22 and frame 15 is 7, and frame 30 is 8.
      // With tolerance of 3, it should not snap.
      const res = snapToRhythmicGrid(22, standardConfig, 30, 3);
      expect(res.didSnap).toBe(false);
      expect(res.snappedFrame).toBe(22);
    });

    it('snaps frame 59 to downbeat of Bar 2 (frame 60) and marks isDownbeat', () => {
      const res = snapToRhythmicGrid(59, standardConfig, 30, 4);
      expect(res.didSnap).toBe(true);
      expect(res.snappedFrame).toBe(60);
      expect(res.gridPoint?.isDownbeat).toBe(true);
      expect(res.gridPoint?.label).toBe('Bar 2 Downbeat');
    });

    it('supports custom startOffsetFrame', () => {
      const offsetConfig: RhythmicGridConfig = {
        ...standardConfig,
        startOffsetFrame: 10,
      };
      // Beats at 10, 25, 40...
      const res = snapToRhythmicGrid(26, offsetConfig, 30, 4);
      expect(res.didSnap).toBe(true);
      expect(res.snappedFrame).toBe(25);
    });

    it('correctly snaps to triplet subdivisions', () => {
      const tripletConfig: RhythmicGridConfig = {
        ...standardConfig,
        resolution: '1_8_triplet', // 5 frames per subdivision at 120 BPM 30fps
      };
      // Grid points at 0, 5, 10, 15, 20...
      const res = snapToRhythmicGrid(9, tripletConfig, 30, 2);
      expect(res.didSnap).toBe(true);
      expect(res.snappedFrame).toBe(10);
      expect(res.gridPoint?.type).toBe('triplet');
    });
  });

  describe('generateRhythmicGridPoints', () => {
    it('generates grid points across visible range', () => {
      // 0 to 60 frames = 5 points (0, 15, 30, 45, 60)
      const points = generateRhythmicGridPoints(standardConfig, 0, 60, 30);
      expect(points.length).toBe(5);
      expect(points.map((p) => p.frame)).toEqual([0, 15, 30, 45, 60]);
      expect(points[0].isDownbeat).toBe(true);
      expect(points[4].isDownbeat).toBe(true);
    });

    it('limits points when viewport spans an enormous frame range', () => {
      // 100,000 frames at 1/16 note would be huge without downsampling
      const sixteenthConfig: RhythmicGridConfig = { ...standardConfig, resolution: '1_16' };
      const points = generateRhythmicGridPoints(sixteenthConfig, 0, 100000, 30, 100);
      expect(points.length).toBeLessThanOrEqual(105);
    });
  });

  describe('buildRhythmicSnapTargetEntries', () => {
    it('converts grid points to SnapTargetEntry with correct priority and label', () => {
      const targets = buildRhythmicSnapTargetEntries(standardConfig, 0, 60, 30);
      expect(targets.length).toBe(5);

      // Downbeat at frame 0 has priority 1
      expect(targets[0].frame).toBe(0);
      expect(targets[0].type).toBe('downbeat');
      expect(targets[0].priority).toBe(1);

      // Beat 2 at frame 15 has priority 2
      expect(targets[1].frame).toBe(15);
      expect(targets[1].type).toBe('beat');
      expect(targets[1].priority).toBe(2);
    });
  });

  describe('Presets & Labels', () => {
    it('validates all rhythmic presets have valid tempo and resolution', () => {
      for (const key of Object.keys(RHYTHMIC_PRESETS) as (keyof typeof RHYTHMIC_PRESETS)[]) {
        const preset = RHYTHMIC_PRESETS[key];
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.config.bpm).toBeGreaterThanOrEqual(60);
        expect(preset.config.resolution).toBeTruthy();
      }
    });

    it('has human-readable labels for all resolutions', () => {
      for (const res of Object.keys(RHYTHMIC_RESOLUTION_LABELS) as (keyof typeof RHYTHMIC_RESOLUTION_LABELS)[]) {
        expect(RHYTHMIC_RESOLUTION_LABELS[res]).toBeTruthy();
      }
    });
  });
});
