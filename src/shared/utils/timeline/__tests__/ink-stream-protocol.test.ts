import { describe, it, expect } from 'vitest';
import {
  createInkPacket,
  encodeInkPacket,
  decodeInkPacket,
  InkStreamAccumulator,
  type StrokeVertex3D,
} from '../ink-stream-protocol';

describe('ink-stream-protocol', () => {
  it('creates, encodes, and decodes stamped live ink packets', () => {
    const packet = createInkPacket('touchdown', 150.5, 230.25, 0.85, 45.0, {
      tool: 'marker',
      color: '#0055ff',
    });

    expect(packet.seq).toBeGreaterThan(0);
    expect(packet.timestampMs).toBeGreaterThan(0);
    expect(packet.packetType).toBe('touchdown');

    const encoded = encodeInkPacket(packet);
    expect(typeof encoded).toBe('string');

    const decoded = decodeInkPacket(encoded);
    expect(decoded.seq).toBe(packet.seq);
    expect(decoded.packetType).toBe('touchdown');
    expect(decoded.x).toBeCloseTo(150.5, 3);
    expect(decoded.y).toBeCloseTo(230.25, 3);
    expect(decoded.pressure).toBeCloseTo(0.85, 3);
    expect(decoded.metadata?.tool).toBe('marker');
  });

  it('accumulates discrete packet stream into complete continuous strokes', () => {
    const completedStrokes: StrokeVertex3D[][] = [];
    const accumulator = new InkStreamAccumulator({
      onStrokeCompleted: (stroke) => {
        completedStrokes.push(stroke);
      },
    });

    // Send drawing sequence
    accumulator.processPacket(createInkPacket('touchdown', 10, 10, 0.4));
    accumulator.processPacket(createInkPacket('vertex', 20, 15, 0.6));
    accumulator.processPacket(createInkPacket('vertex', 35, 25, 0.8));
    accumulator.processPacket(createInkPacket('lift', 50, 40, 0.3));

    expect(completedStrokes.length).toBe(1);
    expect(completedStrokes[0].length).toBe(4);
    expect(completedStrokes[0][0]).toEqual([10, 10, 0.4]);
    expect(completedStrokes[0][3]).toEqual([50, 40, 0.3]);
    expect(accumulator.isDrawing).toBe(false);

    // Send reset packet
    accumulator.processPacket(createInkPacket('reset'));
    expect(accumulator.completedStrokes.length).toBe(0);
  });

  it('handles erase packets and invokes callback', () => {
    let erased = false;
    let receivedMeta: any = null;

    const accumulator = new InkStreamAccumulator({
      onEraseAction: (meta) => {
        erased = true;
        receivedMeta = meta;
      },
    });

    accumulator.processPacket(
      createInkPacket('erase', 0, 0, 1.0, 0, { pattern: 'zigzag', durationSec: 1.5 })
    );

    expect(erased).toBe(true);
    expect(receivedMeta.pattern).toBe('zigzag');
  });
});
