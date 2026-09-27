import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildWavBuffer,
  computeBiquadCoeffs,
  generateFoleyPcm,
  NODE_FOLEY_PROFILES,
  synthesizeWhiteboardFoleyWav,
} from '../whiteboard-foley-node';

describe('Whiteboard Foley Synthesizer (Node.js runtime)', () => {
  it('computes valid biquad IIR coefficients without NaN or divergence', () => {
    const coeffs = computeBiquadCoeffs(5200, 2400, 44100);
    expect(Number.isFinite(coeffs.b0)).toBe(true);
    expect(Number.isFinite(coeffs.b2)).toBe(true);
    expect(Number.isFinite(coeffs.a1)).toBe(true);
    expect(Number.isFinite(coeffs.a2)).toBe(true);
    // Normalized bandpass filter: b0 = -b2
    expect(coeffs.b0).toBeCloseTo(-coeffs.b2, 6);
  });

  it('generates stereo 16-bit PCM samples with correct sample count', () => {
    const duration = 0.5; // 0.5s @ 44100 = 22050 frames = 44100 interleaved samples
    const pcm = generateFoleyPcm({ durationSeconds: duration, sampleRate: 44100, stylus: 'marker' });
    expect(pcm.length).toBe(22050 * 2);

    // Peak bounds
    let maxAbs = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      const absVal = Math.abs(pcm[i]);
      if (absVal > maxAbs) maxAbs = absVal;
      expect(absVal).toBeLessThanOrEqual(32767);
    }
    // Audible drawing sound produced
    expect(maxAbs).toBeGreaterThan(500);
  });

  it('respects volume scaling and silence at zero volume', () => {
    const silent = generateFoleyPcm({ durationSeconds: 0.2, volume: 0.0 });
    const silentMax = Math.max(...Array.from(silent).map(Math.abs));
    expect(silentMax).toBe(0);

    const quiet = generateFoleyPcm({ durationSeconds: 0.2, volume: 0.1 });
    const loud = generateFoleyPcm({ durationSeconds: 0.2, volume: 0.9 });
    const quietRms = Math.sqrt(quiet.reduce((sum, v) => sum + v * v, 0) / quiet.length);
    const loudRms = Math.sqrt(loud.reduce((sum, v) => sum + v * v, 0) / loud.length);
    expect(loudRms).toBeGreaterThan(quietRms * 3.0);
  });

  it('synthesizes distinct acoustic profiles across all styluses', () => {
    const styluses = Object.keys(NODE_FOLEY_PROFILES);
    expect(styluses).toContain('pen');
    expect(styluses).toContain('marker');
    expect(styluses).toContain('pencil');
    expect(styluses).toContain('chalk');
    expect(styluses).toContain('eraser');

    for (const stylus of styluses) {
      const pcm = generateFoleyPcm({ durationSeconds: 0.25, stylus, volume: 0.7 });
      expect(pcm.length).toBeGreaterThan(0);
      const rms = Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length);
      expect(rms).toBeGreaterThan(100);
    }
  });

  it('modulates envelope with pen trajectory points', () => {
    const points = [
      { t: 0.0, x: 0.1, y: 0.1 },
      { t: 0.4, x: 0.8, y: 0.2 },
      { t: 0.7, x: 0.85, y: 0.85 },
      { t: 1.0, x: 0.9, y: 0.9 },
    ];
    const pcm = generateFoleyPcm({
      durationSeconds: 1.0,
      stylus: 'pencil',
      penPoints: points,
    });
    expect(pcm.length).toBe(44100 * 2);
  });

  it('synthesizes compound drawing foley and board erase whoosh when eraseDurationSeconds is set', () => {
    // 2.0s clip: draw first 1.0s, hold 0.5s, erase final 0.5s
    const pcm = generateFoleyPcm({
      durationSeconds: 2.0,
      drawDurationSeconds: 1.0,
      eraseDurationSeconds: 0.5,
      stylus: 'pen',
      volume: 0.8,
    });
    expect(pcm.length).toBe(44100 * 2 * 2);

    // Segment 1: active drawing (first 0.5s)
    const drawSlice = pcm.subarray(0, 44100);
    const drawRms = Math.sqrt(drawSlice.reduce((s, v) => s + v * v, 0) / drawSlice.length);
    expect(drawRms).toBeGreaterThan(100);

    // Segment 2: hold period (1.1s to 1.4s) -> should be virtually quiet
    const holdSlice = pcm.subarray(Math.floor(1.15 * 44100 * 2), Math.floor(1.40 * 44100 * 2));
    const holdRms = Math.sqrt(holdSlice.reduce((s, v) => s + v * v, 0) / holdSlice.length);
    expect(holdRms).toBeLessThan(drawRms * 0.1);

    // Segment 3: eraser scrub (final 0.4s) -> should have strong eraser whoosh energy
    const eraseSlice = pcm.subarray(Math.floor(1.6 * 44100 * 2), Math.floor(1.95 * 44100 * 2));
    const eraseRms = Math.sqrt(eraseSlice.reduce((s, v) => s + v * v, 0) / eraseSlice.length);
    expect(eraseRms).toBeGreaterThan(100);
  });

  it('builds canonical 44-byte RIFF WAVE header and writes a playable WAV file', async () => {
    const pcm = new Int16Array(1000);
    for (let i = 0; i < pcm.length; i += 1) {
      pcm[i] = Math.round(Math.sin(i * 0.1) * 10000);
    }
    const buf = buildWavBuffer(pcm, 2, 44100);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.readUInt32LE(4)).toBe(buf.length - 8);
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(buf.subarray(12, 16).toString('ascii')).toBe('fmt ');
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(2); // Stereo
    expect(buf.readUInt32LE(24)).toBe(44100); // 44.1kHz
    expect(buf.readUInt16LE(34)).toBe(16); // 16-bit
    expect(buf.subarray(36, 40).toString('ascii')).toBe('data');
    expect(buf.readUInt32LE(40)).toBe(pcm.length * 2);

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vs-foley-test-'));
    const tempWav = path.join(tempDir, 'foley.wav');
    try {
      await synthesizeWhiteboardFoleyWav(tempWav, { durationSeconds: 0.4, stylus: 'chalk' });
      const stat = await fs.promises.stat(tempWav);
      expect(stat.size).toBeGreaterThan(44);
      const readBuf = await fs.promises.readFile(tempWav);
      expect(readBuf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });
});
