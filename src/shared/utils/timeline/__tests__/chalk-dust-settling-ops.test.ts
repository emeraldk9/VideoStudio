import { describe, it, expect } from 'vitest';
import {
  stepParticleKinematics,
  depositParticleOntoTray,
  calculateTraySedimentHeights,
  generateChalkTraySvgPath,
  DEFAULT_CHALK_DUST_SETTLING_SETTINGS,
} from '../chalk-dust-settling-ops';

describe('chalk-dust-settling-ops', () => {
  it('correctly simulates vertical kinematic drift with gravity and terminal velocity bounding', () => {
    const p = {
      x: 100,
      y: 50,
      vx: 0,
      vy: 10,
      radius: 1.2,
      opacity: 0.5,
      isSettled: false,
    };

    const settled = stepParticleKinematics(p, 0.5, {
      gravitySpeed: 100.0,
      terminalVelocity: 40.0,
    }, 500.0, 0.0);

    expect(settled).toBe(false);
    expect(p.isSettled).toBe(false);
    expect(p.y).toBeGreaterThan(50);
    // Speed should not exceed terminal velocity
    expect(p.vy).toBeLessThanOrEqual(40.0);
  });

  it('triggers tray landing and sets particle state to settled at shelf elevation', () => {
    const p = {
      x: 200,
      y: 490,
      vx: 5,
      vy: 30,
      radius: 1.0,
      opacity: 0.4,
      isSettled: false,
    };

    const trayY = 500.0;
    const settled = stepParticleKinematics(p, 0.5, {}, trayY, 0.0);

    expect(settled).toBe(true);
    expect(p.isSettled).toBe(true);
    expect(p.y).toBe(trayY);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
  });

  it('deposits Gaussian particulate mass onto tray histogram adhering to angle of repose', () => {
    const width = 400;
    const trayBins = new Float32Array(width);

    depositParticleOntoTray(trayBins, 200, 1.5, 4.0, width);

    // Center bin should receive highest density
    expect(trayBins[200]).toBeGreaterThan(0);
    // Adjacent bins also receive Gaussian splat
    expect(trayBins[198]).toBeGreaterThan(0);
    expect(trayBins[202]).toBeGreaterThan(0);
    expect(trayBins[200]).toBeGreaterThan(trayBins[195]);

    // Distant bins are untouched
    expect(trayBins[50]).toBe(0);
    expect(trayBins[350]).toBe(0);
  });

  it('calculates smooth sediment berm heights and generates SVG path for canvas overlay', () => {
    const width = 200;
    const trayBins = new Float32Array(width);

    // Empty tray generates empty SVG
    const emptySvg = generateChalkTraySvgPath(trayBins, width, 180, 18.0);
    expect(emptySvg).toBe('');

    // Deposit mass in middle
    for (let x = 80; x <= 120; x++) {
      depositParticleOntoTray(trayBins, x, 0.8, 3.0, width);
    }

    const heights = calculateTraySedimentHeights(trayBins, 18.0, 25.0);
    expect(heights[100]).toBeGreaterThan(0.5);
    expect(heights[10]).toBe(0);

    // Populated tray generates valid closed SVG polygon path
    const svgPath = generateChalkTraySvgPath(trayBins, width, 180, 18.0);
    expect(svgPath).toContain('M 0 180');
    expect(svgPath).toContain('Z');
  });
});
