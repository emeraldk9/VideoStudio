import { describe, it, expect } from 'vitest';
import {
  computeGrainDepositionFactor,
  computeIncidentLightVector,
  computeGraphiteSheenSpecular,
  generatePaperGrainFeTurbulenceDefs,
} from '../graphite-sheen-grain-ops';

describe('graphite-sheen-grain-ops', () => {
  describe('computeGrainDepositionFactor', () => {
    it('deposits more pigment under heavy pressure than light pressure in micro-valleys', () => {
      const depLight = computeGrainDepositionFactor(0.2, 0.4, 0.2); // valley with light pressure
      const depHeavy = computeGrainDepositionFactor(0.9, 0.4, 0.2); // valley with heavy pressure
      expect(depLight).toBe(0);
      expect(depHeavy).toBeGreaterThan(0.75);
    });

    it('always deposits on peaks (height near 1.0) even with light pressure', () => {
      const depPeak = computeGrainDepositionFactor(0.3, 0.4, 1.0);
      expect(depPeak).toBeGreaterThan(0.9);
    });

    it('safely clamps inputs outside valid ranges', () => {
      const clamped = computeGrainDepositionFactor(-1.0, 2.0, 1.5);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(1.0);
    });
  });

  describe('computeIncidentLightVector', () => {
    it('computes unit vector directed in the positive z hemisphere', () => {
      const light = computeIncidentLightVector(45, 35);
      const len = Math.sqrt(light.lx * light.lx + light.ly * light.ly + light.lz * light.lz);
      expect(len).toBeCloseTo(1.0, 3);
      expect(light.lz).toBeGreaterThan(0.5);
    });

    it('correctly maps 0 degrees azimuth to positive x direction', () => {
      const light = computeIncidentLightVector(0, 0);
      expect(light.lx).toBeCloseTo(1.0, 3);
      expect(light.ly).toBeCloseTo(0.0, 3);
    });
  });

  describe('computeGraphiteSheenSpecular', () => {
    it('produces positive specular sheen when normal aligns with halfway vector on dense strokes', () => {
      const sheen = computeGraphiteSheenSpecular(1.0, 0.9, 0.3, 32);
      expect(sheen).toBeCloseTo(0.27, 2);
    });

    it('produces zero sheen where no graphite is deposited', () => {
      const sheen = computeGraphiteSheenSpecular(1.0, 0.0, 0.3, 32);
      expect(sheen).toBe(0);
    });

    it('falls off rapidly as incidence deviates from specular lobe', () => {
      const sheenAligned = computeGraphiteSheenSpecular(1.0, 0.8, 0.3, 32);
      const sheenOffAxis = computeGraphiteSheenSpecular(0.6, 0.8, 0.3, 32);
      expect(sheenOffAxis).toBeLessThan(sheenAligned * 0.01);
    });
  });

  describe('generatePaperGrainFeTurbulenceDefs', () => {
    it('generates complete SVG defs with turbulence, diffuse lighting, and specular sheen', () => {
      const defs = generatePaperGrainFeTurbulenceDefs(8.0, 0.35, 0.25, 45);
      expect(defs).toContain('<defs>');
      expect(defs).toContain('id="paper-grain-graphite-sheen"');
      expect(defs).toContain('feTurbulence');
      expect(defs).toContain('fractalNoise');
      expect(defs).toContain('feDiffuseLighting');
      expect(defs).toContain('feSpecularLighting');
      expect(defs).toContain('feDistantLight');
      expect(defs).toContain('azimuth="45"');
      expect(defs).toContain('</defs>');
    });
  });
});
