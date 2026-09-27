import { describe, it, expect } from 'vitest';
import {
  MAGIC_HEADER,
  PROTOCOL_VERSION,
  FLAG_START,
  FLAG_CONCEALED,
  DEFAULT_LIVE_SYNC_CONFIG,
  validateLiveSyncConfig,
  packStrokePacket,
  unpackStrokePacket,
  interpolateHermiteLoss,
  JitterBufferQueue,
  SyncPoint,
} from '../live-stream-sync-ops';

describe('Multi-Client Whiteboard Live Stream Sync Protocol & Jitter Buffer Operations', () => {
  describe('validateLiveSyncConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateLiveSyncConfig();
      expect(cfg).toEqual(DEFAULT_LIVE_SYNC_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.minDelayMs).toBe(20.0);
      expect(cfg.targetDelayMs).toBe(60.0);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateLiveSyncConfig({
        minDelayMs: 2,
        maxDelayMs: 5000,
        targetDelayMs: 2000,
        smoothingAlpha: 0.9,
      });

      expect(clamped.minDelayMs).toBe(5);
      expect(clamped.maxDelayMs).toBe(1000);
      expect(clamped.targetDelayMs).toBe(1000);
      expect(clamped.smoothingAlpha).toBe(0.5);
    });
  });

  describe('packStrokePacket & unpackStrokePacket', () => {
    it('serializes and deserializes packed binary frame with zero loss', () => {
      const points: SyncPoint[] = [
        { x: 150.25, y: 300.5, pressure: 0.75, dtMs: 16 },
        { x: 155.0, y: 308.25, pressure: 0.85, dtMs: 16 },
      ];

      const packed = packStrokePacket(1001, 7, 25000, FLAG_START, points);
      expect(packed.byteLength).toBe(16 + 2 * 10); // 36 bytes

      const unpacked = unpackStrokePacket(packed);
      expect(unpacked.header.magic).toBe(MAGIC_HEADER);
      expect(unpacked.header.version).toBe(PROTOCOL_VERSION);
      expect(unpacked.header.flags).toBe(FLAG_START);
      expect(unpacked.header.clientId).toBe(7);
      expect(unpacked.header.seqId).toBe(1001);
      expect(unpacked.header.timestampMs).toBe(25000);
      expect(unpacked.points.length).toBe(2);

      expect(unpacked.points[0].x).toBeCloseTo(150.25, 2);
      expect(unpacked.points[0].y).toBeCloseTo(300.5, 2);
      expect(unpacked.points[0].pressure).toBeCloseTo(0.75, 2);
      expect(unpacked.points[0].dtMs).toBe(16);
    });

    it('throws error when buffer is too short or has wrong magic', () => {
      expect(() => unpackStrokePacket(new Uint8Array(10))).toThrow(/too short/);

      const invalidMagic = new Uint8Array(20);
      expect(() => unpackStrokePacket(invalidMagic)).toThrow(/Invalid protocol magic/);
    });
  });

  describe('interpolateHermiteLoss', () => {
    it('returns empty array when missing count is zero or negative', () => {
      const p0: SyncPoint = { x: 0, y: 0, pressure: 0.5, dtMs: 16 };
      const p1: SyncPoint = { x: 10, y: 10, pressure: 0.5, dtMs: 16 };
      expect(interpolateHermiteLoss(p0, p1, 0)).toEqual([]);
    });

    it('generates smooth cubic Hermite interpolated coordinate points', () => {
      const p0: SyncPoint = { x: 0, y: 0, pressure: 0.2, dtMs: 16 };
      const p1: SyncPoint = { x: 100, y: 100, pressure: 0.8, dtMs: 16 };
      const res = interpolateHermiteLoss(p0, p1, 1);

      expect(res.length).toBe(1);
      expect(res[0].x).toBeCloseTo(50, 1);
      expect(res[0].y).toBeCloseTo(50, 1);
      expect(res[0].pressure).toBeCloseTo(0.5, 2);
    });
  });

  describe('JitterBufferQueue', () => {
    it('reorders out-of-order sequence packets before playout', () => {
      const jb = new JitterBufferQueue({ targetDelayMs: 40.0 });
      const p1 = {
        header: { magic: MAGIC_HEADER, version: PROTOCOL_VERSION, flags: 0, clientId: 1, seqId: 1, timestampMs: 1000, pointCount: 1 },
        points: [{ x: 10, y: 10, pressure: 0.5, dtMs: 16 }],
      };
      const p2 = {
        header: { magic: MAGIC_HEADER, version: PROTOCOL_VERSION, flags: 0, clientId: 1, seqId: 2, timestampMs: 1016, pointCount: 1 },
        points: [{ x: 20, y: 20, pressure: 0.5, dtMs: 16 }],
      };

      // Push seq 2 first, then seq 1
      jb.pushPacket(p2, 1000);
      jb.pushPacket(p1, 1005);

      // Before playout
      expect(jb.popReadyPackets(1020).length).toBe(0);

      // At playout time
      const popped = jb.popReadyPackets(1080);
      expect(popped.length).toBe(2);
      expect(popped[0].header.seqId).toBe(1);
      expect(popped[1].header.seqId).toBe(2);
    });

    it('estimates network jitter variance under fluctuating arrival latencies', () => {
      const jb = new JitterBufferQueue({ targetDelayMs: 50.0 });
      const arrivals = [
        { seq: 1, ts: 1000, arr: 1040 },
        { seq: 2, ts: 1016, arr: 1100 },
        { seq: 3, ts: 1032, arr: 1055 },
        { seq: 4, ts: 1048, arr: 1115 },
      ];

      for (const item of arrivals) {
        jb.pushPacket(
          {
            header: { magic: MAGIC_HEADER, version: PROTOCOL_VERSION, flags: 0, clientId: 1, seqId: item.seq, timestampMs: item.ts, pointCount: 1 },
            points: [{ x: item.seq * 10, y: 10, pressure: 0.5, dtMs: 16 }],
          },
          item.arr
        );
      }

      const stats = jb.getStats();
      expect(stats.estimatedJitterMs).toBeGreaterThan(0.0);
      expect(stats.packetsReceived).toBe(4);
    });

    it('performs packet loss concealment (PLC) inserting interpolated packet on sequence gap', () => {
      const jb = new JitterBufferQueue({ targetDelayMs: 40.0, plcEnabled: true });
      const p1 = {
        header: { magic: MAGIC_HEADER, version: PROTOCOL_VERSION, flags: 0, clientId: 1, seqId: 5, timestampMs: 1000, pointCount: 1 },
        points: [{ x: 50, y: 50, pressure: 0.4, dtMs: 16 }],
      };
      const p3 = {
        header: { magic: MAGIC_HEADER, version: PROTOCOL_VERSION, flags: 0, clientId: 1, seqId: 7, timestampMs: 1032, pointCount: 1 },
        points: [{ x: 90, y: 90, pressure: 0.8, dtMs: 16 }],
      };

      jb.pushPacket(p1, 1000);
      // Skip seq 6, directly push seq 7
      jb.pushPacket(p3, 1035);

      const popped = jb.popReadyPackets(1100);
      expect(popped.length).toBe(3); // seq 5, concealed seq 6, seq 7
      expect(popped[1].header.flags & FLAG_CONCEALED).toBeTruthy();
      expect(popped[1].points[0].x).toBeGreaterThan(50);
      expect(popped[1].points[0].x).toBeLessThan(90);
    });
  });
});
