import { describe, it, expect } from 'vitest';
import {
  clampCameraCenter,
  calculateFollowerCameraTrajectory,
  calculateHandShadowOffset,
} from '../viewport-camera-ops';
import type { Point2D } from '../calligraphy-ops';

describe('viewport-camera-ops', () => {
  it('clamps camera center to prevent zoomed viewport from exceeding canvas bounds', () => {
    const frameW = 1000;
    const frameH = 500;
    const zoom = 2.0;

    // Visible half dimensions: halfW = 250, halfH = 125
    // Allowed X: [250, 750], Allowed Y: [125, 375]
    const clampedAtZero = clampCameraCenter(0, 0, zoom, frameW, frameH);
    expect(clampedAtZero[0]).toBe(250);
    expect(clampedAtZero[1]).toBe(125);

    const clampedAtFar = clampCameraCenter(1200, 600, zoom, frameW, frameH);
    expect(clampedAtFar[0]).toBe(750);
    expect(clampedAtFar[1]).toBe(375);

    // Zoom = 1.0 always stays exactly at frame center
    const clampedWide = clampCameraCenter(100, 100, 1.0, frameW, frameH);
    expect(clampedWide[0]).toBe(500);
    expect(clampedWide[1]).toBe(250);
  });

  it('generates smooth inertial camera trajectory tracking pen position with zoom-in and zoom-out', () => {
    const penTrajectory: (Point2D | null)[] = [];
    // 30 frames: moving from (200, 200) to (800, 400)
    for (let f = 0; f < 30; f++) {
      const t = f / 29.0;
      penTrajectory.push([200 + t * 600, 200 + t * 200]);
    }

    const states = calculateFollowerCameraTrajectory(penTrajectory, {
      frameW: 1000,
      frameH: 600,
      targetZoom: 1.5,
      smoothness: 0.8,
      leadInFrames: 5,
      leadOutFrames: 5,
    });

    expect(states.length).toBe(30);

    // Initial frame zoom starts near 1.0 and smoothly climbs
    expect(states[0].zoom).toBeGreaterThanOrEqual(1.0);
    expect(states[15].zoom).toBeGreaterThan(1.25);

    // All frames must remain within canvas bounds
    for (const s of states) {
      const halfW = 500 / s.zoom;
      const halfH = 300 / s.zoom;
      expect(s.cx - halfW).toBeGreaterThanOrEqual(-1e-4);
      expect(s.cx + halfW).toBeLessThanOrEqual(1000 + 1e-4);
      expect(s.cy - halfH).toBeGreaterThanOrEqual(-1e-4);
      expect(s.cy + halfH).toBeLessThanOrEqual(600 + 1e-4);
    }
  });

  it('calculates directional screen shadow offsets for various compass light angles', () => {
    // 315 deg (NW light): casts to SE (dx > 0, dy > 0)
    const nwOffset = calculateHandShadowOffset(315, 16);
    expect(nwOffset.dx).toBeGreaterThan(0);
    expect(nwOffset.dy).toBeGreaterThan(0);

    // 135 deg (SE light): casts to NW (dx < 0, dy < 0)
    const seOffset = calculateHandShadowOffset(135, 16);
    expect(seOffset.dx).toBeLessThan(0);
    expect(seOffset.dy).toBeLessThan(0);

    // 0 deg (North light): casts South (dx approx 0, dy > 0)
    const nOffset = calculateHandShadowOffset(0, 20);
    expect(nOffset.dx).toBe(0);
    expect(nOffset.dy).toBe(20);
  });
});
