import { describe, it, expect } from 'vitest';
import {
  validateCompassConfig,
  solveCompassKinematics,
  stepDividerChords,
  generateCompassArcPoints,
  generateMechanicalCompassSvgMarkup,
  computeCompassFoleyTelemetry,
  DEFAULT_COMPASS_CONFIG,
} from '../compass-divider-caliper-ops';

describe('compass-divider-caliper-ops', () => {
  it('validates and clamps default and partial compass configurations', () => {
    const defaults = validateCompassConfig();
    expect(defaults.enabled).toBe(false);
    expect(defaults.armLengthPx).toBe(160.0);
    expect(defaults.needleFriction).toBe(0.30);
    expect(defaults.thumbscrewPitchPx).toBe(2.0);
    expect(defaults.showCompassOverlay).toBe(true);

    const clamped = validateCompassConfig({
      armLengthPx: 1000.0,
      needleFriction: 5.0,
      thumbscrewPitchPx: 0.1,
      foleyRatchetVolume: -0.5,
    });

    expect(clamped.armLengthPx).toBe(400.0);
    expect(clamped.needleFriction).toBe(1.0);
    expect(clamped.thumbscrewPitchPx).toBe(0.5);
    expect(clamped.foleyRatchetVolume).toBe(0.0);
  });

  it('solves inverse kinematics and preserves arm length conservation', () => {
    const pivot: [number, number] = [100, 100];
    const pencil: [number, number] = [200, 100]; // Radius = 100px
    const armLength = 160.0;

    const kin = solveCompassKinematics(pivot, pencil, armLength);
    expect(kin.radiusPx).toBeCloseTo(100.0, 3);
    expect(kin.apertureAngleDeg).toBeGreaterThan(0.0);
    expect(kin.apertureAngleDeg).toBeLessThan(90.0);

    const distNeedle = Math.hypot(kin.hingeXy[0] - pivot[0], kin.hingeXy[1] - pivot[1]);
    const distPencil = Math.hypot(kin.hingeXy[0] - pencil[0], kin.hingeXy[1] - pencil[1]);
    expect(distNeedle).toBeCloseTo(armLength, 2);
    expect(distPencil).toBeCloseTo(armLength, 2);
  });

  it('handles maximum span clamping gracefully', () => {
    const pivot: [number, number] = [0, 0];
    const pencil: [number, number] = [500, 0]; // 500px > 2 * 160 = 320px
    const armLength = 160.0;

    const kin = solveCompassKinematics(pivot, pencil, armLength);
    expect(kin.radiusPx).toBe(500.0);
    // Aperture angle should be clamped near max opening
    expect(kin.apertureAngleDeg).toBeLessThanOrEqual(180.0);
    expect(kin.hingeXy[0]).toBeDefined();
    expect(kin.hingeXy[1]).toBeDefined();
  });

  it('steps mechanical divider caliper along polylines by chord length', () => {
    const poly: Array<[number, number]> = [];
    for (let x = 0; x <= 200; x += 10) {
      poly.push([x, 50]);
    }

    const stepped = stepDividerChords(poly, 40.0);
    // 200px / 40px = 5 steps -> 6 points (0, 40, 80, 120, 160, 200)
    expect(stepped.length).toBe(6);
    for (let i = 1; i < stepped.length; i++) {
      const d = Math.hypot(stepped[i][0] - stepped[i - 1][0], stepped[i][1] - stepped[i - 1][1]);
      expect(d).toBeCloseTo(40.0, 1);
    }
  });

  it('generates circular arc coordinates swept by the pencil leg', () => {
    const pivot: [number, number] = [150, 150];
    const radius = 80;
    const arc = generateCompassArcPoints(pivot, radius, 0, Math.PI, 16);

    expect(arc.length).toBe(17);
    expect(arc[0][0]).toBeCloseTo(230, 2); // 150 + 80
    expect(arc[0][1]).toBeCloseTo(150, 2);
    expect(arc[16][0]).toBeCloseTo(70, 2);  // 150 - 80
    expect(arc[16][1]).toBeCloseTo(150, 2);
  });

  it('generates SVG overlay markup for drafting bow compass', () => {
    const kin = solveCompassKinematics([100, 100], [220, 100], 160);
    const svg = generateMechanicalCompassSvgMarkup(kin, DEFAULT_COMPASS_CONFIG);

    expect(svg).toContain('drafting-compass-overlay');
    expect(svg).toContain('#D4AF37');
    expect(svg).toContain('#A0A0A5');
    expect(svg).toContain('circle');

    const hiddenSvg = generateMechanicalCompassSvgMarkup(kin, { ...DEFAULT_COMPASS_CONFIG, showCompassOverlay: false });
    expect(hiddenSvg).toBe('');
  });

  it('computes acoustic foley telemetry for thumbscrew ratcheting and needle friction', () => {
    const telemetry = computeCompassFoleyTelemetry(30.0, Math.PI / 2, {
      thumbscrewPitchPx: 2.0,
      foleyRatchetVolume: 0.85,
      needleFriction: 0.40,
    });

    expect(telemetry.ratchetClicks).toBe(15);
    expect(telemetry.ratchetGain).toBeGreaterThan(0.0);
    expect(telemetry.sweepWhisperGain).toBeGreaterThan(0.0);
    expect(telemetry.pivotDragTorque).toBeGreaterThan(0.0);
    expect(telemetry.ratchetPitchHz).toBe(1200.0);
  });
});
