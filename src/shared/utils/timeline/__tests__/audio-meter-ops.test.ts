import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  calculateStereoPan,
  computeMasterStereoLevels,
  computeTrackStereoLevels,
  createInitialPeakHoldState,
  dbToLinear,
  dbToMeterPercent,
  linearToDb,
  updatePeakHold,
} from '../audio-meter-ops';

function makeMockTrack(id: string, kind: 'video' | 'audio' = 'audio'): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    kind,
    name: id,
    volume: 1,
    muted: false,
    locked: false,
    magnetic: false,
    videoEnabled: true,
    orderIndex: 0,
    heightPx: 48,
    role: null,
  };
}

function makeMockClip(id: string, startFrames: number, durationFrames: number, trackId: string): SequenceClip {
  return {
    id,
    sequenceId: 'seq-1',
    trackId,
    orderIndex: 0,
    startFrames,
    durationFrames,
    sourceInFrames: 0,
    sourceOutFrames: durationFrames,
    transitionIn: 'cut',
    transitionFrames: 0,
    sourceKind: 'audio',
    filePath: 'audio.wav',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: `Clip ${id}`,
    motionPreset: 'none',
    overrides: [],
  };
}

describe('audio-meter-ops', () => {
  describe('linearToDb and dbToLinear conversions', () => {
    it('accurately converts unity (linear 1.0) to 0 dBFS and vice versa', () => {
      expect(linearToDb(1.0)).toBeCloseTo(0, 4);
      expect(dbToLinear(0)).toBeCloseTo(1.0, 4);
    });

    it('accurately converts half amplitude to ~ -6.02 dBFS', () => {
      expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
      expect(dbToLinear(-6.02)).toBeCloseTo(0.5, 2);
    });

    it('floors zero and near-zero values at -60 dB', () => {
      expect(linearToDb(0)).toBe(-60);
      expect(linearToDb(-1)).toBe(-60);
      expect(linearToDb(0.000001)).toBe(-60);
    });
  });

  describe('dbToMeterPercent logarithmic visual curve', () => {
    it('returns 0% for -60 dB and 100% for +6 dB', () => {
      expect(dbToMeterPercent(-60)).toBe(0);
      expect(dbToMeterPercent(-70)).toBe(0);
      expect(dbToMeterPercent(6)).toBe(100);
      expect(dbToMeterPercent(10)).toBe(100);
    });

    it('calibrates -18 dB (broadcast nominal) to 50% and 0 dBFS to 85%', () => {
      expect(dbToMeterPercent(-18)).toBeCloseTo(50, 2);
      expect(dbToMeterPercent(0)).toBeCloseTo(85, 2);
    });
  });

  describe('calculateStereoPan equal-power distribution', () => {
    it('provides equal-power attenuation at center (pan = 0)', () => {
      const { leftGain, rightGain } = calculateStereoPan(0);
      expect(leftGain).toBeCloseTo(0.7071, 3); // -3 dB
      expect(rightGain).toBeCloseTo(0.7071, 3);
      // Equal-power sum: leftGain^2 + rightGain^2 = 1.0
      expect(leftGain ** 2 + rightGain ** 2).toBeCloseTo(1.0, 3);
    });

    it('steers fully left at pan = -100', () => {
      const { leftGain, rightGain } = calculateStereoPan(-100);
      expect(leftGain).toBeCloseTo(1.0, 3);
      expect(rightGain).toBeCloseTo(0, 3);
    });

    it('steers fully right at pan = +100', () => {
      const { leftGain, rightGain } = calculateStereoPan(100);
      expect(leftGain).toBeCloseTo(0, 3);
      expect(rightGain).toBeCloseTo(1.0, 3);
    });
  });

  describe('updatePeakHold behavior', () => {
    it('latches higher peak and resets hold timer', () => {
      const initial = createInitialPeakHoldState();
      const updated = updatePeakHold(-12, initial, 24);

      expect(updated.heldPeakDb).toBe(-12);
      expect(updated.holdRemainingTicks).toBe(24);
      expect(updated.isClipping).toBe(false);
    });

    it('latches clipping when signal reaches or exceeds 0 dBFS', () => {
      const state1 = updatePeakHold(0.5, createInitialPeakHoldState());
      expect(state1.isClipping).toBe(true);

      // Clipping persists even when level drops
      const state2 = updatePeakHold(-20, state1);
      expect(state2.isClipping).toBe(true);
    });

    it('counts down hold timer then decays smoothly', () => {
      let state = updatePeakHold(-10, createInitialPeakHoldState(), 2);
      expect(state.heldPeakDb).toBe(-10);
      expect(state.holdRemainingTicks).toBe(2);

      // Tick 1: Still holding
      state = updatePeakHold(-30, state, 2, 2.0);
      expect(state.heldPeakDb).toBe(-10);
      expect(state.holdRemainingTicks).toBe(1);

      // Tick 2: Still holding
      state = updatePeakHold(-30, state, 2, 2.0);
      expect(state.heldPeakDb).toBe(-10);
      expect(state.holdRemainingTicks).toBe(0);

      // Tick 3: Hold expired, decays by 2.0 dB
      state = updatePeakHold(-30, state, 2, 2.0);
      expect(state.heldPeakDb).toBe(-12);
    });
  });

  describe('computeTrackStereoLevels & computeMasterStereoLevels', () => {
    it('computes levels for active clip on track', () => {
      const track = makeMockTrack('A1');
      const clip = makeMockClip('c1', 10, 50, 'A1'); // frames 10..60

      // Before clip starts (frame 5)
      const outside = computeTrackStereoLevels({
        track,
        clips: [clip],
        playheadFrame: 5,
      });
      expect(outside.isAudible).toBe(false);
      expect(outside.leftDb).toBe(-60);

      // Inside clip (frame 20)
      const inside = computeTrackStereoLevels({
        track,
        clips: [clip],
        playheadFrame: 20,
      });
      expect(inside.isAudible).toBe(true);
      // Unity gain clip with center pan produces -3 dB on L and R
      expect(inside.leftDb).toBeCloseTo(-3, 0.5);
      expect(inside.rightDb).toBeCloseTo(-3, 0.5);
    });

    it('silences track when muted', () => {
      const track = makeMockTrack('A1');
      track.muted = true;
      const clip = makeMockClip('c1', 0, 100, 'A1');

      const levels = computeTrackStereoLevels({
        track,
        clips: [clip],
        playheadFrame: 25,
      });
      expect(levels.isAudible).toBe(false);
      expect(levels.leftDb).toBe(-60);
    });

    it('sums multiple tracks and applies master limiter', () => {
      const t1 = computeTrackStereoLevels({
        track: makeMockTrack('A1'),
        clips: [makeMockClip('c1', 0, 100, 'A1')],
        playheadFrame: 10,
        trackMixerState: { volumeDb: 3, pan: 0, mute: false, solo: false },
      });
      const t2 = computeTrackStereoLevels({
        track: makeMockTrack('A2'),
        clips: [makeMockClip('c2', 0, 100, 'A2')],
        playheadFrame: 10,
        trackMixerState: { volumeDb: 3, pan: 0, mute: false, solo: false },
      });

      // Without limiter, sum exceeds 0 dBFS
      const unlimited = computeMasterStereoLevels({
        trackLevels: [t1, t2],
        masterVolumeDb: 0,
        masterLimiter: false,
      });
      expect(unlimited.leftDb).toBeGreaterThan(0);

      // With limiter, clamped to 0 dBFS (linear 1.0)
      const limited = computeMasterStereoLevels({
        trackLevels: [t1, t2],
        masterVolumeDb: 0,
        masterLimiter: true,
      });
      expect(limited.leftDb).toBeCloseTo(0, 2);
    });
  });
});
