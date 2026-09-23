/**
 * Step S31 — Real-time Video Scopes Mathematics & Colorimetry Operations
 *
 * Professional broadcast scopes calculation:
 * - Rec.709 Luma Waveform (0 to 100 IRE)
 * - RGB Parade (Red, Green, Blue channels side-by-side)
 * - Vectorscope (UV color difference space with 75% SMPTE targets & skin-tone line)
 * - RGB & Luma 256-bin Histograms
 */

/**
 * Calculates standard HDTV Rec.709 relative luminance (0.0 to 255.0).
 * Y = 0.2126*R + 0.7152*G + 0.0722*B
 */
export function calculateLumaRec709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Converts standard 8-bit RGB into normalized UV color difference space (-1.0 to +1.0)
 * calibrated for standard broadcast vectorscope alignment.
 * U = -0.14713*R - 0.28886*G + 0.436*B
 * V =  0.615*R   - 0.51499*G - 0.10001*B
 */
export function rgbToUvVectorscope(
  r: number,
  g: number,
  b: number,
): { u: number; v: number } {
  // Normalize RGB to 0..1
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const u = -0.14713 * rn - 0.28886 * gn + 0.436 * bn;
  const v = 0.615 * rn - 0.51499 * gn - 0.10001 * bn;

  // Scale by 2.2 to place 75% SMPTE color bars nicely on the graticule circle
  return {
    u: Math.min(1, Math.max(-1, u * 2.2)),
    v: Math.min(1, Math.max(-1, v * 2.2)),
  };
}

/**
 * Standard 75% SMPTE color targets on the vectorscope.
 * U, V normalized coordinates (-1 to 1) relative to center (0, 0).
 */
export interface ScopeTarget {
  name: string;
  u: number;
  v: number;
  color: string;
}

export const VECTORSCOPE_SMPTE_TARGETS: ScopeTarget[] = [
  { name: 'R', ...rgbToUvVectorscope(191, 0, 0), color: '#ef4444' },     // Red 75%
  { name: 'Mg', ...rgbToUvVectorscope(191, 0, 191), color: '#ec4899' },  // Magenta 75%
  { name: 'B', ...rgbToUvVectorscope(0, 0, 191), color: '#3b82f6' },     // Blue 75%
  { name: 'Cy', ...rgbToUvVectorscope(0, 191, 191), color: '#06b6d4' },  // Cyan 75%
  { name: 'G', ...rgbToUvVectorscope(0, 191, 0), color: '#22c55e' },     // Green 75%
  { name: 'Yl', ...rgbToUvVectorscope(191, 191, 0), color: '#eab308' },  // Yellow 75%
];

/**
 * Angle of the universal "I-Line" / Skin-tone line on a vectorscope in radians.
 * Traditional vectorscope skin line lies at approximately 123° (second quadrant / upper left).
 */
export const SKIN_TONE_LINE_ANGLE_RAD = (123 * Math.PI) / 180;

/**
 * Computes a 2D density grid for Luma Waveform.
 * Columns correspond to horizontal image position (x).
 * Rows correspond to IRE level (0 at bottom, 100 at top).
 *
 * @returns A 1D Float32Array of length `outputWidth * numBins` representing trace density (0.0 to 1.0).
 */
export function computeLumaWaveform(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  outputWidth: number = 256,
  numBins: number = 100,
): Float32Array {
  const grid = new Float32Array(outputWidth * numBins);
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return grid;
  }

  const xRatio = outputWidth / width;
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
      const outX = Math.min(outputWidth - 1, Math.floor(x * xRatio));
      // Invert Y so 0 IRE is bottom and 100 IRE is top
      const binY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(luma * binRatio)));

      const cellIdx = binY * outputWidth + outX;
      grid[cellIdx] += 1;
      if (grid[cellIdx] > maxDensity) {
        maxDensity = grid[cellIdx];
      }
    }
  }

  // Normalize densities to 0..1
  if (maxDensity > 0) {
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.min(1.0, grid[i] / (maxDensity * 0.4)); // slight boost for visibility
    }
  }

  return grid;
}

export interface RgbParadeData {
  rGrid: Float32Array;
  gGrid: Float32Array;
  bGrid: Float32Array;
  channelWidth: number;
  numBins: number;
}

/**
 * Computes 3 separate channel grids (Red, Green, Blue) for RGB Parade display.
 */
export function computeRgbParade(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  channelWidth: number = 100,
  numBins: number = 100,
): RgbParadeData {
  const rGrid = new Float32Array(channelWidth * numBins);
  const gGrid = new Float32Array(channelWidth * numBins);
  const bGrid = new Float32Array(channelWidth * numBins);

  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return { rGrid, gGrid, bGrid, channelWidth, numBins };
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

      const outX = Math.min(channelWidth - 1, Math.floor(x * xRatio));

      const rBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(r * binRatio)));
      const gBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(g * binRatio)));
      const bBinY = numBins - 1 - Math.min(numBins - 1, Math.max(0, Math.round(b * binRatio)));

      const rIdx = rBinY * channelWidth + outX;
      const gIdx = gBinY * channelWidth + outX;
      const bIdx = bBinY * channelWidth + outX;

      rGrid[rIdx] += 1;
      gGrid[gIdx] += 1;
      bGrid[bIdx] += 1;

      const curMax = Math.max(rGrid[rIdx], gGrid[gIdx], bGrid[bIdx]);
      if (curMax > maxDensity) {
        maxDensity = curMax;
      }
    }
  }

  if (maxDensity > 0) {
    const normFactor = maxDensity * 0.4;
    for (let i = 0; i < rGrid.length; i++) {
      rGrid[i] = Math.min(1.0, rGrid[i] / normFactor);
      gGrid[i] = Math.min(1.0, gGrid[i] / normFactor);
      bGrid[i] = Math.min(1.0, bGrid[i] / normFactor);
    }
  }

  return { rGrid, gGrid, bGrid, channelWidth, numBins };
}

/**
 * Computes an interleaved [u, v] Float32Array of vectorscope points.
 * Every point is normalized to [-1.0, 1.0].
 */
export function computeVectorscopePoints(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  sampleStride: number = 2,
): Float32Array {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return new Float32Array(0);
  }

  const numSampleX = Math.ceil(width / sampleStride);
  const numSampleY = Math.ceil(height / sampleStride);
  const points = new Float32Array(numSampleX * numSampleY * 2);

  let pointIdx = 0;
  for (let y = 0; y < height; y += sampleStride) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += sampleStride) {
      const idx = rowOffset + x * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      const { u, v } = rgbToUvVectorscope(r, g, b);
      points[pointIdx++] = u;
      points[pointIdx++] = v;
    }
  }

  return points.subarray(0, pointIdx);
}

export interface HistogramBins {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  maxCount: number;
}

/**
 * Computes 256-bin density distributions for R, G, B, and Luma.
 */
export function computeHistogramBins(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): HistogramBins {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);

  let maxCount = 0;
  const numPixels = width * height;

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const rVal = pixels[idx];
    const gVal = pixels[idx + 1];
    const bVal = pixels[idx + 2];

    const lVal = Math.min(255, Math.floor(calculateLumaRec709(rVal, gVal, bVal)));

    r[rVal]++;
    g[gVal]++;
    b[bVal]++;
    luma[lVal]++;

    const cur = Math.max(r[rVal], g[gVal], b[bVal], luma[lVal]);
    if (cur > maxCount) {
      maxCount = cur;
    }
  }

  return { r, g, b, luma, maxCount };
}
