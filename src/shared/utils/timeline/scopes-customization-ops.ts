import { calculateLumaRec709, rgbToUvVectorscope, type ScopeTarget } from './video-scopes-ops';

/**
 * Milestone S181: Video Scopes Customization, Display Modes & Performance Throttling Operations.
 * Provides custom RGB/YRGB/Stacked Parade layouts, 75%/100% SMPTE vectorscope targets,
 * adjustable skin-tone line angle, and broadcast gamut outlier highlighting.
 */

export type ParadeDisplayMode = 'rgb' | 'yrgb' | 'stacked';
export type VectorscopeTargetMode = '75pct' | '100pct';
export type ScopeRefreshRate = 15 | 30 | 60;

/**
 * Standard 100% SMPTE color targets on the vectorscope.
 */
export const VECTORSCOPE_SMPTE_100_TARGETS: ScopeTarget[] = [
  { name: 'R', ...rgbToUvVectorscope(255, 0, 0), color: '#ef4444' },     // Red 100%
  { name: 'Mg', ...rgbToUvVectorscope(255, 0, 255), color: '#ec4899' },  // Magenta 100%
  { name: 'B', ...rgbToUvVectorscope(0, 0, 255), color: '#3b82f6' },     // Blue 100%
  { name: 'Cy', ...rgbToUvVectorscope(0, 255, 255), color: '#06b6d4' },  // Cyan 100%
  { name: 'G', ...rgbToUvVectorscope(0, 255, 0), color: '#22c55e' },     // Green 100%
  { name: 'Yl', ...rgbToUvVectorscope(255, 255, 0), color: '#eab308' },  // Yellow 100%
];

/**
 * Retrieve vectorscope targets for 75% or 100% SMPTE color bars.
 */
export function getVectorscopeTargets(
  mode: VectorscopeTargetMode,
  targets75: ScopeTarget[],
): ScopeTarget[] {
  return mode === '100pct' ? VECTORSCOPE_SMPTE_100_TARGETS : targets75;
}

/**
 * Compute the skin-tone line angle in degrees and radians, supporting user micro-adjustments.
 * Standard calibration is 123° (upper-left quadrant).
 */
export function calculateSkinToneLineAngle(
  baseDegrees = 123,
  offsetDegrees = 0,
): { degrees: number; radians: number } {
  const degrees = Math.max(100, Math.min(145, baseDegrees + offsetDegrees));
  const radians = (degrees * Math.PI) / 180;
  return { degrees, radians };
}

/**
 * Calculate sampling interval in milliseconds for adaptive scope rendering.
 */
export function calculateScopeSampleInterval(fps: ScopeRefreshRate): number {
  switch (fps) {
    case 15:
      return 66.67;
    case 30:
      return 33.33;
    case 60:
    default:
      return 16.67;
  }
}

export interface YrgbParadeData {
  yGrid: Float32Array;
  rGrid: Float32Array;
  gGrid: Float32Array;
  bGrid: Float32Array;
  channelWidth: number;
  numBins: number;
}

/**
 * Computes 4 separate channel grids (Luma, Red, Green, Blue) for YRGB Parade display.
 */
export function computeYrgbParade(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  channelWidth = 80,
  numBins = 100,
): YrgbParadeData {
  const yGrid = new Float32Array(channelWidth * numBins);
  const rGrid = new Float32Array(channelWidth * numBins);
  const gGrid = new Float32Array(channelWidth * numBins);
  const bGrid = new Float32Array(channelWidth * numBins);

  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return { yGrid, rGrid, gGrid, bGrid, channelWidth, numBins };
  }

  const xRatio = channelWidth / width;
  const binRatio = (numBins - 1) / 255;

  let maxDensity = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const luma = calculateLumaRec709(r, g, b);

      const outX = Math.min(channelWidth - 1, Math.floor(x * xRatio));

      const yBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(luma * binRatio)));
      const rBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(r * binRatio)));
      const gBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(g * binRatio)));
      const bBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(b * binRatio)));

      const yIdx = yBinY * channelWidth + outX;
      const rIdx = rBinY * channelWidth + outX;
      const gIdx = gBinY * channelWidth + outX;
      const bIdx = bBinY * channelWidth + outX;

      yGrid[yIdx] += 1;
      rGrid[rIdx] += 1;
      gGrid[gIdx] += 1;
      bGrid[bIdx] += 1;

      const curMax = Math.max(yGrid[yIdx], rGrid[rIdx], gGrid[gIdx], bGrid[bIdx]);
      if (curMax > maxDensity) {
        maxDensity = curMax;
      }
    }
  }

  if (maxDensity > 0) {
    const normFactor = maxDensity * 0.4;
    for (let i = 0; i < yGrid.length; i++) {
      yGrid[i] = Math.min(1.0, yGrid[i] / normFactor);
      rGrid[i] = Math.min(1.0, rGrid[i] / normFactor);
      gGrid[i] = Math.min(1.0, gGrid[i] / normFactor);
      bGrid[i] = Math.min(1.0, bGrid[i] / normFactor);
    }
  }

  return { yGrid, rGrid, gGrid, bGrid, channelWidth, numBins };
}

export interface OutlierCoordinates {
  x: number;
  y: number;
  type: 'crushed' | 'clipped';
  luma: number;
}

export interface OutlierHighlightResult {
  clippedCount: number;
  crushedCount: number;
  clippedPercent: number;
  crushedPercent: number;
  outliers: OutlierCoordinates[];
}

/**
 * Detect pixels falling outside standard broadcast legal range (16 to 235 Luma)
 * for false-color alert highlighting in scope monitors.
 */
export function detectOutlierPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxSamplePoints = 120,
): OutlierHighlightResult {
  const total = width * height;
  if (total <= 0 || pixels.length < total * 4) {
    return {
      clippedCount: 0,
      crushedCount: 0,
      clippedPercent: 0,
      crushedPercent: 0,
      outliers: [],
    };
  }

  let clippedCount = 0;
  let crushedCount = 0;
  const outliers: OutlierCoordinates[] = [];

  const step = Math.max(1, Math.floor(total / 800));

  for (let i = 0; i < total; i += step) {
    const idx = i * 4;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    const luma = calculateLumaRec709(r, g, b);

    const x = i % width;
    const y = Math.floor(i / width);

    if (luma >= 235) {
      clippedCount++;
      if (outliers.length < maxSamplePoints) {
        outliers.push({ x, y, type: 'clipped', luma });
      }
    } else if (luma <= 16) {
      crushedCount++;
      if (outliers.length < maxSamplePoints) {
        outliers.push({ x, y, type: 'crushed', luma });
      }
    }
  }

  const sampledTotal = Math.ceil(total / step);
  const clippedPercent = Number(((clippedCount / sampledTotal) * 100).toFixed(2));
  const crushedPercent = Number(((crushedCount / sampledTotal) * 100).toFixed(2));

  return {
    clippedCount,
    crushedCount,
    clippedPercent,
    crushedPercent,
    outliers,
  };
}
