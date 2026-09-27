import { describe, expect, it } from 'vitest';
import {
  computeToolFlipTrajectory,
  computeHolsterSwapTrajectory,
  resolveToolTransitionType,
} from '../tool-swap-ops';

describe('tool-swap-ops', () => {
  it('correctly resolves transition type between tools', () => {
    expect(resolveToolTransitionType('pen', 'eraser_cap')).toBe('flip');
    expect(resolveToolTransitionType('eraser_cap', 'pen')).toBe('flip');
    expect(resolveToolTransitionType('pen', 'highlighter')).toBe('dock');
    expect(resolveToolTransitionType('marker', 'felt_eraser')).toBe('dock');
    expect(resolveToolTransitionType('pen', 'eraser_cap', { defaultTransition: 'instant' })).toBe('instant');
  });

  it('computes 180-degree tool flip trajectory with parabolic lift', () => {
    const startPt: [number, number] = [100, 200];
    const endPt: [number, number] = [120, 210];
    const { poses, cues } = computeToolFlipTrajectory(
      startPt,
      endPt,
      'pen',
      'eraser_cap',
      0.0,
      0.5,
      30,
      80.0,
      -35.0
    );

    expect(poses.length).toBe(15);
    // Initial pose
    expect(poses[0].activeTool).toBe('pen');
    expect(poses[0].angleDeg).toBeCloseTo(-35.0, 1);
    expect(poses[0].zLift).toBeCloseTo(0.0, 1);

    // Midpoint pose (apex lift)
    const mid = poses[7];
    expect(mid.zLift).toBeGreaterThan(60.0);

    // Final pose (flipped tool)
    const last = poses[poses.length - 1];
    expect(last.activeTool).toBe('eraser_cap');
    expect(last.angleDeg).toBeCloseTo(145.0, 1);
    expect(last.zLift).toBeCloseTo(0.0, 1);

    // Foley cue emitted
    expect(cues).toHaveLength(1);
    expect(cues[0].cueName).toBe('stylus_flip');
  });

  it('computes holster dock swap trajectory passing through dock waypoint', () => {
    const startPt: [number, number] = [200, 300];
    const endPt: [number, number] = [100, 150];
    const dockPt: [number, number] = [600, 340];

    const { poses, cues } = computeHolsterSwapTrajectory(
      startPt,
      endPt,
      dockPt,
      'pen',
      'highlighter',
      1.0,
      0.8,
      30
    );

    expect(poses.length).toBe(24);
    expect(poses[0].activeTool).toBe('pen');
    expect(poses[poses.length - 1].activeTool).toBe('highlighter');

    // Midpoint should be at dock
    const mid = poses[12];
    expect(Math.hypot(mid.x - dockPt[0], mid.y - dockPt[1])).toBeLessThan(5.0);

    // Audio triggers
    expect(cues.some((c) => c.cueName === 'dock_click')).toBe(true);
    expect(cues.some((c) => c.cueName === 'cap_snap')).toBe(true);
  });
});
