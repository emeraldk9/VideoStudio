import { describe, expect, it } from 'vitest';
import {
  buildFrameGraph,
  layerFor,
  MAX_ADJUSTMENT_LAYERS,
} from '../frame-graph';
import { uvTransform } from '../GlCompositor';
import {
  DEFAULT_COLOR_GRADING,
  DEFAULT_FILM_EMULATION_SETTINGS,
  DEFAULT_LENS_OPTICS_SETTINGS,
  DEFAULT_MASK_SETTINGS,
} from '@shared';

describe('Milestone S69: GlFrameGraph & WebGL Compositor Shaders', () => {
  describe('layerFor with S69 GPU Effect Uniforms', () => {
    it('creates a default GlLayer with zero GPU effect uniforms when effects are neutral', () => {
      const layer = layerFor({
        slot: 'b',
        clipId: 'clip-1',
        motion: undefined,
        effects: undefined,
      });

      expect(layer.slot).toBe('b');
      expect(layer.clipId).toBe('clip-1');
      expect(layer.fit).toBe('contain');
      expect(layer.gpuEffects).toBeDefined();
      expect(layer.gpuEffects?.film[0]).toBe(0); // enabled = 0
      expect(layer.gpuEffects?.lens[0]).toBe(0);
      expect(layer.gpuEffects?.chroma[0]).toBe(0);
      expect(layer.gpuEffects?.grade[0]).toBe(0);
      expect(layer.gpuEffects?.mask[0]).toBe(0);
    });

    it('populates GPU effect uniforms when effects are configured', () => {
      const layer = layerFor({
        slot: 'a',
        clipId: 'clip-2',
        motion: { x: 0.5, y: 0.5, scale: 1.2 },
        effects: {
          filmEmulation: { ...DEFAULT_FILM_EMULATION_SETTINGS, enabled: true },
          lensOptics: { ...DEFAULT_LENS_OPTICS_SETTINGS, enabled: true, distortionK1: 0.15 },
          chromaKey: {
            enabled: true,
            keyColorHex: '#00FF00',
            similarity: 0.45,
            smoothness: 0.12,
            spillSuppression: 0.7,
          },
          colorGrade: { ...DEFAULT_COLOR_GRADING, temperature: 30 },
          mask: { ...DEFAULT_MASK_SETTINGS, enabled: true, shape: 'rectangle' as const },
        },
        playheadFrame: 24,
      });

      expect(layer.fit).toBe('cover');
      expect(layer.viewport.scale).toBe(1.2);
      expect(layer.gpuEffects?.film[0]).toBe(1.0); // enabled
      expect(layer.gpuEffects?.film[5]).toBeGreaterThan(0); // time seed from frame 24
      expect(layer.gpuEffects?.lens[0]).toBe(1.0);
      expect(layer.gpuEffects?.lens[1]).toBeCloseTo(0.15); // distortion
      expect(layer.gpuEffects?.chroma[0]).toBe(1.0);
      expect(layer.gpuEffects?.grade[0]).toBe(1.0);
      expect(layer.gpuEffects?.mask[0]).toBe(1.0);
    });
  });

  describe('buildFrameGraph', () => {
    it('assembles incoming and outgoing layers with transition and adjustment limits', () => {
      const incoming = layerFor({
        slot: 'b',
        clipId: 'in-clip',
        motion: undefined,
        effects: undefined,
      });
      const outgoing = layerFor({
        slot: 'a',
        clipId: 'out-clip',
        motion: undefined,
        effects: undefined,
      });

      const adjustments = Array.from({ length: 6 }, () => ({
        brightness: 0.1,
        contrast: 1.1,
        saturation: 1.0,
        gamma: 1.0,
        hue: 0,
        sharpen: 0,
        vignette: 0,
      }));

      const graph = buildFrameGraph({
        incoming,
        outgoing,
        transition: null,
        adjustments,
      });

      expect(graph.layers.length).toBe(2);
      expect(graph.layers[0].slot).toBe('a');
      expect(graph.layers[1].slot).toBe('b');
      expect(graph.adjustments.length).toBe(MAX_ADJUSTMENT_LAYERS);
      expect(graph.truncatedAdjustments).toBe(true);
    });
  });

  describe('uvTransform', () => {
    it('computes letterbox UV transform for contain fit', () => {
      const layer = layerFor({
        slot: 'b',
        clipId: 'test',
        motion: undefined,
        effects: undefined,
      });
      const source = { width: 1920, height: 1080 };
      const frame = { width: 1920, height: 1080 };

      const [scaleX, scaleY, offsetX, offsetY] = uvTransform(layer, source, frame);
      expect(scaleX).toBeCloseTo(1.0);
      expect(scaleY).toBeCloseTo(1.0);
      expect(offsetX).toBeCloseTo(0.0);
      expect(offsetY).toBeCloseTo(0.0);
    });

    it('computes crop UV transform for motion cover fit', () => {
      const layer = layerFor({
        slot: 'b',
        clipId: 'test',
        motion: { x: 0.5, y: 0.5, scale: 2.0 },
        effects: undefined,
      });
      const source = { width: 1920, height: 1080 };
      const frame = { width: 1920, height: 1080 };

      const [scaleX, scaleY, offsetX, offsetY] = uvTransform(layer, source, frame);
      expect(scaleX).toBeCloseTo(0.5);
      expect(scaleY).toBeCloseTo(0.5);
      expect(offsetX).toBeCloseTo(0.25);
      expect(offsetY).toBeCloseTo(0.25);
    });
  });
});
