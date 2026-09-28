import { describe, expect, it } from 'vitest';
import {
  ASPECT_RATIO_PRESETS,
  calculatePanAndScanBounds,
  calculateScaleToFill,
  generateAutoReframeKeyframes,
  applyAutoReframeToSequence,
  calculateCropFramingBox,
  panOffsetFromCropBoxCenter,
  applySpringSmoothing,
  batchAutoReframeSequence,
} from '../auto-reframe-ops';
import type { SequenceClip, SequenceDocument } from '../../../types/sequence';

describe('auto-reframe-ops (Step S82: AI Auto-Reframe & Dynamic Aspect Ratio)', () => {
  describe('Aspect Ratio Presets', () => {
    it('defines standard aspect ratio presets with correct geometries', () => {
      expect(ASPECT_RATIO_PRESETS['9:16'].width).toBe(1080);
      expect(ASPECT_RATIO_PRESETS['9:16'].height).toBe(1920);
      expect(ASPECT_RATIO_PRESETS['1:1'].width).toBe(1080);
      expect(ASPECT_RATIO_PRESETS['1:1'].height).toBe(1080);
      expect(ASPECT_RATIO_PRESETS['16:9'].width).toBe(1920);
      expect(ASPECT_RATIO_PRESETS['16:9'].height).toBe(1080);
    });
  });

  describe('calculateScaleToFill', () => {
    it('calculates aspect-fill scale factor for 16:9 to 9:16', () => {
      // 1920x1080 -> 1080x1920
      // scaleX: 1080/1920 = 0.5625
      // scaleY: 1920/1080 = 1.7778
      // max scale: 1.7778
      const scale = calculateScaleToFill(1920, 1080, 1080, 1920);
      expect(scale).toBeCloseTo(1.7778, 3);
    });

    it('calculates aspect-fill scale factor for 16:9 to 1:1', () => {
      // 1920x1080 -> 1080x1080
      // scaleX: 1080/1920 = 0.5625
      // scaleY: 1080/1080 = 1.0
      // max scale: 1.0
      const scale = calculateScaleToFill(1920, 1080, 1080, 1080);
      expect(scale).toBe(1.0);
    });

    it('returns 1.0 for identical dimensions', () => {
      expect(calculateScaleToFill(1920, 1080, 1920, 1080)).toBe(1.0);
    });

    it('handles non-positive dimensions gracefully', () => {
      expect(calculateScaleToFill(0, 1080, 1080, 1920)).toBe(1);
    });
  });

  describe('calculatePanAndScanBounds', () => {
    it('calculates horizontal pan bounds when converting widescreen to vertical', () => {
      const bounds = calculatePanAndScanBounds(1920, 1080, 1080, 1920);
      expect(bounds.maxPanX).toBeGreaterThan(0);
      expect(bounds.maxPanY).toBe(0);
    });

    it('calculates vertical pan bounds when converting vertical to widescreen', () => {
      const bounds = calculatePanAndScanBounds(1080, 1920, 1920, 1080);
      expect(bounds.maxPanX).toBe(0);
      expect(bounds.maxPanY).toBeGreaterThan(0);
    });

    it('returns zero pan for identical aspect ratios', () => {
      const bounds = calculatePanAndScanBounds(1920, 1080, 1920, 1080);
      expect(bounds.maxPanX).toBe(0);
      expect(bounds.maxPanY).toBe(0);
    });
  });

  const mockDocument = {
    sequence: {
      id: 'seq-main',
      name: 'Widescreen Edit',
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48000,
      audioChannels: 2,
    },
    tracks: [
      {
        id: 'v1',
        sequenceId: 'seq-main',
        kind: 'video',
        role: null,
        name: 'Video 1',
        orderIndex: 0,
        locked: false,
        muted: false,
        magnetic: false,
        videoEnabled: true,
        heightPx: 64,
      },
      {
        id: 'sub1',
        sequenceId: 'seq-main',
        kind: 'video',
        role: 'text',
        name: 'Subtitles',
        orderIndex: 1,
        locked: false,
        muted: false,
        magnetic: false,
        videoEnabled: true,
        heightPx: 28,
      },
    ],
    clips: [
      {
        id: 'vid-1',
        sequenceId: 'seq-main',
        trackId: 'v1',
        orderIndex: 0,
        sourceKind: 'video',
        filePath: '/action.mp4',
        startFrames: 0,
        durationFrames: 60,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Action Clip',
        colorLabel: 'cyan',
        overrides: [],
        effects: {
          transform: { scale: 1, x: 0, y: 0, rotationDeg: 0, opacity: 1 },
        },
      },
      {
        id: 'sub-1',
        sequenceId: 'seq-main',
        trackId: 'sub1',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        startFrames: 0,
        durationFrames: 60,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Subtitle Line',
        colorLabel: 'violet',
        overrides: [],
        effects: {
          text: {
            text: 'Subtitle Line',
            fontSizePx: 42,
            colorHex: '#ffffff',
            align: 'center',
            positionPct: { x: 0.5, y: 0.9 },
            anchor: 'bottom',
            preset: 'caption',
          },
        },
      },
    ],
  } as unknown as SequenceDocument;

  describe('generateAutoReframeKeyframes', () => {
    const mockClip: SequenceClip = {
      id: 'clip-1',
      sequenceId: 'seq-1',
      trackId: 'v1',
      orderIndex: 0,
      sourceKind: 'video',
      filePath: '/video.mp4',
      startFrames: 0,
      durationFrames: 90,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Main Video',
      colorLabel: 'cyan',
      overrides: [],
      effects: {},
    };

    it('generates pan-and-scan keyframes across clip duration', () => {
      const keyframes = generateAutoReframeKeyframes(mockClip, 1920, 1080, 1080, 1920, 'default');
      expect(keyframes.length).toBeGreaterThan(0);

      const xKeys = keyframes.filter((k) => k.property === 'x');
      expect(xKeys.length).toBeGreaterThan(0);

      for (const k of keyframes) {
        expect(k.interpolation).toBe('bezier');
        expect(k.frame).toBeGreaterThanOrEqual(0);
        expect(k.frame).toBeLessThanOrEqual(mockClip.durationFrames);
      }
    });

    it('returns empty keyframes when aspects are identical', () => {
      const keyframes = generateAutoReframeKeyframes(mockClip, 1920, 1080, 1920, 1080);
      expect(keyframes).toEqual([]);
    });

    it('adjusts sampling density based on tracking speed', () => {
      const slowKeys = generateAutoReframeKeyframes(mockClip, 1920, 1080, 1080, 1920, 'slow');
      const fastKeys = generateAutoReframeKeyframes(mockClip, 1920, 1080, 1080, 1920, 'fast');
      expect(fastKeys.length).toBeGreaterThan(slowKeys.length);
    });
  });

  describe('applyAutoReframeToSequence', () => {
    it('reframes sequence to 9:16 vertical and scales video clips to fill', () => {
      const reframed = applyAutoReframeToSequence(mockDocument, {
        targetAspect: '9:16',
        trackingSpeed: 'default',
        adjustSubtitlesSafeMargin: true,
      });

      expect(reframed.sequence.width).toBe(1080);
      expect(reframed.sequence.height).toBe(1920);

      const vidClip = reframed.clips.find((c) => c.id === 'vid-1');
      expect(vidClip?.effects?.transform?.scale).toBeGreaterThan(1.7);
      expect(vidClip?.keyframes?.length).toBeGreaterThan(0);

      // Subtitle position Y should be moved up to safe zone (80% instead of 90%)
      const subClip = reframed.clips.find((c) => c.id === 'sub-1');
      expect(subClip?.effects?.text?.positionPct.y).toBe(0.8);
      expect(subClip?.effects?.text?.positionPct.x).toBe(0.5);
    });

    it('supports duplicating into a new sequence', () => {
      const cloned = applyAutoReframeToSequence(mockDocument, {
        targetAspect: '1:1',
        duplicateSequence: true,
      });

      expect(cloned.sequence.id).not.toBe(mockDocument.sequence.id);
      expect(cloned.sequence.name).toContain('[1:1]');
      expect(cloned.sequence.width).toBe(1080);
      expect(cloned.sequence.height).toBe(1080);
    });
  });

  describe('Milestone S173: Interactive Crop Framing & Batch Social Stems', () => {
    it('calculates normalized crop framing box coordinates for 16:9 to 9:16 vertical crop', () => {
      // 1920x1080 to 9:16 (1080x1920). Source ratio = 1.7778, target = 0.5625
      // widthPct should be targetRatio / sourceRatio = 0.5625 / 1.7778 = 0.3164
      // heightPct should be 1.0
      const box = calculateCropFramingBox(1920, 1080, '9:16', 0, 0);
      expect(box.widthPct).toBeCloseTo(0.3164, 3);
      expect(box.heightPct).toBe(1.0);
      expect(box.leftPct).toBeCloseTo((1 - 0.3164) / 2, 3);
      expect(box.topPct).toBe(0.0);
      expect(box.centerX).toBe(0.5);
      expect(box.centerY).toBe(0.5);
      expect(box.maxPanX).toBeGreaterThan(0);
      expect(box.maxPanY).toBe(0);
    });

    it('clamps crop framing box within valid bounds when panning horizontally', () => {
      const box = calculateCropFramingBox(1920, 1080, '9:16', 0.2, 0);
      expect(box.centerX).toBe(0.7);
      expect(box.leftPct).toBeGreaterThan(0.4);
      expect(box.leftPct + box.widthPct).toBeLessThanOrEqual(1.0);

      // Over-pan clamp
      const clampedBox = calculateCropFramingBox(1920, 1080, '9:16', 0.99, 0);
      expect(clampedBox.leftPct + clampedBox.widthPct).toBeCloseTo(1.0, 3);
    });

    it('calculates normalized crop framing box for 16:9 to 1:1 square crop', () => {
      const box = calculateCropFramingBox(1920, 1080, '1:1', 0, 0);
      // 1080 / 1920 = 0.5625 widthPct
      expect(box.widthPct).toBeCloseTo(0.5625, 3);
      expect(box.heightPct).toBe(1.0);
      expect(box.leftPct).toBeCloseTo((1 - 0.5625) / 2, 3);
    });

    it('computes normalized pan offsets from user drag crop center position', () => {
      const offsetCenter = panOffsetFromCropBoxCenter(0.5, 0.5, 1920, 1080, '9:16');
      expect(offsetCenter.panX).toBe(0);
      expect(offsetCenter.panY).toBe(0);

      const offsetRight = panOffsetFromCropBoxCenter(0.65, 0.5, 1920, 1080, '9:16');
      expect(offsetRight.panX).toBeCloseTo(0.15, 3);
      expect(offsetRight.panY).toBe(0);
    });

    it('applies 2nd-order damped spring smoothing to eliminate trajectory jitter', () => {
      const jitterySamples = [0, 0.5, 0.1, 0.8, 0.3, 0.9];
      const smoothed = applySpringSmoothing(jitterySamples, 0.2, 0.7);
      expect(smoothed.length).toBe(jitterySamples.length);
      expect(smoothed[0]).toBe(0);
      // Smoothed first step should not jump abruptly to 0.5
      expect(smoothed[1]).toBeLessThan(0.5);
      expect(smoothed[1]).toBeGreaterThan(0);
    });

    it('generates batch multi-aspect reframed sequence documents in one pass', () => {
      const batch = batchAutoReframeSequence(
        mockDocument,
        ['9:16', '1:1', '4:5'],
        'default',
        true,
      );
      expect(batch.length).toBe(3);

      const vertical = batch.find((b) => b.preset.id === '9:16');
      expect(vertical).toBeDefined();
      expect(vertical?.document.sequence.width).toBe(1080);
      expect(vertical?.document.sequence.height).toBe(1920);
      expect(vertical?.document.sequence.name).toContain('[9:16]');

      const square = batch.find((b) => b.preset.id === '1:1');
      expect(square).toBeDefined();
      expect(square?.document.sequence.width).toBe(1080);
      expect(square?.document.sequence.height).toBe(1080);
      expect(square?.document.sequence.name).toContain('[1:1]');

      const portrait = batch.find((b) => b.preset.id === '4:5');
      expect(portrait).toBeDefined();
      expect(portrait?.document.sequence.width).toBe(1080);
      expect(portrait?.document.sequence.height).toBe(1350);
      expect(portrait?.document.sequence.name).toContain('[4:5]');
    });
  });
});
