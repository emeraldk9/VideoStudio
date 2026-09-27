/**
 * Collaborative Spatial Locking & Optimistic CRDT Stroke Merging Engine.
 *
 * Implements Lamport logical clocks, deterministic total ordering,
 * optimistic local stroke rendering with peer convergence, spatial AABB lease locks,
 * and selective causal undo/redo tombstoning.
 */

export type CRDTOpType = 'insert' | 'delete' | 'modify';

export interface CRDTOperation {
  lamport: number;
  clientId: string;
  seq: number;
  opType: CRDTOpType;
  strokeId: string;
  points: Array<[number, number, number]>; // [x, y, pressure]
  colorHex: string;
  tombstoned: boolean;
}

export interface SpatialLock {
  lockId: string;
  clientId: string;
  bounds: [number, number, number, number]; // [xmin, ymin, xmax, ymax]
  expiresAtMs: number;
}

export interface CollaborativeSyncConfig {
  enabled: boolean;
  clientId: string;
  spatialLeaseTtlMs: number;      // Ephemeral lock duration in ms (500..5000, default: 2000)
  lockPaddingPx: number;          // Spatial boundary padding buffer in px (0..50, default: 10)
  optimisticBufferLimit: number;  // Local pending action buffer ceiling (10..500, default: 100)
  enableSelectiveUndo: boolean;   // Non-destructive peer-preserving tombstone undo (default: true)
}

export type CollaborativeSyncSettings = Partial<CollaborativeSyncConfig>;

export const DEFAULT_COLLAB_CONFIG: CollaborativeSyncConfig = {
  enabled: false,
  clientId: 'client_local',
  spatialLeaseTtlMs: 2000,
  lockPaddingPx: 10,
  optimisticBufferLimit: 100,
  enableSelectiveUndo: true,
};

/**
 * Validates and clamps collaborative CRDT configuration parameters.
 */
export function validateCollaborativeSyncConfig(
  config?: Partial<CollaborativeSyncConfig>
): CollaborativeSyncConfig {
  if (!config) {
    return { ...DEFAULT_COLLAB_CONFIG };
  }

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_COLLAB_CONFIG.enabled),
    clientId: String(config.clientId || DEFAULT_COLLAB_CONFIG.clientId),
    spatialLeaseTtlMs: Math.max(500, Math.min(5000, config.spatialLeaseTtlMs ?? DEFAULT_COLLAB_CONFIG.spatialLeaseTtlMs)),
    lockPaddingPx: Math.max(0, Math.min(50, config.lockPaddingPx ?? DEFAULT_COLLAB_CONFIG.lockPaddingPx)),
    optimisticBufferLimit: Math.max(10, Math.min(500, config.optimisticBufferLimit ?? DEFAULT_COLLAB_CONFIG.optimisticBufferLimit)),
    enableSelectiveUndo: Boolean(config.enableSelectiveUndo ?? DEFAULT_COLLAB_CONFIG.enableSelectiveUndo),
  };
}

/**
 * Logical Lamport clock for generating monotonically increasing timestamps across peers.
 */
export class LamportClock {
  private counter: number = 0;

  public tick(): number {
    this.counter += 1;
    return this.counter;
  }

  public witness(remoteCounter: number): number {
    this.counter = Math.max(this.counter, remoteCounter) + 1;
    return this.counter;
  }

  public get current(): number {
    return this.counter;
  }
}

/**
 * Deterministic total order comparator for CRDT operations:
 * 1. Lamport timestamp ascending
 * 2. Client ID lexicographical ascending
 * 3. Sequence number ascending
 */
export function compareCRDTOperations(a: CRDTOperation, b: CRDTOperation): number {
  if (a.lamport !== b.lamport) {
    return a.lamport - b.lamport;
  }
  if (a.clientId !== b.clientId) {
    return a.clientId.localeCompare(b.clientId);
  }
  return a.seq - b.seq;
}

/**
 * Checks if two bounding boxes [xmin, ymin, xmax, ymax] overlap, with optional padding.
 */
export function checkSpatialOverlap(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number],
  padding: number = 0
): boolean {
  const ax1 = boxA[0] - padding;
  const ay1 = boxA[1] - padding;
  const ax2 = boxA[2] + padding;
  const ay2 = boxA[3] + padding;

  const bx1 = boxB[0];
  const by1 = boxB[1];
  const bx2 = boxB[2];
  const by2 = boxB[3];

  return !(ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2);
}

/**
 * Deterministic CRDT runtime queue maintaining consistent ordered stroke state.
 */
export class CRDTRuntimeQueue {
  public readonly clientId: string;
  public readonly config: CollaborativeSyncConfig;
  public readonly clock: LamportClock;
  private localSeq: number = 0;
  private operations: CRDTOperation[] = [];
  private locks: SpatialLock[] = [];

  constructor(clientId: string, config?: Partial<CollaborativeSyncConfig>) {
    this.clientId = clientId;
    this.config = validateCollaborativeSyncConfig({ ...config, clientId });
    this.clock = new LamportClock();
  }

  /**
   * Creates an optimistic local stroke operation and commits it locally.
   */
  public createStroke(
    strokeId: string,
    points: Array<[number, number, number]>,
    colorHex: string = '#000000'
  ): CRDTOperation {
    const lamport = this.clock.tick();
    this.localSeq += 1;
    const op: CRDTOperation = {
      lamport,
      clientId: this.clientId,
      seq: this.localSeq,
      opType: 'insert',
      strokeId,
      points,
      colorHex,
      tombstoned: false,
    };
    this.applyOperation(op);
    return op;
  }

  /**
   * Applies an operation (local or remote), advancing Lamport clock and preserving total order.
   */
  public applyOperation(op: CRDTOperation): boolean {
    if (op.clientId !== this.clientId) {
      this.clock.witness(op.lamport);
    }

    // De-duplicate operations
    const exists = this.operations.some(
      (existing) =>
        existing.lamport === op.lamport &&
        existing.clientId === op.clientId &&
        existing.seq === op.seq
    );
    if (exists) {
      return false;
    }

    if (op.opType === 'delete') {
      let found = false;
      for (const stroke of this.operations) {
        if (stroke.strokeId === op.strokeId) {
          stroke.tombstoned = true;
          found = true;
        }
      }
      return found;
    }

    this.operations.push({ ...op });
    this.operations.sort(compareCRDTOperations);
    return true;
  }

  /**
   * Performs selective causal undo by tombstoning the target stroke without affecting peers.
   */
  public undoStroke(strokeId: string): CRDTOperation | null {
    const target = this.operations.find((op) => op.strokeId === strokeId && !op.tombstoned);
    if (!target) {
      return null;
    }

    target.tombstoned = true;
    const lamport = this.clock.tick();
    this.localSeq += 1;
    const deleteOp: CRDTOperation = {
      lamport,
      clientId: this.clientId,
      seq: this.localSeq,
      opType: 'delete',
      strokeId,
      points: [],
      colorHex: target.colorHex,
      tombstoned: true,
    };
    return deleteOp;
  }

  /**
   * Attempts to acquire an ephemeral spatial lease lock for a bounding box region.
   */
  public requestSpatialLock(
    bounds: [number, number, number, number],
    currentTimeMs: number = Date.now()
  ): SpatialLock | null {
    this.purgeExpiredLocks(currentTimeMs);

    for (const lock of this.locks) {
      if (
        lock.clientId !== this.clientId &&
        checkSpatialOverlap(lock.bounds, bounds, this.config.lockPaddingPx)
      ) {
        return null; // Region locked by another peer
      }
    }

    const lockId = `lock_${this.clientId}_${currentTimeMs}`;
    const newLock: SpatialLock = {
      lockId,
      clientId: this.clientId,
      bounds,
      expiresAtMs: currentTimeMs + this.config.spatialLeaseTtlMs,
    };
    this.locks.push(newLock);
    return newLock;
  }

  /**
   * Checks if an area is currently locked by another peer.
   */
  public isRegionLocked(
    bounds: [number, number, number, number],
    currentTimeMs: number = Date.now(),
    excludeClientId?: string
  ): boolean {
    this.purgeExpiredLocks(currentTimeMs);

    return this.locks.some(
      (lock) =>
        (!excludeClientId || lock.clientId !== excludeClientId) &&
        checkSpatialOverlap(lock.bounds, bounds, this.config.lockPaddingPx)
    );
  }

  private purgeExpiredLocks(currentTimeMs: number): void {
    this.locks = this.locks.filter((l) => currentTimeMs < l.expiresAtMs);
  }

  /**
   * Returns active non-tombstoned strokes in deterministic total order.
   */
  public getActiveStrokes(): CRDTOperation[] {
    return this.operations.filter((op) => !op.tombstoned && op.opType === 'insert');
  }
}
