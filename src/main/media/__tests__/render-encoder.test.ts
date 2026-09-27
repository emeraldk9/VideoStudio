import { describe, expect, it } from 'vitest';
import {
  ACCELERATION_TO_ENCODER,
  createEncoderInfo,
  ENCODER_LABELS,
  ENCODER_METADATA,
  hevcEncodeArgs,
  pickRenderEncoder,
  renderEncoderCandidates,
  resolveHevcEncoderId,
  SOFTWARE_ENCODER,
  videoEncodeArgs,
} from '../render-encoder';
import {
  encoderQualityArgs,
  HEVC_ENCODER_LADDER,
  hevcQualityArgs,
  VIDEO_ENCODER_LADDER,
} from '../watermark-args';
import type { FfmpegCapabilities } from '../watermark-capabilities';

describe('Milestone S158: GPU Hardware-Accelerated Encoding & Pro Codec Profiles', () => {
  describe('Encoder Ladders & Capability Probing', () => {
    it('includes Windows Media Foundation in VIDEO_ENCODER_LADDER', () => {
      expect(VIDEO_ENCODER_LADDER).toContain('h264_mf');
      expect(VIDEO_ENCODER_LADDER.indexOf('h264_mf')).toBeLessThan(VIDEO_ENCODER_LADDER.indexOf('libx264'));
    });

    it('defines HEVC_ENCODER_LADDER with hardware encoders and libx265 software floor', () => {
      expect(HEVC_ENCODER_LADDER).toEqual([
        'hevc_nvenc',
        'hevc_qsv',
        'hevc_amf',
        'hevc_videotoolbox',
        'hevc_mf',
        'libx265',
      ]);
    });

    it('synthesizes quality arguments for h264_mf via MediaFoundation rate_control', () => {
      const args = encoderQualityArgs('h264_mf', { crf: 18 });
      expect(args).toEqual(['-rate_control', 'quality', '-quality', '64']);
    });

    it('synthesizes quality arguments for HEVC encoders', () => {
      const nvencArgs = hevcQualityArgs('hevc_nvenc', { crf: 20 });
      expect(nvencArgs).toContain('-preset');
      expect(nvencArgs).toContain('p6');
      expect(nvencArgs).toContain('-rc');
      expect(nvencArgs).toContain('vbr');
      expect(nvencArgs).toContain('-cq');

      const x265Args = hevcQualityArgs('libx265', { crf: 23 });
      expect(x265Args).toEqual(['-preset', 'medium', '-crf', '23']);

      const qsvArgs = hevcQualityArgs('hevc_qsv', { crf: 20 });
      expect(qsvArgs).toContain('-global_quality');

      const mfArgs = hevcQualityArgs('hevc_mf', { crf: 20 });
      expect(mfArgs).toEqual(['-rate_control', 'quality', '-quality', '60']);
    });
  });

  describe('Hardware Acceleration Telemetry & Metadata (createEncoderInfo)', () => {
    it('provides baseline telemetry for SOFTWARE_ENCODER', () => {
      expect(SOFTWARE_ENCODER.encoderId).toBe('libx264');
      expect(SOFTWARE_ENCODER.hardware).toBe(false);
      expect(SOFTWARE_ENCODER.speedupMultiplier).toBe(1.0);
      expect(SOFTWARE_ENCODER.gpuVendor).toBe('CPU');
    });

    it('maps NVIDIA NVENC with estimated 6.5x speedup', () => {
      const info = createEncoderInfo('h264_nvenc');
      expect(info.label).toBe('NVENC');
      expect(info.hardware).toBe(true);
      expect(info.gpuVendor).toBe('NVIDIA');
      expect(info.speedupMultiplier).toBe(6.5);
    });

    it('maps Intel Quick Sync with estimated 4.8x speedup', () => {
      const info = createEncoderInfo('h264_qsv');
      expect(info.label).toBe('Quick Sync');
      expect(info.hardware).toBe(true);
      expect(info.gpuVendor).toBe('Intel');
      expect(info.speedupMultiplier).toBe(4.8);
    });

    it('maps AMD AMF with estimated 4.5x speedup', () => {
      const info = createEncoderInfo('h264_amf');
      expect(info.label).toBe('AMF');
      expect(info.hardware).toBe(true);
      expect(info.gpuVendor).toBe('AMD');
      expect(info.speedupMultiplier).toBe(4.5);
    });

    it('maps Apple VideoToolbox with estimated 5.5x speedup', () => {
      const info = createEncoderInfo('h264_videotoolbox');
      expect(info.label).toBe('VideoToolbox');
      expect(info.hardware).toBe(true);
      expect(info.gpuVendor).toBe('Apple');
      expect(info.speedupMultiplier).toBe(5.5);
    });

    it('maps Windows MediaFoundation with estimated 3.8x speedup', () => {
      const info = createEncoderInfo('h264_mf');
      expect(info.label).toBe('MediaFoundation');
      expect(info.hardware).toBe(true);
      expect(info.gpuVendor).toBe('Microsoft');
      expect(info.speedupMultiplier).toBe(3.8);
    });
  });

  describe('Encoder Selection & Candidate Ladders', () => {
    const mockCapabilities: FfmpegCapabilities = {
      encoders: new Set(['h264_nvenc', 'h264_mf', 'libx264', 'libx265']),
      filters: new Set(['scale']),
      hwaccels: new Set(['cuda', 'd3d11va']),
      preferredEncoder: 'h264_nvenc',
      hasDelogo: true,
      hasRemovelogo: true,
    };

    it('returns only SOFTWARE_ENCODER when acceleration is off', () => {
      expect(pickRenderEncoder(mockCapabilities, 'off')).toEqual(SOFTWARE_ENCODER);
      expect(renderEncoderCandidates(mockCapabilities, 'off')).toEqual([SOFTWARE_ENCODER]);
    });

    it('picks preferred hardware encoder under auto mode', () => {
      const picked = pickRenderEncoder(mockCapabilities, 'auto');
      expect(picked.encoderId).toBe('h264_nvenc');
      expect(picked.hardware).toBe(true);
      expect(picked.gpuVendor).toBe('NVIDIA');
    });

    it('prioritizes specific acceleration mode when requested and available', () => {
      const pickedMf = pickRenderEncoder(mockCapabilities, 'mediafoundation');
      expect(pickedMf.encoderId).toBe('h264_mf');
      expect(pickedMf.label).toBe('MediaFoundation');
      expect(pickedMf.gpuVendor).toBe('Microsoft');

      const candidatesMf = renderEncoderCandidates(mockCapabilities, 'mediafoundation');
      expect(candidatesMf).toHaveLength(2);
      expect(candidatesMf[0].encoderId).toBe('h264_mf');
      expect(candidatesMf[1].encoderId).toBe('libx264');
    });

    it('falls back to SOFTWARE_ENCODER when requested specific hardware is not in capabilities', () => {
      const pickedQsv = pickRenderEncoder(mockCapabilities, 'qsv');
      // mockCapabilities has no h264_qsv; falls back to preferredEncoder
      expect(pickedQsv.encoderId).toBe('h264_nvenc');

      const candidatesQsv = renderEncoderCandidates(mockCapabilities, 'qsv');
      expect(candidatesQsv).toEqual([SOFTWARE_ENCODER]);
    });
  });

  describe('HEVC Hardware-Accelerated Encode Arguments (hevcEncodeArgs)', () => {
    it('maps base h264 hardware encoder to corresponding hevc hardware encoder', () => {
      expect(resolveHevcEncoderId('h264_nvenc')).toBe('hevc_nvenc');
      expect(resolveHevcEncoderId('h264_qsv')).toBe('hevc_qsv');
      expect(resolveHevcEncoderId('h264_amf')).toBe('hevc_amf');
      expect(resolveHevcEncoderId('h264_videotoolbox')).toBe('hevc_videotoolbox');
      expect(resolveHevcEncoderId('libx264')).toBe('libx265');
    });

    it('synthesizes hardware HEVC args when hardware encoder is provided', () => {
      const nvencInfo = createEncoderInfo('h264_nvenc');
      const args = hevcEncodeArgs({ encoder: nvencInfo, quality: 'high' });

      expect(args).toContain('-c:v');
      expect(args).toContain('hevc_nvenc');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv420p10le');
      expect(args).toContain('-preset');
      expect(args).toContain('p6');
    });

    it('synthesizes software libx265 args when encoder is software or absent', () => {
      const args = hevcEncodeArgs({ quality: 'good' });

      expect(args).toEqual([
        '-c:v',
        'libx265',
        '-crf',
        '23',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p10le',
      ]);
    });
  });
});
