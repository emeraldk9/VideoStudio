/**
 * Multi-Client Whiteboard Live Stream Sync Protocol & Jitter Buffer Operations.
 *
 * Implements real-time collaborative streaming and network synchronization:
 * 1. Packed binary wire serialization format (0x5742 magic, 16-byte header, 10-byte points).
 * 2. Dynamic adaptive jitter buffer with monotonic playout clock scheduling.
 * 3. Sequence reordering and late packet handling.
 * 4. Hermite spline packet loss concealment (PLC) for missing coordinate intervals.
 * 5. Multi-client cursor presence, latency estimation, and jitter telemetry.
 */

export const MAGIC_HEADER = 0x5742; // 'WB'
export const PROTOCOL_VERSION = 1;

export const FLAG_NONE = 0x00;
export const FLAG_START = 0x01;
export const FLAG_END = 0x02;
export const FLAG_KEYFRAME = 0x04;
export const FLAG_CONCEALED = 0x08;

export interface SyncPoint {
  x: number;
  y: number;
  pressure: number; // 0.0 to 1.0
  dtMs: number;     // Delta time from packet timestamp in ms
}

export interface SyncPacketHeader {
  magic: number;
  version: number;
  flags: number;
  clientId: number;
  seqId: number;
  timestampMs: number;
  pointCount: number;
}

export interface StrokePacket {
  header: SyncPacketHeader;
  points: SyncPoint[];
}

export interface JitterBufferConfig {
  enabled: boolean;
  minDelayMs: number;          // Minimum buffer latency in ms (default: 20)
  maxDelayMs: number;          // Maximum buffer latency ceiling in ms (default: 300)
  targetDelayMs: number;       // Nominal baseline playout delay in ms (default: 60)
  smoothingAlpha: number;      // Exponential moving average filter factor (default: 0.1)
  plcEnabled: boolean;         // Enable Hermite packet loss concealment (default: true)
  showCursorPresence: boolean; // Display remote collaborator cursor avatars (default: true)
}

export type LiveSyncSettings = Partial<JitterBufferConfig>;

export const DEFAULT_LIVE_SYNC_CONFIG: JitterBufferConfig = {
  enabled: false,
  minDelayMs: 20.0,
  maxDelayMs: 300.0,
  targetDelayMs: 60.0,
  smoothingAlpha: 0.1,
  plcEnabled: true,
  showCursorPresence: true,
};

export interface JitterBufferStats {
  estimatedJitterMs: number;
  currentDelayMs: number;
  packetsReceived: number;
  packetsEmitted: number;
  packetsDropped: number;
  packetsConcealed: number;
}

/**
 * Validates and clamps live stream synchronization and jitter buffer configuration.
 */
export function validateLiveSyncConfig(
  config?: Partial<JitterBufferConfig>
): JitterBufferConfig {
  if (!config) {
    return { ...DEFAULT_LIVE_SYNC_CONFIG };
  }

  const minD = Math.max(5, Math.min(100, Number(config.minDelayMs ?? DEFAULT_LIVE_SYNC_CONFIG.minDelayMs)));
  const maxD = Math.max(minD + 10, Math.min(1000, Number(config.maxDelayMs ?? DEFAULT_LIVE_SYNC_CONFIG.maxDelayMs)));
  const targetD = Math.max(minD, Math.min(maxD, Number(config.targetDelayMs ?? DEFAULT_LIVE_SYNC_CONFIG.targetDelayMs)));

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_LIVE_SYNC_CONFIG.enabled),
    minDelayMs: minD,
    maxDelayMs: maxD,
    targetDelayMs: targetD,
    smoothingAlpha: Math.max(0.01, Math.min(0.5, Number(config.smoothingAlpha ?? DEFAULT_LIVE_SYNC_CONFIG.smoothingAlpha))),
    plcEnabled: Boolean(config.plcEnabled ?? DEFAULT_LIVE_SYNC_CONFIG.plcEnabled),
    showCursorPresence: Boolean(config.showCursorPresence ?? DEFAULT_LIVE_SYNC_CONFIG.showCursorPresence),
  };
}

/**
 * Packs stroke packet into compact binary format using DataView (Big-Endian network order).
 * Header: 16 Bytes. Points: 10 Bytes per point (Float32 x, Float32 y, Uint8 p, Uint8 dt).
 */
export function packStrokePacket(
  seqId: number,
  clientId: number,
  timestampMs: number,
  flags: number,
  points: SyncPoint[]
): Uint8Array {
  const nPts = points.length;
  const totalBytes = 16 + nPts * 10;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // Header (16 bytes)
  view.setUint16(0, MAGIC_HEADER, false);       // Big-endian
  view.setUint8(2, PROTOCOL_VERSION);
  view.setUint8(3, flags & 0xff);
  view.setUint16(4, clientId & 0xffff, false);
  view.setUint32(6, seqId >>> 0, false);
  view.setUint32(10, timestampMs >>> 0, false);
  view.setUint16(14, nPts & 0xffff, false);

  // Points (10 bytes each)
  let offset = 16;
  for (let i = 0; i < nPts; i++) {
    const pt = points[i];
    view.setFloat32(offset, pt.x, false);
    view.setFloat32(offset + 4, pt.y, false);
    view.setUint8(offset + 8, Math.max(0, Math.min(255, Math.round(pt.pressure * 255))));
    view.setUint8(offset + 9, Math.max(0, Math.min(255, Math.round(pt.dtMs))));
    offset += 10;
  }

  return new Uint8Array(buffer);
}

/**
 * Unpacks binary buffer into a StrokePacket object.
 */
export function unpackStrokePacket(buffer: Uint8Array): StrokePacket {
  if (buffer.byteLength < 16) {
    throw new Error(`Packet too short: ${buffer.byteLength} bytes (minimum 16 bytes required)`);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const magic = view.getUint16(0, false);
  if (magic !== MAGIC_HEADER) {
    throw new Error(`Invalid protocol magic: 0x${magic.toString(16)} (expected 0x${MAGIC_HEADER.toString(16)})`);
  }

  const version = view.getUint8(2);
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version} (expected ${PROTOCOL_VERSION})`);
  }

  const flags = view.getUint8(3);
  const clientId = view.getUint16(4, false);
  const seqId = view.getUint32(6, false);
  const timestampMs = view.getUint32(10, false);
  const pointCount = view.getUint16(14, false);

  const expectedLength = 16 + pointCount * 10;
  if (buffer.byteLength < expectedLength) {
    throw new Error(`Truncated packet: has ${buffer.byteLength} bytes, expected ${expectedLength}`);
  }

  const points: SyncPoint[] = [];
  let offset = 16;
  for (let i = 0; i < pointCount; i++) {
    const x = view.getFloat32(offset, false);
    const y = view.getFloat32(offset + 4, false);
    const pByte = view.getUint8(offset + 8);
    const dtByte = view.getUint8(offset + 9);

    points.push({
      x,
      y,
      pressure: pByte / 255.0,
      dtMs: dtByte,
    });
    offset += 10;
  }

  return {
    header: {
      magic,
      version,
      flags,
      clientId,
      seqId,
      timestampMs,
      pointCount,
    },
    points,
  };
}

/**
 * Interpolates missing coordinate points using cubic Hermite velocity continuity.
 */
export function interpolateHermiteLoss(
  p0: SyncPoint,
  p1: SyncPoint,
  missingCount: number
): SyncPoint[] {
  if (missingCount <= 0) return [];

  const interpolated: SyncPoint[] = [];
  for (let i = 1; i <= missingCount; i++) {
    const t = i / (missingCount + 1);
    // Smoothstep Hermite polynomial: 3t^2 - 2t^3
    const h = t * t * (3.0 - 2.0 * t);
    const ix = p0.x * (1.0 - h) + p1.x * h;
    const iy = p0.y * (1.0 - h) + p1.y * h;
    const ip = p0.pressure * (1.0 - h) + p1.pressure * h;
    const idt = Math.round(p0.dtMs * (1.0 - t) + p1.dtMs * t);

    interpolated.push({
      x: ix,
      y: iy,
      pressure: ip,
      dtMs: idt,
    });
  }

  return interpolated;
}

/**
 * Dynamic adaptive jitter buffer managing playout clock scheduling, sequence
 * reordering, packet loss concealment, and network latency jitter estimation.
 */
export class JitterBufferQueue {
  private config: JitterBufferConfig;
  private stats: JitterBufferStats;
  private queue: Array<{ playoutTimeMs: number; packet: StrokePacket }> = [];
  private firstPacketArrival: number | null = null;
  private firstPacketTimestamp: number | null = null;
  private lastSeqId: number | null = null;
  private lastPacket: StrokePacket | null = null;
  private avgTransitDelay: number | null = null;

  constructor(config?: Partial<JitterBufferConfig>) {
    this.config = validateLiveSyncConfig(config);
    this.stats = {
      estimatedJitterMs: 0.0,
      currentDelayMs: this.config.targetDelayMs,
      packetsReceived: 0,
      packetsEmitted: 0,
      packetsDropped: 0,
      packetsConcealed: 0,
    };
  }

  public pushPacket(packet: StrokePacket, arrivalTimeMs: number): boolean {
    this.stats.packetsReceived++;

    if (this.firstPacketArrival === null || this.firstPacketTimestamp === null) {
      this.firstPacketArrival = arrivalTimeMs;
      this.firstPacketTimestamp = packet.header.timestampMs;
      this.avgTransitDelay = arrivalTimeMs - packet.header.timestampMs;
    }

    const transitDelay = arrivalTimeMs - packet.header.timestampMs;
    if (this.avgTransitDelay !== null) {
      const diff = Math.abs(transitDelay - this.avgTransitDelay);
      const alpha = this.config.smoothingAlpha;
      this.stats.estimatedJitterMs = (1.0 - alpha) * this.stats.estimatedJitterMs + alpha * diff;
      this.avgTransitDelay = (1.0 - alpha) * this.avgTransitDelay + alpha * transitDelay;
    }

    const adaptedDelay = Math.max(
      this.config.minDelayMs,
      Math.min(this.config.maxDelayMs, this.config.targetDelayMs + 2.5 * this.stats.estimatedJitterMs)
    );
    this.stats.currentDelayMs = adaptedDelay;

    const packetOffset = packet.header.timestampMs - this.firstPacketTimestamp;
    const scheduledPlayout = this.firstPacketArrival + this.stats.currentDelayMs + packetOffset;

    if (arrivalTimeMs > scheduledPlayout) {
      this.stats.packetsDropped++;
      return false;
    }

    // Insert sorted by seqId
    let inserted = false;
    for (let idx = 0; idx < this.queue.length; idx++) {
      if (packet.header.seqId < this.queue[idx].packet.header.seqId) {
        this.queue.splice(idx, 0, { playoutTimeMs: scheduledPlayout, packet });
        inserted = true;
        break;
      } else if (packet.header.seqId === this.queue[idx].packet.header.seqId) {
        return false; // Duplicate
      }
    }

    if (!inserted) {
      this.queue.push({ playoutTimeMs: scheduledPlayout, packet });
    }

    return true;
  }

  public popReadyPackets(currentTimeMs: number): StrokePacket[] {
    const ready: StrokePacket[] = [];

    while (this.queue.length > 0 && this.queue[0].playoutTimeMs <= currentTimeMs) {
      const item = this.queue.shift()!;
      const packet = item.packet;

      if (this.config.plcEnabled && this.lastSeqId !== null && this.lastPacket !== null) {
        const gap = packet.header.seqId - this.lastSeqId;
        if (gap > 1 && gap <= 4 && this.lastPacket.points.length > 0 && packet.points.length > 0) {
          const p0 = this.lastPacket.points[this.lastPacket.points.length - 1];
          const p1 = packet.points[0];
          const interpolated = interpolateHermiteLoss(p0, p1, gap - 1);
          if (interpolated.length > 0) {
            const concealedHdr: SyncPacketHeader = {
              magic: MAGIC_HEADER,
              version: PROTOCOL_VERSION,
              flags: FLAG_CONCEALED,
              clientId: packet.header.clientId,
              seqId: this.lastSeqId + 1,
              timestampMs: Math.round((this.lastPacket.header.timestampMs + packet.header.timestampMs) / 2),
              pointCount: interpolated.length,
            };
            ready.push({ header: concealedHdr, points: interpolated });
            this.stats.packetsConcealed++;
          }
        }
      }

      ready.push(packet);
      this.lastSeqId = packet.header.seqId;
      this.lastPacket = packet;
      this.stats.packetsEmitted++;
    }

    return ready;
  }

  public getStats(): JitterBufferStats {
    return { ...this.stats };
  }
}
