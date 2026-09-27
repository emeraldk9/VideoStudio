import fs from 'node:fs';
import path from 'node:path';

import type { WhiteboardPenPoint } from '@shared';

/**
 * Milestone S92: Procedural Whiteboard Foley Sound Synthesizer (Node.js runtime)
 * ==============================================================================
 * Zero-dependency procedural synthesis of drawing friction & contact acoustics
 * for timeline export and master mixdown:
 * - Pen: High metallic nib friction (5.2 kHz)
 * - Marker: Wet resonant paper sweep (900 Hz)
 * - Pencil: Granular graphite tooth (2.8 kHz)
 * - Chalk: Blackboard slate grit (1.4 kHz)
 * - Eraser: Broadband sweep whoosh (450 Hz)
 *
 * Implements standard 2-pole IIR bandpass filtering and outputs standard 16-bit
 * PCM stereo WAV directly to disk without requiring Web Audio or native addons.
 */

export interface FoleyNodeOptions {
  durationSeconds: number;
  stylus?: 'pen' | 'marker' | 'pencil' | 'chalk' | 'eraser' | string;
  volume?: number; // 0..1, default 0.6
  sampleRate?: number; // default 44100
  drawDurationSeconds?: number;
  eraseDurationSeconds?: number;
  penPoints?: WhiteboardPenPoint[];
}

export interface FoleyStylusProfile {
  centerFreq: number;
  bandwidth: number;
  roughness: number;
  velocityScale: number;
  baseGain: number;
}

export const NODE_FOLEY_PROFILES: Record<string, FoleyStylusProfile> = {
  pen: {
    centerFreq: 5200.0,
    bandwidth: 2400.0,
    roughness: 0.45,
    velocityScale: 1.2,
    baseGain: 0.55,
  },
  marker: {
    centerFreq: 900.0,
    bandwidth: 700.0,
    roughness: 0.20,
    velocityScale: 1.0,
    baseGain: 0.65,
  },
  pencil: {
    centerFreq: 2800.0,
    bandwidth: 1900.0,
    roughness: 0.75,
    velocityScale: 1.4,
    baseGain: 0.60,
  },
  chalk: {
    centerFreq: 1400.0,
    bandwidth: 1200.0,
    roughness: 0.85,
    velocityScale: 1.5,
    baseGain: 0.70,
  },
  eraser: {
    centerFreq: 450.0,
    bandwidth: 450.0,
    roughness: 0.25,
    velocityScale: 0.8,
    baseGain: 0.50,
  },
};

/** Compute 2-pole IIR bandpass filter coefficients (b0, b1, b2, a1, a2) normalized by a0. */
export function computeBiquadCoeffs(
  centerFreq: number,
  bandwidth: number,
  sampleRate: number,
): { b0: number; b1: number; b2: number; a1: number; a2: number } {
  const omega = (2.0 * Math.PI * Math.max(20.0, Math.min(sampleRate * 0.48, centerFreq))) / sampleRate;
  const q = Math.max(0.5, centerFreq / Math.max(10.0, bandwidth));
  const alpha = Math.sin(omega) / (2.0 * q);
  const a0 = 1.0 + alpha;

  return {
    b0: alpha / a0,
    b1: 0.0,
    b2: -alpha / a0,
    a1: (-2.0 * Math.cos(omega)) / a0,
    a2: (1.0 - alpha) / a0,
  };
}

/** Synthesize 16-bit PCM stereo interleaved samples for a drawing action. */
export function generateFoleyPcm(options: FoleyNodeOptions): Int16Array {
  const sampleRate = options.sampleRate ?? 44100;
  const durationSec = Math.max(0.05, options.durationSeconds);
  const totalSamples = Math.ceil(durationSec * sampleRate);
  if (totalSamples <= 0) return new Int16Array(0);

  const stylusKey = (options.stylus || 'pen').toLowerCase();
  const profile = NODE_FOLEY_PROFILES[stylusKey] ?? NODE_FOLEY_PROFILES.pen;
  const userVol = Math.max(0.0, Math.min(1.0, options.volume ?? 0.6));
  const masterGain = profile.baseGain * userVol;

  // 1. Generate noise source
  const rawNoise = new Float32Array(totalSamples);
  const roughness = profile.roughness;
  for (let i = 0; i < totalSamples; i += 1) {
    let noise = Math.random() * 2.0 - 1.0;
    if (roughness > 0.0) {
      const tooth = Math.pow(0.7 + Math.random() * 0.6, roughness);
      noise *= tooth;
    }
    rawNoise[i] = noise;
  }

  // 2. IIR Bandpass filter
  const { b0, b1, b2, a1, a2 } = computeBiquadCoeffs(profile.centerFreq, profile.bandwidth, sampleRate);
  const filtered = new Float32Array(totalSamples);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < totalSamples; i += 1) {
    const x0 = rawNoise[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    filtered[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  // 3. Compute contact velocity envelope
  const envelope = new Float32Array(totalSamples);
  const points = options.penPoints;

  if (points && points.length >= 2) {
    const sorted = [...points].sort((a, b) => a.t - b.t);
    const n = sorted.length;
    const tTimes = sorted.map((p) => p.t * durationSec);
    const xCoords = sorted.map((p) => p.x);
    const yCoords = sorted.map((p) => p.y);

    const segmentVels = new Float32Array(n - 1);
    const segmentMidTimes = new Float32Array(n - 1);

    for (let i = 0; i < n - 1; i += 1) {
      const dt = Math.max(0.001, tTimes[i + 1] - tTimes[i]);
      const dx = xCoords[i + 1] - xCoords[i];
      const dy = yCoords[i + 1] - yCoords[i];
      const dist = Math.sqrt(dx * dx + dy * dy);
      segmentVels[i] = dist / dt; // normalized units per second
      segmentMidTimes[i] = (tTimes[i] + tTimes[i + 1]) * 0.5;
    }

    let segIdx = 0;
    for (let i = 0; i < totalSamples; i += 1) {
      const t = (i / totalSamples) * durationSec;
      while (segIdx < n - 2 && segmentMidTimes[segIdx + 1] <= t) {
        segIdx += 1;
      }
      const v = segmentVels[segIdx] ?? 0;
      if (v > 0.02) {
        envelope[i] = Math.min(1.0, v * profile.velocityScale);
      } else {
        envelope[i] = 0.0;
      }
    }
  } else {
    // Synthetic natural drawing envelope
    const drawDur = Math.min(durationSec, options.drawDurationSeconds ?? durationSec * 0.85);
    const attackSamples = Math.min(Math.floor(sampleRate * 0.05), Math.floor(totalSamples * 0.1));
    const drawSamples = Math.floor(drawDur * sampleRate);

    for (let i = 0; i < totalSamples; i += 1) {
      if (i < drawSamples) {
        let env = 1.0;
        if (i < attackSamples) {
          env = i / attackSamples;
        } else if (i > drawSamples - attackSamples) {
          env = Math.max(0.0, (drawSamples - i) / attackSamples);
        }
        // Micro-cadence tooth jitter
        const tSec = i / sampleRate;
        const jitter = 0.9 + 0.1 * Math.sin(tSec * 44.0);
        envelope[i] = env * jitter;
      } else {
        envelope[i] = 0.0;
      }
    }
  }

  // Milestone S93: Synthesize eraser whoosh friction during the board clearing phase
  if (options.eraseDurationSeconds && options.eraseDurationSeconds > 0) {
    const eraseDur = Math.min(durationSec * 0.5, options.eraseDurationSeconds);
    const eraseStartSample = Math.floor((durationSec - eraseDur) * sampleRate);
    const eraseSamples = totalSamples - eraseStartSample;

    if (eraseSamples > 0) {
      const eraserProfile = NODE_FOLEY_PROFILES.eraser;
      const eraserCoeffs = computeBiquadCoeffs(eraserProfile.centerFreq, eraserProfile.bandwidth, sampleRate);
      let ex1 = 0;
      let ex2 = 0;
      let ey1 = 0;
      let ey2 = 0;
      const passes = 4;
      const samplesPerPass = eraseSamples / passes;

      for (let j = 0; j < eraseSamples; j += 1) {
        const i = eraseStartSample + j;
        const noise = (Math.random() * 2.0 - 1.0) * (0.8 + Math.random() * 0.4);
        const y0 = eraserCoeffs.b0 * noise + eraserCoeffs.b1 * ex1 + eraserCoeffs.b2 * ex2 - eraserCoeffs.a1 * ey1 - eraserCoeffs.a2 * ey2;
        ex2 = ex1;
        ex1 = noise;
        ey2 = ey1;
        ey1 = y0;

        const passT = (j % samplesPerPass) / samplesPerPass;
        const scrubVel = Math.sin(passT * Math.PI);
        envelope[i] = scrubVel * 0.95;
        filtered[i] = y0 * eraserProfile.baseGain;
      }
    }
  }

  // 4. Interleave stereo 16-bit PCM with peak limiting
  const interleaved = new Int16Array(totalSamples * 2);
  const int16Max = 32767;

  for (let i = 0; i < totalSamples; i += 1) {
    const sampleVal = filtered[i] * envelope[i] * masterGain;
    const leftVal = Math.max(-1.0, Math.min(1.0, sampleVal * 0.98));
    const rightVal = Math.max(-1.0, Math.min(1.0, sampleVal * 1.02));

    interleaved[i * 2] = Math.round(leftVal * int16Max);
    interleaved[i * 2 + 1] = Math.round(rightVal * int16Max);
  }

  return interleaved;
}

/** Construct a binary Buffer containing a canonical 16-bit PCM RIFF WAVE header + data. */
export function buildWavBuffer(interleavedPcm: Int16Array, channels = 2, sampleRate = 44100): Buffer {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleavedPcm.length * bytesPerSample;
  const totalFileSize = 44 + dataSize;

  const buffer = Buffer.alloc(totalFileSize);

  // RIFF Chunk Descriptor
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(totalFileSize - 8, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data sub-chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Copy sample bytes
  const pcmBytes = Buffer.from(interleavedPcm.buffer, interleavedPcm.byteOffset, dataSize);
  pcmBytes.copy(buffer, 44);

  return buffer;
}

/** Synthesize procedural whiteboard foley and export directly to a .wav file on disk. */
export async function synthesizeWhiteboardFoleyWav(
  outputPath: string,
  options: FoleyNodeOptions,
): Promise<string> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const pcm = generateFoleyPcm(options);
  const wavBuffer = buildWavBuffer(pcm, 2, options.sampleRate ?? 44100);
  await fs.promises.writeFile(outputPath, wavBuffer);
  return outputPath;
}
