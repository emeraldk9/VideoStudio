import { describe, it, expect } from 'vitest';
import {
  clampGainDb,
  gainDbToNormalized,
  normalizedToGainDb,
  calculateFadeFrames,
  stepGainDb,
  formatGainDb,
  MIN_GAIN_DB,
  MAX_GAIN_DB,
  UNITY_GAIN_DB,
} from '../audio-gain-ops';

describe('audio-gain-ops', () => {
  describe('clampGainDb', () => {
    it('clamps values below minimum to MIN_GAIN_DB (-40)', () => {
      expect(clampGainDb(-50)).toBe(-40);
      expect(clampGainDb(-40)).toBe(-40);
    });

    it('clamps values above maximum to MAX_GAIN_DB (+20)', () => {
      expect(clampGainDb(35)).toBe(20);
      expect(clampGainDb(20)).toBe(20);
    });

    it('rounds within range to 1 decimal place', () => {
      expect(clampGainDb(3.456)).toBe(3.5);
      expect(clampGainDb(-6.12)).toBe(-6.1);
    });

    it('handles NaN gracefully by returning unity 0 dB', () => {
      expect(clampGainDb(NaN)).toBe(UNITY_GAIN_DB);
    });
  });

  describe('gainDbToNormalized and normalizedToGainDb', () => {
    it('maps 0 dB (unity) to exactly 0.60', () => {
      const norm = gainDbToNormalized(0);
      expect(norm).toBeCloseTo(0.6, 3);
      expect(normalizedToGainDb(0.6)).toBe(0);
    });

    it('maps -40 dB (min) to 0.0', () => {
      const norm = gainDbToNormalized(MIN_GAIN_DB);
      expect(norm).toBe(0);
      expect(normalizedToGainDb(0)).toBe(-40);
    });

    it('maps +20 dB (max) to 1.0', () => {
      const norm = gainDbToNormalized(MAX_GAIN_DB);
      expect(norm).toBe(1.0);
      expect(normalizedToGainDb(1.0)).toBe(20);
    });

    it('inverts round-trip values accurately', () => {
      const testValues = [-30, -20, -12, -6, -3, 0, 3, 6, 12, 18];
      for (const val of testValues) {
        const norm = gainDbToNormalized(val);
        const back = normalizedToGainDb(norm);
        expect(back).toBeCloseTo(val, 1);
      }
    });
  });

  describe('calculateFadeFrames', () => {
    it('calculates head fade frames accurately from pixel drag', () => {
      // 100px drag at 10px/frame = 10 frames
      const fade = calculateFadeFrames(0, 100, 10, 150, 1);
      expect(fade).toBe(10);
    });

    it('calculates tail fade frames using direction -1', () => {
      // dragging 50px left (deltaPx = -50) with direction -1 -> +5 frames
      const fade = calculateFadeFrames(5, -50, 10, 100, -1);
      expect(fade).toBe(10);
    });

    it('clamps fade frames between 0 and maxFrames', () => {
      const clampedHigh = calculateFadeFrames(50, 1000, 10, 80, 1);
      expect(clampedHigh).toBe(80);

      const clampedLow = calculateFadeFrames(10, -500, 10, 80, 1);
      expect(clampedLow).toBe(0);
    });

    it('returns initialFrames if pxPerFrame is invalid or non-positive', () => {
      expect(calculateFadeFrames(25, 100, 0, 100)).toBe(25);
    });
  });

  describe('stepGainDb', () => {
    it('increments and decrements within bounds', () => {
      expect(stepGainDb(0, 3)).toBe(3);
      expect(stepGainDb(0, -6)).toBe(-6);
      expect(stepGainDb(18, 5)).toBe(20);
      expect(stepGainDb(-38, -5)).toBe(-40);
    });
  });

  describe('formatGainDb', () => {
    it('formats positive, unity, negative, and silence correctly', () => {
      expect(formatGainDb(3)).toBe('+3.0 dB');
      expect(formatGainDb(0)).toBe('0.0 dB');
      expect(formatGainDb(-6.5)).toBe('-6.5 dB');
      expect(formatGainDb(-40)).toBe('-∞ dB');
    });
  });
});
