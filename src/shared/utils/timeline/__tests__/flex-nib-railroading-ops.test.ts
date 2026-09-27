import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FLEX_NIB_CONFIG,
  validateFlexNibConfig,
  computeTineSplayWidth,
  evaluateMeniscusState,
  calculateTineOffsets,
  simulateDipPenStroke,
  generateFlexNibSvgPaths,
} from '../flex-nib-railroading-ops';

describe('Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading Operations', () => {
  describe('validateFlexNibConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateFlexNibConfig();
      expect(cfg).toEqual(DEFAULT_FLEX_NIB_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.hairlineWidth).toBe(1.2);
      expect(cfg.maxSwellWidth).toBe(14.0);
      expect(cfg.meniscusRuptureWidth).toBe(9.5);
      expect(cfg.meniscusReconnectWidth).toBe(6.0);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateFlexNibConfig({
        hairlineWidth: 0.1,
        maxSwellWidth: 100.0,
        flexSensitivity: 10.0,
        reservoirCapacityPx: 20,
        inkFlowRate: 20.0,
      });

      expect(clamped.hairlineWidth).toBe(0.5);
      expect(clamped.maxSwellWidth).toBe(40.0);
      expect(clamped.flexSensitivity).toBe(3.0);
      expect(clamped.reservoirCapacityPx).toBe(100);
      expect(clamped.inkFlowRate).toBe(5.0);
    });
  });

  describe('computeTineSplayWidth', () => {
    it('returns exact hairline width at zero pressure', () => {
      const w = computeTineSplayWidth(0.0, { hairlineWidth: 1.5, maxSwellWidth: 15.0 });
      expect(w).toBeCloseTo(1.5, 4);
    });

    it('returns maximum swell width at full pressure (1.0)', () => {
      const w = computeTineSplayWidth(1.0, { hairlineWidth: 1.5, maxSwellWidth: 15.0 });
      expect(w).toBeCloseTo(15.0, 4);
    });

    it('exhibits non-linear cantilever expansion at half pressure', () => {
      const cfg = { hairlineWidth: 1.0, maxSwellWidth: 11.0, flexSensitivity: 2.0 };
      // at p=0.5, p^2 = 0.25 -> 1.0 + 10.0 * 0.25 = 3.5
      const w = computeTineSplayWidth(0.5, cfg);
      expect(w).toBeCloseTo(3.5, 4);
    });
  });

  describe('evaluateMeniscusState', () => {
    const cfg = {
      meniscusRuptureWidth: 10.0,
      meniscusReconnectWidth: 6.0,
    };

    it('maintains intact meniscus below rupture width', () => {
      expect(evaluateMeniscusState(8.0, false, 1.0, cfg)).toBe(false);
    });

    it('snaps meniscus into twin railroad tracks when width exceeds rupture threshold', () => {
      expect(evaluateMeniscusState(11.0, false, 1.0, cfg)).toBe(true);
    });

    it('exhibits hysteresis by remaining railroaded in intermediate width band', () => {
      // currently railroaded, width = 8.0 (between 6.0 reconnect and 10.0 rupture)
      expect(evaluateMeniscusState(8.0, true, 1.0, cfg)).toBe(true);
    });

    it('reconnects into solid stroke when tines narrow below reconnection threshold', () => {
      expect(evaluateMeniscusState(5.5, true, 1.0, cfg)).toBe(false);
    });

    it('forces rupture when ink reservoir is empty even at lower widths', () => {
      expect(evaluateMeniscusState(6.5, false, 0.0, cfg)).toBe(true);
    });
  });

  describe('calculateTineOffsets', () => {
    it('calculates symmetrical lateral offsets orthogonal to stroke', () => {
      const { leftTinePt, rightTinePt } = calculateTineOffsets([100, 100], [0, 1], 10.0);
      expect(leftTinePt[0]).toBeCloseTo(100, 4);
      expect(leftTinePt[1]).toBeCloseTo(105, 4);
      expect(rightTinePt[0]).toBeCloseTo(100, 4);
      expect(rightTinePt[1]).toBeCloseTo(95, 4);
    });
  });

  describe('simulateDipPenStroke', () => {
    it('simulates progressive dip pen stroke with reservoir depletion and telemetry', () => {
      const pts: Array<[number, number]> = [
        [10, 50],
        [30, 50],
        [60, 50],
        [90, 50],
        [120, 50],
      ];
      const pressures = [0.1, 0.4, 0.9, 0.9, 0.2];
      const states = simulateDipPenStroke(pts, pressures, 1.0, {
        meniscusRuptureWidth: 8.0,
        maxSwellWidth: 14.0,
        reservoirCapacityPx: 500.0,
      });

      expect(states.length).toBe(5);
      expect(states[0].reservoirLevel).toBeGreaterThan(states[4].reservoirLevel);
      expect(states[2].isRailroaded).toBe(true);
      expect(states[2].foleyTelemetry.scratchFreqHz).toBeGreaterThanOrEqual(1800);
      expect(states[2].foleyTelemetry.scratchFreqHz).toBeLessThanOrEqual(4500);
    });
  });

  describe('generateFlexNibSvgPaths', () => {
    it('returns empty string for fewer than 2 points', () => {
      expect(generateFlexNibSvgPaths([])).toBe('');
    });

    it('generates solid polygon quad paths for intact meniscus and stroke paths for railroading', () => {
      const pts: Array<[number, number]> = [
        [10, 50],
        [30, 50],
        [60, 50],
      ];
      const pressures = [0.2, 0.95, 0.1];
      const states = simulateDipPenStroke(pts, pressures, 1.0, {
        meniscusRuptureWidth: 8.0,
      });
      const svg = generateFlexNibSvgPaths(states);

      expect(svg).toContain('<path');
      expect(svg).toContain('fill=');
      expect(svg).toContain('stroke=');
    });
  });
});
