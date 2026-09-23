import {
  DEFAULT_COLOR_GRADING,
  type ColorGradingSettings,
  type ColorWheelValue,
} from './color-grading-ops';

export interface ColorZoneStats {
  r: number;
  g: number;
  b: number;
  luma: number;
}

export interface ColorStatistics {
  meanR: number;
  meanG: number;
  meanB: number;
  stdR: number;
  stdG: number;
  stdB: number;
  meanLuma: number;
  shadows: ColorZoneStats;
  midtones: ColorZoneStats;
  highlights: ColorZoneStats;
  skinToneRatio: number;
}

export type ColorMatchMode = 'full' | 'luma_only' | 'chroma_only';

export interface ColorMatchOptions {
  matchMode?: ColorMatchMode;
  strength?: number; // 0.0 to 1.0 (default: 1.0)
  preserveSkinTones?: boolean; // default: true
}

export const DEFAULT_COLOR_STATISTICS: ColorStatistics = {
  meanR: 0.5,
  meanG: 0.5,
  meanB: 0.5,
  stdR: 0.2,
  stdG: 0.2,
  stdB: 0.2,
  meanLuma: 0.5,
  shadows: { r: 0.15, g: 0.15, b: 0.15, luma: 0.15 },
  midtones: { r: 0.5, g: 0.5, b: 0.5, luma: 0.5 },
  highlights: { r: 0.85, g: 0.85, b: 0.85, luma: 0.85 },
  skinToneRatio: 0,
};

/**
 * Extracts statistical color distribution and zone profiles from an RGBA buffer.
 */
export function extractColorStatsFromRgba(
  rgba: Uint8ClampedArray | number[] | Uint8Array,
  _width = 1,
  _height = 1,
): ColorStatistics {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) {
    return { ...DEFAULT_COLOR_STATISTICS };
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;

  // Zone sums
  let shadowCount = 0;
  let shadowR = 0;
  let shadowG = 0;
  let shadowB = 0;
  let shadowLuma = 0;

  let midCount = 0;
  let midR = 0;
  let midG = 0;
  let midB = 0;
  let midLuma = 0;

  let highCount = 0;
  let highR = 0;
  let highG = 0;
  let highB = 0;
  let highLuma = 0;

  let skinPixels = 0;

  // Sample up to 10,000 pixels for fast interactive calculation
  const step = Math.max(1, Math.floor(pixelCount / 10000));
  let samplesTaken = 0;

  for (let i = 0; i < pixelCount; i += step) {
    const idx = i * 4;
    const r = rgba[idx] / 255;
    const g = rgba[idx + 1] / 255;
    const b = rgba[idx + 2] / 255;

    // Rec. 709 luminance
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    sumR += r;
    sumG += g;
    sumB += b;
    sumLuma += luma;
    samplesTaken++;

    // Tonal zone classification
    if (luma < 0.33) {
      shadowCount++;
      shadowR += r;
      shadowG += g;
      shadowB += b;
      shadowLuma += luma;
    } else if (luma < 0.67) {
      midCount++;
      midR += r;
      midG += g;
      midB += b;
      midLuma += luma;
    } else {
      highCount++;
      highR += r;
      highG += g;
      highB += b;
      highLuma += luma;
    }

    // YCbCr skin tone vector detection: Cb in [-0.18, -0.02], Cr in [0.03, 0.22]
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;

    if (y >= 0.15 && y <= 0.9 && cb >= -0.18 && cb <= -0.02 && cr >= 0.03 && cr <= 0.22) {
      skinPixels++;
    }
  }

  const meanR = sumR / samplesTaken;
  const meanG = sumG / samplesTaken;
  const meanB = sumB / samplesTaken;
  const meanLuma = sumLuma / samplesTaken;

  // Second pass for standard deviation (contrast metric)
  let sqDiffR = 0;
  let sqDiffG = 0;
  let sqDiffB = 0;

  for (let i = 0; i < pixelCount; i += step) {
    const idx = i * 4;
    const r = rgba[idx] / 255;
    const g = rgba[idx + 1] / 255;
    const b = rgba[idx + 2] / 255;

    sqDiffR += (r - meanR) ** 2;
    sqDiffG += (g - meanG) ** 2;
    sqDiffB += (b - meanB) ** 2;
  }

  const stdR = Math.sqrt(sqDiffR / samplesTaken);
  const stdG = Math.sqrt(sqDiffG / samplesTaken);
  const stdB = Math.sqrt(sqDiffB / samplesTaken);

  return {
    meanR,
    meanG,
    meanB,
    stdR,
    stdG,
    stdB,
    meanLuma,
    shadows: {
      r: shadowCount > 0 ? shadowR / shadowCount : meanR * 0.3,
      g: shadowCount > 0 ? shadowG / shadowCount : meanG * 0.3,
      b: shadowCount > 0 ? shadowB / shadowCount : meanB * 0.3,
      luma: shadowCount > 0 ? shadowLuma / shadowCount : meanLuma * 0.3,
    },
    midtones: {
      r: midCount > 0 ? midR / midCount : meanR,
      g: midCount > 0 ? midG / midCount : meanG,
      b: midCount > 0 ? midB / midCount : meanB,
      luma: midCount > 0 ? midLuma / midCount : meanLuma,
    },
    highlights: {
      r: highCount > 0 ? highR / highCount : Math.min(1, meanR * 1.5),
      g: highCount > 0 ? highG / highCount : Math.min(1, meanG * 1.5),
      b: highCount > 0 ? highB / highCount : Math.min(1, meanB * 1.5),
      luma: highCount > 0 ? highLuma / highCount : Math.min(1, meanLuma * 1.5),
    },
    skinToneRatio: skinPixels / samplesTaken,
  };
}

/**
 * Synthesizes statistical distribution from existing ColorGradingSettings or aesthetic profiles
 * when raw pixels are not directly extracted.
 */
export function generateSyntheticStatsFromGrade(
  grade?: ColorGradingSettings,
  baseProfile: 'neutral' | 'warm' | 'cool' | 'dark' | 'bright' = 'neutral',
): ColorStatistics {
  const g = grade ?? DEFAULT_COLOR_GRADING;
  let baseR = 0.5;
  let baseG = 0.5;
  let baseB = 0.5;
  let baseLuma = 0.5;

  if (baseProfile === 'warm') {
    baseR = 0.58;
    baseB = 0.42;
  } else if (baseProfile === 'cool') {
    baseR = 0.42;
    baseB = 0.58;
  } else if (baseProfile === 'dark') {
    baseR = 0.3;
    baseG = 0.3;
    baseB = 0.3;
    baseLuma = 0.3;
  } else if (baseProfile === 'bright') {
    baseR = 0.7;
    baseG = 0.7;
    baseB = 0.7;
    baseLuma = 0.7;
  }

  // Adjust for temperature
  const tempShift = (g.temperature / 100) * 0.15;
  const tintShift = (g.tint / 100) * 0.1;
  const expFactor = 2 ** g.exposure;

  const r = Math.min(1, Math.max(0, (baseR + tempShift) * expFactor));
  const gVal = Math.min(1, Math.max(0, (baseG - tintShift) * expFactor));
  const b = Math.min(1, Math.max(0, (baseB - tempShift) * expFactor));
  const luma = Math.min(1, Math.max(0, (0.2126 * r + 0.7152 * gVal + 0.0722 * b) * expFactor));

  const contrast = g.contrast ?? 1.0;
  const std = 0.2 * contrast;

  return {
    meanR: r,
    meanG: gVal,
    meanB: b,
    stdR: std,
    stdG: std,
    stdB: std,
    meanLuma: luma,
    shadows: {
      r: Math.max(0, (r * 0.3 + g.lift.r * 0.3) * (g.lift.luma + 1)),
      g: Math.max(0, (gVal * 0.3 + g.lift.g * 0.3) * (g.lift.luma + 1)),
      b: Math.max(0, (b * 0.3 + g.lift.b * 0.3) * (g.lift.luma + 1)),
      luma: Math.max(0, luma * 0.3 * (g.lift.luma + 1)),
    },
    midtones: {
      r: Math.min(1, Math.max(0, r + g.gamma.r * 0.2)),
      g: Math.min(1, Math.max(0, gVal + g.gamma.g * 0.2)),
      b: Math.min(1, Math.max(0, b + g.gamma.b * 0.2)),
      luma: Math.min(1, Math.max(0, luma * (g.gamma.luma + 1))),
    },
    highlights: {
      r: Math.min(1, Math.max(0, (r * 1.6 + g.gain.r * 0.3) * (g.gain.luma + 1))),
      g: Math.min(1, Math.max(0, (gVal * 1.6 + g.gain.g * 0.3) * (g.gain.luma + 1))),
      b: Math.min(1, Math.max(0, (b * 1.6 + g.gain.b * 0.3) * (g.gain.luma + 1))),
      luma: Math.min(1, Math.max(0, luma * 1.6 * (g.gain.luma + 1))),
    },
    skinToneRatio: 0.12,
  };
}

/**
 * Linearly interpolates between two ColorGradingSettings by a factor (0.0 to 1.0).
 */
export function blendColorGrades(
  gradeA: ColorGradingSettings,
  gradeB: ColorGradingSettings,
  factor: number,
): ColorGradingSettings {
  const f = Math.min(1, Math.max(0, factor));
  const inv = 1 - f;

  const blendWheel = (wA: ColorWheelValue, wB: ColorWheelValue): ColorWheelValue => ({
    r: Number((wA.r * inv + wB.r * f).toFixed(3)),
    g: Number((wA.g * inv + wB.g * f).toFixed(3)),
    b: Number((wA.b * inv + wB.b * f).toFixed(3)),
    luma: Number((wA.luma * inv + wB.luma * f).toFixed(3)),
  });

  return {
    lift: blendWheel(gradeA.lift, gradeB.lift),
    gamma: blendWheel(gradeA.gamma, gradeB.gamma),
    gain: blendWheel(gradeA.gain, gradeB.gain),
    temperature: Number((gradeA.temperature * inv + gradeB.temperature * f).toFixed(1)),
    tint: Number((gradeA.tint * inv + gradeB.tint * f).toFixed(1)),
    exposure: Number((gradeA.exposure * inv + gradeB.exposure * f).toFixed(2)),
    contrast: Number((gradeA.contrast * inv + gradeB.contrast * f).toFixed(2)),
    saturation: Number((gradeA.saturation * inv + gradeB.saturation * f).toFixed(2)),
    vibrance: Number((gradeA.vibrance * inv + gradeB.vibrance * f).toFixed(1)),
  };
}

/**
 * Computes ColorGradingSettings that transform a target clip's color profile
 * to match a reference clip or hero frame.
 */
export function calculateColorMatchGrade(
  targetStats: ColorStatistics,
  referenceStats: ColorStatistics,
  options?: ColorMatchOptions,
): ColorGradingSettings {
  const mode = options?.matchMode ?? 'full';
  const strength = options?.strength ?? 1.0;
  const preserveSkinTones = options?.preserveSkinTones ?? true;

  // 1. Exposure matching (EV stop adjustment)
  let exposure = 0;
  if (mode === 'full' || mode === 'luma_only') {
    const lumaRatio = (referenceStats.meanLuma + 0.02) / (targetStats.meanLuma + 0.02);
    exposure = Math.min(2.5, Math.max(-2.5, Math.log2(lumaRatio)));
  }

  // 2. Contrast matching
  let contrast = 1.0;
  if (mode === 'full' || mode === 'luma_only') {
    const targetSpread = (targetStats.stdR + targetStats.stdG + targetStats.stdB) / 3;
    const refSpread = (referenceStats.stdR + referenceStats.stdG + referenceStats.stdB) / 3;
    const cRatio = refSpread / Math.max(0.04, targetSpread);
    contrast = Math.min(1.6, Math.max(0.6, Number(cRatio.toFixed(2))));
  }

  // 3. Temperature matching (Warm/Cool balance: R/B ratio)
  let temperature = 0;
  let tint = 0;
  if (mode === 'full' || mode === 'chroma_only') {
    const targetRB = (targetStats.meanR + 0.01) / (targetStats.meanB + 0.01);
    const refRB = (referenceStats.meanR + 0.01) / (referenceStats.meanB + 0.01);
    const deltaRB = refRB - targetRB;
    temperature = Math.min(80, Math.max(-80, deltaRB * 60));

    // Tint matching (Green deviation relative to (R+B)/2)
    const targetGDeviation = targetStats.meanG - (targetStats.meanR + targetStats.meanB) / 2;
    const refGDeviation = referenceStats.meanG - (referenceStats.meanR + referenceStats.meanB) / 2;
    const deltaG = refGDeviation - targetGDeviation;
    // Positive deltaG means reference has more green -> negative tint (tint slider: -100 green to +100 magenta)
    tint = Math.min(60, Math.max(-60, -deltaG * 80));

    // Skin tone protection damping
    if (preserveSkinTones && targetStats.skinToneRatio > 0.05) {
      const damp = Math.max(0.4, 1 - targetStats.skinToneRatio * 0.7);
      temperature *= damp;
      tint *= damp;
    }
  }

  // 4. 3-Way Lift, Gamma, Gain derivation
  let lift: ColorWheelValue = { r: 0, g: 0, b: 0, luma: 0 };
  let gamma: ColorWheelValue = { r: 0, g: 0, b: 0, luma: 0 };
  let gain: ColorWheelValue = { r: 0, g: 0, b: 0, luma: 0 };

  const clampWheel = (val: number): number => Math.min(0.6, Math.max(-0.6, val));

  if (mode === 'full' || mode === 'chroma_only') {
    // Lift (shadows color bias)
    lift.r = clampWheel((referenceStats.shadows.r - targetStats.shadows.r) * 1.5);
    lift.g = clampWheel((referenceStats.shadows.g - targetStats.shadows.g) * 1.5);
    lift.b = clampWheel((referenceStats.shadows.b - targetStats.shadows.b) * 1.5);

    // Gain (highlights color bias)
    gain.r = clampWheel((referenceStats.highlights.r - targetStats.highlights.r) * 1.2);
    gain.g = clampWheel((referenceStats.highlights.g - targetStats.highlights.g) * 1.2);
    gain.b = clampWheel((referenceStats.highlights.b - targetStats.highlights.b) * 1.2);

    // Gamma (midtones color bias)
    gamma.r = clampWheel((referenceStats.midtones.r - targetStats.midtones.r) * 1.3);
    gamma.g = clampWheel((referenceStats.midtones.g - targetStats.midtones.g) * 1.3);
    gamma.b = clampWheel((referenceStats.midtones.b - targetStats.midtones.b) * 1.3);
  }

  if (mode === 'full' || mode === 'luma_only') {
    lift.luma = clampWheel((referenceStats.shadows.luma - targetStats.shadows.luma) * 1.2);
    gamma.luma = clampWheel((referenceStats.midtones.luma - targetStats.midtones.luma) * 1.0);
    gain.luma = clampWheel((referenceStats.highlights.luma - targetStats.highlights.luma) * 1.2);
  }

  // 5. Saturation matching
  let saturation = 1.0;
  if (mode === 'full' || mode === 'chroma_only') {
    const targetChromaSpread = Math.hypot(
      targetStats.meanR - targetStats.meanG,
      targetStats.meanG - targetStats.meanB,
    );
    const refChromaSpread = Math.hypot(
      referenceStats.meanR - referenceStats.meanG,
      referenceStats.meanG - referenceStats.meanB,
    );
    const satRatio = (refChromaSpread + 0.02) / (targetChromaSpread + 0.02);
    saturation = Math.min(1.6, Math.max(0.6, Number(satRatio.toFixed(2))));
  }

  const rawMatchedGrade: ColorGradingSettings = {
    lift,
    gamma,
    gain,
    temperature: Number(temperature.toFixed(1)),
    tint: Number(tint.toFixed(1)),
    exposure: Number(exposure.toFixed(2)),
    contrast,
    saturation,
    vibrance: 0,
  };

  if (strength >= 0.999) {
    return rawMatchedGrade;
  }

  return blendColorGrades(DEFAULT_COLOR_GRADING, rawMatchedGrade, strength);
}
