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
  exportWhiteboardAnnotation,
  importWhiteboardAnnotation,
  WHITEBOARD_PRESETS,
  autoAlignWhiteboardToAudioPeaks,
  type SequenceDocument,
  type WhiteboardSettings,
  type WhiteboardZone,
} from '../../../shared';
import { parseSvgToVectorStrokes, traceSvg } from '../whiteboard-svg';
import { FOLEY_STYLUS_CONFIGS } from '../../../renderer/features/timeline-media/lib/whiteboard-foley';

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

  describe('Whiteboard Annotation Bridge Roundtrip', () => {
    it('exports zones into valid annotation.json structure', () => {
      const zones: WhiteboardZone[] = [
        {
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.1 },
            { x: 0.5, y: 0.5 },
            { x: 0.1, y: 0.5 },
          ],
          entrance: 'draw',
          type: 'sketch',
          weight: 1.5,
          sweep: 'lr',
        },
        {
          points: [
            { x: 0.6, y: 0.2 },
            { x: 0.9, y: 0.2 },
            { x: 0.9, y: 0.8 },
            { x: 0.6, y: 0.8 },
          ],
          entrance: 'draw',
          type: 'wipe',
          sweep: 'tb',
          weight: 2.0,
        },
      ];

      const exported = exportWhiteboardAnnotation(zones, 1920, 1080);
      expect(exported.canvas).toEqual({ width: 1920, height: 1080 });
      expect(exported.elements).toHaveLength(2);

      const el0 = exported.elements[0];
      expect(el0.id).toBe('zone_1');
      expect(el0.reveal.style).toBe('sketch');
      expect(el0.reveal.weight).toBe(1.5);
      expect(el0.region.x).toBe(192); // 0.1 * 1920
      expect(el0.region.y).toBe(108); // 0.1 * 1080
      expect(el0.region.width).toBe(768); // (0.5 - 0.1) * 1920
      expect(el0.region.height).toBe(432); // (0.5 - 0.1) * 1080

      const el1 = exported.elements[1];
      expect(el1.reveal.direction).toBe('top_to_bottom');
      expect(el1.reveal.style).toBe('wipe');
    });

    it('faithfully reconstructs WhiteboardZones from exported annotation', () => {
      const zones: WhiteboardZone[] = [
        {
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.3 },
            { x: 0.8, y: 0.7 },
            { x: 0.2, y: 0.7 },
          ],
          entrance: 'draw',
          type: 'writing',
          rows: 6,
          weight: 1.25,
        },
      ];

      const exported = exportWhiteboardAnnotation(zones, 1920, 1080);
      const reimported = importWhiteboardAnnotation(exported, 1920, 1080);

      expect(reimported).toHaveLength(1);
      const z = reimported[0];
      expect(z.type).toBe('writing');
      expect(z.weight).toBe(1.25);
      expect(z.points).toHaveLength(4);
      expect(z.points[0].x).toBeCloseTo(0.2, 3);
      expect(z.points[0].y).toBeCloseTo(0.3, 3);
      expect(z.points[2].x).toBeCloseTo(0.8, 3);
      expect(z.points[2].y).toBeCloseTo(0.7, 3);
    });

    it('imports legacy/standard srt-whiteboard-animation annotation.json with region fallback', () => {
      const srtAnnotation = {
        canvas: { width: 1920, height: 1080 },
        elements: [
          {
            id: 'elem_1',
            label: 'Module Title',
            region: { x: 192, y: 108, width: 384, height: 216 },
            reveal: {
              direction: 'left_to_right',
              style: 'sketch',
              weight: 1.0,
            },
          },
        ],
      };

      const imported = importWhiteboardAnnotation(srtAnnotation, 1920, 1080);
      expect(imported).toHaveLength(1);
      const z = imported[0];
      expect(z.type).toBe('sketch');
      expect(z.sweep).toBe('lr');
      expect(z.points).toHaveLength(4);
      expect(z.points[0].x).toBeCloseTo(0.1, 2);
      expect(z.points[0].y).toBeCloseTo(0.1, 2);
      expect(z.points[2].x).toBeCloseTo(0.3, 2);
      expect(z.points[2].y).toBeCloseTo(0.3, 2);
    });
  });

  describe('Whiteboard Style Presets Gallery', () => {
    it('defines 5 distinct curated presets with complete metadata', () => {
      expect(WHITEBOARD_PRESETS).toHaveLength(5);
      const ids = WHITEBOARD_PRESETS.map((p) => p.id);
      expect(ids).toContain('notion-doodle');
      expect(ids).toContain('chalkboard-lecture');
      expect(ids).toContain('architect-blueprint');
      expect(ids).toContain('comic-pop');
      expect(ids).toContain('speed-paint');

      for (const preset of WHITEBOARD_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(preset.icon).toBeTruthy();
        expect(preset.paperColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(preset.cadenceFps).toBeGreaterThanOrEqual(4);
        expect(preset.cadenceFps).toBeLessThanOrEqual(30);
      }
    });

    it('each preset converts into a valid clipEffectsSchema whiteboard payload', () => {
      for (const preset of WHITEBOARD_PRESETS) {
        const settings: WhiteboardSettings = {
          pattern: preset.pattern,
          rows: preset.rows ?? 8,
          hand: preset.hand,
          look: preset.look,
          cadenceFps: preset.cadenceFps,
          drawFraction: preset.drawFraction ?? 0.85,
        };

        const payload = { whiteboard: settings };
        const validation = clipEffectsSchema.safeParse(payload);
        expect(validation.success).toBe(true);
      }
    });

    it('supports all 5 multi-stylus tools (pen, marker, pencil, chalk, none)', () => {
      const styluses: WhiteboardSettings['hand'][] = ['pen', 'marker', 'pencil', 'chalk', 'none'];
      for (const stylus of styluses) {
        const payload = {
          whiteboard: {
            pattern: 'trace' as const,
            rows: 8,
            hand: stylus,
            look: 'sketch' as const,
          },
        };
        const validation = clipEffectsSchema.safeParse(payload);
        expect(validation.success).toBe(true);
      }
    });
  });

  describe('Native Vector SVG Stroke Tracing Engine', () => {
    it('parses SVG lines, polylines, and Bézier curves into smooth vector strokes', () => {
      const svg = `
        <svg viewBox="0 0 100 100">
          <line x1="10" y1="10" x2="90" y2="10" />
          <polyline points="10,20 50,80 90,20" />
          <path d="M 10 50 C 30 10, 70 90, 90 50" />
        </svg>
      `;
      const strokes = parseSvgToVectorStrokes(svg, 200, 200);
      expect(strokes).toHaveLength(3);
      expect(strokes[0].length).toBeGreaterThanOrEqual(2);
      expect(strokes[1].length).toBeGreaterThanOrEqual(3);
      expect(strokes[2].length).toBeGreaterThan(4);
    });

    it('generates pristine timeMap and penPath from vector SVG without Sobel artifacts', () => {
      const svg = `
        <svg viewBox="0 0 200 200">
          <path d="M 20 20 L 180 20 L 180 180 L 20 180 Z" />
          <path d="M 50 100 C 50 50, 150 50, 150 100 S 50 150, 50 100" />
        </svg>
      `;
      const result = traceSvg(svg, 200, 200, { detail: 'high', order: 'nearest' });
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
      expect(result.strokeCount).toBe(2);
      expect(result.penPath.length).toBeGreaterThan(5);
      expect(result.penPath[0].t).toBeCloseTo(0, 2);
      expect(result.timeMap.length).toBe(40000);
      const drawnPixels = Array.from(result.timeMap).filter((v) => v < 255);
      expect(drawnPixels.length).toBeGreaterThan(100);
    });
  });

  describe('Audio Speech Cadence Alignment Engine (S90)', () => {
    it('returns standard defaults when audio is completely silent or empty', () => {
      const emptyResult = autoAlignWhiteboardToAudioPeaks([]);
      expect(emptyResult.inFraction).toBe(0);
      expect(emptyResult.drawFraction).toBe(0.85);

      const silentPeaks = new Array(100).fill(0.001);
      const silentResult = autoAlignWhiteboardToAudioPeaks(silentPeaks);
      expect(silentResult.inFraction).toBe(0);
      expect(silentResult.drawFraction).toBe(0.85);
    });

    it('accurately identifies speech onset and offset from audio peaks', () => {
      // 100 bins: 0..20 silence, 20..80 speech (0.6 amp), 80..100 silence
      const peaks = new Array(100).fill(0.005);
      for (let i = 20; i <= 80; i++) {
        peaks[i] = 0.65;
      }

      const result = autoAlignWhiteboardToAudioPeaks(peaks);
      // In should be near 0.18-0.20 (with small lead-in margin)
      expect(result.inFraction).toBeGreaterThanOrEqual(0.15);
      expect(result.inFraction).toBeLessThanOrEqual(0.22);

      // Out should be near 0.80-0.85
      expect(result.drawFraction).toBeGreaterThanOrEqual(0.78);
      expect(result.drawFraction).toBeLessThanOrEqual(0.86);
    });

    it('proportionally balances multi-zone weights according to speech energy in sub-segments', () => {
      const peaks = new Array(100).fill(0.01);
      // Zone 1 region (20..40): low speech energy (0.2)
      for (let i = 20; i < 40; i++) peaks[i] = 0.2;
      // Zone 2 region (40..80): high animated narration energy (0.8)
      for (let i = 40; i <= 80; i++) peaks[i] = 0.8;

      const dummyZones: WhiteboardZone[] = [
        { points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }], entrance: 'draw', type: 'sketch', weight: 1 },
        { points: [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }], entrance: 'draw', type: 'writing', weight: 1 },
      ];

      const result = autoAlignWhiteboardToAudioPeaks(peaks, dummyZones);
      expect(result.zones).toBeDefined();
      expect(result.zones).toHaveLength(2);
      // Zone 2 had significantly higher energy, so weight should be greater than Zone 1
      expect(result.zones![1].weight ?? 0).toBeGreaterThan(result.zones![0].weight ?? 0);
    });
  });

  describe('Procedural Whiteboard Audio Foley Sound Synthesis (S91)', () => {
    it('validates foleyEnabled and foleyVolume in clipEffectsSchema', () => {
      const validPayload = {
        whiteboard: {
          pattern: 'trace' as const,
          rows: 8,
          hand: 'marker' as const,
          look: 'sketch' as const,
          foleyEnabled: true,
          foleyVolume: 0.8,
        },
      };

      const result = clipEffectsSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.whiteboard?.foleyEnabled).toBe(true);
        expect(result.data.whiteboard?.foleyVolume).toBe(0.8);
      }
    });

    it('rejects out-of-bounds foleyVolume in clipEffectsSchema', () => {
      const invalidPayload = {
        whiteboard: {
          pattern: 'wipe' as const,
          rows: 1,
          hand: 'pencil' as const,
          look: 'none' as const,
          foleyVolume: 1.5, // Exceeds max 1.0
        },
      };

      const result = clipEffectsSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('defines acoustically distinct resonance profiles for all 5 whiteboard styluses', () => {
      const styluses = ['pen', 'marker', 'pencil', 'chalk', 'eraser'];
      for (const s of styluses) {
        const config = FOLEY_STYLUS_CONFIGS[s];
        expect(config).toBeDefined();
        expect(config.centerFreq).toBeGreaterThan(200);
        expect(config.bandwidth).toBeGreaterThan(100);
        expect(config.q).toBeGreaterThan(0.5);
        expect(config.baseGain).toBeGreaterThan(0.1);
      }

      // Pen should have higher frequency than Marker and Eraser
      expect(FOLEY_STYLUS_CONFIGS.pen.centerFreq).toBeGreaterThan(FOLEY_STYLUS_CONFIGS.marker.centerFreq);
      expect(FOLEY_STYLUS_CONFIGS.pen.centerFreq).toBeGreaterThan(FOLEY_STYLUS_CONFIGS.eraser.centerFreq);
    });
  });
});



