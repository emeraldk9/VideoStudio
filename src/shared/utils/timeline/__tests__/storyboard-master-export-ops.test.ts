import { describe, it, expect } from 'vitest';
import {
  computeEbuR128Gain,
  validateMasterExportConfig,
  buildMasterExportFfmpegArgs,
  generateMasterPackageManifest,
  type MasterAudioStem,
  type MasterExportConfig,
} from '../storyboard-master-export-ops';

describe('storyboard-master-export-ops', () => {
  describe('computeEbuR128Gain', () => {
    it('calculates linear gain to reach target LUFS when true peak headroom is sufficient', () => {
      const result = computeEbuR128Gain(-28.0, -6.0, -23.0, -1.0);
      expect(result.gainDb).toBe(5.0);
      expect(result.scaleFactor).toBeCloseTo(1.7783, 3);
      expect(result.truePeakLimited).toBe(false);
    });

    it('clamps gain to headroom when full LUFS boost would exceed true peak ceiling', () => {
      // Desired gain = +12 dB (-35 to -23), but peak is -4 dBTP so max headroom is 3 dB (-4 to -1)
      const result = computeEbuR128Gain(-35.0, -4.0, -23.0, -1.0);
      expect(result.gainDb).toBe(3.0);
      expect(result.truePeakLimited).toBe(true);
    });

    it('attenuates loud audio to broadcast loudness standard', () => {
      const result = computeEbuR128Gain(-16.0, -0.5, -23.0, -1.0);
      expect(result.gainDb).toBe(-7.0);
      expect(result.scaleFactor).toBeLessThan(1.0);
      expect(result.truePeakLimited).toBe(false);
    });
  });

  describe('validateMasterExportConfig', () => {
    it('passes for standard 4K 60fps broadcast configuration', () => {
      const config: MasterExportConfig = {
        preset: 'prores_422_hq',
        width: 3840,
        height: 2160,
        fps: 60,
        ebuTargetLufs: -23.0,
      };
      const validation = validateMasterExportConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('catches out-of-range dimensions and invalid loudness targets', () => {
      const config: MasterExportConfig = {
        preset: 'hevc_4k',
        width: 100, // too small
        height: 50,  // too small
        fps: 200,   // too high
        ebuTargetLufs: -50, // out of range
      };
      const validation = validateMasterExportConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('buildMasterExportFfmpegArgs', () => {
    const stems: MasterAudioStem[] = [
      { name: 'voice', filepath: 'speech.wav', role: 'speech' },
      { name: 'foley', filepath: 'draw.wav', role: 'drawing_foley' },
    ];

    it('builds valid ProRes 422 HQ FFmpeg command with 10-bit color and 24-bit PCM audio', () => {
      const config: MasterExportConfig = {
        preset: 'prores_422_hq',
        width: 3840,
        height: 2160,
        fps: 60,
        ebuTargetLufs: -23.0,
      };
      const args = buildMasterExportFfmpegArgs(config, 'in.mp4', stems, 'out.mov');
      expect(args).toContain('prores_ks');
      expect(args).toContain('yuv422p10le');
      expect(args).toContain('pcm_s24le');
      expect(args.some((a) => a.includes('loudnorm=I=-23'))).toBe(true);
      expect(args[args.length - 1]).toBe('out.mov');
    });

    it('builds valid HEVC 4K FFmpeg command with AAC audio and web loudness', () => {
      const config: MasterExportConfig = {
        preset: 'hevc_4k',
        width: 3840,
        height: 2160,
        fps: 60,
        ebuTargetLufs: -14.0,
      };
      const args = buildMasterExportFfmpegArgs(config, 'in.mp4', stems, 'out.mp4');
      expect(args).toContain('libx265');
      expect(args).toContain('hvc1');
      expect(args).toContain('aac');
      expect(args.some((a) => a.includes('loudnorm=I=-14'))).toBe(true);
    });

    it('properly disables audio when no audio stems are provided', () => {
      const config: MasterExportConfig = { preset: 'h264_web' };
      const args = buildMasterExportFfmpegArgs(config, 'in.mp4', [], 'out.mp4');
      expect(args).toContain('-an');
    });
  });

  describe('generateMasterPackageManifest', () => {
    it('creates a serializable master manifest object with stem routing details', () => {
      const stems: MasterAudioStem[] = [
        { name: 'voice', filepath: 'speech.wav', role: 'speech', gainDb: 0 },
      ];
      const manifest = generateMasterPackageManifest(
        { preset: 'prores_422_hq', projectName: 'demo_anim' },
        3,
        32.5,
        stems
      );
      expect(manifest.projectName).toBe('demo_anim');
      expect(manifest.format).toBe('QuickTime / MOV');
      expect(manifest.sceneCount).toBe(3);
      expect(manifest.totalDurationSec).toBe(32.5);
    });
  });
});
