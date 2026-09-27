import { describe, expect, it } from 'vitest';
import {
  partitionStrokesForDuet,
  evaluateCollisionAvoidance,
  generateDualHandStereoPan,
  evaluateDuetState,
} from '../dual-hand-duet-ops';

describe('dual-hand-duet-ops', () => {
  it('correctly partitions strokes across Hand 1 and Hand 2 spatially and interleaved', () => {
    const s1: [number, number][] = [[100, 100], [200, 200]]; // Left side
    const s2: [number, number][] = [[1500, 300], [1600, 400]]; // Right side
    const s3: [number, number][] = [[300, 500], [400, 600]]; // Left side

    // Spatial mode (canvasWidth = 1920)
    const spatial = partitionStrokesForDuet([s1, s2, s3], 1920, 'spatial');
    expect(spatial.hand1Strokes.length).toBe(2);
    expect(spatial.hand2Strokes.length).toBe(1);

    // Interleaved mode
    const interleaved = partitionStrokesForDuet([s1, s2, s3], 1920, 'interleaved');
    expect(interleaved.hand1Strokes.length).toBe(2); // idx 0, 2
    expect(interleaved.hand2Strokes.length).toBe(1); // idx 1
  });

  it('elevates Hand 2 when hands draw within collision proximity', () => {
    // Distant: no collision
    const far = evaluateCollisionAvoidance([200, 200], [1000, 200], 160, 90);
    expect(far.isColliding).toBe(false);
    expect(far.hand1Z).toBe(0);
    expect(far.hand2Z).toBe(0);

    // Close collision (dist = 40 < 160)
    const close = evaluateCollisionAvoidance([500, 500], [540, 500], 160, 90);
    expect(close.isColliding).toBe(true);
    expect(close.distance).toBeCloseTo(40, 0);
    expect(close.hand1Z).toBe(0);
    expect(close.hand2Z).toBeGreaterThan(50);
  });

  it('generates stereo foley pan factors based on horizontal position', () => {
    const { hand1Pan, hand2Pan } = generateDualHandStereoPan(200, 1720, 1920);
    expect(hand1Pan).toBeLessThan(-0.6);
    expect(hand2Pan).toBeGreaterThan(0.6);
  });

  it('computes complete duet frame state with panning and clearance', () => {
    const state = evaluateDuetState([300, 300], [330, 300], 1920, {
      minSeparationPx: 160,
      collisionLiftPx: 90,
      stereoFoleyPanning: true,
    });

    expect(state.isColliding).toBe(true);
    expect(state.hand2Z).toBeGreaterThan(60);
    expect(state.hand1Pan).toBeLessThan(0);
  });
});
