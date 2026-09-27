import { describe, it, expect } from 'vitest';
import {
  validateCollaborativeSyncConfig,
  LamportClock,
  compareCRDTOperations,
  checkSpatialOverlap,
  CRDTRuntimeQueue,
  DEFAULT_COLLAB_CONFIG,
  CRDTOperation,
} from '../collaborative-crdt-ops';

describe('collaborative-crdt-ops', () => {
  it('validates and clamps default and partial collaborative sync configurations', () => {
    const defaults = validateCollaborativeSyncConfig();
    expect(defaults.enabled).toBe(false);
    expect(defaults.spatialLeaseTtlMs).toBe(2000);
    expect(defaults.lockPaddingPx).toBe(10);
    expect(defaults.optimisticBufferLimit).toBe(100);
    expect(defaults.enableSelectiveUndo).toBe(true);

    const clamped = validateCollaborativeSyncConfig({
      spatialLeaseTtlMs: 20000,
      lockPaddingPx: 500,
      optimisticBufferLimit: 5,
    });
    expect(clamped.spatialLeaseTtlMs).toBe(5000);
    expect(clamped.lockPaddingPx).toBe(50);
    expect(clamped.optimisticBufferLimit).toBe(10);
  });

  it('maintains monotonically increasing Lamport logical clocks', () => {
    const clock = new LamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
    expect(clock.witness(15)).toBe(16);
    expect(clock.tick()).toBe(17);
  });

  it('establishes strict deterministic total ordering of operations', () => {
    const opA: CRDTOperation = {
      lamport: 2,
      clientId: 'client_a',
      seq: 1,
      opType: 'insert',
      strokeId: 's1',
      points: [],
      colorHex: '#000',
      tombstoned: false,
    };
    const opB: CRDTOperation = {
      lamport: 2,
      clientId: 'client_b',
      seq: 1,
      opType: 'insert',
      strokeId: 's2',
      points: [],
      colorHex: '#fff',
      tombstoned: false,
    };
    const opC: CRDTOperation = {
      lamport: 3,
      clientId: 'client_a',
      seq: 2,
      opType: 'insert',
      strokeId: 's3',
      points: [],
      colorHex: '#123',
      tombstoned: false,
    };

    expect(compareCRDTOperations(opA, opB)).toBeLessThan(0); // client_a < client_b
    expect(compareCRDTOperations(opB, opC)).toBeLessThan(0); // lamport 2 < lamport 3
    expect(compareCRDTOperations(opA, opC)).toBeLessThan(0);
  });

  it('detects spatial bounding-box overlap and padding expansion', () => {
    const box1: [number, number, number, number] = [0, 0, 50, 50];
    const box2: [number, number, number, number] = [60, 60, 100, 100];
    const box3: [number, number, number, number] = [40, 40, 80, 80];

    expect(checkSpatialOverlap(box1, box2, 0)).toBe(false);
    // With 15px padding, box1 becomes [-15, -15, 65, 65] overlapping box2
    expect(checkSpatialOverlap(box1, box2, 15)).toBe(true);
    expect(checkSpatialOverlap(box1, box3, 0)).toBe(true);
  });

  it('converges across multiple distributed peers to identical ordered stroke states', () => {
    const peerAlice = new CRDTRuntimeQueue('alice');
    const peerBob = new CRDTRuntimeQueue('bob');

    const opAlice1 = peerAlice.createStroke('alice_1', [[10, 10, 1], [20, 20, 1]], '#FF0000');
    const opBob1 = peerBob.createStroke('bob_1', [[100, 100, 1], [110, 110, 1]], '#0000FF');

    // Cross-sync operations
    peerAlice.applyOperation(opBob1);
    peerBob.applyOperation(opAlice1);

    const aliceStrokes = peerAlice.getActiveStrokes();
    const bobStrokes = peerBob.getActiveStrokes();

    expect(aliceStrokes.length).toBe(2);
    expect(bobStrokes.length).toBe(2);
    expect(aliceStrokes.map((s) => s.strokeId)).toEqual(bobStrokes.map((s) => s.strokeId));
  });

  it('performs selective causal undo without corrupting concurrent peer strokes', () => {
    const peerAlice = new CRDTRuntimeQueue('alice');
    const peerBob = new CRDTRuntimeQueue('bob');

    const opA1 = peerAlice.createStroke('alice_s1', [[10, 10, 1]], '#FF0000');
    const opB1 = peerBob.createStroke('bob_s1', [[50, 50, 1]], '#00FF00');

    peerAlice.applyOperation(opB1);
    peerBob.applyOperation(opA1);

    // Alice undos her stroke
    const deleteOp = peerAlice.undoStroke('alice_s1');
    expect(deleteOp).not.toBeNull();
    expect(deleteOp?.opType).toBe('delete');

    // Broadcast delete to Bob
    if (deleteOp) {
      peerBob.applyOperation(deleteOp);
    }

    expect(peerAlice.getActiveStrokes().map((s) => s.strokeId)).toEqual(['bob_s1']);
    expect(peerBob.getActiveStrokes().map((s) => s.strokeId)).toEqual(['bob_s1']);
  });

  it('manages spatial lease locks and enforces mutual exclusion with TTL expiry', () => {
    const peerAlice = new CRDTRuntimeQueue('alice', { spatialLeaseTtlMs: 1500 });
    const box: [number, number, number, number] = [100, 100, 200, 200];
    const now = 5000;

    const lockA = peerAlice.requestSpatialLock(box, now);
    expect(lockA).not.toBeNull();
    expect(lockA?.clientId).toBe('alice');

    // Check lock existence for other clients
    expect(peerAlice.isRegionLocked(box, now, 'bob')).toBe(true);
    // Alice is not blocked by her own lock
    expect(peerAlice.isRegionLocked(box, now, 'alice')).toBe(false);

    // After TTL expires (5000 + 1500 = 6500)
    expect(peerAlice.isRegionLocked(box, 7000, 'bob')).toBe(false);
  });
});
