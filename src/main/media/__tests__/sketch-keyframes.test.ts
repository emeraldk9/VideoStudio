import { describe, expect, it } from 'vitest';

import {
  resolveWhiteboardInFrame,
  resolveWhiteboardOutFrame,
  resolveWhiteboardInSeconds,
  resolveWhiteboardOutSeconds,
  whiteboardEffectiveInFraction,
  whiteboardEffectiveDrawFraction,
  whiteboardProgressAtFrame,
  whiteboardZoneTimeSlices,
  zoneThumbnailViewBox,
  buildTimelineFullJson,
  clipEffectsSchema,
  type SequenceDocument,
  type WhiteboardSettings,
  type WhiteboardZone,
} from '../../../shared';

describe('Sketch Keyframe In / Out Engine', () => {
  const fps = 30;
  const durationFrames = 120; // 4.0 seconds

  it('resolves default In and Out keyframes accurately', () => {
    const defaultSettings: WhiteboardSettings = {
      pattern: 'serpentine',
      rows: 8,
      hand: 'pen',
      look: 'none',
      drawFraction: 0.8,
    };

    const inSeconds = resolveWhiteboardInSeconds(defaultSettings, durationFrames, fps);
    const outSeconds = resolveWhiteboardOutSeconds(defaultSettings, durationFrames, fps);

    expect(inSeconds).toBe(0);
    expect(outSeconds).toBeCloseTo(3.2, 2);

    const inFrame = resolveWhiteboardInFrame(defaultSettings, durationFrames, fps);
    const outFrame = resolveWhiteboardOutFrame(defaultSettings, durationFrames, fps);

    expect(inFrame).toBe(0);
    expect(outFrame).toBe(96); // 3.2s * 30fps = 96
  });

  it('respects customized inFraction and inSeconds', () => {
    const customSettings: WhiteboardSettings = {
      pattern: 'trace',
      rows: 1,
      hand: 'marker',
      look: 'sketch',
      inFraction: 0.25, // Starts at 1.0s (30f)
      drawFraction: 0.75, // Finishes at 3.0s (90f)
    };

    const inSeconds = resolveWhiteboardInSeconds(customSettings, durationFrames, fps);
    const outSeconds = resolveWhiteboardOutSeconds(customSettings, durationFrames, fps);

    expect(inSeconds).toBeCloseTo(1.0, 2);
    expect(outSeconds).toBeCloseTo(3.0, 2);

    const inFrame = resolveWhiteboardInFrame(customSettings, durationFrames, fps);
    const outFrame = resolveWhiteboardOutFrame(customSettings, durationFrames, fps);

    expect(inFrame).toBe(30);
    expect(outFrame).toBe(90);
  });

  it('clamps inFrame strictly before outFrame', () => {
    const extremeSettings: WhiteboardSettings = {
      pattern: 'wipe',
      rows: 1,
      hand: 'none',
      look: 'pencil',
      inFraction: 0.95, // Higher than drawFraction
      drawFraction: 0.5,
    };

    const inFrame = resolveWhiteboardInFrame(extremeSettings, durationFrames, fps);
    const outFrame = resolveWhiteboardOutFrame(extremeSettings, durationFrames, fps);

    // inFrame must never exceed outFrame - 1
    expect(inFrame).toBeLessThan(outFrame);
  });

  it('calculates whiteboardProgressAtFrame correctly across lifecycle', () => {
    const inFrame = 30;
    const outFrame = 90;

    // Before In: must be 0 (no drawing yet / initial canvas state)
    expect(whiteboardProgressAtFrame(0, inFrame, outFrame)).toBe(0);
    expect(whiteboardProgressAtFrame(29, inFrame, outFrame)).toBe(0);
    expect(whiteboardProgressAtFrame(30, inFrame, outFrame)).toBe(0);

    // Halfway through drawing: 0.5
    expect(whiteboardProgressAtFrame(60, inFrame, outFrame)).toBe(0.5);

    // Exactly at Out: 1.0 (drawing completely revealed)
    expect(whiteboardProgressAtFrame(90, inFrame, outFrame)).toBe(1);

    // After Out: 1.0 (hold phase)
    expect(whiteboardProgressAtFrame(100, inFrame, outFrame)).toBe(1);
    expect(whiteboardProgressAtFrame(120, inFrame, outFrame)).toBe(1);
  });

  it('exports sketch inFraction and inSeconds losslessly in timeline v2 JSON export', () => {
    const mockDoc: SequenceDocument = {
      sequence: {
        id: 'seq-1',
        projectId: 'proj-1',
        name: 'Test Sequence',
        fps: 30,
        width: 1920,
        height: 1080,
        spineTrackId: 'track-v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      tracks: [
        {
          id: 'track-v1',
          sequenceId: 'seq-1',
          kind: 'video',
          orderIndex: 0,
          name: 'Video 1',
          magnetic: true,
          locked: false,
          muted: false,
          videoEnabled: true,
          heightPx: 64,
          role: null,
        },
      ],
      clips: [
        {
          id: 'clip-still-1',
          sequenceId: 'seq-1',
          trackId: 'track-v1',
          sourceKind: 'still',
          orderIndex: 0,
          durationFrames: 120,
          filePath: 'C:/media/still.jpg',
          label: 'Hero Still',
          gainDb: 0,
          overrides: [],
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          fadeInFrames: 0,
          fadeOutFrames: 0,
          effects: {
            whiteboard: {
              pattern: 'serpentine',
              rows: 8,
              hand: 'pen',
              look: 'sketch',
              inFraction: 0.15,
              drawFraction: 0.85,
            },
          },
        },
      ],
    };

    const exportedJson = buildTimelineFullJson(mockDoc);
    const exported = JSON.parse(exportedJson);
    const clipJson = exported.clips[0] as Record<string, unknown>;
    const wb = clipJson.whiteboard as WhiteboardSettings;

    expect(wb).toBeDefined();
    expect(wb.inFraction).toBe(0.15);
    expect(wb.drawFraction).toBe(0.85);
    expect(wb.look).toBe('sketch');
  });

  it('computes whiteboardZoneTimeSlices accurately for timeline lane display', () => {
    const zones: WhiteboardZone[] = [
      { points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }], weight: 1, type: 'writing', entrance: 'draw' },
      { points: [{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.4 }], weight: 1, type: 'sketch', entrance: 'draw' },
      { points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.9 }], weight: 2, type: 'wipe', entrance: 'draw' },
    ];

    const inFrame = 30;
    const outFrame = 110; // 80 frames span: weights 1, 1, 2 (total 4 -> 25%, 25%, 50%)
    const slices = whiteboardZoneTimeSlices(zones, inFrame, outFrame, fps);

    expect(slices).toHaveLength(3);

    // Zone 0: 0% to 25% of 80 frames = 20 frames -> [30, 50]
    expect(slices[0].startFrame).toBe(30);
    expect(slices[0].endFrame).toBe(50);
    expect(slices[0].durationFrames).toBe(20);
    expect(slices[0].durationSeconds).toBeCloseTo(20 / 30, 2);

    // Zone 1: 25% to 50% of 80 frames = 20 frames -> [50, 70]
    expect(slices[1].startFrame).toBe(50);
    expect(slices[1].endFrame).toBe(70);
    expect(slices[1].durationFrames).toBe(20);

    // Zone 2: 50% to 100% of 80 frames = 40 frames -> [70, 110]
    expect(slices[2].startFrame).toBe(70);
    expect(slices[2].endFrame).toBe(110);
    expect(slices[2].durationFrames).toBe(40);
  });

  it('computes zoneThumbnailViewBox with correct padding and bounds', () => {
    const points = [
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.3 },
      { x: 0.6, y: 0.7 },
      { x: 0.2, y: 0.7 },
    ];

    const viewBox = zoneThumbnailViewBox(points, 1920, 1080);
    expect(viewBox).toBeTruthy();

    const parts = viewBox.split(' ').map(Number);
    expect(parts).toHaveLength(4);
    const [minX, minY, boxW, boxH] = parts;

    // Bounds: x 0.2 -> 384, w 0.4 -> 768. With 5% padding:
    expect(minX).toBeLessThan(384);
    expect(minY).toBeLessThan(324);
    expect(boxW).toBeGreaterThan(768);
    expect(boxH).toBeGreaterThan(432);

    // Empty points fallback
    expect(zoneThumbnailViewBox([], 1920, 1080)).toBe('0 0 1920 1080');
  });

  it('validates whiteboard inFraction and inSeconds in clipEffectsSchema without throwing', () => {
    const payload = {
      whiteboard: {
        pattern: 'serpentine' as const,
        rows: 8,
        hand: 'pen' as const,
        look: 'sketch' as const,
        inFraction: 0.15,
        inSeconds: 0.6,
        drawFraction: 0.85,
        drawSeconds: 3.4,
      },
    };
    const parsed = clipEffectsSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});

