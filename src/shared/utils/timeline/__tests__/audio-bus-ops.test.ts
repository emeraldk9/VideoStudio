import { describe, expect, it } from 'vitest';
import type { SequenceTrack } from '../../../types/sequence';
import {
  BUS_DIALOGUE,
  BUS_MUSIC,
  BUS_SFX,
  BUS_MASTER,
  DEFAULT_SUBMIX_BUSES,
  createDefaultSubmixBusState,
  inferDefaultTrackBus,
  resolveTrackBus,
  computeSubmixBusLevels,
  computeMasterWithBuses,
} from '../audio-bus-ops';

describe('audio-bus-ops', () => {
  describe('default inference & routing resolution', () => {
    it('infers dialogue bus for narration role', () => {
      const track: Pick<SequenceTrack, 'kind' | 'role'> = { kind: 'audio', role: 'narration' };
      expect(inferDefaultTrackBus(track)).toBe(BUS_DIALOGUE);
    });

    it('infers music bus for music role', () => {
      const track: Pick<SequenceTrack, 'kind' | 'role'> = { kind: 'audio', role: 'music' };
      expect(inferDefaultTrackBus(track)).toBe(BUS_MUSIC);
    });

    it('infers sfx bus for plain audio or video tracks', () => {
      const audioTrack: Pick<SequenceTrack, 'kind' | 'role'> = { kind: 'audio', role: null };
      const videoTrack: Pick<SequenceTrack, 'kind' | 'role'> = { kind: 'video', role: null };
      expect(inferDefaultTrackBus(audioTrack)).toBe(BUS_SFX);
      expect(inferDefaultTrackBus(videoTrack)).toBe(BUS_SFX);
    });

    it('resolves track bus with override routing map', () => {
      const track: SequenceTrack = {
        id: 'track-1',
        sequenceId: 'seq-1',
        name: 'Voiceover',
        kind: 'audio',
        role: 'narration',
        orderIndex: 0,
        muted: false,
        locked: false,
        magnetic: false,
        videoEnabled: true,
        heightPx: 64,
      };

      // Default
      expect(resolveTrackBus(track)).toBe(BUS_DIALOGUE);

      // Overridden to SFX
      expect(resolveTrackBus(track, { 'track-1': BUS_SFX })).toBe(BUS_SFX);

      // Overridden to Master
      expect(resolveTrackBus(track, { 'track-1': BUS_MASTER })).toBe(BUS_MASTER);
    });
  });

  describe('computeSubmixBusLevels', () => {
    const mockTracks: SequenceTrack[] = [
      { id: 't-dia', sequenceId: 'seq-1', name: 'Dialogue', kind: 'audio', role: 'narration', orderIndex: 0, muted: false, locked: false, magnetic: false, videoEnabled: true, heightPx: 64 },
      { id: 't-mus', sequenceId: 'seq-1', name: 'Music Bed', kind: 'audio', role: 'music', orderIndex: 1, muted: false, locked: false, magnetic: false, videoEnabled: true, heightPx: 64 },
      { id: 't-sfx', sequenceId: 'seq-1', name: 'SFX Explosions', kind: 'audio', role: null, orderIndex: 2, muted: false, locked: false, magnetic: false, videoEnabled: true, heightPx: 64 },
    ];

    it('sums routed track levels to their corresponding submix buses', () => {
      const trackLevels = {
        't-dia': { leftDb: -12, rightDb: -12, leftPct: 60, rightPct: 60, isAudible: true },
        't-mus': { leftDb: -20, rightDb: -20, leftPct: 45, rightPct: 45, isAudible: true },
        't-sfx': { leftDb: -6, rightDb: -6, leftPct: 75, rightPct: 75, isAudible: true },
      };

      const busLevels = computeSubmixBusLevels({
        trackLevels,
        tracks: mockTracks,
      });

      expect(busLevels[BUS_DIALOGUE].isAudible).toBe(true);
      expect(busLevels[BUS_DIALOGUE].leftDb).toBeCloseTo(-12, 1);

      expect(busLevels[BUS_MUSIC].isAudible).toBe(true);
      expect(busLevels[BUS_MUSIC].leftDb).toBeCloseTo(-20, 1);

      expect(busLevels[BUS_SFX].isAudible).toBe(true);
      expect(busLevels[BUS_SFX].leftDb).toBeCloseTo(-6, 1);
    });

    it('applies bus fader volume attenuation', () => {
      const trackLevels = {
        't-dia': { leftDb: -10, rightDb: -10, leftPct: 65, rightPct: 65, isAudible: true },
      };

      const busStates = {
        [BUS_DIALOGUE]: { ...createDefaultSubmixBusState(), volumeDb: -6 },
      };

      const busLevels = computeSubmixBusLevels({
        trackLevels,
        tracks: mockTracks,
        busStates,
      });

      expect(busLevels[BUS_DIALOGUE].leftDb).toBeCloseTo(-16, 1);
    });

    it('silences bus when muted', () => {
      const trackLevels = {
        't-dia': { leftDb: -6, rightDb: -6, leftPct: 75, rightPct: 75, isAudible: true },
      };

      const busStates = {
        [BUS_DIALOGUE]: { ...createDefaultSubmixBusState(), mute: true },
      };

      const busLevels = computeSubmixBusLevels({
        trackLevels,
        tracks: mockTracks,
        busStates,
      });

      expect(busLevels[BUS_DIALOGUE].isAudible).toBe(false);
      expect(busLevels[BUS_DIALOGUE].leftDb).toBe(-60);
    });

    it('applies stereo pan to bus output', () => {
      const trackLevels = {
        't-dia': { leftDb: -10, rightDb: -10, leftPct: 65, rightPct: 65, isAudible: true },
      };

      const busStates = {
        [BUS_DIALOGUE]: { ...createDefaultSubmixBusState(), pan: -100 }, // Full Left
      };

      const busLevels = computeSubmixBusLevels({
        trackLevels,
        tracks: mockTracks,
        busStates,
      });

      expect(busLevels[BUS_DIALOGUE].leftDb).toBeGreaterThan(-10);
      expect(busLevels[BUS_DIALOGUE].rightDb).toBe(-60); // Silence on right
    });
  });

  describe('computeMasterWithBuses', () => {
    it('sums active submix buses into master output', () => {
      const busLevels = {
        [BUS_DIALOGUE]: { leftDb: -12, rightDb: -12, leftPct: 60, rightPct: 60, isAudible: true },
        [BUS_MUSIC]: { leftDb: -12, rightDb: -12, leftPct: 60, rightPct: 60, isAudible: true },
      };

      const { masterLevels } = computeMasterWithBuses({
        busLevels,
        masterVolumeDb: 0,
      });

      expect(masterLevels.isAudible).toBe(true);
      // Two equal signals at -12 dB sum to approximately -6 dB
      expect(masterLevels.leftDb).toBeCloseTo(-6, 0.5);
    });

    it('isolates bus in solo mode', () => {
      const busLevels = {
        [BUS_DIALOGUE]: { leftDb: -10, rightDb: -10, leftPct: 65, rightPct: 65, isAudible: true },
        [BUS_MUSIC]: { leftDb: -10, rightDb: -10, leftPct: 65, rightPct: 65, isAudible: true },
      };

      const busStates = {
        [BUS_DIALOGUE]: { ...createDefaultSubmixBusState(), solo: true },
        [BUS_MUSIC]: { ...createDefaultSubmixBusState(), solo: false },
      };

      const { masterLevels } = computeMasterWithBuses({
        busLevels,
        busStates,
        masterVolumeDb: 0,
      });

      // Only Dialogue is heard
      expect(masterLevels.leftDb).toBeCloseTo(-10, 0.5);
    });

    it('applies master limiter brickwall clamp at 0 dBFS', () => {
      const busLevels = {
        [BUS_DIALOGUE]: { leftDb: 3, rightDb: 3, leftPct: 90, rightPct: 90, isAudible: true },
        [BUS_MUSIC]: { leftDb: 3, rightDb: 3, leftPct: 90, rightPct: 90, isAudible: true },
      };

      const unlim = computeMasterWithBuses({
        busLevels,
        masterVolumeDb: 0,
        masterLimiter: false,
      });
      expect(unlim.masterLevels.leftDb).toBeGreaterThan(0);

      const limited = computeMasterWithBuses({
        busLevels,
        masterVolumeDb: 0,
        masterLimiter: true,
      });
      expect(limited.masterLevels.leftDb).toBe(0);
      expect(limited.gainReductionDb).toBeLessThan(0);
    });

    it('applies master glue compressor gain reduction', () => {
      const busLevels = {
        [BUS_DIALOGUE]: { leftDb: -2, rightDb: -2, leftPct: 80, rightPct: 80, isAudible: true },
      };

      const { masterLevels, gainReductionDb } = computeMasterWithBuses({
        busLevels,
        masterVolumeDb: 0,
        masterCompressor: {
          enabled: true,
          threshold: -12,
          ratio: 4,
          attack: 0.01,
          release: 0.1,
          knee: 0,
          makeupGain: 0,
        },
      });

      expect(gainReductionDb).toBeLessThan(0);
      expect(masterLevels.leftDb).toBeLessThan(-2);
    });
  });
});
