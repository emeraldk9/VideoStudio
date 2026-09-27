/**
 * Whiteboard Real-Time Live Ink Stream Protocol (LISP) & Broadcast Bridge Operations.
 * Ultra-low-latency serialization and accumulation of live vector stroke events
 * between interactive canvas surfaces and headless rendering runtimes.
 */

export type InkPacketType = 'touchdown' | 'vertex' | 'lift' | 'erase' | 'camera' | 'reset';

export interface InkStreamPacket {
  seq: number;
  timestampMs: number;
  packetType: InkPacketType;
  x: number;
  y: number;
  pressure: number;
  nibAngleDeg?: number;
  metadata?: Record<string, any>;
}

export type StrokeVertex3D = [number, number, number]; // [x, y, pressure]

let globalPacketSeq = 0;

/**
 * Creates a stamped InkStreamPacket with monotonic sequence number and timestamp.
 */
export function createInkPacket(
  packetType: InkPacketType,
  x: number = 0,
  y: number = 0,
  pressure: number = 1.0,
  nibAngleDeg: number = 45.0,
  metadata?: Record<string, any>
): InkStreamPacket {
  return {
    seq: ++globalPacketSeq,
    timestampMs: Date.now(),
    packetType,
    x,
    y,
    pressure,
    nibAngleDeg,
    metadata,
  };
}

/**
 * Serializes packet to compact JSON.
 */
export function encodeInkPacket(packet: InkStreamPacket): string {
  return JSON.stringify(packet);
}

/**
 * Deserializes packet from JSON string.
 */
export function decodeInkPacket(raw: string): InkStreamPacket {
  const data = JSON.parse(raw);
  return {
    seq: Number(data.seq ?? 0),
    timestampMs: Number(data.timestampMs ?? 0),
    packetType: data.packetType ?? 'vertex',
    x: Number(data.x ?? 0),
    y: Number(data.y ?? 0),
    pressure: Number(data.pressure ?? 1.0),
    nibAngleDeg: data.nibAngleDeg !== undefined ? Number(data.nibAngleDeg) : undefined,
    metadata: data.metadata,
  };
}

/**
 * Reconstructs continuous stroke polylines and presentation actions from an incoming packet stream.
 */
export class InkStreamAccumulator {
  public currentStroke: StrokeVertex3D[] = [];
  public completedStrokes: StrokeVertex3D[][] = [];
  public isDrawing: boolean = false;
  public lastSeq: number = -1;

  public onStrokeCompleted?: (stroke: StrokeVertex3D[]) => void;
  public onEraseAction?: (metadata: Record<string, any>) => void;

  constructor(options?: {
    onStrokeCompleted?: (stroke: StrokeVertex3D[]) => void;
    onEraseAction?: (metadata: Record<string, any>) => void;
  }) {
    this.onStrokeCompleted = options?.onStrokeCompleted;
    this.onEraseAction = options?.onEraseAction;
  }

  public processPacket(packet: InkStreamPacket): void {
    this.lastSeq = packet.seq;

    switch (packet.packetType) {
      case 'touchdown':
        this.isDrawing = true;
        this.currentStroke = [[packet.x, packet.y, packet.pressure]];
        break;

      case 'vertex':
        if (this.isDrawing) {
          this.currentStroke.push([packet.x, packet.y, packet.pressure]);
        }
        break;

      case 'lift':
        if (this.isDrawing) {
          this.currentStroke.push([packet.x, packet.y, packet.pressure]);
          if (this.currentStroke.length >= 2) {
            this.completedStrokes.push(this.currentStroke);
            this.onStrokeCompleted?.(this.currentStroke);
          }
          this.currentStroke = [];
          this.isDrawing = false;
        }
        break;

      case 'erase':
        this.onEraseAction?.(packet.metadata ?? {});
        break;

      case 'reset':
        this.reset();
        break;
    }
  }

  public reset(): void {
    this.currentStroke = [];
    this.completedStrokes = [];
    this.isDrawing = false;
  }
}
