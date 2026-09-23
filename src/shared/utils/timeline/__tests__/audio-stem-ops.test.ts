import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceRenderRequest, SequenceTrack } from '../../../types/sequence';
import { BUS_DIALOGUE, BUS_MUSIC, BUS_SFX } from '../audio-bus-ops';
import {
  AUDIO_STEM_CONFIGS,
  buildStemExportBatch,
  filterClipsForStem,
  generateStemFilePath,
  isTrackMatchingStem,
} from '../audio-stem-ops';

describe('Milestone S68: Audio Stem Operations', () => {
  const narrationTrack: SequenceTrack = {
    id: 'track-narr',
    sequenceId: 'seq-1',
    orderIndex: 0,
    kind: 'audio',
    name: 'Voiceover A1',
    magnetic: true,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: 'narration',
  };

  const musicTrack: SequenceTrack = {
    id: 'track-mus',
    sequenceId: 'seq-1',
    orderIndex: 1,
    kind: 'audio',
    name: 'Score A2',
    magnetic: false,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: 'music',
  };

  const sfxTrack: SequenceTrack = {
    id: 'track-sfx',
    sequenceId: 'seq-1',
    orderIndex: 2,
    kind: 'audio',
    name: 'Foley A3',
    magnetic: false,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };

  const videoTrack: SequenceTrack = {
    id: 'track-vid',
    sequenceId: 'seq-1',
    orderIndex: 3,
    kind: 'video',
    name: 'V1 Camera Sync',
    magnetic: true,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };

  describe('isTrackMatchingStem', () => {
    it('matches master stem for all tracks', () => {
      expect(isTrackMatchingStem(narrationTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(sfxTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(videoTrack, 'master')).toBe(true);
    });

    it('infers dialogue from narration role and video sync track', () => {
      expect(isTrackMatchingStem(narrationTrack, 'dialogue')).toBe(true);
      expect(isTrackMatchingStem(videoTrack, 'dialogue')).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'dialogue')).toBe(false);
      expect(isTrackMatchingStem(sfxTrack, 'dialogue')).toBe(false);
    });

    it('infers music from music role', () => {
      expect(isTrackMatchingStem(musicTrack, 'music')).toBe(true);
      expect(isTrackMatchingStem(narrationTrack, 'music')).toBe(false);
      expect(isTrackMatchingStem(sfxTrack, 'music')).toBe(false);
    });

    it('infers sfx from generic audio track', () => {
      expect(isTrackMatchingStem(sfxTrack, 'sfx')).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'sfx')).toBe(false);
      expect(isTrackMatchingStem(narrationTrack, 'sfx')).toBe(false);
    });

    it('respects submix bus routing map overrides', () => {
      const routingMap = {
        [sfxTrack.id]: BUS_MUSIC, // Re-route SFX to Music bus
      };

      expect(isTrackMatchingStem(sfxTrack, 'music', routingMap)).toBe(true);
      expect(isTrackMatchingStem(sfxTrack, 'sfx', routingMap)).toBe(false);
    });
  });

  describe('filterClipsForStem', () => {
    const clipNarr: SequenceClip = {
      id: 'c-narr',
      sequenceId: 'seq-1',
      trackId: 'track-narr',
      orderIndex: 0,
      sourceKind: 'audio',
      filePath: 'c:/audio/voice.wav',
      durationFrames: 100,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'VO',
      overrides: [],
    };

    const clipMus: SequenceClip = {
      ...clipNarr,
      id: 'c-mus',
      trackId: 'track-mus',
      filePath: 'c:/audio/bg.mp3',
    };

    const clipSfx: SequenceClip = {
      ...clipNarr,
      id: 'c-sfx',
      trackId: 'track-sfx',
      filePath: 'c:/audio/hit.wav',
    };

    const clipText: SequenceClip = {
      ...clipNarr,
      id: 'c-text',
      trackId: 'track-vid',
      sourceKind: 'text',
      filePath: null,
    };

    const allClips = [clipNarr, clipMus, clipSfx, clipText];
    const tracks = [narrationTrack, musicTrack, sfxTrack, videoTrack];

    it('returns only dialogue clips for dialogue stem', () => {
      const filtered = filterClipsForStem(allClips, tracks, 'dialogue');
      expect(filtered.map((c) => c.id)).toEqual(['c-narr']);
    });

    it('returns only music clips for music stem', () => {
      const filtered = filterClipsForStem(allClips, tracks, 'music');
      expect(filtered.map((c) => c.id)).toEqual(['c-mus']);
    });

    it('returns only sfx clips for sfx stem', () => {
      const filtered = filterClipsForStem(allClips, tracks, 'sfx');
      expect(filtered.map((c) => c.id)).toEqual(['c-sfx']);
    });

    it('returns all sound-carrying clips for master stem', () => {
      const filtered = filterClipsForStem(allClips, tracks, 'master');
      expect(filtered.length).toBe(3); // text clip excluded
    });
  });

  describe('generateStemFilePath', () => {
    it('generates standardized delivery file paths with suffixes', () => {
      const base = 'C:/Deliverables/FeatureFilm_v1.mp4';

      expect(generateStemFilePath(base, 'dialogue', 'wav')).toBe(
        'C:/Deliverables/FeatureFilm_v1_DIA.wav',
      );
      expect(generateStemFilePath(base, 'music', 'wav')).toBe(
        'C:/Deliverables/FeatureFilm_v1_MUS.wav',
      );
      expect(generateStemFilePath(base, 'sfx', 'wav')).toBe(
        'C:/Deliverables/FeatureFilm_v1_SFX.wav',
      );
      expect(generateStemFilePath(base, 'master', 'wav')).toBe(
        'C:/Deliverables/FeatureFilm_v1_FULLMIX.wav',
      );
    });
  });

  describe('buildStemExportBatch', () => {
    it('creates batch requests for selected stems with audioOnly', () => {
      const baseReq: SequenceRenderRequest = {
        sequenceId: 'seq-1',
        outputPath: 'C:/Exports/MyProject.mp4',
        quality: 'high',
      };

      const batch = buildStemExportBatch(baseReq, ['dialogue', 'music', 'sfx'], undefined, 'wav');
      expect(batch.length).toBe(3);

      expect(batch[0].outputPath).toBe('C:/Exports/MyProject_DIA.wav');
      expect(batch[0].audioOnly).toBe(true);
      expect(batch[0].stemType).toBe('dialogue');
      expect(batch[0].format).toBe('wav');

      expect(batch[1].outputPath).toBe('C:/Exports/MyProject_MUS.wav');
      expect(batch[1].stemType).toBe('music');

      expect(batch[2].outputPath).toBe('C:/Exports/MyProject_SFX.wav');
      expect(batch[2].stemType).toBe('sfx');
    });
  });
});
