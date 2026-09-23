import { describe, it, expect } from 'vitest';
import {
  STEM_DEFINITIONS,
  ALL_STEM_CHANNELS,
  DEFAULT_VOCAL_STEM_SETTINGS,
  clampStemGain,
  clampStemPan,
  calculateStemEnergyDistribution,
  buildFfmpegVocalSeparatorFilter,
  decomposeClipInto4Stems,
  type VocalStemSeparationSettings,
} from '../vocal-separator-ops';
import { type SequenceClip, type SequenceTrack } from '../../../types/sequence';

describe('vocal-separator-ops', () => {
  describe('STEM_DEFINITIONS', () => {
    it('defines complete configurations for all 4 musical stems', () => {
      expect(ALL_STEM_CHANNELS).toHaveLength(4);
      for (const stem of ALL_STEM_CHANNELS) {
        const def = STEM_DEFINITIONS[stem];
        expect(def.type).toBe(stem);
        expect(def.label).toBeTruthy();
        expect(def.shortLabel).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(def.colorHex).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(def.frequencyRange).toBeTruthy();
        expect(['cyan', 'amber', 'emerald', 'violet']).toContain(def.colorLabel);
      }
    });
  });

  describe('parameter clamping', () => {
    it('clamps gainDb between -24 and +12 dB', () => {
      expect(clampStemGain(-35)).toBe(-24);
      expect(clampStemGain(20)).toBe(12);
      expect(clampStemGain(0)).toBe(0);
      expect(clampStemGain(NaN)).toBe(0);
    });

    it('clamps pan between -1.0 and +1.0', () => {
      expect(clampStemPan(-1.5)).toBe(-1);
      expect(clampStemPan(2.0)).toBe(1);
      expect(clampStemPan(0.25)).toBe(0.25);
      expect(clampStemPan(NaN)).toBe(0);
    });
  });

  describe('calculateStemEnergyDistribution', () => {
    it('returns proportional spectral distributions across all 4 stems', () => {
      const dist = calculateStemEnergyDistribution(0.8, true);
      expect(dist.vocals).toBeGreaterThan(0);
      expect(dist.drums).toBeGreaterThan(0);
      expect(dist.bass).toBeGreaterThan(0);
      expect(dist.instruments).toBeGreaterThan(0);
      expect(dist.drums).toBeGreaterThan(dist.bass);
    });

    it('adjusts weighting when percussion is low', () => {
      const dist = calculateStemEnergyDistribution(0.5, false);
      expect(dist.vocals).toBeGreaterThan(dist.drums);
      expect(dist.instruments).toBeGreaterThan(dist.drums);
    });
  });

  describe('buildFfmpegVocalSeparatorFilter', () => {
    it('returns empty string when disabled', () => {
      expect(buildFfmpegVocalSeparatorFilter(DEFAULT_VOCAL_STEM_SETTINGS)).toBe('');
    });

    it('generates bandpass vocal filter for isolate_vocals mode', () => {
      const settings: VocalStemSeparationSettings = {
        ...DEFAULT_VOCAL_STEM_SETTINGS,
        enabled: true,
        mode: 'isolate_vocals',
      };
      const filter = buildFfmpegVocalSeparatorFilter(settings);
      expect(filter).toContain('highpass');
      expect(filter).toContain('lowpass');
    });

    it('generates notch filter for remove_vocals mode', () => {
      const settings: VocalStemSeparationSettings = {
        ...DEFAULT_VOCAL_STEM_SETTINGS,
        enabled: true,
        mode: 'remove_vocals',
      };
      const filter = buildFfmpegVocalSeparatorFilter(settings);
      expect(filter).toContain('bandreject');
    });

    it('generates specific target stem filter when decomposed', () => {
      const bassSettings: VocalStemSeparationSettings = {
        ...DEFAULT_VOCAL_STEM_SETTINGS,
        enabled: true,
        targetStem: 'bass',
      };
      expect(buildFfmpegVocalSeparatorFilter(bassSettings)).toContain('lowpass=f=220');

      const drumSettings: VocalStemSeparationSettings = {
        ...DEFAULT_VOCAL_STEM_SETTINGS,
        enabled: true,
        targetStem: 'drums',
      };
      expect(buildFfmpegVocalSeparatorFilter(drumSettings)).toContain('compand');
    });
  });

  describe('decomposeClipInto4Stems', () => {
    const mockClip: SequenceClip = {
      id: 'clip-master-music',
      sequenceId: 'seq-1',
      trackId: 'track-audio-1',
      orderIndex: 0,
      sourceKind: 'audio',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: 'C:/Audio/soundtrack.mp3',
      startFrames: 30,
      durationFrames: 300,
      sourceInFrames: 0,
      sourceOutFrames: 300,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Main Soundtrack',
      overrides: [],
    };

    const mockTracks: SequenceTrack[] = [
      {
        id: 'track-audio-1',
        sequenceId: 'seq-1',
        kind: 'audio',
        orderIndex: 0,
        name: 'A1 Master',
        role: 'music',
        magnetic: false,
        locked: false,
        muted: false,
        videoEnabled: true,
        heightPx: 36,
      },
    ];

    it('generates 4 aligned tracks and 4 stem clips with color branding', () => {
      const result = decomposeClipInto4Stems(mockClip, mockTracks, 1);

      expect(result.newTracks).toHaveLength(4);
      expect(result.stemClips).toHaveLength(4);

      // Verify track names and roles
      expect(result.newTracks[0].name).toContain('Vocals');
      expect(result.newTracks[1].name).toContain('Drums');
      expect(result.newTracks[2].name).toContain('Bass');
      expect(result.newTracks[3].name).toContain('Instruments');

      // Verify stem clip alignment
      for (let i = 0; i < 4; i++) {
        const stemClip = result.stemClips[i];
        expect(stemClip.startFrames).toBe(mockClip.startFrames);
        expect(stemClip.durationFrames).toBe(mockClip.durationFrames);
        expect(stemClip.filePath).toBe(mockClip.filePath);
        expect(stemClip.trackId).toBe(result.newTracks[i].id);
        expect(stemClip.effects?.vocalSeparation?.targetStem).toBe(ALL_STEM_CHANNELS[i]);
      }

      // Verify original master clip is safely muted
      expect(result.updatedOriginalClip.gainDb).toBe(-96);
      expect(result.updatedOriginalClip.label).toContain('Muted Master');
    });
  });
});
