import { describe, expect, it } from 'vitest';
import {
  benchmarkTimelinePerformance,
  evaluateTimelineStress,
  formatDiagnosticsReport,
  probeHardwareCapabilities,
  sampleProcessMemory,
} from '../diagnostics-telemetry-ops';
import type { RenderEncoderInfo } from '../../../types/sequence';

describe('diagnostics-telemetry-ops (Milestone S178: Deep Diagnostics HUD & Performance Stress Benchmarks)', () => {
  describe('probeHardwareCapabilities', () => {
    it('detects NVIDIA GPU backend with NVDEC and Direct3D11 acceleration', () => {
      const encoderInfo: RenderEncoderInfo = {
        encoderId: 'h264_nvenc',
        label: 'NVIDIA NVENC (GPU)',
        hardware: true,
        gpuVendor: 'NVIDIA',
        hwaccelId: 'd3d11va',
      };
      const hw = probeHardwareCapabilities(encoderInfo, 'ANGLE (NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)');

      expect(hw.gpuVendor).toBe('nvidia');
      expect(hw.vendorLabel).toContain('NVIDIA');
      expect(hw.direct3d11va).toBe(true);
      expect(hw.nvdec).toBe(true);
      expect(hw.codecsSupported.hevc).toBe(true);
      expect(hw.codecsSupported.av1).toBe(true);
      expect(hw.vramBudgetMb).toBe(8192);
      expect(hw.vramPressureTier).toBe('nominal');
    });

    it('detects Intel Quick Sync Video (QSV)', () => {
      const encoderInfo: RenderEncoderInfo = {
        encoderId: 'h264_qsv',
        label: 'Intel Quick Sync Video',
        hardware: true,
        gpuVendor: 'Intel',
        hwaccelId: 'qsv',
      };
      const hw = probeHardwareCapabilities(encoderInfo, 'Intel Iris Xe Graphics');

      expect(hw.gpuVendor).toBe('intel');
      expect(hw.direct3d11va).toBe(true);
      expect(hw.codecsSupported.h264).toBe(true);
    });

    it('detects Apple Silicon VideoToolbox', () => {
      const encoderInfo: RenderEncoderInfo = {
        encoderId: 'h264_videotoolbox',
        label: 'Apple VideoToolbox',
        hardware: true,
        gpuVendor: 'Apple',
        hwaccelId: 'videotoolbox',
      };
      const hw = probeHardwareCapabilities(encoderInfo, 'Apple M3 Pro');

      expect(hw.gpuVendor).toBe('apple');
      expect(hw.accelerationBackend).toContain('VideoToolbox');
    });

    it('identifies CPU software fallback when hardware is disabled', () => {
      const encoderInfo: RenderEncoderInfo = {
        encoderId: 'libx264',
        label: 'CPU Software (x264)',
        hardware: false,
        gpuVendor: 'CPU',
        hwaccelId: null,
      };
      const hw = probeHardwareCapabilities(encoderInfo, 'Google SwiftShader');

      expect(hw.gpuVendor).toBe('software');
      expect(hw.direct3d11va).toBe(false);
      expect(hw.nvdec).toBe(false);
      expect(hw.codecsSupported.hevc).toBe(false);
    });
  });

  describe('sampleProcessMemory', () => {
    it('accurately parses mock memory stats into MB and percentage', () => {
      const mockMemory = {
        usedJSHeapSize: 104_857_600, // 100 MB
        totalJSHeapSize: 209_715_200, // 200 MB
        jsHeapSizeLimit: 1_073_741_824, // 1024 MB
      };
      const mem = sampleProcessMemory(mockMemory);

      expect(mem.usedJSHeapSizeMb).toBe(100);
      expect(mem.totalJSHeapSizeMb).toBe(200);
      expect(mem.jsHeapSizeLimitMb).toBe(1024);
      expect(mem.heapUtilizationPercent).toBe(10);
      expect(mem.leakRiskLevel).toBe('stable');
    });

    it('flags warning and critical risk levels when heap usage approaches ceiling', () => {
      const warningMem = sampleProcessMemory({
        usedJSHeapSize: 700_000_000,
        totalJSHeapSize: 800_000_000,
        jsHeapSizeLimit: 1_000_000_000, // 70%
      });
      expect(warningMem.leakRiskLevel).toBe('warning');

      const criticalMem = sampleProcessMemory({
        usedJSHeapSize: 900_000_000,
        totalJSHeapSize: 950_000_000,
        jsHeapSizeLimit: 1_000_000_000, // 90%
      });
      expect(criticalMem.leakRiskLevel).toBe('critical');
    });
  });

  describe('evaluateTimelineStress', () => {
    it('evaluates timeline culling efficiency and health under dense clip load', () => {
      const metrics = evaluateTimelineStress(120, 8, 24, 40);

      expect(metrics.clipCount).toBe(120);
      expect(metrics.culledClipsCount).toBe(96);
      expect(metrics.cullEfficiencyPercent).toBe(80);
      expect(metrics.audioPeakCacheEntries).toBe(40);
      expect(metrics.status).toBe('optimal');
      expect(metrics.benchmarkScore).toBeGreaterThanOrEqual(85);
    });

    it('detects heavy load when excessive non-culled clips are visible', () => {
      const heavy = evaluateTimelineStress(600, 20, 80, 200);

      expect(heavy.virtualizedClipsVisible).toBe(80);
      expect(heavy.benchmarkScore).toBeLessThan(85);
    });
  });

  describe('benchmarkTimelinePerformance', () => {
    it('executes a high-density 200-clip stress simulation within 60fps frame budget (<16.6ms)', () => {
      const result = benchmarkTimelinePerformance(200, 16);

      expect(result.clipCount).toBe(200);
      expect(result.trackCount).toBe(16);
      expect(result.processingTimeMs).toBeLessThan(16.6); // Under 16.6ms (60fps)
      expect(result.passed).toBe(true);
      expect(result.estFpsAt60Hz).toBe(60);
      expect(result.cullEfficiencyPercent).toBeGreaterThan(50);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });
  });

  describe('formatDiagnosticsReport', () => {
    it('formats a complete telemetry diagnostic report text block', () => {
      const hw = probeHardwareCapabilities({
        encoderId: 'h264_nvenc',
        label: 'NVIDIA NVENC',
        hardware: true,
        gpuVendor: 'NVIDIA',
      });
      const mem = sampleProcessMemory({
        usedJSHeapSize: 150_000_000,
        totalJSHeapSize: 250_000_000,
        jsHeapSizeLimit: 2_000_000_000,
      });
      const stress = evaluateTimelineStress(100, 8, 20, 30);

      const report = formatDiagnosticsReport(hw, mem, stress);

      expect(report).toContain('VideoStudio System Diagnostics');
      expect(report).toContain('GPU Acceleration');
      expect(report).toContain('Process Heap');
      expect(report).toContain('Timeline Density');
      expect(report).toContain('LRU Memory Pool');
    });
  });
});
