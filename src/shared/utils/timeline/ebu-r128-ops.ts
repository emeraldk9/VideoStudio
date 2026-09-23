/**
 * Milestone S71 — Auditory Waveform Peak Metering & EBU R128 Broadcast Loudness Radar.
 *
 * Implements ITU-R BS.1770-4 and EBU R128 standards for:
 * 1. K-weighting pre-filter biquad coefficients (Stage 1 high-shelf, Stage 2 RLB high-pass).
 * 2. True Peak (dBTP) calculation via 4x oversampling interpolation.
 * 3. Dual-stage gated loudness measurement (Absolute -70 LKFS, Relative -10 LU).
 * 4. Momentary (400ms), Short-term (3s), and Integrated (I) LUFS.
 * 5. Loudness Range (LRA).
 * 6. Industry broadcast presets (EBU R128, ATSC A/85, YouTube/Spotify, Apple Podcasts, Netflix).
 * 7. Normalization gain calculation with true-peak safety clamping.
 */

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface LoudnessTargetPreset {
  id: string;
  name: string;
  targetLufs: number;
  maxTruePeakDb: number;
  targetLra?: number;
  description: string;
}

export const BROADCAST_LOUDNESS_PRESETS: LoudnessTargetPreset[] = [
  {
    id: 'ebu-r128',
    name: 'EBU R128 (European Broadcast)',
    targetLufs: -23.0,
    maxTruePeakDb: -1.0,
    targetLra: 15,
    description: 'European TV & radio broadcast standard (-23 LUFS, -1 dBTP).',
  },
  {
    id: 'atsc-a85',
    name: 'ATSC A/85 (US Television / CALM Act)',
    targetLufs: -24.0,
    maxTruePeakDb: -2.0,
    targetLra: 20,
    description: 'North American television broadcast compliance (-24 LUFS, -2 dBTP).',
  },
  {
    id: 'youtube-spotify',
    name: 'YouTube & Spotify (Streaming)',
    targetLufs: -14.0,
    maxTruePeakDb: -1.0,
    targetLra: 12,
    description: 'Online streaming standard for YouTube, Spotify, and TikTok (-14 LUFS, -1 dBTP).',
  },
  {
    id: 'apple-music',
    name: 'Apple Music & Podcasts',
    targetLufs: -16.0,
    maxTruePeakDb: -1.0,
    targetLra: 14,
    description: 'Apple Sound Check & Podcasts target (-16 LUFS, -1 dBTP).',
  },
  {
    id: 'netflix',
    name: 'Netflix (OTT Streaming)',
    targetLufs: -27.0,
    maxTruePeakDb: -2.0,
    targetLra: 18,
    description: 'Netflix dialog-gated broadcast standard (-27 LUFS, -2 dBTP).',
  },
];

/**
 * Calculates ITU-R BS.1770-4 Stage 1 high-shelf pre-filter coefficients for sample rate `fs`.
 * High-shelf boost of +3.9998 dB at 1681.97 Hz.
 */
export function getKWeightingStage1Coefficients(sampleRate = 48000): BiquadCoefficients {
  const db = 3.999843853973347;
  const f0 = 1681.974450955533;
  const v = Math.pow(10, db / 20);
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const k2 = k * k;
  const sqrt2 = Math.SQRT2;

  const denom = 1 + sqrt2 * k + k2;
  const b0 = (v + Math.sqrt(2 * v) * k + k2) / denom;
  const b1 = (2 * (k2 - v)) / denom;
  const b2 = (v - Math.sqrt(2 * v) * k + k2) / denom;
  const a1 = (2 * (k2 - 1)) / denom;
  const a2 = (1 - sqrt2 * k + k2) / denom;

  return { b0, b1, b2, a1, a2 };
}

/**
 * Calculates ITU-R BS.1770-4 Stage 2 RLB high-pass filter coefficients for sample rate `fs`.
 * 2nd-order high-pass cutoff at ~38.135 Hz.
 */
export function getKWeightingStage2Coefficients(sampleRate = 48000): BiquadCoefficients {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const k2 = k * k;

  const denom = 1 + k / q + k2;
  const b0 = 1 / denom;
  const b1 = -2 / denom;
  const b2 = 1 / denom;
  const a1 = (2 * (k2 - 1)) / denom;
  const a2 = (1 - k / q + k2) / denom;

  return { b0, b1, b2, a1, a2 };
}

/**
 * Applies a Direct Form II Transposed biquad filter in-place to an audio buffer.
 */
export function applyBiquadFilter(
  samples: Float32Array | number[],
  coeffs: BiquadCoefficients,
): Float32Array {
  const { b0, b1, b2, a1, a2 } = coeffs;
  const out = new Float32Array(samples.length);
  let s1 = 0;
  let s2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + s1;
    s1 = b1 * x - a1 * y + s2;
    s2 = b2 * x - a2 * y;
    out[i] = y;
  }

  return out;
}

/**
 * Runs full K-weighting pre-filter on an audio channel buffer (Stage 1 high-shelf + Stage 2 RLB).
 */
export function applyKWeighting(
  samples: Float32Array | number[],
  sampleRate = 48000,
): Float32Array {
  const stage1Coeffs = getKWeightingStage1Coefficients(sampleRate);
  const stage2Coeffs = getKWeightingStage2Coefficients(sampleRate);
  const stage1Out = applyBiquadFilter(samples, stage1Coeffs);
  return applyBiquadFilter(stage1Out, stage2Coeffs);
}

/**
 * Computes True Peak (dBTP) of an audio channel with 4x oversampling cubic interpolation
 * to detect inter-sample peaks.
 */
export function calculateTruePeak(samples: Float32Array | number[]): {
  truePeakLinear: number;
  truePeakDb: number;
} {
  let maxPeak = 0;
  const len = samples.length;

  for (let i = 0; i < len; i++) {
    const p0 = samples[Math.max(0, i - 1)];
    const p1 = samples[i];
    const p2 = samples[Math.min(len - 1, i + 1)];
    const p3 = samples[Math.min(len - 1, i + 2)];

    // Catmull-Rom / Cubic Hermite 4x sub-sample evaluation
    for (let sub = 0; sub < 4; sub++) {
      const t = sub / 4;
      const t2 = t * t;
      const t3 = t2 * t;

      const v =
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t3);

      const absV = Math.abs(v);
      if (absV > maxPeak) {
        maxPeak = absV;
      }
    }
  }

  const truePeakDb = maxPeak > 1e-6 ? 20 * Math.log10(maxPeak) : -120;
  return {
    truePeakLinear: maxPeak,
    truePeakDb: Math.round(truePeakDb * 10) / 10,
  };
}

export interface EbuR128LoudnessResult {
  integratedLufs: number;
  momentaryMaxLufs: number;
  shortTermMaxLufs: number;
  loudnessRangeLra: number;
  maxTruePeakDb: number;
  passedBlocksCount: number;
}

/**
 * Calculates ITU-R BS.1770-4 gated integrated loudness, momentary, short-term, and LRA
 * for multi-channel audio (e.g. Stereo L/R).
 *
 * @param channels Array of Float32Array channel buffers (e.g. [left, right]).
 * @param sampleRate Audio sample rate (default 48000 Hz).
 * @param channelWeights Optional channel weights (defaults to 1.0 for L, 1.0 for R).
 */
export function calculateEbuR128Loudness(
  channels: (Float32Array | number[])[],
  sampleRate = 48000,
  channelWeights: number[] = [1.0, 1.0],
): EbuR128LoudnessResult {
  if (channels.length === 0 || channels[0].length === 0) {
    return {
      integratedLufs: -70.0,
      momentaryMaxLufs: -70.0,
      shortTermMaxLufs: -70.0,
      loudnessRangeLra: 0.0,
      maxTruePeakDb: -120.0,
      passedBlocksCount: 0,
    };
  }

  // 1. Calculate max true peak across all channels
  let maxTruePeakDb = -120.0;
  for (const ch of channels) {
    const tp = calculateTruePeak(ch);
    if (tp.truePeakDb > maxTruePeakDb) {
      maxTruePeakDb = tp.truePeakDb;
    }
  }

  // 2. Apply K-weighting to all channels
  const kFilteredChannels = channels.map((ch) => applyKWeighting(ch, sampleRate));

  // 3. Sliding block setup: 400ms blocks with 75% overlap (100ms step)
  const samplesPerBlock = Math.round(sampleRate * 0.4); // 400ms
  const stepSamples = Math.round(sampleRate * 0.1); // 100ms
  const totalSamples = kFilteredChannels[0].length;

  if (totalSamples < samplesPerBlock) {
    // Audio is shorter than 400ms: compute single block ungated
    let sumZ = 0;
    for (let c = 0; c < kFilteredChannels.length; c++) {
      const weight = channelWeights[c] ?? 1.0;
      const ch = kFilteredChannels[c];
      let energy = 0;
      for (let i = 0; i < totalSamples; i++) {
        energy += ch[i] * ch[i];
      }
      sumZ += weight * (energy / totalSamples);
    }
    const lufs = sumZ > 1e-12 ? -0.691 + 10 * Math.log10(sumZ) : -70.0;
    const rounded = Math.round(lufs * 10) / 10;
    return {
      integratedLufs: rounded,
      momentaryMaxLufs: rounded,
      shortTermMaxLufs: rounded,
      loudnessRangeLra: 0.0,
      maxTruePeakDb,
      passedBlocksCount: 1,
    };
  }

  // 4. Compute power for each 400ms block
  const blockEnergies: number[] = [];
  const blockLoudness: number[] = [];

  for (let start = 0; start + samplesPerBlock <= totalSamples; start += stepSamples) {
    let blockZ = 0;
    for (let c = 0; c < kFilteredChannels.length; c++) {
      const weight = channelWeights[c] ?? 1.0;
      const ch = kFilteredChannels[c];
      let sumSq = 0;
      for (let i = 0; i < samplesPerBlock; i++) {
        const val = ch[start + i];
        sumSq += val * val;
      }
      blockZ += weight * (sumSq / samplesPerBlock);
    }

    blockEnergies.push(blockZ);
    const lufs = blockZ > 1e-12 ? -0.691 + 10 * Math.log10(blockZ) : -70.0;
    blockLoudness.push(lufs);
  }

  const momentaryMaxLufs = Math.round(Math.max(...blockLoudness, -70.0) * 10) / 10;

  // 5. Short-term loudness (3s window = 30 consecutive 100ms blocks)
  const shortTermBlocks: number[] = [];
  const shortTermWindowSize = 30; // 3 seconds / 0.1s
  for (let i = 0; i + shortTermWindowSize <= blockEnergies.length; i++) {
    let sumZ = 0;
    for (let j = 0; j < shortTermWindowSize; j++) {
      sumZ += blockEnergies[i + j];
    }
    const avgZ = sumZ / shortTermWindowSize;
    const stLufs = avgZ > 1e-12 ? -0.691 + 10 * Math.log10(avgZ) : -70.0;
    shortTermBlocks.push(stLufs);
  }
  const shortTermMaxLufs =
    shortTermBlocks.length > 0
      ? Math.round(Math.max(...shortTermBlocks) * 10) / 10
      : momentaryMaxLufs;

  // 6. Stage 1 Absolute Gating: threshold = -70 LKFS
  const absoluteThresholdLufs = -70.0;
  const absGatedIndices: number[] = [];
  let absGatedSumZ = 0;

  for (let i = 0; i < blockLoudness.length; i++) {
    if (blockLoudness[i] > absoluteThresholdLufs) {
      absGatedIndices.push(i);
      absGatedSumZ += blockEnergies[i];
    }
  }

  if (absGatedIndices.length === 0) {
    return {
      integratedLufs: -70.0,
      momentaryMaxLufs,
      shortTermMaxLufs,
      loudnessRangeLra: 0.0,
      maxTruePeakDb,
      passedBlocksCount: 0,
    };
  }

  // 7. Stage 2 Relative Gating: threshold = average of absolute gated blocks - 10 LU
  const avgAbsZ = absGatedSumZ / absGatedIndices.length;
  const relativeThresholdLufs = -0.691 + 10 * Math.log10(avgAbsZ) - 10.0;

  let finalSumZ = 0;
  let finalCount = 0;
  for (const idx of absGatedIndices) {
    if (blockLoudness[idx] > relativeThresholdLufs) {
      finalSumZ += blockEnergies[idx];
      finalCount++;
    }
  }

  const integratedLufs =
    finalCount > 0 && finalSumZ > 1e-12
      ? Math.round((-0.691 + 10 * Math.log10(finalSumZ / finalCount)) * 10) / 10
      : -70.0;

  // 8. Loudness Range (LRA) calculation according to EBU Tech 3342
  // Uses short-term loudness blocks above -70 LUFS and relative gate (-20 LU below average)
  let lra = 0.0;
  if (shortTermBlocks.length >= 10) {
    const validSt = shortTermBlocks.filter((b) => b > -70.0);
    if (validSt.length > 0) {
      const avgStZ =
        validSt.reduce((acc, v) => acc + Math.pow(10, (v + 0.691) / 10), 0) / validSt.length;
      const lraRelativeThreshold = -0.691 + 10 * Math.log10(avgStZ) - 20.0;
      const lraGated = validSt.filter((b) => b > lraRelativeThreshold).sort((a, b) => a - b);

      if (lraGated.length >= 5) {
        const p10Index = Math.floor(lraGated.length * 0.1);
        const p95Index = Math.min(lraGated.length - 1, Math.floor(lraGated.length * 0.95));
        lra = Math.round((lraGated[p95Index] - lraGated[p10Index]) * 10) / 10;
      }
    }
  }

  return {
    integratedLufs,
    momentaryMaxLufs,
    shortTermMaxLufs,
    loudnessRangeLra: Math.max(0, lra),
    maxTruePeakDb,
    passedBlocksCount: finalCount,
  };
}

/**
 * Calculates broadcast normalization gain required to conform an integrated loudness to a target standard.
 * Also verifies whether applying this gain will breach the target True Peak limit.
 */
export function calculateNormalizationGain(
  integratedLufs: number,
  preset: LoudnessTargetPreset,
  currentTruePeakDb: number,
): {
  requiredGainDb: number;
  safeGainDb: number;
  projectedTruePeakDb: number;
  willExceedTruePeak: boolean;
} {
  if (integratedLufs <= -69.0) {
    return {
      requiredGainDb: 0.0,
      safeGainDb: 0.0,
      projectedTruePeakDb: currentTruePeakDb,
      willExceedTruePeak: false,
    };
  }

  const requiredGainDb = Math.round((preset.targetLufs - integratedLufs) * 10) / 10;
  const projectedTruePeakDb = Math.round((currentTruePeakDb + requiredGainDb) * 10) / 10;
  const willExceedTruePeak = projectedTruePeakDb > preset.maxTruePeakDb;

  // If projected True Peak exceeds limit, clamp to safe ceiling
  let safeGainDb = requiredGainDb;
  if (willExceedTruePeak) {
    safeGainDb = Math.round((preset.maxTruePeakDb - currentTruePeakDb) * 10) / 10;
  }

  return {
    requiredGainDb,
    safeGainDb,
    projectedTruePeakDb,
    willExceedTruePeak,
  };
}
