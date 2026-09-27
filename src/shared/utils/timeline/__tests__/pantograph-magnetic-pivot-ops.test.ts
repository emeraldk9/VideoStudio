import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PANTOGRAPH_CONFIG,
  validatePantographConfig,
  applyMagneticArcConstraint,
  solvePantographKinematics,
  transformStrokePantograph,
  generatePantographSvgMarkup,
} from '../pantograph-magnetic-pivot-ops';

describe('Whiteboard Drafting Pantograph Mechanical Linkage & Magnetic Arc Pivot Operations', () => {
  describe('validatePantographConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validatePantographConfig();
      expect(cfg).toEqual(DEFAULT_PANTOGRAPH_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.scaleRatio).toBe(2.0);
      expect(cfg.magneticSnapEnabled).toBe(true);
      expect(cfg.magneticSnapRadius).toBe(20);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validatePantographConfig({
        scaleRatio: 12.0,
        magneticSnapRadius: 500,
        arcSnapStep: 1,
        elasticFlexDamping: 2.5,
        needleFrictionFactor: 10.0,
      });

      expect(clamped.scaleRatio).toBe(5.0);
      expect(clamped.magneticSnapRadius).toBe(200);
      expect(clamped.arcSnapStep).toBe(5);
      expect(clamped.elasticFlexDamping).toBe(0.5);
      expect(clamped.needleFrictionFactor).toBe(2.0);
    });
  });

  describe('applyMagneticArcConstraint', () => {
    it('returns original point when magnetic snapping is disabled', () => {
      const res = applyMagneticArcConstraint([200, 100], [100, 100], {
        magneticSnapEnabled: false,
      });
      expect(res.isSnapped).toBe(false);
      expect(res.snappedPoint[0]).toBeCloseTo(200, 3);
      expect(res.snappedPoint[1]).toBeCloseTo(100, 3);
    });

    it('elastically snaps to fixed arcLockRadius when within snap threshold', () => {
      const res = applyMagneticArcConstraint([245, 100], [100, 100], {
        magneticSnapEnabled: true,
        arcLockRadius: 150,
        magneticSnapRadius: 15,
      });
      expect(res.isSnapped).toBe(true);
      // Original distance 145, target 150 -> effective radius pulled towards 150
      expect(res.polarRadius).toBeGreaterThan(145);
      expect(res.polarRadius).toBeLessThanOrEqual(150);
      expect(res.snappedPoint[0]).toBeGreaterThan(245);
    });

    it('does not snap when distance from target radius exceeds snap threshold', () => {
      const res = applyMagneticArcConstraint([300, 100], [100, 100], {
        magneticSnapEnabled: true,
        arcLockRadius: 150,
        magneticSnapRadius: 10,
      });
      expect(res.isSnapped).toBe(false);
      expect(res.polarRadius).toBeCloseTo(200, 3);
    });

    it('snaps to nearest concentric discrete guide ring step', () => {
      const res = applyMagneticArcConstraint([197, 100], [100, 100], {
        magneticSnapEnabled: true,
        arcLockRadius: 0,
        arcSnapStep: 50,
        magneticSnapRadius: 15,
      });
      // Radius = 97, nearest step = 100 (diff 3 <= 15)
      expect(res.isSnapped).toBe(true);
      expect(res.polarRadius).toBeGreaterThan(97);
    });
  });

  describe('solvePantographKinematics', () => {
    it('accurately computes collinear scale magnification P = A + R * (T - A)', () => {
      const joints = solvePantographKinematics([150, 100], undefined, 0.016, {
        anchorPoint: [100, 100],
        scaleRatio: 3.0,
        magneticSnapEnabled: false,
        elasticFlexDamping: 0.0,
      });

      // T - A = (50, 0), P = A + 3*(50, 0) = (250, 100)
      expect(joints.pen[0]).toBeCloseTo(250, 3);
      expect(joints.pen[1]).toBeCloseTo(100, 3);
      expect(joints.polarRadius).toBeCloseTo(150, 3);
      expect(joints.polarAngleDeg).toBeCloseTo(0, 3);
    });

    it('calculates scissor parallelogram elbow joints (elbowB, elbowC, elbowD)', () => {
      const joints = solvePantographKinematics([140, 100], undefined, 0.016, {
        anchorPoint: [100, 100],
        scaleRatio: 2.0,
        magneticSnapEnabled: false,
      });

      expect(joints.elbowB).toBeDefined();
      expect(joints.elbowC).toBeDefined();
      expect(joints.elbowD).toBeDefined();
      expect(joints.elbowB.length).toBe(2);
      expect(joints.elbowC.length).toBe(2);
      expect(joints.elbowD.length).toBe(2);
    });

    it('calculates mechanical inertia strain and foley audio telemetry under fast acceleration', () => {
      const j1 = solvePantographKinematics([110, 100], undefined, 0.016, {
        anchorPoint: [100, 100],
        scaleRatio: 2.0,
        elasticFlexDamping: 0.1,
      });

      const j2 = solvePantographKinematics([170, 160], [110, 100], 0.016, {
        anchorPoint: [100, 100],
        scaleRatio: 2.0,
        elasticFlexDamping: 0.1,
      }, [0, 0]);

      expect(j2.mechanicalStrain).toBeGreaterThan(0.0);
      expect(j2.foleyTelemetry.angularVelocity).toBeGreaterThan(0.0);
      expect(j2.foleyTelemetry.pivotFriction).toBeGreaterThan(0.0);
      expect(j2.foleyTelemetry.needleScrapeHz).toBeGreaterThanOrEqual(800.0);
    });
  });

  describe('transformStrokePantograph', () => {
    it('transforms an entire array of continuous tracer points', () => {
      const stroke: Array<[number, number]> = [
        [120, 100],
        [130, 105],
        [140, 110],
        [150, 115],
      ];
      const transformed = transformStrokePantograph(stroke, {
        anchorPoint: [100, 100],
        scaleRatio: 2.0,
      });

      expect(transformed.length).toBe(4);
      expect(transformed[0].index).toBe(0);
      expect(transformed[3].index).toBe(3);
      expect(transformed[0].pen).toBeDefined();
      expect(transformed[0].telemetry).toBeDefined();
    });
  });

  describe('generatePantographSvgMarkup', () => {
    it('returns empty string when overlay rendering is disabled', () => {
      const joints = solvePantographKinematics([130, 100]);
      const svg = generatePantographSvgMarkup(joints, { renderOverlayEnabled: false });
      expect(svg).toBe('');
    });

    it('generates valid SVG markup containing brass bars, knurled rivets, and magnetic disk', () => {
      const joints = solvePantographKinematics([150, 120], undefined, 0.016, {
        anchorPoint: [100, 100],
        scaleRatio: 2.0,
        renderOverlayEnabled: true,
      });
      const svg = generatePantographSvgMarkup(joints, { renderOverlayEnabled: true });

      expect(svg).toContain('<g class="pantograph-linkage-overlay"');
      expect(svg).toContain('stroke="#d4af37"'); // brass bars
      expect(svg).toContain('fill="#1e1e24"'); // magnetic disk base
      expect(svg).toContain('fill="#c0a060"'); // knurled rivets
    });
  });
});
