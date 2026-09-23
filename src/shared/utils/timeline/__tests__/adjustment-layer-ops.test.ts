import { describe, expect, it } from 'vitest';
import {
  createAdjustmentLayerClip,
  isAdjustmentLayerClip,
  collectActiveAdjustmentLayers,
  buildAdjustmentLayerCssStyles,
  buildMaskClipPath,
  aggregateAdjustmentFilters,
  DEFAULT_ADJUSTMENT_COLOR_LABEL,
} from '../adjustment-layer-ops';
import { type SequenceClip, type SequenceTrack } from '../../../types/sequence';

describe('adjustment-layer-ops', () => {
  describe('isAdjustmentLayerClip', () => {
    it('returns true for effect sourceKind', () => {
      expect(isAdjustmentLayerClip({ sourceKind: 'effect' })).toBe(true);
    });

    it('returns false for video, audio, still, and text kinds', () => {
      expect(isAdjustmentLayerClip({ sourceKind: 'video' })).toBe(false);
      expect(isAdjustmentLayerClip({ sourceKind: 'audio' })).toBe(false);
      expect(isAdjustmentLayerClip({ sourceKind: 'still' })).toBe(false);
      expect(isAdjustmentLayerClip({ sourceKind: 'text' })).toBe(false);
    });
  });

  describe('createAdjustmentLayerClip', () => {
    it('creates an adjustment layer clip with sensible defaults', () => {
      const clip = createAdjustmentLayerClip({
        sequenceId: 'seq-1',
        trackId: 'track-overlay-1',
        startFrames: 30,
        durationFrames: 150,
      });

      expect(clip.id).toBeDefined();
      expect(clip.sequenceId).toBe('seq-1');
      expect(clip.trackId).toBe('track-overlay-1');
      expect(clip.filePath).toBeNull();
      expect(clip.startFrames).toBe(30);
      expect(clip.durationFrames).toBe(150);
      expect(clip.sourceKind).toBe('effect');
      expect(clip.label).toBe('Adjustment Layer');
      expect(clip.colorLabel).toBe(DEFAULT_ADJUSTMENT_COLOR_LABEL);
      expect(clip.effects?.colorGrade).toBeDefined();
      expect(clip.effects?.colorGrade?.contrast).toBe(1.0);
    });

    it('honors custom label, colorLabel, and effects', () => {
      const clip = createAdjustmentLayerClip({
        sequenceId: 'seq-1',
        trackId: 'track-1',
        startFrames: 0,
        durationFrames: 60,
        label: 'Cinematic Teal & Orange',
        colorLabel: 'rose',
        effects: {
          filters: {
            brightness: 0.1,
            contrast: 1.2,
            saturation: 1.1,
            vignette: 0.3,
          },
        },
      });

      expect(clip.label).toBe('Cinematic Teal & Orange');
      expect(clip.colorLabel).toBe('rose');
      expect(clip.effects?.filters?.contrast).toBe(1.2);
    });
  });

  describe('collectActiveAdjustmentLayers', () => {
    const tracks: SequenceTrack[] = [
      {
        id: 'track-base',
        sequenceId: 'seq-1',
        kind: 'video',
        name: 'Video 1',
        orderIndex: 0,
        muted: false,
        videoEnabled: true,
        heightPx: 48,
        role: null,
        locked: false,
        magnetic: false,
      },
      {
        id: 'track-adj-1',
        sequenceId: 'seq-1',
        kind: 'video',
        name: 'Adjustment Track 1',
        orderIndex: 1,
        muted: false,
        videoEnabled: true,
        heightPx: 48,
        role: 'overlay',
        locked: false,
        magnetic: false,
      },
      {
        id: 'track-adj-2',
        sequenceId: 'seq-1',
        kind: 'video',
        name: 'Adjustment Track 2',
        orderIndex: 2,
        muted: false,
        videoEnabled: true,
        heightPx: 48,
        role: 'overlay',
        locked: false,
        magnetic: false,
      },
      {
        id: 'track-disabled',
        sequenceId: 'seq-1',
        kind: 'video',
        name: 'Disabled Track',
        orderIndex: 3,
        muted: false,
        videoEnabled: false,
        heightPx: 48,
        role: 'overlay',
        locked: false,
        magnetic: false,
      },
    ];

    const clips: SequenceClip[] = [
      // Base video clip
      {
        id: 'clip-video',
        sequenceId: 'seq-1',
        trackId: 'track-base',
        orderIndex: 0,
        sourceKind: 'video',
        label: 'Source Video',
        filePath: 'video.mp4',
        startFrames: 0,
        durationFrames: 300,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
      },
      // Adjustment layer on track 1 (frames 50 to 200)
      {
        id: 'adj-1',
        sequenceId: 'seq-1',
        trackId: 'track-adj-1',
        orderIndex: 0,
        sourceKind: 'effect',
        label: 'Color Grade 1',
        filePath: null,
        startFrames: 50,
        durationFrames: 150,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        effects: {
          colorGrade: {
            lift: { r: 0, g: 0, b: 0, luma: 0 },
            gamma: { r: 0, g: 0, b: 0, luma: 0 },
            gain: { r: 0, g: 0, b: 0, luma: 0 },
            temperature: 15,
            tint: 0,
            exposure: 0.5,
            contrast: 0.1,
            saturation: 10,
            vibrance: 0,
          },
        },
      },
      // Adjustment layer on track 2 (frames 100 to 250)
      {
        id: 'adj-2',
        sequenceId: 'seq-1',
        trackId: 'track-adj-2',
        orderIndex: 0,
        sourceKind: 'effect',
        label: 'Vignette Overlay',
        filePath: null,
        startFrames: 100,
        durationFrames: 150,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        effects: {
          filmEmulation: {
            enabled: true,
            preset: 'kodak_vision3_500t',
            grain: { enabled: true, intensity: 0.4, size: 1.0, roughness: 0.5, chromatic: false },
            halation: { enabled: true, intensity: 0.2, threshold: 0.7, radiusPx: 4, hueShiftDeg: 0 },
            gateWeave: { enabled: false, speedHz: 1.5, jitterPct: 0, amplitudeX: 0, amplitudeY: 0 },
          },
        },
      },
      // Adjustment layer on disabled track
      {
        id: 'adj-disabled',
        sequenceId: 'seq-1',
        trackId: 'track-disabled',
        orderIndex: 0,
        sourceKind: 'effect',
        label: 'Disabled Grade',
        filePath: null,
        startFrames: 0,
        durationFrames: 300,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
      },
    ];

    it('returns empty array when playhead is before any adjustment layer', () => {
      const active = collectActiveAdjustmentLayers(clips, tracks, 25);
      expect(active).toHaveLength(0);
    });

    it('collects only adj-1 at frame 75', () => {
      const active = collectActiveAdjustmentLayers(clips, tracks, 75);
      expect(active).toHaveLength(1);
      expect(active[0].clip.id).toBe('adj-1');
    });

    it('collects both adj-1 and adj-2 in correct stacking order at frame 150', () => {
      const active = collectActiveAdjustmentLayers(clips, tracks, 150);
      expect(active).toHaveLength(2);
      expect(active[0].clip.id).toBe('adj-1'); // lower track first
      expect(active[1].clip.id).toBe('adj-2'); // higher track second
    });

    it('collects only adj-2 at frame 220', () => {
      const active = collectActiveAdjustmentLayers(clips, tracks, 220);
      expect(active).toHaveLength(1);
      expect(active[0].clip.id).toBe('adj-2');
    });

    it('ignores adjustment layers on disabled tracks', () => {
      const active = collectActiveAdjustmentLayers(clips, tracks, 5);
      expect(active).toHaveLength(0);
    });
  });

  describe('buildAdjustmentLayerCssStyles', () => {
    it('constructs styles with CSS filter from effects', () => {
      const clip: SequenceClip = {
        id: 'c1',
        sequenceId: 's1',
        trackId: 't1',
        orderIndex: 0,
        sourceKind: 'effect',
        label: 'Adj',
        filePath: null,
        startFrames: 0,
        durationFrames: 100,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        overrides: [],
        effects: {
          filters: {
            brightness: 0.2,
            contrast: 1.1,
            saturation: 1.3,
            vignette: 0,
          },
          blendMode: 'overlay',
          transform: {
            opacity: 0.85,
          },
        },
      };

      const styles = buildAdjustmentLayerCssStyles(clip);
      expect(styles.filter).toContain('brightness(1.200)');
      expect(styles.filter).toContain('contrast(1.100)');
      expect(styles.mixBlendMode).toBe('overlay');
      expect(styles.opacity).toBe(0.85);
    });

    it('constructs mask clip-paths correctly', () => {
      const rectMask = buildMaskClipPath({
        enabled: true,
        shape: 'rectangle',
        width: 0.6,
        height: 0.4,
        x: 0.5,
        y: 0.5,
        cornerRadius: 10,
        feather: 0,
        invert: false,
      });
      expect(rectMask).toContain('inset(');
      expect(rectMask).toContain('round 10px');

      const circleMask = buildMaskClipPath({
        enabled: true,
        shape: 'circle',
        width: 0.5,
        height: 0.5,
        x: 0.5,
        y: 0.5,
        cornerRadius: 0,
        feather: 0,
        invert: false,
      });
      expect(circleMask).toBe('ellipse(25.00% 25.00% at 50.00% 50.00%)');
    });
  });

  describe('aggregateAdjustmentFilters', () => {
    it('combines filters from multiple active adjustment layers', () => {
      const layers = [
        {
          clip: {
            id: '1',
            effects: {
              filters: {
                brightness: 0.1,
                contrast: 1,
                saturation: 1,
                vignette: 0,
              },
            },
          } as any,
          track: {} as any,
          startFrames: 0,
          endFrames: 100,
        },
        {
          clip: {
            id: '2',
            effects: {
              filters: {
                brightness: 0,
                contrast: 1.2,
                saturation: 1,
                vignette: 0,
              },
            },
          } as any,
          track: {} as any,
          startFrames: 0,
          endFrames: 100,
        },
      ];

      const agg = aggregateAdjustmentFilters(layers);
      expect(agg).toContain('brightness(1.100)');
      expect(agg).toContain('contrast(1.200)');
    });
  });
});
