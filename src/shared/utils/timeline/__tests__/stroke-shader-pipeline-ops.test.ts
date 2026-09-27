import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STROKE_SHADER_CONFIG,
  validateStrokeShaderConfig,
  computeSegmentSdf,
  glslSmoothstep,
  parseHexRgb,
  packStrokeShaderUniforms,
  generateGlslFragmentShader,
  evaluateStrokeFragment,
} from '../stroke-shader-pipeline-ops';

describe('Real-Time WebGL/WebGPU Stroke Fragment Shader Pipeline Operations', () => {
  describe('validateStrokeShaderConfig', () => {
    it('returns default config when undefined is provided', () => {
      const cfg = validateStrokeShaderConfig();
      expect(cfg).toEqual(DEFAULT_STROKE_SHADER_CONFIG);
      expect(cfg.enabled).toBe(false);
      expect(cfg.substrateRoughness).toBe(0.35);
    });

    it('clamps out-of-range values into valid physical domains', () => {
      const clamped = validateStrokeShaderConfig({
        substrateRoughness: 2.5,
        edgeFeathering: -1.0,
        specularIntensity: 5.0,
        specularRoughness: 0.001,
        fresnelStrength: -0.5,
        shadowOpacity: 3.0,
      });

      expect(clamped.substrateRoughness).toBe(1.0);
      expect(clamped.edgeFeathering).toBe(0.2);
      expect(clamped.specularIntensity).toBe(1.0);
      expect(clamped.specularRoughness).toBe(0.02);
      expect(clamped.fresnelStrength).toBe(0.0);
      expect(clamped.shadowOpacity).toBe(1.0);
    });
  });

  describe('computeSegmentSdf', () => {
    it('computes exact perpendicular distance and parameter t for internal points', () => {
      // Point (50, 70) to segment (0, 50) -> (100, 50)
      const res = computeSegmentSdf(50, 70, 0, 50, 100, 50);
      expect(res.distance).toBeCloseTo(20.0, 4);
      expect(res.t).toBeCloseTo(0.5, 4);
    });

    it('clamps projection parameter t to [0, 1] for points beyond segment endpoints', () => {
      // Point (-30, 50) before start (0, 50)
      const resStart = computeSegmentSdf(-30, 50, 0, 50, 100, 50);
      expect(resStart.distance).toBeCloseTo(30.0, 4);
      expect(resStart.t).toBe(0.0);

      // Point (140, 50) beyond end (100, 50)
      const resEnd = computeSegmentSdf(140, 50, 0, 50, 100, 50);
      expect(resEnd.distance).toBeCloseTo(40.0, 4);
      expect(resEnd.t).toBe(1.0);
    });

    it('handles degenerate zero-length segments without NaN', () => {
      const res = computeSegmentSdf(30, 40, 0, 0, 0, 0);
      expect(res.distance).toBeCloseTo(50.0, 4);
      expect(res.t).toBe(0.0);
    });
  });

  describe('glslSmoothstep', () => {
    it('evaluates Hermite interpolation correctly', () => {
      expect(glslSmoothstep(0, 1, -0.5)).toBe(0.0);
      expect(glslSmoothstep(0, 1, 0.0)).toBe(0.0);
      expect(glslSmoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 4);
      expect(glslSmoothstep(0, 1, 1.0)).toBe(1.0);
      expect(glslSmoothstep(0, 1, 1.5)).toBe(1.0);
    });
  });

  describe('parseHexRgb', () => {
    it('parses valid 6-character hex colors into normalized RGB', () => {
      const rgb = parseHexRgb('#ff8000');
      expect(rgb[0]).toBeCloseTo(1.0, 2);
      expect(rgb[1]).toBeCloseTo(0.5, 2);
      expect(rgb[2]).toBeCloseTo(0.0, 2);
    });

    it('falls back to default dark charcoal on invalid hex', () => {
      const rgb = parseHexRgb('invalid');
      expect(rgb).toEqual([0.08, 0.08, 0.08]);
    });
  });

  describe('packStrokeShaderUniforms', () => {
    it('packs 16-byte aligned Float32Array with 16 elements (64 bytes)', () => {
      const ubo = packStrokeShaderUniforms(
        {
          substrateRoughness: 0.5,
          edgeFeathering: 1.5,
          specularIntensity: 0.6,
          specularRoughness: 0.3,
          fresnelStrength: 0.7,
          shadowOpacity: 0.4,
          inkColorHex: '#ffffff',
        },
        { width: 3840, height: 2160, panX: 100, panY: -50, zoom: 1.5 }
      );

      expect(ubo.length).toBe(16);
      expect(ubo.byteLength).toBe(64);

      // Resolution
      expect(ubo[0]).toBe(3840);
      expect(ubo[1]).toBe(2160);
      // Pan
      expect(ubo[2]).toBe(100);
      expect(ubo[3]).toBe(-50);
      // Color
      expect(ubo[4]).toBeCloseTo(1.0, 2);
      expect(ubo[5]).toBeCloseTo(1.0, 2);
      expect(ubo[6]).toBeCloseTo(1.0, 2);
      expect(ubo[7]).toBe(1.0); // Alpha
      // Zoom & Params
      expect(ubo[8]).toBeCloseTo(1.5, 4);
      expect(ubo[9]).toBeCloseTo(0.5, 4);
      expect(ubo[10]).toBeCloseTo(1.5, 4);
      expect(ubo[11]).toBeCloseTo(0.6, 4);
      expect(ubo[12]).toBeCloseTo(0.3, 4);
      expect(ubo[13]).toBeCloseTo(0.7, 4);
      expect(ubo[14]).toBeCloseTo(0.4, 4);
      expect(ubo[15]).toBe(0.0); // Padding
    });
  });

  describe('generateGlslFragmentShader', () => {
    it('generates valid GLSL ES 3.0 fragment shader source', () => {
      const shader = generateGlslFragmentShader();
      expect(shader).toContain('#version 300 es');
      expect(shader).toContain('layout(std140) uniform StrokeShaderUBO');
      expect(shader).toContain('float hash21(vec2 p)');
      expect(shader).toContain('fragColor = vec4(final_rgb, alpha * ink.a);');
    });
  });

  describe('evaluateStrokeFragment', () => {
    it('returns near-full opacity in the core and zero opacity outside edge feather', () => {
      const core = evaluateStrokeFragment(1.0, 5.0, { edgeFeathering: 1.0, substrateRoughness: 0.0 });
      expect(core.alpha).toBeCloseTo(1.0, 2);

      const outside = evaluateStrokeFragment(8.0, 5.0, { edgeFeathering: 1.0, substrateRoughness: 0.0 });
      expect(outside.alpha).toBe(0.0);
    });

    it('modulates alpha with substrate tooth roughness', () => {
      const smooth = evaluateStrokeFragment(1.0, 5.0, { substrateRoughness: 0.0 }, 1.0);
      const rough = evaluateStrokeFragment(1.0, 5.0, { substrateRoughness: 0.8 }, 1.0);
      expect(rough.alpha).toBeLessThan(smooth.alpha);
    });

    it('produces peak specular at center and decays outward', () => {
      const center = evaluateStrokeFragment(0.0, 5.0, { specularIntensity: 0.8 });
      const edge = evaluateStrokeFragment(4.0, 5.0, { specularIntensity: 0.8 });
      expect(center.specular).toBeGreaterThan(edge.specular);
    });
  });
});
