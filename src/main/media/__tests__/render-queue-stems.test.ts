import { describe, expect, it } from 'vitest';
import {
  ALL_STEM_TYPES,
  AUDIO_STEM_CONFIGS,
  buildStemExportBatch,
  generateStemFilePath,
  isTrackMatchingStem,
  buildAtmos714PanFilter,
  buildBinauralHrtfFilter,
  computeAtmos714Pan,
  computeBinauralHrtfCues,
  generateAdmBwfXml,
  type AudioStemType,
  type SequenceClip,
  type SequenceRenderRequest,
  type SequenceTrack,
  type SpatialSource,
} from '../../../shared';
import { buildMuxArgs, buildTranscodeArgs } from '../sequence-normalize';

describe('Milestone S68: Render Queue & Multi-Format Batch Stem Exporter', () => {
  describe('Broadcast Codec & Transcode Flag Synthesis (buildTranscodeArgs)', () => {
    it('synthesizes Apple ProRes 422 HQ broadcast master arguments', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'prores',
        proresProfile: 3,
        quality: 'high',
      });

      expect(args).toContain('-c:v');
      expect(args).toContain('prores_ks');
      expect(args).toContain('-profile:v');
      expect(args).toContain('3');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv422p10le');
      expect(args).toContain('-c:a');
      expect(args).toContain('pcm_s24le');
    });

    it('synthesizes Apple ProRes 422 Proxy arguments', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'prores',
        proresProfile: 0,
      });

      expect(args).toContain('prores_ks');
      expect(args).toContain('-profile:v');
      expect(args).toContain('0');
      expect(args).toContain('yuv422p10le');
    });

    it('synthesizes Apple ProRes 4444 cinema mastering arguments', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'prores',
        proresProfile: 4,
      });

      expect(args).toContain('prores_ks');
      expect(args).toContain('-profile:v');
      expect(args).toContain('4');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv444p10le');
      expect(args).toContain('-c:a');
      expect(args).toContain('pcm_s24le');
    });

    it('synthesizes Avid DNxHD / DNxHR arguments with uncompressed audio', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'dnxhd',
      });

      expect(args).toContain('-c:v');
      expect(args).toContain('dnxhd');
      expect(args).toContain('-profile:v');
      expect(args).toContain('dnxhr_hq');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv422p');
      expect(args).toContain('-c:a');
      expect(args).toContain('pcm_s16le');
    });

    it('synthesizes Avid DNxHR LB draft proxy profile', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'dnxhd',
        dnxhrProfile: 'dnxhr_lb',
      });

      expect(args).toContain('-profile:v');
      expect(args).toContain('dnxhr_lb');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv422p');
    });

    it('synthesizes Avid DNxHR SQ standard quality profile', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'dnxhd',
        dnxhrProfile: 'dnxhr_sq',
      });

      expect(args).toContain('-profile:v');
      expect(args).toContain('dnxhr_sq');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv422p');
    });

    it('synthesizes Avid DNxHR HQX 10-bit broadcast mastering profile', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'dnxhd',
        dnxhrProfile: 'dnxhr_hqx',
      });

      expect(args).toContain('-profile:v');
      expect(args).toContain('dnxhr_hqx');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv422p10le');
    });

    it('synthesizes Avid DNxHR 444 cinema archival 10-bit RGB profile', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mov', {
        format: 'dnxhd',
        dnxhrProfile: 'dnxhr_444',
      });

      expect(args).toContain('-profile:v');
      expect(args).toContain('dnxhr_444');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv444p10le');
    });

    it('synthesizes HEVC / H.265 arguments with 10-bit color & high fidelity audio', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mp4', {
        format: 'hevc',
        quality: 'high',
        audioBitrateKbps: 256,
      });

      expect(args).toContain('-c:v');
      expect(args).toContain('libx265');
      expect(args).toContain('-crf');
      expect(args).toContain('20');
      expect(args).toContain('-preset');
      expect(args).toContain('medium');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv420p10le');
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).toContain('-b:a');
      expect(args).toContain('256k');
    });

    it('synthesizes HEVC standard quality with CRF 23', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mp4', {
        format: 'hevc',
        quality: 'good',
      });

      expect(args).toContain('libx265');
      expect(args).toContain('23');
    });

    it('synthesizes uncompressed WAV 24-bit 48kHz PCM audio arguments', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.wav', {
        format: 'wav',
      });

      expect(args).toContain('-vn');
      expect(args).toContain('-c:a');
      expect(args).toContain('pcm_s24le');
      expect(args).toContain('-ar');
      expect(args).toContain('48000');
    });

    it('supports two-pass VBR flags for MP4/H.264', () => {
      const args = buildTranscodeArgs('input.mp4', 'output.mp4', {
        format: 'mp4',
        twoPass: true,
        quality: 'high',
      });

      expect(args).toContain('-pass');
      expect(args).toContain('2');
    });
  });

  describe('Audio Stem Batch Generation (buildStemExportBatch & generateStemFilePath)', () => {
    const baseRequest: SequenceRenderRequest = {
      sequenceId: 'seq-101',
      outputPath: 'C:/Exports/Commercial_Final.mp4',
      draft: false,
      audioBitrateKbps: 256,
      format: 'mp4',
    };

    it('generates correct stem file paths preserving directory structure and appending stem suffix', () => {
      expect(generateStemFilePath('C:/Exports/Film.mp4', 'dialogue', 'wav')).toBe(
        'C:/Exports/Film_DIA.wav',
      );
      expect(generateStemFilePath('C:/Exports/Film.mp4', 'music', 'wav')).toBe(
        'C:/Exports/Film_MUS.wav',
      );
      expect(generateStemFilePath('C:/Exports/Film.mp4', 'sfx', 'wav')).toBe(
        'C:/Exports/Film_SFX.wav',
      );
      expect(generateStemFilePath('C:/Exports/Film.mp4', 'master', 'wav')).toBe(
        'C:/Exports/Film_FULLMIX.wav',
      );
    });

    it('builds a batch of isolated stem render requests', () => {
      const stems: AudioStemType[] = ['dialogue', 'music', 'sfx'];
      const batch = buildStemExportBatch(baseRequest, stems, undefined, 'wav');

      expect(batch.length).toBe(3);
      expect(batch[0].stemType).toBe('dialogue');
      expect(batch[0].outputPath).toBe('C:/Exports/Commercial_Final_DIA.wav');
      expect(batch[0].audioOnly).toBe(true);
      expect(batch[0].format).toBe('wav');

      expect(batch[1].stemType).toBe('music');
      expect(batch[1].outputPath).toBe('C:/Exports/Commercial_Final_MUS.wav');
      expect(batch[1].audioOnly).toBe(true);

      expect(batch[2].stemType).toBe('sfx');
      expect(batch[2].outputPath).toBe('C:/Exports/Commercial_Final_SFX.wav');
    });

    it('maintains custom submix routing map across batch requests', () => {
      const routing = {
        'track-voice': 'BUS_DIALOGUE',
        'track-score': 'BUS_MUSIC',
        'track-foley': 'BUS_SFX',
      };
      const batch = buildStemExportBatch(baseRequest, ['dialogue', 'music'], routing);

      expect(batch[0].stemRoutingMap).toEqual(routing);
      expect(batch[1].stemRoutingMap).toEqual(routing);
    });
  });

  describe('Submix Bus & Track Routing Filter (isTrackMatchingStem)', () => {
    const dialogueTrack = {
      id: 't-dia',
      name: 'Host Voice',
      kind: 'audio' as const,
      role: 'narration' as const,
    };

    const musicTrack = {
      id: 't-mus',
      name: 'Score',
      kind: 'audio' as const,
      role: 'music' as const,
    };

    const sfxTrack = {
      id: 't-sfx',
      name: 'Whoosh & Impacts',
      kind: 'audio' as const,
      role: null,
    };

    const videoTrack = {
      id: 't-vid',
      name: 'Main Camera',
      kind: 'video' as const,
      role: null,
    };

    it('matches all tracks for master stem', () => {
      expect(isTrackMatchingStem(dialogueTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(sfxTrack, 'master')).toBe(true);
      expect(isTrackMatchingStem(videoTrack, 'master')).toBe(true);
    });

    it('matches dialogue track by narration role or video sync audio', () => {
      expect(isTrackMatchingStem(dialogueTrack, 'dialogue')).toBe(true);
      expect(isTrackMatchingStem(videoTrack, 'dialogue')).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'dialogue')).toBe(false);
      expect(isTrackMatchingStem(sfxTrack, 'dialogue')).toBe(false);
    });

    it('matches music track by music role', () => {
      expect(isTrackMatchingStem(musicTrack, 'music')).toBe(true);
      expect(isTrackMatchingStem(dialogueTrack, 'music')).toBe(false);
      expect(isTrackMatchingStem(sfxTrack, 'music')).toBe(false);
    });

    it('matches sound effects track by role fallback', () => {
      expect(isTrackMatchingStem(sfxTrack, 'sfx')).toBe(true);
      expect(isTrackMatchingStem(dialogueTrack, 'sfx')).toBe(false);
      expect(isTrackMatchingStem(musicTrack, 'sfx')).toBe(false);
    });

    it('prioritizes explicit submix routing map over default roles', () => {
      // Re-route narration track to SFX bus
      const customRouting = {
        't-dia': 'BUS_SFX',
        't-mus': 'BUS_DIALOGUE',
      };

      expect(isTrackMatchingStem(dialogueTrack, 'sfx', customRouting)).toBe(true);
      expect(isTrackMatchingStem(dialogueTrack, 'dialogue', customRouting)).toBe(false);
      expect(isTrackMatchingStem(musicTrack, 'dialogue', customRouting)).toBe(true);
      expect(isTrackMatchingStem(musicTrack, 'music', customRouting)).toBe(false);
    });
  });

  describe('Milestone S73: Subtitle Burn-In Teletext Mux Filter (buildMuxArgs)', () => {
    it('synthesizes -vf subtitles filter with escaped paths and forces video re-encoding', () => {
      const args = buildMuxArgs('master.mp4', 'audio.aac', 'out.mp4', {
        subtitlePath: 'C:\\renders\\subtitles.ass',
      });

      expect(args).toContain('-vf');
      // Windows backslashes normalized to / and colon escaped
      const vfIndex = args.indexOf('-vf');
      expect(args[vfIndex + 1]).toBe("subtitles='C\\:/renders/subtitles.ass'");
      expect(args).not.toContain('copy'); // Must force video re-encode to burn into pixels
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
    });

    it('combines outputHeight scaling with subtitle burn-in filter in single chain', () => {
      const args = buildMuxArgs('master.mp4', 'audio.aac', 'out.mp4', {
        outputHeight: 1080,
        subtitlePath: '/tmp/subtitles.ass',
      });

      expect(args).toContain('-vf');
      const vfIndex = args.indexOf('-vf');
      expect(args[vfIndex + 1]).toBe("scale=-2:1080,subtitles='/tmp/subtitles.ass'");
    });

    it('omits -vf filter when subtitlePath is not supplied and dimensions are native', () => {
      const args = buildMuxArgs('master.mp4', 'audio.aac', 'out.mp4');
      expect(args).not.toContain('-vf');
      expect(args).toContain('-c:v');
      expect(args).toContain('copy');
    });
  });

  describe('Milestone S157: Offline Multi-Stem Audio & Atmos Synthesis Pipeline', () => {
    it('creates batch requests for all 7 audio stems with EBU R128 and ADM XML settings', () => {
      const baseReq: SequenceRenderRequest = {
        sequenceId: 'seq-master',
        outputPath: 'C:/Production/FeatureDoc.mp4',
        ebuTargetLufs: -24,
        truePeakCeilingDb: -1.0,
        exportAdmBwfXml: true,
      };

      const batch = buildStemExportBatch(baseReq, ALL_STEM_TYPES, undefined, 'wav');
      expect(batch).toHaveLength(7);

      const stemNames = batch.map((b) => b.stemType);
      expect(stemNames).toEqual([
        'master',
        'dialogue',
        'music',
        'sfx',
        'foley',
        'binaural3d',
        'atmos714',
      ]);

      const expectedPaths = [
        'C:/Production/FeatureDoc_FULLMIX.wav',
        'C:/Production/FeatureDoc_DIA.wav',
        'C:/Production/FeatureDoc_MUS.wav',
        'C:/Production/FeatureDoc_SFX.wav',
        'C:/Production/FeatureDoc_FOLEY.wav',
        'C:/Production/FeatureDoc_BINAURAL3D.wav',
        'C:/Production/FeatureDoc_ATMOS714.wav',
      ];
      expect(batch.map((b) => b.outputPath)).toEqual(expectedPaths);

      batch.forEach((req) => {
        expect(req.audioOnly).toBe(true);
        expect(req.format).toBe('wav');
        expect(req.ebuTargetLufs).toBe(-24);
        expect(req.truePeakCeilingDb).toBe(-1.0);
        expect(req.exportAdmBwfXml).toBe(true);
      });
    });

    it('generates energy-conserving Dolby Atmos 7.1.4 filter string with 12 output channels', () => {
      const gains = computeAtmos714Pan([0.0, 2.0, 1.35]);
      const panFilter = buildAtmos714PanFilter(gains, true);

      expect(panFilter).toContain('pan=7.1.4');
      const channels = panFilter.split('|').slice(1);
      expect(channels).toHaveLength(12);

      // Verify each channel identifier c0..c11 is present
      for (let i = 0; i < 12; i++) {
        expect(panFilter).toContain(`c${i}=`);
      }
    });

    it('generates 3D Binaural HRTF filter chain containing pan, adelay, and pinna notch equalizer', () => {
      const cues = computeBinauralHrtfCues([1.0, 2.0, 1.35]);
      const filterChain = buildBinauralHrtfFilter(cues, true);

      expect(filterChain).toContain('pan=stereo|');
      expect(filterChain).toContain('adelay=');
      expect(filterChain).toContain('equalizer=f=');
      expect(filterChain.split(',')).toHaveLength(3);
    });

    it('generates valid ITU-R BS.2076 ADM BWF XML metadata for multi-track sequence', () => {
      const sources: SpatialSource[] = [
        {
          sourceId: 'src_host',
          name: 'Host Narration',
          stemBus: 'speech',
          position: [0.0, 1.8, 1.35],
          gainDb: 0,
          spreadDeg: 15,
          sizeM: 0.1,
          priority: 1,
        },
        {
          sourceId: 'src_foley',
          name: 'Pen Nib Foley',
          stemBus: 'tool_foley',
          position: [-0.5, 2.0, 1.4],
          gainDb: -2,
          spreadDeg: 25,
          sizeM: 0.1,
          priority: 2,
        },
        {
          sourceId: 'src_music',
          name: 'Soundtrack Bed',
          stemBus: 'music_bed',
          position: [0.0, 3.0, 1.5],
          gainDb: -6,
          spreadDeg: 120,
          sizeM: 0.2,
          priority: 3,
        },
      ];

      const xml = generateAdmBwfXml(sources, 'Master_Documentary');

      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<ituBS2076:audioFormatExtended');
      expect(xml).toContain('audioProgrammeName="Master_Documentary"');
      expect(xml).toContain('audioObjectName="Host Narration"');
      expect(xml).toContain('audioObjectName="Pen Nib Foley"');
      expect(xml).toContain('audioObjectName="Soundtrack Bed"');
      expect(xml).toContain('</ituBS2076:audioFormatExtended>');
    });
  });
});
