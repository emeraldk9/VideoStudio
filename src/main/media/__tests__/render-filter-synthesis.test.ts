import { describe, expect, it } from 'vitest';
import {
  buildAudioFilterChain,
  buildColorFilterChain,
  buildWindowedColorFilterChain,
  DEFAULT_COLOR_GRADING,
  DEFAULT_FILM_EMULATION_SETTINGS,
  DEFAULT_LENS_OPTICS_SETTINGS,
  DEFAULT_VIDEO_STABILIZER_SETTINGS,
  DEFAULT_PORTRAIT_MATTING_SETTINGS,
  DEFAULT_MASK_SETTINGS,
  DEFAULT_NOISE_GATE_SETTINGS,
  DEFAULT_REVERB_SETTINGS,
  type ClipEffects,
  type AudioEqualizerSettings,
  type AudioCompressorSettings,
  type AudioReverbSettings,
  type ClipNoiseGateSettings,
  type AudioPitchSettings,
  type AudioPanSettings,
  type AudioIsolationSettings,
  type MultibandDenoiserSettings,
  type ClipLutSettings,
  type HdrToneMappingSettings,
  type ClipLensOpticsSettings,
  type VideoStabilizerSettings,
  type PortraitMattingSettings,
  type ChromaKeySettings,
  type ClipMaskSettings,
  type MultiCamClipSettings,
  type SequenceClip,
} from '../../../shared';
import { buildAudioTimelineGraph, type AudioTimelineOptions } from '../audio-timeline';
import type { DubSegmentInput } from '../audio-layout';
import { buildAlphaSegmentArgs } from '../sequence-normalize';
import { SOFTWARE_ENCODER } from '../render-encoder';

describe('End-to-End FFmpeg Render Engine Full-Filter Synthesis (Milestone S66)', () => {
  describe('Audio Filter Chain Synthesis (buildAudioFilterChain)', () => {
    it('returns empty string when effects are undefined or neutral', () => {
      expect(buildAudioFilterChain(undefined)).toBe('');
      expect(buildAudioFilterChain({})).toBe('');
      expect(buildAudioFilterChain({ equalizer: { enabled: false, low: { frequencyHz: 100, gainDb: 0 }, mid: { frequencyHz: 2500, gainDb: 0, q: 1 }, high: { frequencyHz: 8000, gainDb: 0 } } })).toBe('');
    });

    it('synthesizes 3-band parametric equalizer filter', () => {
      const equalizer: AudioEqualizerSettings = {
        enabled: true,
        low: { frequencyHz: 120, gainDb: 4.5 },
        mid: { frequencyHz: 2400, gainDb: -2.0, q: 1.2 },
        high: { frequencyHz: 9000, gainDb: 3.0 },
      };
      const chain = buildAudioFilterChain({ equalizer });
      expect(chain).toContain('equalizer=f=120:t=s:w=1:g=4.5');
      expect(chain).toContain('equalizer=f=2400:t=q:w=1.20:g=-2.0');
      expect(chain).toContain('equalizer=f=9000:t=s:w=1:g=3.0');
    });

    it('synthesizes dynamic range compressor filter', () => {
      const compressor: AudioCompressorSettings = {
        enabled: true,
        threshold: -18,
        ratio: 4,
        attack: 0.015,
        release: 0.15,
        knee: 3,
        makeupGain: 4,
      };
      const chain = buildAudioFilterChain({ compressor });
      expect(chain).toContain('acompressor=threshold=-18dB:ratio=4:attack=15:release=150:makeup=4dB:knee=3dB');
    });

    it('synthesizes audio noise gate and vocal de-esser', () => {
      const noiseGate: ClipNoiseGateSettings = {
        ...DEFAULT_NOISE_GATE_SETTINGS,
        enabled: true,
        threshold: -32,
        attackMs: 5,
        holdMs: 20,
        releaseMs: 80,
        rangeDb: -30,
        deEsserEnabled: true,
        deEsserFreq: 6500,
        deEsserAmount: 6,
        deHummerMode: '60hz',
      };
      const chain = buildAudioFilterChain({ noiseGate });
      expect(chain).toContain('equalizer=f=60:width_type=q:w=6:g=-24');
      expect(chain).toContain('equalizer=f=120:width_type=q:w=6:g=-18');
      expect(chain).toContain('equalizer=f=6500:width_type=q:w=2.5:g=-6.0');
    });

    it('synthesizes reverb and stereo delay filters', () => {
      const reverb: AudioReverbSettings = {
        ...DEFAULT_REVERB_SETTINGS,
        enabled: true,
        space: 'cathedral',
        decaySeconds: 3.5,
        wetLevel: 0.35,
        dryLevel: 0.8,
        preDelayMs: 25,
      };
      const chain = buildAudioFilterChain({ reverb });
      expect(chain).toContain('aecho=0.80:0.35:');
    });

    it('synthesizes pitch shifter filter', () => {
      const pitch: AudioPitchSettings = {
        enabled: true,
        semitones: 3,
        cents: 20,
        preserveFormants: true,
      };
      const chain = buildAudioFilterChain({ pitch });
      expect(chain).toContain('rubberband=pitch=');
      expect(chain).toContain('formant=preserved');
    });

    it('synthesizes stereo panner filter', () => {
      const pan: AudioPanSettings = {
        enabled: true,
        pan: -0.6,
        law: 'equal_power_3db',
        spatial3d: { enabled: false, azimuthDeg: 0, elevationDeg: 0, distance: 1 },
      };
      const chain = buildAudioFilterChain({ pan });
      expect(chain).toContain('pan=stereo|c0=');
    });

    it('synthesizes AI vocal isolation filter', () => {
      const audioIsolation: AudioIsolationSettings = {
        enabled: true,
        mode: 'vocal_isolate',
        isolationStrength: 0.8,
        speechClarity: 0.5,
        levelerEnabled: true,
        targetLufs: -18,
        deReverbAmount: 0,
      };
      const chain = buildAudioFilterChain({ audioIsolation });
      expect(chain).toContain('highpass=f=80');
      expect(chain).toContain('afftdn=');
      expect(chain).toContain('bandpass=f=1800');
      expect(chain).toContain('speechnorm=');
    });

    it('synthesizes multiband denoiser with de-clicking and mains de-hummer', () => {
      const multibandDenoiser: MultibandDenoiserSettings = {
        enabled: true,
        lowBandReductionDb: 12,
        lowMidBandReductionDb: 10,
        highMidBandReductionDb: 8,
        highBandReductionDb: 6,
        deClickEnabled: true,
        deClickSensitivity: 7,
        deHumMode: '50hz_mains',
        deHumHarmonics: 3,
      };
      const chain = buildAudioFilterChain({ multibandDenoiser });
      expect(chain).toContain('adeclick=threshold=4.0:burst=2');
      expect(chain).toContain('equalizer=f=50:width_type=q:w=10:g=-24');
      expect(chain).toContain('equalizer=f=100:width_type=q:w=10:g=-24');
      expect(chain).toContain('equalizer=f=150:width_type=q:w=10:g=-24');
      expect(chain).toContain('afftdn=');
    });

    it('combines full audio signal chain in deterministic post-production order', () => {
      const effects: ClipEffects = {
        audioIsolation: {
          enabled: true,
          mode: 'vocal_isolate',
          isolationStrength: 0.5,
          speechClarity: 0,
          levelerEnabled: false,
          targetLufs: -20,
          deReverbAmount: 0,
        },
        equalizer: {
          enabled: true,
          low: { frequencyHz: 100, gainDb: 2 },
          mid: { frequencyHz: 2500, gainDb: 0, q: 1 },
          high: { frequencyHz: 8000, gainDb: 4 },
        },
        compressor: {
          enabled: true,
          threshold: -20,
          ratio: 3,
          attack: 0.02,
          release: 0.1,
          knee: 2,
          makeupGain: 3,
        },
        reverb: {
          ...DEFAULT_REVERB_SETTINGS,
          enabled: true,
          space: 'room',
          decaySeconds: 1.2,
          wetLevel: 0.2,
          dryLevel: 0.9,
          preDelayMs: 10,
        },
      };

      const chain = buildAudioFilterChain(effects);
      const highpassPos = chain.indexOf('highpass=');
      const eqPos = chain.indexOf('equalizer=f=100');
      const compPos = chain.indexOf('acompressor=');
      const reverbPos = chain.indexOf('aecho=');

      // Restoration -> EQ -> Compressor -> Reverb
      expect(highpassPos).toBeGreaterThanOrEqual(0);
      expect(eqPos).toBeGreaterThan(highpassPos);
      expect(compPos).toBeGreaterThan(eqPos);
      expect(reverbPos).toBeGreaterThan(compPos);
    });
  });

  describe('Video Filter Chain Synthesis (buildColorFilterChain)', () => {
    it('returns empty string when effects are undefined or neutral', () => {
      expect(buildColorFilterChain(undefined)).toBe('');
      expect(buildColorFilterChain({})).toBe('');
      expect(buildColorFilterChain({ colorGrade: DEFAULT_COLOR_GRADING })).toBe('');
    });

    it('synthesizes 3D LUT filter', () => {
      const lut: ClipLutSettings = {
        enabled: true,
        preset: 'teal_orange',
        intensity: 0.8,
      };
      const chain = buildColorFilterChain({ lut });
      expect(chain).toContain('colorbalance=');

      const customLut: ClipLutSettings = {
        enabled: true,
        preset: 'teal_orange',
        intensity: 1.0,
        customCubePath: 'C:/LUTs/film_look.cube',
      };
      const customChain = buildColorFilterChain({ lut: customLut });
      expect(customChain).toContain("lut3d=file='C:/LUTs/film_look.cube'");
    });

    it('synthesizes HDR tone mapping filter', () => {
      const hdrToneMapping: HdrToneMappingSettings = {
        enabled: true,
        curve: 'aces_filmic',
        targetPeakNits: 1000,
        desaturation: 0.25,
        exposureCompensationEv: 1.0,
        falseColorEnabled: false,
      };
      const chain = buildColorFilterChain({ hdrToneMapping });
      expect(chain).toContain('tonemap=tonemap=hable:desat=0.25:peak=1000');
    });

    it('synthesizes lens optics & chromatic aberration filter', () => {
      const lensOptics: ClipLensOpticsSettings = {
        ...DEFAULT_LENS_OPTICS_SETTINGS,
        enabled: true,
        distortionK1: -0.05,
        distortionK2: 0.02,
        anamorphicRatio: 1.33,
        chromaticAberrationPx: 3,
        vignetteEnabled: true,
        vignetteStrength: 0.4,
      };
      const chain = buildColorFilterChain({ lensOptics });
      expect(chain).toContain('lenscorrection=');
      expect(chain).toContain('scale=iw*1.33:ih');
      expect(chain).toContain('chromashift=cbh=3:crh=-3:cbv=0:crv=0');
      expect(chain).toContain('vignette=');
    });

    it('synthesizes video stabilization deshake filter', () => {
      const stabilizer: VideoStabilizerSettings = {
        ...DEFAULT_VIDEO_STABILIZER_SETTINGS,
        enabled: true,
        shakiness: 6,
        autoCropZoom: 0.05,
      };
      const chain = buildColorFilterChain({ stabilizer });
      expect(chain).toContain('deshake=');
      expect(chain).toContain('scale=iw*1.050:ih*1.050');
    });

    it('synthesizes AI portrait matting and spill suppression filter', () => {
      const matting: PortraitMattingSettings = {
        ...DEFAULT_PORTRAIT_MATTING_SETTINGS,
        enabled: true,
        edgeBlur: 4,
        edgeChoke: 2,
        spillSuppression: 0.75,
      };
      const chain = buildColorFilterChain({ matting });
      expect(chain).toContain('gblur=sigma=2.0');
      expect(chain).toContain('despill=type=green:mix=0.75');
    });

    it('synthesizes chroma key filter', () => {
      const chromaKey: ChromaKeySettings = {
        enabled: true,
        keyColorHex: '#00ff00',
        similarity: 0.35,
        smoothness: 0.1,
        spillSuppression: 0.6,
      };
      const chain = buildColorFilterChain({ chromaKey });
      expect(chain).toContain('chromakey=color=0x00ff00:similarity=0.350:blend=0.100');
      expect(chain).toContain('despill=type=green:mix=0.60');
    });

    it('synthesizes video mask crop filter with respect to sequence dimensions', () => {
      const mask: ClipMaskSettings = {
        ...DEFAULT_MASK_SETTINGS,
        enabled: true,
        shape: 'rectangle',
        x: 0.5,
        y: 0.5,
        width: 0.8,
        height: 0.6,
        feather: 0,
        invert: false,
      };
      const chain = buildColorFilterChain({ mask }, { width: 1920, height: 1080 });
      // 1920 * 0.8 = 1536, 1080 * 0.6 = 648
      expect(chain).toContain('crop=1536:648:192:216');
    });

    it('combines full multi-filter video stack in proper signal flow order', () => {
      const effects: ClipEffects = {
        colorGrade: {
          ...DEFAULT_COLOR_GRADING,
          lift: { r: 0.05, g: 0, b: -0.05, luma: 0 },
        },
        lut: {
          enabled: true,
          preset: 'kodak_vision3',
          intensity: 0.7,
        },
        filmEmulation: {
          ...DEFAULT_FILM_EMULATION_SETTINGS,
          enabled: true,
          preset: 'vintage_16mm',
          grain: {
            ...DEFAULT_FILM_EMULATION_SETTINGS.grain,
            enabled: true,
            intensity: 0.5,
          },
        },
      };

      const chain = buildColorFilterChain(effects);
      const gradePos = chain.indexOf('colorbalance=');
      const lutPos = chain.indexOf('colorbalance=rh=');
      const grainPos = chain.indexOf('noise=');

      expect(gradePos).toBeGreaterThanOrEqual(0);
      expect(lutPos).toBeGreaterThan(gradePos);
      expect(grainPos).toBeGreaterThan(lutPos);
    });
  });

  describe('Audio Timeline Graph Integration (buildAudioTimelineGraph)', () => {
    it('injects segment.audioFilter into per-segment filter complex chain', () => {
      const segments: DubSegmentInput[] = [
        {
          audioPath: 'C:/audio/dialogue.wav',
          offsetSeconds: 1.0,
          volume: 1.0,
          durationSeconds: 4.0,
          audioFilter: 'equalizer=f=2000:t=q:w=1:g=3.0,acompressor=threshold=-18dB:ratio=4:attack=20:release=200:makeup=2dB:knee=2dB',
        },
        {
          audioPath: 'C:/audio/music.mp3',
          offsetSeconds: 0.0,
          volume: 0.8,
          durationSeconds: 10.0,
        },
      ];

      const options: AudioTimelineOptions = {
        durationSeconds: 10.0,
        format: 'wav',
      };

      const graph = buildAudioTimelineGraph(segments, options);

      // s0 should contain the synthesized audio filter chain
      expect(graph).toContain('equalizer=f=2000:t=q:w=1:g=3.0,acompressor=threshold=-18dB:ratio=4:attack=20:release=200:makeup=2dB:knee=2dB');
      // s0 should still have proper delay and amix labeling
      expect(graph).toContain('adelay=1000:all=1[s0]');
      // s1 should remain clean without audio filter
      expect(graph).toContain('volume=0.800,adelay=0:all=1[s1]');
      // Bus summation with normalize=0
      expect(graph).toContain('amix=inputs=3:duration=first:dropout_transition=0:normalize=0');
    });
  });

  describe('Adjustment Layer Windowed Filter Chain (buildWindowedColorFilterChain)', () => {
    it('applies between(t, start, end) to synthesized LUT, color grade, and video effects', () => {
      const effects: ClipEffects = {
        lut: {
          enabled: true,
          preset: 'bleach_bypass',
          intensity: 0.9,
        },
        videoEffect: {
          id: 'vfx-1',
          presetId: 'camera_shake',
          label: 'Shake',
          category: 'trending',
          intensity: 80,
          speed: 50,
        },
      };

      const windowed = buildWindowedColorFilterChain(effects, 2.0, 5.5, { width: 1920, height: 1080 });
      expect(windowed).toContain(":enable='between(t,2.000,5.500)'");
      expect(windowed).toContain('eq=contrast=');
      expect(windowed).toContain('crop=in_w-20:in_h-20');
    });
  });

  describe('MultiCam Angle Resolution for Render Preparation', () => {
    it('provides multiCam angles with filePath and syncOffsetFrames for source switching', () => {
      const multiCam: MultiCamClipSettings = {
        enabled: true,
        activeAngleIndex: 1,
        angles: [
          { id: 'angle-1', name: 'Angle 1', cameraLabel: 'Cam A - Wide', colorTag: 'blue', syncOffsetFrames: 0, filePath: 'C:/media/cam_a.mp4' },
          { id: 'angle-2', name: 'Angle 2', cameraLabel: 'Cam B - Tight', colorTag: 'green', syncOffsetFrames: 12, filePath: 'C:/media/cam_b.mp4' },
        ],
        audioFollowsVideo: true,
        syncMethod: 'timecode',
      };

      const clip: SequenceClip = {
        id: 'mc-clip-1',
        sequenceId: 'seq-1',
        trackId: 'track-v1',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'MultiCam Angle 2',
        filePath: 'C:/media/cam_a.mp4',
        startFrames: 100,
        durationFrames: 150,
        sourceInFrames: 50,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        effects: { multiCam },
      };

      // Angle 1 active: should resolve to Cam B and shift sourceInFrames by +12
      const activeAngle = clip.effects?.multiCam?.angles[clip.effects.multiCam.activeAngleIndex];
      expect(activeAngle?.filePath).toBe('C:/media/cam_b.mp4');
      expect(activeAngle?.syncOffsetFrames).toBe(12);

      const effectiveSourceInFrames = (clip.sourceInFrames ?? 0) + (activeAngle?.syncOffsetFrames ?? 0);
      expect(effectiveSourceInFrames).toBe(62);
    });
  });

  describe('Split-Screen & Video Collage Render Synthesis (Milestone S75)', () => {
    it('synthesizes aspect-crop-cover scale and crop filters when cellRect is specified', () => {
      const args = buildAlphaSegmentArgs('input.mp4', 'output.mov', {
        still: false,
        width: 1920,
        height: 1080,
        fps: 30,
        encoder: SOFTWARE_ENCODER,
        cellRect: { widthPct: 0.5, heightPct: 1.0 }, // Left half
      });

      const filterArgIndex = args.indexOf('-vf');
      expect(filterArgIndex).toBeGreaterThan(-1);
      const filterStr = args[filterArgIndex + 1];
      // 1920 * 0.5 = 960 width, 1080 height
      expect(filterStr).toContain('scale=960:1080:force_original_aspect_ratio=increase');
      expect(filterStr).toContain('crop=960:1080');
      expect(filterStr).toContain('format=yuva420p');
    });

    it('falls back to letterbox padding when cellRect is omitted', () => {
      const args = buildAlphaSegmentArgs('input.mp4', 'output.mov', {
        still: false,
        width: 1920,
        height: 1080,
        fps: 30,
        encoder: SOFTWARE_ENCODER,
        transformScale: 0.5,
      });

      const filterArgIndex = args.indexOf('-vf');
      expect(filterArgIndex).toBeGreaterThan(-1);
      const filterStr = args[filterArgIndex + 1];
      expect(filterStr).toContain('scale=960:540:force_original_aspect_ratio=decrease');
      expect(filterStr).toContain('pad=960:540');
    });
  });
});

