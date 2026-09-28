import { describe, expect, it } from 'vitest';

import {
  calculateCombinedGainReduction,
  formatDragDeltaBadge,
  formatHardwarePlaybackTelemetry,
  gainReductionToMeterPercent,
} from '../nle-hud-ops';

describe('Milestone S176 — NLE HUD & Audio Gain Reduction Ops', () => {
  describe('formatHardwarePlaybackTelemetry', () => {
    it('formats 60fps playback telemetry accurately', () => {
      const result = formatHardwarePlaybackTelemetry({
        fps: 60.0,
        hardwareBackend: 'D3D11 / NVDEC HW',
        droppedFrames: 0,
        memoryBounded: true,
      });

      expect(result.fpsText).toBe('60.0 FPS');
      expect(result.backendText).toBe('D3D11 / NVDEC HW');
      expect(result.dropsText).toBe('0 Drops');
      expect(result.isSmooth).toBe(true);
    });

    it('flags unsmooth playback when frames are dropped', () => {
      const result = formatHardwarePlaybackTelemetry({
        fps: 45.2,
        hardwareBackend: 'WebGL2 HW',
        droppedFrames: 7,
        memoryBounded: true,
      });

      expect(result.dropsText).toBe('7 Drops');
      expect(result.isSmooth).toBe(false);
    });
  });

  describe('calculateCombinedGainReduction', () => {
    it('returns 0 when compressor is disabled and no ducking exists', () => {
      const gr = calculateCombinedGainReduction(-12, null, null);
      expect(gr).toBe(0);
    });

    it('calculates compressor gain reduction when signal exceeds threshold', () => {
      const gr = calculateCombinedGainReduction(
        0, // signal at 0dB (peak)
        {
          enabled: true,
          threshold: -20,
          ratio: 4,
          knee: 0,
          attack: 0.01,
          release: 0.1,
          makeupGain: 0,
        },
        null,
      );
      // With threshold -20 and ratio 4:
      // output = -20 + (0 - (-20)) / 4 = -15 dB
      // attenuation = 0 - (-15) = 15 dB
      expect(gr).toBeCloseTo(15, 1);
    });

    it('takes maximum of compressor reduction and ducking reduction', () => {
      const gr = calculateCombinedGainReduction(
        -10,
        {
          enabled: true,
          threshold: -20,
          ratio: 2,
          knee: 0,
          attack: 0.01,
          release: 0.1,
          makeupGain: 0,
        },
        -8, // ducking active at -8 dB
      );
      // Comp reduction = 5 dB (-10 - (-20 + 5) = 5)
      // Duck reduction = 8 dB
      expect(gr).toBe(8);
    });
  });

  describe('gainReductionToMeterPercent', () => {
    it('maps 0 dB to 0%', () => {
      expect(gainReductionToMeterPercent(0)).toBe(0);
    });

    it('maps 12 dB out of 24 dB to 50%', () => {
      expect(gainReductionToMeterPercent(12, 24)).toBe(50);
    });

    it('clamps reductions exceeding maxDb to 100%', () => {
      expect(gainReductionToMeterPercent(30, 24)).toBe(100);
    });
  });

  describe('formatDragDeltaBadge', () => {
    it('formats move gesture with positive and negative delta', () => {
      expect(
        formatDragDeltaBadge({
          kind: 'move',
          deltaFrames: 14,
          snappedTarget: null,
          fps: 24,
        }),
      ).toContain('Move: +14f');

      expect(
        formatDragDeltaBadge({
          kind: 'move',
          deltaFrames: -8,
          snappedTarget: 120,
          snapLabel: 'Head Snap',
          fps: 24,
        }),
      ).toBe('Move: -8f · Head Snap');
    });

    it('formats trim gestures for head and tail', () => {
      expect(
        formatDragDeltaBadge({
          kind: 'trim-start',
          deltaFrames: 5,
          snappedTarget: 48,
          snapLabel: 'Beat 2.1',
          fps: 24,
        }),
      ).toBe('Trim Head: +5f · Beat 2.1');

      expect(
        formatDragDeltaBadge({
          kind: 'trim-end',
          deltaFrames: -10,
          snappedTarget: 240,
          snapLabel: 'Tail Align',
          fps: 24,
        }),
      ).toBe('Trim Tail: -10f · Tail Align');
    });

    it('formats slip and slide gestures', () => {
      expect(
        formatDragDeltaBadge({
          kind: 'slip',
          deltaFrames: 12,
          snappedTarget: null,
          fps: 24,
        }),
      ).toContain('Slip: +12f');

      expect(
        formatDragDeltaBadge({
          kind: 'slide',
          deltaFrames: -6,
          snappedTarget: 300,
          snapLabel: 'Cut Snap',
          fps: 24,
        }),
      ).toBe('Slide: -6f · Cut Snap');
    });

    it('formats ripple and rolling trims', () => {
      expect(
        formatDragDeltaBadge({
          kind: 'ripple',
          deltaFrames: -15,
          snappedTarget: 72,
          snapLabel: 'In Point',
          fps: 24,
        }),
      ).toBe('Ripple: -15f · In Point');

      expect(
        formatDragDeltaBadge({
          kind: 'roll',
          deltaFrames: 4,
          snappedTarget: 96,
          snapLabel: 'Junction',
          fps: 24,
        }),
      ).toBe('Rolling Edit: +4f · Junction');
    });
  });
});
