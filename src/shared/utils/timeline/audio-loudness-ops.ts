/**
 * Pure arithmetic and DSP operations for Audio Loudness Target Normalization
 * (EBU R128 / ITU-R BS.1770-4 True-Peak Limiter Engine & Integrated LUFS Analyzer).
 *
 * Implements:
 * - Industry broadcast & streaming target loudness presets (YouTube, Spotify, Apple, Netflix, EBU R128, ATSC A/85)
 * - ITU-R BS.1770 K-weighting pre-filter frequency response modeling (Pre-filter high-shelf + RLB high-pass)
 * - Dual-stage gated Integrated Loudness calculation (-70 LKFS absolute gate & -10 LU relative gate)
 * - Loudness Range (LRA) calculation with percentile distribution analysis (P10 to P95)
 * - Dynamic Normalization Gain & True-Peak limiter ceiling headroom analysis
 * - FFmpeg `loudnorm` filter synthesis (single-pass & dual-pass linear mode)
 * - FFmpeg loudnorm stderr output parser
 * - Loudness compliance validation against target thresholds & tolerances
 */

export type StandardLoudnessPresetKey =
  | 'youtube'
  | 'spotify'
  | 'apple_music'
  | 'apple_podcasts'
  | 'tiktok'
  | 'ebu_r128'
  | 'atsc_a85'
  | 'netflix'
  | 'aes_streaming'
  | 'cinema';

export type LoudnessPresetKey = StandardLoudnessPresetKey | 'custom';

export interface LoudnessTargetConfig {
  /** Target Integrated Loudness in LUFS (e.g. -14 for YouTube, -23 for EBU R128). */
  integratedLufs: number;
  /** Maximum True-Peak ceiling in dBTP (e.g. -1.0 for streaming, -2.0 for broadcast). */
  truePeakLimitDbTP: number;
  /** Maximum allowed Loudness Range in LU (e.g. 11 for YouTube, 18 for EBU R128). */
  maxLraLu: number;
  /** Compliance tolerance in LU (e.g. 0.5 LU for EBU R128, 1.0 for streaming). */
  toleranceLu: number;
  /** Human-readable display label. */
  label: string;
  /** Description of standard / delivery target. */
  description: string;
}

export const LOUDNESS_TARGET_PRESETS: Record<StandardLoudnessPresetKey, LoudnessTargetConfig> = {
  youtube: {
    integratedLufs: -14.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 11.0,
    toleranceLu: 1.0,
    label: 'YouTube & Web Video',
    description: 'YouTube loudness target (-14 LUFS, -1.0 dBTP ceiling).',
  },
  spotify: {
    integratedLufs: -14.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 11.0,
    toleranceLu: 1.0,
    label: 'Spotify Normalization',
    description: 'Spotify standard playback volume (-14 LUFS, -1.0 dBTP ceiling).',
  },
  apple_music: {
    integratedLufs: -16.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 12.0,
    toleranceLu: 1.0,
    label: 'Apple Music & Sound Check',
    description: 'Apple Music Sound Check target (-16 LUFS, -1.0 dBTP ceiling).',
  },
  apple_podcasts: {
    integratedLufs: -16.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 12.0,
    toleranceLu: 1.0,
    label: 'Apple Podcasts',
    description: 'Apple Podcasts delivery specification (-16 LUFS, -1.0 dBTP ceiling).',
  },
  tiktok: {
    integratedLufs: -14.0,
    truePeakLimitDbTP: -1.5,
    maxLraLu: 10.0,
    toleranceLu: 1.5,
    label: 'TikTok & Short-Form Video',
    description: 'TikTok / Instagram Reels target (-14 LUFS, -1.5 dBTP ceiling).',
  },
  ebu_r128: {
    integratedLufs: -23.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 18.0,
    toleranceLu: 0.5,
    label: 'EBU R128 (European Broadcast)',
    description: 'European Broadcasting Union statutory delivery standard (-23.0 LUFS ±0.5 LU).',
  },
  atsc_a85: {
    integratedLufs: -24.0,
    truePeakLimitDbTP: -2.0,
    maxLraLu: 15.0,
    toleranceLu: 1.0,
    label: 'ATSC A/85 (US Television / CALM Act)',
    description: 'US broadcast television standard per CALM Act (-24.0 LUFS, -2.0 dBTP ceiling).',
  },
  netflix: {
    integratedLufs: -27.0,
    truePeakLimitDbTP: -2.0,
    maxLraLu: 14.0,
    toleranceLu: 2.0,
    label: 'Netflix / Amazon Prime Video',
    description: 'Premium streaming master delivery (-27.0 LUFS, -2.0 dBTP ceiling).',
  },
  aes_streaming: {
    integratedLufs: -16.0,
    truePeakLimitDbTP: -1.0,
    maxLraLu: 12.0,
    toleranceLu: 1.0,
    label: 'AES TD1004.1.13-15 Streaming',
    description: 'Audio Engineering Society recommendation for internet audio distribution.',
  },
  cinema: {
    integratedLufs: -31.0,
    truePeakLimitDbTP: -0.5,
    maxLraLu: 20.0,
    toleranceLu: 2.0,
    label: 'Theatrical Cinema (SMPTE 200M)',
    description: 'Full dynamic range theatrical cinema release target (-31.0 LUFS).',
  },
};

export const DEFAULT_LOUDNESS_CONFIG: LoudnessTargetConfig = LOUDNESS_TARGET_PRESETS.youtube;

export interface MeasuredLoudnessParams {
  /** Measured Integrated Loudness in LUFS. */
  integratedLufs: number;
  /** Measured True-Peak level in dBTP. */
  truePeakDbTP: number;
  /** Measured Loudness Range in LU. */
  lraLu: number;
  /** Gated loudness threshold in LUFS. */
  thresholdLufs?: number;
  /** Target loudness offset in dB. */
  targetOffsetDb?: number;
}

export interface LoudnessNormalizationAnalysis {
  /** Gain change in dB required to hit target integrated loudness: (target - measured). */
  gainOffsetDb: number;
  /** Linear gain multiplier: 10^(gainOffsetDb / 20). */
  linearGainFactor: number;
  /** Projected True-Peak level after linear gain without limiting. */
  projectedTruePeakDbTP: number;
  /** Limiter compression required in dB to avoid exceeding true-peak ceiling. */
  limiterReductionRequiredDb: number;
  /** Safe linear gain with limiter headroom suppression applied. */
  safeLinearGainFactor: number;
  /** True if audio already complies with the target integrated loudness within tolerance. */
  isWithinTolerance: boolean;
  /** True if True-Peak ceiling will be breached without limiter compression. */
  willClipTruePeak: boolean;
}

export interface LoudnessComplianceResult {
  compliant: boolean;
  integratedDiffLu: number;
  truePeakMarginDb: number;
  lraExcessLu: number;
  status: 'optimal' | 'warning' | 'non_compliant';
  feedbackMessages: string[];
}

/**
 * Calculates ITU-R BS.1770-4 K-weighting pre-filter response in dB at a given frequency in Hz.
 *
 * Stage 1: High shelf filter simulating head diffraction (+4.0 dB boost above 1.5 kHz).
 * Stage 2: Revised Low-frequency B-curve (RLB) high-pass filter (fc ≈ 38 Hz, 12 dB/octave).
 */
export function calculateKWeightingResponse(frequencyHz: number): number {
  if (frequencyHz <= 0) return -100;

  // Stage 1: ITU-R BS.1770-4 High shelf (+4.0 dB at high frequencies, f0 ≈ 1682 Hz, Q ≈ 0.7071)
  const f0 = 1681.97445;
  const Q = 0.7071;
  const K = Math.pow(10, 3.99984 / 20); // ≈ 1.58486
  const wRel = frequencyHz / f0;
  const wRel2 = wRel * wRel;

  // H_shelf(s) = (K*s^2 + (w0*sqrt(K)/Q)*s + w0^2) / (s^2 + (w0/(Q*sqrt(K)))*s + w0^2)
  const numReal = 1 - K * wRel2;
  const numImag = (wRel * Math.sqrt(K)) / Q;
  const numMag2 = numReal * numReal + numImag * numImag;

  const denReal = 1 - wRel2;
  const denImag = wRel / (Q * Math.sqrt(K));
  const denMag2 = denReal * denReal + denImag * denImag;

  const shelfDb = 10 * Math.log10(Math.max(1e-9, numMag2 / Math.max(1e-9, denMag2)));

  // Stage 2: RLB High-pass filter (fc ≈ 38 Hz, 2nd order Butterworth-like)
  const fHp = 38.13547;
  const hpRatio = Math.pow(frequencyHz / fHp, 4);
  const hpPowerGain = hpRatio / (1 + hpRatio);
  const hpDb = 10 * Math.log10(Math.max(1e-9, hpPowerGain));

  const totalDb = shelfDb + hpDb;
  return Math.round(totalDb * 100) / 100;
}

/**
 * Samples the ITU-R BS.1770 K-weighting frequency response curve across the audible spectrum (20Hz - 20kHz).
 */
export function sampleKWeightingCurve(
  numPoints: number = 32
): Array<{ frequency: number; gainDb: number }> {
  const points: Array<{ frequency: number; gainDb: number }> = [];
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const step = (maxLog - minLog) / Math.max(1, numPoints - 1);

  for (let i = 0; i < numPoints; i++) {
    const freq = Math.round(Math.pow(10, minLog + i * step));
    const gainDb = calculateKWeightingResponse(freq);
    points.push({ frequency: freq, gainDb });
  }

  return points;
}

/**
 * Calculates Dual-Stage Gated Integrated Loudness (LUFS) per ITU-R BS.1770-4 and EBU R128.
 *
 * Algorithm:
 * 1. Absolute threshold gate at -70 LKFS/LUFS.
 * 2. Calculate mean power of blocks surviving absolute gate.
 * 3. Relative threshold gate at -10 LU below the absolute-gated mean.
 * 4. Final integrated loudness is computed from blocks surviving relative gate.
 */
export function calculateIntegratedLoudness(
  momentaryBlocksLufs: number[]
): { integratedLufs: number; totalBlocks: number; gatedBlocks: number } {
  if (!momentaryBlocksLufs || momentaryBlocksLufs.length === 0) {
    return { integratedLufs: -70.0, totalBlocks: 0, gatedBlocks: 0 };
  }

  const ABSOLUTE_GATE_LUFS = -70.0;
  const RELATIVE_GATE_OFFSET_LU = -10.0;

  // 1. Absolute Gate
  const absGatedBlocks: number[] = [];
  let absPowerSum = 0;

  for (const lufs of momentaryBlocksLufs) {
    if (lufs >= ABSOLUTE_GATE_LUFS && !isNaN(lufs)) {
      absGatedBlocks.push(lufs);
      absPowerSum += Math.pow(10, lufs / 10);
    }
  }

  if (absGatedBlocks.length === 0) {
    return { integratedLufs: -70.0, totalBlocks: momentaryBlocksLufs.length, gatedBlocks: 0 };
  }

  // 2. Unweighted mean power after absolute gate
  const meanAbsPower = absPowerSum / absGatedBlocks.length;
  const absMeanLufs = 10 * Math.log10(Math.max(1e-9, meanAbsPower));

  // 3. Relative Gate: threshold = absMeanLufs - 10.0 LU
  const relativeThresholdLufs = absMeanLufs + RELATIVE_GATE_OFFSET_LU;
  let relPowerSum = 0;
  let relCount = 0;

  for (const lufs of absGatedBlocks) {
    if (lufs >= relativeThresholdLufs) {
      relPowerSum += Math.pow(10, lufs / 10);
      relCount++;
    }
  }

  if (relCount === 0) {
    return {
      integratedLufs: Math.round(absMeanLufs * 10) / 10,
      totalBlocks: momentaryBlocksLufs.length,
      gatedBlocks: absGatedBlocks.length,
    };
  }

  // 4. Final Integrated Loudness
  const finalPower = relPowerSum / relCount;
  const finalLufs = 10 * Math.log10(Math.max(1e-9, finalPower));

  return {
    integratedLufs: Math.round(finalLufs * 10) / 10,
    totalBlocks: momentaryBlocksLufs.length,
    gatedBlocks: relCount,
  };
}

/**
 * Calculates Loudness Range (LRA) in LU per EBU R128 Tech 3342.
 * Measures the difference between the 95th percentile and 10th percentile of gated loudness blocks.
 */
export function calculateLoudnessRange(momentaryBlocksLufs: number[]): number {
  if (!momentaryBlocksLufs || momentaryBlocksLufs.length < 2) {
    return 0;
  }

  // Filter out silence below -70 LUFS
  const valid = momentaryBlocksLufs.filter((x) => x >= -70.0 && !isNaN(x)).sort((a, b) => a - b);
  if (valid.length < 2) return 0;

  // Relative lower gate at -20 LU below mean
  let powerSum = 0;
  for (const v of valid) powerSum += Math.pow(10, v / 10);
  const meanLufs = 10 * Math.log10(powerSum / valid.length);
  const lowerGate = meanLufs - 20.0;

  const gated = valid.filter((x) => x >= lowerGate);
  if (gated.length < 2) return 0;

  // 10th percentile and 95th percentile
  const idx10 = Math.floor(gated.length * 0.1);
  const idx95 = Math.min(gated.length - 1, Math.floor(gated.length * 0.95));

  const lra = gated[idx95] - gated[idx10];
  return Math.max(0, Math.round(lra * 10) / 10);
}

/**
 * Calculates target normalization gain adjustments, True-Peak ceiling headroom, and limiter requirements.
 */
export function calculateLoudnessNormalizationGain(
  measuredI: number,
  measuredTP: number,
  target: LoudnessTargetConfig
): LoudnessNormalizationAnalysis {
  // Gain offset: target - measured
  const gainOffsetDb = Math.round((target.integratedLufs - measuredI) * 10) / 10;
  const linearGainFactor = Math.pow(10, gainOffsetDb / 20);

  // Projected True-Peak
  const projectedTruePeakDbTP = Math.round((measuredTP + gainOffsetDb) * 10) / 10;

  // Limiter compression needed if projected TP exceeds target ceiling
  const limiterReductionRequiredDb = Math.max(
    0,
    Math.round((projectedTruePeakDbTP - target.truePeakLimitDbTP) * 10) / 10
  );

  // Safe linear gain with limiter suppression
  const safeLinearGainFactor = Math.pow(10, (gainOffsetDb - limiterReductionRequiredDb) / 20);

  const diffFromTarget = Math.abs(measuredI - target.integratedLufs);
  const isWithinTolerance = diffFromTarget <= target.toleranceLu;
  const willClipTruePeak = projectedTruePeakDbTP > target.truePeakLimitDbTP;

  return {
    gainOffsetDb,
    linearGainFactor: Math.round(linearGainFactor * 1000) / 1000,
    projectedTruePeakDbTP,
    limiterReductionRequiredDb,
    safeLinearGainFactor: Math.round(safeLinearGainFactor * 1000) / 1000,
    isWithinTolerance,
    willClipTruePeak,
  };
}

/**
 * Synthesizes an FFmpeg `loudnorm` filter string for audio stream normalization.
 *
 * In single-pass mode (no measured values provided), FFmpeg will use dynamic normalization.
 * In dual-pass mode (measured values from pass 1 analysis provided), FFmpeg will perform linear normalization.
 */
export function generateLoudnormFilterString(
  target: LoudnessTargetConfig,
  measured?: MeasuredLoudnessParams,
  linearMode: boolean = true
): string {
  const targetI = target.integratedLufs.toFixed(1);
  const targetTP = target.truePeakLimitDbTP.toFixed(1);
  const targetLRA = target.maxLraLu.toFixed(1);

  if (!measured || measured.integratedLufs === undefined || measured.truePeakDbTP === undefined) {
    // Single-pass dynamic mode
    return `loudnorm=I=${targetI}:TP=${targetTP}:LRA=${targetLRA}`;
  }

  // Dual-pass linear mode
  const measuredI = measured.integratedLufs.toFixed(1);
  const measuredTP = measured.truePeakDbTP.toFixed(1);
  const measuredLRA = measured.lraLu.toFixed(1);
  const measuredThresh = (measured.thresholdLufs ?? measured.integratedLufs - 10.0).toFixed(1);
  const offset = (measured.targetOffsetDb ?? 0.0).toFixed(1);

  return (
    `loudnorm=I=${targetI}:TP=${targetTP}:LRA=${targetLRA}` +
    `:measured_I=${measuredI}:measured_TP=${measuredTP}:measured_LRA=${measuredLRA}` +
    `:measured_thresh=${measuredThresh}:offset=${offset}:linear=${linearMode ? 'true' : 'false'}` +
    `:print_format=summary`
  );
}

/**
 * Parses FFmpeg `loudnorm` stderr output summary JSON or key-value block into structured parameters.
 */
export function parseFfmpegLoudnormOutput(stderrText: string): MeasuredLoudnessParams | null {
  if (!stderrText || stderrText.trim().length === 0) return null;

  // Try parsing JSON block if present: { "input_i" : "-18.5", ... }
  const jsonMatch = stderrText.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        integratedLufs: Number(parsed.input_i),
        truePeakDbTP: Number(parsed.input_tp),
        lraLu: Number(parsed.input_lra),
        thresholdLufs: parsed.input_thresh !== undefined ? Number(parsed.input_thresh) : undefined,
        targetOffsetDb: parsed.target_offset !== undefined ? Number(parsed.target_offset) : undefined,
      };
    } catch {
      // Fall through to regex matching
    }
  }

  // Regex extraction for summary output
  const iMatch = stderrText.match(/(?:Input Integrated|input_i)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*LUFS?/i);
  const tpMatch = stderrText.match(/(?:Input True Peak|input_tp)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*dBTP/i);
  const lraMatch = stderrText.match(/(?:Input LRA|input_lra)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*LU/i);
  const threshMatch = stderrText.match(/(?:Input Threshold|input_thresh)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*LUFS?/i);
  const offsetMatch = stderrText.match(/(?:Target Offset|target_offset)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*dB/i);

  if (iMatch && tpMatch) {
    return {
      integratedLufs: parseFloat(iMatch[1]),
      truePeakDbTP: parseFloat(tpMatch[1]),
      lraLu: lraMatch ? parseFloat(lraMatch[1]) : 0,
      thresholdLufs: threshMatch ? parseFloat(threshMatch[1]) : undefined,
      targetOffsetDb: offsetMatch ? parseFloat(offsetMatch[1]) : 0,
    };
  }

  return null;
}

/**
 * Evaluates whether measured audio meets standard compliance specifications for a target platform.
 */
export function evaluateLoudnessCompliance(
  measured: MeasuredLoudnessParams,
  target: LoudnessTargetConfig,
  customToleranceLu?: number
): LoudnessComplianceResult {
  const tolerance = customToleranceLu ?? target.toleranceLu;
  const integratedDiff = Math.round((measured.integratedLufs - target.integratedLufs) * 10) / 10;
  const truePeakMargin = Math.round((target.truePeakLimitDbTP - measured.truePeakDbTP) * 10) / 10;
  const lraExcess = Math.max(0, Math.round((measured.lraLu - target.maxLraLu) * 10) / 10);

  const messages: string[] = [];
  let isCompliant = true;

  if (Math.abs(integratedDiff) > tolerance) {
    isCompliant = false;
    messages.push(
      `Integrated loudness (${measured.integratedLufs.toFixed(1)} LUFS) deviates from target (${target.integratedLufs.toFixed(1)} LUFS) by ${Math.abs(integratedDiff).toFixed(1)} LU (tolerance: ±${tolerance.toFixed(1)} LU).`
    );
  }

  if (measured.truePeakDbTP > target.truePeakLimitDbTP) {
    isCompliant = false;
    messages.push(
      `True-Peak (${measured.truePeakDbTP.toFixed(1)} dBTP) exceeds maximum ceiling (${target.truePeakLimitDbTP.toFixed(1)} dBTP) by ${Math.abs(truePeakMargin).toFixed(1)} dB.`
    );
  }

  if (lraExcess > 0) {
    messages.push(
      `Loudness Range (${measured.lraLu.toFixed(1)} LU) exceeds recommended maximum (${target.maxLraLu.toFixed(1)} LU). Dynamic compression recommended.`
    );
  }

  let status: 'optimal' | 'warning' | 'non_compliant' = 'optimal';
  if (!isCompliant) {
    status = 'non_compliant';
  } else if (lraExcess > 0 || Math.abs(integratedDiff) > tolerance * 0.75) {
    status = 'warning';
  }

  return {
    compliant: isCompliant,
    integratedDiffLu: integratedDiff,
    truePeakMarginDb: truePeakMargin,
    lraExcessLu: lraExcess,
    status,
    feedbackMessages: messages,
  };
}
